const R = 5;
const KERNEL = (() => {
  const sigma = 1.5, k = new Float32Array(2 * R + 1);
  let total = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + R] = v; total += v; }
  for (let i = 0; i < k.length; i++) k[i] /= total;
  return k;
})();

export function flattenOnWhite(rgba) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255, w = 255 * (1 - a);
    out[i] = rgba[i] * a + w; out[i + 1] = rgba[i + 1] * a + w; out[i + 2] = rgba[i + 2] * a + w; out[i + 3] = 255;
  }
  return out;
}

export function luma(rgba, n) {
  const y = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) y[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return y;
}

function blurValid(src, w, h) {
  const ow = w - 2 * R, oh = h - 2 * R;
  const tmp = new Float32Array(ow * h);
  for (let y = 0; y < h; y++) {
    const row = y * w, trow = y * ow;
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let k = 0; k < 11; k++) s += src[row + x + k] * KERNEL[k];
      tmp[trow + x] = s;
    }
  }
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let k = 0; k < 11; k++) s += tmp[(y + k) * ow + x] * KERNEL[k];
      out[y * ow + x] = s;
    }
  }
  return out;
}

export function ssim(a, b, w, h, range = 255) {
  if (w <= 2 * R + 1 || h <= 2 * R + 1) return NaN;
  const n = w * h, c1 = (0.01 * range) ** 2, c2 = (0.03 * range) ** 2;
  const aa = new Float32Array(n), bb = new Float32Array(n), ab = new Float32Array(n);
  for (let i = 0; i < n; i++) { aa[i] = a[i] * a[i]; bb[i] = b[i] * b[i]; ab[i] = a[i] * b[i]; }
  const ma = blurValid(a, w, h), mb = blurValid(b, w, h);
  const saa = blurValid(aa, w, h), sbb = blurValid(bb, w, h), sab = blurValid(ab, w, h);
  let total = 0;
  for (let i = 0; i < ma.length; i++) {
    const va = saa[i] - ma[i] * ma[i], vb = sbb[i] - mb[i] * mb[i], cov = sab[i] - ma[i] * mb[i];
    total += ((2 * ma[i] * mb[i] + c1) * (2 * cov + c2)) / ((ma[i] * ma[i] + mb[i] * mb[i] + c1) * (va + vb + c2));
  }
  return total / ma.length;
}

export function sobelMagnitude(y, w, h) {
  const out = new Float32Array(w * h), scale = 255 / (4 * 255 * Math.SQRT2);
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const p = j * w + i;
      const gx = y[p - w + 1] + 2 * y[p + 1] + y[p + w + 1] - y[p - w - 1] - 2 * y[p - 1] - y[p + w - 1];
      const gy = y[p + w - 1] + 2 * y[p + w] + y[p + w + 1] - y[p - w - 1] - 2 * y[p - w] - y[p - w + 1];
      out[p] = Math.sqrt(gx * gx + gy * gy) * scale;
    }
  }
  return out;
}

export function psnr(a, b) {
  let se = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d; n++; }
  }
  const mse = se / n;
  return mse === 0 ? 100 : Math.min(100, 10 * Math.log10((255 * 255) / mse));
}

const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const labF = t => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

function toLab(r, g, b, out) {
  const lr = LIN[r], lg = LIN[g], lb = LIN[b];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883;
  const fx = labF(x), fy = labF(y), fz = labF(z);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
}

const D2R = Math.PI / 180, R2D = 180 / Math.PI, P25 = 25 ** 7;

function hueOf(b, a) { if (a === 0 && b === 0) return 0; const h = Math.atan2(b, a) * R2D; return h < 0 ? h + 360 : h; }

function de2000(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + P25)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp1 = hueOf(b1, ap1), hp2 = hueOf(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * D2R) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    hb = Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hb - 30) * D2R) + 0.24 * Math.cos(2 * hb * D2R) + 0.32 * Math.cos((3 * hb + 6) * D2R) - 0.2 * Math.cos((4 * hb - 63) * D2R);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + P25));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(2 * dTheta * D2R) * Rc;
  const x = dL / Sl, y = dC / Sc, z = dH / Sh;
  return Math.sqrt(x * x + y * y + z * z + Rt * y * z);
}

export function meanDeltaE(a, b) {
  const l1 = new Float64Array(3), l2 = new Float64Array(3);
  let total = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    n++;
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
    toLab(a[i], a[i + 1], a[i + 2], l1); toLab(b[i], b[i + 1], b[i + 2], l2);
    total += de2000(l1[0], l1[1], l1[2], l2[0], l2[1], l2[2]);
  }
  return total / n;
}

const clamp01 = v => Math.max(0, Math.min(1, v));

export function combine(m) {
  const quality = (clamp01(m.ssim) + clamp01(m.edge) + clamp01((m.psnr - 10) / 40) + clamp01(1 - m.dE / 25)) / 4;
  const score = (100 * quality) / (1 + 0.25 * Math.log2(1 + m.bytes / 1024 / 100));
  return { quality, score };
}

export function compare(srcRgba, outRgba, w, h) {
  const a = flattenOnWhite(srcRgba), b = flattenOnWhite(outRgba), n = w * h;
  const ya = luma(a, n), yb = luma(b, n);
  return {
    psnr: psnr(a, b),
    ssim: ssim(ya, yb, w, h),
    dE: meanDeltaE(a, b),
    edge: ssim(sobelMagnitude(ya, w, h), sobelMagnitude(yb, w, h), w, h)
  };
}
