use super::geom::{emit_d, Layer, Sub};
use super::paint::render;
use super::raster::Stack;
use super::shape::{boundary, colors, loss_of, stack_of, Ctx, Fields};

const PRUNE_FRACTION: f32 = 0.3;
const PATH_OVERHEAD: usize = 62;
const Q_PER_RELATIVE_LOSS: f32 = 0.06;

pub fn layer_bytes(l: &Layer, prec: u32) -> usize {
    emit_d(l, prec).len() + PATH_OVERHEAD
}

pub fn loss_per_byte(total_bytes: usize, loss: f32, mult: f32) -> f32 {
    let kb = total_bytes as f32 / 1024.0;
    let divisor = 1.0 + 0.25 * (1.0 + kb / 100.0).log2();
    let coef = 0.36 * (kb / (100.0 + kb)) / divisor;
    mult * (coef / Q_PER_RELATIVE_LOSS) * loss / total_bytes as f32
}

pub fn removal_costs(work: &[Layer], st: &Stack, pred: &[f32], target: &[f32], f: &Fields, s: f32) -> Vec<f32> {
    let cx = Ctx { st, pred, f, s, lambda: 0.0 };
    (0..work.len())
        .map(|k| {
            let mut parent = ([0f32; 3], 0f32);
            boundary(&work[k], k as u32, &cx, None, k, &mut parent);
            let (a, b) = st.ranges[k];
            let vis: f32 = st.entries[a..b].iter().map(|e| e.1).sum();
            if parent.1 < 2.0 {
                return if vis < 0.5 { 0.0 } else { f32::MAX };
            }
            let lc = [parent.0[0] / parent.1, parent.0[1] / parent.1, parent.0[2] / parent.1];
            let ck = work[k].color;
            let mut dl = 0f32;
            for &(p, wt) in &st.entries[a..b] {
                let pi = p as usize * 3;
                for c in 0..3 {
                    let r = target[pi + c] - pred[pi + c];
                    let r2 = r - wt * (lc[c] - ck[c]);
                    dl += r2 * r2 - r * r;
                }
            }
            dl
        })
        .collect()
}

pub fn prune(layers: &mut Vec<Layer>, s: f32, target: &[f32], w: usize, h: usize, f: &Fields, mult: f32, prec: u32, rounds: usize, deadline: f64) -> usize {
    let before = layers.len();
    for _ in 0..rounds {
        if super::now() > deadline {
            break;
        }
        let work = super::geom::scaled(layers, s);
        let st = stack_of(&work, w, h);
        let none = vec![None; work.len()];
        let pred = render(&st, &colors(&work), &none);
        let loss = loss_of(target, &pred);
        let bytes: Vec<usize> = layers.iter().map(|l| layer_bytes(l, prec)).collect();
        let total: usize = bytes.iter().sum::<usize>() + 200;
        let unit = loss_per_byte(total, loss, mult);
        let cost = removal_costs(&work, &st, &pred, target, f, s);
        let mut ratios: Vec<(f32, usize)> = (1..layers.len()).filter_map(|k| {
            let r = cost[k] / (unit * bytes[k] as f32).max(1e-6);
            if r < 1.0 { Some((r, k)) } else { None }
        }).collect();
        if ratios.is_empty() {
            break;
        }
        ratios.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let take = ((layers.len() as f32 * PRUNE_FRACTION).ceil() as usize).min(ratios.len());
        let mut drop = vec![false; layers.len()];
        for &(_, k) in &ratios[..take] {
            drop[k] = true;
        }
        let mut i = 0;
        layers.retain(|_| {
            let keep = !drop[i];
            i += 1;
            keep
        });
    }
    before - layers.len()
}

pub fn blob(cx: f32, cy: f32, rx: f32, ry: f32, color: [f32; 3], s: f32) -> Layer {
    const K: f32 = 0.5523;
    let pts = [
        (cx + rx, cy),
        (cx + rx, cy + K * ry),
        (cx + K * rx, cy + ry),
        (cx, cy + ry),
        (cx - K * rx, cy + ry),
        (cx - rx, cy + K * ry),
        (cx - rx, cy),
        (cx - rx, cy - K * ry),
        (cx - K * rx, cy - ry),
        (cx, cy - ry),
        (cx + K * rx, cy - ry),
        (cx + rx, cy - K * ry),
        (cx + rx, cy),
    ];
    let pts: Vec<(f32, f32)> = pts.iter().map(|p| (p.0 / s, p.1 / s)).collect();
    let off = ((cx - rx) / s).floor();
    let offy = ((cy - ry) / s).floor();
    Layer { subs: vec![Sub { pts, line: vec![false; 4], tied: true }], off: (off, offy), color, side: 1.0, src: None }
}

