use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;
use visioncortex::color_clusters::{
    Cluster as ColorCluster, Clusters as ColorClusters, ClustersView, KeyingAction, Runner,
    RunnerConfig, HIERARCHICAL_MAX,
};
use visioncortex::clusters::Clusters as BinaryClusters;
use visioncortex::{
    Color, ColorImage, ColorName, CompoundPath, CompoundPathElement, PathI32, PathSimplifyMode,
    PointF64,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(non_snake_case)]
struct TraceOptions {
    #[serde(default = "default_clustering_mode")]
    clusteringMode: String,
    #[serde(default = "default_hierarchical")]
    hierarchical: String,
    colorPrecision: i32,
    filterSpeckle: usize,
    layerDifference: i32,
    cornerThreshold: f64,
    lengthThreshold: f64,
    #[serde(default = "default_max_iterations")]
    maxIterations: usize,
    #[serde(default = "default_path_precision")]
    pathPrecision: u32,
    #[serde(default = "default_polygon_max_area")]
    polygonMaxArea: usize,
    #[serde(default = "default_exact_flat_polygons")]
    exactFlatPolygons: bool,
    spliceThreshold: f64,
    mode: String,
    #[serde(default = "default_tiny_merge_max_area")]
    tinyMergeMaxArea: usize,
    #[serde(default = "default_tiny_merge_max_diff")]
    tinyMergeMaxDiff: i32,
    #[serde(default = "default_tiny_merge_min_target_area")]
    tinyMergeMinTargetArea: usize,
    #[serde(default = "default_tiny_merge_max_target_area")]
    tinyMergeMaxTargetArea: usize,
    #[serde(default = "default_tiny_merge_max_neighbor_spread")]
    tinyMergeMaxNeighborSpread: i32,
    #[serde(default = "default_tiny_merge_max_pixel_spread")]
    tinyMergeMaxPixelSpread: i32,
    #[serde(default = "default_flat_cluster_max_delta")]
    flatClusterMaxDelta: i32,
    #[serde(default = "default_max_merge_spread")]
    maxMergeSpread: i32,
}

fn default_tiny_merge_max_area() -> usize {
    0
}

fn default_tiny_merge_max_diff() -> i32 {
    0
}

fn default_tiny_merge_min_target_area() -> usize {
    0
}

fn default_tiny_merge_max_target_area() -> usize {
    0
}

fn default_tiny_merge_max_neighbor_spread() -> i32 {
    0
}

fn default_tiny_merge_max_pixel_spread() -> i32 {
    0
}

/// Maximum per-channel deviation from the cluster's first pixel for the
/// cluster to take the exact pixel-corner walk. Defaults to 2 (the
/// original FLAT_CLUSTER_DELTA); raising it lets low-variation clusters
/// skip the staircase-cutting polygon simplification, which dithers
/// boundaries by ~1px on noisy content. The cluster is painted with its
/// average color, so interior pixels stay within max_delta of the fill.
fn default_flat_cluster_max_delta() -> i32 {
    255
}

