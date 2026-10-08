use super::geom::{dist, polys, Layer};
use super::now;
use super::paint::render;
use super::raster::{build_stack, Stack, NONE};

const OFFS: [(f32, f32); 3] = [(-0.75, 0.5), (0.0, 1.0), (0.75, 0.5)];
const OFFS_SUM: f32 = 2.0;
const REACH: f32 = 1.5;
const SPACING: f32 = 1.5;
const WEAK_EDGE: f32 = 9.0;
const ADAM_EPS: f32 = 20.0;
const PLATEAU: f32 = 0.002;

pub struct Fields {
    pub rgb: Vec<u8>,
    pub sw: usize,
    pub sh: usize,
    pub e: Vec<f32>,
}

pub struct Ctx<'a> {
    pub st: &'a Stack,
    pub pred: &'a [f32],
    pub f: &'a Fields,
    pub s: f32,
    pub lambda: f32,
}

pub type Grid = Vec<Vec<Vec<[f32; 2]>>>;

pub fn fields(rgba: &[u8], sw: usize, sh: usize) -> Fields {
    let mut rgb = vec![255u8; sw * sh * 3];
    for i in 0..sw * sh {
        let al = rgba[i * 4 + 3] as f32 / 255.0;
        for c in 0..3 {
            rgb[i * 3 + c] = (rgba[i * 4 + c] as f32 * al + 255.0 * (1.0 - al)).round() as u8;
        }
    }
    let luma: Vec<f32> = (0..sw * sh).map(|i| 0.299 * rgb[i * 3] as f32 + 0.587 * rgb[i * 3 + 1] as f32 + 0.114 * rgb[i * 3 + 2] as f32).collect();
    let at = |x: i32, y: i32| luma[y.clamp(0, sh as i32 - 1) as usize * sw + x.clamp(0, sw as i32 - 1) as usize];
    let mut e = vec![0f32; sw * sh];
    for y in 0..sh {
        for x in 0..sw {
            let (xi, yi) = (x as i32, y as i32);
            let gx = (at(xi + 1, yi - 1) + 2.0 * at(xi + 1, yi) + at(xi + 1, yi + 1) - at(xi - 1, yi - 1) - 2.0 * at(xi - 1, yi) - at(xi - 1, yi + 1)) / 8.0;
            let gy = (at(xi - 1, yi + 1) + 2.0 * at(xi, yi + 1) + at(xi + 1, yi + 1) - at(xi - 1, yi - 1) - 2.0 * at(xi, yi - 1) - at(xi + 1, yi - 1)) / 8.0;
            e[y * sw + x] = (gx * gx + gy * gy).sqrt();
        }
    }
    Fields { rgb, sw, sh, e }
}

fn hi_rgb(f: &Fields, x: f32, y: f32) -> [f32; 3] {
    let fx = (x - 0.5).clamp(0.0, (f.sw - 1) as f32);
    let fy = (y - 0.5).clamp(0.0, (f.sh - 1) as f32);
    let (x0, y0) = (fx as usize, fy as usize);
    let (x1, y1) = ((x0 + 1).min(f.sw - 1), (y0 + 1).min(f.sh - 1));
    let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
    let px = |xx: usize, yy: usize, c: usize| f.rgb[(yy * f.sw + xx) * 3 + c] as f32;
    let mut o = [0f32; 3];
    for c in 0..3 {
        let a = px(x0, y0, c) * (1.0 - tx) + px(x1, y0, c) * tx;
        let b = px(x0, y1, c) * (1.0 - tx) + px(x1, y1, c) * tx;
        o[c] = a * (1.0 - ty) + b * ty;
    }
    o
}

fn hi_e(f: &Fields, x: f32, y: f32) -> f32 {
    let fx = (x - 0.5).clamp(0.0, (f.sw - 1) as f32);
    let fy = (y - 0.5).clamp(0.0, (f.sh - 1) as f32);
    let (x0, y0) = (fx as usize, fy as usize);
    let (x1, y1) = ((x0 + 1).min(f.sw - 1), (y0 + 1).min(f.sh - 1));
    let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
    let a = f.e[y0 * f.sw + x0] * (1.0 - tx) + f.e[y0 * f.sw + x1] * tx;
    let b = f.e[y1 * f.sw + x0] * (1.0 - tx) + f.e[y1 * f.sw + x1] * tx;
    a * (1.0 - ty) + b * ty
}

fn bil(img: &[f32], ch: usize, w: usize, h: usize, x: f32, y: f32) -> [f32; 3] {
    let fx = (x - 0.5).clamp(0.0, (w - 1) as f32);
    let fy = (y - 0.5).clamp(0.0, (h - 1) as f32);
    let (x0, y0) = (fx as usize, fy as usize);
    let (x1, y1) = ((x0 + 1).min(w - 1), (y0 + 1).min(h - 1));
    let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
    let mut o = [0f32; 3];
    for c in 0..ch {
        let a = img[(y0 * w + x0) * ch + c] * (1.0 - tx) + img[(y0 * w + x1) * ch + c] * tx;
        let b = img[(y1 * w + x0) * ch + c] * (1.0 - tx) + img[(y1 * w + x1) * ch + c] * tx;
        o[c] = a * (1.0 - ty) + b * ty;
    }
    o
}

