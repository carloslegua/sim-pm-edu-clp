// E2E en navegador real: importar un .xlsx completado en Estimar_Costos.html
// puebla el precio unitario POR ACTIVIDAD y calcula el subtotal; y el
// archivo que exporta el propio módulo se puede reimportar sin cambios
// (round-trip).
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom -- ver
// CLAUDE.md, "Trampas ya encontradas" (mismo hallazgo documentado para
// Activity_Definition). Un navegador real no tiene ese problema.
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

// Lee el .xlsx REAL que el propio módulo genera (no un fixture armado a
// mano) y lo vuelve a un arreglo de filas por columna (A..J) -- para poder
// verificar el contenido real de "⇩ Exportar a Excel": que trae la columna
// "Id." y que el "Código EDT" de cada actividad es el suyo propio
// (p. ej. "1.1.2"), no el del paquete repetido en cada fila.
async function readXlsxRows(filePath: string): Promise<string[][]> {
  const buf = readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const COLS = "ABCDEFGHIJ".split("");
  const rows: string[][] = [];
  const rowRe = /<row r="\d+">([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cellRe = /<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g;
    const cellMap: Record<string, string> = {};
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) { cellMap[cm[1]] = cm[2] ?? cm[3] ?? ""; }
    rows.push(COLS.map((c) => cellMap[c] ?? ""));
  }
  return rows;
}

const seedDb = {
  version: 1, activeId: "p1",
  projects: {
    p1: {
      schema: "gpi.project/v1",
      meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 },
      modules: {
        wbs: {
          rootId: "root", idCounter: 4,
          nodes: {
            root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1"] },
            w1: { id: "w1", parentId: "root", name: "Fase 1", children: ["w2", "w3"] },
            w2: { id: "w2", parentId: "w1", name: "Excavación de zanjas", children: [] },
            w3: { id: "w3", parentId: "w1", name: "Encofrado de cimentaciones", children: [] }
          }
        },
        // w2 tiene 2 actividades (para probar N filas por el mismo paquete);
        // w3 tiene 1 actividad, que se deja deliberadamente SIN precio en el
        // archivo de prueba para verse en "actividades sin precio".
        activities: {
          byLeaf: {
            w2: [
              { id: "a1", name: "Corte de zanja", unit: "m³", qty: 2000, perf: 190, teams: 1 },
              { id: "a2", name: "Eliminación de material", unit: "m³", qty: 500, perf: 50, teams: 1 }
            ],
            w3: [{ id: "a3", name: "Encofrado de zapatas", unit: "m²", qty: 300, perf: 30, teams: 1 }]
          },
          idCounter: 4
        }
      }
    }
  }
};

// Arma un .xlsx real con la librería jszip de npm (Node puro, no depende del
// window.JSZip del navegador): encabezados en otro orden que la exportación
// real, para probar que el emparejamiento de columnas es por TEXTO de
// encabezado, no por posición. Incluye las categorías que valida el import:
// dos filas coincidentes (a1, a2, bajo el mismo paquete 1.1), una con código
// EDT huérfano (9.9), una con nombre de actividad que no existe bajo su
// paquete real (1.2 con un nombre distinto a "Encofrado de cimentaciones"),
// y deja la actividad real de 1.2 sin ninguna fila (para el aviso de
// actividades sin precio).
async function buildFixtureXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  const rows = [
    ["Código EDT", "Precio unitario", "Nombre de la actividad", "Paquete de trabajo"],
    ["1.1", "190", "Corte de zanja", "Excavación de zanjas"],
    ["1.1", "40", "Eliminación de material", "Excavación de zanjas"],
    ["9.9", "100", "Actividad inexistente", "Paquete inexistente"],
    ["1.2", "500", "Nombre que no coincide", "Encofrado de cimentaciones"]
  ];
  const cellInline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheetXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + rows.map((cells, ri) => `<row r="${ri + 1}">` + cells.map((v, ci) => v === "" ? "" : cellInline("ABCD"[ci] + (ri + 1), v)).join("") + "</row>").join("")
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
    + '<sheets><sheet name="Estimado" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("Estimar los Costos — importar un .xlsx completado pone precio por actividad, valida código+nombre y avisa de actividades sin precio", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Estimar_Costos.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);
  await expect(page.locator(".act-row")).toHaveCount(3);

  const buffer = await buildFixtureXlsx();
  await page.setInputFiles("#xlsxFileInput", { name: "estimado.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  // El import pide confirmación con el resumen de categorías antes de reemplazar.
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toContain("2 actividad(es) del archivo"); // a1 y a2 coinciden (código y nombre)
  expect(msg).toMatch(/no coincidir con ningún código EDT actual.*9\.9/); // huérfana
  expect(msg).toMatch(/no hay ninguna actividad con ese nombre.*1\.2/); // nombre no coincide
  expect(msg).toMatch(/1 actividad\(es\) de la EDT actual quedan sin precio/); // a3 (real) sin precio
  await page.locator("#modalOk").click();

  const subtotals = await page.locator(".sub-cell").allTextContents();
  expect(subtotals).toContain("380,000"); // a1: 2000 m³ x 190
  expect(subtotals).toContain("20,000");  // a2: 500 m³ x 40

  // gpiPush() está debounced 800ms (ver onDirty en cost-estimate/main.ts).
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  const est = saved.projects.p1.modules.costEstimate;
  expect(est.byActivity).toMatchObject({ a1: "190", a2: "40" });
  expect(est.byActivity.a3).toBeUndefined(); // "1.2" no tuvo ninguna fila válida
});

