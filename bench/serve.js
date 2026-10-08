const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".md": "text/markdown", ".css": "text/css" };
const saveDirs = { results: path.join(root, "bench", "results"), corpus: path.join(root, "bench", "corpus") };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/__save") {
    const dir = saveDirs[url.searchParams.get("dir")], name = path.basename(url.searchParams.get("name") || "");
    if (!dir || !name) { res.writeHead(400); return res.end(); }
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.writeHead(200); res.end("ok"); });
    return;
  }
  const p = path.join(root, decodeURIComponent(url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  let f = p;
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); } catch (e) { res.writeHead(404); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": mime[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(d);
  });
}).listen(+process.env.PORT || 8765, "127.0.0.1");
