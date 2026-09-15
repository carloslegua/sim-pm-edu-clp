// E2E en navegador real: importar un .xlsx completado en
// Activity_Definition.html puebla las actividades y calcula su duración.
//
// Por qué esto vive aquí y no en tests/smoke (jsdom): JSZip nunca resuelve
// la LECTURA de contenido de un zip (`.async(...)`) dentro de jsdom --
// verificado con un diagnóstico aislado, cuelga incluso sin compresión,
// aunque `loadAsync()` (que solo valida la estructura del zip) sí funciona.
// Un navegador real no tiene ese problema. Ver CLAUDE.md, "Trampas ya
// encontradas".
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
            w2: { id: "w2", parentId: "w1", name: "Paquete A", children: [] },
            w3: { id: "w3", parentId: "w1", name: "Paquete B", children: [] }
          }
        }
      }
    }
  }
};

// Arma un .xlsx real con la librería jszip de npm (Node puro, no depende del
// window.JSZip del navegador): encabezados a propósito en otro orden que la
// plantilla real, para probar que el emparejamiento de columnas es por
// TEXTO de encabezado, no por posición.
async function buildFixtureXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  const rows = [
    ["Código EDT", "Nombre de la actividad", "Unidad", "Rendimiento (R)", "Metrado", "N.º de equipos"],
    ["1.1", "Excavar zanja", "m³", "25", "100", ""],       // ceil(100/25) = 4
    ["1.1", "Rellenar zanja", "m³", "50", "100", ""],      // segunda actividad, MISMO código EDT
    ["9.9", "Actividad huérfana", "und", "1", "1", ""],    // código EDT que no existe: no debe romper el resto
    ["1.2", "", "", "", "", ""]                            // fila de plantilla sin completar: se omite
  ];
  const cellInline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheetXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + rows.map((cells, ri) => `<row r="${ri + 1}">` + cells.map((v, ci) => v === "" ? "" : cellInline("ABCDEFG"[ci] + (ri + 1), v)).join("") + "</row>").join("")
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
    + '<sheets><sheet name="Actividades" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

