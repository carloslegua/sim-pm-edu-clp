// E2E en navegador real: importar/exportar un .xlsx real en WBS_Builder.html
// -- mismo mecanismo hand-rolled (JSZip) que Definir las Actividades/Estimar
// los Costos, pero a diferencia de esos dos (que importan filas SOBRE una
// EDT ya existente), WBS Builder ES la fuente de la EDT: el import
// RECONSTRUYE el árbol completo a partir de la columna "Código EDT".
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom -- ver
// CLAUDE.md, "Trampas ya encontradas".
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

// Arma un .xlsx real con la librería jszip de npm (Node puro, no depende del
// window.JSZip del navegador). sheetName es opcional (por defecto "WBS", el
// nombre real que exporta el módulo) -- para poder armar también el caso de
// una hoja con OTRO nombre.
async function buildRowsXlsx(headerRow: string[], rows: string[][], sheetName = "WBS"): Promise<Buffer> {
  const zip = new JSZip();
  const allRows = [headerRow, ...rows];
  const COLS = "ABCDEFGHIJ";
  const cellInline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheetXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + allRows.map((cells, ri) => `<row r="${ri + 1}">` + cells.map((v, ci) => v === "" ? "" : cellInline(COLS[ci] + (ri + 1), v)).join("") + "</row>").join("")
    + "</sheetData></worksheet>";
  zip.file("[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file("_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file("xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

const HEADER = ["Código EDT", "Paquete de trabajo", "Nivel", "Duración", "Inicio", "Fin", "Costo", "Responsable", "Avance"];

const blankSeedDb = {
  version: 1, activeId: "p1",
  projects: {
    p1: {
      schema: "gpi.project/v1",
      meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
      modules: {}
    }
  }
};

test("WBS Builder — importar un .xlsx completado reconstruye la EDT a partir del Código EDT (jerarquía + valores de paquete)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, blankSeedDb);
  await page.goto("/WBS_Builder.html");
  await expect(page.locator("#canvas .node")).toHaveCount(1); // solo la raíz

  const buffer = await buildRowsXlsx(HEADER, [
    // La fase 1 trae un Costo "999999" en el archivo -- debe IGNORARSE (no es
    // un paquete, no tiene fila hija debajo... en realidad SÍ tiene hijas, así
    // que su Costo se recalcula como la suma de sus paquetes).
    ["1", "Fase 1", "1", "", "", "", "999999", "", ""],
    ["1.1", "Excavación", "2", "10", "2026-01-01", "2026-01-10", "5000", "Ana", "50"],
    ["1.2", "Encofrado", "2", "8", "", "", "3000", "Luis", "0"],
    ["2", "Fase 2", "1", "", "", "", "", "", ""],
    ["2.1", "Cierre", "2", "3", "", "", "1000", "", "100"]
  ]);
  await page.setInputFiles("#xlsxFileInput", { name: "edt.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMessage").textContent();
  expect(msg).toMatch(/5 nodo\(s\) importado\(s\)/);
  await page.locator("#modalConfirmBtn").click();

  await expect(page.locator("#canvas .node")).toHaveCount(6); // raíz + 5

  await page.locator("#viewTableBtn").click();
  const rows = page.locator(".wbs-table tbody tr");
  await expect(rows).toHaveCount(5);
  // Fase 1: Costo recalculado (5000+3000=8000, NO el 999999 del archivo).
  const fase1Row = rows.filter({ hasText: "Fase 1" });
  await expect(fase1Row).toContainText("S/ 8,000");
  const excavRow = rows.filter({ hasText: "Excavación" });
  await expect(excavRow).toContainText("Ana");
  await expect(excavRow).toContainText("S/ 5,000");
  await expect(excavRow).toContainText("50%");
});

test("WBS Builder — round-trip (exportar y reimportar sin cambios) preserva estructura, valores y los enlaces por id con la Matriz RACI", async ({ page }) => {
  // w1 tiene un "R" asignado en RACI -- al cargar la página, applyRaciToWbs()
  // sincroniza nodes.w1.resource = "Ana" y lo deja bloqueado en el panel de
  // propiedades. El objetivo de este test es que, tras exportar y volver a
  // importar el MISMO archivo sin tocarlo, w1 conserve su id (no uno nuevo) --
  // si no lo conservara, raciLocksResource() ya no encontraría el assignment
  // (sigue indexado por "w1") y el campo dejaría de aparecer bloqueado.
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
              root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
              w1: { id: "w1", parentId: "root", name: "Excavación", children: [], duration: 10, cost: 5000, resource: "", percent: 50, start: "2026-01-01", end: "2026-01-10", notes: "Nota importante", collapsed: false, orientation: "spread" }
            }
          },
          obs: { rootId: "oroot", idCounter: 2, nodes: { oroot: { id: "oroot", name: "Equipo", children: ["o1"] }, o1: { id: "o1", parentId: "oroot", role: "Responsable X", person: "Ana", type: "core", children: [] } } },
          raci: { assignments: { w1: { o1: "R" } } }
        }
      }
    }
  };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/WBS_Builder.html");
  await expect(page.locator("#canvas .node")).toHaveCount(2);

  // Confirma que arranca con el Responsable ya sincronizado y bloqueado por RACI.
  await page.locator(".node", { hasText: "Excavación" }).click();
  await expect(page.locator("#f_resource")).toHaveValue("Ana");
  await expect(page.locator("#f_resource")).toBeDisabled();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.setInputFiles("#xlsxFileInput", exportedPath as string);
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  await page.locator("#modalConfirmBtn").click();

  await expect(page.locator("#canvas .node")).toHaveCount(2);
  await page.locator(".node", { hasText: "Excavación" }).click();
  // Sigue bloqueado y con el mismo valor -- prueba que w1 conservó su id.
  await expect(page.locator("#f_resource")).toHaveValue("Ana");
  await expect(page.locator("#f_resource")).toBeDisabled();
  await expect(page.locator("#f_duration")).toHaveValue("10");
  await expect(page.locator("#f_cost")).toHaveValue("5000");
});

