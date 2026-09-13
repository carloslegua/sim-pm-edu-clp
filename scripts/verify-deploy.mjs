/* =========================================================
   Fase 5 — Verificación de despliegue (GitHub Pages y file://)

   Audita, sin abrir un navegador, que el resultado de la migración
   siga cumpliendo las dos reglas no negociables de MIGRATION.md:

     1. Todo artefacto compilado es un IIFE clásico (no un módulo ES):
        si alguno llegara con `import`/`export` en el nivel superior,
        el navegador lo rechazaría por CORS al abrirlo con doble clic
        (file://) y la herramienta quedaría muerta sin aviso.
     2. Ningún HTML carga scripts con type="module" ni rutas absolutas:
        GitHub Pages sirve la raíz tal cual, sin paso de build.

   Además verifica que cada HTML referencie un artefacto que existe en
   el repositorio (evita el caso "olvidé commitear el .js compilado",
   que rompería el despliegue aunque los tests locales pasen).

   Uso:  node scripts/verify-deploy.mjs
   ========================================================= */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let failures = 0;
function ok(msg) { console.log("  ✓ " + msg); }
function bad(msg) { console.log("  ✗ " + msg); failures++; }

const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

console.log("=== 1. Artefactos compilados: IIFE clásico, sin sintaxis ESM ===");
// Los artefactos son los .js del raíz (gpi-core.js + un bundle por módulo).
const artifacts = readdirSync(ROOT).filter((f) => f.endsWith(".js")).sort();
if (!artifacts.length) bad("No se encontró ningún artefacto .js en la raíz.");
for (const f of artifacts) {
  const src = readFileSync(join(ROOT, f), "utf8");
  const esm = [
    [/^\s*import\s+[^(]/m, "import estático"],
    [/^\s*export\s+(default|const|let|var|function|class|\{)/m, "export"],
    [/\bimport\.meta\b/, "import.meta"],
    [/\bimport\s*\(/, "import() dinámico"]
  ].filter(([re]) => re.test(src)).map(([, name]) => name);
  // El bug histórico de la Fase 4: Rollup emitía `exports.x = …` sin que
  // `exports` fuese parámetro del IIFE => ReferenceError al cargar.
  const looseExports = /(^|[^.\w])exports\s*[.[]/.test(src) && !/function\s*\([^)]*\bexports\b/.test(src);
  if (esm.length) bad(`${f}: contiene sintaxis ESM (${esm.join(", ")}) — rompería file://`);
  else if (looseExports) bad(`${f}: referencia \`exports\` sin recibirlo como parámetro del IIFE`);
  else ok(`${f}: IIFE clásico sin ESM (${(src.length / 1024).toFixed(1)} kB)`);
}

console.log("\n=== 2. HTML: sin type=\"module\", sin rutas absolutas, artefacto presente ===");
for (const f of htmlFiles) {
  const html = readFileSync(join(ROOT, f), "utf8");
  const tags = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
  const problems = [];
  for (const attrs of tags) {
    if (/type\s*=\s*["']module["']/i.test(attrs)) problems.push('type="module"');
    const srcMatch = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (srcMatch) {
      const src = srcMatch[1];
      if (src.startsWith("/")) problems.push(`ruta absoluta: ${src}`);
      else if (!/^https?:/i.test(src) && !existsSync(join(ROOT, src))) problems.push(`artefacto ausente: ${src}`);
    }
  }
  // hojas de estilo compartidas: mismo criterio (deben existir en el repo)
  for (const m of html.matchAll(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1];
    if (/^https?:/i.test(href)) continue;
    if (href.startsWith("/")) problems.push(`ruta absoluta: ${href}`);
    else if (!existsSync(join(ROOT, href))) problems.push(`hoja ausente: ${href}`);
  }
  if (problems.length) bad(`${f}: ${problems.join(" · ")}`);
  else ok(`${f}: ${tags.length} <script> clásico(s), todas las rutas relativas y presentes`);
}

console.log("\n=== 3. Cada HTML sigue cargando gpi-core.js ===");
for (const f of htmlFiles) {
  const html = readFileSync(join(ROOT, f), "utf8");
  if (/<script[^>]+src\s*=\s*["']gpi-core\.js["']/i.test(html)) ok(`${f}`);
  else bad(`${f}: ya no carga gpi-core.js`);
}

console.log("\n=== 4. Ningún <script> inline quedó sin migrar ===");
for (const f of htmlFiles) {
  const html = readFileSync(join(ROOT, f), "utf8");
  // Un <script> sin src con cuerpo no trivial = lógica que quedó inline.
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim()).filter((body) => body.length > 0);
  if (inline.length) bad(`${f}: ${inline.length} <script> inline con código (${inline[0].slice(0, 60).replace(/\s+/g, " ")}…)`);
  else ok(`${f}: sin lógica inline`);
}

console.log("\n" + (failures ? `RESULTADO: ${failures} problema(s) de despliegue.` : "RESULTADO: despliegue verificado — file:// y GitHub Pages intactos."));
process.exit(failures ? 1 : 0);
