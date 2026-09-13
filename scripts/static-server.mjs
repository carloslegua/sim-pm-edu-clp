// Servidor estático mínimo para servir la raíz del repo por HTTP local.
// Dos usos:
//   1. `npm run dev` -- para trabajar con varios módulos a la vez: bajo
//      file:// el navegador puede NO compartir localStorage entre
//      documentos distintos (ver README.md, "Nota", y CLAUDE.md); bajo
//      un mismo origen HTTP sí lo comparte de forma confiable, siempre.
//   2. Playwright (tests/e2e, ver playwright.config.ts) para probar
//      exactamente ese modo "mismo origen" de punta a punta.
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
  console.log(`Servidor local listo → http://127.0.0.1:${PORT}/Panel_Control.html`);
  console.log("Ctrl+C para detenerlo.");
});
