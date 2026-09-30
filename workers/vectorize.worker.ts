/// <reference lib="webworker" />

// Apply source display size to SVG header (for color path which doesn't
// go through traceBinaryLayers). Replaces width/height with source dimensions
// while preserving the viewBox at traced dimensions.
function applySourceDisplaySize(
  svg: string,
  sourceWidth?: number,
  sourceHeight?: number,
): string {
  if (sourceWidth == null || sourceHeight == null) {
    return svg;
  }
  return svg.replace(
    /(<svg[^>]*?)width="(\d+)" height="(\d+)"/,
    `$1width="${sourceWidth}" height="${sourceHeight}"`,
  );
}

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
      let isBinaryPath = false;
      if (payload.paletteTier != null && options.clusteringMode === "color") {
        // Flat artwork: trace both paths and ship the smaller SVG.
        // Both are pixel-exact, so this can never make a file bigger.
        // (Claude feedback: color is typically 3-5x smaller, binary wins on dither)
        const binaryMerged = traceBinaryLayers(
          (w, h, px, opts) => vtracer.trace_rgba_to_json(w, h, px, opts),
          payload.width,
          payload.height,
          payload.pixels,
          payload.paletteTier,
          optionsJson,
          originalPixels,
          payload.sourceWidth,
          payload.sourceHeight,
        );
        const binaryTraced: VTracerTraceOutput = {
          width: binaryMerged.width,
          height: binaryMerged.height,
          layers: binaryMerged.layers,
          svg: binaryMerged.svg,
          metrics: binaryMerged.metrics,
        };

        // Trace the color path as well for comparison
        const recolorTrace = vtracer.trace_rgba_to_json_with_originals;
        const colorRaw =
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
        const colorTraced = JSON.parse(colorRaw) as VTracerTraceOutput;

        // Ship whichever SVG is smaller (both are exact)
        if (binaryTraced.svg.length <= colorTraced.svg.length) {
          traced = binaryTraced;
          isBinaryPath = true;
        } else {
          traced = colorTraced;
          isBinaryPath = false;
        }
      } else {
        // Color path for photos (no palette tier): use the plain tracer without
        // originals. The residual layer would make a pixel-perfect photo ~93MB
        // of SVG, which isn't useful to anyone. The color tracer alone is
        // already very accurate for photos.
        // For flat artwork with a tier, we trace both paths above and pick smaller.
        const raw = vtracer.trace_rgba_to_json(
          payload.width,
          payload.height,
          pixels,
          optionsJson,
        );
        traced = JSON.parse(raw) as VTracerTraceOutput;
      }

      if (traced.layers.length === 0 && traced.metrics.pathCount === 0) {
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

      postMessageTyped({
        type: "result",
        payload: {
          id: payload.id,
          result: {
            ...baseResult,
            svg: isBinaryPath
              ? traced.svg
              : applySourceDisplaySize(
                  traced.svg,
                  payload.sourceWidth,
                  payload.sourceHeight,
                ),
            // EPS and DXF are generated on demand when the user clicks download,
            // not upfront, to avoid the memory cost for users who only want SVG.
            eps: "",
            dxf: "",
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
