import { flattenOnWhite, compare } from "../../docs/metrics.js";

const CAP = 64;
const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const labF = t => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const D2R = Math.PI / 180, R2D = 180 / Math.PI, P25 = 25 ** 7;

export function rgbToLab(r, g, b) {
  const lr = LIN[r], lg = LIN[g], lb = LIN[b];
  const fx = labF((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047);
  const fy = labF(0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb);
  const fz = labF((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const hueOf = (b, a) => { if (a === 0 && b === 0) return 0; const h = Math.atan2(b, a) * R2D; return h < 0 ? h + 360 : h; };

export function deltaE2000(p, q) {
  const [L1, a1, b1] = p, [L2, a2, b2] = q;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + P25)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp1 = hueOf(b1, ap1), hp2 = hueOf(b2, ap2);
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * D2R) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) hb = Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * D2R) + 0.24 * Math.cos(2 * hb * D2R) + 0.32 * Math.cos((3 * hb + 6) * D2R) - 0.2 * Math.cos((4 * hb - 63) * D2R);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + P25));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const x = (L2 - L1) / Sl, y = (Cp2 - Cp1) / (1 + 0.045 * Cpb), z = dH / (1 + 0.015 * Cpb * T);
  return Math.sqrt(Math.max(0, x * x + y * y + z * z - Math.sin(2 * dTheta * D2R) * Rc * y * z));
}

export function edgeMap(rgba, w, h, threshold = 24) {
  const m = new Uint8Array(w * h);
  const diff = (p, q) => Math.max(Math.abs(rgba[p] - rgba[q]), Math.abs(rgba[p + 1] - rgba[q + 1]), Math.abs(rgba[p + 2] - rgba[q + 2]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && diff(i * 4, (i + 1) * 4) > threshold) { m[i] = 1; m[i + 1] = 1; }
      if (y + 1 < h && diff(i * 4, (i + w) * 4) > threshold) { m[i] = 1; m[i + w] = 1; }
    }
  }
  return m;
}

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

export function distanceTransform(mask, w, h) {
  const BIG = 1e10, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = mask[i] ? 0 : BIG;
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]);
  }
  return g;
}

const count = m => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c; };

export function boundaryAccuracy(gtRgba, outRgba, w, h) {
  const a = edgeMap(gtRgba, w, h), b = edgeMap(outRgba, w, h);
  const na = count(a), nb = count(b);
  if (!na && !nb) return { mean: 0, p95: 0, p99: 0, gtEdgePx: 0, outEdgePx: 0 };
  const da = na ? distanceTransform(a, w, h) : null, db = nb ? distanceTransform(b, w, h) : null;
  const ds = new Float32Array(na + nb);
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]) ds[k++] = db ? Math.min(CAP, db[i]) : CAP;
    if (b[i]) ds[k++] = da ? Math.min(CAP, da[i]) : CAP;
  }
  let sum = 0;
  for (let i = 0; i < ds.length; i++) sum += ds[i];
  ds.sort();
  const q = p => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))];
  return { mean: sum / ds.length, p95: q(0.95), p99: q(0.99), gtEdgePx: na, outEdgePx: nb };
}

let colorCtx;
function hexOf(v) {
  v = v.trim().toLowerCase();
  const m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let s = m[1];
    if (s.length <= 4) s = [...s].map(c => c + c).join("");
    return { hex: "#" + s.slice(0, 6), alpha: s.length === 8 ? parseInt(s.slice(6), 16) / 255 : 1 };
  }
  colorCtx ||= new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
  colorCtx.clearRect(0, 0, 1, 1);
  colorCtx.fillStyle = "#000"; colorCtx.fillStyle = v;
  colorCtx.fillRect(0, 0, 1, 1);
  const d = colorCtx.getImageData(0, 0, 1, 1).data;
  return { hex: "#" + [d[0], d[1], d[2]].map(c => c.toString(16).padStart(2, "0")).join(""), alpha: d[3] / 255 };
}

const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "text"]);
const HIDDEN = new Set(["defs", "clippath", "mask", "symbol", "pattern", "marker", "title", "desc", "metadata", "style"]);

function prop(el, name) {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
    const st = e.getAttribute("style");
    if (st) { const m = new RegExp("(?:^|;)\\s*" + name + "\\s*:\\s*([^;]+)").exec(st); if (m) return m[1].trim(); }
    if (e.hasAttribute(name)) return e.getAttribute(name).trim();
  }
  return null;
}

function stopsOf(doc, id, seen = new Set()) {
  const g = doc.getElementById(id) || doc.querySelector(`[id="${id}"]`);
  if (!g || seen.has(id)) return [];
  seen.add(id);
  const own = [...g.getElementsByTagName("stop")].map(s => prop(s, "stop-color") || "#000");
  if (own.length) return own;
  const href = g.getAttribute("href") || g.getAttribute("xlink:href");
  return href && href[0] === "#" ? stopsOf(doc, href.slice(1), seen) : [];
}

