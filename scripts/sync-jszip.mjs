// Vendoriza JSZip (dependencia de npm, ver package.json) copiándola a
// .build-tmp/jszip/ -- la misma convención de carpeta temporal que usa
// Vite para el resto de los artefactos, así scripts/sync-artifact.mjs
// (y por lo tanto `npm run build:all`) la reconoce y verifica su
// frescura igual que a cualquier otro artefacto, sin ningún caso
// especial en ese script.
//
// Por qué existe: Activity_Definition.html, Cronograma_CPM.html,
// Estimar_Costos.html, WBS_Builder.html y Panel_Control.html cargaban
// JSZip desde cdnjs.cloudflare.com -- si el CDN está bloqueado (red del
// aula, firewall corporativo, sin conexión), la importación de un
// .xlsx real fallaba con un mensaje engañoso ("el archivo no parece
// ser un .xlsx válido") en vez de avisar que la librería no llegó a
// cargar. Bug real reportado por el usuario. `node_modules/jszip/dist/jszip.min.js`
// ya es un bundle UMD clásico (sin sintaxis ESM, cuelga `window.JSZip`
// como los 13 módulos esperan) y es la MISMA versión que ya usan los
// fixtures .xlsx de tests/e2e (paquete `jszip` de npm) -- vendorizarla
// elimina la dependencia de Internet para el uso normal (file://,
// GitHub Pages, `npm run dev`) sin introducir una copia distinta.
//
// Uso: node scripts/sync-jszip.mjs
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "jszip", "dist", "jszip.min.js");
if (!existsSync(src)) {
  console.error(`No se encontró "${src}" -- ¿corriste "npm install"?`);
  process.exit(1);
}
const outDir = join(root, ".build-tmp", "jszip");
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, "jszip.min.js");
copyFileSync(src, dest);
console.log(`Copiado: ${src} -> ${dest}`);
