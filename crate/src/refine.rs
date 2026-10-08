use crate::{fit_gradient, hex, Options};
use visioncortex::Color;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance)]
    fn now() -> f64;
}

const WORK_DIM: f32 = 512.0;
const MIN_WEIGHT: f32 = 1.0 / 400.0;
const MIN_AREA: f32 = 80.0;
const INTERIOR: f32 = 0.8;

struct PathEl {
    polys: Vec<Vec<(f32, f32)>>,
    fill: (usize, usize),
    off: (f32, f32),
    color: [f32; 3],
}

#[derive(Clone, Copy)]
struct Grad {
    c0: [f32; 3],
    c1: [f32; 3],
    a: [f32; 2],
    b: [f32; 2],
}

struct Stack {
    w: usize,
    h: usize,
    entries: Vec<(u32, f32)>,
    ranges: Vec<(usize, usize)>,
    base: Vec<f32>,
}

fn parse_hex(s: &str) -> Option<[f32; 3]> {
    if s.len() != 7 || !s.starts_with('#') {
        return None;
    }
    let v = u32::from_str_radix(&s[1..], 16).ok()?;
    Some([(v >> 16 & 255) as f32, (v >> 8 & 255) as f32, (v & 255) as f32])
}

fn flatten(d: &str, off: (f32, f32), s: f32) -> Vec<Vec<(f32, f32)>> {
    let mut polys: Vec<Vec<(f32, f32)>> = Vec::new();
    let mut cmd = b'M';
    let mut nums: Vec<f32> = Vec::new();
    let bytes = d.as_bytes();
    let mut i = 0;
    let mut cur = (0f32, 0f32);
    let mut run = |cmd: u8, nums: &mut Vec<f32>, polys: &mut Vec<Vec<(f32, f32)>>, cur: &mut (f32, f32)| {
        let tf = |x: f32, y: f32| ((x + off.0) * s, (y + off.1) * s);
        match cmd {
            b'M' if nums.len() >= 2 => {
                *cur = tf(nums[0], nums[1]);
                polys.push(vec![*cur]);
            }
            b'L' if nums.len() >= 2 => {
                *cur = tf(nums[0], nums[1]);
                if let Some(p) = polys.last_mut() {
                    p.push(*cur);
                }
            }
            b'C' if nums.len() >= 6 => {
                let (c1, c2, e) = (tf(nums[0], nums[1]), tf(nums[2], nums[3]), tf(nums[4], nums[5]));
                let p0 = *cur;
                let len = dist(p0, c1) + dist(c1, c2) + dist(c2, e);
                let n = ((len / 1.5) as usize).clamp(2, 24);
                if let Some(p) = polys.last_mut() {
                    for k in 1..=n {
                        let t = k as f32 / n as f32;
                        let u = 1.0 - t;
                        let (b0, b1, b2, b3) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
                        p.push((
                            b0 * p0.0 + b1 * c1.0 + b2 * c2.0 + b3 * e.0,
                            b0 * p0.1 + b1 * c1.1 + b2 * c2.1 + b3 * e.1,
                        ));
                    }
                }
                *cur = e;
            }
            _ => {}
        }
        nums.clear();
    };
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_alphabetic() {
            if !nums.is_empty() {
                run(cmd, &mut nums, &mut polys, &mut cur);
            }
            cmd = c;
            i += 1;
        } else if c == b'-' || c == b'.' || c.is_ascii_digit() {
            let st = i;
            i += 1;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            nums.push(d[st..i].parse().unwrap_or(0.0));
            let need = match cmd {
                b'M' | b'L' => 2,
                b'C' => 6,
                _ => 99,
            };
            if nums.len() == need {
                run(cmd, &mut nums, &mut polys, &mut cur);
            }
        } else {
            i += 1;
        }
    }
    polys
}

fn dist(a: (f32, f32), b: (f32, f32)) -> f32 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

