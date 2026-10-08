use crate::{hex, Options};
use visioncortex::Color;
use wasm_bindgen::prelude::*;

mod geom;
mod paint;
mod raster;
mod shape;

use geom::{emit_d, parse, scaled};
use paint::{optimise_gradients, Grad};
use raster::downscale;
use shape::{colors, fields, optimise, stack_of, Settings};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance)]
    fn now() -> f64;
}

const WORK_DIM: f32 = 512.0;
const LEVELS: [f32; 3] = [128.0, 256.0, 512.0];

fn q8(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

fn color(c: [f32; 3]) -> Color {
    Color::new(q8(c[0]), q8(c[1]), q8(c[2]))
}

fn level_scales(maxdim: f32) -> Vec<f32> {
    let mut out: Vec<f32> = Vec::new();
    for d in LEVELS {
        let s = (d / maxdim).min(1.0);
        if out.last().map_or(true, |&l| s > l + 1e-4) {
            out.push(s);
        }
    }
    out
}

fn dims(sw: usize, sh: usize, s: f32) -> (usize, usize) {
    (((sw as f32 * s).round() as usize).max(1), ((sh as f32 * s).round() as usize).max(1))
}

fn shape_stage(layers: &mut Vec<geom::Layer>, rgba: &[u8], sw: usize, sh: usize, o: &Options, deadline: f64) {
    let mut scales = level_scales(sw.max(sh) as f32);
    let keep = (o.refine_levels as usize).clamp(1, scales.len());
    scales = scales.split_off(scales.len() - keep);
    let weights: Vec<f32> = scales.iter().enumerate().map(|(i, _)| if i + 1 == scales.len() { 2.0 } else { 1.0 }).collect();
    let total: f32 = weights.iter().sum();
    let f = fields(rgba, sw, sh);
    for (i, &s) in scales.iter().enumerate() {
        if now() > deadline {
            break;
        }
        let iters = ((o.refine_shape_iters as f32 * weights[i] / total).round() as usize).max(2);
        let (w, h) = dims(sw, sh, s);
        let target = downscale(rgba, sw, sh, w, h);
        let mut work = scaled(layers, s);
        let cfg = Settings { lambda: o.refine_edge as f32, lr: o.refine_lr as f32, cap: o.refine_cap as f32, solid: o.refine_solid };
        optimise(&mut work, &target, w, h, &f, s, iters, &cfg, deadline);
        let mut back = scaled(&work, 1.0 / s);
        for (b, l) in back.iter_mut().zip(layers.iter()) {
            b.off = l.off;
            b.src = l.src;
            for (bs, ls) in b.subs.iter_mut().zip(l.subs.iter()) {
                for (bp, lp) in bs.pts.iter_mut().zip(ls.pts.iter()) {
                    if geom::dist(*bp, *lp) < o.refine_dead as f32 {
                        *bp = *lp;
                    }
                }
            }
        }
        *layers = back;
    }
}

pub fn run(rgba: &[u8], sw: usize, sh: usize, svg: &str, o: &Options) -> String {
    let t0 = now();
    let deadline = t0 + o.refine_ms;
    let (mut layers, head) = match parse(svg) {
        Some(p) => p,
        None => return svg.to_string(),
    };
    if o.refine_shape && o.refine_shape_iters > 0 {
        let share = if o.refine_gradients { 0.6 } else { 1.0 };
        shape_stage(&mut layers, rgba, sw, sh, o, t0 + o.refine_ms * share);
    }
    let s = (WORK_DIM / sw.max(sh) as f32).min(1.0);
    let (w, h) = dims(sw, sh, s);
    let mut grads: Vec<Option<Grad>> = vec![None; layers.len()];
    if o.refine_gradients && o.refine_iters > 0 {
        let work = scaled(&layers, s);
        let st = stack_of(&work, w, h);
        let target = downscale(rgba, sw, sh, w, h);
        let solid = colors(&work);
        let mut target_u8 = vec![255u8; w * h * 4];
        for i in 0..w * h {
            for c in 0..3 {
                target_u8[i * 4 + c] = q8(target[i * 3 + c]);
            }
        }
        grads = optimise_gradients(&st, &target, &solid, &target_u8, o.refine_iters as usize, deadline, o.refine_gain as f32);
    }
    let mut out = String::with_capacity(svg.len() + 4096);
    let mut defs = String::new();
    out.push_str(&svg[..head]);
    for (k, l) in layers.iter().enumerate() {
        let d = match (o.refine_precision, l.src) {
            (0, Some((a, b))) => svg[a..b].to_string(),
            _ => emit_d(l, o.refine_precision.max(1)),
        };
        let paint = match &grads[k] {
            Some(g) => {
                let id = defs.matches("<linearGradient").count();
                defs.push_str(&format!(
                    "<linearGradient id=\"r{}\" gradientUnits=\"userSpaceOnUse\" x1=\"{:.1}\" y1=\"{:.1}\" x2=\"{:.1}\" y2=\"{:.1}\"><stop stop-color=\"{}\"/><stop offset=\"1\" stop-color=\"{}\"/></linearGradient>",
                    id,
                    g.a[0] / s - l.off.0,
                    g.a[1] / s - l.off.1,
                    g.b[0] / s - l.off.0,
                    g.b[1] / s - l.off.1,
                    hex(color(g.c0)),
                    hex(color(g.c1))
                ));
                format!("url(#r{})", id)
            }
            None => hex(color(l.color)),
        };
        out.push_str(&format!("<path d=\"{}\" fill=\"{}\" transform=\"translate({},{})\"/>", d, paint, l.off.0, l.off.1));
    }
    out.push_str("</svg>");
    if !defs.is_empty() {
        let at = out.find('>').unwrap() + 1;
        out.insert_str(at, &format!("<defs>{}</defs>", defs));
    }
    out
}
