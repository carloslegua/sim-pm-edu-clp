// E2E en navegador real (auditoría, media): «Congelar nueva versión» archiva la línea base anterior COMPLETA (versión, fecha, aprobador, motivo y sus
// requisitos) y el historial sobrevive a una recarga; ya no se pierde el requisito que solo existía en la versión original.
import { test, expect } from "@playwright/test";

const REQ = (id: string, code: string, text: string) => ({ id, code, text, type: "funcional", priority: "must", sourceRanIds: [], stakeholderId: "", wbsNodeIds: [], acceptanceCriteria: "ok", verificationMethod: "prueba", verificationStatus: "pendiente", status: "aprobado", normativeBasis: "", origin: "baseline", changeId: null, notes: "" });
const semilla = { version: 1, activeId: "p1", projects: { p1: { schema: "gpi.project/v1", meta: { id: "p1", name: "Proyecto Live", course: "GPI", createdAt: 1, updatedAt: 1 }, modules: { requirements: {
  baseline: { frozen: true, version: "1.0", date: "2026-07-10", approver: "Sponsor", snapshot: [REQ("r1", "REQ.01", "Requisito uno"), REQ("r2", "REQ.02", "Requisito SOLO en la v1.0")] },
  items: [REQ("r1", "REQ.01", "Requisito uno")], changes: [], idCounter: 3, changeCounter: 1 } } } } };

test("nueva versión de la línea base de requisitos: la anterior queda archivada completa y sobrevive a recargar", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript((db) => { if (!localStorage.getItem("gpi_db")) localStorage.setItem("gpi_db", JSON.stringify(db)); }, semilla);
  await page.goto("/Recopilar_Requisitos.html");
  await page.locator('.tab[data-p="p3"]').click();
  await page.getByRole("button", { name: /Congelar nueva versión/ }).click();
  await expect(page.locator("#ovMsg")).toContainText("se archiva COMPLETA en el historial");
  await page.locator("#rb_appr").fill("CCB");
  await page.locator("#rb_reason").fill("Incorpora MOD.01 y MOD.02 aprobadas");
  await page.locator("#ovOk").click();
  await expect(page.locator("#lbHost")).toContainText("Línea base v2.0 · congelada");
  await expect(page.locator("#lbHost")).toContainText("Historial de versiones (1)");
  await page.waitForTimeout(1300);

  // recargar: el historial y su requisito siguen ahí
  await page.reload();
  await page.locator('.tab[data-p="p3"]').click();
  await expect(page.locator("#lbHost")).toContainText("Historial de versiones (1)");
  await page.locator("details.lb-hist summary").click();
  await expect(page.locator("details.lb-hist")).toContainText("Requisito SOLO en la v1.0");
  await expect(page.locator("details.lb-hist")).toContainText("Sponsor");
  await expect(page.locator("#lbHost")).toContainText("Motivo de esta versión: Incorpora MOD.01 y MOD.02 aprobadas");
});
