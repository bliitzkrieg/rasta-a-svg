use std::collections::HashMap;
use crate::{Color, ColorImage};
use super::{Cluster, Clusters, ClustersView, container::ClusterIndex, container::ClusterIndexElem};

// Describes what to do with pixels that match the key color
#[derive(Default, Clone, Copy)]
pub enum KeyingAction {
    #[default]
    Keep,
    Discard,
}

#[derive(Clone)]
pub struct BuilderConfig {
    pub(crate) diagonal: bool,
    pub(crate) hierarchical: u32,
    pub(crate) batch_size: u32,
    pub(crate) key: Color,
    pub(crate) keying_action: KeyingAction,
    /// Max cluster area (px) for tiny-cluster absorption at the stage 1 -> 2
    /// transition. 0 disables the pass.
    pub(crate) tiny_merge_max_area: usize,
    /// Max average-color difference (sum of abs channel diffs) for a tiny
    /// cluster to be absorbed into a 4-neighbor.
    pub(crate) tiny_merge_max_diff: i32,
    /// Minimum area (px) of the absorption target. 0 disables the
    /// restriction. Requiring a large target keeps the pass to splinters
    /// absorbed into established regions; without it, small gradient-band
    /// clusters merge into each other and smooth transitions collapse.
    pub(crate) tiny_merge_min_target_area: usize,
    /// Maximum area (px) of the absorption target. 0 disables the
    /// restriction. Capping the target keeps the pass to fragment-to-fragment
    /// consolidation (noise splinters and linework fragments merging with
    /// each other); without it, soft-alpha fringe clusters get absorbed
    /// into large flat regions and soft edges turn hard.
    pub(crate) tiny_merge_max_target_area: usize,
    /// Max neighbor-color spread (sum over channels of max-minus-min of the
    /// distinct neighbors' average colors) for a tiny cluster to be absorbed.
    /// A tiny cluster sitting on a color boundary ("bridge", e.g. a gradient
    /// band step or a soft-alpha fringe) touches neighbors whose average
    /// colors span a wide range; an interior splinter (noise speckle,
    /// linework fragment) is surrounded by one similar color. 0 disables the
    /// gate.
    pub(crate) tiny_merge_max_neighbor_spread: i32,
    /// Max own-pixel color spread (sum over channels of max-minus-min of the
    /// tiny cluster's own pixels) for absorption. A soft-alpha fringe
    /// cluster is a blend ramp: its pixels run from one region's color to
    /// the other's, so its spread is wide even when its average sits close
    /// to the target. A noise speckle or linework fragment is nearly
    /// uniform, so its spread is narrow. 0 disables the gate.
    pub(crate) tiny_merge_max_pixel_spread: i32,
}

impl Default for BuilderConfig {
    fn default() -> Self {
        Self {
            diagonal: true,
            hierarchical: HIERARCHICAL_MAX,
            batch_size: 10000,
            key: Color::default(),
            keying_action: KeyingAction::default(),
            tiny_merge_max_area: 0,
            tiny_merge_max_diff: 0,
            tiny_merge_min_target_area: 0,
            tiny_merge_max_target_area: 0,
            tiny_merge_max_neighbor_spread: 0,
            tiny_merge_max_pixel_spread: 0,
        }
    }
}

pub struct NeighbourInfo {
    pub index: ClusterIndex,
    pub diff: i32,
}

/// the 0th cluster is reserved for internal use
pub const ZERO: ClusterIndex = ClusterIndex(0);
pub const HIERARCHICAL_MAX: u32 = std::u32::MAX;

/// Builds [`Clusters`] from a [`ColorImage`], parameterised over the four
/// user-supplied closures. Use [`Builder::new`] and set every closure before
/// calling [`run`](Builder::run)/[`start`](Builder::start); the type parameters
/// start as `()` placeholders, so forgetting a closure is a compile error rather
/// than a runtime panic.
///
/// - `C`: `Fn(Color, Color) -> bool` — whether two colors are the "same".
/// - `D`: `Fn(Color, Color) -> i32` — color difference metric.
/// - `P`: `Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool` — deepen.
/// - `H`: `Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool` — hollow.
pub struct Builder<C, D, P, H> {
    pub(crate) conf: BuilderConfig,
    pub(crate) same: C,
    pub(crate) diff: D,
    pub(crate) deepen: P,
    pub(crate) hollow: H,
    pub(crate) image: Option<ColorImage>,
}

