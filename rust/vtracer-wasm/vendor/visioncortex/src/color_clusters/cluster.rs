use std::collections::HashSet;
use crate::{BinaryImage, BoundingRect, Color, ColorImage, ColorSum, CompoundPath, PointI32, PathSimplifyMode, Shape};
use crate::clusters::Cluster as BinaryCluster;
use super::container::{ClusterIndex, ClustersView};
use super::builder::ZERO;

#[derive(Clone, Default)]
pub struct Cluster {
    pub indices: Vec<u32>,
    pub holes: Vec<u32>,
    pub num_holes: u32,
    pub depth: u32,
    pub sum: ColorSum,
    pub residue_sum: ColorSum,
    pub rect: BoundingRect,
    pub merged_into: ClusterIndex,
    /// Per-channel min/max of member pixel RGB. Used to bound the color
    /// spread a shallow merge may accumulate: chained shallow merges can
    /// drift the average far from the member pixels, painting large
    /// regions with a color none of them have.
    pub min_rgb: [u8; 3],
    pub max_rgb: [u8; 3],
}

impl Cluster {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, i: u32, color: &Color, x: i32, y: i32) {
        if self.indices.is_empty() {
            self.min_rgb = [color.r, color.g, color.b];
            self.max_rgb = [color.r, color.g, color.b];
        } else {
            self.min_rgb[0] = self.min_rgb[0].min(color.r);
            self.min_rgb[1] = self.min_rgb[1].min(color.g);
            self.min_rgb[2] = self.min_rgb[2].min(color.b);
            self.max_rgb[0] = self.max_rgb[0].max(color.r);
            self.max_rgb[1] = self.max_rgb[1].max(color.g);
            self.max_rgb[2] = self.max_rgb[2].max(color.b);
        }
        self.indices.push(i);
        self.sum.add(color);
        self.rect.add_x_y(x, y);
    }

    /// Sum of per-channel ranges (max minus min) of member pixel RGB.
    pub fn color_spread(&self) -> i32 {
        (self.max_rgb[0] as i32 - self.min_rgb[0] as i32)
            + (self.max_rgb[1] as i32 - self.min_rgb[1] as i32)
            + (self.max_rgb[2] as i32 - self.min_rgb[2] as i32)
    }

    /// Sum of per-channel ranges the cluster would have after absorbing
    /// `other`'s pixels.
    pub fn merged_spread(&self, other: &Cluster) -> i32 {
        let mut spread = 0i32;
        for c in 0..3 {
            spread += (self.max_rgb[c].max(other.max_rgb[c]) as i32)
                - (self.min_rgb[c].min(other.min_rgb[c]) as i32);
        }
        spread
    }

    pub fn area(&self) -> usize {
        self.indices.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &u32> {
        self.indices.iter()
    }

    pub fn color(&self) -> Color {
        self.sum.average()
    }

    pub fn residue_color(&self) -> Color {
        self.residue_sum.average()
    }
    
    pub fn perimeter(&self, parent: &ClustersView) -> u32 {
        Shape::image_boundary_list(&self.to_image(parent)).len() as u32
    }

    pub fn to_image(&self, parent: &ClustersView) -> BinaryImage {
        self.to_image_with_hole(parent.width, true)
    }

    pub fn to_image_with_hole(&self, parent_width: u32, hole: bool) -> BinaryImage {
        let width = self.rect.width() as usize;
        let height = self.rect.height() as usize;
        let mut image = BinaryImage::new_w_h(width, height);

        for &i in self.iter() {
            let x = (i as i32 % parent_width as i32) - self.rect.left;
            let y = (i as i32 / parent_width as i32) - self.rect.top;
            image.set_pixel(x as usize, y as usize, true);
        }

        if hole {
            for &i in self.holes.iter() {
                let x = (i as i32 % parent_width as i32) - self.rect.left;
                let y = (i as i32 / parent_width as i32) - self.rect.top;
                image.set_pixel(x as usize, y as usize, false);
            }
        }

        image
    }

    pub fn render_to_binary_image(&self, parent: &ClustersView, image: &mut BinaryImage) {
        for &i in self.iter() {
            let x = i % parent.width;
            let y = i / parent.width;
            image.set_pixel(x as usize, y as usize, true);
        }
    }

    pub fn render_to_color_image(&self, parent: &ClustersView, image: &mut ColorImage) {
        let color = self.residue_color();
        self.render_to_color_image_with_color(parent, image, &color);
    }

    pub fn render_to_color_image_with_color(&self, parent: &ClustersView, image: &mut ColorImage, color: &Color) {
        for &i in self.iter() {
            let x = i % parent.width;
            let y = i / parent.width;
            image.set_pixel(x as usize, y as usize, &color);
        }
    }

    pub fn to_shape(&self, parent: &ClustersView) -> Shape {
        self.to_image(parent).into()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn to_compound_path(&self,
        parent: &ClustersView,
        hole: bool,
        mode: PathSimplifyMode,
        corner_threshold: f64,
        length_threshold: f64,
        max_iterations: usize,
        splice_threshold: f64
    ) -> CompoundPath {
        let mut paths = CompoundPath::new();
        for cluster in self.to_image_with_hole(parent.width, hole).to_clusters(false).iter() {
            paths.append(
                BinaryCluster::image_to_compound_path(&PointI32 {
                    x: self.rect.left + cluster.rect.left,
                    y: self.rect.top + cluster.rect.top,
                }, &cluster.to_binary_image(), mode,
                corner_threshold, length_threshold, max_iterations, splice_threshold)
            );
        }
        paths
    }
}


macro_rules! neighbours_impl {
    ($self:expr, $parent:expr, $myself:expr) => {{
        let myself = $myself;
        let parent = $parent;
        let mut neighbours = HashSet::new();

        for &i in $self.iter() {
            let x = i % parent.width;
            let y = i / parent.width;

            for k in 0..4 {
                let index = match k {
                    0 => if y > 0 { parent.cluster_indices[(parent.width * (y - 1) + x) as usize] } else { ZERO },
                    1 => if y < parent.height - 1 { parent.cluster_indices[(parent.width * (y + 1) + x) as usize] } else { ZERO },
                    2 => if x > 0 { parent.cluster_indices[(parent.width * y + (x - 1)) as usize] } else { ZERO },
                    3 => if x < parent.width - 1 { parent.cluster_indices[(parent.width * y + (x + 1)) as usize] } else { ZERO },
                    _ => unreachable!(),
                };
                if index != ZERO && index != myself {
                    neighbours.insert(index);
                }
            }
        }

        let mut list: Vec<ClusterIndex> = neighbours.into_iter().collect();
        list.sort();
        list
    }};
}

impl Cluster {
    pub fn neighbours(&self, parent: &ClustersView) -> Vec<ClusterIndex> {
        neighbours_impl!(self, parent, parent.get_cluster_at(*self.indices.first().unwrap()))
    }

}
