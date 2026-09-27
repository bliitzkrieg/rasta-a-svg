import type { ConversionSettings } from "@/types/vector";

export const DEFAULT_SETTINGS: ConversionSettings = {
  clusteringMode: "color",
  hierarchical: "stacked",
  filterSpeckle: 1,
  colorPrecision: 8,
  layerDifference: 1,
  mode: "spline",
  cornerThreshold: 30,
  lengthThreshold: 12,
  spliceThreshold: 30,
  pathPrecision: 3,
  polygonMaxArea: 1600,
  exactFlatPolygons: true,
};
