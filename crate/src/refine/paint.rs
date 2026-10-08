use super::raster::Stack;
use super::now;
use crate::fit_gradient;

pub const MIN_AREA: f32 = 80.0;
pub const INTERIOR: f32 = 0.8;

#[derive(Clone, Copy)]
pub struct Grad {
    pub c0: [f32; 3],
    pub c1: [f32; 3],
    pub a: [f32; 2],
    pub b: [f32; 2],
}

pub fn grad_color(g: &Grad, px: f32, py: f32) -> ([f32; 3], f32, bool) {
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

pub fn render(st: &Stack, solid: &[[f32; 3]], grads: &[Option<Grad>]) -> Vec<f32> {
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

pub fn sweep(st: &Stack, target: &[f32], solid: &mut [[f32; 3]], grads: &[Option<Grad>], sweeps: usize, deadline: f64) {
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

pub fn pack(g: &Grad) -> [f32; 10] {
    [g.c0[0], g.c0[1], g.c0[2], g.c1[0], g.c1[1], g.c1[2], g.a[0], g.a[1], g.b[0], g.b[1]]
}

pub fn unpack(p: &[f32; 10]) -> Grad {
    Grad { c0: [p[0], p[1], p[2]], c1: [p[3], p[4], p[5]], a: [p[6], p[7]], b: [p[8], p[9]] }
}

pub fn init_grad(st: &Stack, k: usize, target_u8: &[u8], solid: [f32; 3]) -> Option<Grad> {
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

pub fn optimise_gradients(st: &Stack, target: &[f32], solid: &[[f32; 3]], target_u8: &[u8], iters: usize, deadline: f64, gain: f32) -> Vec<Option<Grad>> {
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
