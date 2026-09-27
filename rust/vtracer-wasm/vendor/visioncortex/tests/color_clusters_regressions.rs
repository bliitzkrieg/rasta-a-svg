//! Regression tests for the color-clustering pipeline.
//!
//! The crate has no image decoder, so fixtures are generated from a small LCG:
//! deterministic, reproducible, and cheap to keep in the repo.

use visioncortex::color_clusters::{Clusters, Runner, RunnerConfig, HIERARCHICAL_MAX};
use visioncortex::{Color, ColorImage};

fn lcg(state: &mut u64) -> u32 {
    *state = state
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    (*state >> 33) as u32
}

/// A square of uniform noise quantised to `levels` values per channel.
fn noise_image(size: usize, seed: u64, levels: u32) -> ColorImage {
    let mut s = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ ((levels as u64) << 40);
    let mut im = ColorImage::new_w_h(size, size);
    let q = 255 / (levels - 1).max(1);
    for y in 0..size {
        for x in 0..size {
            let r = ((lcg(&mut s) % levels) * q) as u8;
            let g = ((lcg(&mut s) % levels) * q) as u8;
            let b = ((lcg(&mut s) % levels) * q) as u8;
            im.set_pixel(x, y, &Color::new(r, g, b));
        }
    }
    im
}

/// Diagonal connectivity, which is what puts `cluster_upleft` on the hot path.
fn diagonal_config(w: usize, h: usize, precision_loss: i32) -> RunnerConfig {
    RunnerConfig {
        diagonal: true,
        hierarchical: HIERARCHICAL_MAX,
        batch_size: 25600,
        good_min_area: 0,
        good_max_area: w * h,
        is_same_color_a: precision_loss,
        is_same_color_b: 1,
        deepen_diff: 0,
        hollow_neighbours: 1,
        key_color: Color::default(),
        keying_action: Default::default(),
    }
}

/// A cluster merged away after being pushed to `clusters_output` has an empty
/// sum and, if merged into itself, a cleared rect alongside live indices.
/// `stage_2` and every consumer accessor fault on it. Panics unfixed.
#[test]
fn merged_away_clusters_do_not_reach_output() {
    let image = noise_image(15, 355, 4);
    let clusters = Runner::new(diagonal_config(15, 15, 6), image).run();
    assert!(clusters.output_len() > 0);
    assert_output_usable(&clusters);
}

/// The same path over a corpus, so a recurrence has to break more than one
/// raster to slip past.
#[test]
fn output_is_usable_across_corpus() {
    for levels in [2u32, 3, 4] {
        for size in [7usize, 15] {
            for seed in 0..400u64 {
                let image = noise_image(size, seed, levels);
                for precision_loss in [0i32, 2, 6] {
                    let config = diagonal_config(size, size, precision_loss);
                    let clusters = Runner::new(config, image.clone()).run();
                    assert!(clusters.output_len() > 0);
                    assert_output_usable(&clusters);
                }
            }
        }
    }
}

/// Every output cluster must survive the accessors a consumer reaches for.
fn assert_output_usable(clusters: &Clusters) {
    let view = clusters.view();
    for &index in view.clusters_output.iter() {
        let cluster = view.get_cluster(index);
        assert!(
            cluster.sum.counter > 0,
            "output cluster {} has an empty ColorSum (area {})",
            index.0,
            cluster.area(),
        );
        for &pixel in cluster.indices.iter() {
            let (x, y) = ((pixel % view.width) as i32, (pixel / view.width) as i32);
            assert!(
                x >= cluster.rect.left
                    && x < cluster.rect.right
                    && y >= cluster.rect.top
                    && y < cluster.rect.bottom,
                "output cluster {} lists pixel ({}, {}) outside its rect",
                index.0, x, y,
            );
        }
        let _ = cluster.color();
        let _ = cluster.residue_color();
        let _ = cluster.to_image_with_hole(view.width, false);
    }
}
