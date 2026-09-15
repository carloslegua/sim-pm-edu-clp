// E2E en navegador real: "⇩ Plantilla combinada (.xlsx)" en Panel_Control.html
// genera un libro con una hoja por cada módulo que importa desde Excel (WBS
// Builder, Definir las Actividades, Estimar los Costos), cada una con el
// nombre y los encabezados EXACTOS que ese módulo espera al importar.
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom -- ver
// CLAUDE.md, "Trampas ya encontradas".
import { readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

const WBS_HEADERS = ["Código EDT", "Paquete de trabajo", "Nivel", "Duración", "Inicio", "Fin", "Costo", "Responsable", "Avance"];
const ACTIVITIES_HEADERS = ["Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Código de hito", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"];
const COST_ESTIMATE_HEADERS = ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"];

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
  expect(sheetNames).toEqual(["Instrucciones", "WBS", "EDT", "Estimado"]);

  const sheet2 = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
  const sheet3 = await zip.file("xl/worksheets/sheet3.xml")!.async("string");
  const sheet4 = await zip.file("xl/worksheets/sheet4.xml")!.async("string");
  expect(headersOf(sheet2)).toEqual(WBS_HEADERS);
  expect(headersOf(sheet3)).toEqual(ACTIVITIES_HEADERS);
  expect(headersOf(sheet4)).toEqual(COST_ESTIMATE_HEADERS);
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
