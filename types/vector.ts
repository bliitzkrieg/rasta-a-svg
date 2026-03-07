export type QueueStatus =
  | "queued"
  | "processing"
  | "done"
  | "error"
  | "canceled";

export type OptimizePreset = "fidelity" | "balanced" | "minimal-nodes";

export type ConverterStrategy = "standard" | "adaptive" | "high-fidelity";

export type PaletteMode = "auto" | "fixed";

export interface ConversionSettings {
  paletteMode: PaletteMode;
  paletteSize: number;
  smoothing: number;
  speckleThresholdPx: number;
  simplifyTolerancePx: number;
  cornerThresholdDeg: number;
  optimizePreset: OptimizePreset;
  calibrate: boolean;
  converterStrategy: ConverterStrategy;
}

export interface VectorPoint {
  x: number;
  y: number;
}

export interface VectorPath {
  points: VectorPoint[];
  closed: boolean;
  nodeCount: number;
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

export interface PersistedAppState {
  queue: ImageQueueItem[];
  selectedId?: string;
  sliderPosition: number;
  settings: ConversionSettings;
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

export const DEFAULT_SETTINGS: ConversionSettings = {
  paletteMode: "fixed",
  paletteSize: 16,
  smoothing: 0.16,
  speckleThresholdPx: 4,
  simplifyTolerancePx: 1.8,
  cornerThresholdDeg: 40,
  optimizePreset: "fidelity",
  calibrate: false,
  converterStrategy: "high-fidelity"
};
