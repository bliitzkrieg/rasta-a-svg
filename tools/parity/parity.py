#!/usr/bin/env python3
"""
Parity harness for the rasta-a-svg converter.

For each test PNG: downscale to 1000px (like the app), trace with the repo's
checked-in WASM engine, rasterize the vector layers back to pixels, and score
how closely the render matches the source.

Usage:
  python3 parity.py [--settings '{"colorPrecision":6}'] [--images a.png,b.png]

Prints a JSON summary to stdout. Higher "score" is better (fraction of pixels
whose worst channel differs by at most 24 from the source).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from PIL import Image, ImageDraw, ImageChops

BASE = os.path.dirname(os.path.abspath(__file__))
IMAGES = os.path.join(BASE, "images")
WORK = os.path.join(BASE, "work")
TRACE_JS = os.path.join(BASE, "trace.mjs")

DEFAULT_OPTIONS = {
    "clusteringMode": "color",
    "hierarchical": "stacked",
    "colorPrecision": 8,
    "filterSpeckle": 1,
    "layerDifference": 1,
    "cornerThreshold": 30,
    "lengthThreshold": 12.0,
    "maxIterations": 10,
    "pathPrecision": 3,
    "spliceThreshold": 30,
    "mode": "spline",
    "polygonMaxArea": 1600,
    "exactFlatPolygons": True,
    "flatClusterMaxDelta": 255,  # mirrors the shipped app 1:1
    # (v1.0.27: defaultSettings 255, clamp 0..1000; 255 >= max u8 spread so
    # every color cluster exact-walks, functionally identical to 1000).
    "maxMergeSpread": 32,
}

TOLERANCE = 24  # max per-channel diff that counts as "matching"


def medianN_rgba(im, n):
    """n x n median denoise with edge replication, mirroring the app's
    lib/image/medianFilter.ts preprocessing step (histogram sliding window)."""
    import numpy as np

    arr = np.asarray(im).astype(np.uint8)
    r = n // 2
    padded = np.pad(arr, ((r, r), (r, r), (0, 0)), mode="edge")
    h, w = arr.shape[0], arr.shape[1]
    windows = np.stack(
        [padded[y : y + h, x : x + w] for y in range(n) for x in range(n)],
        axis=-1,
    )
    return np.median(windows, axis=-1).astype(np.uint8)


def median5x5_rgba(im):
    return medianN_rgba(im, 5)


def unsharp_mask_rgba(im, sigma=2.0, percent=60, threshold=3):
    """Unsharp mask with separable Gaussian blur (edge replication), applied
    per channel including alpha. Mirrors lib/image/unsharpMask.ts exactly."""
    import numpy as np
    from PIL import Image

    radius = int(3 * sigma + 0.5)
    xs = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (xs / sigma) ** 2)
    kernel /= kernel.sum()

    arr = np.asarray(im).astype(np.float64)
    h, w = arr.shape[0], arr.shape[1]
    blurred = np.empty_like(arr)
    for c in range(arr.shape[2]):
        ch = arr[:, :, c]
        tmp = np.empty_like(ch)
        padded = np.pad(ch, ((0, 0), (radius, radius)), mode="edge")
        for x in range(w):
            tmp[:, x] = (padded[:, x : x + 2 * radius + 1] * kernel).sum(axis=1)
        padded = np.pad(tmp, ((radius, radius), (0, 0)), mode="edge")
        for y in range(h):
            blurred[y, :, c] = (padded[y : y + 2 * radius + 1, :] * kernel[:, None]).sum(axis=0)

    diff = arr - blurred
    out = arr.copy()
    apply = np.abs(diff) > threshold
    out[apply] = arr[apply] + diff[apply] * (percent / 100.0)
    return Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8), "RGBA")


def _is_thin_structure(im, im5):
    """Thin-structure detector, mirroring lib/image/thinStructure.ts 1:1.
    Fires only when the image has at most 8 distinct RGB colors and the 5x5
    median would rewrite >= 5% of pixels by > 8 in some channel (thin lines
    the median would erase)."""
    import numpy as np

    rgb = np.asarray(im)[:, :, :3].reshape(-1, 3)
    if np.unique(rgb, axis=0).shape[0] > 8:
        return False
    a = np.asarray(im).astype(int)
    b = np.asarray(im5).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    return chg >= 0.05


def _is_noisy_photo(im, im5):
    """Noisy-photo detector, mirroring lib/image/noisePhoto.ts 1:1.
    Fires only when the image has at least 50000 distinct RGB colors
    (photographic or grain-heavy content) and the 5x5 median would rewrite
    >= 10% of pixels by > 8 in some channel (median damage the tracer
    would reproduce faithfully as raw content). Fires on noisy_photo,
    photo.png, luca_skeleton, and wikipedia_logo across the 18-image suite;
    wikipedia_logo also fires the noise gate now, but its outcome is
    unchanged (the soft-alpha gate already returned the raw pixels), so
    the only behavior change is luca_skeleton. The next closest non-firer,
    gradient (0.0000), is far below the threshold."""
    import numpy as np

    rgb = np.asarray(im)[:, :, :3].reshape(-1, 3)
    if np.unique(rgb, axis=0).shape[0] < 50000:
        return False
    a = np.asarray(im).astype(int)
    b = np.asarray(im5).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    return chg >= 0.10


def _is_soft_alpha_art(im, im5):
    """Soft-alpha-art detector, mirroring lib/image/softAlpha.ts 1:1.
    Fires only when at least 1% of pixels are partially transparent
    (0 < alpha < 255, anti-aliased edges are a real feature) AND the 5x5
    median would rewrite >= 10% of pixels by > 8 in some channel (the
    median damages those soft edges). Fires only on wikipedia_logo
    across the 18-image suite."""
    import numpy as np

    alpha = np.asarray(im)[:, :, 3].astype(int)
    partial = ((alpha > 0) & (alpha < 255)).mean()
    if partial < 0.01:
        return False
    a = np.asarray(im).astype(int)
    b = np.asarray(im5).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    return chg >= 0.10


def _raw_palette_tier(im):
    """paletteSnapTier (lib/image/paletteSnap.ts) evaluated on the raw
    decoded pixels, before any preprocessing. Returns the tier (n/8/16)
    or None. Used by the median-damage gate as the flat-art test."""
    import numpy as np

    arr = np.asarray(im)
    opaque = arr[:, :, 3] == 255
    flat = arr[:, :, :3][opaque].reshape(-1, 3)
    if flat.shape[0] == 0:
        return None
    _, counts = np.unique(flat, axis=0, return_counts=True)
    srt = np.sort(counts)[::-1]
    total = counts.sum()
    n = len(srt)
    top8 = srt[:8].sum() / total
    top16 = srt[:16].sum() / total
    if n <= 8:
        return n
    if top8 >= 0.90:
        return 8
    if top16 >= 0.40:
        return 16
    return None


def _damage_checked_tier(im):
    """damageCheckedPaletteSnapTier (lib/image/paletteSnap.ts) evaluated on
    an arbitrary RGBA image, including the tier-8 -> 16 and tier-16 -> 32
    upgrades. Used by the median-damage gate to predict whether the image
    would take the binary-layer path: the median helps the binary path
    (cleaner palette snap on denoised pixels) and must not be skipped
    there, while on the color path its smearing of thin structures is
    pure damage. The gate evaluates it on the median-denoised pixels, the
    closest predictor of the pipeline's actual binary/color decision."""
    import numpy as np

    tier = _raw_palette_tier(im)
    if tier is None:
        return None
    snapped = _palette_snap_rgba(im, tier)
    sa = np.asarray(snapped).astype(int)
    ca = np.asarray(im).astype(int)
    preserved = (np.abs(sa[:, :, :3] - ca[:, :, :3]).max(axis=2) <= TOLERANCE).mean()
    if preserved < 0.99:
        return None
    if tier == 8:
        tier = 16
    if tier == 16:
        arr = np.asarray(im)
        opaque = arr[:, :, 3] == 255
        flat = arr[:, :, :3][opaque].reshape(-1, 3)
        _, counts = np.unique(flat, axis=0, return_counts=True)
        srt = np.sort(counts)[::-1]
        if srt[:32].sum() / counts.sum() >= 0.9:
            tier = 32
    return tier


def _is_median_damaging(im, im5):
    """Median-damage detector, mirroring lib/image/medianDamage.ts 1:1.
    Fires only when the raw image is flat art (a palette-snap tier fires
    on the pre-median pixels, so the tracer reproduces the raw content
    faithfully and the median's smoothing buys nothing) AND the 5x5
    median would rewrite a significant share of pixels by > 8 in some
    channel. Two bands:
    - legacy band (rewrite >= 1.5%): proven wins on chart, halftone, and
      diagonal_text; behavior preserved exactly.
    - extended band (rewrite >= 0.3%): color path only, i.e. the
      damage-checked tier does NOT fire on the median-denoised pixels
      (the pipeline's actual binary/color decision is made on prepped
      pixels; raw pixels mis-predict goose_balloon as color-path, where
      skipping the median is a measured 0.9980 -> 0.9869 regression).
    Fires on chart.png, halftone.png, and diagonal_text.png (legacy) plus
    luca_frog.png, luca_sunglasses.png, and luca_bathtub.png (extended)
    across the 18-image suite; the already-gated images return raw before
    this gate is evaluated."""
    import numpy as np

    if _raw_palette_tier(im) is None:
        return False
    a = np.asarray(im).astype(int)
    b = np.asarray(im5).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    if chg >= 0.015:
        return True
    return chg >= 0.003 and _damage_checked_tier(im5) is None


