// E2E en navegador real: "⇩ Plantilla combinada (.xlsx)" en Panel_Control.html
// genera un libro con una hoja por cada módulo que importa desde Excel (WBS
// Builder, Definir las Actividades, Estimar los Costos, Cronograma/CPM),
// cada una con el nombre y los encabezados EXACTOS que ese módulo espera al
// importar.
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom -- ver
// CLAUDE.md, "Trampas ya encontradas".
import { readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

const WBS_HEADERS = ["Código EDT", "Paquete de trabajo", "Nivel", "Duración", "Inicio", "Fin", "Costo", "Responsable", "Avance"];
const ACTIVITIES_HEADERS = ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Código de hito", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"];
const COST_ESTIMATE_HEADERS = ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"];
const CRONOGRAMA_HEADERS = ["Id.", "Nombre", "Duración (d)", "Comienzo", "Fin", "Predecesoras"];

// Lee los encabezados (primera fila) de una hoja del .xlsx real descargado.
function headersOf(sheetXml: string): string[] {
  const rowMatch = /<row r="1">([\s\S]*?)<\/row>/.exec(sheetXml);
  if (!rowMatch) return [];
  const cellRe = /<c r="[A-Z]+1"[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowMatch[1]))) out.push(m[1] ?? m[2] ?? "");
  return out;
}

// Inserta una fila de datos (fila 2) justo después del encabezado, para
// poder reimportar el archivo con contenido real.
function withDataRow(sheetXml: string, values: string[]): string {
  const COLS = "ABCDEFGHIJ";
  const cell = (ref: string, v: string) => v === "" ? "" : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const row2 = `<row r="2">${values.map((v, i) => cell(COLS[i] + "2", v)).join("")}</row>`;
  return sheetXml.replace(/<\/sheetData>/, row2 + "</sheetData>");
}

test("Panel de Control — 'Plantilla combinada' genera un .xlsx con una hoja por módulo, nombres y encabezados EXACTOS", async ({ page }) => {
  await page.goto("/Panel_Control.html");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnTemplateAll").click()
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  const zip = await JSZip.loadAsync(readFileSync(path as string));
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const sheetNames = Array.from(wbXml.matchAll(/<sheet name="([^"]+)"/g)).map((m) => m[1]);
  expect(sheetNames).toEqual(["Instrucciones", "WBS", "Actividades", "Estimado", "Cronograma"]);

  const sheet2 = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
  const sheet3 = await zip.file("xl/worksheets/sheet3.xml")!.async("string");
  const sheet4 = await zip.file("xl/worksheets/sheet4.xml")!.async("string");
  const sheet5 = await zip.file("xl/worksheets/sheet5.xml")!.async("string");
  expect(headersOf(sheet2)).toEqual(WBS_HEADERS);
  expect(headersOf(sheet3)).toEqual(ACTIVITIES_HEADERS);
  expect(headersOf(sheet4)).toEqual(COST_ESTIMATE_HEADERS);
  expect(headersOf(sheet5)).toEqual(CRONOGRAMA_HEADERS);

  // La hoja "Instrucciones" trae un ejemplo de fila completada para cada
  // una de las tres hojas de datos.
  const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  expect(sheet1).toMatch(/Ejemplo — hoja/);
  expect(sheet1).toMatch(/Cimentaciones/);
  expect(sheet1).toMatch(/Excavaci.n de zanjas/);
  expect(sheet1).toMatch(/Corte de zanja/);

  // La columna "Tipo" (Actividades y Estimado) queda explicada, no solo
  // mencionada de pasada -- incluye sus valores válidos y un ejemplo de fila
  // de referencia (Tipo="Paquete") en Estimado, no solo la fila con precio.
  expect(sheet1).toMatch(/“Tipo” tiene solo DOS valores válidos/);
  expect(sheet1).toMatch(/“Tipo” también puede decir “Proyecto”, “Fase”, “Paquete” u “Hito”/);
  expect(sheet1).toMatch(/Paquete/);

  // La hoja "Cronograma" también trae su bloque de ejemplo, con la sintaxis
  // de Predecesoras explicada.
  expect(sheet1).toMatch(/Ejemplo — hoja “Cronograma”/);
  expect(sheet1).toMatch(/Vaciado de concreto/);
  expect(sheet1).toMatch(/2FS\+2d/);
});

