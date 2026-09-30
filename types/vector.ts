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
  /** Why the SVG is or isn't pixel-exact vs the source.
   * - "exact": pixel-correction layer present (or unnecessary), SVG is exact.
   * - "capped": correction skipped by residualMaxBytes size cap.
   * - "bw": B/W mode, never pixel-exact by design.
   * - "simplified": geometry simplified (e.g. Polygon curve fitting), so the
   *   correction layer cannot be correct.
   * Undefined for results saved before v1.0.44 (treated as unknown). */
  pixelExact?: "exact" | "capped" | "bw" | "simplified";
  /** @deprecated Use pixelExact instead. Kept for backwards compat with
   * results saved before v1.0.44. */
  pixelPerfect?: boolean;
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
  /** The raw uploaded file bytes. The worker decodes them off the main
   * thread (fast-png, downscale, preprocess) before tracing. */
  buffer: ArrayBuffer;
  settings: ConversionSettings;
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
