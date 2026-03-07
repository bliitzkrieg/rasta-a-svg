/// <reference lib="webworker" />

import { toDXF } from "@/lib/export/dxf";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toSVG } from "@/lib/export/svg";
import { maskToPolygons } from "@/lib/vectorize/layers";
import { computeMetrics } from "@/lib/vectorize/metrics";
import { quantizeImage } from "@/lib/vectorize/quantize";
import { simplifyPath } from "@/lib/vectorize/simplify";
import {
  closeMask,
  labelsToMask,
  removeSmallComponents
} from "@/lib/vectorize/trace";
import type {
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  VectorLayer
} from "@/types/vector";

type WorkerInMessage = { type: "convert"; payload: ConvertJobRequest };
type WorkerOutMessage =
  | { type: "progress"; payload: ConvertJobProgress }
  | { type: "result"; payload: ConvertJobResult }
  | { type: "error"; payload: ConvertJobError };

function postMessageTyped(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function simplifyToleranceForPreset(
  baseTolerance: number,
  preset: "fidelity" | "balanced" | "minimal-nodes"
): number {
  if (preset === "fidelity") {
    return Math.max(0.25, baseTolerance * 0.55);
  }
  if (preset === "minimal-nodes") {
    return Math.max(1.2, baseTolerance * 1.7);
  }
  return Math.max(0.45, baseTolerance * 0.85);
}

function polygonArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

function layerArea(layer: VectorLayer): number {
  let total = 0;
  for (const path of layer.paths) {
    total += polygonArea(path.points);
  }
  return total;
}

function mergeLikeColoredLayers(layers: VectorLayer[]): VectorLayer[] {
  const merged = new Map<string, VectorLayer>();
  for (const layer of layers) {
    const existing = merged.get(layer.color);
    if (!existing) {
      merged.set(layer.color, { ...layer, paths: [...layer.paths] });
      continue;
    }
    existing.paths.push(...layer.paths);
  }
  return Array.from(merged.values());
}

function clampLayers(layers: VectorLayer[]): VectorLayer[] {
  if (layers.length === 0) {
    return layers;
  }

  const scored = layers
    .map((layer) => ({
      layer,
      score: layerArea(layer)
    }))
    .sort((a, b) => b.score - a.score);

  const cappedLayers = scored.slice(0, 12).map((entry) => entry.layer);
  const maxPathsPerLayer = 12;
  const maxDarkPathsPerLayer = 28;
  const detailReserveCount = 8;

  for (const layer of cappedLayers) {
    const isDarkLayer = hexLuminance(layer.color) < 55;
    const layerCap = isDarkLayer ? maxDarkPathsPerLayer : maxPathsPerLayer;
    if (layer.paths.length <= layerCap) {
      continue;
    }
    const scoredPaths = layer.paths
      .map((path) => ({ path, area: polygonArea(path.points) }))
      .sort((a, b) => b.area - a.area);

    if (!isDarkLayer) {
      const localDetailReserve = 3;
      const primaryCount = Math.max(1, layerCap - localDetailReserve);
      const primary = scoredPaths.slice(0, primaryCount);
      const detail = scoredPaths
        .slice(primaryCount)
        .filter((entry) => entry.area >= 0.5 && entry.area <= 650)
        .sort((a, b) => a.area - b.area)
        .slice(0, localDetailReserve);
      layer.paths = [...primary, ...detail].map((entry) => entry.path);
      continue;
    }

    const primaryCount = Math.max(1, layerCap - detailReserveCount);
    const primary = scoredPaths.slice(0, primaryCount);
    const detail = scoredPaths
      .slice(primaryCount)
      .filter((entry) => entry.area >= 1 && entry.area <= 420)
      .sort((a, b) => a.area - b.area)
      .slice(0, detailReserveCount);
    const selected = [...primary, ...detail];
    if (selected.length < layerCap) {
      const set = new Set(selected.map((entry) => entry.path));
      for (const entry of scoredPaths) {
        if (set.has(entry.path)) {
          continue;
        }
        selected.push(entry);
        if (selected.length >= layerCap) {
          break;
        }
      }
    }
    layer.paths = selected.map((entry) => entry.path);
  }

  return cappedLayers;
}

function hexLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) || 0;
  const g = Number.parseInt(value.slice(2, 4), 16) || 0;
  const b = Number.parseInt(value.slice(4, 6), 16) || 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0
  };
}

