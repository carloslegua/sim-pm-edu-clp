// Servidor estático mínimo para servir la raíz del repo por HTTP local.
// Usado por Playwright (tests/e2e, ver playwright.config.ts) para probar
// el modo "mismo origen" documentado en README.md ("Nota"): los módulos
// comparten localStorage de forma confiable servidos por HTTP, a
// diferencia de file:// entre documentos distintos.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 4173;
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer((req, res) => {
  try {
    const path = join(ROOT, decodeURIComponent((req.url || "/").split("?")[0]));
    const body = readFileSync(path);
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`static-server escuchando en http://127.0.0.1:${PORT}/`);
});
