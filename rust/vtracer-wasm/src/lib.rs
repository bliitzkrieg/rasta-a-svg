use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;
use vtracer::fitter::{CurveFitter, FitParams, PixelFitter, PolygonFitter, SplineFitter};
use vtracer::ir::{Layer, MultiPath, PathCmd, RegionMask, Shape, SubPath, VectorDoc};
use vtracer::simplify::{CurvePass, SimplifyCurves};
use vtracer::{Clustering, ColorImage, Config, FitMode, Hierarchical};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(non_snake_case)]
#[allow(dead_code)] // polygonMaxArea / exactFlatPolygons are kept for a later
                    // adaptive-fitter experiment; the 1.0 port maps them then.
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
    /// Watershed detail override (0 = default 128). Only used with
    /// clusteringMode "watershed". Passed via --settings in experiments;
    /// the app never sets it.
    #[serde(default)]
    watershedDetail: u32,
    /// Simplify tolerance in px (0 = off). Passed via --settings in
    /// experiments; the app never sets it.
    #[serde(default)]
    simplifyTolerance: f64,
}

#[derive(Debug, Clone, Serialize)]
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

    let output = trace_image(width, height, &pixels, &options)?;

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

fn default_polygon_max_area() -> usize {
    0
}

fn default_exact_flat_polygons() -> bool {
    false
}

fn build_color_image(width: u32, height: u32, pixels: &[u8]) -> ColorImage {
    let mut image = ColorImage::new_w_h(width as usize, height as usize);
    image.pixels = pixels.to_vec();
    image
}

/// Pixels below half opacity are visual background noise; pixels at or above
/// it are solid foreground. Snapping to one side or the other keeps soft
/// alpha halos from being traced as solid color, which would bloat shapes.
/// The 1.0 frontend does its own transparency keying, but it only treats
/// fully-transparent (a == 0) pixels as background, so this flattening still
/// has to run first.
fn flatten_alpha(image: &mut ColorImage) {
    for rgba in image.pixels.chunks_exact_mut(4) {
        if rgba[3] < 128 {
            rgba[3] = 0;
        } else {
            rgba[3] = 255;
        }
    }
}

/// Map our TraceOptions onto the vtracer 1.0 Config.
fn build_config(options: &TraceOptions) -> Config {
    let mut config = Config::default();
    config.clustering = match options.clusteringMode.as_str() {
        "binary" => Clustering::Binary,
        "watershed" => Clustering::Watershed,
        _ => Clustering::ColorCluster,
    };
    config.hierarchical = match options.hierarchical.as_str() {
        "cutout" => Hierarchical::Cutout,
        _ => Hierarchical::Stacked,
    };
    config.filter_speckle = options.filterSpeckle;
    config.color_precision = options.colorPrecision;
    config.layer_difference = options.layerDifference;
    config.mode = match options.mode.as_str() {
        "polygon" => FitMode::Polygon,
        "pixel" | "none" => FitMode::Pixel,
        _ => FitMode::Spline,
    };
    config.corner_threshold = options.cornerThreshold.round() as i32;
    config.length_threshold = options.lengthThreshold;
    config.max_iterations = options.maxIterations;
    config.splice_threshold = options.spliceThreshold.round() as i32;
    config.path_precision = Some(options.pathPrecision);
    config.binary_threshold = 128;
    config.watershed_detail = if options.watershedDetail > 0 {
        options.watershedDetail
    } else {
        128
    };
    config.simplify = if options.simplifyTolerance > 0.0 {
        Some(options.simplifyTolerance)
    } else {
        None
    };
    // No optimizer passes: the legacy pipeline emitted geometry unmodified,
    // and our SVG writer below rounds to path_precision itself.
    config.optimize = 0;
    config
}

fn trace_image(
    width: u32,
    height: u32,
    pixels: &[u8],
    options: &TraceOptions,
) -> Result<TraceOutput, JsValue> {
    let mut image = build_color_image(width, height, pixels);
    flatten_alpha(&mut image);

    let config = build_config(options);
    let pipeline = config
        .build()
        .map_err(|error| JsValue::from_str(&format!("Tracer configuration failed: {error}")))?;

    // For stacked compositing we compose manually so each region can use its
    // own curve fitter (the legacy polygonMaxArea / exactFlatPolygons gating).
    // Mosaic (cutout) mode goes through the standard pipeline.
    let doc = if options.hierarchical == "cutout" {
        pipeline
            .run(&image)
            .map_err(|error| JsValue::from_str(&format!("Trace failed: {error}")))?
    } else {
        let mut seg = pipeline
            .segment(&image)
            .map_err(|error| JsValue::from_str(&format!("Segmentation failed: {error}")))?;
        for fitter in &pipeline.color_fitters {
            fitter.fit(&mut seg);
        }
        compose_adaptive(&seg, &image, options)
    };

    Ok(build_output(width, height, &doc, options))
}