function calibrateOutputColor(hex: string): string {
  const { r, g, b } = parseHexColor(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const sat = max === 0 ? 0 : chroma / max;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;

  let hue = 0;
  if (chroma > 0) {
    if (max === r) {
      hue = ((g - b) / chroma) % 6;
    } else if (max === g) {
      hue = (b - r) / chroma + 2;
    } else {
      hue = (r - g) / chroma + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  if (lum < 55) {
    return "#000000";
  }
  if (lum > 232 && sat < 0.18) {
    return "#fffdff";
  }
  if (lum > 210 && sat < 0.35 && Math.abs(r - g) < 35 && Math.abs(g - b) < 35) {
    return "#fffdff";
  }
  if (lum > 180 && lum <= 232 && sat >= 0.12 && sat < 0.45 && r >= g && g >= b && hue <= 35) {
    return "#fad9cd";
  }
  if (sat > 0.45 && hue >= 20 && hue <= 55) {
    return "#fab53c";
  }
  if (sat > 0.35 && (hue <= 20 || hue >= 340)) {
    return "#f55255";
  }
  return hex;
}

function isBackgroundFlood(mask: Uint8Array, width: number, height: number): boolean {
  let count = 0;
  let top = false;
  let bottom = false;
  let left = false;
  let right = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) {
        continue;
      }
      count += 1;
      if (y === 0) {
        top = true;
      }
      if (y === height - 1) {
        bottom = true;
      }
      if (x === 0) {
        left = true;
      }
      if (x === width - 1) {
        right = true;
      }
    }
  }

  const coverage = count / (width * height);
  return coverage > 0.25 && top && bottom && left && right;
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
      payload: { id: payload.id, phase: "Quantizing colors", progress: 10 }
    });

    const quantized = quantizeImage(
      payload.pixels,
      payload.width,
      payload.height,
      payload.settings.paletteSize,
      payload.settings.paletteMode === "auto"
    );

    // --- Port CLI convertImage logic exactly ---
    const simplifyTolerance = simplifyToleranceForPreset(
      payload.settings.simplifyTolerancePx,
      payload.settings.optimizePreset
    );
    const { speckleThresholdPx, smoothing, cornerThresholdDeg, calibrate, converterStrategy } = payload.settings;
    const useAdaptiveSimplify = converterStrategy === "adaptive" || converterStrategy === "high-fidelity";
    const isHighFidelity = converterStrategy === "high-fidelity";
    const maxPathsPerLayer = isHighFidelity ? 10 : 6;
    const minLayerCoveragePct = isHighFidelity ? 0.0005 : 0.003;
    const minLayerCount = isHighFidelity ? 6 : 5;
    const maxLayerCount = isHighFidelity ? 12 : 8;
    const totalPixels = payload.width * payload.height;
    const total = quantized.palette.length;

    type LayerCandidate = VectorLayer & { coverage: number; pathAreas: number[] };
    const layerCandidates: LayerCandidate[] = [];

    for (let index = 0; index < total; index += 1) {
      postMessageTyped({
        type: "progress",
        payload: {
          id: payload.id,
          phase: `Tracing layer ${index + 1}/${total}`,
          progress: 20 + Math.round(((index + 1) / total) * 60)
        }
      });

      const rawColor = quantized.palette[index];
      const color = calibrate ? calibrateOutputColor(rawColor) : rawColor;
      const coverage = quantized.counts[index] / totalPixels;
      const lum = hexLuminance(color);
      const coverageThreshold = lum > 170 || lum < 40 ? 0.0001 : 0.002;
      if (coverage < coverageThreshold) continue;

      const isDarkLayer = lum < 55;
      const isLightLayer = lum > 240;
      const layerSpeckle = isDarkLayer || isLightLayer ? 1 : speckleThresholdPx;
      const layerTolerance = isDarkLayer
        ? Math.max(0.28, simplifyTolerance * 0.4)
        : isLightLayer
          ? Math.max(0.35, simplifyTolerance * 0.45)
          : simplifyTolerance;
      const baseLayerSmoothing = isDarkLayer
        ? smoothing * 0.1
        : isLightLayer
          ? smoothing * 0.15
          : smoothing;
      const layerSmoothing = converterStrategy === "high-fidelity"
        ? Math.min(0.28, baseLayerSmoothing * 1.25)
        : baseLayerSmoothing;
      // CLI: minPolyArea = 1 for dark/light, 8 for midtone — key to removing dot artifacts
      const minPolyArea = isDarkLayer || isLightLayer ? 1 : 8;

      const rawMask = labelsToMask(quantized.labels, payload.width, payload.height, index);
      if (isBackgroundFlood(rawMask, payload.width, payload.height) && lum < 220) continue;

      const mask = removeSmallComponents(rawMask, payload.width, payload.height, layerSpeckle);
      const polygons = maskToPolygons(mask, payload.width, payload.height);

      const pathsWithArea = polygons
        .map((poly) => {
          const rawArea = polygonArea(poly);
          const rawRounded = poly.map((p) => ({
            x: Number(Math.max(0, Math.min(payload.width, p.x)).toFixed(2)),
            y: Number(Math.max(0, Math.min(payload.height, p.y)).toFixed(2))
          }));

          // Adaptive simplification: smaller shapes use lower epsilon to preserve detail.
          let adaptiveTol = layerTolerance;
          if (useAdaptiveSimplify) {
            if (rawArea < 100) adaptiveTol = Math.min(layerTolerance, 0.22);
            else if (rawArea < 500) adaptiveTol = Math.min(layerTolerance, 0.45);
            else if (rawArea < 2000) adaptiveTol = Math.min(layerTolerance, 0.85);
          }

          const smoothForPoly = (isHighFidelity && isDarkLayer && rawArea < 3000)
            ? Math.min(layerSmoothing, 0.06)
            : layerSmoothing;

          let pts = simplifyPath(poly, adaptiveTol, smoothForPoly, cornerThresholdDeg)
            .map((p) => ({
              x: Number(Math.max(0, Math.min(payload.width, p.x)).toFixed(2)),
              y: Number(Math.max(0, Math.min(payload.height, p.y)).toFixed(2))
            }));

          // Topology guard (high-fidelity): if simplification materially changes local shape,
          // fall back to raw traced contour for this polygon to avoid tiny missing slices at joins.
          if (isHighFidelity) {
            const rawRoundedArea = polygonArea(rawRounded);
            const simpArea = polygonArea(pts);
            const areaDelta = rawRoundedArea > 0 ? Math.abs(simpArea - rawRoundedArea) / rawRoundedArea : 0;
            if (pts.length < 3 || areaDelta > 0.08) {
              pts = rawRounded;
            }
          }

          return { pts, area: polygonArea(pts) };
        })
        .filter(({ pts, area }) => pts.length >= 3 && area >= minPolyArea)
        .sort((a, b) => b.area - a.area);

      if (pathsWithArea.length === 0) continue;

      layerCandidates.push({
        name: `COLOR_${String(index + 1).padStart(2, "0")}`,
        color,
        coverage,
        paths: pathsWithArea.map(({ pts, area }) => ({ points: pts, closed: true, nodeCount: pts.length + (area * 0) })),
        pathAreas: pathsWithArea.map(({ area }) => area)
      });
    }

    // Layer selection: mirror CLI logic
    const selected = layerCandidates.filter((l) => l.coverage >= minLayerCoveragePct)
      .sort((a, b) => b.coverage - a.coverage);
    if (selected.length < minLayerCount) {
      const used = new Set(selected.map((l) => l.name));
      const extras = layerCandidates
        .filter((l) => !used.has(l.name))
        .sort((a, b) => b.coverage - a.coverage)
        .slice(0, minLayerCount - selected.length);
      selected.push(...extras);
    }
    let layers = selected
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, maxLayerCount)
      .map((l) => ({ ...l, paths: [...l.paths] }));

    if (calibrate) {
      layers = layers.map((l) => ({ ...l, color: calibrateOutputColor(l.color) }));
      layers = mergeLikeColoredLayers(layers) as LayerCandidate[];
    }

    // Per-layer path capping: keep CLI behavior for non-high-fidelity.
    // In high-fidelity mode, skip capping entirely to avoid dropping tiny cutouts/holes
    // (this is the likely source of GooseCupid black fill artifacts).
    if (!isHighFidelity) {
      for (const layer of layers) {
        const isDarkLayer = hexLuminance(layer.color) < 55;
        const cap = isDarkLayer ? Math.max(maxPathsPerLayer, 8) : maxPathsPerLayer;
        if (layer.paths.length <= cap) continue;
        const areas = (layer as LayerCandidate).pathAreas ?? layer.paths.map((p) => polygonArea(p.points));
        const scored = layer.paths.map((p, i) => ({ p, area: areas[i] ?? 0 })).sort((a, b) => b.area - a.area);
        if (!isDarkLayer) {
          layer.paths = scored.slice(0, cap).map(({ p }) => p);
          continue;
        }
        const detailReserve = 2;
        const primary = scored.slice(0, Math.max(1, cap - detailReserve));
        const detail = scored
          .slice(Math.max(1, cap - detailReserve))
          .filter(({ area }) => area >= 8 && area <= 320)
          .sort((a, b) => a.area - b.area)
          .slice(0, detailReserve);
        layer.paths = [...primary, ...detail].map(({ p }) => p);
      }
    }

    // Paint broad regions first so detail layers stay visible
    const outputLayers = (layers as VectorLayer[]).sort((a, b) => layerArea(b) - layerArea(a));

    postMessageTyped({
      type: "progress",
      payload: { id: payload.id, phase: "Exporting vectors", progress: 92 }
    });

    const baseResult = {
      width: payload.width,
      height: payload.height,
      layers: outputLayers as VectorLayer[],
      metrics: computeMetrics(outputLayers as VectorLayer[], startedAt)
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
          dxf
        }
      }
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Conversion failed";
    postMessageTyped({
      type: "error",
      payload: {
        id: payload.id,
        error: messageText
      }
    });
  }
};

export {};
