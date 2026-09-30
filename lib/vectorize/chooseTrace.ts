/**
 * Shared trace routing logic used by both the worker and the parity bench.
 *
 * This ensures the bench scores what the app actually ships (via the appPath
 * field), not just the best of both paths. Extracting it here is also how
 * the v1.0.41 regression (no-tier branch dropping the residual) would have
 * been caught: the bench would have reproduced the worker's routing exactly.
 */

import type { VTracerClusteringMode } from "@/types/vector";

export type TracePath = "binary" | "color";

export interface TraceRouting {
  /** Which path(s) to trace */
  paths: TracePath[];
  /**
   * Which path the app ships (for bench reporting). Null when the app traces
   * both paths and ships whichever SVG is smaller; the bench fills this in
   * after comparing sizes via pickSmallerPath.
   */
  appPath: TracePath | null;
}

/**
 * Decide which trace path(s) to use for an image.
 *
 * - If a palette tier fires (flat artwork) and the user chose color mode:
 *   trace both paths, ship the smaller SVG. Both are pixel-exact, so this
 *   can never make a file bigger.
 * - Otherwise (B/W mode, photos, shaded illustrations): trace the color path
 *   with originals (for recolor + residual, gated by residualMaxBytes).
 *   B/W mode never runs the binary-layer trace: it is wasted work, and it
 *   could ship color after the user asked for B/W.
 */
export function chooseTrace(
  paletteTier: number | null,
  clusteringMode: VTracerClusteringMode,
): TraceRouting {
  if (paletteTier != null && clusteringMode === "color") {
    return {
      paths: ["binary", "color"],
      appPath: null,
    };
  }
  return {
    paths: ["color"],
    appPath: "color",
  };
}

/**
 * After tracing both paths for a tier image, pick which to ship.
 *
 * Quality-aware: prefer an exact result over a non-exact one; among
 * results with the same pixelExact reason, ship the smaller SVG.
 * "Smaller wins" was only safe while both outputs were exact; in Polygon
 * mode the color path can be simplified (78% exact) while the binary path
 * stays exact, and blindly picking the smaller file ships visibly worse
 * output.
 */
export function pickSmallerPath(
  binary: { svgLength: number; pixelExact: string },
  color: { svgLength: number; pixelExact: string },
): TracePath {
  // Lower rank = better. exact > capped > simplified/uncorrected/unknown.
  // "bw" never reaches here (B/W mode skips the binary path entirely).
  const rank = (p: string): number => {
    if (p === "exact") return 0;
    if (p === "capped") return 1;
    return 2;
  };
  const binaryRank = rank(binary.pixelExact);
  const colorRank = rank(color.pixelExact);
  if (binaryRank !== colorRank) {
    return binaryRank < colorRank ? "binary" : "color";
  }
  return binary.svgLength <= color.svgLength ? "binary" : "color";
}
