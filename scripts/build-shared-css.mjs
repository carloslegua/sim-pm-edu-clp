// Copia src/shared/styles/shared.css -> gpi-shared.css en la raíz.
// Es CSS puro (sin variables SCSS ni preprocesado), así que no hace falta
// un build de Vite: alcanza con una copia directa, igual de "generado, no
// editado a mano" que gpi-core.js. Ver MIGRATION.md.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "src/shared/styles/shared.css");
const dest = join(root, "gpi-shared.css");

copyFileSync(src, dest);
console.log(`Copiado: ${src} -> ${dest}`);