/// Maximum per-channel difference for a region to count as flat.
const FLAT_CLUSTER_DELTA: i16 = 2;

/// True when every pixel of the region (looked up in the source image via the
/// mask offset) is within FLAT_CLUSTER_DELTA of the region's first pixel on
/// every channel. Gates the exact pixel walk to binary art where it is
/// near-perfect, mirroring the legacy color_cluster_is_flat check.
fn region_is_flat(mask: &RegionMask, image: &ColorImage) -> bool {
    let mut first: Option<(u8, u8, u8, u8)> = None;
    for y in 0..mask.height() {
        for x in 0..mask.width() {
            if !mask.image.get_pixel(x, y) {
                continue;
            }
            let ix = (x as i32 + mask.offset.x) as usize;
            let iy = (y as i32 + mask.offset.y) as usize;
            if ix >= image.width || iy >= image.height {
                continue;
            }
            let p = image.get_pixel(ix, iy);
            match first {
                None => first = Some((p.r, p.g, p.b, p.a)),
                Some((fr, fg, fb, fa)) => {
                    if (p.r as i16 - fr as i16).abs() > FLAT_CLUSTER_DELTA
                        || (p.g as i16 - fg as i16).abs() > FLAT_CLUSTER_DELTA
                        || (p.b as i16 - fb as i16).abs() > FLAT_CLUSTER_DELTA
                        || (p.a as i16 - fa as i16).abs() > FLAT_CLUSTER_DELTA
                    {
                        return false;
                    }
                }
            }
        }
    }
    true
}

fn deg_to_rad(value: f64) -> f64 {
    value * PI / 180.0
}

/// Stacked compositing with per-region fitter dispatch. Small regions use the
/// exact pixel walk (flat ones) or polygon simplification, exactly like the
/// legacy pipeline's polygonMaxArea / exactFlatPolygons gating; everything
/// else uses the globally requested fit mode.
fn compose_adaptive(
    seg: &vtracer::ir::Segmentation,
    image: &ColorImage,
    options: &TraceOptions,
) -> VectorDoc {
    let spline = SplineFitter::new(FitParams {
        corner_threshold: deg_to_rad(options.cornerThreshold),
        length_threshold: options.lengthThreshold,
        max_iterations: options.maxIterations,
        splice_threshold: deg_to_rad(options.spliceThreshold),
    });
    let polygon = PolygonFitter;
    let pixel = PixelFitter;
    let passes = curve_passes(options);

    let mut doc = VectorDoc::new(seg.width, seg.height);
    for layer in &seg.layers {
        let fitter: &dyn CurveFitter =
            choose_fitter(layer, image, options, &spline, &polygon, &pixel);
        let mut path = MultiPath::new();
        for geom in fitter.fit_region(&layer.mask) {
            let mut geom = geom;
            for pass in &passes {
                geom = pass.ring(geom);
            }
            path.push(geom.into_closed_subpath());
        }
        if !path.is_empty() {
            doc.shapes.push(Shape {
                paint: layer.paint,
                path,
            });
        }
    }
    doc
}

/// Geometry passes for the adaptive compositor, mirroring Config's
/// curve_passes: the Schneider simplify re-fit, off unless simplifyTolerance
/// is set. Only spline-fitted contours are affected.
fn curve_passes(options: &TraceOptions) -> Vec<Box<dyn CurvePass>> {
    if options.simplifyTolerance > 0.0 {
        vec![Box::new(SimplifyCurves {
            tolerance: options.simplifyTolerance,
            corner_threshold: deg_to_rad(options.cornerThreshold),
        })]
    } else {
        Vec::new()
    }
}

fn choose_fitter<'a>(
    layer: &Layer,
    image: &ColorImage,
    options: &TraceOptions,
    spline: &'a SplineFitter,
    polygon: &'a PolygonFitter,
    pixel: &'a PixelFitter,
) -> &'a dyn CurveFitter {
    if options.mode == "spline"
        && options.polygonMaxArea > 0
        && layer.mask.area() <= options.polygonMaxArea
    {
        // Small flat regions keep the exact pixel walk (near-perfect on
        // binary art); small non-flat regions use polygon simplification,
        // matching the legacy gating. (A spline-for-small-nonflat variant
        // scored 0.9881, worse, so polygon stays.)
        if options.exactFlatPolygons && region_is_flat(&layer.mask, image) {
            pixel
        } else {
            polygon
        }
    } else {
        match options.mode.as_str() {
            "polygon" => polygon,
            "pixel" | "none" => pixel,
            _ => spline,
        }
    }
}

