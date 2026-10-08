pub const MIN_WEIGHT: f32 = 1.0 / 400.0;
pub const NONE: u32 = u32::MAX;

pub struct Stack {
    pub w: usize,
    pub h: usize,
    pub entries: Vec<(u32, f32)>,
    pub ranges: Vec<(usize, usize)>,
    pub base: Vec<f32>,
    pub owner: Vec<u32>,
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

pub fn build_stack(layers: &[Vec<Vec<(f32, f32)>>], w: usize, h: usize) -> Stack {
    let n = w * h;
    let mut trans = vec![1f32; n];
    let mut owner = vec![NONE; n];
    let mut scratch = vec![0f32; (w + 2) * h];
    let mut entries: Vec<(u32, f32)> = Vec::with_capacity(n + n / 4);
    let mut ranges = vec![(0usize, 0usize); layers.len()];
    for k in (0..layers.len()).rev() {
        let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for p in layers[k].iter().flatten() {
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
            for poly in &layers[k] {
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
                    if alpha >= 0.5 && owner[pi] == NONE {
                        owner[pi] = k as u32;
                    }
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
    Stack { w, h, entries, ranges, base, owner }
}

pub fn downscale(rgba: &[u8], sw: usize, sh: usize, w: usize, h: usize) -> Vec<f32> {
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
