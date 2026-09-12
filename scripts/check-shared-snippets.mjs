// Verifica que los fragmentos que DEBERÍAN seguir siendo idénticos entre
// los 13 módulos HTML (porque no se centralizan en runtime -- ver el
// comentario de GPI.ui en gpi-core.ts sobre por qué los preconnect de
// Google Fonts no se inyectan vía JS) de verdad lo sigan siendo. No falla
// el build: es una alerta para revisar a mano si alguien edita un módulo
// y el fragmento diverge sin querer.
//
// Uso: node scripts/check-shared-snippets.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const htmlFiles = readdirSync(root).filter((f) => f.endsWith(".html"));

const FONT_LINK_RE = /<link[^>]*fonts\.(?:googleapis|gstatic)[^>]*>/g;

const byContent = new Map(); // contenido normalizado -> [archivos]
const missing = [];

for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), "utf8");
  const matches = html.match(FONT_LINK_RE) || [];
  if (matches.length === 0) { missing.push(file); continue; }
  const key = matches.join("\n");
  if (!byContent.has(key)) byContent.set(key, []);
  byContent.get(key).push(file);
}

console.log(`Módulos revisados: ${htmlFiles.length}`);
console.log(`Sin <link> de Google Fonts: ${missing.length ? missing.join(", ") : "ninguno"}`);
console.log(`Variantes distintas del snippet de fuentes encontradas: ${byContent.size}`);

if (byContent.size > 1) {
  console.log("\n⚠ El snippet de Google Fonts DIVERGE entre módulos:");
  let i = 0;
  for (const [content, files] of byContent) {
    i++;
    console.log(`\n  Variante ${i} (${files.length} archivo(s): ${files.join(", ")}):`);
    console.log("  " + content.split("\n").join("\n  "));
  }
  process.exitCode = 1;
} else {
  console.log("\n✓ El snippet de Google Fonts es idéntico en todos los módulos que lo tienen.");
}
