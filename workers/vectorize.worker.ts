/// <reference lib="webworker" />

import { toDXF } from "@/lib/export/dxf";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toSVG } from "@/lib/export/svg";
import { maskToPolygons } from "@/lib/vectorize/layers";
import { computeMetrics } from "@/lib/vectorize/metrics";
import { quantizeImage } from "@/lib/vectorize/quantize";
import { simplifyPath } from "@/lib/vectorize/simplify";
import { labelsToMask, removeSmallComponents } from "@/lib/vectorize/trace";
import {
  closeThenFeatherDarkMask,
  expandPolygonRadially,
  hasJoinDamage,
  hexLuminance,
  isBackgroundFlood,
  isClockwise,
  isTinyDarkFragment,
  layerArea,
  normalizePoints,
  polygonArea,
  postProcessContour,
  simplifyToleranceForPreset,
  softenOrthogonalStairs,
} from "@/lib/vectorize/workerHelpers";
import type {
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

function postMessageTyped(message: WorkerOutMessage): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  if (message.type !== "convert") {
    return;
  }

  const { payload } = message;
  const startedAt = performance.now();

  try {
    postMessageTyped({
      type: "progress",
      payload: { id: payload.id, phase: "Quantizing colors", progress: 10 },
    });

    const quantized = quantizeImage(
      payload.pixels,
      payload.width,
      payload.height,
      payload.settings.paletteSize,
      payload.settings.paletteMode === "auto",
    );

    const simplifyTolerance = simplifyToleranceForPreset(
      payload.settings.simplifyTolerancePx,
      payload.settings.optimizePreset,
    );

    const {
      speckleThresholdPx,
      smoothing,
      cornerThresholdDeg,
    } = payload.settings;

    const minLayerCoveragePct = 0.0005;
    const minLayerCount = 6;
    const maxLayerCount = 12;
    const totalPixels = payload.width * payload.height;
    const total = quantized.palette.length;

    type LayerCandidate = VectorLayer & {
      coverage: number;
    };

    const layerCandidates: LayerCandidate[] = [];

    for (let index = 0; index < total; index += 1) {
      postMessageTyped({
        type: "progress",
        payload: {
          id: payload.id,
          phase: `Tracing layer ${index + 1}/${total}`,
          progress: 20 + Math.round(((index + 1) / total) * 60),
        },
      });

      const color = quantized.palette[index];
      const coverage = quantized.counts[index] / totalPixels;
      const lum = hexLuminance(color);
      const coverageThreshold = lum > 170 || lum < 40 ? 0.0001 : 0.002;

      if (coverage < coverageThreshold) {
        continue;
      }

      const isDarkLayer = lum < 55;
      const isLightLayer = lum > 240;
      const layerSpeckle = isDarkLayer || isLightLayer ? 1 : speckleThresholdPx;

      const layerTolerance = isDarkLayer
        ? Math.max(0.28, simplifyTolerance * 0.4)
        : isLightLayer
          ? Math.max(0.35, simplifyTolerance * 0.45)
          : simplifyTolerance;

      const baseLayerSmoothing = isDarkLayer
        ? Math.max(smoothing * 0.55, smoothing > 0 ? 0.1 : 0)
        : isLightLayer
          ? Math.max(smoothing * 0.35, smoothing > 0 ? 0.08 : 0)
          : smoothing;

      const layerSmoothing = Math.min(0.28, baseLayerSmoothing * 1.25);

      const minPolyArea = isDarkLayer ? 3 : isLightLayer ? 1 : 8;

      const rawMask = labelsToMask(
        quantized.labels,
        payload.width,
        payload.height,
        index,
      );

      if (
        isBackgroundFlood(rawMask, payload.width, payload.height) &&
        lum < 220
      ) {
        continue;
      }

      let mask = removeSmallComponents(
        rawMask,
        payload.width,
        payload.height,
        layerSpeckle,
      );

      if (isDarkLayer) {
        mask = closeThenFeatherDarkMask(mask, payload.width, payload.height);
      }

      const polygons = maskToPolygons(mask, payload.width, payload.height);

      const pathsWithArea = polygons
        .map((poly) => {
          const rawRounded = normalizePoints(
            poly,
            payload.width,
            payload.height,
          );
          const rawArea = polygonArea(rawRounded);
          const rawClockwise = isClockwise(rawRounded);
          const isOutlineLike = isDarkLayer && rawArea < 5000;

          let adaptiveTol = layerTolerance;
          if (rawArea < 80) {
            adaptiveTol = Math.min(layerTolerance, 0.1);
          } else if (rawArea < 250) {
            adaptiveTol = Math.min(layerTolerance, 0.18);
          } else if (rawArea < 800) {
            adaptiveTol = Math.min(layerTolerance, 0.3);
          } else if (rawArea < 2500) {
            adaptiveTol = Math.min(layerTolerance, 0.55);
          }

          if (isOutlineLike) {
            const outlineTolerance =
              rawArea < 120 ? 0.22 : rawArea < 500 ? 0.35 : rawArea < 1500 ? 0.5 : 0.65;
            adaptiveTol = Math.max(adaptiveTol, outlineTolerance);
          }

          let smoothForPoly = layerSmoothing;
          if (isDarkLayer) {
            if (rawArea < 4000) {
              smoothForPoly = Math.min(smoothForPoly, 0.16);
            }
            if (rawArea < 1500) {
              smoothForPoly = Math.min(smoothForPoly, 0.14);
            }
          }
          if (rawArea < 250) {
            smoothForPoly = Math.min(smoothForPoly, 0.12);
          }
          if (isOutlineLike) {
            smoothForPoly = Math.max(smoothForPoly, rawArea < 500 ? 0.22 : 0.3);
          }

          let pts = simplifyPath(
            poly,
            adaptiveTol,
            smoothForPoly,
            cornerThresholdDeg,
          );

          pts = normalizePoints(pts, payload.width, payload.height);
          pts = softenOrthogonalStairs(pts);
          pts = postProcessContour(pts, rawClockwise);

          const fallback = postProcessContour(rawRounded, rawClockwise);
          if (hasJoinDamage(rawRounded, pts)) {
            pts = fallback;
          }

          // Important new step:
          // Slightly expand dark outline-like polygons so adjacent fills/outline joins
          // overlap instead of leaving tiny visible seams.
          if (isOutlineLike && rawArea >= 80) {
            const haloAmount =
              rawArea < 500 ? 0.18 : rawArea < 1500 ? 0.14 : 0.1;

            pts = expandPolygonRadially(
              pts,
              haloAmount,
              payload.width,
              payload.height,
            );
            pts = postProcessContour(pts, rawClockwise);
          }

          const area = polygonArea(pts);
          if (isDarkLayer && isTinyDarkFragment(pts, area)) {
            return { pts: [], area: 0 };
          }
          return { pts, area };
        })
        .filter(({ pts, area }) => pts.length >= 3 && area >= minPolyArea)
        .sort((a, b) => b.area - a.area);

      if (pathsWithArea.length === 0) {
        continue;
      }

      layerCandidates.push({
        name: `COLOR_${String(index + 1).padStart(2, "0")}`,
        color,
        coverage,
        paths: pathsWithArea.map(({ pts }) => ({
          points: pts,
          closed: true,
          nodeCount: pts.length,
        })),
      });
    }

    const selected = layerCandidates
      .filter((l) => l.coverage >= minLayerCoveragePct)
      .sort((a, b) => b.coverage - a.coverage);

    if (selected.length < minLayerCount) {
      const used = new Set(selected.map((l) => l.name));
      const extras = layerCandidates
        .filter((l) => !used.has(l.name))
        .sort((a, b) => b.coverage - a.coverage)
        .slice(0, minLayerCount - selected.length);
      selected.push(...extras);
    }

    const layers: VectorLayer[] = selected
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, maxLayerCount)
      .map((l) => ({ ...l, paths: [...l.paths] }));

    const outputLayers = layers.sort(
      (a, b) => layerArea(b) - layerArea(a),
    );

    postMessageTyped({
      type: "progress",
      payload: { id: payload.id, phase: "Exporting vectors", progress: 92 },
    });

    const baseResult = {
      width: payload.width,
      height: payload.height,
      layers: outputLayers,
      metrics: computeMetrics(outputLayers, startedAt),
    };

    const svg = toSVG(baseResult);
    const eps = toEPSLevel2(baseResult);
    const dxf = toDXF(baseResult);

    postMessageTyped({
      type: "result",
      payload: {
        id: payload.id,
        result: {
          ...baseResult,
          svg,
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
};

export {};