test("Estimar los Costos — el archivo que exporta se puede reimportar sin cambios (round-trip)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Estimar_Costos.html");

  const buffer = await buildFixtureXlsx();
  await page.setInputFiles("#xlsxFileInput", { name: "estimado.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.locator("#modalOk").click();
  await page.waitForTimeout(900);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.setInputFiles("#xlsxFileInput", exportedPath as string);
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  // Reimportar exactamente lo que se exportó: sin huérfanas ni nombres que no
  // coincidan -- el round-trip es fiel. a3 sigue sin precio (nunca lo tuvo),
  // eso es correcto y se sigue avisando igual.
  expect(msg).not.toMatch(/no coincidir con ningún código EDT actual/);
  expect(msg).not.toMatch(/no hay ninguna actividad con ese nombre/);
  await page.locator("#modalOk").click();
  await page.waitForTimeout(900);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  expect(saved.projects.p1.modules.costEstimate.byActivity).toMatchObject({ a1: "190", a2: "40" });
});

test("Estimar los Costos — un hito de Definir las Actividades se ve sin costo y el round-trip lo ignora silenciosamente", async ({ page }) => {
  const seedWithMilestone = JSON.parse(JSON.stringify(seedDb));
  seedWithMilestone.projects.p1.modules.activities.milestones = [
    { id: "m1", code: "H1", name: "Inicio del proyecto", leafId: null, afterLeafId: null },
    { id: "m2", code: "H2", name: "Fin de excavación", leafId: "w2" },
    { id: "m3", code: "H3", name: "Cierre del proyecto", leafId: null, afterLeafId: "w3" }
  ];
  // Precios ya cargados de antemano: el export/reimport de este caso debe
  // preservarlos igual, ignorando las filas de hito sin tocarlos.
  seedWithMilestone.projects.p1.modules.costEstimate = { byActivity: { a1: "190", a2: "40" } };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedWithMilestone);
  await page.goto("/Estimar_Costos.html");

  // Los hitos aparecen sin costo, cada uno en su propia posición (nunca
  // agrupados en un capítulo aparte), y no alteran el total ni cuentan como
  // actividades sin precio.
  await expect(page.locator(".milestone-row")).toHaveCount(3);
  const rows = page.locator("#estBody tr");
  const rowCount = await rows.count();
  await expect(rows.first()).toHaveClass(/proj-row/);
  await expect(rows.nth(1)).toHaveClass(/milestone-row/); // H1: antes de cualquier paquete
  await expect(rows.nth(1)).toContainText("Inicio del proyecto");
  await expect(rows.nth(rowCount - 2)).toHaveClass(/milestone-row/); // H3: después del último paquete (la última fila es el total)
  await expect(rows.nth(rowCount - 2)).toContainText("Cierre del proyecto");
  await expect(page.locator("#estBody")).toContainText("Fin de excavación");
  await expect(page.locator("#estBody")).not.toContainText("Hitos del proyecto");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.setInputFiles("#xlsxFileInput", exportedPath as string);
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  // El archivo exportado trae las filas de hito marcadas Tipo="Hito": deben
  // omitirse por completo, nunca reportarse como fila no reconciliada.
  expect(msg).not.toMatch(/no coincidir con ningún código EDT actual/);
  expect(msg).not.toMatch(/no hay ninguna actividad con ese nombre/);
  await page.locator("#modalOk").click();
  await page.waitForTimeout(900);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  expect(saved.projects.p1.modules.costEstimate.byActivity).toMatchObject({ a1: "190", a2: "40" });
});

