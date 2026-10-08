use visioncortex::color_clusters::{KeyingAction, Runner, RunnerConfig};
use visioncortex::{Color, ColorImage, CompoundPath, PathSimplifyMode, PointF64};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct Options {
    pub binary: bool,
    pub stacked: bool,
    pub spline: bool,
    pub filter_speckle: usize,
    pub color_precision: i32,
    pub layer_difference: i32,
    pub corner_threshold: f64,
    pub length_threshold: f64,
    pub splice_threshold: f64,
    pub max_iterations: usize,
    pub path_precision: u32,
    pub smooth: u32,
    pub threshold: u8,
}

#[wasm_bindgen]
impl Options {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Options {
        Options {
            binary: false,
            stacked: true,
            spline: true,
            filter_speckle: 4,
            color_precision: 6,
            layer_difference: 16,
            corner_threshold: 60.0,
            length_threshold: 4.0,
            splice_threshold: 45.0,
            max_iterations: 10,
            path_precision: 2,
            smooth: 1,
            threshold: 128,
        }
    }
}

fn bilateral(img: &mut ColorImage, passes: u32) {
    let (w, h) = (img.width, img.height);
    for _ in 0..passes {
        let src = img.pixels.clone();
        for y in 0..h {
            for x in 0..w {
                let i = (y * w + x) * 4;
                if src[i + 3] == 0 {
                    continue;
                }
                let mut acc = [0f32; 3];
                let mut wsum = 0f32;
                for dy in -2i32..=2 {
                    for dx in -2i32..=2 {
                        let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                        if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                            continue;
                        }
                        let j = (ny as usize * w + nx as usize) * 4;
                        if src[j + 3] == 0 {
                            continue;
                        }
                        let cd: i32 = (0..3)
                            .map(|c| {
                                let d = src[i + c] as i32 - src[j + c] as i32;
                                d * d
                            })
                            .sum();
                        let sd = (dx * dx + dy * dy) as f32;
                        let wt = (-sd / 4.5 - cd as f32 / 1800.0).exp();
                        for c in 0..3 {
                            acc[c] += wt * src[j + c] as f32;
                        }
                        wsum += wt;
                    }
                }
                for c in 0..3 {
                    img.pixels[i + c] = (acc[c] / wsum).round() as u8;
                }
            }
        }
    }
}

fn emit(out: &mut String, paths: &CompoundPath, color: Color, o: &Options) -> bool {
    let (d, off) = paths.to_svg_string(true, PointF64::default(), Some(o.path_precision));
    if d.is_empty() {
        return false;
    }
    out.push_str(&format!(
        "<path d=\"{}\" fill=\"#{:02x}{:02x}{:02x}\" transform=\"translate({},{})\"/>",
        d, color.r, color.g, color.b, off.x, off.y
    ));
    true
}

#[wasm_bindgen]
pub fn vectorize(rgba: &[u8], width: usize, height: usize, o: &Options) -> String {
    let mode = if o.spline { PathSimplifyMode::Spline } else { PathSimplifyMode::Polygon };
    let mut img = ColorImage { pixels: rgba.to_vec(), width, height };
    if o.smooth > 0 {
        bilateral(&mut img, o.smooth);
    }
    let mut svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" width=\"{w}\" height=\"{h}\" viewBox=\"0 0 {w} {h}\">",
        w = width,
        h = height
    );
    let has_alpha = img.pixels.chunks_exact(4).any(|p| p[3] < 128);
    if o.binary {
        let bin = img.to_binary_image(|c| {
            c.a >= 128 && ((c.r as u32 * 299 + c.g as u32 * 587 + c.b as u32 * 114) / 1000) < o.threshold as u32
        });
        for cl in bin.to_clusters(false).iter() {
            let p = cl.to_compound_path(mode, o.corner_threshold.to_radians(), o.length_threshold, o.max_iterations, o.splice_threshold.to_radians());
            emit(&mut svg, &p, Color::new(0, 0, 0), o);
        }
    } else {
        let mut key = Color::default();
        if has_alpha {
            key = [(255u8, 0u8, 255u8), (0, 255, 0), (0, 0, 255), (255, 255, 0), (1, 2, 3)]
                .iter()
                .map(|&(r, g, b)| Color::new(r, g, b))
                .find(|k| !img.pixels.chunks_exact(4).any(|p| p[3] >= 128 && p[0] == k.r && p[1] == k.g && p[2] == k.b))
                .unwrap();
            for p in img.pixels.chunks_exact_mut(4) {
                if p[3] < 128 {
                    p[0] = key.r;
                    p[1] = key.g;
                    p[2] = key.b;
                }
                p[3] = 255;
            }
        }
        let cfg = RunnerConfig {
            diagonal: false,
            hierarchical: if o.stacked { visioncortex::color_clusters::HIERARCHICAL_MAX } else { 1 },
            batch_size: 25600,
            good_min_area: o.filter_speckle * o.filter_speckle,
            good_max_area: width * height,
            is_same_color_a: 8 - o.color_precision.clamp(1, 8),
            is_same_color_b: 1,
            deepen_diff: o.layer_difference,
            hollow_neighbours: 1,
            key_color: key,
            keying_action: if has_alpha { KeyingAction::Discard } else { KeyingAction::Keep },
        };
        let clusters = Runner::new(cfg, img).run();
        let view = clusters.view();
        for &i in view.clusters_output.iter().rev() {
            let cl = view.get_cluster(i);
            let p = cl.to_compound_path(&view, !o.stacked, mode, o.corner_threshold.to_radians(), o.length_threshold, o.max_iterations, o.splice_threshold.to_radians());
            emit(&mut svg, &p, cl.residue_color(), o);
        }
    }
    svg.push_str("</svg>");
    svg
}