fn parse(svg: &str, s: f32) -> Option<Vec<PathEl>> {
    let mut out = Vec::new();
    let mut pos = 0;
    while let Some(i) = svg[pos..].find("<path d=\"") {
        let ds = pos + i + 9;
        let de = ds + svg[ds..].find('"')?;
        let fs = de + svg[de..].find(" fill=\"")? + 7;
        let fe = fs + svg[fs..].find('"')?;
        let color = parse_hex(&svg[fs..fe])?;
        let ts = fe + svg[fe..].find("translate(")? + 10;
        let te = ts + svg[ts..].find(')')?;
        let mut it = svg[ts..te].split(',');
        let off = (it.next()?.trim().parse().ok()?, it.next()?.trim().parse().ok()?);
        out.push(PathEl { polys: flatten(&svg[ds..de], off, s), fill: (fs, fe), off, color });
        pos = te;
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn accumulate(a: &mut [f32], stride: usize, bw: f32, bh: usize, mut p0: (f32, f32), mut p1: (f32, f32)) {
    if p0.1 == p1.1 {
        return;
    }
    let dir = if p0.1 < p1.1 {
        1.0
    } else {
        std::mem::swap(&mut p0, &mut p1);
        -1.0
    };
    let dxdy = (p1.0 - p0.0) / (p1.1 - p0.1);
    let ystart = p0.1.max(0.0);
    let yend = p1.1.min(bh as f32);
    if ystart >= yend {
        return;
    }
    let mut x = p0.0 + (ystart - p0.1) * dxdy;
    for y in ystart as usize..yend.ceil() as usize {
        let dy = ((y + 1) as f32).min(yend) - (y as f32).max(ystart);
        let xn = x + dxdy * dy;
        let d = dy * dir;
        let (xa, xb) = if x < xn { (x, xn) } else { (xn, x) };
        let (xa, xb) = (xa.clamp(0.0, bw), xb.clamp(0.0, bw));
        x = xn;
        let ls = y * stride;
        let (x0f, x1c) = (xa.floor(), xb.ceil());
        let (x0i, x1i) = (x0f as usize, x1c as usize);
        if x1i <= x0i + 1 {
            let xmf = 0.5 * (xa + xb) - x0f;
            a[ls + x0i] += d - d * xmf;
            a[ls + x0i + 1] += d * xmf;
        } else {
            let s = 1.0 / (xb - xa);
            let x0 = xa - x0f;
            let a0 = 0.5 * s * (1.0 - x0) * (1.0 - x0);
            let x1 = xb - x1c + 1.0;
            let am = 0.5 * s * x1 * x1;
            a[ls + x0i] += d * a0;
            if x1i == x0i + 2 {
                a[ls + x0i + 1] += d * (1.0 - a0 - am);
            } else {
                let a1 = s * (1.5 - x0);
                a[ls + x0i + 1] += d * (a1 - a0);
                for xi in x0i + 2..x1i - 1 {
                    a[ls + xi] += d * s;
                }
                let a2 = a1 + (x1i - x0i - 3) as f32 * s;
                a[ls + x1i - 1] += d * (1.0 - a2 - am);
            }
            a[ls + x1i] += d * am;
        }
    }
}

fn build_stack(els: &[PathEl], w: usize, h: usize) -> Stack {
    let n = w * h;
    let mut trans = vec![1f32; n];
    let mut scratch = vec![0f32; (w + 2) * h];
    let mut entries: Vec<(u32, f32)> = Vec::with_capacity(n + n / 4);
    let mut ranges = vec![(0usize, 0usize); els.len()];
    for k in (0..els.len()).rev() {
        let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for p in els[k].polys.iter().flatten() {
            minx = minx.min(p.0);
            maxx = maxx.max(p.0);
            miny = miny.min(p.1);
            maxy = maxy.max(p.1);
        }
        let start = entries.len();
        let x0 = minx.floor().max(0.0) as usize;
        let y0 = miny.floor().max(0.0) as usize;
        let x1 = (maxx.ceil().max(0.0) as usize).min(w);
        let y1 = (maxy.ceil().max(0.0) as usize).min(h);
        if x1 > x0 && y1 > y0 {
            let (bw, bh) = (x1 - x0, y1 - y0);
            let stride = bw + 2;
            for poly in &els[k].polys {
                if poly.len() < 2 {
                    continue;
                }
                for i in 0..poly.len() {
                    let (p, q) = (poly[i], poly[(i + 1) % poly.len()]);
                    accumulate(&mut scratch, stride, bw as f32, bh, (p.0 - x0 as f32, p.1 - y0 as f32), (q.0 - x0 as f32, q.1 - y0 as f32));
                }
            }
            for y in 0..bh {
                let mut acc = 0f32;
                for x in 0..bw {
                    acc += scratch[y * stride + x];
                    let alpha = acc.abs().min(1.0);
                    if alpha < 1.0 / 512.0 {
                        continue;
                    }
                    let pi = (y0 + y) * w + x0 + x;
                    let wt = alpha * trans[pi];
                    trans[pi] *= 1.0 - alpha;
                    if wt >= MIN_WEIGHT {
                        entries.push((pi as u32, wt));
                    }
                }
            }
            scratch[..stride * bh].fill(0.0);
        }
        ranges[k] = (start, entries.len());
    }
    let mut base = vec![0f32; n * 3];
    for i in 0..n {
        for c in 0..3 {
            base[i * 3 + c] = trans[i] * 255.0;
        }
    }
    Stack { w, h, entries, ranges, base }
}

fn downscale(rgba: &[u8], sw: usize, sh: usize, w: usize, h: usize) -> Vec<f32> {
    let mut out = vec![0f32; w * h * 3];
    for y in 0..h {
        let (ya, yb) = (y * sh / h, ((y + 1) * sh / h).max(y * sh / h + 1).min(sh));
        for x in 0..w {
            let (xa, xb) = (x * sw / w, ((x + 1) * sw / w).max(x * sw / w + 1).min(sw));
            let mut acc = [0f32; 3];
            for yy in ya..yb {
                for xx in xa..xb {
                    let i = (yy * sw + xx) * 4;
                    let al = rgba[i + 3] as f32 / 255.0;
                    for c in 0..3 {
                        acc[c] += rgba[i + c] as f32 * al + 255.0 * (1.0 - al);
                    }
                }
            }
            let cnt = ((yb - ya) * (xb - xa)) as f32;
            for c in 0..3 {
                out[(y * w + x) * 3 + c] = acc[c] / cnt;
            }
        }
    }
    out
}

fn grad_color(g: &Grad, px: f32, py: f32) -> ([f32; 3], f32, bool) {
    let d = [g.b[0] - g.a[0], g.b[1] - g.a[1]];
    let l2 = (d[0] * d[0] + d[1] * d[1]).max(1e-3);
    let t = ((px - g.a[0]) * d[0] + (py - g.a[1]) * d[1]) / l2;
    let tc = t.clamp(0.0, 1.0);
    let mut c = [0f32; 3];
    for k in 0..3 {
        c[k] = g.c0[k] + (g.c1[k] - g.c0[k]) * tc;
    }
    (c, tc, t > 0.0 && t < 1.0)
}

fn render(st: &Stack, solid: &[[f32; 3]], grads: &[Option<Grad>]) -> Vec<f32> {
    let mut pred = st.base.clone();
    for k in 0..solid.len() {
        let (s, e) = st.ranges[k];
        for &(p, wt) in &st.entries[s..e] {
            let pi = p as usize;
            let col = match &grads[k] {
                Some(g) => grad_color(g, (pi % st.w) as f32 + 0.5, (pi / st.w) as f32 + 0.5).0,
                None => solid[k],
            };
            for c in 0..3 {
                pred[pi * 3 + c] += wt * col[c];
            }
        }
    }
    pred
}

fn sweep(st: &Stack, target: &[f32], solid: &mut [[f32; 3]], grads: &[Option<Grad>], sweeps: usize, deadline: f64) {
    let mut res = render(st, solid, grads);
    for i in 0..res.len() {
        res[i] = target[i] - res[i];
    }
    for _ in 0..sweeps {
        let mut moved = 0f32;
        for k in 0..solid.len() {
            if grads[k].is_some() {
                continue;
            }
            let (s, e) = st.ranges[k];
            let (mut num, mut den) = ([0f32; 3], 0f32);
            for &(p, wt) in &st.entries[s..e] {
                if wt < INTERIOR {
                    continue;
                }
                for c in 0..3 {
                    num[c] += wt * res[p as usize * 3 + c];
                }
                den += wt * wt;
            }
            if den < 1e-6 {
                continue;
            }
            let mut dc = [0f32; 3];
            for c in 0..3 {
                let nv = (solid[k][c] + num[c] / den).clamp(0.0, 255.0);
                dc[c] = nv - solid[k][c];
                solid[k][c] = nv;
                moved = moved.max(dc[c].abs());
            }
            for &(p, wt) in &st.entries[s..e] {
                for c in 0..3 {
                    res[p as usize * 3 + c] -= wt * dc[c];
                }
            }
        }
        if moved < 0.05 || now() > deadline {
            break;
        }
    }
}

struct Adam {
    m: [f32; 10],
    v: [f32; 10],
}

fn pack(g: &Grad) -> [f32; 10] {
    [g.c0[0], g.c0[1], g.c0[2], g.c1[0], g.c1[1], g.c1[2], g.a[0], g.a[1], g.b[0], g.b[1]]
}

fn unpack(p: &[f32; 10]) -> Grad {
    Grad { c0: [p[0], p[1], p[2]], c1: [p[3], p[4], p[5]], a: [p[6], p[7]], b: [p[8], p[9]] }
}

fn init_grad(st: &Stack, k: usize, target_u8: &[u8], solid: [f32; 3]) -> Option<Grad> {
    let (s, e) = st.ranges[k];
    let area: f32 = st.entries[s..e].iter().map(|x| x.1).sum();
    if area < MIN_AREA {
        return None;
    }
    let idx: Vec<u32> = st.entries[s..e].iter().filter(|x| x.1 > 0.5).map(|x| x.0).collect();
    let (g, c1, c2) = fit_gradient(target_u8, st.w, &idx, 0.02)?;
    let _ = solid;
    Some(Grad {
        c0: [c1.r as f32, c1.g as f32, c1.b as f32],
        c1: [c2.r as f32, c2.g as f32, c2.b as f32],
        a: [g[0] as f32, g[1] as f32],
        b: [g[2] as f32, g[3] as f32],
    })
}

fn optimise_gradients(st: &Stack, target: &[f32], solid: &[[f32; 3]], target_u8: &[u8], iters: usize, deadline: f64, gain: f32) -> Vec<Option<Grad>> {
    let n = solid.len();
    let mut grads: Vec<Option<Grad>> = (0..n).map(|k| init_grad(st, k, target_u8, solid[k])).collect();
    let cands: Vec<usize> = (0..n).filter(|&k| grads[k].is_some()).collect();
    if cands.is_empty() {
        return grads;
    }
    let none: Vec<Option<Grad>> = vec![None; n];
    let mut fixed_solid = solid.to_vec();
    for &k in &cands {
        fixed_solid[k] = [0.0; 3];
    }
    let fixed = render(st, &fixed_solid, &none);
    let mut params: Vec<[f32; 10]> = cands.iter().map(|&k| pack(&grads[k].unwrap())).collect();
    let mut adam: Vec<Adam> = cands.iter().map(|_| Adam { m: [0.0; 10], v: [0.0; 10] }).collect();
    let (b1, b2) = (0.9f32, 0.999f32);
    let mut pred = fixed.clone();
    for it in 0..iters {
        if now() > deadline {
            break;
        }
        pred.copy_from_slice(&fixed);
        for (ci, &k) in cands.iter().enumerate() {
            let g = unpack(&params[ci]);
            let (s, e) = st.ranges[k];
            for &(p, wt) in &st.entries[s..e] {
                let pi = p as usize;
                let (col, _, _) = grad_color(&g, (pi % st.w) as f32 + 0.5, (pi / st.w) as f32 + 0.5);
                for c in 0..3 {
                    pred[pi * 3 + c] += wt * col[c];
                }
            }
        }
        let decay = 0.5 * (1.0 + (std::f32::consts::PI * it as f32 / iters as f32).cos());
        let lr = 0.1 + 0.9 * decay;
        for (ci, &k) in cands.iter().enumerate() {
            let g = unpack(&params[ci]);
            let d = [g.b[0] - g.a[0], g.b[1] - g.a[1]];
            let l2 = (d[0] * d[0] + d[1] * d[1]).max(1e-3);
            let mut gr = [0f32; 10];
            let (s, e) = st.ranges[k];
            for &(p, wt) in &st.entries[s..e] {
                if wt < INTERIOR {
                    continue;
                }
                let pi = p as usize;
                let (px, py) = ((pi % st.w) as f32 + 0.5, (pi / st.w) as f32 + 0.5);
                let (_, tc, inside) = grad_color(&g, px, py);
                let mut gt = 0f32;
                for c in 0..3 {
                    let r = target[pi * 3 + c] - pred[pi * 3 + c];
                    let f = -2.0 * r * wt;
                    gr[c] += f * (1.0 - tc);
                    gr[3 + c] += f * tc;
                    gt += f * (g.c1[c] - g.c0[c]);
                }
                if inside {
                    let (rx, ry) = (px - g.a[0], py - g.a[1]);
                    let n = rx * d[0] + ry * d[1];
                    let q = 2.0 * n / (l2 * l2);
                    gr[6] += gt * (-(d[0] + rx) / l2 + q * d[0]);
                    gr[7] += gt * (-(d[1] + ry) / l2 + q * d[1]);
                    gr[8] += gt * (rx / l2 - q * d[0]);
                    gr[9] += gt * (ry / l2 - q * d[1]);
                }
            }
            let t = (it + 1) as f32;
            let a = &mut adam[ci];
            for j in 0..10 {
                a.m[j] = b1 * a.m[j] + (1.0 - b1) * gr[j];
                a.v[j] = b2 * a.v[j] + (1.0 - b2) * gr[j] * gr[j];
                let mh = a.m[j] / (1.0 - b1.powf(t));
                let vh = a.v[j] / (1.0 - b2.powf(t));
                let step = if j < 6 { 1.5 } else { 0.35 } * lr;
                params[ci][j] -= step * mh / (vh.sqrt() + 1e-8);
            }
            for j in 0..6 {
                params[ci][j] = params[ci][j].clamp(0.0, 255.0);
            }
        }
    }
    pred.copy_from_slice(&fixed);
    for (ci, &k) in cands.iter().enumerate() {
        let g = unpack(&params[ci]);
        grads[k] = Some(g);
        let (s, e) = st.ranges[k];
        for &(p, wt) in &st.entries[s..e] {
            let pi = p as usize;
            let (col, _, _) = grad_color(&g, (pi % st.w) as f32 + 0.5, (pi / st.w) as f32 + 0.5);
            for c in 0..3 {
                pred[pi * 3 + c] += wt * col[c];
            }
        }
    }
    for (ci, &k) in cands.iter().enumerate() {
        let g = unpack(&params[ci]);
        let (s, e) = st.ranges[k];
        let mut delta = 0f32;
        for &(p, wt) in &st.entries[s..e] {
            if wt < INTERIOR {
                continue;
            }
            let pi = p as usize;
            let (col, _, _) = grad_color(&g, (pi % st.w) as f32 + 0.5, (pi / st.w) as f32 + 0.5);
            for c in 0..3 {
                let r = target[pi * 3 + c] - pred[pi * 3 + c];
                let r2 = r + wt * (col[c] - solid[k][c]);
                delta += r2 * r2 - r * r;
            }
        }
        if delta < gain {
            grads[k] = None;
        }
    }
    grads
}

fn q8(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

fn color(c: [f32; 3]) -> Color {
    Color::new(q8(c[0]), q8(c[1]), q8(c[2]))
}

pub fn run(rgba: &[u8], sw: usize, sh: usize, svg: &str, o: &Options) -> String {
    let t0 = now();
    let deadline = t0 + o.refine_ms;
    let s = (WORK_DIM / sw.max(sh) as f32).min(1.0);
    let (w, h) = (((sw as f32 * s).round() as usize).max(1), ((sh as f32 * s).round() as usize).max(1));
    let els = match parse(svg, s) {
        Some(e) => e,
        None => return svg.to_string(),
    };
    let st = build_stack(&els, w, h);
    let target = downscale(rgba, sw, sh, w, h);
    let mut solid: Vec<[f32; 3]> = els.iter().map(|e| e.color).collect();
    let none: Vec<Option<Grad>> = vec![None; els.len()];
    let solid_deadline = t0 + o.refine_ms * if o.refine_gradients { 0.4 } else { 1.0 };
    if o.refine_solid {
        sweep(&st, &target, &mut solid, &none, 12, solid_deadline);
    }
    let mut grads = none.clone();
    if o.refine_gradients && o.refine_iters > 0 {
        let mut target_u8 = vec![255u8; w * h * 4];
        for i in 0..w * h {
            for c in 0..3 {
                target_u8[i * 4 + c] = q8(target[i * 3 + c]);
            }
        }
        grads = optimise_gradients(&st, &target, &solid, &target_u8, o.refine_iters as usize, deadline, o.refine_gain as f32);
        if o.refine_solid {
            sweep(&st, &target, &mut solid, &grads, 4, deadline + 50.0);
        }
    }
    let mut out = String::with_capacity(svg.len() + 4096);
    let mut defs = String::new();
    let mut last = 0;
    for (k, el) in els.iter().enumerate() {
        out.push_str(&svg[last..el.fill.0]);
        match &grads[k] {
            Some(g) => {
                let id = defs.matches("<linearGradient").count();
                defs.push_str(&format!(
                    "<linearGradient id=\"r{}\" gradientUnits=\"userSpaceOnUse\" x1=\"{:.1}\" y1=\"{:.1}\" x2=\"{:.1}\" y2=\"{:.1}\"><stop stop-color=\"{}\"/><stop offset=\"1\" stop-color=\"{}\"/></linearGradient>",
                    id,
                    g.a[0] / s - el.off.0,
                    g.a[1] / s - el.off.1,
                    g.b[0] / s - el.off.0,
                    g.b[1] / s - el.off.1,
                    hex(color(g.c0)),
                    hex(color(g.c1))
                ));
                out.push_str(&format!("url(#r{})", id));
            }
            None => out.push_str(&hex(color(solid[k]))),
        }
        last = el.fill.1;
    }
    out.push_str(&svg[last..]);
    if !defs.is_empty() {
        let at = out.find('>').unwrap() + 1;
        out.insert_str(at, &format!("<defs>{}</defs>", defs));
    }
    out
}