def _is_restore_damaging(im, im5):
    """Restore-damage detector, mirroring lib/image/restoreDamage.ts 1:1.
    Fires only when the image is flat art (a palette-snap tier fires on the
    median-denoised pixels, so the tracer reproduces the median content
    faithfully and the restore's sharpening buys nothing) AND the restore
    would actually apply (the median rewrote >= 0.05% of pixels by > 8 in
    some channel, the same NOISE_GATE adaptiveEdgeRestore uses). On such
    images the unsharp mask only adds overshoot halos around hard edges,
    which the 64-level posterize then quantizes into bands.
    Fires only on goose_balloon.png, luca_bathtub.png, luca_frog.png,
    luca_sunglasses.png, and text_logo.png across the 18-image suite."""
    import numpy as np

    if _raw_palette_tier(im5) is None:
        return False
    a = np.asarray(im).astype(int)
    b = np.asarray(im5).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    return chg >= 0.0005


def _adaptive_prep(im):
    """The shipped default pipeline: 5x5 median, then adaptive edge restoration.
    Ordered-dithered inputs pass through unmodified: the 1px dot pattern is
    image content, and the tracer reproduces it faithfully (honest metric:
    dither 0.6017 to 1.0000).
    Thin-structure inputs (line art, wireframes: <=8 colors, median would
    rewrite >=5% of pixels) also skip the median and the edge restore: the
    5x5 median erases 1px lines irreversibly (honest metric: line_art 0.7999
    to 1.0000, thin_lines 0.7913 to 1.0000).
    Heavily noisy or grain-heavy inputs (>=50000 colors, median would rewrite
    >=10% of pixels) also skip the median and the edge restore: the median
    rewrites the grain/noise the tracer would reproduce faithfully as raw
    content (honest metric: noisy_photo 0.6075 to 0.7339, luca_skeleton
    0.8800 to 0.8820; the 64-level posterize, majority vote, and alpha
    composite stay in the path).
    Flat artwork with soft anti-aliased edges (>=1% partially transparent
    pixels, median would rewrite >=10% of pixels) also skips the median
    and the edge restore: the median shifts anti-aliased fringe colors
    (honest metric: wikipedia_logo 0.9163 to 0.9386).
    Flat artwork where the median damages thin structures (a palette-snap
    tier fires on the raw pixels and the median would rewrite >=1.5% of
    pixels) also skips the median and the edge restore: the median smears
    1-2px structures the edge restore cannot recover (honest metric:
    chart 0.9515 to 0.9909, halftone 0.9807 to 0.9995, diagonal_text
    0.9666 to 0.9725).
    Mirrors lib/image/decode.ts (ditherPassthroughIfDithered,
    thinStructurePassthrough, noisePhotoPassthrough, softAlphaPassthrough,
    medianDamagePassthrough, restoreDamagePassthrough)."""
    import numpy as np

    # Experiment knob (harness-only, default behavior unchanged):
    # PREP_MODE=none skips the median/unsharp stages entirely, returning raw
    # pixels (posterize/vote/composite/snap still run downstream, exactly as
    # the no-preprocessing product variants would). Any shipped behavior
    # would need the matching gate in lib/image/decode.ts.
    if os.environ.get("PREP_MODE", "adaptive") == "none":
        return im
    if os.environ.get("PREP_MODE", "adaptive") == "median_only":
        # Diagnosis only: median denoise without the edge restore, to split
        # the two stages' effects. Not a shipped path.
        return Image.fromarray(median5x5_rgba(im), "RGBA")
    if _is_ordered_dither(im):
        return im
    im5 = Image.fromarray(median5x5_rgba(im), "RGBA")
    if _is_thin_structure(im, im5):
        return im
    if _is_noisy_photo(im, im5):
        return im
    if _is_soft_alpha_art(im, im5):
        return im
    if _is_median_damaging(im, im5):
        return im
    if _is_restore_damaging(im, im5):
        # Skip the unsharp edge restore on flat artwork where it would only
        # add halos; keep the median denoise. Mirrors
        # lib/image/restoreDamage.ts restoreDamagePassthrough 1:1.
        return Image.fromarray(np.asarray(im5), "RGBA")
    a = np.asarray(im).astype(int)
    b = np.asarray(im5).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    pct = 20 if chg >= 0.05 else 50
    return unsharp_mask_rgba(im5, 2.0, pct, 3) if chg >= 0.0005 else im5


def _gaussian_blur_rgba(im, sigma=2.5):
    """Pure separable Gaussian blur with edge replication, per channel
    including alpha. Mirrors lib/image/descreen.ts gaussianBlur."""
    import numpy as np
    from PIL import Image

    radius = int(3 * sigma + 0.5)
    xs = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (xs / sigma) ** 2)
    kernel /= kernel.sum()

    arr = np.asarray(im).astype(np.float64)
    h, w = arr.shape[0], arr.shape[1]
    out = np.empty_like(arr)
    for c in range(arr.shape[2]):
        ch = arr[:, :, c]
        tmp = np.empty_like(ch)
        padded = np.pad(ch, ((0, 0), (radius, radius)), mode="edge")
        for x in range(w):
            tmp[:, x] = (padded[:, x : x + 2 * radius + 1] * kernel).sum(axis=1)
        padded = np.pad(tmp, ((radius, radius), (0, 0)), mode="edge")
        for y in range(h):
            out[y, :, c] = (padded[y : y + 2 * radius + 1, :] * kernel[:, None]).sum(axis=0)
    # np.rint is round-half-to-even, matching the TS bankersRound.
    return Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), "RGBA")


def _is_ordered_dither(im):
    """Detect ordered (Bayer) dither via negative mean horizontal neighbor
    Pearson correlation on grayscale. Mirrors lib/image/descreen.ts."""
    import numpy as np

    arr = np.asarray(im).astype(np.float64)
    if arr.shape[1] < 2:
        return False
    g = (arr[:, :, 0] + arr[:, :, 1] + arr[:, :, 2]) / 3.0
    x1 = g[:, :-1].ravel()
    x2 = g[:, 1:].ravel()
    n = x1.size
    sum_x, sum_y = x1.sum(), x2.sum()
    sum_xx, sum_yy = (x1 * x1).sum(), (x2 * x2).sum()
    sum_xy = (x1 * x2).sum()
    denom = ((n * sum_xx - sum_x**2) * (n * sum_yy - sum_y**2)) ** 0.5
    if denom <= 0:
        return False
    corr = (n * sum_xy - sum_x * sum_y) / denom
    # -0.1 threshold: ordered dither is about -0.3, pure noise near 0.
    return corr < -0.1


def _selective_blur_rgba(im, radius=2, delta=24):
    """imagetracerjs-style selective blur: take the box-blurred pixel only
    where blurred-vs-original differs by less than `delta` (max over
    channels); keep the original near edges. Edge-preserving denoise
    alternative to the median pass (research lead P0-2)."""
    from PIL import ImageFilter
    import numpy as np

    blurred = im.filter(ImageFilter.BoxBlur(radius))
    a = np.asarray(im).astype(int)
    b = np.asarray(blurred).astype(int)
    use_blur = (np.abs(a - b).max(axis=2) < delta)[:, :, None]
    out = np.where(use_blur, b, a)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def _adaptive_prep_sel(im, radius=2, delta=24):
    """Experiment: shipped adaptive pipeline with the 5x5 median replaced by
    selective blur. Same edge-restoration gating as _adaptive_prep."""
    import numpy as np

    ims = _selective_blur_rgba(im, radius, delta)
    a = np.asarray(im).astype(int)
    b = np.asarray(ims).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    pct = 20 if chg >= 0.05 else 50
    return unsharp_mask_rgba(ims, 2.0, pct, 3) if chg >= 0.0005 else ims


def _bilateral_rgba(im, d=5, sigma_color=30.0, sigma_space=1.5):
    """Edge-preserving bilateral denoise (vectorized over d*d shifts).
    Range weight on RGB distance; preserves strong edges (thin lines, text)
    while smoothing flat/noisy interiors. Research lead P0-2."""
    import numpy as np

    arr = np.asarray(im).astype(np.float64)
    r = d // 2
    padded = np.pad(arr, ((r, r), (r, r), (0, 0)), mode="edge")
    h, w = arr.shape[0], arr.shape[1]
    ys, xs = np.mgrid[-r : r + 1, -r : r + 1]
    spatial = np.exp(-(xs**2 + ys**2) / (2.0 * sigma_space**2))
    num = np.zeros_like(arr)
    den = np.zeros((h, w))
    two_sc2 = 2.0 * sigma_color**2
    for dy in range(d):
        for dx in range(d):
            neigh = padded[dy : dy + h, dx : dx + w]
            cd2 = ((neigh[:, :, :3] - arr[:, :, :3]) ** 2).sum(axis=2)
            wgt = spatial[dy, dx] * np.exp(-cd2 / two_sc2)
            num += neigh * wgt[:, :, None]
            den += wgt
    out = num / np.maximum(den, 1e-8)[:, :, None]
    return Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), "RGBA")


def _adaptive_prep_bilateral(im, d=5, sigma_color=30.0, sigma_space=1.5):
    """Experiment: shipped adaptive pipeline with the 5x5 median replaced by
    a bilateral denoise. Same edge-restoration gating as _adaptive_prep."""
    import numpy as np

    imb = _bilateral_rgba(im, d, sigma_color, sigma_space)
    a = np.asarray(im).astype(int)
    b = np.asarray(imb).astype(int)
    chg = (np.abs(a - b).max(axis=2) > 8).mean()
    pct = 20 if chg >= 0.05 else 50
    return unsharp_mask_rgba(imb, 2.0, pct, 3) if chg >= 0.0005 else imb


