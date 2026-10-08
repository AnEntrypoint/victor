const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "results");
const tag = process.argv[2] || "baseline";
const files = fs.readdirSync(dir).filter(f => /^raw-base-.*\.json$/.test(f) && tag === "baseline" || f.startsWith(`raw-${tag}-`));
const records = files.flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const COLS = [
  ["n", rs => rs.length, 0],
  ["fidelity", rs => mean(rs.map(r => r.m.fidelity.score)), 1],
  ["bnd mean px", rs => mean(rs.map(r => r.m.boundary.mean)), 2],
  ["bnd p95 px", rs => mean(rs.map(r => r.m.boundary.p95)), 2],
  ["palette dE", rs => mean(rs.map(r => r.m.palette.deMean)), 2],
  ["colours out/gt", rs => median(rs.map(r => r.m.palette.solidRatio)), 2],
  ["SSIM@1024", rs => mean(rs.map(r => r.m.ssim)), 3],
  ["anchors out/gt", rs => median(rs.map(r => r.m.nodes.anchorRatio)), 1],
  ["paths out/gt", rs => median(rs.map(r => r.m.nodes.pathRatio)), 1],
  ["bytes out/gt", rs => median(rs.map(r => r.m.nodes.byteRatio)), 1],
  ["ms", rs => mean(rs.map(r => r.ms)), 0]
];

const ok = records.filter(r => r.m);
const errors = records.filter(r => !r.m);
const group = (rs, key) => { const g = new Map(); for (const r of rs) { const k = key(r); (g.get(k) || g.set(k, []).get(k)).push(r); } return g; };
const cell = (rs, c) => { const v = c[1](rs); return Number.isFinite(v) ? v.toFixed(c[2]) : "-"; };

function table(title, keyName, key, order) {
  let md = `\n### ${title}\n\n| pipeline | ${keyName} | ${COLS.map(c => c[0]).join(" | ")} |\n|${"---|".repeat(COLS.length + 2)}\n`;
  const json = [];
  for (const [p, prs] of group(ok, r => r.pipeline)) {
    const g = group(prs, key);
    for (const k of order || [...g.keys()].sort()) {
      const rs = g.get(k);
      if (!rs) continue;
      md += `| ${p} | ${k} | ${COLS.map(c => cell(rs, c)).join(" | ")} |\n`;
      json.push({ pipeline: p, [keyName]: k, ...Object.fromEntries(COLS.map(c => [c[0], c[1](rs)])) });
    }
  }
  return { md, json };
}

const sections = [
  ["Overall", "all", () => "all", ["all"]],
  ["By degradation variant", "variant", r => r.variant, ["clean", "jpeg70", "blur", "screenshot"]],
  ["By input size (long side px)", "size", r => String(r.size), ["128", "256", "512"]],
  ["By variant and size", "degradation", r => `${r.variant}@${r.size}`, ["clean", "jpeg70", "blur", "screenshot"].flatMap(v => [128, 256, 512].map(s => `${v}@${s}`))],
  ["By logo kind", "kind", r => r.kind, ["glyph", "stroke", "flat-multi", "gradient", "text"]]
].map(([t, k, f, o]) => table(t, k, f, o));

let md = `# Logo ground-truth baseline\n\n${ok.length} scored runs, ${errors.length} errors, ${new Set(ok.map(r => r.id)).size} ground-truth logos. Boundary and palette columns are means; the three ratio columns and the colour ratio are medians. Lower is better for boundary, palette dE and ratios (target 1.0); higher for fidelity and SSIM.\n`;
for (const s of sections) md += s.md;
if (errors.length) md += `\n### Errors\n\n${errors.slice(0, 20).map(e => `- ${e.pipeline} ${e.id} ${e.variant}@${e.size}: ${e.error}`).join("\n")}\n`;

fs.writeFileSync(path.join(dir, `${tag}.md`), md);
fs.writeFileSync(path.join(dir, `${tag}.json`), JSON.stringify({ runs: ok.length, errors: errors.length, tables: Object.fromEntries(sections.map((s, i) => [["overall", "variant", "size", "degradation", "kind"][i], s.json])) }, null, 1));
console.log(md);
