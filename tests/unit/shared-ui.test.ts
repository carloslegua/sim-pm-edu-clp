// Componentes compartidos de interfaz (auditoría, media): escape de HTML, barra «Sincronizar» y nombres accesibles.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { esc } from "../../src/shared/html";
import { installGpiBadge } from "../../src/shared/gpi-badge";
import { guessName, hasAccessibleName, labelUnnamedControls } from "../../src/shared/a11y-labels";

beforeEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("esc", () => {
  it("escapa los cinco caracteres (seguro en contenido y en atributos)", () => {
    expect(esc(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
    expect(esc(null)).toBe(""); expect(esc(undefined)).toBe(""); expect(esc(0)).toBe("0");
  });
});

describe("installGpiBadge", () => {
  it("pinta el nombre escapado y ofrece Sincronizar y Panel", () => {
    const bar = installGpiBadge({ name: "<b>X</b>", onSync: () => true })!;
    expect(bar.className).toBe("gpi-badge"); expect(bar.innerHTML).not.toContain("<b>X</b>"); expect(bar.textContent).toContain("<b>X</b>");
    expect(bar.querySelector('a[href="Panel_Control.html"]')).toBeTruthy();
  });
  it("el texto del botón sale del resultado: false = sin sincronizar, cadena = esa cadena, null = sin cambio, otro = sincronizado", () => {
    vi.useFakeTimers();
    const casos: Array<[boolean | string | null | void, string]> = [[false, "⚠ Sin sincronizar"], ["✓ Hecho — WBS", "✓ Hecho — WBS"], [null, "☁ Sincronizar"], [true, "✓ Sincronizado"], [undefined, "✓ Sincronizado"]];
    casos.forEach(([r, esperado]) => {
      document.body.innerHTML = "";
      const bar = installGpiBadge({ name: "P", onSync: () => r })!, b = bar.querySelector("#gpiSyncBtn") as HTMLElement;
      b.click(); expect(b.textContent).toBe(esperado);
      vi.advanceTimersByTime(1500); expect(b.textContent).toBe("☁ Sincronizar");
    });
    vi.useRealTimers();
  });
  it("con id no se duplica; los colores de acento y la posición son parámetros", () => {
    installGpiBadge({ name: "P", onSync: () => true, id: "gpiBadge", accent: "#6c5ce7", bottom: 18 });
    installGpiBadge({ name: "P", onSync: () => true, id: "gpiBadge" });
    expect(document.querySelectorAll("#gpiBadge")).toHaveLength(1);
    expect(document.head.textContent).toContain("bottom:18px"); expect(document.head.textContent).toContain("#6c5ce7");
  });
});

describe("nombres accesibles", () => {
  it("REPRO: un campo de tabla sin nombre toma su columna y su fila; un campo de lista, el encabezado de su tarjeta; uno con label no se toca", () => {
    document.body.innerHTML = `
      <table><thead><tr><th>Código</th><th>Frecuencia</th></tr></thead><tbody><tr><td>CM-03</td><td><input data-f="frequency"></td></tr></tbody></table>
      <div class="card"><h3>Entregables clave</h3><div class="sl-row"><input data-list="deliverables" data-i="1"></div></div>
      <div class="field"><span class="fl">Patrocinador</span><input id="sp"></div>
      <label for="ok">Ya tiene nombre</label><input id="ok">
      <input aria-label="Propio" id="own"><input placeholder="Solo placeholder">`;
    const n = labelUnnamedControls(document);
    expect(document.querySelector('[data-f="frequency"]')!.getAttribute("aria-label")).toBe("Frecuencia — CM-03");
    expect(document.querySelector("[data-list]")!.getAttribute("aria-label")).toBe("Entregables clave 2");
    expect(document.getElementById("sp")!.getAttribute("aria-label")).toBe("Patrocinador");
    expect(document.getElementById("ok")!.hasAttribute("aria-label")).toBe(false);                      // ya tenía <label for>
    expect(document.getElementById("own")!.getAttribute("aria-label")).toBe("Propio");                  // no se pisa
    expect(document.querySelector("[placeholder]")!.getAttribute("aria-label")).toBe("Solo placeholder");
    expect(n).toBe(4);
    document.querySelectorAll("input,select,textarea").forEach((el) => expect(hasAccessibleName(el)).toBe(true));
  });
  it("sin nada de contexto usa el atributo de datos en palabras", () => {
    document.body.innerHTML = `<input data-p="probPct" data-i="2">`;
    expect(guessName(document.querySelector("input")!)).toBe("prob Pct 3");
  });
});
