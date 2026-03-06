import type { ConversionMetrics, VectorLayer } from "@/types/vector";

export function computeMetrics(layers: VectorLayer[], startedAt: number): ConversionMetrics {
  let nodeCount = 0;
  let pathCount = 0;
  for (const layer of layers) {
    pathCount += layer.paths.length;
    for (const path of layer.paths) {
      nodeCount += path.nodeCount;
    }
  }
  return {
    nodeCount,
    pathCount,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}