export function svgPalette(svg) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const solid = new Set(), stops = new Set();
  const addSolid = (v, el, opacityName) => {
    const c = v === "currentColor" ? prop(el, "color") || "#000" : v;
    const { hex, alpha } = hexOf(c);
    const op = parseFloat(prop(el, opacityName) ?? "1");
    if (alpha > 0.02 && !(op < 0.02)) solid.add(hex);
  };
  const paint = (el, name, fallback) => {
    const v = prop(el, name) ?? fallback;
    if (!v || v === "none") return;
    const u = /^url\(\s*['"]?#([^'")]+)/.exec(v);
    if (u) { for (const s of stopsOf(doc, u[1])) stops.add(hexOf(s).hex); return; }
    addSolid(v, el, name + "-opacity");
  };
  const walk = el => {
    if (HIDDEN.has(el.localName.toLowerCase())) return;
    if (SHAPES.has(el.localName.toLowerCase())) { paint(el, "fill", "#000"); paint(el, "stroke", null); }
    for (const c of el.children) walk(c);
  };
  walk(doc.documentElement);
  return { solid: [...solid], stops: [...stops] };
}

export function paletteAccuracy(gtSvg, outSvg) {
  const g = svgPalette(gtSvg), o = svgPalette(outSvg);
  const labs = list => list.map(x => rgbToLab(parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)));
  const gl = labs([...new Set([...g.solid, ...g.stops])]), ol = labs([...new Set([...o.solid, ...o.stops, "#ffffff"])]);
  let sum = 0, worst = 0;
  for (const p of gl) {
    let best = 100;
    for (const q of ol) best = Math.min(best, deltaE2000(p, q));
    sum += best; worst = Math.max(worst, best);
  }
  return {
    gtSolid: g.solid.length, outSolid: o.solid.length, gtStops: g.stops.length, outStops: o.stops.length,
    solidRatio: o.solid.length / Math.max(1, g.solid.length),
    deMean: gl.length ? sum / gl.length : 0, deMax: worst
  };
}

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUM = /\s*,?\s*([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/y;
const FLAG = /\s*,?\s*([01])/y;

function pathAnchors(d) {
  let anchors = 0;
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase(), arity = ARITY[cmd], args = m[2];
    if (!arity) continue;
    let pos = 0, n = 0;
    while (true) {
      const k = n % arity, r = cmd === "A" && (k === 3 || k === 4) ? FLAG : NUM;
      r.lastIndex = pos;
      const x = r.exec(args);
      if (!x || x.index !== pos) break;
      pos = r.lastIndex; n++;
    }
    anchors += Math.floor(n / arity);
  }
  return anchors;
}

export function nodeStats(svg) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  let anchors = 0, paths = 0;
  const num = (el, a) => parseFloat(el.getAttribute(a)) || 0;
  const walk = el => {
    const tag = el.localName.toLowerCase();
    if (HIDDEN.has(tag)) return;
    if (tag === "path") { paths++; anchors += pathAnchors(el.getAttribute("d") || ""); }
    else if (tag === "rect") { paths++; anchors += num(el, "rx") > 0 || num(el, "ry") > 0 ? 8 : 4; }
    else if (tag === "circle" || tag === "ellipse") { paths++; anchors += 4; }
    else if (tag === "line") { paths++; anchors += 2; }
    else if (tag === "polygon" || tag === "polyline") { paths++; anchors += ((el.getAttribute("points") || "").match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).length >> 1; }
    for (const c of el.children) walk(c);
  };
  walk(doc.documentElement);
  return { anchors, paths, bytes: new TextEncoder().encode(svg).length };
}

const clamp01 = v => Math.max(0, Math.min(1, v));

export function fidelity(m) {
  const sBoundary = 0.5 * Math.exp(-m.boundary.mean) + 0.5 * Math.exp(-m.boundary.p95 / 4);
  const ratio = Math.min(m.palette.solidRatio, 1 / Math.max(m.palette.solidRatio, 1e-6));
  const sPalette = 0.5 * Math.exp(-m.palette.deMean / 4) + 0.5 * clamp01(ratio);
  const sSsim = clamp01((m.ssim - 0.7) / 0.3);
  const sNodes = 1 / (1 + 0.5 * Math.max(0, Math.log2(Math.max(m.nodes.anchorRatio, 1))));
  const score = 100 * (0.4 * sBoundary + 0.25 * sPalette + 0.35 * sSsim) * sNodes;
  return { score, sBoundary, sPalette, sSsim, sNodes };
}

export function scoreOutput(gtRgba, outRgba, w, h, gtSvg, outSvg) {
  const a = flattenOnWhite(gtRgba), b = flattenOnWhite(outRgba);
  const pix = compare(a, b, w, h);
  const boundary = boundaryAccuracy(a, b, w, h);
  const palette = paletteAccuracy(gtSvg, outSvg);
  const gn = nodeStats(gtSvg), on = nodeStats(outSvg);
  const nodes = {
    gtAnchors: gn.anchors, outAnchors: on.anchors, anchorRatio: on.anchors / Math.max(1, gn.anchors),
    gtPaths: gn.paths, outPaths: on.paths, pathRatio: on.paths / Math.max(1, gn.paths),
    gtBytes: gn.bytes, outBytes: on.bytes, byteRatio: on.bytes / Math.max(1, gn.bytes)
  };
  const m = { psnr: pix.psnr, ssim: pix.ssim, dE: pix.dE, edgeSsim: pix.edge, boundary, palette, nodes };
  m.fidelity = fidelity(m);
  return m;
}
