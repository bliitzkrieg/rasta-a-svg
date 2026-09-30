/**
 * Shared trace routing logic used by both the worker and the parity bench.
 *
 * This ensures the bench scores what the app actually ships (via the appPath
 * field), not just the best of both paths. Extracting it here is also how
 * the v1.0.41 regression (no-tier branch dropping the residual) would have
 * been caught: the bench would have reproduced the worker's routing exactly.
 */

export type TracePath = "binary" | "color";

export interface TraceRouting {
  /** Which path(s) to trace */
  paths: TracePath[];
  /** Which path the app ships (for bench reporting) */
  appPath: TracePath;
}

/**
 * Decide which trace path(s) to use for an image.
 *
 * - If a palette tier fires (flat artwork): trace both paths, ship the smaller
 *   SVG. Both are pixel-exact, so this can never make a file bigger.
 * - Otherwise (photos, shaded illustrations): trace the color path with
 *   originals (for recolor + residual, gated by residualMaxBytes).
 */
export function chooseTrace(paletteTier: number | null): TraceRouting {
  if (paletteTier != null) {
    return {
      paths: ["binary", "color"],
      // appPath is determined after tracing both (whichever SVG is smaller)
      // The bench sets this after comparing sizes.
      appPath: "binary", // placeholder, bench overwrites
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