pub struct IncrementalBuilder<C, D, P, H> {
    builder_impl: Option<Box<BuilderImpl<C, D, P, H>>>,
}

macro_rules! config_setter {
    ($name:ident, $t:ty) => {
        pub fn $name(mut self, $name: $t) -> Self {
            self.conf.$name = $name;
            self
        }
    };
}

impl Builder<(), (), (), ()> {
    pub fn new() -> Self {
        Self {
            conf: BuilderConfig::default(),
            same: (),
            diff: (),
            deepen: (),
            hollow: (),
            image: None,
        }
    }
}

impl Default for Builder<(), (), (), ()> {
    fn default() -> Self {
        Self::new()
    }
}

impl<C, D, P, H> Builder<C, D, P, H> {
    pub fn from(mut self, image: ColorImage) -> Self {
        self.image = Some(image);
        self
    }

    config_setter!(diagonal, bool);
    config_setter!(hierarchical, u32);
    config_setter!(batch_size, u32);
    config_setter!(key, Color);
    config_setter!(keying_action, KeyingAction);
    config_setter!(tiny_merge_max_area, usize);
    config_setter!(tiny_merge_max_diff, i32);
    config_setter!(tiny_merge_min_target_area, usize);
    config_setter!(tiny_merge_max_target_area, usize);
    config_setter!(tiny_merge_max_neighbor_spread, i32);
    config_setter!(tiny_merge_max_pixel_spread, i32);

    /// Sets the "same color" predicate, changing the `C` type parameter.
    pub fn same<C2>(self, same: C2) -> Builder<C2, D, P, H>
    where
        C2: Fn(Color, Color) -> bool,
    {
        Builder { conf: self.conf, same, diff: self.diff, deepen: self.deepen, hollow: self.hollow, image: self.image }
    }

    /// Sets the color difference metric, changing the `D` type parameter.
    pub fn diff<D2>(self, diff: D2) -> Builder<C, D2, P, H>
    where
        D2: Fn(Color, Color) -> i32,
    {
        Builder { conf: self.conf, same: self.same, diff, deepen: self.deepen, hollow: self.hollow, image: self.image }
    }

    /// Sets the deepen predicate, changing the `P` type parameter.
    pub fn deepen<P2>(self, deepen: P2) -> Builder<C, D, P2, H>
    where
        P2: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
    {
        Builder { conf: self.conf, same: self.same, diff: self.diff, deepen, hollow: self.hollow, image: self.image }
    }

    /// Sets the hollow predicate, changing the `H` type parameter.
    pub fn hollow<H2>(self, hollow: H2) -> Builder<C, D, P, H2>
    where
        H2: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
    {
        Builder { conf: self.conf, same: self.same, diff: self.diff, deepen: self.deepen, hollow, image: self.image }
    }
}

impl<C, D, P, H> Builder<C, D, P, H>
where
    C: Fn(Color, Color) -> bool,
    D: Fn(Color, Color) -> i32,
    P: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
    H: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
{
    pub fn run(self) -> Clusters {
        let mut bimpl = self.into_impl();
        while !bimpl.tick() {}
        bimpl.result()
    }

    pub fn start(self) -> IncrementalBuilder<C, D, P, H> {
        IncrementalBuilder::new(self.into_impl())
    }

    fn into_impl(self) -> BuilderImpl<C, D, P, H> {
        let im = self.image.expect("Builder::from(image) must be called before run()/start()");
        let len = im.pixels.len();

        BuilderImpl {
            diagonal: self.conf.diagonal,
            hierarchical: self.conf.hierarchical,
            batch_size: self.conf.batch_size,
            key: self.conf.key,
            keying_action: self.conf.keying_action,
            same: self.same,
            diff: self.diff,
            deepen: self.deepen,
            hollow: self.hollow,
            width: im.width as u32,
            height: im.height as u32,
            pixels: im.pixels,
            clusters: vec![Cluster::new()],
            cluster_indices: vec![Default::default(); len / 4],
            cluster_areas: Vec::new(),
            clusters_output: Vec::new(),
            stage: 1,
            iteration: 0,
            next_index: ClusterIndex(1),
            tiny_merge_max_area: self.conf.tiny_merge_max_area,
            tiny_merge_max_diff: self.conf.tiny_merge_max_diff,
            tiny_merge_min_target_area: self.conf.tiny_merge_min_target_area,
            tiny_merge_max_target_area: self.conf.tiny_merge_max_target_area,
            tiny_merge_max_neighbor_spread: self.conf.tiny_merge_max_neighbor_spread,
            tiny_merge_max_pixel_spread: self.conf.tiny_merge_max_pixel_spread,
        }
    }
}

