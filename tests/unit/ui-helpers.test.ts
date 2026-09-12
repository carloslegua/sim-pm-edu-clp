// Fase 3: GPI.ui.esc/kpi. Alcance deliberadamente chico (ver el comentario
// extenso en gpi-core.ts sobre por qué .kpi y los modales NO se unifican).
import { describe, expect, it } from "vitest";
import { esc, kpi, ui } from "../../src/core/gpi-core";

describe("GPI.ui.esc", () => {
  it("escapa los 5 caracteres HTML peligrosos", () => {
    expect(esc(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });

  it("convierte null/undefined a cadena vacía en vez de 'null'/'undefined'", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("convierte valores no-string a texto antes de escapar", () => {
    expect(esc(42)).toBe("42");
  });
});

describe("GPI.ui.kpi", () => {
  it("genera la fila valor+unidad+etiqueta tal como la usa Panel_Control.html", () => {
    expect(kpi(12, "und", "paquetes")).toBe(
      '<div class="kpi"><span class="v">12</span><span class="u">und</span><span class="l">paquetes</span></div>'
    );
  });

  it("omite el span de unidad cuando no se pasa unidad", () => {
    expect(kpi(5, null, "interesados")).toBe(
      '<div class="kpi"><span class="v">5</span><span class="l">interesados</span></div>'
    );
  });

  it("escapa el valor y la etiqueta (defensa contra datos del alumno con HTML)", () => {
    expect(kpi("<script>", null, "<b>x</b>")).toBe(
      '<div class="kpi"><span class="v">&lt;script&gt;</span><span class="l">&lt;b&gt;x&lt;/b&gt;</span></div>'
    );
  });
});

describe("GPI.ui namespace", () => {
  it("expone esc y kpi", () => {
    expect(ui.esc).toBe(esc);
    expect(ui.kpi).toBe(kpi);
  });
});
