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
 * Both are exact, so we ship the smaller SVG.
 */
export function pickSmallerPath(
  binarySvgLength: number,
  colorSvgLength: number,
): TracePath {
  return binarySvgLength <= colorSvgLength ? "binary" : "color";
}
