import type {
  ConversionSettings,
  VTracerClusteringMode,
  VTracerHierarchical,
  VTracerMode,
} from "@/types/vector";

export interface VTracerOptions {
  clusteringMode: VTracerClusteringMode;
  hierarchical: VTracerHierarchical;
  colorPrecision: number;
  filterSpeckle: number;
  layerDifference: number;
  cornerThreshold: number;
  lengthThreshold: number;
  maxIterations: number;
  pathPrecision: number;
  spliceThreshold: number;
  mode: VTracerMode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toVTracerOptions(
  settings: ConversionSettings,
): VTracerOptions {
  return {
    clusteringMode: settings.clusteringMode,
    hierarchical: settings.hierarchical,
    colorPrecision: clamp(Math.round(settings.colorPrecision), 1, 8),
    filterSpeckle: clamp(Math.round(settings.filterSpeckle), 0, 16),
    layerDifference: clamp(Math.round(settings.layerDifference), 0, 255),
    cornerThreshold: clamp(Math.round(settings.cornerThreshold), 0, 180),
    lengthThreshold: Number(
      clamp(settings.lengthThreshold, 3.5, 10).toFixed(2),
    ),
    maxIterations: 10,
    pathPrecision: clamp(Math.round(settings.pathPrecision), 0, 16),
    spliceThreshold: clamp(Math.round(settings.spliceThreshold), 0, 180),
    mode: settings.mode,
  };
}