impl<C, D, P, H> IncrementalBuilder<C, D, P, H>
where
    C: Fn(Color, Color) -> bool,
    D: Fn(Color, Color) -> i32,
    P: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
    H: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
{
    fn new(builder_impl: BuilderImpl<C, D, P, H>) -> Self {
        Self {
            builder_impl: Some(Box::new(builder_impl))
        }
    }

    pub fn tick(&mut self) -> bool {
        self.builder_impl.as_mut().unwrap().tick()
    }

    pub fn view(&self) -> ClustersView<'_> {
        self.builder_impl.as_ref().unwrap().view()
    }

    pub fn result(&mut self) -> Clusters {
        self.builder_impl.take().unwrap().result()
    }

    pub fn progress(&self) -> u32 {
        match &self.builder_impl {
            None => {
                0
            },
            Some(builder) => {
                builder.as_ref().progress()
            }
        }
    }
}

struct Area {
    pub area: usize,
    pub count: usize,
}

pub struct BuilderImpl<C, D, P, H> {
    diagonal: bool,
    hierarchical: u32,
    batch_size: u32,
    key: Color,
    keying_action: KeyingAction,
    same: C,
    diff: D,
    deepen: P,
    hollow: H,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pixels: Vec<u8>,           // raw bytes from getImageData; 4 bytes as a pixel
    clusters: Vec<Cluster>,    // array of clusters
    pub(crate) cluster_indices: Vec<ClusterIndex>, // the cluster index each pixel belongs to
    cluster_areas: Vec<Area>,  // uniquely sorted array of cluster sizes
    clusters_output: Vec<ClusterIndex>, // indices of good clusters
    stage: u32,
    iteration: u32,
    next_index: ClusterIndex,
    tiny_merge_max_area: usize,
    tiny_merge_max_diff: i32,
    tiny_merge_min_target_area: usize,
    tiny_merge_max_target_area: usize,
    tiny_merge_max_neighbor_spread: i32,
    tiny_merge_max_pixel_spread: i32,
}