test("Panel de Control — la hoja «WBS» de la plantilla combinada, completada, se puede importar tal cual en WBS Builder", async ({ page }, testInfo) => {
  await page.goto("/Panel_Control.html");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnTemplateAll").click()
  ]);
  const path = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(path as string));
  const sheet2 = await zip.file("xl/worksheets/sheet2.xml")!.async("string");

  // Completa una fila real bajo los encabezados exactos que trajo la
  // plantilla -- prueba que ese texto de encabezado es aceptado de verdad
  // por WBS Builder, no solo una copia que "se parece".
  zip.file("xl/worksheets/sheet2.xml", withDataRow(sheet2, ["1", "Excavación", "", "10", "", "", "5000", "Ana", ""]));
  const filledPath = testInfo.outputPath("plantilla_wbs_completada.xlsx");
  writeFileSync(filledPath, await zip.generateAsync({ type: "nodebuffer" }));

  await page.goto("/WBS_Builder.html");
  await expect(page.locator("#canvas .node")).toHaveCount(1); // solo la raíz
  await page.setInputFiles("#xlsxFileInput", filledPath);

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMessage").textContent();
  expect(msg).toMatch(/1 nodo\(s\) importado\(s\)/);
  await page.locator("#modalConfirmBtn").click();

  await expect(page.locator("#canvas .node")).toHaveCount(2);
  await page.locator("#viewTableBtn").click();
  await expect(page.locator(".wbs-table tbody tr")).toContainText(["Excavación"]);
});

test("Panel de Control — la hoja «Actividades» de la plantilla combinada, completada, se puede importar tal cual en Definir las Actividades", async ({ page }, testInfo) => {
  const seedDb = {
    version: 1, activeId: "p1",
    projects: {
      p1: {
        schema: "gpi.project/v1",
        meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
        modules: {
          wbs: {
            rootId: "root", idCounter: 2,
            nodes: {
              root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
              w1: { id: "w1", parentId: "root", name: "Excavación", children: [] }
            }
          }
        }
      }
    }
  };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Panel_Control.html");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnTemplateAll").click()
  ]);
  const path = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(path as string));
  const sheet3 = await zip.file("xl/worksheets/sheet3.xml")!.async("string");

  // Completa una fila real (sin Id., como una actividad genuinamente nueva)
  // bajo los encabezados exactos que trajo la plantilla -- prueba que ese
  // texto de encabezado es aceptado de verdad por Definir las Actividades.
  zip.file("xl/worksheets/sheet3.xml", withDataRow(sheet3, ["", "1", "Excavación", "Corte de zanja", "", "", "m³", "100", "25", "1"]));
  const filledPath = testInfo.outputPath("plantilla_actividades_completada.xlsx");
  writeFileSync(filledPath, await zip.generateAsync({ type: "nodebuffer" }));

  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(1);
  await page.setInputFiles("#xlsxFileInput", filledPath);

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/1 actividad\(es\)/);
  await page.locator("#modalOk").click();

  await expect(page.locator(".act-row")).toHaveCount(1);
  await expect(page.locator(".act-row")).toContainText("Corte de zanja");
});

test("Panel de Control — la hoja «Cronograma» de la plantilla combinada, completada, se puede importar tal cual en Cronograma / CPM", async ({ page }, testInfo) => {
  const seedDb = {
    version: 1, activeId: "p1",
    projects: {
      p1: {
        schema: "gpi.project/v1",
        meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
        modules: {
          wbs: {
            rootId: "root", idCounter: 3,
            nodes: {
              root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
              w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2"] },
              w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] }
            }
          },
          activities: {
            byLeaf: { w2: [
              { id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 },
              { id: "a2", name: "Vaciar concreto", unit: "m³", qty: 50, perf: 10, teams: 1 }
            ] }, idCounter: 3
          }
        }
      }
    }
  };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Panel_Control.html");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnTemplateAll").click()
  ]);
  const path = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(path as string));
  const sheet5 = await zip.file("xl/worksheets/sheet5.xml")!.async("string");

  // Snapshot de Cronograma/CPM para este proyecto: 0 proyecto, 1 fase,
  // 2 paquete, 3 "Excavar zanja", 4 "Vaciar concreto" -- completa
  // Predecesoras con el Id. real bajo los encabezados exactos que trajo la
  // plantilla, prueba que ese texto de encabezado es aceptado de verdad por
  // Cronograma/CPM.
  zip.file("xl/worksheets/sheet5.xml", withDataRow(sheet5, ["4", "Vaciar concreto", "", "", "", "3FS+1d"]));
  const filledPath = testInfo.outputPath("plantilla_cronograma_completada.xlsx");
  writeFileSync(filledPath, await zip.generateAsync({ type: "nodebuffer" }));

  await page.goto("/Cronograma_CPM.html");
  await expect(page.locator(".act-row")).toHaveCount(2);
  await expect(page.locator("#kpiLinks")).toHaveText("0");
  await page.setInputFiles("#xlsxFileInput", filledPath);

  // El archivo se parsea de inmediato: un único modal de previsualización
  // (sin paso previo de "pegar texto", ya no existe) con el resumen y la
  // lista de enlaces a crear.
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/Se interpretaron.*1.*fila/);
  expect(msg).toContain("Enlaces a crear");
  await page.locator("#modalOk").click();

  await expect(page.locator("#kpiLinks")).toHaveText("1");
});
