// E2E en navegador real: "⇧ Importar desde Excel" en Cronograma_CPM.html
// reemplazó por completo a "📋 Pegar cronograma" (a pedido explícito del
// usuario, "uniforme como el resto de los módulos") -- mismo patrón que
// activity-definition-import.spec.ts / cost-estimate-import.spec.ts /
// wbs-builder-import.spec.ts: nombre de hoja + encabezados EXACTOS,
// emparejados por texto (no por posición).
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom -- ver
// CLAUDE.md, "Trampas ya encontradas".
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";

const seedDb = {
  version: 1, activeId: "p1",
  projects: {
    p1: {
      schema: "gpi.project/v1",
      meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1, startDate: "2026-01-05" },
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
            { id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 }, // dur = 4
            { id: "a2", name: "Vaciar concreto", unit: "m³", qty: 50, perf: 10, teams: 1 } // dur = 5
          ] }, idCounter: 3
        }
      }
    }
  }
};

// Arma un .xlsx real con la librería jszip de npm (Node puro, no depende del
// window.JSZip del navegador). `numericCols` marca columnas (0-based) que se
// escriben como celda NUMÉRICA (<v>, sin t="inlineStr") en vez de texto --
// necesario para simular una celda de Excel autoformateada como Fecha (guarda
// un número de serie, no el texto "2026-01-05").
async function buildXlsx(headerRow: string[], rows: string[][], opts?: { sheetName?: string; numericCols?: Set<number> }): Promise<Buffer> {
  const sheetName = opts?.sheetName ?? "Cronograma";
  const numericCols = opts?.numericCols ?? new Set<number>();
  const zip = new JSZip();
  const allRows = [headerRow, ...rows];
  const COLS = "ABCDEFGHIJ";
  const cell = (ref: string, v: string, numeric: boolean) => numeric ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const sheetXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + allRows.map((cells, ri) => `<row r="${ri + 1}">` + cells.map((v, ci) => v === "" ? "" : cell(COLS[ci] + (ri + 1), v, ri > 0 && numericCols.has(ci))).join("") + "</row>").join("")
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

test("Cronograma/CPM — exportar trae la hoja «Cronograma» con los encabezados exactos y las predecesoras actuales", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Cronograma_CPM.html");
  await expect(page.locator(".act-row")).toHaveCount(2);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnExportExcel").click()
  ]);
  const path = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(path as string));
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  expect(wbXml).toMatch(/<sheet name="Cronograma"/);
  const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  expect(sheet1).toMatch(/Id\..*Nombre.*Duraci/s);
  expect(sheet1).toMatch(/Predecesoras/);
});

test("Cronograma/CPM — importar el .xlsx completado (encabezados reordenados) aplica los enlaces, mismo criterio de Id. que Actividades/Costos", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Cronograma_CPM.html");
  await expect(page.locator(".act-row")).toHaveCount(2);
  await expect(page.locator("#kpiLinks")).toHaveText("0");

  // Snapshot: 0 proyecto, 1 fase, 2 paquete, 3 "Excavar zanja", 4 "Vaciar
  // concreto". Encabezados a propósito en OTRO orden que la plantilla real,
  // para probar que el emparejamiento es por TEXTO, no por posición.
  const buffer = await buildXlsx(
    ["Predecesoras", "Id.", "Nombre"],
    [["3FS+1d", "4", "Vaciar concreto"]]
  );
  await page.setInputFiles("#xlsxFileInput", { name: "cronograma.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  await expect(page.locator("#modalMsg")).toContainText("Enlaces a crear");
  await page.locator("#modalOk").click();

  await expect(page.locator("#kpiLinks")).toHaveText("1");
  await page.waitForTimeout(900); // gpiPush() debounced, igual que en los otros módulos
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  const links = saved.projects.p1.modules.schedule.links;
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({ from: "a1", to: "a2", type: "FS", lag: 1, source: "import" });
});

test("Cronograma/CPM — un encabezado renombrado ('ID' en vez de 'Id.') se rechaza en vez de adivinar por substring", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Cronograma_CPM.html");
  const buffer = await buildXlsx(["ID", "Nombre", "Predecesoras"], [["4", "Vaciar concreto", "3"]]);
  await page.setInputFiles("#xlsxFileInput", { name: "cronograma.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  await expect(page.locator("#modalMsg")).toContainText("No reconocí las columnas");
});

test("Cronograma/CPM — un .xlsx con la hoja de datos llamada distinto a «Cronograma» se rechaza (caso: un solo libro con varios módulos)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Cronograma_CPM.html");
  const buffer = await buildXlsx(["Id.", "Nombre", "Predecesoras"], [["4", "Vaciar concreto", "3"]], { sheetName: "Actividades" });
  await page.setInputFiles("#xlsxFileInput", { name: "cronograma.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/No encontré una hoja llamada «Cronograma»/);
  expect(msg).toMatch(/Actividades/);
});

test("Cronograma/CPM — una celda de Comienzo con formato Fecha nativo de Excel (serial numérico) se interpreta igual que el texto", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Cronograma_CPM.html");
  // Serial 45658 = 2026-01-01 en el sistema de fechas de Excel (época
  // 1899-12-30) -- casi seguro no coincide con la fecha que calcula el CPM
  // para esta actividad, así que si el serial se interpretó bien, la columna
  // Auditoría debe pasar de "—" (nada que auditar) a "✗" (fechas distintas),
  // nunca quedarse en "—" (que sería la señal de que la celda no se leyó).
  const buffer = await buildXlsx(["Id.", "Nombre", "Comienzo"], [["3", "Excavar zanja", "45658"]], { numericCols: new Set([2]) });
  await page.setInputFiles("#xlsxFileInput", { name: "cronograma.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  await expect(page.locator("#modalMsg")).toContainText("Fechas para auditoría");
  await page.locator("#modalOk").click();

  const auditCell = page.locator(".act-row", { hasText: "Excavar zanja" }).locator("td").last();
  await expect(auditCell).not.toHaveText("—");
});

test("Cronograma/CPM — una fila con Id. cuyo nombre ya no coincide con el proyecto actual se rechaza (Id. desactualizado)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Cronograma_CPM.html");
  // Id. 4 es "Vaciar concreto" en el proyecto real -- este archivo dice que
  // es otra cosa (por ejemplo, se insertó una actividad antes en Definir las
  // Actividades después de exportar esta plantilla).
  const buffer = await buildXlsx(["Id.", "Nombre", "Predecesoras"], [["4", "Actividad que ya no existe ahí", "3"]]);
  await page.setInputFiles("#xlsxFileInput", { name: "cronograma.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/Filas con problema/);
  expect(msg).toMatch(/no coincide/);
  await expect(page.locator("#kpiLinks")).toHaveText("0");
});
