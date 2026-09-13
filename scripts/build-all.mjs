/* =========================================================
   build:all — reconstruye los 15 artefactos y verifica que no haya
   quedado ninguno desfasado respecto de lo commiteado.

   El riesgo que cierra este script (identificado en la Fase 5 de
   MIGRATION.md): como los artefactos compilados (los .js/.css de la
   raíz) se commitean junto a su fuente en src/, es posible editar un
   .ts, olvidar correr su `npm run build:<clave>` y comitear solo la
   fuente. El HTML publicado seguiría cargando el .js VIEJO, sin ningún
   error visible -- `npm run verify:deploy` no lo detecta, porque el
   artefacto existe y es un IIFE válido, solo que desactualizado.

   Este script:
     1. Deriva la lista de artefactos y sus scripts `build:<clave>`
        directamente de package.json (no la duplica a mano).
     2. Corre cada build en orden, capturando su salida (solo se
        imprime si falla, para no ahogar la señal en 15 logs de Vite).
     3. Compara el resultado contra lo commiteado con `git status
        --porcelain` acotado a esos archivos exactos. Si el rebuild
        produjo bytes distintos a los del último commit, el artefacto
        publicado estaba desfasado: lo reporta y termina con código 1.

   Uso:  npm run build:all
   ========================================================= */
import { execFileSync } from "node:child_process";
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// ---------- 1. derivar módulos y artefactos desde los propios scripts ----------
const buildEntries = Object.entries(pkg.scripts)
  .filter(([name]) => name.startsWith("build:") && name !== "build:all");

if (!buildEntries.length) {
  console.error("No se encontró ningún script `build:<clave>` en package.json.");
  process.exit(1);
}

const steps = buildEntries.map(([name, cmd]) => {
  const syncMatch = /sync-artifact\.mjs\s+(\S+)/.exec(cmd);
  const artifact = syncMatch ? syncMatch[1] : "gpi-shared.css"; // única build sin sync-artifact.mjs
  return { name, cmd, artifact };
});

console.log(`=== Reconstruyendo ${steps.length} artefacto(s) ===`);
const failed = [];
for (const step of steps) {
  try {
    execFileSync(NPM_CMD, ["run", "--silent", step.name], { cwd: root, stdio: "pipe", shell: process.platform === "win32" });
    console.log(`  ✓ ${step.name.padEnd(28)} → ${step.artifact}`);
  } catch (e) {
    failed.push(step.name);
    console.log(`  ✗ ${step.name.padEnd(28)} → FALLÓ`);
    const out = (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") || e.message || String(e);
    console.log(out.split("\n").map((l) => "      " + l).join("\n"));
  }
}
if (failed.length) {
  console.log(`\nRESULTADO: ${failed.length} build(s) fallaron (${failed.join(", ")}). No se verificó frescura.`);
  process.exit(1);
}

// ---------- 2. verificar que el rebuild no difiera de lo commiteado ----------
// A propósito NO se usa `git status --porcelain`: en Windows, con
// core.autocrlf=true, un archivo recién escrito por Vite (LF puro) puede
// aparecer como "modificado" frente al índice por pura normalización de fin
// de línea, aunque su CONTENIDO sea idéntico -- falso positivo confirmado en
// este repo. `git diff` sí aplica el filtro "clean" (el mismo que se aplica
// al hacer `git add`) antes de comparar, así que compara contenido real.
console.log("\n=== Verificando frescura contra el último commit ===");
const artifacts = [...new Set(steps.map((s) => s.artifact))];
let diffStat = "";
try {
  // stderr silenciado: git solo emite ahí el aviso informativo de conversión
  // LF/CRLF (core.autocrlf), no un error -- ensuciaba la salida en Windows.
  diffStat = execFileSync("git", ["diff", "HEAD", "--stat", "--", ...artifacts], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch (e) {
  console.log("  (no se pudo consultar git diff -- ¿este directorio es un repo git?)");
  console.log("  " + (e.message || e));
  process.exit(1);
}

if (!diffStat) {
  console.log(`  ✓ Los ${artifacts.length} artefactos coinciden con el último commit (contenido real, ignorando fin de línea).`);
  console.log("\nRESULTADO: todo al día -- lo publicado en el repo es exactamente lo que generan las fuentes actuales.");
  process.exit(0);
}

console.log("  ✗ Artefacto(s) DESFASADOS respecto del último commit (el rebuild produjo contenido distinto):");
diffStat.split("\n").forEach((l) => console.log("      " + l));
console.log("\nRESULTADO: había artefactos publicados desactualizados. Ya se regeneraron en tu working tree --");
console.log("revisa el diff (`git diff -- " + artifacts.join(" ") + "`) y comitéalos junto con el cambio de fuente que los originó.");
process.exit(1);