fn build_output(
    width: u32,
    height: u32,
    doc: &VectorDoc,
    options: &TraceOptions,
) -> TraceOutput {
    let mut layers: Vec<TraceLayer> = Vec::new();
    let mut layer_lookup: HashMap<String, usize> = HashMap::new();
    let mut svg_entries: Vec<String> = Vec::new();
    let mut node_count = 0usize;
    let mut path_count = 0usize;

    // VectorDoc shapes are in paint order, bottom first, which is the order
    // the SVG (and the harness rasterizer) expects.
    for shape in &doc.shapes {
        let fill_color = shape.paint.color().to_hex_string();
        let (trace_path, svg_path_data) = shape_to_trace_path(shape, options.pathPrecision);
        node_count += trace_path.node_count;
        path_count += 1;

        svg_entries.push(svg_entry(&fill_color, &svg_path_data));

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

fn shape_to_trace_path(shape: &Shape, precision: u32) -> (TracePath, String) {
    let mut contour_point_lists: Vec<Vec<TracePoint>> = Vec::new();
    let mut svg_subpaths: Vec<String> = Vec::new();

    for subpath in &shape.path.subpaths {
        let points = subpath_to_points(subpath);
        if points.len() >= 3 {
            contour_point_lists.push(points);
        }
        let svg = subpath_to_svg(subpath, precision);
        if !svg.is_empty() {
            svg_subpaths.push(svg);
        }
    }

    let svg_path_data = svg_subpaths.join(" ");
    let mut contours = contour_point_lists;
    let points = if contours.is_empty() {
        Vec::new()
    } else {
        contours.remove(0)
    };
    let node_count = points.len() + contours.iter().map(|c| c.len()).sum::<usize>();

    let trace_path = TracePath {
        points,
        holes: contours,
        closed: true,
        node_count,
        svg_path_data: svg_path_data.clone(),
        svg_translate_x: 0.0,
        svg_translate_y: 0.0,
    };
    (trace_path, svg_path_data)
}

/// Sample a subpath into polyline points. Line segments map directly; cubic
/// segments are sampled, mirroring the legacy sampler the app's layer panel
/// was built against.
fn subpath_to_points(subpath: &SubPath) -> Vec<TracePoint> {
    let mut out: Vec<TracePoint> = Vec::new();
    let mut current = TracePoint { x: 0.0, y: 0.0 };
    for cmd in &subpath.commands {
        match cmd {
            PathCmd::MoveTo(p) => {
                current = TracePoint { x: p.x, y: p.y };
                out.push(TracePoint { x: p.x, y: p.y });
            }
            PathCmd::LineTo(p) => {
                current = TracePoint { x: p.x, y: p.y };
                out.push(current.clone());
            }
            PathCmd::CubicTo(c1, c2, p) => {
                let sampled = sample_cubic(
                    current.x, current.y, c1.x, c1.y, c2.x, c2.y, p.x, p.y, 10,
                );
                out.extend(sampled.into_iter().skip(1));
                current = TracePoint { x: p.x, y: p.y };
            }
            PathCmd::Close => {}
        }
    }
    out
}

fn subpath_to_svg(subpath: &SubPath, precision: u32) -> String {
    let mut parts: Vec<String> = Vec::new();
    for cmd in &subpath.commands {
        match cmd {
            PathCmd::MoveTo(p) => parts.push(format!(
                "M{},{}",
                fmt_num(p.x, precision),
                fmt_num(p.y, precision)
            )),
            PathCmd::LineTo(p) => parts.push(format!(
                "L{},{}",
                fmt_num(p.x, precision),
                fmt_num(p.y, precision)
            )),
            PathCmd::CubicTo(c1, c2, p) => parts.push(format!(
                "C{},{} {},{} {},{}",
                fmt_num(c1.x, precision),
                fmt_num(c1.y, precision),
                fmt_num(c2.x, precision),
                fmt_num(c2.y, precision),
                fmt_num(p.x, precision),
                fmt_num(p.y, precision)
            )),
            PathCmd::Close => parts.push(String::from("Z")),
        }
    }
    parts.join(" ")
}

fn fmt_num(value: f64, precision: u32) -> String {
    let mut s = format!("{:.1$}", value, precision as usize);
    if s.contains('.') {
        while s.ends_with('0') {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
    }
    if s == "-0" {
        s = String::from("0");
    }
    s
}

fn svg_entry(fill_color: &str, svg_path_data: &str) -> String {
    format!(
        "<path fill=\"{}\" d=\"{}\" transform=\"translate(0.00, 0.00)\" />",
        fill_color, svg_path_data
    )
}

fn build_svg(width: u32, height: u32, svg_entries: &[String]) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg width=\"{}pt\" height=\"{}pt\" viewBox=\"0 0 {} {}\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\">\n{}\n</svg>\n",
        width,
        height,
        width,
        height,
        svg_entries.join("\n")
    )
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
