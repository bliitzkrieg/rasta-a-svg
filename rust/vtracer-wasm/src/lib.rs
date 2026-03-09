use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;
use visioncortex::color_clusters::{KeyingAction, Runner, RunnerConfig, HIERARCHICAL_MAX};
use visioncortex::{
    Color, ColorImage, CompoundPath, CompoundPathElement, PathI32, PathSimplifyMode, PointF64,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(non_snake_case)]
struct TraceOptions {
    colorPrecision: i32,
    filterSpeckle: usize,
    layerDifference: i32,
    cornerThreshold: f64,
    lengthThreshold: f64,
    maxIterations: usize,
    pathPrecision: Option<u32>,
    spliceThreshold: f64,
    mode: String,
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

    let mut color_image = build_color_image(width, height, &pixels);
    let key_color = find_unused_opaque_color(&color_image);
    let use_keying = should_key_image(&color_image);
    if use_keying {
        replace_transparent_pixels(&mut color_image, key_color);
    }
    let clusters = run_color_trace(
        color_image,
        width as usize * height as usize,
        &options,
        key_color,
        use_keying,
    )?;

    let mut layers: Vec<TraceLayer> = Vec::new();
    let mut layer_lookup: HashMap<String, usize> = HashMap::new();
    let mut svg_entries: Vec<String> = Vec::new();
    let mut node_count = 0usize;
    let mut path_count = 0usize;

    let view = clusters.view();
    for cluster in view.clusters_output.iter().rev().map(|index| view.get_cluster(*index)) {
        let fill_color = cluster.residue_color().to_hex_string();
        let compound = cluster.to_compound_path(
            &view,
            false,
            to_simplify_mode(&options.mode),
            deg_to_rad(options.cornerThreshold),
            options.lengthThreshold,
            options.maxIterations,
            deg_to_rad(options.spliceThreshold),
        );

        let (svg_path_data, svg_offset) =
            compound.to_svg_string(true, PointF64::default(), options.pathPrecision);
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

    let output = TraceOutput {
        width,
        height,
        layers,
        svg: build_svg(width, height, &svg_entries),
        metrics: TraceMetrics {
            node_count,
            path_count,
        },
    };

    serde_json::to_string(&output)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize trace output: {error}")))
}

fn build_color_image(width: u32, height: u32, pixels: &[u8]) -> ColorImage {
    let mut image = ColorImage::new_w_h(width as usize, height as usize);
    image.pixels = pixels.to_vec();
    image
}

fn run_color_trace(
    image: ColorImage,
    total_pixels: usize,
    options: &TraceOptions,
    key_color: Color,
    use_keying: bool,
) -> Result<visioncortex::color_clusters::Clusters, JsValue> {
    let runner = Runner::new(
        RunnerConfig {
            diagonal: false,
            hierarchical: HIERARCHICAL_MAX,
            batch_size: 25600,
            good_min_area: options.filterSpeckle.saturating_mul(options.filterSpeckle),
            good_max_area: total_pixels,
            is_same_color_a: 8 - options.colorPrecision,
            is_same_color_b: 1,
            deepen_diff: options.layerDifference,
            hollow_neighbours: 1,
            key_color,
            keying_action: if use_keying {
                KeyingAction::Discard
            } else {
                KeyingAction::Keep
            },
        },
        image,
    );

    let mut builder = runner.start();
    while !builder.tick() {}
    Ok(builder.result())
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
        "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg width=\"{}pt\" height=\"{}pt\" viewBox=\"0 0 {} {}\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\">\n{}\n</svg>\n",
        width,
        height,
        width,
        height,
        svg_entries.join("\n")
    )
}

fn should_key_image(image: &ColorImage) -> bool {
    let total_pixels = image.width * image.height;
    let total_transparent = image
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] < 255)
        .count();

    if total_transparent < image.width || total_transparent * 100 < total_pixels {
        return false;
    }

    let scanline_threshold = image.width / 2;
    image
        .pixels
        .chunks_exact(image.width * 4)
        .any(|scanline| {
            scanline
                .chunks_exact(4)
                .filter(|rgba| rgba[3] < 255)
                .count()
                > scanline_threshold
        })
}

fn replace_transparent_pixels(image: &mut ColorImage, key_color: Color) {
    for rgba in image.pixels.chunks_exact_mut(4) {
        if rgba[3] < 255 {
            rgba[0] = key_color.r;
            rgba[1] = key_color.g;
            rgba[2] = key_color.b;
            rgba[3] = key_color.a;
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
    let mut contours = compound
        .paths
        .iter()
        .map(|element| sample_compound_element(element, svg_offset))
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
