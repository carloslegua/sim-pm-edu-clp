// Bug real reportado por el usuario: scripts/static-server.mjs (el
// servidor que usan `npm run dev` y tests/e2e vía playwright.config.ts)
// resolvía la ruta pedida con path.join(ROOT, urlPath) -- eso normaliza
// "..", pero NO evita que suficientes segmentos "../" (o su versión
// codificada, "%2e%2e") terminen apuntando a un archivo fuera del repo.
// Una ruta con ".." codificados recibió HTTP 200 y devolvió el
// contenido de un archivo del SDK fuera del proyecto. El servidor solo
// escucha en 127.0.0.1 (expone menos que un bind a 0.0.0.0), pero eso
// no evita que otro proceso local, u otra pestaña del mismo navegador,
// lea archivos arbitrarios del disco con los permisos del usuario
// mientras `npm run dev` está corriendo.
//
// Este test arranca el script REAL como subproceso (igual que
// playwright.config.ts) y confirma en HTTP real, contra un archivo
// "canario" propio creado fuera del repo (para no depender de qué
// archivos existan en las carpetas superiores de cada máquina/CI), que
// una ruta con ".." -- literal o codificada -- nunca devuelve su
// contenido, sin dejar de servir archivos normales del repo.
import { type ChildProcess, spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join as joinPath, relative, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 41730; // puerto propio, distinto del 4173 que usa playwright.config.ts, para no chocar si hay un dev server corriendo
const ROOT = resolve(process.cwd());

const CANARY_CONTENT = "GPI-TRAVERSAL-CANARY-" + Math.random().toString(36).slice(2);
const canaryPath = joinPath(tmpdir(), "gpi-traversal-canary.txt");
// Cuántos "../" hacen falta desde ROOT para llegar a la carpeta temporal
// del sistema (fuera del repo en cualquier máquina/CI), y la ruta URL
// resultante -- una vez con ".." literal, otra con ".." codificado
// (%2e%2e), igual que el reporte original.
const relSegments = relative(ROOT, tmpdir()).split(sep).join("/");
const traversalLiteral = "/" + relSegments + "/gpi-traversal-canary.txt";
const traversalEncoded = "/" + relSegments.replace(/\.\./g, "%2e%2e") + "/gpi-traversal-canary.txt";

let child: ChildProcess;

// Ojo: http.get(URL_COMO_STRING) normaliza los segmentos ".." del
// pathname ANTES de mandar la petición (WHATWG URL) -- eso probaría el
// cliente de Node, no al servidor. Pasando {host, port, path} el
// "path" viaja tal cual en la línea de pedido HTTP, igual que lo
// mandaría curl o un navegador sin normalizar.
function request(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, reject) => {
    get({ host: "127.0.0.1", port: PORT, path }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolvePromise({ status: res.statusCode || 0, body }));
    }).on("error", reject);
  });
}

beforeAll(async () => {
  writeFileSync(canaryPath, CANARY_CONTENT);
  child = spawn(process.execPath, ["scripts/static-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe"
  });
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("static-server.mjs no arrancó a tiempo")), 8000);
    child.stdout?.on("data", (chunk) => { if (String(chunk).includes("Servidor local listo")) { clearTimeout(timer); resolvePromise(); } });
    child.on("error", reject);
  });
}, 15000);

afterAll(() => {
  child.kill();
  try { unlinkSync(canaryPath); } catch (_) { /* noop */ }
});

describe("scripts/static-server.mjs -- no debe servir archivos fuera de la raíz del repo", () => {
  it("un archivo real dentro del repo se sigue sirviendo normalmente (200)", async () => {
    const res = await request("/Panel_Control.html");
    expect(res.status).toBe(200);
    expect(res.body).toContain("<html");
  });

  it("una ruta con '..' literal fuera de la raíz no devuelve el archivo canario", async () => {
    const res = await request(traversalLiteral);
    expect(res.status).not.toBe(200);
    expect(res.body).not.toContain(CANARY_CONTENT);
  });

  it("una ruta con '..' codificado (%2e%2e) fuera de la raíz no devuelve el archivo canario -- repro exacta del bug reportado", async () => {
    const res = await request(traversalEncoded);
    expect(res.status).not.toBe(200);
    expect(res.body).not.toContain(CANARY_CONTENT);
  });

  it("una travesía profunda hacia la raíz del sistema no devuelve 200", async () => {
    const res = await request("/../../../../../../../../../../etc/passwd");
    expect(res.status).not.toBe(200);
  });
});