test("Estimar los Costos — '⇩ Exportar a Excel' trae la columna Id. y el Código EDT propio de cada actividad (no el del paquete repetido)", async ({ page }) => {
  // Antes, exportRowModel() reconstruía las filas por su cuenta: repetía el
  // Código EDT del PAQUETE ("1.1") en cada una de sus actividades (nunca el
  // propio, "1.1.1"/"1.1.2", el que sí muestra la tabla en pantalla) y no
  // traía ninguna columna de Id. -- este test exporta un caso con un
  // paquete de 2 actividades y hitos (uno suelto al principio, uno atado,
  // uno suelto al final) y verifica el .xlsx real generado, celda por celda.
  const seedWithMilestone = JSON.parse(JSON.stringify(seedDb));
  seedWithMilestone.projects.p1.modules.activities.milestones = [
    { id: "m1", code: "H1", name: "Inicio del proyecto", leafId: null, afterLeafId: null },
    { id: "m2", code: "H2", name: "Fin de excavación", leafId: "w2" },
    { id: "m3", code: "H3", name: "Cierre del proyecto", leafId: null, afterLeafId: "w3" }
  ];
  seedWithMilestone.projects.p1.modules.costEstimate = { byActivity: { a1: "190", a2: "40" } };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedWithMilestone);
  await page.goto("/Estimar_Costos.html");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();
  const rows = await readXlsxRows(exportedPath as string);

  // Encabezado: Id., Código EDT, Paquete de trabajo, Nombre de la actividad, Tipo, Unidad, Cantidad, Precio unitario, Subtotal
  expect(rows[0].slice(0, 9)).toEqual(["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"]);

  // 0=proyecto y 1=fase NO se exportan (el archivo es de paquetes/actividades/
  // hitos); el primero en el archivo es H1 (hito suelto sin ancla, Id 1).
  expect(rows[1].slice(0, 5)).toEqual(["1", "", "", "H1 — Inicio del proyecto", "Hito"]);

  // a1 y a2: cada una con SU PROPIO Código EDT ("1.1.1"/"1.1.2"), no "1.1"
  // repetido -- el paquete "1.1" nunca aparece como fila propia porque SÍ
  // tiene actividades.
  const a1 = rows.find((r) => r[3] === "Corte de zanja")!;
  expect(a1.slice(0, 9)).toEqual(["4", "1.1.1", "Excavación de zanjas", "Corte de zanja", "", "m³", "2000", "190", "380000"]);
  const a2 = rows.find((r) => r[3] === "Eliminación de material")!;
  expect(a2.slice(0, 9)).toEqual(["5", "1.1.2", "Excavación de zanjas", "Eliminación de material", "", "m³", "500", "40", "20000"]);

  // H2: hito ATADO a 1.1 -- repite el Código EDT/Paquete del paquete (de
  // referencia, nunca su propia numeración EDT), Id consecutivo (6).
  const h2 = rows.find((r) => r[3] === "H2 — Fin de excavación")!;
  expect(h2.slice(0, 5)).toEqual(["6", "1.1", "Excavación de zanjas", "H2 — Fin de excavación", "Hito"]);

  // a3: única actividad de 1.2, sin precio (queda en blanco a propósito).
  const a3 = rows.find((r) => r[3] === "Encofrado de zapatas")!;
  expect(a3.slice(0, 9)).toEqual(["8", "1.2.1", "Encofrado de cimentaciones", "Encofrado de zapatas", "", "m²", "300", "", ""]);

  // H3: hito suelto anclado al ÚLTIMO paquete (1.2) -- Código EDT/Paquete en
  // blanco (no está atado a ningún paquete), Id al final de todo (9).
  const h3 = rows.find((r) => r[3] === "H3 — Cierre del proyecto")!;
  expect(h3.slice(0, 5)).toEqual(["9", "", "", "H3 — Cierre del proyecto", "Hito"]);
});

test("Estimar los Costos — el CSV de reserva (sin window.JSZip) también trae Id. y el Código EDT propio de cada actividad", async ({ page }) => {
  // downloadEstimate() cae a buildEstimateCsv() cuando window.JSZip no está
  // disponible (sin conexión, o el CDN bloqueado) -- bloquear el <script>
  // de JSZip fuerza esa ruta sin tocar el código de la app.
  await page.route("**/jszip*.js", (route) => route.abort());
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Estimar_Costos.html");
  await expect(page.locator(".act-row")).toHaveCount(3);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const csvPath = await download.path();
  expect(csvPath).toBeTruthy();
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  const csv = readFileSync(csvPath as string, "utf-8").replace(/^﻿/, "");
  const lines = csv.split("\r\n").filter(Boolean).map((l) => l.split(";"));
  expect(lines[0]).toEqual(["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Tipo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"]);
  const a1 = lines.find((l) => l[3] === "Corte de zanja")!;
  expect(a1).toEqual(["3", "1.1.1", "Excavación de zanjas", "Corte de zanja", "", "m³", "2000", "", ""]);
  const a2 = lines.find((l) => l[3] === "Eliminación de material")!;
  expect(a2).toEqual(["4", "1.1.2", "Excavación de zanjas", "Eliminación de material", "", "m³", "500", "", ""]);
});