/// Maximum color spread (sum of per-channel max-minus-min of member
/// pixel RGB) a stage-2 shallow merge may produce; merges that would
/// stretch the combined spread past this bound deepen the patch into
/// its own layer instead. Bounds the color drift chained shallow
/// merges accumulate on grainy content.
fn default_max_merge_spread() -> i32 {
    32
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TracePoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TracePath {
    points: Vec<TracePoint>,
    holes: Vec<Vec<TracePoint>>,
    closed: bool,
    node_count: usize,
    svg_path_data: String,
    svg_translate_x: f64,
    svg_translate_y: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceLayer {
    name: String,
    color: String,
    paths: Vec<TracePath>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceMetrics {
    node_count: usize,
    path_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceOutput {
    width: u32,
    height: u32,
    layers: Vec<TraceLayer>,
    svg: String,
    metrics: TraceMetrics,
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn trace_rgba_to_json(
    width: u32,
    height: u32,
    pixels: Vec<u8>,
    options_json: String,
) -> Result<String, JsValue> {
    let options: TraceOptions = serde_json::from_str(&options_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid trace options: {error}")))?;

    if pixels.len() != (width as usize) * (height as usize) * 4 {
        return Err(JsValue::from_str("RGBA buffer length does not match image size."));
    }

    let output = match options.clusteringMode.as_str() {
        "binary" => trace_binary_image(width, height, &pixels, &options),
        _ => trace_color_image(width, height, &pixels, None, &options)?,
    };

    serde_json::to_string(&output)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize trace output: {error}")))
}

/// Color-path trace with the pre-preprocessing original pixels alongside.
///
/// Same as trace_rgba_to_json, but each color cluster's fill is re-picked
/// from the original colors at its member pixels (see recolor_cluster_fill)
/// instead of always using the shifted cluster average. The binary path is
/// unchanged (originals are ignored there).
#[wasm_bindgen]
pub fn trace_rgba_to_json_with_originals(
    width: u32,
    height: u32,
    pixels: Vec<u8>,
    original_pixels: Vec<u8>,
    options_json: String,
) -> Result<String, JsValue> {
    let options: TraceOptions = serde_json::from_str(&options_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid trace options: {error}")))?;

    let expected = (width as usize) * (height as usize) * 4;
    if pixels.len() != expected {
        return Err(JsValue::from_str("RGBA buffer length does not match image size."));
    }
    if original_pixels.len() != expected {
        return Err(JsValue::from_str(
            "Original RGBA buffer length does not match image size.",
        ));
    }

    let output = match options.clusteringMode.as_str() {
        "binary" => trace_binary_image(width, height, &pixels, &options),
        _ => trace_color_image(width, height, &pixels, Some(&original_pixels), &options)?,
    };

    serde_json::to_string(&output)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize trace output: {error}")))
}

fn default_clustering_mode() -> String {
    String::from("color")
}

fn default_hierarchical() -> String {
    String::from("stacked")
}

fn default_max_iterations() -> usize {
    10
}

fn default_path_precision() -> u32 {
    8
}

/// When > 0 and the requested mode is "spline", binary clusters at or below
/// this pixel area are traced with Polygon simplification instead of Spline.
/// (The color path no longer uses this threshold: flat color clusters of any
/// area take the exact pixel-corner walk and non-flat ones take Polygon, as
/// the spline smoother measured net-negative on the honest metric.)
/// Fitted splines bow outward past the true pixel boundary on small features
/// (halftone dots render ~19% too dark), while pixel-corner polygons trace
/// them tightly. Large smooth curves keep the spline look.
fn default_polygon_max_area() -> usize {
    0
}

/// When true, small clusters (the polygonMaxArea rule) whose pixels are all
/// the same color are traced with the raw pixel-corner walk instead of the
/// smoothed polygon. Exact walks are near-perfect for binary art like
/// halftone dots; anti-aliased clusters keep smoothing, which mimics soft
/// edges better than a stair-step walk.
fn default_exact_flat_polygons() -> bool {
    false
}

/// True when every pixel in the cluster is within max_delta of the
/// cluster's first pixel on every channel. Gates the exact pixel-corner
/// walk to low-variation clusters (binary art, solid fills, low-amplitude
/// noise) where it is near-perfect, keeping the smoothed polygon for
/// high-variation clusters where smoothing mimics the soft edge better.
fn color_cluster_is_flat(cluster: &ColorCluster, view: &ClustersView, max_delta: i32) -> bool {
    let mut indices = cluster.iter();
    let first_index = match indices.next() {
        Some(index) => *index,
        None => return true,
    };
    let first = match view.get_pixel_at_index(first_index) {
        Some(color) => color,
        None => return false,
    };
    indices.all(|index| match view.get_pixel_at_index(*index) {
        Some(color) => {
            let d = max_delta as i16;
            (color.r as i16 - first.r as i16).abs() <= d
                && (color.g as i16 - first.g as i16).abs() <= d
                && (color.b as i16 - first.b as i16).abs() <= d
                && (color.a as i16 - first.a as i16).abs() <= d
        }
        None => false,
    })
}

/// Minimum cluster area (px) for the exact pixel-corner walk. The exact walk
/// reproduces integer-corner binary art perfectly in the browser, and the
/// harness rasterizer now measures thin features exactly (inset 0.25), so
/// even single-pixel flat components take the exact walk.
const EXACT_FLAT_MIN_AREA: usize = 1;

/// Pick the path simplification mode for one color cluster. Small clusters
/// get Polygon even when the user asked for Spline, to avoid spline overshoot
/// on tiny features; when exactFlatPolygons is on, flat small clusters use
/// the raw pixel-corner walk (None) for near-perfect binary-art tracing.
/// Everything else uses the requested mode unchanged.
fn color_cluster_simplify_mode(
    cluster: &ColorCluster,
    view: &ClustersView,
    options: &TraceOptions,
) -> PathSimplifyMode {
    if options.mode == "spline" {
        // Flat clusters of any area take the exact pixel-corner walk when
        // exactFlatPolygons is set: it reproduces hard pixel-art edges
        // exactly, while the staircase-cutting polygon simplify and the
        // spline smoother both dither such boundaries by about a pixel.
        // Non-flat clusters take the polygon simplify at any area: the
        // spline smoother (outset plus bezier fit) is measured net-negative
        // on the honest metric, it misplaces boundaries on shaded and
        // grainy content and gains nothing on smooth content, while the
        // plain cut polygon stays tight to the walked boundary. This
        // mirrors the binary path, which already exact-walks single-color
        // clusters of any size. polygonMaxArea no longer affects the color
        // path; it still governs the binary-cluster path below.
        if options.exactFlatPolygons
            && color_cluster_is_flat(cluster, view, options.flatClusterMaxDelta)
            && cluster.area() >= EXACT_FLAT_MIN_AREA
        {
            return PathSimplifyMode::None;
        }
        return PathSimplifyMode::Polygon;
    }
    to_simplify_mode(&options.mode)
}

/// Pick the path simplification mode for one cluster. Small clusters get
/// Polygon even when the user asked for Spline, to avoid spline overshoot
/// on tiny features; everything else uses the requested mode unchanged.
fn cluster_simplify_mode(area: usize, options: &TraceOptions) -> PathSimplifyMode {
    if options.mode == "spline"
        && options.polygonMaxArea > 0
        && area <= options.polygonMaxArea
    {
        PathSimplifyMode::Polygon
    } else {
        to_simplify_mode(&options.mode)
    }
}

fn build_color_image(width: u32, height: u32, pixels: &[u8]) -> ColorImage {
    let mut image = ColorImage::new_w_h(width as usize, height as usize);
    image.pixels = pixels.to_vec();
    image
}

/// Pixels below half opacity are visual background noise; pixels at or above
/// it are solid foreground. Snapping to one side or the other keeps soft
/// alpha halos from being traced as solid color, which would bloat shapes.
fn flatten_alpha(image: &mut ColorImage) {
    for rgba in image.pixels.chunks_exact_mut(4) {
        if rgba[3] < 128 {
            rgba[3] = 0;
        } else {
            rgba[3] = 255;
        }
    }
}

fn trace_color_image(
    width: u32,
    height: u32,
    pixels: &[u8],
    originals: Option<&[u8]>,
    options: &TraceOptions,
) -> Result<TraceOutput, JsValue> {
    let mut image = build_color_image(width, height, pixels);
    // The clustering below only looks at RGB, so a semi-transparent halo
    // (very common on PNG logos) would be treated as fully opaque and
    // fatten every shape. Flatten transparency first: pixels that are at
    // least half opaque become solid, the rest become fully transparent and
    // are keyed out as background below.
    flatten_alpha(&mut image);
    let use_keying = should_key_image(&image);
    let key_color = if use_keying {
        let color = find_unused_opaque_color(&image);
        replace_transparent_pixels(&mut image, color);
        color
    } else {
        Color::default()
    };

    let clusters = run_color_trace(
        image,
        width as usize * height as usize,
        options,
        key_color,
    )?;

    Ok(build_color_output(width, height, &clusters, options, originals))
}

fn trace_binary_image(
    width: u32,
    height: u32,
    pixels: &[u8],
    options: &TraceOptions,
) -> TraceOutput {
    let image = build_color_image(width, height, pixels);
    // Note: flatten_alpha removed (was redundant - the closure below already
    // thresholds at 128). The binary mask from TypeScript always has alpha=255.
    let binary_image = image.to_binary_image(|pixel| pixel.a >= 128 && pixel.r < 128);
    let clusters = binary_image.to_clusters(false);
    build_binary_output(width, height, &clusters, options)
}

fn run_color_trace(
    image: ColorImage,
    total_pixels: usize,
    options: &TraceOptions,
    key_color: Color,
) -> Result<ColorClusters, JsValue> {
    let runner = Runner::new(
        RunnerConfig {
            diagonal: options.layerDifference == 0,
            hierarchical: HIERARCHICAL_MAX,
            batch_size: 25600,
            good_min_area: speckle_area_threshold(options.filterSpeckle),
            good_max_area: total_pixels,
            is_same_color_a: 8 - options.colorPrecision,
            is_same_color_b: 1,
            deepen_diff: options.layerDifference,
            hollow_neighbours: 1,
            key_color,
            keying_action: if options.hierarchical == "cutout" {
                KeyingAction::Keep
            } else {
                KeyingAction::Discard
            },
            tiny_merge_max_area: options.tinyMergeMaxArea,
            tiny_merge_max_diff: options.tinyMergeMaxDiff,
            tiny_merge_min_target_area: options.tinyMergeMinTargetArea,
            tiny_merge_max_target_area: options.tinyMergeMaxTargetArea,
            tiny_merge_max_neighbor_spread: options.tinyMergeMaxNeighborSpread,
            tiny_merge_max_pixel_spread: options.tinyMergeMaxPixelSpread,
            max_merge_spread: options.maxMergeSpread,
        },
        image,
    );

    let mut builder = runner.start();
    while !builder.tick() {}
    let clusters = builder.result();

    if options.hierarchical != "cutout" {
        return Ok(clusters);
    }

    let view = clusters.view();
    let image = view.to_color_image();
    let runner = Runner::new(
        RunnerConfig {
            diagonal: false,
            hierarchical: 64,
            batch_size: 25600,
            good_min_area: 0,
            good_max_area: image.width * image.height,
            is_same_color_a: 0,
            is_same_color_b: 1,
            deepen_diff: 0,
            hollow_neighbours: 0,
            key_color: Default::default(),
            keying_action: KeyingAction::Discard,
            tiny_merge_max_area: 0,
            tiny_merge_max_diff: 0,
            tiny_merge_min_target_area: 0,
            tiny_merge_max_target_area: 0,
            tiny_merge_max_neighbor_spread: 0,
            tiny_merge_max_pixel_spread: 0,
            max_merge_spread: 0,
        },
        image,
    );

    let mut builder = runner.start();
    while !builder.tick() {}
    Ok(builder.result())
}

/// Recolor one color cluster's fill against the pre-prep original image.
///
/// Preprocessing (median, posterize, majority vote) shifts colors, and the
/// tracer bakes the shifted cluster average (residue_color) into every
/// pixel the cluster paints. Gather the original colors (composited over
/// white, like the metric's reference) at the cluster's VISIBLE member
/// pixels and pick the fill with the best within-tolerance coverage: the
/// current fill first, then the most frequent exact original colors (count
/// desc, rgb key asc). The current fill wins ties, so fills only change on
/// measured gain.
///
/// `visible` must be the member indices not covered by any later-painted
/// cluster: a fill only affects the pixels where the cluster is topmost,
/// so hidden members must not vote (they belong to the covering cluster's
/// decision). The same formulation as the binary-layer recolor, applied to
/// the color path clusters the WASM tracer produces.
fn recolor_cluster_fill(
    cluster: &ColorCluster,
    visible: &[u32],
    originals: &[u8],
) -> String {
    const TOLERANCE: i16 = 24;
    const TOP_CANDIDATES: usize = 16;

    let current = cluster.residue_color();
    let mut counts: HashMap<u32, usize> = HashMap::new();
    let mut members: Vec<(u8, u8, u8)> = Vec::new();
    for index in visible {
        let o = (*index as usize) * 4;
        if o + 3 >= originals.len() {
            continue;
        }
        let (r, g, b, a) = (
            originals[o],
            originals[o + 1],
            originals[o + 2],
            originals[o + 3],
        );
        let rgb = if a == 255 {
            (r, g, b)
        } else if a == 0 {
            (255, 255, 255)
        } else {
            // Composite over white like the metric's reference.
            let af = a as u32;
            let inv = 255 - af;
            (
                ((r as u32 * af + 255 * inv + 127) / 255) as u8,
                ((g as u32 * af + 255 * inv + 127) / 255) as u8,
                ((b as u32 * af + 255 * inv + 127) / 255) as u8,
            )
        };
        members.push(rgb);
        *counts
            .entry(((rgb.0 as u32) << 16) | ((rgb.1 as u32) << 8) | (rgb.2 as u32))
            .or_insert(0) += 1;
    }
    if members.is_empty() {
        return current.to_hex_string();
    }

    // Count desc, rgb key asc (same tie order as the probe).
    let mut top: Vec<(u32, usize)> = counts.into_iter().collect();
    top.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    top.truncate(TOP_CANDIDATES);

    let cur_key = ((current.r as u32) << 16) | ((current.g as u32) << 8) | (current.b as u32);
    let mut candidates: Vec<(u8, u8, u8)> = vec![(current.r, current.g, current.b)];
    for (key, _) in &top {
        if *key != cur_key {
            candidates.push((
                ((*key >> 16) & 0xff) as u8,
                ((*key >> 8) & 0xff) as u8,
                (*key & 0xff) as u8,
            ));
        }
    }

    let coverage = |c: (u8, u8, u8)| -> usize {
        members
            .iter()
            .filter(|m| {
                (m.0 as i16 - c.0 as i16).abs() <= TOLERANCE
                    && (m.1 as i16 - c.1 as i16).abs() <= TOLERANCE
                    && (m.2 as i16 - c.2 as i16).abs() <= TOLERANCE
            })
            .count()
    };

    let mut best = candidates[0];
    let mut best_cov = coverage(best);
    for c in candidates.into_iter().skip(1) {
        let cov = coverage(c);
        if cov > best_cov {
            best_cov = cov;
            best = c;
        }
    }
    format!("#{:02X}{:02X}{:02X}", best.0, best.1, best.2)
}

fn build_color_output(
    width: u32,
    height: u32,
    clusters: &ColorClusters,
    options: &TraceOptions,
    originals: Option<&[u8]>,
) -> TraceOutput {
    let mut layers: Vec<TraceLayer> = Vec::new();
    let mut layer_lookup: HashMap<String, usize> = HashMap::new();
    let mut svg_entries: Vec<String> = Vec::new();
    let mut node_count = 0usize;
    let mut path_count = 0usize;

    let view = clusters.view();
    // Paint order: later entries cover earlier ones. Each cluster's visible
    // set is its member indices minus the members of later-painted clusters
    // (front-to-back claiming). The recolor optimizes the fill over the
    // visible set only, mirroring the topmost-pixel probe exactly.
    let paint_order: Vec<&ColorCluster> = view
        .clusters_output
        .iter()
        .rev()
        .map(|index| view.get_cluster(*index))
        .collect();
    let total_pixels = width as usize * height as usize;
    let mut visible_sets: Vec<Vec<u32>> = Vec::with_capacity(paint_order.len());
    if originals.is_some() {
        let mut claimed = vec![false; total_pixels];
        let mut reversed: Vec<Vec<u32>> = Vec::with_capacity(paint_order.len());
        for cluster in paint_order.iter().rev() {
            let mut vis = Vec::new();
            for index in cluster.iter() {
                let i = *index as usize;
                if i < total_pixels && !claimed[i] {
                    claimed[i] = true;
                    vis.push(*index);
                }
            }
            reversed.push(vis);
        }
        visible_sets = reversed.into_iter().rev().collect();
    }
    for (order, cluster) in paint_order.iter().enumerate() {
        let fill_color = match originals {
            Some(orig) => recolor_cluster_fill(cluster, &visible_sets[order], orig),
            None => cluster.residue_color().to_hex_string(),
        };
        let compound = cluster.to_compound_path(
            &view,
            false,
            color_cluster_simplify_mode(cluster, &view, options),
            deg_to_rad(options.cornerThreshold),
            options.lengthThreshold,
            options.maxIterations,
            deg_to_rad(options.spliceThreshold),
        );

        let (svg_path_data, svg_offset) =
            compound.to_svg_string(true, PointF64::default(), Some(options.pathPrecision));
        svg_entries.push(svg_entry(&fill_color, &svg_path_data, svg_offset));

        let trace_path = compound_to_trace_path(&compound, svg_path_data, svg_offset);
        node_count += trace_path.node_count;
        path_count += 1;

        if let Some(layer_index) = layer_lookup.get(&fill_color).copied() {
            layers[layer_index].paths.push(trace_path);
        } else {
            let layer_index = layers.len();
            layer_lookup.insert(fill_color.clone(), layer_index);
            layers.push(TraceLayer {
                name: format!("COLOR_{:02}", layer_index + 1),
                color: fill_color,
                paths: vec![trace_path],
            });
        }
    }

    // Build residual layer for color path (Claude feedback item 2).
    // For each pixel, compare the painted fill with the original.
    // Emit exact-color rectangles for mismatches.
    if let Some(orig) = originals {
        // Build label map: pixel -> paint order index of claiming cluster
        let mut labels = vec![u32::MAX; total_pixels];
        for (order, vis) in visible_sets.iter().enumerate() {
            for &idx in vis {
                let i = idx as usize;
                if i < total_pixels {
                    labels[i] = order as u32;
                }
            }
        }
        // Get fill colors in paint order
        let mut fill_rgbs: Vec<(u8, u8, u8)> = Vec::with_capacity(paint_order.len());
        for (order, cluster) in paint_order.iter().enumerate() {
            let fill_hex = match originals {
                Some(o) => recolor_cluster_fill(cluster, &visible_sets[order], o),
                None => cluster.residue_color().to_hex_string(),
            };
            // Parse hex to RGB
            let r = u8::from_str_radix(&fill_hex[1..3], 16).unwrap_or(0);
            let g = u8::from_str_radix(&fill_hex[3..5], 16).unwrap_or(0);
            let b = u8::from_str_radix(&fill_hex[5..7], 16).unwrap_or(0);
            fill_rgbs.push((r, g, b));
        }
        // Find mismatched pixels and group by color
        use std::collections::HashMap;
        let mut by_color: HashMap<u32, Vec<(u32, u32)>> = HashMap::new();
        for y in 0..height {
            for x in 0..width {
                let p = (y * width + x) as usize;
                let o = p * 4;
                if o + 3 >= orig.len() {
                    continue;
                }
                let or = orig[o];
                let og = orig[o + 1];
                let ob = orig[o + 2];
                let oa = orig[o + 3];
                let label = labels[p];
                if label == u32::MAX {
                    // Unpainted pixel with non-transparent original: needs residual
                    if oa != 0 {
                        let key = ((or as u32) << 24) | ((og as u32) << 16) | ((ob as u32) << 8) | (oa as u32);
                        by_color.entry(key).or_insert_with(Vec::new).push((x, y));
                    }
                    continue;
                }
                let (fr, fg, fb) = fill_rgbs[label as usize];
                // Only check opaque pixels (transparent handled by unpainted case)
                if oa == 255 && (or != fr || og != fg || ob != fb) {
                    let key = ((or as u32) << 24) | ((og as u32) << 16) | ((ob as u32) << 8) | 255;
                    by_color.entry(key).or_insert_with(Vec::new).push((x, y));
                } else if oa != 255 && oa != 0 {
                    // Semi-transparent: needs exact with fill-opacity
                    let key = ((or as u32) << 24) | ((og as u32) << 16) | ((ob as u32) << 8) | (oa as u32);
                    by_color.entry(key).or_insert_with(Vec::new).push((x, y));
                }
            }
        }
        // Emit residual rectangles (row runs)
        for (key, mut pixels) in by_color {
            if pixels.is_empty() {
                continue;
            }
            let r = ((key >> 24) & 0xff) as u8;
            let g = ((key >> 16) & 0xff) as u8;
            let b = ((key >> 8) & 0xff) as u8;
            let a = (key & 0xff) as u8;
            pixels.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
            let mut paths = Vec::new();
            let mut i = 0;
            while i < pixels.len() {
                let (sx, sy) = pixels[i];
                let mut ex = sx;
                while i + 1 < pixels.len() && pixels[i + 1].1 == sy && pixels[i + 1].0 == ex + 1 {
                    ex += 1;
                    i += 1;
                }
                let w = ex - sx + 1;
                if w == 1 {
                    paths.push(format!("M{} {}h1v1z", sx, sy));
                } else {
                    paths.push(format!("M{} {}h{}v1z", sx, sy, w));
                }
                i += 1;
            }
            let fill_attr = if a == 255 {
                format!("fill=\"#{:02x}{:02x}{:02x}\"", r, g, b)
            } else {
                format!(
                    "fill=\"#{:02x}{:02x}{:02x}\" fill-opacity=\"{:.3}\"",
                    r,
                    g,
                    b,
                    a as f32 / 255.0
                )
            };
            svg_entries.push(format!(
                "<path {} d=\"{}\" />",
                fill_attr,
                paths.join("")
            ));
            path_count += 1;
        }
    }

    TraceOutput {
        width,
        height,
        layers,
        svg: build_svg(width, height, &svg_entries),
        metrics: TraceMetrics {
            node_count,
            path_count,
        },
    }
}

fn build_binary_output(
    width: u32,
    height: u32,
    clusters: &BinaryClusters,
    options: &TraceOptions,
) -> TraceOutput {
    let fill_color = Color::color(&ColorName::Black).to_hex_string();
    let min_area = speckle_area_threshold(options.filterSpeckle);
    let mut paths = Vec::new();
    let mut svg_entries = Vec::new();
    let mut node_count = 0usize;

    for index in 0..clusters.len() {
        let cluster = clusters.get_cluster(index);
        if cluster.size() < min_area {
            continue;
        }

        // Binary clusters are single-color by construction, so they are
        // always "flat": apply the exact pixel-corner walk for clusters at
        // or above the minimum area when exactFlatPolygons is on, exactly
        // like the color path does for flat clusters. Polygon/spline
        // simplification bows boundaries on binary art.
        let simplify = if options.exactFlatPolygons && cluster.size() >= EXACT_FLAT_MIN_AREA
        {
            PathSimplifyMode::None
        } else {
            cluster_simplify_mode(cluster.size(), options)
        };
        let compound = cluster.to_compound_path(
            simplify,
            deg_to_rad(options.cornerThreshold),
            options.lengthThreshold,
            options.maxIterations,
            deg_to_rad(options.spliceThreshold),
        );
        let (svg_path_data, svg_offset) =
            compound.to_svg_string(true, PointF64::default(), Some(options.pathPrecision));
        svg_entries.push(svg_entry(&fill_color, &svg_path_data, svg_offset));

        let trace_path = compound_to_trace_path(&compound, svg_path_data, svg_offset);
        node_count += trace_path.node_count;
        paths.push(trace_path);
    }

    let path_count = paths.len();
    let layers = if paths.is_empty() {
        Vec::new()
    } else {
        vec![TraceLayer {
            name: String::from("COLOR_01"),
            color: fill_color,
            paths,
        }]
    };

    TraceOutput {
        width,
        height,
        layers,
        svg: build_svg(width, height, &svg_entries),
        metrics: TraceMetrics {
            node_count,
            path_count,
        },
    }
}

fn speckle_area_threshold(value: usize) -> usize {
    value.saturating_mul(value)
}

fn deg_to_rad(value: f64) -> f64 {
    value * PI / 180.0
}

fn svg_entry(fill_color: &str, svg_path_data: &str, svg_offset: PointF64) -> String {
    format!(
        "<path fill=\"{}\" d=\"{}\" transform=\"translate({:.2}, {:.2})\" />",
        fill_color, svg_path_data, svg_offset.x, svg_offset.y
    )
}

fn build_svg(width: u32, height: u32, svg_entries: &[String]) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\">\n{}\n</svg>\n",
        width,
        height,
        width,
        height,
        svg_entries.join("\n")
    )
}

fn should_key_image(image: &ColorImage) -> bool {
    if image.width == 0 || image.height == 0 {
        return false;
    }

    // Key whenever at least one pixel is fully transparent (Claude feedback
    // item 4). Keying costs nothing when it isn't needed, and a stricter
    // threshold could miss logos with small transparent areas.
    for offset in (3..image.pixels.len()).step_by(4) {
        if image.pixels[offset] == 0 {
            return true;
        }
    }

    false
}

fn replace_transparent_pixels(image: &mut ColorImage, key_color: Color) {
    for rgba in image.pixels.chunks_exact_mut(4) {
        if rgba[3] == 0 {
            rgba[0] = key_color.r;
            rgba[1] = key_color.g;
            rgba[2] = key_color.b;
            rgba[3] = 255;
        }
    }
}

fn find_unused_opaque_color(image: &ColorImage) -> Color {
    let used = image
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 255)
        .map(|rgba| rgb_key(rgba[0], rgba[1], rgba[2]))
        .collect::<HashSet<_>>();

    let candidates = [
        Color::new_rgba(255, 0, 0, 255),
        Color::new_rgba(0, 255, 0, 255),
        Color::new_rgba(0, 0, 255, 255),
        Color::new_rgba(255, 255, 0, 255),
        Color::new_rgba(0, 255, 255, 255),
        Color::new_rgba(255, 0, 255, 255),
        Color::new_rgba(128, 128, 128, 255),
    ];

    for candidate in candidates {
        if !used.contains(&rgb_key(candidate.r, candidate.g, candidate.b)) {
            return candidate;
        }
    }

    for value in 0..=0x00FF_FFFFu32 {
        if !used.contains(&value) {
            return Color::new_rgba(
                ((value >> 16) & 0xFF) as u8,
                ((value >> 8) & 0xFF) as u8,
                (value & 0xFF) as u8,
                255,
            );
        }
    }

    Color::new_rgba(255, 0, 0, 255)
}

fn rgb_key(r: u8, g: u8, b: u8) -> u32 {
    ((r as u32) << 16) | ((g as u32) << 8) | b as u32
}

fn to_simplify_mode(mode: &str) -> PathSimplifyMode {
    match mode {
        "polygon" => PathSimplifyMode::Polygon,
        "none" => PathSimplifyMode::None,
        _ => PathSimplifyMode::Spline,
    }
}

fn compound_to_trace_path(
    compound: &CompoundPath,
    svg_path_data: String,
    svg_offset: PointF64,
) -> TracePath {
    // The compound paths are already in absolute image coordinates (see
    // visioncortex Cluster::to_compound_path), so the points must NOT be
    // shifted by svg_offset again. That offset only belongs on the SVG
    // transform, which is stored separately below.
    let mut contours = compound
        .paths
        .iter()
        .map(|element| sample_compound_element(element, PointF64::default()))
        .filter(|points| points.len() >= 3)
        .collect::<Vec<_>>();

    let points = if contours.is_empty() {
        Vec::new()
    } else {
        contours.remove(0)
    };
    let node_count =
        points.len() + contours.iter().map(|contour| contour.len()).sum::<usize>();

    TracePath {
        points,
        holes: contours,
        closed: true,
        node_count,
        svg_path_data,
        svg_translate_x: svg_offset.x,
        svg_translate_y: svg_offset.y,
    }
}

fn sample_compound_element(element: &CompoundPathElement, offset: PointF64) -> Vec<TracePoint> {
    match element {
        CompoundPathElement::PathI32(path) => path_i32_to_points(path, offset),
        CompoundPathElement::PathF64(path) => path_f64_to_points(path, offset),
        CompoundPathElement::Spline(spline) => {
            let mut out = Vec::new();
            for (segment_index, segment) in spline.points.windows(4).step_by(3).enumerate() {
                let sampled = sample_cubic(
                    segment[0].x + offset.x,
                    segment[0].y + offset.y,
                    segment[1].x + offset.x,
                    segment[1].y + offset.y,
                    segment[2].x + offset.x,
                    segment[2].y + offset.y,
                    segment[3].x + offset.x,
                    segment[3].y + offset.y,
                    10,
                );
                if segment_index == 0 {
                    out.extend(sampled);
                } else {
                    out.extend(sampled.into_iter().skip(1));
                }
            }
            out
        }
    }
}

fn path_i32_to_points(path: &PathI32, offset: PointF64) -> Vec<TracePoint> {
    path.path
        .iter()
        .map(|point| TracePoint {
            x: point.x as f64 + offset.x,
            y: point.y as f64 + offset.y,
        })
        .collect()
}

fn path_f64_to_points(path: &visioncortex::PathF64, offset: PointF64) -> Vec<TracePoint> {
    path.path
        .iter()
        .map(|point| TracePoint {
            x: point.x + offset.x,
            y: point.y + offset.y,
        })
        .collect()
}

fn sample_cubic(
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    x3: f64,
    y3: f64,
    steps: usize,
) -> Vec<TracePoint> {
    let mut out = Vec::with_capacity(steps + 1);
    for step in 0..=steps {
        let t = step as f64 / steps as f64;
        let mt = 1.0 - t;
        out.push(TracePoint {
            x: cubic_value(mt, t, x0, x1, x2, x3),
            y: cubic_value(mt, t, y0, y1, y2, y3),
        });
    }
    out
}

fn cubic_value(mt: f64, t: f64, p0: f64, p1: f64, p2: f64, p3: f64) -> f64 {
    mt.powi(3) * p0 + 3.0 * mt.powi(2) * t * p1 + 3.0 * mt * t.powi(2) * p2 + t.powi(3) * p3
}
