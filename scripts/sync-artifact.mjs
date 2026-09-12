// Copia un artefacto compilado por Vite (modo librería) desde la carpeta de
// build temporal a la raíz del repo, donde los 13 módulos HTML lo cargan
// como <script src="..."> clásico. Ver MIGRATION.md: los artefactos
// compilados se commitean, GitHub Pages sigue sirviendo la raíz sin build.
//
// Uso: node scripts/sync-artifact.mjs <nombre-archivo>
//   node scripts/sync-artifact.mjs gpi-core.js
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const fileName = process.argv[2];
if (!fileName) {
  console.error("Uso: node scripts/sync-artifact.mjs <nombre-archivo>");
  process.exit(1);
}

// Busca el archivo dentro de cualquier subcarpeta de .build-tmp (una por
// paquete: core, shared, módulos...) para no acoplar este script a una
// única ruta de build.
import { readdirSync, statSync } from "node:fs";
function findInBuildTmp(dir, name) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findInBuildTmp(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

const src = findInBuildTmp(join(root, ".build-tmp"), fileName);
if (!src) {
  console.error(`No se encontró "${fileName}" dentro de .build-tmp/. ¿Corriste el build primero?`);
  process.exit(1);
}
const dest = join(root, fileName);
copyFileSync(src, dest);
console.log(`Copiado: ${src} -> ${dest}`);