impl<C, D, P, H> BuilderImpl<C, D, P, H>
where
    C: Fn(Color, Color) -> bool,
    D: Fn(Color, Color) -> i32,
    P: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
    H: Fn(&ClustersView, &Cluster, &[NeighbourInfo]) -> bool,
{
    pub fn tick(&mut self) -> bool {
        match self.stage {
            1 => {
                if self.stage_1() {
                    if self.hierarchical != 0 {
                        // Stage 1 -> 2 transition: clusters are still flat
                        // (no holes, no depth). Absorb tiny splinter clusters
                        // into similar neighbors before the deepen walk, then
                        // rebuild the stage-2 area index on the merged state.
                        self.absorb_tiny_clusters();
                        self.prepare_stage_2();
                        self.stage += 1;
                        self.iteration = 0;
                    } else {
                        self.stage_1_output();
                        self.stage += 2;
                    }
                }
                false
            },
            2 => {
                for _i in 0..std::cmp::max(1, self.iteration / 16) {
                    if self.stage_2() {
                        self.stage += 1;
                        self.iteration = 0;
                        break;
                    }
                }
                false
            },
            _ => true,
        }
    }

    pub fn get_cluster(&self, index: ClusterIndex) -> &Cluster {
        &self.clusters[index.0 as usize]
    }

    pub fn get_cluster_mut(&mut self, index: ClusterIndex) -> &mut Cluster {
        &mut self.clusters[index.0 as usize]
    }

    pub fn result(mut self) -> Clusters {
        // A cluster can be merged away after being pushed here, leaving an
        // empty sum and a cleared rect. Every accessor faults on it.
        self.clusters_output.retain(|i| self.clusters[i.0 as usize].sum.counter > 0);

        Clusters {
            width: self.width,
            height: self.height,
            pixels: self.pixels,
            clusters: self.clusters,
            cluster_indices: self.cluster_indices,
            clusters_output: self.clusters_output,
        }
    }

    pub fn view(&self) -> ClustersView<'_> {
        ClustersView {
            width: self.width,
            height: self.height,
            pixels: &self.pixels,
            clusters: &self.clusters,
            cluster_indices: &self.cluster_indices,
            clusters_output: &self.clusters_output,
        }
    }

    pub fn progress(&self) -> u32 {
        match self.stage {
            1 => {
                50 * self.iteration / self.cluster_indices.len() as u32
            },
            2 => {
                50 + 50 * self.iteration / self.cluster_areas.len() as u32
            },
            _ => {
                100
            }
        }
    }

    fn stage_1(&mut self) -> bool {
        let diagonal = self.diagonal;
        let batch_size = self.batch_size;
        let key = self.key;
        let keying_action = self.keying_action;
        let has_key = key != Color::default();
        let len = self.cluster_indices.len();

        for i in (self.iteration..(self.iteration + batch_size)).take_while(|&i| (i as usize) < len)
        {
            let x = (i % self.width) as i32;
            let y = (i / self.width) as i32;

            let color = self.pixel_at(x, y);
            let up = self.pixel_at(x, y - 1);
            let left = self.pixel_at(x - 1, y);
            let upleft = self.pixel_at(x - 1, y - 1);

            let mut cluster_up = if y > 0 {
                self.cluster_indices[(self.width as i32 * (y - 1) + x) as usize]
            } else {
                ZERO
            };
            let mut cluster_left = if x > 0 {
                self.cluster_indices[(self.width as i32 * y + (x - 1)) as usize]
            } else {
                ZERO
            };
            let cluster_upleft = if x > 0 && y > 0 {
                self.cluster_indices[(self.width as i32 * (y - 1) + (x - 1)) as usize]
            } else {
                ZERO
            };

            if cluster_left != cluster_up
                && self.is_same(left, up)
                && (diagonal || // if not diagonal, self color must be same as up & left
                self.is_same(color, left) &&
                self.is_same(color, up))
            {
                if self.get_cluster(cluster_left).area() <= self.get_cluster(cluster_up).area() {
                    self.combine_clusters(cluster_left, cluster_up);
                    if cluster_left.0 == self.next_index.0 - 1
                        && self.next_index.0 as usize == self.clusters.len()
                    {
                        // reduce cluster counts
                        self.next_index.0 -= 1;
                    }
                    cluster_left = cluster_up;
                } else {
                    self.combine_clusters(cluster_up, cluster_left);
                    cluster_up = cluster_left;
                }
            }

            let c = color.unwrap();

            if has_key && c == key {
                match keying_action {
                    KeyingAction::Keep => self.get_cluster_mut(ZERO).add(i, &c, x, y),
                    KeyingAction::Discard => {},
                }
            } else if self.is_same(color, up) && self.is_same(color, upleft) {
                self.cluster_indices[i as usize] = cluster_up;
                self.get_cluster_mut(cluster_up).add(i, &c, x, y);
            } else if self.is_same(color, left) && self.is_same(color, upleft) {
                self.cluster_indices[i as usize] = cluster_left;
                self.get_cluster_mut(cluster_left).add(i, &c, x, y);
            } else if diagonal && self.is_same(color, upleft) {
                self.cluster_indices[i as usize] = cluster_upleft;
                self.get_cluster_mut(cluster_upleft).add(i, &c, x, y);
            } else {
                let mut new_cluster = Cluster::new();
                new_cluster.add(i, &c, x, y);
                if (self.next_index.0 as usize) < self.clusters.len() {
                    self.clusters[self.next_index.0 as usize] = new_cluster;
                } else {
                    self.clusters.push(new_cluster);
                }
                self.cluster_indices[i as usize] = self.next_index;
                self.next_index.0 += 1;
            }
        }

        self.iteration += batch_size;
        if self.iteration as usize >= self.cluster_indices.len() {
            true
        } else {
            false
        }
    }

    fn stage_1_output(&mut self) {
        let mut output = Vec::new();
        for index in 0..self.clusters.len() {
            let index = ClusterIndex(index as ClusterIndexElem);
            let area = self.get_cluster(index).area();
            if area > 0 {
                output.push((index, area));
            }
        }
        output.sort_by_key(|c| c.1 as u64 * 65535 + c.0.0 as u64);
        output.iter().for_each(|c| self.clusters_output.push(c.0));
    }

    /// Absorb tiny splinter clusters into their most similar 4-neighbor.
    ///
    /// Called once at the stage 1 -> 2 transition, while clusters are still
    /// flat (no holes, no depth). Every cluster with area at or below
    /// tiny_merge_max_area is merged into the adjacent cluster whose average
    /// RGB is closest, provided the sum-of-abs-channel-diffs of the two
    /// averages is under tiny_merge_max_diff. Merging uses the existing
    /// merge_cluster_into with deepen=false, so pixels and color sums move
    /// without hierarchy bookkeeping; merged-away clusters are dropped from
    /// the output by the sum.counter > 0 retain in result().
    ///
    /// This consolidates the ~19k single-path linework splinters and noise
    /// speckles that stage 1 produces on JPEG-noisy cartoon art and photos:
    /// instead of one independent boundary walk per splinter (each placing
    /// its boundary 1-2px off), the merged region gets a single coherent
    /// walk. A no-op when tiny_merge_max_area is 0.
    ///
    /// The bridge-vs-outlier gate: when tiny_merge_max_neighbor_spread is
    /// positive, a tiny cluster whose distinct neighbors' average colors
    /// span a range wider than the spread budget is left alone. Such a
    /// cluster sits on a color boundary (a gradient-band step, a soft-alpha
    /// fringe between two regions); merging it collapses legitimate
    /// structure. An interior splinter is surrounded by one similar color
    /// and shows a narrow spread, so it still merges.
    ///
    /// The max-target-area gate: when tiny_merge_max_target_area is
    /// positive, neighbors larger than the cap are not eligible targets.
    /// Fragment-to-fragment consolidation (the skeleton win) uses small
    /// targets; fringe-into-flat merges (the wikipedia regression) use
    /// large ones.
    fn absorb_tiny_clusters(&mut self) {
        let max_area = self.tiny_merge_max_area;
        let max_diff = self.tiny_merge_max_diff;
        let min_target_area = self.tiny_merge_min_target_area;
        let max_target_area = self.tiny_merge_max_target_area;
        let max_spread = self.tiny_merge_max_neighbor_spread;
        let max_pixel_spread = self.tiny_merge_max_pixel_spread;
        if max_area == 0 || max_diff <= 0 {
            return;
        }
        let width = self.width as i32;
        let height = self.height as i32;
        let num_clusters = self.clusters.len();
        const OFFSETS: [(i32, i32); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];
        for ci in 1..num_clusters {
            let area = self.clusters[ci].area();
            if area == 0 || area > max_area {
                continue;
            }
            let avg = average_cluster_color(&self.clusters[ci]);
            let indices = self.clusters[ci].indices.clone();
            if max_pixel_spread > 0 {
                // Pixel-spread gate: skip clusters whose own pixels span a
                // wider color range than the budget. Blend-ramp clusters
                // (soft-alpha fringes) have wide pixel spreads even when
                // their average sits close to a neighbor; noise speckles
                // and linework fragments are nearly uniform.
                let mut pr = (i32::MAX, i32::MIN);
                let mut pg = (i32::MAX, i32::MIN);
                let mut pb = (i32::MAX, i32::MIN);
                for &i in indices.iter() {
                    let b = (i as usize) * 4;
                    let r = self.pixels[b] as i32;
                    let g = self.pixels[b + 1] as i32;
                    let bl = self.pixels[b + 2] as i32;
                    pr = (pr.0.min(r), pr.1.max(r));
                    pg = (pg.0.min(g), pg.1.max(g));
                    pb = (pb.0.min(bl), pb.1.max(bl));
                }
                if (pr.1 - pr.0) + (pg.1 - pg.0) + (pb.1 - pb.0) > max_pixel_spread {
                    continue;
                }
            }
            let mut tried: Vec<u32> = Vec::new();
            let mut best: Option<u32> = None;
            let mut best_diff = max_diff;
            let mut spread_r = (i32::MAX, i32::MIN);
            let mut spread_g = (i32::MAX, i32::MIN);
            let mut spread_b = (i32::MAX, i32::MIN);
            let mut spread_count = 0u32;
            for &i in indices.iter() {
                let x = (i as i32) % width;
                let y = (i as i32) / width;
                for (dx, dy) in OFFSETS.iter() {
                    let nx = x + dx;
                    let ny = y + dy;
                    if nx < 0 || ny < 0 || nx >= width || ny >= height {
                        continue;
                    }
                    let ni = self.cluster_indices[(ny * width + nx) as usize].0;
                    if ni == ci as u32 || tried.contains(&ni) {
                        continue;
                    }
                    tried.push(ni);
                    let narea = self.clusters[ni as usize].area();
                    if narea == 0
                        || narea < min_target_area
                        || (max_target_area > 0 && narea > max_target_area)
                    {
                        continue;
                    }
                    let navg = average_cluster_color(&self.clusters[ni as usize]);
                    if max_spread > 0 {
                        spread_r = (spread_r.0.min(navg.0), spread_r.1.max(navg.0));
                        spread_g = (spread_g.0.min(navg.1), spread_g.1.max(navg.1));
                        spread_b = (spread_b.0.min(navg.2), spread_b.1.max(navg.2));
                        spread_count += 1;
                    }
                    let diff = (avg.0 - navg.0).abs()
                        + (avg.1 - navg.1).abs()
                        + (avg.2 - navg.2).abs();
                    if diff < best_diff {
                        best_diff = diff;
                        best = Some(ni);
                    }
                }
            }
            if max_spread > 0
                && spread_count > 0
                && (spread_r.1 - spread_r.0)
                    + (spread_g.1 - spread_g.0)
                    + (spread_b.1 - spread_b.0)
                    > max_spread
            {
                continue;
            }
            if let Some(target) = best {
                self.merge_cluster_into(
                    ClusterIndex(ci as u32),
                    ClusterIndex(target),
                    false,
                    false,
                );
            }
        }
    }

    fn prepare_stage_2(&mut self) {
        for c in self.clusters.iter_mut() {
            c.residue_sum = c.sum;
        }

        let mut counts = HashMap::new();

        for area in self
            .clusters
            .iter()
            .filter(|c| c.area() > 0)
            .map(|c| c.area())
        {
            *counts.entry(area).or_insert(0) += 1;
        }

        let mut areas = counts
            .into_iter()
            .map(|(k, v)| Area { area: k, count: v })
            .collect::<Vec<_>>();

        areas.sort_by_key(|a| a.area);

        self.cluster_areas = areas;
    }

    fn stage_2(&mut self) -> bool {
        if self.cluster_areas.is_empty() {
            return true;
        }
        if self.cluster_areas[self.iteration as usize].count == 0 {
            self.iteration += 1;
            if self.iteration as usize == self.cluster_areas.len() {
                return true;
            }
            return false;
        }

        let cur_area = self.cluster_areas[self.iteration as usize].area;
        let can_discard_pixels = matches!(self.keying_action, KeyingAction::Discard) && self.key != Color::default();

        for index in 0..self.clusters.len() {

            let index = ClusterIndex(index as ClusterIndexElem);
            let mycluster = self.get_cluster(index);

            if mycluster.area() != cur_area {
                continue;
            }

            if cur_area > self.hierarchical as usize {
                self.clusters_output.push(index);
                continue;
            }

            let mycolor = mycluster.color();
            let mut infos: Vec<_> = mycluster
                .neighbours(&self.view())
                .iter()
                // Merged-away clusters have no sum left to rank. Not `area()`:
                // one merged into itself keeps its indices but loses its sum.
                .filter(|other| self.get_cluster(**other).sum.counter > 0)
                .map(|other| NeighbourInfo {
                    index: *other,
                    diff: (self.diff)(mycolor, self.get_cluster(*other).color()),
                })
                .collect();

            if infos.is_empty() {
                if self.iteration == self.cluster_areas.len() as ClusterIndexElem - 1  || can_discard_pixels {
                    // this is either the final background, or an isolated cluster surrounded by keyed, discarded pixels
                    self.clusters_output.push(index);
                }
                continue;
            }

            infos.sort_by_key(|info| info.diff as i64 * 65535 + info.index.0 as i64);

            let target = infos[0].index;

            let deepen = if self.hierarchical == HIERARCHICAL_MAX {
                (self.deepen)(&self.view(), self.get_cluster(index), &infos)
            } else {
                false
            };
            let hollow = (self.hollow)(&self.view(), self.get_cluster(index), &infos);

            if deepen {
                self.clusters_output.push(index);
            }

            let target_in_areas = self
                .cluster_areas
                .binary_search_by_key(&self.clusters[target.0 as usize].area(), |a| a.area)
                .unwrap();

            self.cluster_areas[target_in_areas].count -= 1;
            self.merge_cluster_into(index, target, deepen, hollow);
            let updated_area = self.clusters[target.0 as usize].area();

            match self
                .cluster_areas
                .binary_search_by_key(&updated_area, |a| a.area)
            {
                Ok(pos) => self.cluster_areas[pos].count += 1,
                Err(pos) => self.cluster_areas.insert(
                    pos,
                    Area {
                        area: updated_area,
                        count: 1,
                    },
                ),
            }
        }

        self.iteration += 1;
        self.iteration as usize == self.cluster_areas.len()
    }

    pub fn merge_cluster_into(&mut self, from: ClusterIndex, to: ClusterIndex, deepen: bool, hollow: bool) {
        if !deepen {
            let residue_sum = self.clusters[from.0 as usize].residue_sum;
            self.clusters[to.0 as usize].residue_sum.merge(&residue_sum);
            self.combine_clusters(from, to);
        } else {
            self.combine_clusters_clone(from, to);

            if hollow {
                let mut holes = self.clusters[from.0 as usize].indices.clone();
                self.clusters[to.0 as usize].holes.append(&mut holes);
                self.clusters[to.0 as usize].num_holes += 1;
            }

            self.clusters[from.0 as usize].merged_into = to;
            self.clusters[to.0 as usize].depth += 1;
        }
    }

    fn combine_clusters_clone(&mut self, from: ClusterIndex, to: ClusterIndex) {
        let sum = self.clusters[from.0 as usize].sum;
        let rect = self.clusters[from.0 as usize].rect;
        let indices = self.clusters[from.0 as usize].indices.clone();

        self.combine_clusters(from, to);

        self.clusters[from.0 as usize].sum = sum;
        self.clusters[from.0 as usize].rect = rect;
        self.clusters[from.0 as usize].indices = indices;
    }

    fn combine_clusters(&mut self, from: ClusterIndex, to: ClusterIndex) {
        for &i in self.clusters[from.0 as usize].indices.iter() {
            self.cluster_indices[i as usize] = to;
        }

        let mut indices = std::mem::take(&mut self.clusters[from.0 as usize].indices);
        self.clusters[to.0 as usize].indices.append(&mut indices);
        let sum = self.clusters[from.0 as usize].sum;
        let rect = self.clusters[from.0 as usize].rect;
        self.clusters[to.0 as usize].sum.merge(&sum);
        self.clusters[to.0 as usize].rect.merge(rect);
        self.clusters[from.0 as usize].sum.clear();
        self.clusters[from.0 as usize].rect.clear();
    }

    fn is_same(&self, left: Option<Color>, right: Option<Color>) -> bool {
        if let (Some(l), Some(r)) = (left, right) {
            (self.same)(l, r)
        } else {
            false
        }
    }

    fn pixel_at(&self, x: i32, y: i32) -> Option<Color> {
        if x < 0 || y < 0 {
            return None;
        }

        self.get_pixel(y as u32 * self.width + x as u32)
    }

    fn get_pixel(&self, i: u32) -> Option<Color> {
        let i = i as usize * 4;
        if i < self.pixels.len() {
            Some(Color::new_rgba(
                self.pixels[i],
                self.pixels[i + 1],
                self.pixels[i + 2],
                self.pixels[i + 3],
            ))
        } else {
            None
        }
    }
}

/// Average RGB of a cluster's pixels, as (r, g, b). Used to pick the most
/// similar absorption target for tiny clusters.
fn average_cluster_color(cluster: &Cluster) -> (i32, i32, i32) {
    let counter = cluster.sum.counter.max(1) as i32;
    (
        cluster.sum.r as i32 / counter,
        cluster.sum.g as i32 / counter,
        cluster.sum.b as i32 / counter,
    )
}
