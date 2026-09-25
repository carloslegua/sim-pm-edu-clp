// Ciclo de vida común de los documentos jsdom de las pruebas de humo (auditoría: la suite daba resultados variables).
//
// Causas atendidas:
//  1. Las pruebas abrían el HTML y esperaban un tiempo FIJO (500–900 ms) a que «terminara de cargar»: bajo carga
//     (workers en paralelo) la carga tarda más y la prueba leía una interfaz a medio inicializar. Ahora `JSDOM.fromURL`
//     no resuelve hasta el evento `load` de la ventana (scripts y hojas de estilo ya cargados y ejecutados), más un
//     ciclo de eventos para lo que el módulo agenda al arrancar.
//  2. Los documentos nunca se cerraban: cada uno dejaba su ventana, sus temporizadores y sus conexiones HTTP vivos hasta
//     el final del proceso, y consumían CPU de las pruebas siguientes (el «pool» de jsdom llegó a 70+ ventanas por
//     ejecución). Ahora se cierran todos al terminar cada prueba.
// Se aplica parcheando el `JSDOM` del paquete (mismo objeto que importan las pruebas con `import jsdomPkg from "jsdom"`).
import jsdomPkg from "jsdom";
import { afterEach } from "vitest";

const Base = jsdomPkg.JSDOM as any;
const abiertos = new Set<any>();

class Rastreado extends Base {
  constructor(...args: any[]) { super(...args); abiertos.add(this); }
  static async fromURL(url: string, options?: any): Promise<any> {
    const dom = await Base.fromURL(url, options);
    abiertos.add(dom);
    const w = dom.window;
    if (w.document.readyState !== "complete") await new Promise<void>((resolve) => w.addEventListener("load", () => resolve(), { once: true }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return dom;
  }
}
(jsdomPkg as any).JSDOM = Rastreado;

afterEach(() => {
  for (const dom of abiertos) { try { dom.window.close(); } catch (e) { /* ya cerrado */ } }
  abiertos.clear();
});
