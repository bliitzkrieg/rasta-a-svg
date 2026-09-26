import type { ConversionSettings } from "@/types/vector";

export const DEFAULT_SETTINGS: ConversionSettings = {
  clusteringMode: "color",
  hierarchical: "stacked",
  filterSpeckle: 4,
  colorPrecision: 8,
  layerDifference: 1,
  mode: "spline",
  cornerThreshold: 60,
  lengthThreshold: 24,
  spliceThreshold: 30,
  pathPrecision: 3,
};
