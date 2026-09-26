// E2E en navegador real: con el caso DISTRIB+ completo cargado, NINGUNA página deja un campo de formulario visible sin nombre accesible
// (auditoría, media: unos 250 campos sin nombre). El núcleo (src/shared/a11y-labels.ts) se los asigna; esta prueba vigila que no vuelva a pasar.
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const DB = readFileSync("tests/fixtures/distribplus-completo-v2.json", "utf8");
const PAGES = ["Panel_Control", "Project_Charter", "Stakeholder_Studio", "Recopilar_Requisitos", "Enunciado_del_Alcance", "WBS_Builder", "OBS_Builder", "RACI_Matrix", "Activity_Definition", "Estimar_Costos", "Pert_Analysis", "Schedule_Management_Plan", "Cronograma_CPM", "Cost-management", "Risk_Register", "Valor_Ganado", "Control_Cambios", "Plan_Calidad", "Plan_Comunicaciones", "Plan_Adquisiciones", "Plan_Direccion"];

for (const m of PAGES) {
  test(`${m} — todos los campos visibles tienen nombre accesible (en cada pestaña)`, async ({ page }) => {
    await page.addInitScript((s) => { if (!localStorage.getItem("gpi_db")) localStorage.setItem("gpi_db", s); }, DB);
    await page.goto(`/${m}.html`);
    await page.waitForTimeout(700);
    const tabs = page.locator(".tab, [data-view], [data-tab], .nav-item, .view-btn");
    const nt = Math.min(await tabs.count(), 14);
    const sinNombre = new Set<string>();
    for (let i = -1; i < nt; i++) {
      if (i >= 0) { await tabs.nth(i).click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(450); }
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]),select,textarea").forEach((el) => {
          const h = el as HTMLElement;
          if (h.offsetParent === null && getComputedStyle(h).position !== "fixed") return;
          const id = h.id, lab = (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) || h.closest("label");
          const by = h.getAttribute("aria-labelledby"), lby = by ? document.getElementById(by.split(" ")[0]) : null;
          const name = (h.getAttribute("aria-label") || (lby && lby.textContent) || (lab && lab.textContent) || h.getAttribute("title") || "").trim();
          if (!name) out.push(h.outerHTML.slice(0, 160));
        });
        return out;
      });
      bad.forEach((x) => sinNombre.add(x));
    }
    expect([...sinNombre]).toEqual([]);
  });
}
