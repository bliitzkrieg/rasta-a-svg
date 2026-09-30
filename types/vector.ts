export type QueueStatus =
  | "queued"
  | "processing"
  | "done"
  | "error"
  | "canceled";

export type VTracerClusteringMode = "color" | "binary";

export type VTracerHierarchical = "stacked" | "cutout";

export type VTracerMode = "spline" | "polygon" | "none";

export interface ConversionSettings {
  clusteringMode: VTracerClusteringMode;
  hierarchical: VTracerHierarchical;
  filterSpeckle: number;
  colorPrecision: number;
  layerDifference: number;
  mode: VTracerMode;
  cornerThreshold: number;
  lengthThreshold: number;
  spliceThreshold: number;
  pathPrecision: number;
  polygonMaxArea: number;
  exactFlatPolygons: boolean;
  tinyMergeMaxArea: number;
  tinyMergeMaxDiff: number;
  tinyMergeMinTargetArea: number;
  tinyMergeMaxTargetArea: number;
  tinyMergeMaxNeighborSpread: number;
  tinyMergeMaxPixelSpread: number;
  flatClusterMaxDelta: number;
  maxMergeSpread: number;
}

export interface VectorPoint {
  x: number;
  y: number;
}

export interface VectorPath {
  points: VectorPoint[];
  holes?: VectorPoint[][];
  closed: boolean;
  nodeCount: number;
  svgTranslateX?: number;
  svgTranslateY?: number;
}

export interface VectorLayer {
  name: string;
  color: string;
  paths: VectorPath[];
}

export interface ConversionMetrics {
  nodeCount: number;
  pathCount: number;
  elapsedMs: number;
}

export interface ConversionResult {
  width: number;
  height: number;
  layers: VectorLayer[];
  svg: string;
  metrics: ConversionMetrics;
}

export interface ImageQueueItem {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: QueueStatus;
  progress: number;
  error?: string;
  metrics?: ConversionMetrics;
  createdAt: string;
  updatedAt: string;
}

export type ThemePreference = "light" | "dark" | "system";

export interface PersistedAppState {
  queue: ImageQueueItem[];
  selectedId?: string;
  sliderPosition: number;
  settings: ConversionSettings;
  theme: ThemePreference;
}

export interface ConvertJobRequest {
  id: string;
  width: number;
  height: number;
  /** Original source dimensions before downscaling (for SVG display size). */
  sourceWidth: number;
  sourceHeight: number;
  pixels: Uint8ClampedArray;
  settings: ConversionSettings;
  /** Palette-snap tier that fired during decode (2, 8, or 16), if any. */
  paletteTier: number | null;
  /** Pre-prep decoded pixels, for the binary-layer fill recolor. */
  originalPixels: Uint8ClampedArray;
}

export interface ConvertJobProgress {
  id: string;
  phase: string;
  progress: number;
}

export interface ConvertJobResult {
  id: string;
  result: ConversionResult;
}

export interface ConvertJobError {
  id: string;
  error: string;
}