def _majority_vote_rgba(im, min_votes=0, max_center_count=9):
    """Boundary majority-vote pass over the discrete (posterized) label map:
    each pixel takes the most common RGB in its 3x3 neighborhood (ties keep
    the center). Cleans ragged region edges without inventing new colors.
    Research lead (g). min_votes: only replace the center when the winning
    color has at least this many of the 9 votes (0 = plain plurality).
    max_center_count: only replace when the center's own color appears at
    most this many times in the window (targets isolated outlier pixels)."""
    import numpy as np
    from PIL import Image

    arr = np.asarray(im)
    lab = (
        arr[:, :, 0].astype(np.int32) * 65536
        + arr[:, :, 1].astype(np.int32) * 256
        + arr[:, :, 2].astype(np.int32)
    )
    padded = np.pad(lab, 1, mode="edge")
    h, w = lab.shape
    S = np.stack(
        [padded[y : y + h, x : x + w] for y in range(3) for x in range(3)],
        axis=-1,
    )
    center = S[:, :, 0]
    center_c = (S == center[:, :, None]).sum(axis=-1)
    best = center.copy()
    best_c = np.ones((h, w), dtype=np.int32)
    for k in range(1, 9):
        cand = S[:, :, k]
        c = (S == cand[:, :, None]).sum(axis=-1)
        better = c > best_c
        best = np.where(better, cand, best)
        best_c = np.where(better, c, best_c)
    keep = (best == center) | (center_c > max_center_count)
    if min_votes:
        keep = keep | (best_c < min_votes)
    best = np.where(keep, center, best)
    out = arr.copy()
    out[:, :, 0] = (best // 65536).astype(np.uint8)
    out[:, :, 1] = ((best // 256) % 256).astype(np.uint8)
    out[:, :, 2] = (best % 256).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _srgb_to_oklab(rgb):
    """rgb: (...,3) float64 0..1 sRGB -> OKLab float64."""
    import numpy as np

    a = np.clip(rgb, 0.0, 1.0)
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return np.stack([L, A, B], axis=-1)


def _oklab_to_srgb(lab):
    """lab: (...,3) OKLab -> sRGB float64 0..1."""
    import numpy as np

    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    lin = np.stack([r, g, b], axis=-1)
    return np.where(
        lin <= 0.0031308, 12.92 * lin, 1.055 * np.clip(lin, 0, None) ** (1 / 2.4) - 0.055
    )


def _oklab_kmeans_rgba(im, k, seed=7):
    """Quantize RGB to k colors via k-means++ seeding + Lloyd iterations in
    OKLab (alpha untouched). Research lead (f): replaces the 64-level/channel
    posterization with a perceptually-uniform palette snap."""
    import numpy as np

    arr = np.asarray(im).astype(np.float64)
    rgb = arr[:, :, :3]
    h, w = rgb.shape[:2]
    lab = _srgb_to_oklab(rgb / 255.0)
    px = lab.reshape(-1, 3)
    n = px.shape[0]
    rng = np.random.default_rng(seed)
    sub = px[rng.choice(n, min(n, 40000), replace=False)]
    centers = [sub[rng.integers(len(sub))]]
    C = np.array(centers)
    for _ in range(1, k):
        d2 = ((sub[:, None, :] - C[None, :, :]) ** 2).sum(-1).min(-1)
        tot = d2.sum()
        if tot <= 0:
            break
        centers.append(sub[rng.choice(len(sub), p=d2 / tot)])
        C = np.array(centers)
    k = len(centers)
    centers = C
    for _ in range(12):
        d2 = ((sub[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lbl = d2.argmin(-1)
        new = np.array(
            [sub[lbl == i].mean(0) if (lbl == i).any() else centers[i] for i in range(k)]
        )
        if np.allclose(new, centers, atol=1e-6):
            break
        centers = new
    d2 = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    labels = d2.argmin(-1)
    srgb_centers = np.clip(_oklab_to_srgb(centers), 0.0, 1.0) * 255.0
    out = arr.copy()
    out[:, :, :3] = srgb_centers[labels].reshape(h, w, 3)
    return Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8), "RGBA")


def _posterize_rgba(im, levels):
    """Snap each RGB channel to `levels` evenly spaced values (alpha untouched).

    Mirrors a candidate lib/image/posterize.ts step: v -> round(v*(L-1)/255)*255/(L-1),
    rounded to the nearest integer (round-half-to-even via numpy rint).
    """
    import numpy as np

    arr = np.asarray(im).astype(np.float64)
    rgb = arr[:, :, :3]
    q = np.rint(rgb * (levels - 1) / 255.0) * 255.0 / (levels - 1)
    arr[:, :, :3] = np.clip(q, 0, 255)
    return Image.fromarray(np.round(arr).astype(np.uint8), "RGBA")


def _palette_snap_rgba(im, k):
    """Snap every pixel's RGB to the nearest of the top-k colors by pixel
    count (alpha untouched). Collapses posterized tint bands into a dominant
    palette before the tracer's exact-color clustering sees them."""
    import numpy as np

    arr = np.asarray(im)
    rgb = arr[:, :, :3].reshape(-1, 3)
    # Tie-break matches lib/image/paletteSnap.ts paletteSnapImageData 1:1:
    # the TS Map iterates colors in first-seen pixel order and its stable
    # sort keeps that order on equal counts, so order by (-count,
    # first-seen index). (np.argsort's default quicksort has arbitrary
    # tie order and diverged on e.g. diagonal_text's 16th palette slot.)
    colors, first_idx, counts = np.unique(
        rgb, axis=0, return_index=True, return_counts=True)
    if len(colors) <= k:
        return im
    order = sorted(range(len(colors)),
                   key=lambda i: (-int(counts[i]), int(first_idx[i])))
    pal = colors[order[:k]]
    # NB: int32 arithmetic. An earlier revision used int16 here, which
    # overflows for squared channel diffs above 181 (wraps negative and
    # corrupts the nearest-palette choice). Always keep this int32.
    rgb_i = rgb[:, None, :].astype(np.int32)
    pal_i = pal[None, :, :].astype(np.int32)
    d2 = ((rgb_i - pal_i) ** 2).sum(-1)
    nearest = d2.argmin(1)
    out = arr.copy()
    out[:, :, :3] = pal[nearest].reshape(arr.shape[0], arr.shape[1], 3).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _palette_merge_rgba(im, max_delta, max_bright=None):
    """Consolidate near-identical opaque colors into their count-weighted
    mean (rounded). Greedy in count-descending order (ties broken by RGB
    key ascending, mirroring _top_opaque_palette): each color joins the
    first existing group whose ANCHOR (the dominant color that started
    the group, never moved) is within max_delta on every channel. The
    anchor bound means every member sits within max_delta of the anchor,
    so the merged mean shifts any pixel by at most 2 * max_delta, which
    at the shipped 12 equals the scoring tolerance exactly. Alpha
    untouched; non-opaque pixels keep their RGB. When max_bright is set,
    only colors with max(R,G,B) <= max_bright participate (dark-only
    merge probe for photographic grain: consolidates dark noise
    splinters without flattening bright gradation the tracer reproduces
    faithfully). Harness experiment helper for the palmerge PREP_MODE;
    the shipped version lives in lib/image/paletteMerge.ts and mirrors
    this 1:1. Fewer near-duplicate colors means fewer stacked binary
    layers and fewer ~1px boundary errors in binary-layer tracing."""
    import numpy as np
    from PIL import Image

    arr = np.asarray(im)
    opaque = arr[:, :, 3] == 255
    flat = arr[:, :, :3][opaque].reshape(-1, 3)
    colors, counts = np.unique(flat, axis=0, return_counts=True)
    if max_bright is not None:
        dark = colors.max(axis=1) <= max_bright
    else:
        dark = np.ones(len(colors), dtype=bool)
    part = np.nonzero(dark)[0]
    if len(part) <= 1:
        return im
    pcolors = colors[part]
    pcounts = counts[part]
    ckeys = (
        pcolors[:, 0].astype(np.int64) * 65536
        + pcolors[:, 1].astype(np.int64) * 256
        + pcolors[:, 2].astype(np.int64)
    )
    order = sorted(
        range(len(pcolors)), key=lambda i: (-int(pcounts[i]), int(ckeys[i])))
    pcolors = pcolors[order]
    pcounts = pcounts[order].astype(np.float64)
    # Grid bucketing so the greedy scan stays linear: cell size D+1 means
    # any two colors within max_delta on every channel share a cell or a
    # neighboring one, so only the 27 neighboring cells are searched.
    # Anchors never move, so buckets are written once and never updated.
    cell = max_delta + 1
    buckets = {}  # (cx, cy, cz) -> list of group indices anchored inside
    anchors = []  # group anchor rgb (float), fixed at creation
    sum_rgb = []  # count-weighted rgb sum per group
    sum_w = []  # total weight per group
    assign = np.empty(len(pcolors), dtype=np.int64)
    for i, c in enumerate(pcolors):
        cf = c.astype(float)
        cx, cy, cz = int(c[0] // cell), int(c[1] // cell), int(c[2] // cell)
        placed = -1
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for g in buckets.get((cx + dx, cy + dy, cz + dz), ()):
                        if np.abs(cf - anchors[g]).max() <= max_delta:
                            placed = g
                            break
                    if placed >= 0:
                        break
                if placed >= 0:
                    break
            if placed >= 0:
                break
        if placed < 0:
            g = len(anchors)
            anchors.append(cf)
            sum_rgb.append(cf * pcounts[i])
            sum_w.append(float(pcounts[i]))
            buckets.setdefault((cx, cy, cz), []).append(g)
            assign[i] = g
        else:
            sum_rgb[placed] += cf * pcounts[i]
            sum_w[placed] += pcounts[i]
            assign[i] = placed
    merged = np.rint(
        np.array([s / w for s, w in zip(sum_rgb, sum_w)])).astype(np.uint8)
    # Colors that did not participate keep their original color; the
    # original index of each participating color is recovered through the
    # count-descending order permutation.
    porder = part[order]
    merged_full = colors.copy()
    for sub, orig in enumerate(porder):
        merged_full[orig] = merged[assign[sub]]
    okeys = (
        colors[:, 0].astype(np.int64) * 65536
        + colors[:, 1].astype(np.int64) * 256
        + colors[:, 2].astype(np.int64)
    )
    keys = (
        flat[:, 0].astype(np.int64) * 65536
        + flat[:, 1].astype(np.int64) * 256
        + flat[:, 2].astype(np.int64)
    )
    sidx = np.argsort(okeys)
    idx = sidx[np.searchsorted(okeys[sidx], keys)]
    m = merged_full[idx]
    out = arr.copy()
    out[opaque, 0] = m[:, 0]
    out[opaque, 1] = m[:, 1]
    out[opaque, 2] = m[:, 2]
    return Image.fromarray(out, "RGBA")


def _composite_alpha_rgba(im):
    """Composite partial-alpha pixels over white; fully transparent pixels
    stay transparent so background keying still works. Alpha ends binary.

    Ungated experiment helper (see PREP_MODE composite/composite2).
    """
    import numpy as np

    arr = np.asarray(im).astype(np.float64)
    a = arr[:, :, 3:4] / 255.0
    comp = arr[:, :, :3] * a + 255.0 * (1.0 - a)
    out = np.empty_like(arr)
    out[:, :, :3] = np.rint(comp)
    out[:, :, 3] = np.where(arr[:, :, 3] == 0, 0, 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def _gated_composite_alpha_rgba(im):
    """Gated alpha compositing. Mirrors lib/image/alphaComposite.ts exactly:
    composite partial-alpha pixels over white only when more than 1% of
    pixels are partially transparent; fully transparent pixels stay
    transparent for background keying.
    """
    import numpy as np

    arr = np.asarray(im).astype(np.float64)
    alpha = arr[:, :, 3]
    if ((alpha > 0) & (alpha < 255)).mean() <= 0.01:
        return im.copy()
    a = arr[:, :, 3:4] / 255.0
    comp = arr[:, :, :3] * a + 255.0 * (1.0 - a)
    out = np.empty_like(arr)
    out[:, :, :3] = np.rint(comp)
    out[:, :, 3] = np.where(alpha == 0, 0, 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def prepare(png_path):
    """Downscale like the app and return (w, h, rgba_path, size_path, reference_rgb)."""
    from PIL import Image

    im = Image.open(png_path).convert("RGBA")
    if max(im.size) > 1000:
        r = 1000.0 / max(im.size)
        im = im.resize((round(im.width * r), round(im.height * r)), Image.BILINEAR)
    w, h = im.size
    # Reference for scoring: the ORIGINAL resized image (flattened over white),
    # not the preprocessed one. The metric must measure end-to-end fidelity
    # (what the user sees), so preprocessing damage counts against the score.
    # The tracer still receives the preprocessed pixels, exactly like the app.
    orig_im = im
    # Default mirrors the app's lib/image/decode.ts pipeline exactly:
    # 5x5 median, then adaptive edge restoration (unsharp mask only when
    # the median changed >= 0.05% of pixels by > 8 in any channel; a
    # gentler 20% mask when the noise proxy reaches 5%). Ordered-dithered
    # inputs pass through unmodified, thin-structure inputs (<=8 colors,
    # median would rewrite >= 5%) skip the median and edge restore, and
    # noisy photographic inputs (>= 50000 colors, median would rewrite >=
    # 25%) also skip the median and edge restore. Posterization follows:
    # color continua from chaining into a single average-color cluster),
    # then an adaptive 3x3 majority vote on the posterized label map
    # (kept only when it changes < 10% of pixels; cleans ragged region
    # edges on flat art, skipped on complex content), then gated alpha
    # compositing over white (only when > 5% of pixels are partially
    # transparent; fully transparent pixels stay transparent for
    # background keying).
    # PREP_MODE overrides for experiments: none, median3, median5,
    # sharp:r<p>p<q>t<t>, adaptmix:<weak_percent>:<split>,
    # adaptive:sigma,percent,threshold, posterize:<levels>[:<min_unique>],
    # selblur:<radius>:<delta> (selective blur replaces median5 in the
    # adaptive pipeline).
    prep = os.environ.get("PREP_MODE", "adaptive")
    if prep == "adaptive":
        post = _posterize_rgba(_adaptive_prep(im), 64)
        voted = _majority_vote_rgba(post)
        import numpy as np

        a = np.asarray(post).astype(int)
        b = np.asarray(voted).astype(int)
        frac = (np.abs(a - b).max(axis=2) > 0).mean()
        chosen = voted if frac < 0.1 else post
        if frac < 0.1:
            # Mirrors lib/image/majorityVote.ts: revert vote moves larger
            # than MAJORITY_VOTE_MAX_COLOR_SHIFT (24) per pixel.
            moved = (np.abs(a - b).max(axis=2) > 24)
            mix = np.asarray(post).copy()
            mix[~moved] = np.asarray(voted)[~moved]
            chosen = Image.fromarray(mix.astype("uint8"), "RGBA")
        comp = _gated_composite_alpha_rgba(chosen)
        # Mirrors lib/image/paletteSnap.ts tiered gate: tier 1 (n<=8 ->
        # snap to n, the identity), tier 2 (n>8, top8>=90% -> snap to 8),
        # tier 3 (n>8, top16>=40% -> snap to 16); otherwise unchanged.
        arr = np.asarray(comp)
        opaque = arr[:, :, 3] == 255
        flat = arr[:, :, :3][opaque].reshape(-1, 3)
        colors, counts = np.unique(flat, axis=0, return_counts=True)
        srt = np.sort(counts)[::-1]
        total = counts.sum()
        top2 = srt[:2].sum() / total if len(srt) >= 2 else 1.0
        top8 = srt[:8].sum() / total
        top16 = srt[:16].sum() / total
        n = len(colors)
        k = None
        if n <= 8:
            k = n
        elif top8 >= 0.90:
            k = 8
        elif top16 >= 0.40:
            k = 16
        im_prep = _palette_snap_rgba(comp, k) if k else comp
    elif prep.startswith("palmerge:"):
        # palmerge:<D>: shipped adaptive pipeline (gates, posterize,
        # majority vote, gated alpha composite, tiered palette snap),
        # then consolidate near-identical opaque colors whose worst
        # channel differs by at most D into their count-weighted mean.
        # Candidate for lib/image/paletteMerge.ts after the palette snap:
        # fewer near-duplicate colors means fewer stacked binary layers
        # and fewer ~1px boundary errors in binary-layer tracing.
        import numpy as np

        D = int(prep.split(":")[1])
        post = _posterize_rgba(_adaptive_prep(im), 64)
        voted = _majority_vote_rgba(post)
        a = np.asarray(post).astype(int)
        b = np.asarray(voted).astype(int)
        frac = (np.abs(a - b).max(axis=2) > 0).mean()
        chosen = voted if frac < 0.1 else post
        comp = _gated_composite_alpha_rgba(chosen)
        arr = np.asarray(comp)
        opaque = arr[:, :, 3] == 255
        flat = arr[:, :, :3][opaque].reshape(-1, 3)
        colors, counts = np.unique(flat, axis=0, return_counts=True)
        srt = np.sort(counts)[::-1]
        total = counts.sum()
        top8 = srt[:8].sum() / total
        top16 = srt[:16].sum() / total
        n = len(colors)
        k = None
        if n <= 8:
            k = n
        elif top8 >= 0.90:
            k = 8
        elif top16 >= 0.40:
            k = 16
        snapped = _palette_snap_rgba(comp, k) if k else comp
        im_prep = _palette_merge_rgba(snapped, D)
    elif prep == "composite":
        # Experiment: adaptive pipeline + posterize, then composite
        # partial-alpha pixels over white (fully transparent stay
        # transparent for keying). Candidate for lib/image/alphaComposite.ts.
        im_prep = _composite_alpha_rgba(_posterize_rgba(_adaptive_prep(im), 64))
    elif prep == "composite2":
        # Experiment 2: composite BEFORE posterize so the blended edge
        # tints snap to 64 discrete levels and chain into clusters.
        im_prep = _posterize_rgba(_composite_alpha_rgba(_adaptive_prep(im)), 64)
    elif prep == "composite3":
        # Experiment 3 (gated): composite only when translucency is a
        # significant feature (partial-alpha fraction > 5%). Thin
        # downscale fringes on near-opaque images cluster worse as tint
        # bands, so those keep the binary-alpha snap path.
        import numpy as np

        im_prep = _posterize_rgba(_adaptive_prep(im), 64)
        a = np.asarray(im_prep)[:, :, 3]
        if ((a > 0) & (a < 255)).mean() > 0.05:
            im_prep = _composite_alpha_rgba(im_prep)
    elif prep.startswith("posterize:"):
        # posterize:<levels>[:<min_unique>], e.g. posterize:32 or
        # posterize:16:60000: default adaptive pipeline followed by
        # per-channel posterization to `levels` levels, applied only when
        # the image has at least <min_unique> unique RGB colors. Omit
        # <min_unique> to always posterize.
        parts = prep.split(":")
        levels = int(parts[1])
        min_unique = int(parts[2]) if len(parts) > 2 else 0
        im_prep = _adaptive_prep(im)
        if min_unique:
            import numpy as np

            rgb = np.asarray(im_prep.convert("RGB")).reshape(-1, 3)
            if np.unique(rgb, axis=0).shape[0] < min_unique:
                pass
            else:
                im_prep = _posterize_rgba(im_prep, levels)
        else:
            im_prep = _posterize_rgba(im_prep, levels)
    elif prep.startswith("oklabkm:"):
        # oklabkm:<k>: research lead (f): OKLab k-means++ quantization with
        # k colors replacing the 64-level/channel posterization in the
        # shipped adaptive pipeline (median, unsharp, adaptive majority
        # vote, gated alpha composite).
        import numpy as np

        k = int(prep.split(":")[1])
        km = _oklab_kmeans_rgba(_adaptive_prep(im), k)
        voted = _majority_vote_rgba(km)
        a = np.asarray(km).astype(int)
        b = np.asarray(voted).astype(int)
        frac = (np.abs(a - b).max(axis=2) > 0).mean()
        chosen = voted if frac < 0.1 else km
        im_prep = _gated_composite_alpha_rgba(chosen)
    elif prep.startswith("snapgate:"):
        # snapgate:<k>:<min_topk>: top-k palette snap applied ONLY when the
        # image has more than k unique opaque colors AND the top-k colors
        # cover at least min_topk of opaque pixels (flat art with AA
        # fringes, e.g. diagonal_text/goose_balloon/text_logo); otherwise
        # the default pipeline is kept unchanged (complex/photo/gradient
        # content the snap would damage, e.g. gradient/photo/wikipedia).
        import numpy as np

        parts = prep.split(":")
        k = int(parts[1])
        min_topk = float(parts[2])
        post = _posterize_rgba(_adaptive_prep(im), 64)
        voted = _majority_vote_rgba(post)
        a = np.asarray(post).astype(int)
        b = np.asarray(voted).astype(int)
        frac = (np.abs(a - b).max(axis=2) > 0).mean()
        chosen = voted if frac < 0.1 else post
        comp = _gated_composite_alpha_rgba(chosen)
        arr = np.asarray(comp)
        opaque = arr[:, :, 3] == 255
        flat = arr[:, :, :3][opaque].reshape(-1, 3)
        colors, counts = np.unique(flat, axis=0, return_counts=True)
        topk = np.sort(counts)[::-1][:k].sum() / counts.sum()
        if len(colors) > k and topk >= min_topk:
            im_prep = _palette_snap_rgba(comp, k)
        else:
            im_prep = comp
    elif prep == "none":
        im_prep = im
    elif prep.startswith("selblur"):
        # selblur:<radius>:<delta>, e.g. selblur:2:24: selective blur in
        # place of the 5x5 median inside the shipped adaptive pipeline,
        # then posterize + gated alpha composite like the default.
        parts = prep.split(":")
        radius, delta = int(parts[1]), int(parts[2])
        im_prep = _gated_composite_alpha_rgba(
            _posterize_rgba(_adaptive_prep_sel(im, radius, delta), 64)
        )
    elif prep.startswith("bilateral"):
        # bilateral:<d>:<sigma_color>:<sigma_space>, e.g. bilateral:5:30:1.5:
        # bilateral denoise in place of the 5x5 median inside the shipped
        # adaptive pipeline, then posterize + gated alpha composite.
        parts = prep.split(":")
        d, sc, ss = int(parts[1]), float(parts[2]), float(parts[3])
        im_prep = _gated_composite_alpha_rgba(
            _posterize_rgba(_adaptive_prep_bilateral(im, d, sc, ss), 64)
        )
    elif prep == "majvote" or prep.startswith("majvote:") or prep.startswith(
        "majvote_"
    ):
        # majvote[:<min_votes>[:<max_center_count>]]: majority-vote 3x3 on the
        # posterized label map after the shipped adaptive pipeline (cleans
        # ragged region edges, invents no colors). min_votes gates
        # replacement on winner strength; max_center_count restricts
        # replacement to isolated outlier pixels.
        # majvote_adaptive:<max_frac>: trial the vote; apply it only when it
        # changes fewer than max_frac of pixels (flat art), otherwise keep
        # the un-voted image (complex/photo content the vote would damage).
        if prep.startswith("majvote_adaptive"):
            max_frac = float(prep.split(":")[1])
            import numpy as np

            post = _posterize_rgba(_adaptive_prep(im), 64)
            voted = _majority_vote_rgba(post)
            a = np.asarray(post).astype(int)
            b = np.asarray(voted).astype(int)
            frac = (np.abs(a - b).max(axis=2) > 0).mean()
            chosen = voted if frac < max_frac else post
            im_prep = _gated_composite_alpha_rgba(chosen)
        else:
            args = prep.split(":")[1:]
            min_votes = int(args[0]) if len(args) > 0 else 0
            max_center = int(args[1]) if len(args) > 1 else 9
            im_prep = _gated_composite_alpha_rgba(
                _majority_vote_rgba(
                    _posterize_rgba(_adaptive_prep(im), 64), min_votes, max_center
                )
            )
    elif prep == "median3":
        im_prep = Image.fromarray(medianN_rgba(im, 3), "RGBA")
    elif prep.startswith("palettesnap:"):
        # palettesnap:<k>: standard adaptive pipeline (median, unsharp,
        # posterize 64, adaptive majority vote, gated alpha composite), then
        # snap every pixel's RGB to the nearest of the top-k colors by pixel
        # count. Tests whether collapsing posterized tint bands into a
        # dominant palette beats exact-color clustering of the bands.
        import numpy as np

        k = int(prep.split(":")[1])
        post = _posterize_rgba(_adaptive_prep(im), 64)
        voted = _majority_vote_rgba(post)
        a = np.asarray(post).astype(int)
        b = np.asarray(voted).astype(int)
        frac = (np.abs(a - b).max(axis=2) > 0).mean()
        chosen = voted if frac < 0.1 else post
        im_prep = _gated_composite_alpha_rgba(_palette_snap_rgba(chosen, k))
    elif prep.startswith("sharp:"):
        from PIL import ImageFilter
        import re as _re

        # sharp:r<radius>p<percent>t<threshold>, e.g. sharp:r2p60t3
        m = _re.match(r"sharp:r(\d+)p(\d+)t(\d+)", prep)
        radius, percent, threshold = (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (2, 60, 3)
        im5 = Image.fromarray(median5x5_rgba(im), "RGBA")
        im_prep = im5.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))
    elif prep.startswith("adaptmix:"):
        import numpy as np

        # adaptmix:<weak_percent>:<split> noise-adaptive sharpening strength:
        # percent 50 when noise proxy < split, weak_percent when >= split.
        parts = prep.split(":")
        weak, split = float(parts[1]), float(parts[2])
        im5 = Image.fromarray(median5x5_rgba(im), "RGBA")
        a = np.asarray(im).astype(int)
        b = np.asarray(im5).astype(int)
        chg = (np.abs(a - b).max(axis=2) > 8).mean()
        pct = weak if chg >= split else 50
        im_prep = unsharp_mask_rgba(im5, 2.0, pct, 3) if chg >= 0.0005 else im5
    elif prep.startswith("adaptive:"):
        import numpy as np

        # adaptive:sigma,percent,threshold e.g. adaptive:2.0,60,3
        sigma, percent, threshold = (float(x) for x in prep.split(":")[1].split(","))
        im5 = Image.fromarray(median5x5_rgba(im), "RGBA")
        a = np.asarray(im).astype(int)
        b = np.asarray(im5).astype(int)
        chg = (np.abs(a - b).max(axis=2) > 8).mean()
        im_prep = unsharp_mask_rgba(im5, sigma, percent, threshold) if chg >= 0.0005 else im5
    else:
        im_prep = Image.fromarray(median5x5_rgba(im), "RGBA")
    im = im_prep
    reference = Image.new("RGB", (w, h), (255, 255, 255))
    reference.paste(orig_im, mask=orig_im.split()[3])
    os.makedirs(WORK, exist_ok=True)
    stem = os.path.join(WORK, os.path.splitext(os.path.basename(png_path))[0])
    rgba_path = stem + ".rgba"
    size_path = stem + ".size"
    orig_rgba_path = stem + ".orig.rgba"
    with open(rgba_path, "wb") as f:
        f.write(im.tobytes())
    with open(size_path, "w") as f:
        f.write(f"{w} {h}")
    # Pre-prep original pixels for the color-path fill recolor (Rust needs
    # the original colors at each cluster's member pixels).
    with open(orig_rgba_path, "wb") as f:
        f.write(orig_im.tobytes())
    return w, h, rgba_path, size_path, reference, orig_rgba_path


def trace(w, h, rgba_path, size_path, options, out_path, orig_rgba_path=None):
    settings = json.dumps(options)
    argv = ["node", TRACE_JS, rgba_path, size_path, settings, out_path]
    if orig_rgba_path is not None:
        argv.append(orig_rgba_path)
    r = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=600,
    )
    if r.returncode != 0:
        raise RuntimeError(f"trace failed: {r.stderr[-2000:]}")
    with open(out_path) as f:
        return json.load(f)


def _parse_svg_paths(svg):
    """Yield (fill_rgb, [subpath, ...]) in document (paint) order.

    The Rust tracer emits paths with relative bezier data plus a translate,
    interleaved across colors in true paint order. This mirrors exactly what
    the user downloads.
    """
    out = []
    for m in re.finditer(
        r'<path\s+fill="(#[0-9A-Fa-f]{6})"\s+d="([^"]*)"(?:\s+transform="translate\(([^,]+),\s*([^)]+)\)")?',
        svg,
    ):
        fill, d, tx, ty = m.group(1), m.group(2), m.group(3), m.group(4)
        rgb = (int(fill[1:3], 16), int(fill[3:5], 16), int(fill[5:7], 16))
        ox, oy = (float(tx), float(ty)) if tx is not None else (0.0, 0.0)
        tokens = re.findall(r"[MCZL]|[-+]?(?:\d+\.?\d*|\.\d+)", d)
        subpaths = []
        cur = None
        i = 0
        while i < len(tokens):
            t = tokens[i]
            i += 1
            if t == "M":
                if cur:
                    subpaths.append(cur)
                cur = [(float(tokens[i]) + ox, float(tokens[i + 1]) + oy)]
                i += 2
            elif t == "L":
                cur.append((float(tokens[i]) + ox, float(tokens[i + 1]) + oy))
                i += 2
            elif t == "C":
                x1, y1 = float(tokens[i]) + ox, float(tokens[i + 1]) + oy
                x2, y2 = float(tokens[i + 2]) + ox, float(tokens[i + 3]) + oy
                x3, y3 = float(tokens[i + 4]) + ox, float(tokens[i + 5]) + oy
                i += 6
                p0x, p0y = cur[-1]
                for s in range(1, 13):
                    u = s / 12.0
                    v = 1.0 - u
                    cur.append(
                        (
                            v**3 * p0x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u**3 * x3,
                            v**3 * p0y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u**3 * y3,
                        )
                    )
            elif t == "Z":
                if cur:
                    subpaths.append(cur)
                    cur = None
        if cur:
            subpaths.append(cur)
        out.append((rgb, [[(round(x), round(y)) for x, y in sp] for sp in subpaths if len(sp) >= 3]))
    return out


def _inset_ring(pts, d=0.5):
    """Inset a polygon ring by `d` units toward its own interior.

    Models how browsers rasterize SVG paths: a path along pixel corners
    (10,10)-(20,20) paints pixels 10..19, while PIL's ImageDraw.polygon
    fills pixels 10..19 plus every pixel whose square the path merely
    touches (paints 10..20). Offsetting every edge inward by 0.25 before PIL
    fill reproduces browser coverage exactly on integer-corner polygons:
    0.25 pulls edges just off the integer boundary (so merely-touched
    boundary pixels are excluded) without collapsing 1px-thin features the
    way a 0.5 inset did. Reflex (270-degree) vertices, which dominate
    stair-step walks, are beveled instead of intersected.
    Falls back to the original ring when the inset would collapse it
    (degenerate input) or spike.
    """
    import numpy as np

    p = np.asarray(pts, dtype=float)
    n = len(p)
    if n < 3:
        return pts
    area2 = np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if abs(area2) < 1e-9:
        return pts
    ccw = area2 > 0
    orig_area = abs(area2) / 2.0
    q = np.roll(p, -1, axis=0)  # edge i runs p[i] -> q[i]
    e = q - p
    L = np.hypot(e[:, 0], e[:, 1])
    ok = L > 1e-9
    nrm = np.zeros_like(p)
    nrm[ok, 0] = -e[ok, 1] / L[ok]
    nrm[ok, 1] = e[ok, 0] / L[ok]
    if not ccw:
        nrm = -nrm
    a = p + d * nrm  # offset edge starts
    b = q + d * nrm  # offset edge ends
    out = []
    for i in range(n):
        ip = (i - 1) % n
        if not ok[ip] or not ok[i]:
            out.append(tuple(p[i]))
            continue
        cross = e[ip, 0] * e[i, 1] - e[ip, 1] * e[i, 0]
        convex = (cross > 0) == ccw
        if convex:
            det = -(e[ip, 0] * e[i, 1] - e[i, 0] * e[ip, 1])
            rhs = a[i] - a[ip]
            if abs(det) < 1e-12:
                pt = (b[ip] + a[i]) / 2.0
            else:
                t = (rhs[0] * (-e[i, 1]) - (-e[i, 0]) * rhs[1]) / det
                pt = a[ip] + t * e[ip]
            if float(np.hypot(pt[0] - p[i, 0], pt[1] - p[i, 1])) > 5.0:
                pt = p[i]
            out.append((float(pt[0]), float(pt[1])))
        else:
            # Reflex vertex: bevel between the two offset edges.
            out.append((float(b[ip, 0]), float(b[ip, 1])))
            out.append((float(a[i, 0]), float(a[i, 1])))
    if len(out) < 3:
        return pts
    o = np.asarray(out)
    new_area = abs(
        np.sum(o[:, 0] * np.roll(o[:, 1], -1) - np.roll(o[:, 0], -1) * o[:, 1])
    ) / 2.0
    if new_area < 0.25 * orig_area:
        return pts
    return out


def _point_in_polygon(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def rasterize(trace_data, w, h):
    """Paint the Rust SVG's paths in document order (true paint order).

    Each ring is inset toward its interior before PIL fill so the
    rasterization matches browser coverage (a path on pixel corners
    (10,10)-(20,20) paints pixels 10..19; raw PIL fill would paint 10..20).
    The inset is 0.25: PIL paints pixels the ring touches, and 0.25 pulls
    edges just off the integer boundary without collapsing thin (1px)
    features, reproducing exact browser coverage on integer-corner polygons
    (validated on all 36 rect sizes 1x1..6x6 plus staircase/L/notch shapes;
    the old 0.5 collapsed thin features and its fallback over-painted them).
    INSET_D env override is a harness-tuning knob only (default 0.25).
    """
    import os

    inset_d = float(os.environ.get("INSET_D", "0.25"))
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    for rgb, subpaths in _parse_svg_paths(trace_data["svg"]):
        if not subpaths:
            continue
        subpaths = [_inset_ring(sp, inset_d) for sp in subpaths]
        # A subpath nested inside an odd number of other subpaths is a hole.
        depths = []
        for s in subpaths:
            x0, y0 = s[0]
            depth = sum(
                1 for o in subpaths if o is not s and _point_in_polygon(x0, y0, o)
            )
            depths.append(depth)
        order = sorted(range(len(subpaths)), key=lambda k: depths[k])
        mask = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(mask)
        for k in order:
            d.polygon(subpaths[k], fill=0 if depths[k] % 2 else 255)
        canvas.paste(rgb, (0, 0), mask)
    return canvas


def score(rendered, reference):
    diff = ImageChops.difference(rendered, reference)
    bands = diff.split()
    maxdiff = ImageChops.lighter(ImageChops.lighter(bands[0], bands[1]), bands[2])
    hist = maxdiff.histogram()
    total = sum(hist)
    matching = sum(hist[: TOLERANCE + 1])
    mae = sum(i * n for i, n in enumerate(hist)) / total / 255.0
    return matching / total, mae


def score_exact(rendered, reference):
    """Exact metrics (Claude feedback item 4): % pixels exactly equal (RGBA),
    mean absolute error, max error, PSNR. For honest measurement."""
    import math
    import numpy as np

    r_arr = np.array(rendered)
    ref_arr = np.array(reference)

    # Exact match: all channels (including alpha) equal
    if r_arr.shape != ref_arr.shape:
        return 0.0, 1.0, 255, 0.0

    exact = np.all(r_arr == ref_arr, axis=-1)
    exact_pct = np.mean(exact)

    # Per-pixel max channel difference
    diff = np.abs(r_arr.astype(np.int16) - ref_arr.astype(np.int16))
    max_diff = np.max(diff, axis=-1)
    mae = np.mean(max_diff) / 255.0
    max_err = int(np.max(max_diff))

    # PSNR (on RGB, ignoring alpha for simplicity)
    mse = np.mean((r_arr[..., :3].astype(np.float32) - ref_arr[..., :3].astype(np.float32)) ** 2)
    psnr = 20 * math.log10(255.0 / math.sqrt(mse)) if mse > 0 else float('inf')

    return exact_pct, mae, max_err, psnr


def _top_opaque_palette(arr, k):
    """Top-k opaque colors by count (count desc, rgb key asc on ties).

    Mirrors lib/vectorize/binaryLayers.ts topOpaquePalette 1:1.
    """
    import numpy as np

    opaque = arr[:, :, 3] == 255
    flat = arr[:, :, :3][opaque].reshape(-1, 3)
    colors, counts = np.unique(flat, axis=0, return_counts=True)
    keys = (colors[:, 0].astype(np.int64) * 65536
            + colors[:, 1].astype(np.int64) * 256
            + colors[:, 2].astype(np.int64))
    order = sorted(range(len(colors)), key=lambda i: (-int(counts[i]), int(keys[i])))
    return [tuple(int(v) for v in colors[i]) for i in order[:k]]


def _recolor_binary_fills(orig_arr, palette, ranks, top_n=16):
    """Re-pick each binary layer's fill from the ORIGINAL (pre-prep)
    colors at its rank pixels. Mirrors
    lib/vectorize/binaryLayers.ts recolorPaletteFills 1:1 (v1.0.26).

    Originals are composited over white exactly like the metric's
    reference (opaque: raw; transparent: white; else round-half-up, the
    JS Math.round behavior). Flat-region guard: when one exact original
    color holds >= 50% of a layer's members (min 16 pixels) it is the
    true fill and is used directly, bypassing the coverage vote that
    could otherwise elect a fringe blend. Otherwise candidates: the
    current palette color first, then the top-`top_n` most frequent
    exact original colors (count desc, rgb key asc); best within-24
    worst-channel coverage wins, ties keep the current fill (first max
    wins via argmax).

    RECOLOR_TOP_N env overrides top_n for probes only (mirror default
    tracks the shipped RECOLOR_TOP_CANDIDATES).
    """
    import numpy as np
    import os
    top_n = int(os.environ.get("RECOLOR_TOP_N", str(top_n)))

    h, w = ranks.shape
    n = h * w
    orig = _composite_originals(orig_arr)
    flat_ranks = ranks.reshape(n)
    keys = (orig[:, 0].astype(np.int64) * 65536
            + orig[:, 1].astype(np.int64) * 256
            + orig[:, 2].astype(np.int64))
    fills = []
    for r, current in enumerate(palette):
        members = np.nonzero(flat_ranks == r)[0]
        if len(members) == 0:
            fills.append(current)
            continue
        ucolors, ucounts = np.unique(keys[members], return_counts=True)
        order = sorted(range(len(ucolors)),
                       key=lambda i: (-int(ucounts[i]), int(ucolors[i])))
        # Flat-region guard, mirrors the TS mode-dominance check 1:1.
        mode_i = order[0]
        mode_count = int(ucounts[mode_i])
        if len(members) >= 16 and mode_count / len(members) >= 0.5:
            k = int(ucolors[mode_i])
            fills.append(((k >> 16) & 255, (k >> 8) & 255, k & 255))
            continue
        current_key = current[0] * 65536 + current[1] * 256 + current[2]
        candidates = [current]
        for i in order[:top_n]:
            k = int(ucolors[i])
            if k != current_key:
                candidates.append(((k >> 16) & 255, (k >> 8) & 255, k & 255))
        mcols = orig[members].astype(np.int16)
        cand = np.array(candidates, dtype=np.int16)
        worst = np.abs(mcols[:, None, :] - cand[None, :, :]).max(axis=2)
        covered = (worst <= 24).sum(axis=0)
        best = candidates[int(covered.argmax())]
        fills.append((int(best[0]), int(best[1]), int(best[2])))
    return fills


def _composite_originals(orig_rgba_arr):
    """Original (pre-prep) colors composited over white, exactly like the
    metric's reference: opaque keeps raw RGB, fully transparent becomes
    white, semi-transparent blends with round-half-up (JS Math.round).
    Returns an (h*w, 3) uint8 array. Shared by _recolor_binary_fills and
    _split_soup_ranks so the two agree on the color source."""
    import numpy as np

    h, w = orig_rgba_arr.shape[:2]
    n = h * w
    a = orig_rgba_arr[:, :, 3].astype(np.float64)
    rgb = orig_rgba_arr[:, :, :3].astype(np.float64)
    af = a / 255.0
    inv = 1.0 - af
    comp = rgb * af[..., None] + 255.0 * inv[..., None]
    orig = np.where((a == 255)[..., None], rgb,
                    np.where((a == 0)[..., None], 255.0,
                             np.floor(comp + 0.5)))
    return orig.reshape(n, 3).astype(np.uint8)


# v1.0.32: sub-ball candidate pool for soup-rank splitting. Wider than the
# recolor's top-16 because leftovers are a small, diverse pixel set.
SPLIT_TOP_CANDIDATES = 64
# A sub-layer must cover at least this many pixels to earn its own traced
# layer; mirrors RECOLOR_FLAT_MIN_PIXELS.
SPLIT_MIN_PIXELS = 16


def _split_soup_ranks(orig_rgba_arr, ranks, fills):
    """Split heterogeneous ("soup") binary ranks into sub-layers.

    A rank's shipped fill is one color, but prep quantization can group a
    whole anti-aliased blend ramp under one rank (the rank is measured on
    original colors against the prepped palette). The single fill then
    misses the ramp pixels no 24-ball can cover together. For each rank,
    pixels farther than the scoring tolerance from the shipped fill are
    greedily carved into 24-radius balls (set-cover greedy on the honest
    hit criterion); each ball of >= SPLIT_MIN_PIXELS pixels becomes its
    own sub-layer with its own fill, painted right after its parent rank.

    Self-gating: a rank whose shipped fill already covers every member
    within tolerance produces no balls, so 1.0 images are byte-identical.
    Returns (new_ranks, new_fills) with reindexed integer ranks preserving
    the nested paint order. Mirrors lib/vectorize/binaryLayers.ts
    splitSoupRanks 1:1 (shipped v1.0.32).
    """
    import numpy as np

    n_ranks = len(fills)
    flat_ranks = ranks.reshape(-1)
    orig = _composite_originals(orig_rgba_arr)
    keys = (orig[:, 0].astype(np.int64) * 65536
            + orig[:, 1].astype(np.int64) * 256
            + orig[:, 2].astype(np.int64))
    orig_i16 = orig.astype(np.int16)

    balls = []  # per parent rank: list of (fill_tuple, pixel index array)
    for r in range(n_ranks):
        members = np.nonzero(flat_ranks == r)[0]
        rank_balls = []
        if len(members) > 0:
            fr = np.array(fills[r], dtype=np.int16)
            d0 = np.abs(orig_i16[members] - fr).max(axis=1)
            # Leftover: members the shipped fill cannot hit.
            remaining = np.nonzero(d0 > 24)[0]  # indices into members
            while len(remaining) >= SPLIT_MIN_PIXELS:
                mcols = orig_i16[members[remaining]]
                rkeys = keys[members[remaining]]
                ucolors, ucounts = np.unique(rkeys, return_counts=True)
                order = sorted(range(len(ucolors)),
                               key=lambda i: (-int(ucounts[i]), int(ucolors[i])))
                top = order[:SPLIT_TOP_CANDIDATES]
                cands = np.array(
                    [[(int(ucolors[i]) >> 16) & 255,
                      (int(ucolors[i]) >> 8) & 255,
                      int(ucolors[i]) & 255] for i in top],
                    dtype=np.int16)
                d = np.abs(mcols[:, None, :] - cands[None, :, :]).max(axis=2)
                covered = (d <= 24).sum(axis=0)
                best = int(covered.argmax())  # first max wins, like recolor
                if covered[best] < SPLIT_MIN_PIXELS:
                    break
                take_rel = remaining[d[:, best] <= 24]
                take = members[take_rel]
                rank_balls.append(
                    ((int(cands[best][0]), int(cands[best][1]),
                      int(cands[best][2])), take))
                remaining = remaining[d[:, best] > 24]
        balls.append(rank_balls)

    # Reindex: parent rank r keeps its slot, its balls follow immediately,
    # preserving the nested (ranks >= r) paint order.
    new_ranks = np.full(flat_ranks.shape, -1, dtype=np.int32)
    new_fills = []
    idx = 0
    for r in range(n_ranks):
        members = np.nonzero(flat_ranks == r)[0]
        in_ball = np.zeros(len(members), dtype=bool)
        for _, bpixels in balls[r]:
            in_ball[np.isin(members, bpixels)] = True
        parent_pixels = members[~in_ball]
        new_ranks[parent_pixels] = idx
        new_fills.append((int(fills[r][0]), int(fills[r][1]),
                          int(fills[r][2])))
        idx += 1
        for bfill, bpixels in balls[r]:
            new_ranks[bpixels] = idx
            new_fills.append(bfill)
            idx += 1
    return new_ranks.reshape(ranks.shape), new_fills


def _binary_ranks(rgba_arr, palette):
    """Per-pixel palette rank (0 = most common), mirroring
    lib/vectorize/binaryLayers.ts paletteRanks 1:1. Semi-transparent
    pixels are composited onto white and snapped to the nearest palette
    color so soft edges are traced instead of dropped.
    """
    import numpy as np

    h, w = rgba_arr.shape[:2]
    key_to_rank = {
        (c[0] * 65536 + c[1] * 256 + c[2]): i for i, c in enumerate(palette)
    }
    ranks = np.full((h, w), -1, dtype=np.int32)
    opaque = rgba_arr[:, :, 3] == 255
    ys, xs = np.nonzero(opaque)
    for y, x in zip(ys, xs):
        r, g, b = (int(v) for v in rgba_arr[y, x, :3])
        ranks[y, x] = key_to_rank.get(r * 65536 + g * 256 + b, -1)
    semi = (rgba_arr[:, :, 3] > 0) & (rgba_arr[:, :, 3] < 255)
    if semi.any() and palette:
        pal = np.array(palette, dtype=np.float32)
        arr_f = rgba_arr[:, :, :3].astype(np.float32)
        a = rgba_arr[:, :, 3:4].astype(np.float32) / 255.0
        comp = arr_f * a + 255.0 * (1.0 - a)
        sp = comp[semi]
        d = ((sp[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
        ranks[semi] = d.argmin(axis=1).astype(np.int32)
    return ranks


def _binary_ranks_on_originals(orig_rgba_arr, palette):
    """Per-pixel palette rank measured on the ORIGINAL (pre-prep) pixels
    composited over white, mirroring lib/vectorize/binaryLayers.ts
    paletteRanksOnOriginals 1:1 (shipped v1.0.30). Every pixel is snapped
    to its nearest palette color; fully transparent pixels composite to
    white and take the white rank.
    """
    import numpy as np

    h, w = orig_rgba_arr.shape[:2]
    ranks = np.full((h, w), -1, dtype=np.int32)
    if not palette:
        return ranks
    pal = np.array(palette, dtype=np.float32)
    arr_f = orig_rgba_arr[:, :, :3].astype(np.float32)
    a = orig_rgba_arr[:, :, 3:4].astype(np.float32) / 255.0
    comp = arr_f * a + 255.0 * (1.0 - a)
    d = ((comp.reshape(-1, 3)[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
    ranks = d.argmin(axis=1).reshape(h, w).astype(np.int32)
    return ranks


def trace_binary_layers(w, h, rgba_arr, tier, options, orig_rgba_arr=None):
    """Per-color nested binary-mask tracing, mirroring the app's
    lib/vectorize/binaryLayers.ts traceBinaryLayers 1:1. Returns a
    trace_data dict with a merged svg.
    """
    import numpy as np

    palette = _top_opaque_palette(rgba_arr, tier)
    # v1.0.30 production behavior: ranks are measured on the original
    # (pre-prep) pixels, mirroring paletteRanksOnOriginals; without the
    # original array (probe callers) the prepped ranks are used as-is.
    ranks = (_binary_ranks_on_originals(orig_rgba_arr, palette)
             if orig_rgba_arr is not None
             else _binary_ranks(rgba_arr, palette))
    bin_options = dict(options)
    bin_options["clusteringMode"] = "binary"
    # v1.0.21 production behavior: each binary layer's fill is re-picked
    # from the pre-prep original colors at its rank pixels. Mirrors
    # lib/vectorize/binaryLayers.ts recolorPaletteFills 1:1; without the
    # original array (probe callers) the prepped palette is used as-is.
    fills = (list(palette) if orig_rgba_arr is None
             else _recolor_binary_fills(orig_rgba_arr, palette, ranks))
    # v1.0.32: split heterogeneous ranks into sub-layers. Self-gating:
    # ranks the shipped fill already covers stay exactly as they were.
    if orig_rgba_arr is not None:
        ranks, fills = _split_soup_ranks(orig_rgba_arr, ranks, fills)
    svg_parts = []
    layers = 0
    node_count = 0
    path_count = 0
    for r in range(len(fills)):
        mask = (ranks >= r) & (ranks != -1)
        if not mask.any():
            continue
        binimg = np.full((h, w, 4), 255, dtype=np.uint8)
        binimg[mask] = (0, 0, 0, 255)
        stem = os.path.join(WORK, f"_bl_{r:02d}")
        with open(stem + ".rgba", "wb") as f:
            f.write(binimg.tobytes())
        with open(stem + ".size", "w") as f:
            f.write(f"{w} {h}")
        td = trace(w, h, stem + ".rgba", stem + ".size", bin_options,
                   stem + ".json")
        if not td["layers"]:
            continue
        hexcol = "#%02X%02X%02X" % fills[r]
        svg = td["svg"]
        svg = re.sub(r'fill="#[0-9A-Fa-f]{6}"', f'fill="{hexcol}"', svg)
        m = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S)
        svg_parts.append(m.group(1).strip() if m else svg)
        layers += len(td["layers"])
        node_count += td["metrics"]["nodeCount"]
        path_count += td["metrics"]["pathCount"]
    merged = (
        '<?xml version="1.0" encoding="UTF-8" ?>\n'
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" '
        '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'
        f'<svg width="{w}pt" height="{h}pt" viewBox="0 0 {w} {h}" '
        'version="1.1" xmlns="http://www.w3.org/2000/svg">\n'
        + "\n".join(svg_parts)
        + "\n</svg>\n"
    )
    return {
        "layers": [{"color": "#000000", "paths": []}] * layers,
        "svg": merged,
        "metrics": {"nodeCount": node_count, "pathCount": path_count},
    }


def _palette_tier_pre_snap(png_path, ret_comp=False):
    """Replicate prepare()'s pipeline and return
    (w, h, snapped_rgba_array, tier, reference), mirroring decode.ts:
    the tier is decided on the pre-snap composited image.
    ret_comp=True appends the unsnapped composited pixels (comp) as a 6th
    element (harness-only probe knob; existing callers unaffected).
    """
    from PIL import Image

    im = Image.open(png_path).convert("RGBA")
    if max(im.size) > 1000:
        r = 1000.0 / max(im.size)
        im = im.resize((round(im.width * r), round(im.height * r)),
                       Image.BILINEAR)
    w, h = im.size
    post = _posterize_rgba(_adaptive_prep(im), 64)
    voted = _majority_vote_rgba(post)
    import numpy as np

    a = np.asarray(post).astype(int)
    b = np.asarray(voted).astype(int)
    frac = (np.abs(a - b).max(axis=2) > 0).mean()
    chosen = voted if frac < 0.1 else post
    # Harness-only probe knob: PREP_MODE=novote skips the majority vote
    # entirely (probes the vote-damage hypothesis before app changes).
    pm = os.environ.get("PREP_MODE", "adaptive")
    if pm == "novote":
        chosen = post
    # Mirrors lib/image/majorityVote.ts adaptiveMajorityVote 1:1: when the
    # vote is kept, pixels it would move by more than
    # MAJORITY_VOTE_MAX_COLOR_SHIFT (20, shipped v1.0.28) in some channel
    # keep their pre-vote color. Harness-only probe knob:
    # PREP_MODE=votecond:<T> overrides the cap for experiments.
    cap = 20
    if pm.startswith("votecond:"):
        cap = int(pm.split(":")[1])
    if pm != "novote" and frac < 0.1:
        moved = (np.abs(a - b).max(axis=2) > cap)
        mix = np.asarray(post).copy()
        vb = np.asarray(voted)
        mix[~moved] = vb[~moved]
        from PIL import Image as _I
        chosen = _I.fromarray(mix.astype("uint8"), "RGBA")
    comp = _gated_composite_alpha_rgba(chosen)
    arr = np.asarray(comp)
    opaque = arr[:, :, 3] == 255
    flat = arr[:, :, :3][opaque].reshape(-1, 3)
    colors, counts = np.unique(flat, axis=0, return_counts=True)
    srt = np.sort(counts)[::-1]
    total = counts.sum()
    top2 = srt[:2].sum() / total if len(srt) >= 2 else 1.0
    top8 = srt[:8].sum() / total
    top16 = srt[:16].sum() / total
    n = len(colors)
    k = None
    if n <= 8:
        k = n
    elif top8 >= 0.90:
        k = 8
    elif top16 >= 0.40:
        k = 16
    # Damage check (mirrors lib/image/paletteSnap.ts
    # damageCheckedPaletteSnapTier): keep the tier only when the snap
    # preserves the image within the scoring tolerance. A lossy snap
    # (tier 3 on noisy illustrations) is dropped in favor of the
    # standard color-mode tracer on the unsnapped pixels.
    if k is not None:
        snapped_test = _palette_snap_rgba(comp, k)
        sa = np.asarray(snapped_test).astype(int)
        ca = np.asarray(comp).astype(int)
        preserved = (np.abs(sa[:, :, :3] - ca[:, :, :3]).max(axis=2) <= TOLERANCE).mean()
        if preserved < 0.99:
            k = None
    # Mirrors lib/image/paletteSnap.ts damageCheckedPaletteSnapTier: a
    # tier-8 pick that passes the damage check is upgraded to 16 (the 16
    # palette contains the top 8, so the finer snap preserves at least as
    # much; measured better on every suite image where 8 fires and
    # passes). Not applied when the tier-8 snap fails the check
    # (diagonal_text, luca_sunglasses): 16 binary layers measured worse
    # there than the no-snap color-mode path.
    if k == 8:
        k = 16
    # Mirrors lib/image/paletteSnap.ts damageCheckedPaletteSnapTier v1.0.29:
    # a tier-16 pick that passes the damage check is upgraded to 32 when
    # the top-32 opaque colors cover >= 90% of pixels (the 32 palette
    # contains the top 16, so the finer snap preserves at least as much).
    if k == 16:
        top32 = srt[:32].sum() / total
        if top32 >= 0.9:
            k = 32
    snapped = _palette_snap_rgba(comp, k) if k else comp
    # Gated palette merge (mirrors lib/image/paletteMerge.ts + decode.ts
    # 1:1, shipped as v1.0.10): after the tiered snap, consolidate
    # near-identical opaque colors (worst channel diff at most 12) into
    # their count-weighted mean, but only when the pre-snap composited
    # image is a grainy illustration with a concentrated palette (at
    # least 20000 distinct opaque colors and top-16 opaque coverage at
    # least 0.40, measured on the composited image).
    # Experiment knob (harness-only): PREP_MODE=palmerge:<D> forces an
    # ungated merge with delta D; palmergedark:<D>:<B> restricts merging
    # to colors with max(R,G,B) <= B; palmergeg:<D> forces the gated
    # merge with delta D; PREP_MODE=nomerge disables the merge entirely
    # (probes the pre-v1.0.10 path).
    pm = os.environ.get("PREP_MODE", "adaptive")
    if pm.startswith("palmergedark:"):
        # palmergedark:<D>:<B>: like palmerge:<D> but only colors with
        # max(R,G,B) <= B participate in the consolidation; brighter
        # colors pass through unchanged. Probe for photographic grain:
        # consolidate dark noise splinters without flattening the bright
        # gradation the tracer reproduces faithfully.
        _, D, B = pm.split(":")
        snapped = _palette_merge_rgba(snapped, int(D), max_bright=int(B))
    elif pm.startswith("palmerge:") and not pm.startswith("palmergeg:"):
        snapped = _palette_merge_rgba(snapped, int(pm.split(":")[1]))
    elif pm != "nomerge":
        D = int(pm.split(":")[1]) if pm.startswith("palmergeg:") else 12
        if n >= 20000 and top16 >= 0.40:
            snapped = _palette_merge_rgba(snapped, D)
    rgba = np.asarray(snapped)
    # End-to-end reference: the original resized image flattened over white.
    # (Binary-layers path; same rationale as prepare().)
    reference = Image.new("RGB", (w, h), (255, 255, 255))
    reference.paste(im, mask=im.split()[3])
    # Pre-prep original pixels for the color-path fill recolor (Rust needs
    # the original colors at each cluster's member pixels).
    stem = os.path.join(WORK, os.path.splitext(os.path.basename(png_path))[0])
    orig_rgba_path = stem + ".orig.rgba"
    os.makedirs(WORK, exist_ok=True)
    with open(orig_rgba_path, "wb") as f:
        f.write(im.tobytes())
    # Pre-prep original RGBA for the v1.0.21 binary-layer fill recolor
    # mirror (recolorPaletteFills works on the original colors).
    out = (w, h, rgba, k, reference, orig_rgba_path, np.asarray(im))
    if ret_comp:
        out = out + (np.asarray(comp),)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--settings", default="{}")
    ap.add_argument("--images", default="")
    args = ap.parse_args()

    options = dict(DEFAULT_OPTIONS)
    options.update(json.loads(args.settings))

    names = (
        [n.strip() for n in args.images.split(",") if n.strip()]
        if args.images
        else sorted(f for f in os.listdir(IMAGES) if f.lower().endswith(".png"))
    )
    if not names:
        print(json.dumps({"error": "no test images found"}))
        sys.exit(1)

    results = {}
    binary_layers = os.environ.get("BINARY_LAYERS", "") == "1"
    for name in names:
        png_path = os.path.join(IMAGES, name)
        if not os.path.isfile(png_path):
            results[name] = {"error": "missing file"}
            continue
        out_path = os.path.join(WORK, os.path.splitext(name)[0] + ".trace.json")
        try:
            if binary_layers:
                # Mirror the app's product path: decode.ts tier decision on
                # the pre-snap image, then per-color binary-layer tracing
                # when a tier fires and clusteringMode is color.
                import numpy as np

                w, h, rgba, tier, reference, orig_rgba_path, orig_arr = \
                    _palette_tier_pre_snap(png_path)
                if tier is not None and options.get("clusteringMode", "color") == "color":
                    trace_data = trace_binary_layers(w, h, rgba, tier, options,
                                                     orig_arr)
                else:
                    stem = os.path.join(WORK, os.path.splitext(name)[0])
                    with open(stem + ".rgba", "wb") as f:
                        f.write(rgba.tobytes())
                    with open(stem + ".size", "w") as f:
                        f.write(f"{w} {h}")
                    trace_data = trace(w, h, stem + ".rgba", stem + ".size",
                                       options, out_path, orig_rgba_path)
            else:
                w, h, rgba_path, size_path, reference, orig_rgba_path = prepare(png_path)
                trace_data = trace(w, h, rgba_path, size_path, options, out_path,
                                   orig_rgba_path)
            rendered = rasterize(trace_data, w, h)
            parity, mae = score(rendered, reference)
            results[name] = {
                "parity": round(parity, 4),
                "mae": round(mae, 4),
                "layers": len(trace_data["layers"]),
                "svg_bytes": len(trace_data.get("svg", "")),
                "traced_size": [w, h],
            }
        except Exception as e:  # keep the loop alive, record the failure
            results[name] = {"error": str(e)[:300]}

    ok = [r for r in results.values() if "parity" in r]
    summary = {
        "options": options,
        "score": round(sum(r["parity"] for r in ok) / len(ok), 4) if ok else 0.0,
        "images": results,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
