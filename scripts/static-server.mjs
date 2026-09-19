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
import { extname, resolve, sep } from "node:path";

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.PORT) || 4173;
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    // path.join (lo que usaba esto antes) NO evita salir de ROOT: normaliza
    // "..", pero deja que suficientes segmentos "../" (o su versión
    // codificada, "%2e%2e%2f") terminen leyendo cualquier archivo del disco
    // fuera del repo con los permisos del proceso -- bug real reportado por
    // el usuario, reproducido con una ruta ".." codificada que devolvía 200
    // y el contenido de un archivo del SDK fuera del proyecto. Anteponer
    // "." antes de resolver evita además que un urlPath que Node trate como
    // absoluto descarte a ROOT (path.resolve, a diferencia de path.join,
    // usa solo el último argumento si es absoluto). Cualquier ruta resuelta
    // que no quede DENTRO de ROOT se rechaza -- nunca se llega a
    // readFileSync con ella.
    const resolved = resolve(ROOT, "." + urlPath);
    if (resolved !== ROOT && !resolved.startsWith(ROOT + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = readFileSync(resolved);
    res.writeHead(200, { "Content-Type": MIME[extname(resolved)] || "application/octet-stream" });
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
