import type { ConversionSettings } from "@/types/vector";

export const DEFAULT_SETTINGS: ConversionSettings = {
  clusteringMode: "color",
  hierarchical: "stacked",
  filterSpeckle: 4,
  colorPrecision: 8,
  layerDifference: 16,
  mode: "spline",
  cornerThreshold: 60,
  lengthThreshold: 4,
  spliceThreshold: 45,
  pathPrecision: 3,
};
