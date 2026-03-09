export type QueueStatus =
  | "queued"
  | "awaiting_quota"
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
  svgPathData?: string;
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
  eps: string;
  dxf: string;
  metrics: ConversionMetrics;
}

export interface ImageQueueItem {
  id: string;
  quotaReservationId?: string;
  quotaBlockedReason?: "daily_limit";
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
  pixels: Uint8ClampedArray;
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
