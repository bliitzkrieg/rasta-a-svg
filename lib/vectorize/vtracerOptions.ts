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
  polygonMaxArea: number;
  exactFlatPolygons: boolean;
  tinyMergeMaxArea: number;
  tinyMergeMaxDiff: number;
  tinyMergeMinTargetArea: number;
  tinyMergeMaxTargetArea: number;
  tinyMergeMaxNeighborSpread: number;
  tinyMergeMaxPixelSpread: number;
  flatClusterMaxDelta: number;
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
      clamp(settings.lengthThreshold, 3.5, 40).toFixed(2),
    ),
    maxIterations: 10,
    pathPrecision: clamp(Math.round(settings.pathPrecision), 0, 16),
    spliceThreshold: clamp(Math.round(settings.spliceThreshold), 0, 180),
    mode: settings.mode,
    polygonMaxArea: clamp(Math.round(settings.polygonMaxArea), 0, 65536),
    exactFlatPolygons: settings.exactFlatPolygons === true,
    tinyMergeMaxArea: clamp(Math.round(settings.tinyMergeMaxArea), 0, 65536),
    tinyMergeMaxDiff: clamp(Math.round(settings.tinyMergeMaxDiff), 0, 765),
    tinyMergeMinTargetArea: clamp(
      Math.round(settings.tinyMergeMinTargetArea),
      0,
      65536,
    ),
    tinyMergeMaxTargetArea: clamp(
      Math.round(settings.tinyMergeMaxTargetArea),
      0,
      65536,
    ),
    tinyMergeMaxNeighborSpread: clamp(
      Math.round(settings.tinyMergeMaxNeighborSpread),
      0,
      765,
    ),
    tinyMergeMaxPixelSpread: clamp(
      Math.round(settings.tinyMergeMaxPixelSpread),
      0,
      765,
    ),
    flatClusterMaxDelta: clamp(
      Math.round(settings.flatClusterMaxDelta),
      0,
      255,
    ),
  };
}
