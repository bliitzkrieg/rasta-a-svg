/// <reference lib="webworker" />

import { toDXF } from "@/lib/export/dxf";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import type {
  ConversionMetrics,
  ConversionResult,
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  VectorLayer,
} from "@/types/vector";

type WorkerInMessage = { type: "convert"; payload: ConvertJobRequest };
type WorkerOutMessage =
  | { type: "progress"; payload: ConvertJobProgress }
  | { type: "result"; payload: ConvertJobResult }
  | { type: "error"; payload: ConvertJobError };

type VTracerModule = {
  default: (input?: RequestInfo | URL | Response) => Promise<unknown>;
  trace_rgba_to_json: (
    width: number,
    height: number,
    pixels: Uint8Array,
    optionsJson: string,
  ) => string;
};

type VTracerTraceOutput = {
  width: number;
  height: number;
  layers: VectorLayer[];
  svg: string;
  metrics: Omit<ConversionMetrics, "elapsedMs">;
};

let vtracerPromise: Promise<VTracerModule> | null = null;
const importRuntimeModule = new Function(
  "url",
  "return import(url);",
) as (url: string) => Promise<VTracerModule>;

function postMessageTyped(message: WorkerOutMessage): void {
  self.postMessage(message);
}

async function loadVTracer(): Promise<VTracerModule> {
  if (!vtracerPromise) {
    vtracerPromise = (async () => {
      try {
        const scriptUrl = "/vendor/vtracer/vtracer_wasm.js";
        const wasmUrl = new URL(
          "/vendor/vtracer/vtracer_wasm_bg.wasm",
          self.location.origin,
        );
        const mod = await importRuntimeModule(scriptUrl);
        await mod.default(wasmUrl);
        return mod;
      } catch (error) {
        const suffix =
          error instanceof Error ? ` ${error.message}` : "";
        throw new Error(
          `Failed to load VTracer assets. Rebuild them with npm run build:vtracer-wasm.${suffix}`,
        );
      }
    })();
  }

  return vtracerPromise;
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  if (message.type !== "convert") {
    return;
  }

  void (async () => {
    const { payload } = message;
    const startedAt = performance.now();

    try {
      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Loading VTracer", progress: 8 },
      });

      const vtracer = await loadVTracer();

      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Preparing trace", progress: 18 },
      });

      const options = toVTracerOptions(payload.settings);

      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Tracing image", progress: 35 },
      });

      const pixels = new Uint8Array(
        payload.pixels.buffer,
        payload.pixels.byteOffset,
        payload.pixels.byteLength,
      );
      const raw = vtracer.trace_rgba_to_json(
        payload.width,
        payload.height,
        pixels,
        JSON.stringify(options),
      );
      const traced = JSON.parse(raw) as VTracerTraceOutput;

      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Exporting vectors", progress: 92 },
      });

      const metrics: ConversionMetrics = {
        ...traced.metrics,
        elapsedMs: Math.round(performance.now() - startedAt),
      };
      const baseResult: Omit<ConversionResult, "svg" | "eps" | "dxf"> = {
        width: traced.width,
        height: traced.height,
        layers: traced.layers,
        metrics,
      };

      const eps = toEPSLevel2(baseResult);
      const dxf = toDXF(baseResult);

      postMessageTyped({
        type: "result",
        payload: {
          id: payload.id,
          result: {
            ...baseResult,
            svg: traced.svg,
            eps,
            dxf,
          },
        },
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Conversion failed";

      postMessageTyped({
        type: "error",
        payload: {
          id: payload.id,
          error: messageText,
        },
      });
    }
  })();
};

export {};
