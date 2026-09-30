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
import { chooseTrace, pickSmallerPath } from "@/lib/vectorize/chooseTrace";
import { decodeBufferToImageData } from "@/lib/image/decode";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toDXF } from "@/lib/export/dxf";
import type {
  ConversionMetrics,
  ConversionResult,
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  VectorLayer,
} from "@/types/vector";

type WorkerInMessage =
  | { type: "convert"; payload: ConvertJobRequest }
  | { type: "export"; payload: { id: string; format: "eps" | "dxf"; result: Omit<ConversionResult, "svg"> } };
type WorkerOutMessage =
  | { type: "progress"; payload: ConvertJobProgress }
  | { type: "result"; payload: ConvertJobResult }
  | { type: "exported"; payload: { id: string; format: "eps" | "dxf"; content: string } }
  | { type: "exportError"; payload: { id: string; format: "eps" | "dxf"; error: string } }
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
  if (message.type === "export") {
    void (async () => {
      try {
        const { id, format, result } = message.payload;
        const content = format === "eps"
          ? toEPSLevel2(result as Omit<ConversionResult, "svg" | "eps" | "dxf">)
          : toDXF(result as Omit<ConversionResult, "svg" | "eps" | "dxf">);
        postMessageTyped({
          type: "exported",
          payload: { id, format, content },
        });
      } catch (error) {
        postMessageTyped({
          type: "exportError",
          payload: {
            id: message.payload.id,
            format: message.payload.format,
            error: error instanceof Error ? error.message : "Export failed",
          },
        });
      }
    })();
    return;
  }
  if (message.type !== "convert") {
    return;
  }

  void (async () => {
    const { payload } = message;
    const startedAt = performance.now();

    try {
      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Decoding image", progress: 5 },
      });

      // Decode off the main thread: fast-png, JS box downscale, preprocess.
      // An 8000x8000 PNG allocates hundreds of MB here; on the main thread
      // that froze the tab for seconds. This is now the longest phase, so it
      // gets a larger share of the progress bar.
      const decoded = await decodeBufferToImageData(payload.buffer);

      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Loading VTracer", progress: 15 },
      });

      const vtracer = await loadVTracer();

      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Preparing trace", progress: 25 },
      });

      const options = toVTracerOptions(payload.settings);

      postMessageTyped({
        type: "progress",
        payload: { id: payload.id, phase: "Tracing image", progress: 40 },
      });

      const pixels = new Uint8Array(
        decoded.pixels.buffer,
        decoded.pixels.byteOffset,
        decoded.pixels.byteLength,
      );
      const originalPixels = new Uint8ClampedArray(
        decoded.originalPixels.buffer,
        decoded.originalPixels.byteOffset,
        decoded.originalPixels.byteLength,
      );
      const optionsJson = JSON.stringify(options);
      let traced: VTracerTraceOutput;
      let isBinaryPath = false;
      const routing = chooseTrace(decoded.paletteTier, options.clusteringMode);
      const tier = decoded.paletteTier;
      if (
        tier != null &&
        routing.paths.includes("binary") &&
        routing.paths.includes("color")
      ) {
        // Flat artwork: trace both paths and ship the smaller SVG.
        // Both are pixel-exact, so this can never make a file bigger.
        // (Claude feedback: color is typically 3-5x smaller, binary wins on dither)
        const binaryMerged = traceBinaryLayers(
          (w, h, px, opts) => vtracer.trace_rgba_to_json(w, h, px, opts),
          decoded.width,
          decoded.height,
          decoded.pixels,
          tier,
          optionsJson,
          originalPixels,
          decoded.sourceWidth,
          decoded.sourceHeight,
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
                decoded.width,
                decoded.height,
                pixels,
                new Uint8Array(
                  originalPixels.buffer,
                  originalPixels.byteOffset,
                  originalPixels.byteLength,
                ),
                optionsJson,
              )
            : vtracer.trace_rgba_to_json(
                decoded.width,
                decoded.height,
                pixels,
                optionsJson,
              );
        const colorTraced = JSON.parse(colorRaw) as VTracerTraceOutput;

        // Ship the better result: prefer exact over non-exact, then smaller.
        // In Polygon mode the color path can be simplified while the binary
        // path stays exact, so "smaller wins" alone ships worse files.
        const shippedPath = pickSmallerPath(
          {
            svgLength: binaryTraced.svg.length,
            pixelExact: binaryTraced.metrics.pixelExact ?? "unknown",
          },
          {
            svgLength: colorTraced.svg.length,
            pixelExact: colorTraced.metrics.pixelExact ?? "unknown",
          },
        );
        if (shippedPath === "binary") {
          traced = binaryTraced;
          isBinaryPath = true;
        } else {
          traced = colorTraced;
          isBinaryPath = false;
        }
      } else {
        // Color path: give the tracer the pre-prep original pixels so it
        // can re-pick each cluster's fill from the original colors at its
        // member pixels (recovering preprocessing color damage). Falls back
        // to the plain export if the WASM predates the recolor export.
        const recolorTrace = vtracer.trace_rgba_to_json_with_originals;
        const raw =
          recolorTrace != null
            ? recolorTrace(
                decoded.width,
                decoded.height,
                pixels,
                new Uint8Array(
                  originalPixels.buffer,
                  originalPixels.byteOffset,
                  originalPixels.byteLength,
                ),
                optionsJson,
              )
            : vtracer.trace_rgba_to_json(
                decoded.width,
                decoded.height,
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
        // B/W mode is never pixel-exact by design (binary thresholding loses
        // color info). Override whatever the tracer reported.
        ...(options.clusteringMode === "binary"
          ? { pixelExact: "bw" as const }
          : {}),
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
                  decoded.sourceWidth,
                  decoded.sourceHeight,
                ),
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