pub fn spawn(layers: &mut Vec<Layer>, s: f32, target: &[f32], w: usize, h: usize, max: usize, mult: f32, prec: u32) -> usize {
    let work = super::geom::scaled(layers, s);
    let st = stack_of(&work, w, h);
    let none = vec![None; work.len()];
    let pred = render(&st, &colors(&work), &none);
    let loss = loss_of(target, &pred);
    let total: usize = layers.iter().map(|l| layer_bytes(l, prec)).sum::<usize>() + 200;
    let unit = loss_per_byte(total, loss, mult);
    let mut e: Vec<f32> = (0..w * h).map(|i| (0..3).map(|c| (target[i * 3 + c] - pred[i * 3 + c]).powi(2)).sum()).collect();
    let mut tmp = vec![0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let (a, b) = (x.saturating_sub(2), (x + 2).min(w - 1));
            tmp[y * w + x] = (a..=b).map(|xx| e[y * w + xx]).sum::<f32>() / 5.0;
        }
    }
    for y in 0..h {
        let (a, b) = (y.saturating_sub(2), (y + 2).min(h - 1));
        for x in 0..w {
            e[y * w + x] = (a..=b).map(|yy| tmp[yy * w + x]).sum::<f32>() / 5.0;
        }
    }
    const CELL: usize = 6;
    let mut cands: Vec<(f32, usize, usize)> = Vec::new();
    for cy in (0..h).step_by(CELL) {
        for cx in (0..w).step_by(CELL) {
            let mut best = (0f32, cx, cy);
            for y in cy..(cy + CELL).min(h) {
                for x in cx..(cx + CELL).min(w) {
                    if e[y * w + x] > best.0 {
                        best = (e[y * w + x], x, y);
                    }
                }
            }
            if best.0 > 0.0 {
                cands.push(best);
            }
        }
    }
    cands.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    let mut taken: Vec<(f32, f32, f32)> = Vec::new();
    let mut added: Vec<Layer> = Vec::new();
    for (peak, px, py) in cands {
        if added.len() >= max {
            break;
        }
        if taken.iter().any(|t| (t.0 - px as f32).hypot(t.1 - py as f32) < t.2 * 1.2) {
            continue;
        }
        let reach = |dx: i32, dy: i32| {
            let mut r = 0;
            while r < 14 {
                let (x, y) = (px as i32 + dx * (r + 1), py as i32 + dy * (r + 1));
                if x < 0 || y < 0 || x >= w as i32 || y >= h as i32 || e[y as usize * w + x as usize] < 0.35 * peak {
                    break;
                }
                r += 1;
            }
            r as f32 + 1.0
        };
        let rx = (0.5 * (reach(1, 0) + reach(-1, 0))).max(1.5);
        let ry = (0.5 * (reach(0, 1) + reach(0, -1))).max(1.5);
        let (mut sum, mut cnt) = ([0f32; 3], 0f32);
        let mut cover: Vec<usize> = Vec::new();
        for y in (py as i32 - ry.ceil() as i32).max(0)..=(py as i32 + ry.ceil() as i32).min(h as i32 - 1) {
            for x in (px as i32 - rx.ceil() as i32).max(0)..=(px as i32 + rx.ceil() as i32).min(w as i32 - 1) {
                let (u, v) = ((x as f32 + 0.5 - px as f32 - 0.5) / rx, (y as f32 + 0.5 - py as f32 - 0.5) / ry);
                if u * u + v * v <= 1.0 {
                    let i = y as usize * w + x as usize;
                    cover.push(i);
                    for c in 0..3 {
                        sum[c] += target[i * 3 + c];
                    }
                    cnt += 1.0;
                }
            }
        }
        if cnt < 4.0 {
            continue;
        }
        let col = [sum[0] / cnt, sum[1] / cnt, sum[2] / cnt];
        let mut gain = 0f32;
        for &i in &cover {
            for c in 0..3 {
                let r0 = target[i * 3 + c] - pred[i * 3 + c];
                let r1 = target[i * 3 + c] - col[c];
                gain += r0 * r0 - r1 * r1;
            }
        }
        let cand = blob(px as f32 + 0.5, py as f32 + 0.5, rx, ry, col, s);
        if gain < unit * layer_bytes(&cand, prec) as f32 {
            continue;
        }
        taken.push((px as f32, py as f32, rx.max(ry)));
        added.push(cand);
    }
    let n = added.len();
    layers.extend(added);
    n
}