test("WBS Builder — un .xlsx con la hoja de datos llamada distinto a «WBS» se rechaza (caso: un solo libro con varios módulos)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, blankSeedDb);
  await page.goto("/WBS_Builder.html");

  const buffer = await buildRowsXlsx(HEADER, [["1", "Fase 1", "1", "", "", "", "", "", ""]], "EDT");
  await page.setInputFiles("#xlsxFileInput", { name: "proyecto_completo.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMessage").textContent();
  expect(msg).toMatch(/No encontré una hoja llamada «WBS»/);
  expect(msg).toMatch(/EDT/);
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#canvas .node")).toHaveCount(1); // sigue en blanco
});

test("WBS Builder — encabezados abreviados/renombrados (no coinciden EXACTAMENTE con la plantilla) se rechazan en vez de adivinar por substring", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, blankSeedDb);
  await page.goto("/WBS_Builder.html");

  const buffer = await buildRowsXlsx(["EDT", "Paquete"], [["1", "Fase 1"]]);
  await page.setInputFiles("#xlsxFileInput", { name: "edt.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMessage").textContent();
  expect(msg).toMatch(/No reconocí las columnas del archivo/);
  expect(msg).toMatch(/EXACTAMENTE/);
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#canvas .node")).toHaveCount(1);
});

test("WBS Builder — un archivo sin ningún Código EDT válido se rechaza sin tocar la EDT actual", async ({ page }) => {
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
              root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"], duration: 0, cost: 0, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" },
              w1: { id: "w1", parentId: "root", name: "Paquete real", children: [], duration: 1, cost: 100, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" }
            }
          }
        }
      }
    }
  };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/WBS_Builder.html");
  await expect(page.locator("#canvas .node")).toHaveCount(2);

  const buffer = await buildRowsXlsx(HEADER, [["abc", "Código con letras"], ["", "Sin código"]]);
  await page.setInputFiles("#xlsxFileInput", { name: "edt.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMessage").textContent();
  expect(msg).toMatch(/ninguna fila con un «Código EDT» válido/);
  await page.locator("#modalConfirmBtn").click();
  await expect(page.locator("#canvas .node")).toHaveCount(2); // no se tocó
});

test("WBS Builder — códigos huérfanos (padre ausente) y repetidos se reportan y se descartan, sin bloquear el resto del import", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, blankSeedDb);
  await page.goto("/WBS_Builder.html");

  const buffer = await buildRowsXlsx(HEADER, [
    ["1", "Fase 1", "1", "", "", "", "", "", ""],
    ["1.1", "Paquete A", "2", "5", "", "", "1000", "", ""],
    ["1.1", "Paquete A duplicado", "2", "5", "", "", "1000", "", ""], // código repetido
    ["9.9", "Huérfano", "2", "5", "", "", "1000", "", ""] // "9" no existe en el archivo
  ]);
  await page.setInputFiles("#xlsxFileInput", { name: "edt.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMessage").textContent();
  expect(msg).toMatch(/2 nodo\(s\) importado\(s\)/);
  expect(msg).toMatch(/1 fila\(s\) con Código EDT repetido/);
  expect(msg).toMatch(/1 fila\(s\) no se pudieron ubicar/);
  await page.locator("#modalConfirmBtn").click();

  await expect(page.locator("#canvas .node")).toHaveCount(3); // raíz + Fase 1 + Paquete A
});

// Lee el .xlsx REAL que el propio módulo genera, para verificar que
// "⇩ Exportar a Excel" trae la hoja llamada exactamente "WBS" con los
// encabezados de la plantilla.
async function readXlsxSheetName(filePath: string): Promise<string[]> {
  const buf = readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const names = Array.from(wbXml.matchAll(/<sheet name="([^"]+)"/g)).map((m) => m[1]);
  return names;
}

test("WBS Builder — '⇩ Exportar a Excel' genera una hoja llamada exactamente «WBS»", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, blankSeedDb);
  await page.goto("/WBS_Builder.html");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const exportedPath = await download.path();
  const sheetNames = await readXlsxSheetName(exportedPath as string);
  expect(sheetNames).toContain("WBS");
});
