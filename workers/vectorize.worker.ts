/// <reference lib="webworker" />

import { toDXF } from "@/lib/export/dxf";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import { traceBinaryLayers } from "@/lib/vectorize/binaryLayers";
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
  trace_rgba_to_json_with_originals?: (
    width: number,
    height: number,
    pixels: Uint8Array,
    originalPixels: Uint8Array,
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
      const originalPixels = new Uint8ClampedArray(
        payload.originalPixels.buffer,
        payload.originalPixels.byteOffset,
        payload.originalPixels.byteLength,
      );
      const optionsJson = JSON.stringify(options);
      let traced: VTracerTraceOutput;
      if (payload.paletteTier != null && options.clusteringMode === "color") {
        // Flat artwork: trace each palette color as a nested binary mask
        // and stack the masks background-first. Exact per-color walks beat
        // the color-mode tracer's fragmented clusters on these images.
        const merged = traceBinaryLayers(
          (w, h, px, opts) => vtracer.trace_rgba_to_json(w, h, px, opts),
          payload.width,
          payload.height,
          payload.pixels,
          payload.paletteTier,
          optionsJson,
          originalPixels,
        );
        traced = {
          width: merged.width,
          height: merged.height,
          layers: merged.layers,
          svg: merged.svg,
          metrics: merged.metrics,
        };
      } else {
        // Color path: give the tracer the pre-prep original pixels so it
        // can re-pick each cluster's fill from the original colors at its
        // member pixels (recovering preprocessing color damage). Falls back
        // to the plain export if the WASM predates the recolor export.
        const recolorTrace = vtracer.trace_rgba_to_json_with_originals;
        const raw =
          recolorTrace != null
            ? recolorTrace(
                payload.width,
                payload.height,
                pixels,
                new Uint8Array(
                  originalPixels.buffer,
                  originalPixels.byteOffset,
                  originalPixels.byteLength,
                ),
                optionsJson,
              )
            : vtracer.trace_rgba_to_json(
                payload.width,
                payload.height,
                pixels,
                optionsJson,
              );
        traced = JSON.parse(raw) as VTracerTraceOutput;
      }

      if (traced.layers.length === 0) {
        throw new Error(
          "Nothing to trace: the image looks blank or fully transparent. Try an image with visible artwork.",
        );
      }

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
