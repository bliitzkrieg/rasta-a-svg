export type QueueStatus =
  | "queued"
  | "processing"
  | "done"
  | "error"
  | "canceled";

export type OptimizePreset = "fidelity" | "balanced" | "minimal-nodes";

export type PaletteMode = "auto" | "fixed";

export interface ConversionSettings {
  paletteMode: PaletteMode;
  paletteSize: number;
  smoothing: number;
  speckleThresholdPx: number;
  simplifyTolerancePx: number;
  cornerThresholdDeg: number;
  optimizePreset: OptimizePreset;
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
