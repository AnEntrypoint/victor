use visioncortex::color_clusters::{KeyingAction, Runner, RunnerConfig};
use visioncortex::{Color, ColorImage, CompoundPath, PathSimplifyMode, PointF64};
use wasm_bindgen::prelude::*;

mod refine;

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
    pub gradients: bool,
    pub gradient_gain: f64,
    pub refine: bool,
    pub refine_iters: u32,
    pub refine_ms: f64,
    pub refine_gradients: bool,
    pub refine_solid: bool,
    pub refine_gain: f64,
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
            gradients: false,
            gradient_gain: 0.35,
            refine: false,
            refine_iters: 120,
            refine_ms: 1500.0,
            refine_gradients: true,
            refine_solid: false,
            refine_gain: 400.0,
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

fn hex(c: Color) -> String {
    format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
}

fn fit_gradient(src: &[u8], w: usize, idx: &[u32], gain_min: f64) -> Option<([f64; 4], Color, Color)> {
    let n = idx.len() as f64;
    if idx.len() < 96 {
        return None;
    }
    let (mut mx, mut my, mut mc) = (0.0, 0.0, [0.0f64; 3]);
    for &i in idx {
        let (x, y) = ((i as usize % w) as f64, (i as usize / w) as f64);
        mx += x;
        my += y;
        for c in 0..3 {
            mc[c] += src[i as usize * 4 + c] as f64;
        }
    }
    mx /= n;
    my /= n;
    for c in 0..3 {
        mc[c] /= n;
    }
    let (mut sxx, mut sxy, mut syy, mut sxc, mut syc, mut vc) = (0.0, 0.0, 0.0, [0.0f64; 3], [0.0f64; 3], [0.0f64; 3]);
    for &i in idx {
        let (x, y) = ((i as usize % w) as f64 - mx, (i as usize / w) as f64 - my);
        sxx += x * x;
        sxy += x * y;
        syy += y * y;
        for c in 0..3 {
            let v = src[i as usize * 4 + c] as f64 - mc[c];
            sxc[c] += x * v;
            syc[c] += y * v;
            vc[c] += v * v;
        }
    }
    let det = sxx * syy - sxy * sxy;
    if det.abs() < 1e-6 * (sxx * syy).max(1.0) {
        return None;
    }
    let (mut a, mut b, mut cc) = (0.0, 0.0, 0.0);
    for c in 0..3 {
        let gx = (syy * sxc[c] - sxy * syc[c]) / det;
        let gy = (sxx * syc[c] - sxy * sxc[c]) / det;
        a += gx * gx;
        b += gx * gy;
        cc += gy * gy;
    }
    let tr = a + cc;
    let disc = ((a - cc) * (a - cc) / 4.0 + b * b).sqrt();
    let l1 = tr / 2.0 + disc;
    let (mut dx, mut dy) = if b.abs() > 1e-12 { (l1 - cc, b) } else if a >= cc { (1.0, 0.0) } else { (0.0, 1.0) };
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-12 {
        return None;
    }
    dx /= len;
    dy /= len;
    let (mut vt, mut ct, mut tmin, mut tmax) = (0.0, [0.0f64; 3], f64::MAX, f64::MIN);
    for &i in idx {
        let (x, y) = ((i as usize % w) as f64 - mx, (i as usize / w) as f64 - my);
        let t = x * dx + y * dy;
        vt += t * t;
        tmin = tmin.min(t);
        tmax = tmax.max(t);
        for c in 0..3 {
            ct[c] += t * (src[i as usize * 4 + c] as f64 - mc[c]);
        }
    }
    if vt < 1e-9 {
        return None;
    }
    let total: f64 = vc.iter().sum();
    let explained: f64 = ct.iter().map(|v| v * v / vt).sum();
    if total < 1e-9 || explained / total < gain_min || (explained / n / 3.0).sqrt() < 2.0 {
        return None;
    }
    let at = |t: f64| {
        let f = |c: usize| (mc[c] + ct[c] / vt * t).round().clamp(0.0, 255.0) as u8;
        Color::new(f(0), f(1), f(2))
    };
    Some(([mx + 0.5 + dx * tmin, my + 0.5 + dy * tmin, mx + 0.5 + dx * tmax, my + 0.5 + dy * tmax], at(tmin), at(tmax)))
}

fn emit(out: &mut String, defs: &mut String, paths: &CompoundPath, fill: Result<Color, ([f64; 4], Color, Color)>, o: &Options) -> bool {
    let (d, off) = paths.to_svg_string(true, PointF64::default(), Some(o.path_precision));
    if d.is_empty() {
        return false;
    }
    let paint = match fill {
        Ok(c) => hex(c),
        Err((g, c1, c2)) => {
            let id = defs.matches("<linearGradient").count();
            defs.push_str(&format!(
                "<linearGradient id=\"g{}\" gradientUnits=\"userSpaceOnUse\" x1=\"{:.1}\" y1=\"{:.1}\" x2=\"{:.1}\" y2=\"{:.1}\"><stop stop-color=\"{}\"/><stop offset=\"1\" stop-color=\"{}\"/></linearGradient>",
                id, g[0] - off.x, g[1] - off.y, g[2] - off.x, g[3] - off.y, hex(c1), hex(c2)
            ));
            format!("url(#g{})", id)
        }
    };
    out.push_str(&format!("<path d=\"{}\" fill=\"{}\" transform=\"translate({},{})\"/>", d, paint, off.x, off.y));
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
    let mut defs = String::new();
    if o.binary {
        let bin = img.to_binary_image(|c| {
            c.a >= 128 && ((c.r as u32 * 299 + c.g as u32 * 587 + c.b as u32 * 114) / 1000) < o.threshold as u32
        });
        for cl in bin.to_clusters(false).iter() {
            let p = cl.to_compound_path(mode, o.corner_threshold.to_radians(), o.length_threshold, o.max_iterations, o.splice_threshold.to_radians());
            emit(&mut svg, &mut defs, &p, Ok(Color::new(0, 0, 0)), o);
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
        let src = img.pixels.clone();
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
            let fill = if o.gradients {
                match fit_gradient(&src, width, &cl.indices, o.gradient_gain) {
                    Some(g) => Err(g),
                    None => Ok(cl.residue_color()),
                }
            } else {
                Ok(cl.residue_color())
            };
            emit(&mut svg, &mut defs, &p, fill, o);
        }
    }
    if !defs.is_empty() {
        let at = svg.find('>').unwrap() + 1;
        svg.insert_str(at, &format!("<defs>{}</defs>", defs));
    }
    svg.push_str("</svg>");
    if o.refine && !o.binary && !o.gradients && !has_alpha {
        svg = refine::run(rgba, width, height, &svg, o);
    }
    svg
}