// Igual que buildFixtureXlsx() pero con filas y nombre de hoja arbitrarios
// -- para el caso de una hoja con OTRO nombre o encabezados abreviados, que
// ahora deben rechazarse (ver resolveDataSheetPath()/mapHeaderColumns()).
async function buildRowsXlsx(headerRow: string[], rows: string[][], sheetName = "Actividades"): Promise<Buffer> {
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

test("Activity_Definition — importar un .xlsx completado puebla las actividades y calcula la duración", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);

  const buffer = await buildFixtureXlsx();
  await page.setInputFiles("#xlsxFileInput", { name: "actividades.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  // El import pide confirmación antes de reemplazar.
  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  await page.locator("#modalOk").click();

  await expect(page.locator(".act-row")).toHaveCount(2); // la huérfana (9.9) y la fila sin nombre (1.2) no entran
  const durs = await page.locator(".dur-cell").allTextContents();
  expect(durs).toContain("4"); // Excavar zanja: ceil(100/25)
  expect(durs).toContain("2"); // Rellenar zanja: ceil(100/50)

  // gpiPush() está debounced 800ms (ver onDirty en activities/main.ts).
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  const acts = saved.projects.p1.modules.activities;
  expect(acts.byLeaf.w2).toHaveLength(2);
  expect(acts.byLeaf.w2[0]).toMatchObject({ name: "Excavar zanja", qty: "100", perf: "25" });
  expect(acts.byLeaf.w3).toBeUndefined(); // "1.2" no se completó: no debe crear entrada
});

// Arma un .xlsx con columnas "Tipo" y "Código de hito" (el mecanismo estilo
// P6 para marcar hitos), cubriendo los casos del diseño: un hito suelto
// insertado ANTES de la primera fila de paquete (debe quedar al principio de
// todo, p. ej. un hito de inicio de proyecto), uno atado a un paquete, uno
// suelto insertado DESPUÉS de la última fila de paquete (debe quedar al
// final de todo, p. ej. un hito de fin de proyecto), uno con EDT inexistente
// (huérfano, no se importa) y uno sin "Código de hito" (tampoco se importa).
// Ninguno de los sueltos debe agruparse en un capítulo aparte.
async function buildMilestonesFixtureXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  const rows = [
    ["Código EDT", "Nombre de la actividad", "Tipo", "Código de hito", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"],
    ["", "Inicio del proyecto", "Hito", "H0", "", "", "", ""],        // hito suelto ANTES de cualquier paquete
    ["1.1", "Excavar zanja", "", "", "m³", "100", "25", ""],
    ["1.1", "Fin de excavación", "Hito", "H1", "", "", "", ""],       // hito atado al paquete 1.1
    ["1.2", "Encofrado de zapatas", "", "", "m²", "300", "30", ""],
    ["", "Cierre del proyecto", "Hito", "H2", "", "", "", ""],        // hito suelto DESPUÉS del último paquete (1.2)
    ["9.9", "Hito huérfano", "Hito", "H3", "", "", "", ""],           // EDT inexistente: no se importa
    ["1.2", "Hito sin código", "Hito", "", "", "", "", ""]            // sin Código de hito: no se importa
  ];
  const cellInline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheetXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + rows.map((cells, ri) => `<row r="${ri + 1}">` + cells.map((v, ci) => v === "" ? "" : cellInline("ABCDEFGH"[ci] + (ri + 1), v)).join("") + "</row>").join("")
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
    + '<sheets><sheet name="Actividades" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("Activity_Definition — importar hitos (atado, suelto y con código faltante)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);

  const buffer = await buildMilestonesFixtureXlsx();
  await page.setInputFiles("#xlsxFileInput", { name: "actividades.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  await expect(page.locator("#modalMsg")).toContainText("hito(s)");
  await page.locator("#modalOk").click();

  // Solo H0 (suelto al principio), H1 (atado) y H2 (suelto al final) se
  // importan: H3 (EDT inexistente) y el hito sin "Código de hito" quedan
  // fuera. Ninguno se agrupa en un capítulo aparte -- cada uno aparece
  // exactamente donde se insertó su fila en el archivo.
  await expect(page.locator(".milestone-row")).toHaveCount(3);
  const rows = page.locator("#actsBody tr");
  await expect(rows.first()).toHaveClass(/proj-row/);
  await expect(rows.nth(1)).toHaveClass(/milestone-row/); // H0: antes de cualquier paquete
  await expect(rows.nth(1)).toContainText("Inicio del proyecto");
  await expect(rows.last()).toHaveClass(/milestone-row/); // H2: después del último paquete (1.2)
  await expect(rows.last()).toContainText("Cierre del proyecto");
  await expect(page.locator("#actsBody")).toContainText("Fin de excavación");
  await expect(page.locator("#actsBody")).not.toContainText("Hitos del proyecto");
  await expect(page.locator("#actsBody")).not.toContainText("Hito huérfano");
  await expect(page.locator("#actsBody")).not.toContainText("Hito sin código");

  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gpi_db") as string));
  const acts = saved.projects.p1.modules.activities;
  expect(acts.milestones).toHaveLength(3);
  const byCode: Record<string, any> = Object.fromEntries(acts.milestones.map((m: any) => [m.code, m]));
  expect(byCode.H0).toMatchObject({ name: "Inicio del proyecto", leafId: null, afterLeafId: null });
  expect(byCode.H1).toMatchObject({ name: "Fin de excavación", leafId: "w2" });
  expect(byCode.H2).toMatchObject({ name: "Cierre del proyecto", leafId: null, afterLeafId: "w3" });
});

test("Activity_Definition — un .xlsx con la hoja de datos llamada distinto a «Actividades» se rechaza (caso: un solo libro con varios módulos)", async ({ page }) => {
  // Si el alumno junta en un mismo archivo las hojas de varios módulos
  // (p. ej. "Actividades" de este y "Estimado" de Estimar los Costos), ya no
  // basta con leer la PRIMERA hoja del libro -- hay que confirmar que la
  // hoja que se está por importar aquí es, por su NOMBRE, la de Definir las
  // Actividades. Este archivo trae una única hoja, pero llamada "Estimado"
  // (headers por lo demás perfectamente válidos): debe rechazarse igual.
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);

  const buffer = await buildRowsXlsx(
    ["Código EDT", "Nombre de la actividad", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"],
    [["1.1", "Excavar zanja", "m³", "100", "25", ""]],
    "Estimado"
  );
  await page.setInputFiles("#xlsxFileInput", { name: "proyecto_completo.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/No encontré una hoja llamada «Actividades»/);
  expect(msg).toMatch(/Estimado/);
  await page.locator("#modalOk").click();

  await expect(page.locator(".act-row")).toHaveCount(0);
});

test("Activity_Definition — encabezados abreviados/renombrados (no coinciden EXACTAMENTE con la plantilla) se rechazan en vez de adivinar por substring", async ({ page }) => {
  // Antes "edt" bastaba como substring para reconocer "Código EDT", y
  // "actividad" solo para "Nombre de la actividad" -- eso podía colar una
  // columna ajena por coincidencia parcial. Ahora el encabezado debe
  // coincidir EXACTO (salvo mayúsculas/acentos/espacios) con la plantilla.
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);

  const buffer = await buildRowsXlsx(
    ["EDT", "Actividad", "Unidad"],
    [["1.1", "Excavar zanja", "m³"]]
  );
  await page.setInputFiles("#xlsxFileInput", { name: "actividades.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/No reconocí las columnas del archivo/);
  expect(msg).toMatch(/EXACTAMENTE/);
  await page.locator("#modalOk").click();

  await expect(page.locator(".act-row")).toHaveCount(0);
});

test("Activity_Definition — una fila con Código EDT y Nombre correctos pero Paquete de trabajo equivocado se rechaza (la EDT de WBS Builder manda sobre este módulo, no se asume el paquete solo por el código)", async ({ page }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);

  // "1.1"/"Excavar zanja" son correctos (coinciden con w2), y se importan.
  // "1.2" es correcto como código, pero el archivo dice "Paquete B viejo" en
  // vez del nombre real actual de w3 ("Paquete B") -- se rechaza esa fila
  // sola, sin bloquear la que sí es válida.
  const buffer = await buildRowsXlsx(
    ["Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"],
    [
      ["1.1", "Paquete A", "Excavar zanja", "m³", "100", "25", ""],
      ["1.2", "Paquete B viejo", "Rellenar zanja", "m³", "100", "25", ""]
    ]
  );
  await page.setInputFiles("#xlsxFileInput", { name: "actividades.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  expect(msg).toMatch(/1 actividad\(es\)/);
  expect(msg).toMatch(/1 fila\(s\) no se importaron porque el Paquete de trabajo del archivo no coincide/);
  expect(msg).toMatch(/"Paquete B viejo" ≠ "Paquete B"/);
  await page.locator("#modalOk").click();

  await expect(page.locator(".act-row")).toHaveCount(1);
  await expect(page.locator(".act-row")).toContainText("Excavar zanja");
});

test("Activity_Definition — un archivo exportado ANTES de agregar un hito avisa que el Id. de las filas posteriores ya no coincide", async ({ page }) => {
  // El proyecto YA tiene, desde el inicio, un hito atado a w1 (simula que se
  // agregó DESPUÉS de exportar el archivo que se va a reimportar). Sin ese
  // hito, fullRows() habría sido: 0=proyecto, 1=w1, 2=w2 -- con él, w2 corre
  // a Id. 3 (el hito ocupa el 2), aunque su propio Código EDT ("2") y su
  // nombre no cambiaron en absoluto.
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
              root: { id: "root", parentId: null, name: "Proyecto Live", children: ["w1", "w2"] },
              w1: { id: "w1", parentId: "root", name: "Excavación", children: [] },
              w2: { id: "w2", parentId: "root", name: "Encofrado", children: [] }
            }
          },
          activities: { byLeaf: {}, idCounter: 1, milestones: [{ id: "m1", code: "H1", name: "Fin de excavación", leafId: "w1" }] }
        }
      }
    }
  };
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/Activity_Definition.html");
  await expect(page.locator(".pkg-row")).toHaveCount(2);
  await expect(page.locator(".milestone-row")).toHaveCount(1);

  // El archivo "viejo" trae los Id. de ANTES de que existiera el hito: w1=1,
  // w2=2 (nunca llegó a verlo, se exportó antes).
  const buffer = await buildRowsXlsx(
    ["Id.", "Código EDT", "Paquete de trabajo", "Nombre de la actividad", "Unidad", "Metrado", "Rendimiento (R)", "N.º de equipos"],
    [
      ["1", "1", "Excavación", "Corte de zanja", "m³", "100", "25", ""],
      ["2", "2", "Encofrado", "Armado de encofrado", "m²", "50", "10", ""]
    ]
  );
  await page.setInputFiles("#xlsxFileInput", { name: "actividades.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await expect(page.locator("#modalOverlay")).toHaveClass(/open/);
  const msg = await page.locator("#modalMsg").textContent();
  // Ambas actividades se importan igual (Código EDT + Paquete de trabajo
  // resuelven bien por su cuenta) -- el Id. desactualizado es solo un aviso.
  expect(msg).toMatch(/2 actividad\(es\)/);
  expect(msg).toMatch(/1 fila\(s\) tienen un Id\. que ya no coincide/);
  await page.locator("#modalOk").click();

  await expect(page.locator(".act-row")).toHaveCount(2);
  await expect(page.locator(".act-row")).toContainText(["Corte de zanja", "Armado de encofrado"]);
});