pub fn boundary(l: &Layer, k: u32, cx: &Ctx, mut g: Option<&mut Grid>, li: usize, parent: &mut ([f32; 3], f32)) {
    let (w, h) = (cx.st.w, cx.st.h);
    for (si, sub) in l.subs.iter().enumerate() {
        let mut idx = 0usize;
        for &ln in &sub.line {
            let (a, b, c, d, ids, adv) = if ln {
                let (a, d) = (sub.pts[idx], sub.pts[idx + 1]);
                let lp = |t: f32| (a.0 + (d.0 - a.0) * t, a.1 + (d.1 - a.1) * t);
                (a, lp(1.0 / 3.0), lp(2.0 / 3.0), d, [idx, idx + 1, idx, idx], 1)
            } else {
                (sub.pts[idx], sub.pts[idx + 1], sub.pts[idx + 2], sub.pts[idx + 3], [idx, idx + 1, idx + 2, idx + 3], 3)
            };
            idx += adv;
            let m = (((dist(a, b) + dist(b, c) + dist(c, d)) / SPACING).ceil() as usize).clamp(2, 40);
            for j in 0..m {
                let t = (j as f32 + 0.5) / m as f32;
                let u = 1.0 - t;
                let bw = [u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t];
                let p = (bw[0] * a.0 + bw[1] * b.0 + bw[2] * c.0 + bw[3] * d.0, bw[0] * a.1 + bw[1] * b.1 + bw[2] * c.1 + bw[3] * d.1);
                if p.0 < 0.0 || p.1 < 0.0 || p.0 >= w as f32 || p.1 >= h as f32 {
                    continue;
                }
                let dp = (
                    3.0 * (u * u * (b.0 - a.0) + 2.0 * u * t * (c.0 - b.0) + t * t * (d.0 - c.0)),
                    3.0 * (u * u * (b.1 - a.1) + 2.0 * u * t * (c.1 - b.1) + t * t * (d.1 - c.1)),
                );
                let sp = (dp.0 * dp.0 + dp.1 * dp.1).sqrt();
                if sp < 1e-4 {
                    continue;
                }
                let own = cx.st.owner[p.1 as usize * w + p.0 as usize];
                if own != NONE && own > k {
                    continue;
                }
                let n = (l.side * dp.1 / sp, -l.side * dp.0 / sp);
                let ds = sp / m as f32;
                let ci = bil(cx.pred, 3, w, h, p.0 - n.0 * REACH, p.1 - n.1 * REACH);
                let co = bil(cx.pred, 3, w, h, p.0 + n.0 * REACH, p.1 + n.1 * REACH);
                let dc2: f32 = (0..3).map(|q| (ci[q] - co[q]).powi(2)).sum();
                for q in 0..3 {
                    parent.0[q] += co[q] * ds;
                }
                parent.1 += ds;
                if dc2 < WEAK_EDGE {
                    continue;
                }
                let gs = match g.as_mut() {
                    Some(_) => {
                        let mut dsum = 0.0;
                        for &(off, wt) in OFFS.iter() {
                            let tv = hi_rgb(cx.f, (p.0 + n.0 * off * cx.s) / cx.s, (p.1 + n.1 * off * cx.s) / cx.s);
                            let (mut ei, mut eo) = (0.0, 0.0);
                            for q in 0..3 {
                                ei += (tv[q] - ci[q]).powi(2);
                                eo += (tv[q] - co[q]).powi(2);
                            }
                            dsum += wt * (ei - eo);
                        }
                        let (qx, qy) = (p.0 / cx.s, p.1 / cx.s);
                        let ge = 0.5 * (hi_e(cx.f, qx + n.0, qy + n.1) - hi_e(cx.f, qx - n.0, qy - n.1));
                        dsum / OFFS_SUM - cx.lambda * dc2.sqrt() * ge
                    }
                    None => continue,
                };
                if let Some(g) = g.as_mut() {
                    let wts = if ln { [1.0 - t, t, 0.0, 0.0] } else { bw };
                    for q in 0..4 {
                        if wts[q] == 0.0 {
                            continue;
                        }
                        let slot = &mut g[li][si][ids[q]];
                        slot[0] += gs * ds * wts[q] * n.0;
                        slot[1] += gs * ds * wts[q] * n.1;
                    }
                }
            }
        }
    }
}

fn zero_grid(layers: &[Layer]) -> Grid {
    layers.iter().map(|l| l.subs.iter().map(|s| vec![[0f32; 2]; s.pts.len()]).collect()).collect()
}

