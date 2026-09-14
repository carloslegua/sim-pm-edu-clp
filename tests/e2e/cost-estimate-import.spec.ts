// E2E en navegador real: importar un .xlsx completado en Estimar_Costos.html
// puebla el estimado y calcula el subtotal; y el archivo que exporta el propio
// módulo se puede reimportar sin cambios (round-trip).
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom -- ver
// CLAUDE.md, "Trampas ya encontradas" (mismo hallazgo documentado para
// Activity_Definition). Un navegador real no tiene ese problema.
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

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
        }
      }
    }
  }
};

// Arma un .xlsx real con la librería jszip de npm (Node puro, no depende del
// window.JSZip del navegador): encabezados en otro orden que la exportación
// real, para probar que el emparejamiento de columnas es por TEXTO de
// encabezado, no por posición. Incluye las 4 categorías que valida el import:
// una fila coincidente (1.1), una con código EDT huérfano (9.9), una con
// nombre que no coincide con la EDT actual (1.2 con un nombre distinto), y
// deja el paquete 1.2 real sin ninguna fila válida (para el aviso de faltantes).
async function buildFixtureXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  const rows = [
    ["Código EDT", "Precio unitario", "Cantidad", "Unidad de medida", "Nombre del paquete de trabajo/actividad"],
    ["1.1", "190", "2000", "m³", "Excavación de zanjas"],
    ["9.9", "100", "1", "glb", "Paquete inexistente"],
    ["1.2", "500", "10", "und", "Nombre que no coincide"]
  ];
  const cellInline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheetXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + rows.map((cells, ri) => `<row r="${ri + 1}">` + cells.map((v, ci) => v === "" ? "" : cellInline("ABCDE"[ci] + (ri + 1), v)).join("") + "</row>").join("")
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

test("Estimar los Costos — importar un .xlsx completado puebla el estimado, valida código+nombre y avisa de faltantes", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Estimar_Costos.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);

  const buffer = await buildFixtureXlsx();
  await page.setInputFiles("#xlsxFileInput", { name: "estimado.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  // El import pide confirmación con el resumen de las 4 categorías antes de reemplazar.
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toContain("1 paquete(s) con datos"); // 1.1 coincide (código Y nombre)
  expect(msg).toMatch(/no coincid.*9\.9/); // huérfana
  expect(msg).toMatch(/nombre no coincide.*1\.2/); // 1.2 con nombre distinto
  expect(msg).toMatch(/1 paquete\(s\) de la EDT actual no aparecen/); // 1.2 real queda como faltante
  await page.locator("#modalOk").click();

  const subtotals = await page.locator(".sub-cell").allTextContents();
  expect(subtotals).toContain("380,000"); // 2000 m³ × 190 (paquete 1.1, Excavación de zanjas)

  // gpiPush() está debounced 800ms (ver onDirty en cost-estimate/main.ts).
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  const est = saved.projects.p1.modules.costEstimate;
  expect(est.byLeaf.w2).toMatchObject({ qty: "2000", unitPrice: "190", unit: "m³" });
  expect(est.byLeaf.w3).toBeUndefined(); // "1.2" quedó sin dato válido (nombre no coincidía)
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
  // Reimportar exactamente lo que se exportó: sin huérfanas, sin nombres que
  // no coincidan y sin paquetes faltantes -- el round-trip es fiel.
  expect(msg).not.toMatch(/no coincid/);
  expect(msg).not.toMatch(/no aparecen/);
  await page.locator("#modalOk").click();
  await page.waitForTimeout(900);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  expect(saved.projects.p1.modules.costEstimate.byLeaf.w2).toMatchObject({ qty: "2000", unitPrice: "190" });
});
