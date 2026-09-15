// E2E en navegador real: WBS Builder es la capa que "manda" sobre Definir
// las Actividades y Estimar los Costos -- si se renombra una fase o un
// paquete de trabajo ahí, el cambio debe reflejarse en los otros dos
// módulos SIN que el alumno tenga que ocultar/cerrar la pestaña de WBS
// Builder (que es cuando históricamente se guardaba el cambio -- ver
// gpiBridge()/push() en src/modules/wbs/main.ts) ni recargar los otros dos
// módulos a mano.
//
// Por qué HTTP y no file://: el storage event que dispara GPI.onChange()
// en las otras pestañas solo es confiable entre documentos del MISMO
// origen -- ver CLAUDE.md, "file:// no comparte localStorage de forma
// confiable entre documentos HTML distintos".
import { test, expect } from "@playwright/test";

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
            w1: { id: "w1", parentId: "root", name: "Excavación", children: [], duration: 5, cost: 1000, resource: "", percent: 0, start: "", end: "", notes: "", collapsed: false, orientation: "spread" }
          }
        },
        activities: { byLeaf: { w1: [{ id: "a1", name: "Excavar zanja", unit: "m³", qty: 100, perf: 25, teams: 1 }] }, idCounter: 2 }
      }
    }
  }
};

test("WBS Builder — un rename se refleja en Definir las Actividades y Estimar los Costos sin cambiar de pestaña ni recargar (guardado con debounce)", async ({ page, context }) => {
  await page.addInitScript((db) => { localStorage.setItem("gpi_db", JSON.stringify(db)); }, seedDb);
  await page.goto("/WBS_Builder.html");

  // Dos pestañas ya abiertas en los módulos aguas abajo, ANTES del rename --
  // ninguna se recarga ni se vuelve a abrir después.
  const actPage = await context.newPage();
  await actPage.goto("/Activity_Definition.html");
  await expect(actPage.locator(".pkg-row .pk-name")).toHaveText("Excavación");

  const costPage = await context.newPage();
  await costPage.goto("/Estimar_Costos.html");
  await expect(costPage.locator(".pkg-row .pk-name")).toHaveText("Excavación");

  // Renombra el paquete en WBS Builder. La pestaña de WBS Builder se queda
  // abierta y en primer plano -- nunca se oculta ni se navega fuera de ella.
  await page.locator(".node", { hasText: "Excavación" }).click();
  await page.locator("#f_name").fill("Excavación de zanjas");

  // El guardado con debounce (markDirty(), 800ms) debe llegar solo, sin
  // ninguna acción manual en las otras dos pestañas.
  await expect(actPage.locator(".pkg-row .pk-name")).toHaveText("Excavación de zanjas", { timeout: 3000 });
  await expect(costPage.locator(".pkg-row .pk-name")).toHaveText("Excavación de zanjas", { timeout: 3000 });
});
