import { SIZES, VARIANTS, svgAspect, dimsFor, degrade, renderImageData } from "./degrade.js";
import { scoreOutput } from "./score.js";

export const SCORE_LONG_SIDE = 1024;

export async function loadCorpus() {
  const manifest = await (await fetch("./manifest.json")).json();
  return Promise.all(manifest.map(async (m, i) => ({ ...m, background: i % 2 === 0 ? "transparent" : "white", svg: await (await fetch(`./gt/${m.id}.svg`)).text() })));
}

export async function runLogoBench({ pipelines, names, items, sizes = SIZES, variants = VARIANTS, onProgress }) {
  const mod = (await import(pipelines)).default;
  const pipeNames = names || Object.keys(mod);
  const corpus = (await loadCorpus()).filter(c => !items || items.includes(c.id));
  const records = [];
  window.logoPartial = records;
  for (const item of corpus) {
    const [W, H] = dimsFor(svgAspect(item.svg), SCORE_LONG_SIDE);
    const gtPixels = (await renderImageData(item.svg, W, H)).data;
    for (const size of sizes) {
      for (const variant of variants) {
        const image = await degrade(item.svg, size, variant, item.background);
        for (const name of pipeNames) {
          onProgress?.(`${item.id} ${size} ${variant} ${name}`);
          const rec = { id: item.id, kind: item.kind, size, variant, background: variant === "jpeg70" ? "white" : item.background, pipeline: name };
          try {
            const t0 = performance.now();
            const svg = await mod[name](image);
            rec.ms = Math.round(performance.now() - t0);
            const out = (await renderImageData(svg, W, H)).data;
            rec.renderMs = Math.round(performance.now() - t0) - rec.ms;
            rec.m = scoreOutput(gtPixels, out, W, H, item.svg, svg);
            rec.totalMs = Math.round(performance.now() - t0);
          } catch (e) {
            rec.error = String(e && e.message || e);
          }
          records.push(rec);
        }
      }
    }
  }
  return records;
}

export async function save(name, body) {
  const r = await fetch(`/__save?dir=logo&name=${encodeURIComponent(name)}`, { method: "POST", body });
  if (!r.ok) throw new Error("save failed " + r.status);
}
