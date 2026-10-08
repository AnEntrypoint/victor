import { compare, combine } from "./metrics.js";

const base = new URL(".", import.meta.url);
const encoder = new TextEncoder();

async function loadImage(entry) {
  const blob = await (await fetch(new URL("corpus/" + entry.file, base))).blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(bmp, 0, 0);
  return x.getImageData(0, 0, bmp.width, bmp.height);
}

async function rasterize(svg, w, h) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
    x.drawImage(img, 0, 0, w, h);
    return x.getImageData(0, 0, w, h).data;
  } finally { URL.revokeObjectURL(url); }
}

async function scoreOne(fn, entry, image) {
  const t0 = performance.now();
  const svg = await fn(image);
  const ms = performance.now() - t0;
  const bytes = encoder.encode(svg).length;
  const paths = (svg.match(/<path/g) || []).length;
  const out = await rasterize(svg, image.width, image.height);
  const m = compare(image.data, out, image.width, image.height);
  const r = { id: entry.id, kind: entry.kind, width: image.width, height: image.height, ...m, bytes, paths, ms };
  return Object.assign(r, combine(r));
}

const mean = (rows, k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
const KEYS = ["psnr", "ssim", "dE", "edge", "bytes", "paths", "ms", "quality", "score"];

export async function runBench({ pipelines = "./pipelines.js", names, ids, onProgress } = {}) {
  const manifest = await (await fetch(new URL("corpus/manifest.json", base))).json();
  const fns = (await import(new URL(pipelines, base).href)).default;
  const use = names || Object.keys(fns);
  const entries = ids ? manifest.filter(e => ids.includes(e.id)) : manifest;
  const result = { when: new Date().toISOString(), pipelines: {}, bestPerImage: [] };
  const images = new Map();
  for (const name of use) {
    const rows = [];
    for (const e of entries) {
      if (!images.has(e.id)) images.set(e.id, await loadImage(e));
      try { rows.push(await scoreOne(fns[name], e, images.get(e.id))); }
      catch (err) { rows.push({ id: e.id, kind: e.kind, error: String(err), score: 0, quality: 0 }); }
      if (onProgress) onProgress(name, e.id);
    }
    const ok = rows.filter(r => !r.error);
    result.pipelines[name] = { rows, mean: Object.fromEntries(KEYS.map(k => [k, ok.length ? mean(ok, k) : NaN])), failures: rows.length - ok.length };
  }
  for (const e of entries) {
    const cands = use.map(n => ({ name: n, row: result.pipelines[n].rows.find(r => r.id === e.id) })).filter(c => !c.row.error);
    if (!cands.length) continue;
    const best = cands.reduce((a, b) => (b.row.score > a.row.score ? b : a));
    const bestQ = cands.reduce((a, b) => (b.row.quality > a.row.quality ? b : a));
    result.bestPerImage.push({ id: e.id, kind: e.kind, bestScore: best.name, score: best.row.score, bestQuality: bestQ.name, quality: bestQ.row.quality });
  }
  const bp = result.bestPerImage;
  result.bestOfPresets = bp.length ? { score: mean(bp, "score"), quality: mean(bp, "quality") } : null;
  return result;
}

const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

export function toMarkdown(result) {
  const lines = [`# Benchmark ${result.when}`, ""];
  for (const [name, p] of Object.entries(result.pipelines)) {
    lines.push(`## ${name}`, "", "| image | kind | PSNR dB | SSIM | dE00 | edge SSIM | KB | paths | ms | Q | score |", "|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of p.rows) {
      lines.push(r.error ? `| ${r.id} | ${r.kind} | error: ${r.error} | | | | | | | | |` :
        `| ${r.id} | ${r.kind} | ${fmt(r.psnr, 2)} | ${fmt(r.ssim, 4)} | ${fmt(r.dE, 2)} | ${fmt(r.edge, 4)} | ${fmt(r.bytes / 1024, 1)} | ${r.paths} | ${fmt(r.ms, 0)} | ${fmt(r.quality, 4)} | ${fmt(r.score, 2)} |`);
    }
    const m = p.mean;
    lines.push(`| **mean** | | ${fmt(m.psnr, 2)} | ${fmt(m.ssim, 4)} | ${fmt(m.dE, 2)} | ${fmt(m.edge, 4)} | ${fmt(m.bytes / 1024, 1)} | ${fmt(m.paths, 0)} | ${fmt(m.ms, 0)} | ${fmt(m.quality, 4)} | ${fmt(m.score, 2)} |`, "");
  }
  if (result.bestPerImage.length) {
    lines.push("## Best preset per image", "", "| image | kind | best by score | score | best by quality | Q |", "|---|---|---|---|---|---|");
    for (const b of result.bestPerImage) lines.push(`| ${b.id} | ${b.kind} | ${b.bestScore} | ${fmt(b.score, 2)} | ${b.bestQuality} | ${fmt(b.quality, 4)} |`);
    lines.push("", `Mean with best preset per image: score ${fmt(result.bestOfPresets.score, 2)}, Q ${fmt(result.bestOfPresets.quality, 4)}`, "");
  }
  return lines.join("\n");
}

export async function save(dir, name, body) {
  const r = await fetch(`/__save?dir=${dir}&name=${encodeURIComponent(name)}`, { method: "POST", body });
  return r.ok;
}

window.victorBench = { runBench, toMarkdown, save };
