import type { ConversionMetrics, VectorLayer } from "@/types/vector";

export function computeMetrics(layers: VectorLayer[], startedAt: number): ConversionMetrics {
  let nodeCount = 0;
  let pathCount = 0;
  for (const layer of layers) {
    pathCount += layer.paths.length;
    for (const path of layer.paths) {
      if (path.nodeCount > 0) {
        nodeCount += path.nodeCount;
        continue;
      }
      nodeCount += path.points.length;
      nodeCount += path.holes?.reduce((sum, hole) => sum + hole.length, 0) ?? 0;
    }
  }
  return {
    nodeCount,
    pathCount,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}