fn point_scale(layers: &[Layer]) -> Vec<Vec<Vec<f32>>> {
    layers
        .iter()
        .map(|l| {
            l.subs
                .iter()
                .map(|s| {
                    let n = s.pts.len();
                    (0..n)
                        .map(|i| {
                            let a = dist(s.pts[i], s.pts[(i + n - 1) % n]);
                            let b = dist(s.pts[i], s.pts[(i + 1) % n]);
                            (a.min(b) / 4.0).clamp(0.2, 1.0)
                        })
                        .collect()
                })
                .collect()
        })
        .collect()
}

#[derive(Clone, Copy)]
pub struct Settings {
    pub lambda: f32,
    pub lr: f32,
    pub cap: f32,
    pub solid: bool,
    pub grow_from: usize,
}

pub fn colors(layers: &[Layer]) -> Vec<[f32; 3]> {
    layers.iter().map(|l| l.color).collect()
}

pub fn stack_of(layers: &[Layer], w: usize, h: usize) -> Stack {
    let p: Vec<_> = layers.iter().map(|l| polys(l, 1.0)).collect();
    build_stack(&p, w, h)
}

pub fn loss_of(target: &[f32], pred: &[f32]) -> f32 {
    target.iter().zip(pred).map(|(a, b)| (a - b) * (a - b)).sum()
}

pub fn optimise(work: &mut Vec<Layer>, target: &[f32], w: usize, h: usize, f: &Fields, s: f32, iters: usize, cfg: &Settings, deadline: f64) -> f32 {
    let start = work.clone();
    let scale = point_scale(work);
    let mut g = zero_grid(work);
    let mut m1 = zero_grid(work);
    let mut m2 = zero_grid(work);
    let (b1, b2) = (0.9f32, 0.999f32);
    let mut best = f32::MAX;
    let mut best_layers = work.clone();
    let mut lr_scale = 1.0f32;
    let mut taken = 0f32;
    let mut flat = 0;
    let mut prev = f32::MAX;
    for it in 0..=iters {
        let st = stack_of(work, w, h);
        let mut solid = colors(work);
        let none = vec![None; work.len()];
        let mut pred = render(&st, &solid, &none);
        if cfg.solid {
            super::paint::sweep(&st, target, &mut solid, &none, 1, deadline);
            for (l, c) in work.iter_mut().zip(&solid) {
                l.color = *c;
            }
            pred = render(&st, &solid, &none);
        }
        let loss = loss_of(target, &pred);
        if prev - loss < PLATEAU * prev {
            flat += 1;
        } else {
            flat = 0;
        }
        prev = loss;
        if flat >= 2 {
            if loss < best {
                best = loss;
                best_layers.clone_from(work);
            }
            break;
        }
        if loss < best {
            best = loss;
            best_layers.clone_from(work);
        } else {
            lr_scale *= 0.7;
        }
        if it == iters || now() > deadline {
            break;
        }
        let cx = Ctx { st: &st, pred: &pred, f, s, lambda: cfg.lambda };
        for a in g.iter_mut().flatten() {
            a.fill([0.0; 2]);
        }
        for (k, l) in work.iter().enumerate() {
            let mut parent = ([0f32; 3], 0f32);
            boundary(l, k as u32, &cx, Some(&mut g), k, &mut parent);
        }
        taken += 1.0;
        let decay = 0.5 * (1.0 + (std::f32::consts::PI * it as f32 / iters as f32).cos());
        let lr = cfg.lr * lr_scale * (0.25 + 0.75 * decay);
        for (k, l) in work.iter_mut().enumerate() {
            for (si, sub) in l.subs.iter_mut().enumerate() {
                let n = sub.pts.len();
                if sub.tied && n > 1 {
                    let last = g[k][si][n - 1];
                    g[k][si][0][0] += last[0];
                    g[k][si][0][1] += last[1];
                    g[k][si][n - 1] = [0.0; 2];
                }
                for i in 0..n {
                    for d in 0..2 {
                        let gr = g[k][si][i][d];
                        let m = &mut m1[k][si][i][d];
                        let v = &mut m2[k][si][i][d];
                        *m = b1 * *m + (1.0 - b1) * gr;
                        *v = b2 * *v + (1.0 - b2) * gr * gr;
                        let mh = *m / (1.0 - b1.powf(taken));
                        let vh = *v / (1.0 - b2.powf(taken));
                        let step = lr * scale[k][si][i] * mh / (vh.sqrt() + ADAM_EPS);
                        let s0 = start[k].subs[si].pts[i];
                        let (cur, orig) = if d == 0 { (sub.pts[i].0, s0.0) } else { (sub.pts[i].1, s0.1) };
                        let lim = if d == 0 { w as f32 } else { h as f32 };
                        let cap = if k >= cfg.grow_from { cfg.cap * 4.0 } else { cfg.cap };
                        let nv = (cur - step).clamp(orig - cap, orig + cap).clamp(-4.0, lim + 4.0);
                        if d == 0 {
                            sub.pts[i].0 = nv;
                        } else {
                            sub.pts[i].1 = nv;
                        }
                    }
                }
                if sub.tied && n > 1 {
                    sub.pts[n - 1] = sub.pts[0];
                }
            }
        }
    }
    *work = best_layers;
    best
}
