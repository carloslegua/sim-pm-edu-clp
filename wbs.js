(function() {
	//#region src/shared/html.ts
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	//#endregion
	//#region src/shared/gpi-badge.ts
	function installGpiBadge(o) {
		if (typeof document === "undefined") return null;
		if (o.id && document.getElementById(o.id)) return document.getElementById(o.id);
		const accent = o.accent || "#0090c2", hover = o.hover || "#00b6ec", dot = o.dot || "#00c2a8", shadow = o.dotShadow || "rgba(0,194,168,.18)", dc = o.dotClass || "gpi-dot";
		const css = document.createElement("style");
		css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:" + (o.bottom === void 0 ? 42 : o.bottom) + "px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}." + dc + "{width:8px;height:8px;border-radius:50%;background:" + dot + ";box-shadow:0 0 0 3px " + shadow + "}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:" + accent + ";border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:" + hover + ";background:#fff}";
		document.head.appendChild(css);
		const bar = document.createElement("div");
		bar.className = "gpi-badge";
		if (o.id) bar.id = o.id;
		bar.innerHTML = "<span class=\"" + dc + "\"></span><span>Panel: <b>" + esc(o.name || "—") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		const btn = bar.querySelector("#gpiSyncBtn");
		btn.addEventListener("click", () => {
			const r = o.onSync();
			if (r === null) return;
			const t = btn.textContent;
			btn.textContent = r === false ? "⚠ Sin sincronizar" : typeof r === "string" ? r : "✓ Sincronizado";
			setTimeout(() => {
				btn.textContent = t;
			}, o.restoreMs || 1400);
		});
		return bar;
	}
	//#endregion
	//#region src/shared/write-session.ts
	function writeOk(r) {
		return r.status === "saved" || r.status === "unchanged";
	}
	function showWriteProblem(msg, setStatus) {
		setStatus(msg);
		const banner = document.getElementById("banner");
		if (banner) {
			banner.textContent = msg;
			banner.classList.add("show");
		}
	}
	function pushWithSession(G, name, label, data, patch, session, hooks) {
		const r = G.saveState(name, data, patch, session);
		const next = !session && r.status === "saved" ? G.openSession(name) : session;
		if (writeOk(r)) return {
			ok: true,
			session: next
		};
		if (r.status === "rejected" && r.reason === "project-changed") hooks.onStale();
		else showWriteProblem(G.describeWrite(r, label), hooks.setStatus);
		return {
			ok: false,
			session: next
		};
	}
	//#endregion
	//#region src/shared/wbs-quality.ts
	var LIMITS = {
		maxDepth: 5,
		maxChildren: 9,
		maxPackageDays: 60,
		maxCostSharePct: 20,
		minLeavesForShare: 5
	};
	var PLACEHOLDERS = [
		"nuevo paquete",
		"nueva fase",
		"nueva subtarea",
		"nuevo entregable",
		"entregable",
		"paquete",
		"fase",
		"subtarea",
		"proyecto sin titulo"
	];
	var NOT_VERBS = [
		"taller",
		"alquiler",
		"poder",
		"lider",
		"mujer",
		"lugar",
		"hogar",
		"pilar",
		"militar",
		"dossier",
		"container",
		"router",
		"caracter",
		"deber",
		"placer",
		"cadaver",
		"crater",
		"cluster",
		"poster",
		"elixir"
	];
	var RULES = [
		{
			code: "E1",
			severity: "aviso",
			title: "Nombres vacíos o sin editar",
			hint: "Cada elemento necesita un nombre propio; los nombres de plantilla («Nuevo paquete», «Nueva fase») no dicen qué se entrega."
		},
		{
			code: "E2",
			severity: "riesgo",
			title: "Nombres repetidos entre hermanos",
			hint: "Dos elementos con el mismo nombre bajo el mismo padre son ambiguos: nadie sabe cuál es cuál al asignar, costear o reportar."
		},
		{
			code: "E3",
			severity: "info",
			title: "Mismo nombre en ramas distintas",
			hint: "Repetir un nombre («Pruebas») en dos ramas confunde los reportes; agrega el contexto al nombre («Pruebas eléctricas»)."
		},
		{
			code: "E4",
			severity: "aviso",
			title: "Elementos con un solo hijo",
			hint: "Una descomposición produce al menos dos elementos: con uno solo no hay descomposición. Agrega el que falta o fusiónalo con su padre."
		},
		{
			code: "E5",
			severity: "aviso",
			title: "Fases sin descomponer",
			hint: "Una fase sin entregables ni paquetes no se puede planificar ni costear: descomponla hasta paquetes de trabajo."
		},
		{
			code: "E6",
			severity: "aviso",
			title: "Más de " + LIMITS.maxDepth + " niveles",
			hint: "Una EDT muy profunda es difícil de mantener; considera un subproyecto o replantear el criterio de descomposición."
		},
		{
			code: "E7",
			severity: "info",
			title: "Demasiados hijos (más de " + LIMITS.maxChildren + ")",
			hint: "Con tantos hijos conviene agrupar en un nivel intermedio (por entregable o por área)."
		},
		{
			code: "E8",
			severity: "info",
			title: "Nombres que parecen actividades",
			hint: "La EDT nombra resultados (sustantivos: «Diseño estructural»), no acciones (verbos: «Diseñar la estructura»); las acciones son actividades, y se definen después."
		},
		{
			code: "D1",
			severity: "aviso",
			title: "Paquetes sin descripción del trabajo",
			hint: "El diccionario de la EDT describe qué trabajo incluye y qué no cada paquete; sin él, cada persona interpreta el alcance a su manera."
		},
		{
			code: "D2",
			severity: "aviso",
			title: "Paquetes sin criterio de aceptación",
			hint: "Sin criterio de aceptación no hay forma objetiva de decir que el paquete está terminado (y de cobrarlo o ganar su valor)."
		},
		{
			code: "D3",
			severity: "aviso",
			title: "Paquetes sin responsable",
			hint: "Cada paquete tiene un responsable (idealmente el «R» de la Matriz RACI)."
		},
		{
			code: "D4",
			severity: "aviso",
			title: "Paquetes sin costo",
			hint: "Un paquete sin costo deja el presupuesto incompleto; estímalo aquí o en Estimar los Costos."
		},
		{
			code: "D5",
			severity: "aviso",
			title: "Paquetes sin duración ni fechas",
			hint: "Un paquete sin duración ni fechas no entra al cronograma."
		},
		{
			code: "D6",
			severity: "riesgo",
			title: "Fechas incompletas o invertidas",
			hint: "Un paquete con una sola fecha, o cuyo fin cae antes que su inicio, rompe el cronograma y el valor planificado."
		},
		{
			code: "S1",
			severity: "aviso",
			title: "Paquetes demasiado largos (> " + LIMITS.maxPackageDays + " d)",
			hint: "Un paquete tan largo no se puede controlar con avance real: descomponlo (regla del período de reporte / 8-80) o decláralo esfuerzo continuo (LOE) si es gestión o seguimiento."
		},
		{
			code: "S2",
			severity: "aviso",
			title: "Paquetes que concentran el costo (> " + LIMITS.maxCostSharePct + " %)",
			hint: "Un paquete que concentra tanto presupuesto es difícil de controlar (valor ganado, avance): considera dividirlo por lote, hito de pago o entrega."
		}
	];
	var RULE = {};
	RULES.forEach((r) => {
		RULE[r.code] = r;
	});
	var SEV_RANK = {
		riesgo: 0,
		aviso: 1,
		info: 2
	};
	var norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
	var blank = (s) => !String(s == null ? "" : s).trim();
	var num = (v) => {
		const n = Number(v);
		return isFinite(n) ? n : 0;
	};
	function calendarDays(start, end) {
		if (!start || !end) return null;
		const a = Date.parse(start + "T00:00:00Z"), b = Date.parse(end + "T00:00:00Z");
		if (!isFinite(a) || !isFinite(b)) return null;
		const d = Math.round((b - a) / 864e5);
		return d >= 0 ? d + 1 : null;
	}
	function looksLikeActivity(name) {
		const first = norm(name).split(" ")[0] || "";
		return first.length >= 5 && /^[a-z]+(ar|er|ir)$/.test(first) && NOT_VERBS.indexOf(first) < 0;
	}
	function analyzeWbs(wbs) {
		const empty = {
			findings: [],
			byNode: {},
			groups: [],
			counts: {
				riesgo: 0,
				aviso: 0,
				info: 0
			},
			state: "vacio",
			codes: {},
			leaves: 0,
			maxDepth: 0,
			dictionary: {
				complete: 0,
				total: 0,
				pct: 0
			}
		};
		if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return empty;
		const nodes = wbs.nodes, rootId = wbs.rootId;
		const order = [], parent = {}, depth = {}, codes = {}, kids = {};
		const seen = {};
		(function walk(id, par, d, code) {
			seen[id] = true;
			order.push(id);
			parent[id] = par;
			depth[id] = d;
			codes[id] = code;
			kids[id] = (nodes[id].children || []).filter((c) => nodes[c] && !seen[c]);
			kids[id].forEach((c, i) => walk(c, id, d + 1, id === rootId ? String(i + 1) : code + "." + (i + 1)));
		})(rootId, null, 0, "0");
		const body = order.filter((id) => id !== rootId);
		if (!body.length) return {
			...empty,
			codes
		};
		const leafIds = body.filter((id) => !kids[id].length);
		const maxDepth = body.reduce((m, id) => Math.max(m, depth[id]), 0);
		const findings = [];
		const add = (code, id, text, severity) => {
			findings.push({
				code,
				severity: severity || RULE[code].severity,
				nodeId: id,
				nodeCode: codes[id],
				text
			});
		};
		const nm = (id) => "«" + (String(nodes[id].name || "").trim() || "sin nombre") + "»";
		body.forEach((id) => {
			const raw = String(nodes[id].name || "");
			if (blank(raw)) add("E1", id, "El elemento " + codes[id] + " no tiene nombre.", "riesgo");
			else if (PLACEHOLDERS.indexOf(norm(raw)) >= 0) add("E1", id, nm(id) + " conserva un nombre de plantilla: nómbralo por lo que entrega.");
			else if (looksLikeActivity(raw)) add("E8", id, nm(id) + " parece una actividad (empieza con un verbo): nombra el resultado, no la acción.");
		});
		const siblingDup = {};
		order.forEach((pid) => {
			const seenName = {};
			kids[pid].forEach((c) => {
				const k = norm(nodes[c].name);
				if (k) (seenName[k] = seenName[k] || []).push(c);
			});
			Object.keys(seenName).forEach((k) => {
				if (seenName[k].length > 1) seenName[k].forEach((c) => {
					siblingDup[c] = true;
					add("E2", c, nm(c) + " se repite entre los hijos de " + (pid === rootId ? "el proyecto" : codes[pid]) + ".");
				});
			});
		});
		const byName = {};
		body.forEach((id) => {
			const k = norm(nodes[id].name);
			if (k && PLACEHOLDERS.indexOf(k) < 0) (byName[k] = byName[k] || []).push(id);
		});
		Object.keys(byName).forEach((k) => {
			const ids = byName[k].filter((id) => !siblingDup[id]);
			if (byName[k].length > 1 && ids.length) ids.forEach((id) => add("E3", id, nm(id) + " también aparece en otra rama de la EDT (" + byName[k].filter((o) => o !== id).map((o) => codes[o]).join(", ") + ")."));
		});
		order.forEach((id) => {
			if (kids[id].length === 1) add("E4", id, (id === rootId ? "El proyecto tiene una sola fase (" + nm(kids[id][0]) + ")" : nm(id) + " tiene un solo hijo (" + nm(kids[id][0]) + ")") + ": eso no es una descomposición.");
			if (kids[id].length > LIMITS.maxChildren) add("E7", id, (id === rootId ? "El proyecto" : nm(id)) + " tiene " + kids[id].length + " hijos: agrúpalos en un nivel intermedio.");
		});
		const phases = kids[rootId];
		if (phases.some((p) => kids[p].length)) phases.filter((p) => !kids[p].length).forEach((p) => add("E5", p, nm(p) + " no tiene entregables ni paquetes: descomponla."));
		body.filter((id) => depth[id] === LIMITS.maxDepth + 1).forEach((id) => add("E6", id, nm(id) + " está en el nivel " + depth[id] + ": la EDT supera los " + LIMITS.maxDepth + " niveles."));
		const totalCost = leafIds.reduce((s, id) => s + Math.max(0, num(nodes[id].cost)), 0);
		let complete = 0;
		leafIds.forEach((id) => {
			const n = nodes[id];
			const okDesc = !blank(n.notes), okAcc = !blank(n.acceptance), okRes = !blank(n.resource);
			if (!okDesc) add("D1", id, nm(id) + " no tiene descripción del trabajo.");
			if (!okAcc) add("D2", id, nm(id) + " no tiene criterio de aceptación.");
			if (!okRes) add("D3", id, nm(id) + " no tiene responsable.");
			if (okDesc && okAcc && okRes) complete++;
			const cost = num(n.cost);
			if (cost <= 0) add("D4", id, nm(id) + " no tiene costo estimado.");
			const days = calendarDays(n.start, n.end) ?? Math.max(0, num(n.duration));
			const hasS = !blank(n.start), hasE = !blank(n.end);
			if (hasS && hasE && n.start > n.end) add("D6", id, nm(id) + " termina (" + n.end + ") antes de empezar (" + n.start + ").");
			else if (hasS !== hasE) add("D6", id, nm(id) + " tiene solo la fecha de " + (hasS ? "inicio" : "fin") + ": completa la otra o bórrala.");
			else if (!hasS && days <= 0) add("D5", id, nm(id) + " no tiene duración ni fechas.");
			if (!n.loe) {
				if (days > LIMITS.maxPackageDays) add("S1", id, nm(id) + " dura " + days + " d (más de " + LIMITS.maxPackageDays + "): descomponlo o márcalo como esfuerzo continuo (LOE).");
				if (leafIds.length >= LIMITS.minLeavesForShare && totalCost > 0 && cost / totalCost * 100 > LIMITS.maxCostSharePct) add("S2", id, nm(id) + " concentra el " + Math.round(cost / totalCost * 1e3) / 10 + " % del costo total: es difícil de controlar; considera dividirlo.");
			}
		});
		const counts = {
			riesgo: 0,
			aviso: 0,
			info: 0
		};
		findings.forEach((f) => {
			counts[f.severity]++;
		});
		const byNode = {};
		findings.forEach((f) => {
			(byNode[f.nodeId] = byNode[f.nodeId] || []).push(f);
		});
		const groups = [];
		RULES.forEach((r) => {
			const items = findings.filter((f) => f.code === r.code);
			if (!items.length) return;
			const sev = items.reduce((s, f) => SEV_RANK[f.severity] < SEV_RANK[s] ? f.severity : s, items[0].severity);
			groups.push({
				code: r.code,
				severity: sev,
				title: r.title,
				hint: r.hint,
				items
			});
		});
		groups.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
		return {
			findings,
			byNode,
			groups,
			counts,
			state: counts.riesgo ? "rojo" : counts.aviso ? "ambar" : "verde",
			codes,
			leaves: leafIds.length,
			maxDepth,
			dictionary: {
				complete,
				total: leafIds.length,
				pct: leafIds.length ? Math.round(complete / leafIds.length * 100) : 0
			}
		};
	}
	//#endregion
	//#region src/shared/wbs-sample.ts
	var SAMPLE_WBS_DICTIONARY = {
		"1.1": {
			notes: "Documento que autoriza formalmente el proyecto, nombra al director y fija los requisitos de alto nivel (RAN.01 a RAN.04).",
			acceptance: "Acta firmada por la Gerencia General de DISTRIB+."
		},
		"1.2": {
			notes: "Plan para la dirección del proyecto con las líneas base de alcance, cronograma y costo, y los planes subsidiarios de gestión.",
			acceptance: "Plan y líneas base aprobados por el sponsor antes de iniciar la construcción."
		},
		"1.3": {
			notes: "Informes mensuales de avance, reuniones de control y seguimiento de las líneas base durante todo el proyecto.",
			acceptance: "Informe mensual entregado y aceptado por el sponsor en cada corte.",
			loe: true
		},
		"2.1": {
			notes: "Calicatas y ensayos de laboratorio que determinan la capacidad portante del terreno; su informe alimenta el diseño de la cimentación (riesgo R-03).",
			acceptance: "Informe geotécnico firmado por especialista colegiado y aprobado por la supervisión."
		},
		"2.2": {
			notes: "Memoria de cálculo y planos estructurales de la nave, con la cobertura y la disposición de racks.",
			acceptance: "Expediente estructural revisado y aprobado por la supervisión; planos aptos para construcción."
		},
		"2.3": {
			notes: "Memoria y planos de las instalaciones eléctricas y sanitarias, dimensionadas para la operación logística proyectada.",
			acceptance: "Cargas eléctricas y caudales sanitarios conformes a la memoria de cálculo aprobada."
		},
		"2.4": {
			notes: "Licencia de edificación de la Municipalidad de Lurín y certificado ITSE de seguridad (riesgo R-01).",
			acceptance: "Licencia y certificado ITSE emitidos por la municipalidad y vigentes."
		},
		"3.1": {
			notes: "Fabricación y transporte a obra de las estructuras metálicas prefabricadas (riesgos R-02, alza del acero, y R-08, fabricación).",
			acceptance: "Piezas recibidas en obra conforme a planos, con los certificados de calidad del fabricante."
		},
		"3.2": {
			notes: "Suministro de cemento, agregados y materiales varios para la obra civil.",
			acceptance: "Materiales recibidos con guías y certificados; cantidades conformes al metrado."
		},
		"3.3": {
			notes: "Adquisición de tableros, equipos eléctricos y equipos sanitarios para las instalaciones MEP.",
			acceptance: "Equipos entregados según la especificación técnica y con su protocolo de fábrica."
		},
		"4.1": {
			notes: "Corte, relleno, eliminación de excedentes y nivelación de la plataforma del almacén.",
			acceptance: "Plataforma nivelada y compactada según planos, con los ensayos de densidad aprobados."
		},
		"4.2": {
			notes: "Zapatas y cimentación de la nave según el estudio de suelos, incluido el refuerzo por el hallazgo geotécnico (R-03).",
			acceptance: "Cimentación conforme a planos y ensayos de resistencia del concreto aprobados."
		},
		"4.3": {
			notes: "Montaje de columnas, vigas, tijerales y cobertura TR-4 de la nave.",
			acceptance: "Altura libre y disposición de racks verificadas contra los planos aprobados."
		},
		"4.4": {
			notes: "Tarrajeo, pintura y cerramiento perimétrico de la edificación.",
			acceptance: "Pisos, señalización y anchos de pasillo aptos para montacargas según el layout operativo."
		},
		"4.5": {
			notes: "Instalación de tableros, circuitos eléctricos y redes sanitarias.",
			acceptance: "Instalaciones ejecutadas y en funcionamiento, conformes a la memoria de cálculo."
		},
		"5.1": {
			notes: "Pruebas de tableros y circuitos eléctricos y pruebas hidráulicas de las redes sanitarias.",
			acceptance: "Protocolos de prueba firmados por QA/QC y aceptados por el cliente."
		},
		"5.2": {
			notes: "Capacitación operativa al personal del cliente y entrega de los manuales de operación y mantenimiento.",
			acceptance: "Personal capacitado (registro de asistencia) y manuales entregados."
		},
		"5.3": {
			notes: "Dossier de calidad, planos as-built y acta de entrega y cierre del proyecto.",
			acceptance: "Dossier completo y acta de entrega y cierre firmada por el cliente."
		}
	};
	//#endregion
	//#region src/modules/wbs/main.ts
	var NODE_W = 180;
	var NODE_H = 118;
	var GAP_X = 28;
	var GAP_Y = 64;
	var LEVEL_COLORS = [
		"#00b6ec",
		"#6c5ce7",
		"#00c2a8",
		"#ff9f1c",
		"#ff6b8b",
		"#2e4374"
	];
	var nodes = {};
	var gpiRaciModule = null;
	var gpiObsModule = null;
	var gpiScopeModule = null;
	var gpiActivitiesModule = null;
	var gpiPertModule = null;
	var gpiScheduleModule = null;
	var gpiSchedulePlanModule = null;
	var gpiCostEstimateModule = null;
	var scheduleLockedLeafIds = /* @__PURE__ */ new Set();
	var costEstimateLockedLeafIds = /* @__PURE__ */ new Set();
	var rootId = "root";
	var selectedId = null;
	var zoom = 1;
	var draggedId = null;
	var currentView = "tree";
	var idCounter = 1;
	var requestGpiPush = null;
	var ensureProjectFresh = null;
	var dirtyTimer;
	function markDirty() {
		clearTimeout(dirtyTimer);
		dirtyTimer = setTimeout(() => {
			if (requestGpiPush) requestGpiPush();
		}, 800);
	}
	function uid() {
		return "n" + idCounter++;
	}
	function newNode(parentId, name, overrides) {
		const id = uid();
		nodes[id] = Object.assign({
			id,
			parentId,
			name: name || "Nuevo paquete",
			duration: 0,
			cost: 0,
			resource: "",
			percent: 0,
			start: "",
			end: "",
			notes: "",
			acceptance: "",
			children: [],
			collapsed: false,
			orientation: "spread"
		}, overrides || {});
		if (parentId && nodes[parentId]) nodes[parentId].children.push(id);
		return id;
	}
	var MONTHS_ES = [
		"ene",
		"feb",
		"mar",
		"abr",
		"may",
		"jun",
		"jul",
		"ago",
		"sep",
		"oct",
		"nov",
		"dic"
	];
	function daysBetween(startIso, endIso) {
		if (!startIso || !endIso) return null;
		const s = /* @__PURE__ */ new Date(startIso + "T00:00:00");
		const e = /* @__PURE__ */ new Date(endIso + "T00:00:00");
		if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
		const diff = Math.round((e.getTime() - s.getTime()) / 864e5);
		return diff >= 0 ? diff + 1 : null;
	}
	function formatDateShort(iso) {
		if (!iso) return "";
		const d = /* @__PURE__ */ new Date(iso + "T00:00:00");
		if (isNaN(d.getTime())) return "";
		return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
	}
	function formatDateRange(startIso, endIso) {
		if (!startIso || !endIso) return "";
		return `${formatDateShort(startIso)} – ${formatDateShort(endIso)}`;
	}
	function blankProject(title) {
		nodes = {};
		idCounter = 1;
		rootId = newNode(null, title || "Proyecto sin título");
		selectedId = rootId;
	}
	function loadSample() {
		blankProject("Proyecto DISTRIB+ S.A. — Almacén Lurín");
		const root = rootId;
		const dirProy = newNode(root, "Dirección de Proyecto", { resource: "PM" });
		newNode(dirProy, "Acta de constitución", {
			duration: 4,
			cost: 12e3,
			percent: 100,
			resource: "PM",
			start: "2026-07-06",
			end: "2026-07-09"
		});
		newNode(dirProy, "Plan de gestión del proyecto", {
			duration: 17,
			cost: 38e3,
			percent: 60,
			resource: "PM",
			start: "2026-07-10",
			end: "2026-08-05"
		});
		newNode(dirProy, "Informes de seguimiento y control", {
			duration: 16,
			cost: 145e3,
			percent: 20,
			resource: "PM",
			start: "2026-08-06",
			end: "2026-08-27"
		});
		const ing = newNode(root, "Ingeniería y Diseño", { resource: "Ing. Civil" });
		newNode(ing, "Estudio de suelos", {
			duration: 18,
			cost: 28e3,
			percent: 100,
			resource: "Geotecnia",
			start: "2026-08-06",
			end: "2026-08-31"
		});
		newNode(ing, "Diseño estructural", {
			duration: 22,
			cost: 165e3,
			percent: 80,
			resource: "Ing. Estructural",
			start: "2026-09-01",
			end: "2026-09-30"
		});
		newNode(ing, "Diseño eléctrico y sanitario", {
			duration: 16,
			cost: 98e3,
			percent: 50,
			resource: "Ing. MEP",
			start: "2026-09-08",
			end: "2026-09-29"
		});
		newNode(ing, "Permisos y licencias municipales", {
			duration: 30,
			cost: 64e3,
			percent: 30,
			resource: "Legal",
			start: "2026-10-01",
			end: "2026-11-11"
		});
		const proc = newNode(root, "Procura", { resource: "Logística" });
		newNode(proc, "Estructuras metálicas prefabricadas", {
			duration: 13,
			cost: 182e4,
			percent: 10,
			resource: "Proveedor A",
			start: "2026-10-01",
			end: "2026-10-19"
		});
		newNode(proc, "Materiales de construcción", {
			duration: 15,
			cost: 715e3,
			percent: 25,
			resource: "Proveedor B",
			start: "2026-10-15",
			end: "2026-11-04"
		});
		newNode(proc, "Equipos eléctricos e instalaciones", {
			duration: 10,
			cost: 415e3,
			percent: 0,
			resource: "Proveedor C",
			start: "2026-09-30",
			end: "2026-10-13"
		});
		const constr = newNode(root, "Construcción", { resource: "Residente de Obra" });
		newNode(constr, "Movimiento de tierras", {
			duration: 32,
			cost: 38e4,
			percent: 0,
			resource: "Cuadrilla A",
			start: "2026-11-12",
			end: "2026-12-25"
		});
		newNode(constr, "Cimentaciones", {
			duration: 29,
			cost: 735e3,
			percent: 0,
			resource: "Cuadrilla B",
			start: "2026-12-28",
			end: "2027-02-04"
		});
		newNode(constr, "Estructura y cobertura", {
			duration: 28,
			cost: 1165e3,
			percent: 0,
			resource: "Cuadrilla C",
			start: "2027-02-05",
			end: "2027-03-16"
		});
		newNode(constr, "Acabados y cerramientos", {
			duration: 76,
			cost: 55e4,
			percent: 0,
			resource: "Cuadrilla D",
			start: "2027-03-17",
			end: "2027-06-30"
		});
		newNode(constr, "Instalaciones MEP", {
			duration: 35,
			cost: 485e3,
			percent: 0,
			resource: "Subcontrata MEP",
			start: "2027-03-01",
			end: "2027-04-16"
		});
		nodes[constr].orientation = "stack";
		const com = newNode(root, "Pruebas y Puesta en Marcha", { resource: "QA/QC" });
		newNode(com, "Pruebas de instalaciones", {
			duration: 6,
			cost: 145e3,
			percent: 0,
			resource: "QA/QC",
			start: "2027-06-14",
			end: "2027-06-21"
		});
		newNode(com, "Capacitación al cliente", {
			duration: 12,
			cost: 48e3,
			percent: 0,
			resource: "PM",
			start: "2027-06-22",
			end: "2027-07-07"
		});
		newNode(com, "Acta de entrega y cierre", {
			duration: 12,
			cost: 92e3,
			percent: 0,
			resource: "PM",
			start: "2027-07-08",
			end: "2027-07-23"
		});
		const codes = computeCodes();
		Object.keys(nodes).forEach((id) => {
			const d = SAMPLE_WBS_DICTIONARY[codes[id]];
			if (d) {
				nodes[id].notes = d.notes;
				nodes[id].acceptance = d.acceptance;
				if (d.loe) nodes[id].loe = true;
			}
		});
		selectedId = root;
	}
	function visibleChildren(id) {
		return nodes[id] && nodes[id].collapsed ? [] : nodes[id] ? nodes[id].children : [];
	}
	function countDescendants(id) {
		let count = 0;
		function walk(nid) {
			nodes[nid].children.forEach((cid) => {
				count++;
				walk(cid);
			});
		}
		walk(id);
		return count;
	}
	function isDescendant(ancestorId, candidateId) {
		if (ancestorId === candidateId) return true;
		let curId = candidateId, n = nodes[candidateId];
		const seen = /* @__PURE__ */ new Set();
		while (n && n.parentId && !seen.has(curId)) {
			seen.add(curId);
			if (n.parentId === ancestorId) return true;
			curId = n.parentId;
			n = nodes[n.parentId];
		}
		return false;
	}
	function depthOf(id) {
		let d = 0, curId = id, n = nodes[id];
		const seen = /* @__PURE__ */ new Set();
		while (n && n.parentId && !seen.has(curId)) {
			seen.add(curId);
			d++;
			curId = n.parentId;
			n = nodes[n.parentId];
		}
		return d;
	}
	function deleteSubtree(id) {
		const node = nodes[id];
		if (!node) return;
		[...node.children].forEach(deleteSubtree);
		if (node.parentId && nodes[node.parentId]) {
			const arr = nodes[node.parentId].children;
			const idx = arr.indexOf(id);
			if (idx > -1) arr.splice(idx, 1);
		}
		if (draggedId === id) draggedId = null;
		delete nodes[id];
	}
	function computeCodes() {
		const codes = {};
		function walk(id, prefix) {
			codes[id] = prefix;
			nodes[id].children.forEach((cid, i) => walk(cid, prefix ? `${prefix}.${i + 1}` : `${i + 1}`));
		}
		nodes[rootId].children.forEach((cid, i) => walk(cid, `${i + 1}`));
		codes[rootId] = "0";
		return codes;
	}
	function computeRollup() {
		const rolled = {};
		function walk(id) {
			const node = nodes[id];
			const kids = node.children;
			if (kids.length === 0) {
				const dateDuration = daysBetween(node.start, node.end);
				rolled[id] = {
					cost: node.cost || 0,
					duration: dateDuration != null ? dateDuration : node.duration || 0,
					start: node.start || null,
					end: node.end || null,
					percent: node.percent || 0,
					isLeaf: true
				};
				return rolled[id];
			}
			let cost = 0, weightedPercent = 0, maxDuration = 0;
			let minStart = null, maxEnd = null;
			kids.forEach((cid) => {
				const r = walk(cid);
				cost += r.cost;
				weightedPercent += r.cost > 0 ? r.percent * r.cost : r.percent;
				if (r.duration > maxDuration) maxDuration = r.duration;
				if (r.start && (!minStart || r.start < minStart)) minStart = r.start;
				if (r.end && (!maxEnd || r.end > maxEnd)) maxEnd = r.end;
			});
			const totalForWeight = kids.reduce((s, cid) => s + (rolled[cid].cost > 0 ? rolled[cid].cost : 1), 0);
			const spanDuration = daysBetween(minStart, maxEnd);
			rolled[id] = {
				cost,
				duration: spanDuration != null ? spanDuration : maxDuration,
				start: minStart,
				end: maxEnd,
				percent: totalForWeight > 0 ? Math.round(weightedPercent / totalForWeight) : 0,
				isLeaf: false
			};
			return rolled[id];
		}
		walk(rootId);
		return rolled;
	}
	var SPREAD_SIBLING_GAP = GAP_X;
	var SPREAD_DEPTH_GAP = GAP_Y;
	var STACK_SIBLING_GAP = 30;
	var STACK_DEPTH_GAP = 34;
	var STACK_INDENT = Math.round(NODE_W * .2);
	function computeLayout() {
		const sizes = {};
		const positions = {};
		function computeSize(id) {
			const node = nodes[id];
			const kids = visibleChildren(id);
			if (kids.length === 0) {
				sizes[id] = {
					w: NODE_W,
					h: NODE_H
				};
				return sizes[id];
			}
			kids.forEach(computeSize);
			if ((node.orientation || "spread") === "stack") {
				const childrenW = Math.max(...kids.map((cid) => sizes[cid].w));
				const childrenH = kids.reduce((s, cid) => s + sizes[cid].h, 0) + STACK_SIBLING_GAP * (kids.length - 1);
				sizes[id] = {
					w: Math.max(NODE_W, STACK_INDENT + childrenW),
					h: 152 + childrenH,
					childExtent: {
						w: childrenW,
						h: childrenH
					}
				};
			} else {
				const childrenW = kids.reduce((s, cid) => s + sizes[cid].w, 0) + SPREAD_SIBLING_GAP * (kids.length - 1);
				const childrenH = Math.max(...kids.map((cid) => sizes[cid].h));
				sizes[id] = {
					w: Math.max(NODE_W, childrenW),
					h: 182 + childrenH,
					childExtent: {
						w: childrenW,
						h: childrenH
					}
				};
			}
			return sizes[id];
		}
		function assignPos(id, originX, originY) {
			const node = nodes[id];
			const kids = visibleChildren(id);
			const size = sizes[id];
			if (kids.length === 0) {
				positions[id] = {
					x: originX,
					y: originY
				};
				return;
			}
			if ((node.orientation || "spread") === "stack") {
				positions[id] = {
					x: originX,
					y: originY
				};
				const childX = originX + STACK_INDENT;
				let cy = originY + NODE_H + STACK_DEPTH_GAP;
				kids.forEach((cid) => {
					assignPos(cid, childX, cy);
					cy += sizes[cid].h + STACK_SIBLING_GAP;
				});
			} else {
				positions[id] = {
					x: originX + (size.w - NODE_W) / 2,
					y: originY
				};
				const childY = originY + NODE_H + SPREAD_DEPTH_GAP;
				let cx = originX + (size.w - size.childExtent.w) / 2;
				kids.forEach((cid) => {
					assignPos(cid, cx, childY);
					cx += sizes[cid].w + SPREAD_SIBLING_GAP;
				});
			}
		}
		computeSize(rootId);
		assignPos(rootId, 0, 0);
		return positions;
	}
	function setOrientationForBranch(targetId, o) {
		function walk(id) {
			nodes[id].orientation = o;
			nodes[id].children.forEach(walk);
		}
		walk(targetId);
		render();
		setTimeout(fitToScreen, 50);
	}
	function fmtMoney(v) {
		return "S/ " + (v || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
	}
	var quality = analyzeWbs(null);
	function computeQuality() {
		quality = analyzeWbs({
			rootId,
			nodes
		});
	}
	function render() {
		const rolled = computeRollup();
		const codes = computeCodes();
		computeQuality();
		if (currentView === "tree") renderTree(rolled, codes);
		else renderTable(rolled, codes);
		renderProps(rolled);
		renderStats(rolled);
		renderQuality();
		renderLegend();
		updateOrientationUI();
	}
	function refreshValues() {
		const rolled = computeRollup();
		const codes = computeCodes();
		computeQuality();
		renderStats(rolled);
		renderQuality();
		if (currentView === "tree") renderTree(rolled, codes);
		else renderTable(rolled, codes);
		const nq = document.getElementById("nodeQuality");
		if (nq && selectedId) nq.innerHTML = nodeQualityHtml(selectedId);
	}
	function renderTree(rolled, codes) {
		const canvas = document.getElementById("canvas");
		const svg = document.getElementById("linksSvg");
		canvas.querySelectorAll(".node").forEach((n) => n.remove());
		const positions = computeLayout();
		let maxX = 0, maxY = 0;
		Object.entries(positions).forEach(([, pos]) => {
			maxX = Math.max(maxX, pos.x + NODE_W);
			maxY = Math.max(maxY, pos.y + NODE_H);
		});
		canvas.style.width = maxX + 120 + "px";
		canvas.style.height = maxY + 120 + "px";
		svg.setAttribute("width", String(maxX + 120));
		svg.setAttribute("height", String(maxY + 120));
		let linkPaths = "";
		Object.values(nodes).forEach((node) => {
			const o = node.orientation || "spread";
			const kids = visibleChildren(node.id);
			const p = positions[node.id];
			if (!p || kids.length === 0) return;
			if (o === "stack") {
				const trunkX = p.x + 14;
				const y1 = p.y + NODE_H;
				kids.forEach((cid) => {
					const c = positions[cid];
					if (!c) return;
					const childDepth = depthOf(cid);
					const color = LEVEL_COLORS[Math.min(childDepth - 1, LEVEL_COLORS.length - 1)];
					const y2 = c.y + NODE_H / 2;
					const x2 = c.x;
					const d = `M${trunkX},${y1} L${trunkX},${y2} L${x2},${y2}`;
					linkPaths += `<path class="link" stroke="${color}" d="${d}" />`;
				});
			} else kids.forEach((cid) => {
				const c = positions[cid];
				if (!c) return;
				const childDepth = depthOf(cid);
				const color = LEVEL_COLORS[Math.min(childDepth - 1, LEVEL_COLORS.length - 1)];
				const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H;
				const x2 = c.x + NODE_W / 2, y2 = c.y;
				const midY = (y1 + y2) / 2;
				const d = `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`;
				linkPaths += `<path class="link" stroke="${color}" d="${d}" />`;
			});
		});
		svg.innerHTML = linkPaths;
		const LEVEL_TYPE_LABEL = {
			1: "Fase",
			2: "Entregable"
		};
		Object.entries(positions).forEach(([id, pos]) => {
			const node = nodes[id];
			const depth = depthOf(id);
			const r = rolled[id];
			const isRoot = id === rootId;
			const color = isRoot ? "#00b6ec" : LEVEL_COLORS[Math.min(depth - 1, LEVEL_COLORS.length - 1)];
			const hasKids = node.children.length > 0;
			const isCollapsed = !!node.collapsed;
			const nodeOrient = node.orientation || "spread";
			const typeLabel = isRoot ? "Proyecto" : LEVEL_TYPE_LABEL[depth] || "Paquete de trabajo";
			const el = document.createElement("div");
			el.className = "node" + (id === selectedId ? " selected" : "") + (isRoot ? " is-root" : "") + (nodeOrient === "stack" ? " orient-stack" : "");
			el.style.left = pos.x + "px";
			el.style.top = pos.y + "px";
			el.dataset.id = id;
			el.draggable = !isRoot;
			if (!isRoot) el.style.borderLeftColor = color;
			el.innerHTML = `
      <span class="code" style="background:${hexA(color, .18)};color:${color}">${codes[id]}</span>
      ${hasKids ? `<span class="orient-flag" title="Esta rama está en orientación ${nodeOrient === "stack" ? "vertical" : "horizontal"}">${nodeOrient === "stack" ? "↕" : "↔"}</span>` : ""}
      ${!r.isLeaf ? `<span class="rollup-flag" title="Valores acumulados de subniveles">Σ</span>` : ""}
      <span class="level-type">${typeLabel}</span>
      <div class="name">${escapeHtml(node.name)}</div>
      <div class="metrics">
        <span>${r.duration} d</span>
        <span><b>${fmtMoney(r.cost)}</b></span>
      </div>
      ${r.start && r.end ? `<div class="date-range">${formatDateRange(r.start, r.end)}</div>` : ""}
      <div class="bar-track"><div class="bar-fill" style="width:${r.percent}%; background:${r.percent >= 100 ? "var(--good)" : color}"></div></div>
      <div class="add-child-btn" title="Agregar subtarea">+</div>
      ${hasKids ? `<div class="collapse-btn${isCollapsed ? " is-collapsed" : ""}" title="${isCollapsed ? "Expandir rama (" + countDescendants(id) + " ocultos)" : "Colapsar rama"}">${isCollapsed ? "+" + countDescendants(id) : "−"}</div>` : ""}
      ${qualityBadgeHtml(id)}
    `;
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				selectNode(id);
			});
			el.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				selectNode(id);
				focusNameField();
			});
			el.querySelector(".add-child-btn").addEventListener("click", (e) => {
				e.stopPropagation();
				selectedId = newNode(id, "Nueva subtarea");
				render();
				focusNameField();
			});
			const collapseBtn = el.querySelector(".collapse-btn");
			if (collapseBtn) collapseBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				node.collapsed = !node.collapsed;
				render();
			});
			if (!isRoot) {
				el.addEventListener("dragstart", (e) => {
					draggedId = id;
					el.classList.add("dragging");
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", id);
				});
				el.addEventListener("dragend", () => {
					el.classList.remove("dragging");
					clearDropTargets();
					draggedId = null;
				});
			}
			el.addEventListener("dragover", (e) => {
				if (!draggedId || !nodes[draggedId] || draggedId === id) return;
				if (isDescendant(draggedId, id)) return;
				e.preventDefault();
				el.classList.add("drop-target");
			});
			el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
			el.addEventListener("drop", (e) => {
				e.preventDefault();
				el.classList.remove("drop-target");
				if (!draggedId || !nodes[draggedId] || draggedId === id || isDescendant(draggedId, id)) return;
				reparent(draggedId, id);
			});
			canvas.appendChild(el);
		});
	}
	function clearDropTargets() {
		document.querySelectorAll(".node.drop-target").forEach((n) => n.classList.remove("drop-target"));
	}
	function reparent(childId, newParentId) {
		const child = nodes[childId];
		const newParent = nodes[newParentId];
		if (!child || !newParent) return;
		const oldParent = nodes[child.parentId];
		if (oldParent) {
			const idx = oldParent.children.indexOf(childId);
			if (idx > -1) oldParent.children.splice(idx, 1);
		}
		child.parentId = newParentId;
		newParent.children.push(childId);
		selectedId = childId;
		render();
		markDirty();
		setStatus(`"${child.name}" reasignado bajo "${newParent.name}"`);
	}
	var SEV_LABEL = {
		riesgo: "Riesgo",
		aviso: "Aviso",
		info: "Sugerencia"
	};
	function worstSeverity(fs) {
		return fs.some((f) => f.severity === "riesgo") ? "riesgo" : fs.some((f) => f.severity === "aviso") ? "aviso" : "info";
	}
	function qualityBadgeHtml(id) {
		const fs = quality.byNode[id];
		if (!fs || !fs.length) return "";
		const tip = fs.map((f) => "• " + f.text).join("\n");
		return `<span class="q-flag q-${worstSeverity(fs)}" title="${escapeAttr(tip)}">${fs.length}</span>`;
	}
	function nodeQualityHtml(id) {
		const fs = quality.byNode[id] || [];
		if (!fs.length) return "";
		return `<div class="q-node"><div class="q-node-h">Hallazgos de este elemento</div><ul>${fs.map((f) => `<li><span class="sv ${f.severity}" title="${SEV_LABEL[f.severity]}">${f.code}</span>${escapeHtml(f.text)}</li>`).join("")}</ul></div>`;
	}
	var qOpenGroups = /* @__PURE__ */ new Set();
	function renderQuality() {
		const box = document.getElementById("qualityBox");
		if (!box) return;
		const q = quality;
		if (q.state === "vacio") {
			box.innerHTML = `<div class="empty-hint">Agrega fases y paquetes para revisar la calidad de la EDT.</div>`;
			return;
		}
		const pill = q.state === "verde" ? ["q-verde", "Sin hallazgos"] : q.state === "ambar" ? ["q-ambar", "Con avisos"] : ["q-rojo", "Con riesgos"];
		const c = q.counts;
		const parts = [
			c.riesgo ? c.riesgo + (c.riesgo === 1 ? " riesgo" : " riesgos") : "",
			c.aviso ? c.aviso + (c.aviso === 1 ? " aviso" : " avisos") : "",
			c.info ? c.info + (c.info === 1 ? " sugerencia" : " sugerencias") : ""
		].filter(Boolean);
		const d = q.dictionary;
		box.innerHTML = `
    <div class="q-head"><span class="q-pill ${pill[0]}">${pill[1]}</span><span class="q-counts">${parts.join(" · ") || "estructura, diccionario y tamaño en regla"}</span></div>
    <div class="q-dict" title="Un paquete tiene el diccionario completo si trae descripción del trabajo, criterio de aceptación y responsable.">
      <div class="q-dict-l"><span>Diccionario completo</span><b>${d.complete}/${d.total} paquetes · ${d.pct} %</b></div>
      <div class="q-dict-bar"><div style="width:${d.pct}%"></div></div>
    </div>
    ${q.groups.map((g) => `
      <details class="q-group" data-code="${g.code}"${qOpenGroups.has(g.code) ? " open" : ""}>
        <summary><span class="sv ${g.severity}" title="${SEV_LABEL[g.severity]}">${g.code}</span><span class="q-title">${escapeHtml(g.title)}</span><b class="q-n">${g.items.length}</b></summary>
        <div class="q-why">${escapeHtml(g.hint)}</div>
        <ul>${g.items.map((f) => `<li><button class="q-item" data-id="${escapeAttr(f.nodeId)}" title="Ir a este elemento"><span class="q-code">${escapeHtml(f.nodeCode)}</span>${escapeHtml(f.text)}</button></li>`).join("")}</ul>
      </details>`).join("")}`;
		box.querySelectorAll("details.q-group").forEach((det) => {
			det.addEventListener("toggle", () => {
				const code = det.dataset.code;
				if (det.open) qOpenGroups.add(code);
				else qOpenGroups.delete(code);
			});
		});
		box.querySelectorAll(".q-item").forEach((b) => b.addEventListener("click", () => goToNode(b.dataset.id)));
	}
	function goToNode(id) {
		if (!nodes[id]) return;
		let p = nodes[id].parentId;
		const seen = /* @__PURE__ */ new Set();
		while (p && nodes[p] && !seen.has(p)) {
			seen.add(p);
			nodes[p].collapsed = false;
			p = nodes[p].parentId;
		}
		selectedId = id;
		render();
		if (currentView === "tree") {
			const el = Array.from(document.querySelectorAll("#canvas .node")).find((n) => n.dataset.id === id);
			if (el && el.scrollIntoView) el.scrollIntoView({
				block: "center",
				inline: "center"
			});
		}
	}
	function renderTable(rolled, codes) {
		const wrap = document.getElementById("tableView");
		const rows = [];
		function walk(id, depth) {
			if (id !== rootId) rows.push({
				id,
				depth
			});
			nodes[id].children.forEach((cid) => walk(cid, depth + 1));
		}
		walk(rootId, 0);
		let html = `<table class="wbs-table">
    <thead><tr>
      <th style="width:80px;">Código EDT</th>
      <th>Paquete de trabajo</th>
      <th style="width:70px;">Nivel</th>
      <th style="width:90px;">Duración</th>
      <th style="width:90px;">Inicio</th>
      <th style="width:90px;">Fin</th>
      <th style="width:110px;">Costo</th>
      <th style="width:120px;">Responsable</th>
      <th style="width:120px;">Avance</th>
      <th style="width:70px;">Calidad</th>
      <th style="min-width:200px;">Descripción del trabajo</th>
      <th style="min-width:200px;">Criterio de aceptación</th>
    </tr></thead><tbody>`;
		rows.forEach(({ id, depth }) => {
			const node = nodes[id];
			const r = rolled[id];
			const color = LEVEL_COLORS[Math.min(depth - 1, LEVEL_COLORS.length - 1)];
			html += `<tr>
      <td><span class="code-chip" style="background:${hexA(color, .18)};color:${color}">${codes[id]}</span></td>
      <td><div class="indent-name" style="padding-left:${(depth - 1) * 18}px;">${r.isLeaf ? "" : "📁"} ${escapeHtml(node.name)}</div></td>
      <td>${depth}</td>
      <td>${r.duration} d</td>
      <td>${formatDateShort(r.start) || "—"}</td>
      <td>${formatDateShort(r.end) || "—"}</td>
      <td>${fmtMoney(r.cost)}</td>
      <td>${escapeHtml(node.resource || "—")}</td>
      <td>${r.percent}%</td>
      <td>${qualityBadgeHtml(id) || "—"}</td>
      <td class="dict-txt">${node.notes ? escapeHtml(node.notes) : "—"}${node.loe ? ` <span class="loe-tag" title="Esfuerzo continuo (LOE): exento de las reglas de duración y de concentración de costo">LOE</span>` : ""}</td>
      <td class="dict-txt">${node.acceptance ? escapeHtml(node.acceptance) : "—"}</td>
    </tr>`;
		});
		html += "</tbody></table>";
		wrap.innerHTML = html;
	}
	function renderProps(rolledAll) {
		const panel = document.getElementById("propsPanel");
		if (!selectedId || !nodes[selectedId]) {
			panel.innerHTML = `<div class="empty-hint">Selecciona un nodo del diagrama para editar sus propiedades.</div>`;
			return;
		}
		const node = nodes[selectedId];
		const isRoot = selectedId === rootId;
		const rolled = rolledAll[selectedId];
		const isLeaf = rolled.isLeaf;
		const cpmLocked = cpmLocksDates(node);
		const costLocked = costEstimateLocksCost(node);
		const costEditable = isLeaf && !costLocked;
		const hasDates = isLeaf && !cpmLocked && daysBetween(node.start, node.end) != null;
		const durationEditable = isLeaf && !cpmLocked && !hasDates;
		const datesEditable = isLeaf && !cpmLocked;
		const obsOptions = gpiObsModule && window.GPI && window.GPI.util ? window.GPI.util.obsNodes(gpiObsModule) : [];
		panel.innerHTML = `
    <div class="field">
      <label>Nombre del paquete</label>
      <input id="f_name" value="${escapeAttr(node.name)}" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Fecha inicio</label>
        <input id="f_start" type="date" value="${(isLeaf ? node.start : rolled.start) || ""}" ${datesEditable ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Fecha fin</label>
        <input id="f_end" type="date" value="${(isLeaf ? node.end : rolled.end) || ""}" ${datesEditable ? "" : "disabled"} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Duración (días)</label>
        <input id="f_duration" type="number" min="0" value="${rolled.duration}" ${durationEditable ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Costo (S/)</label>
        <input id="f_cost" type="number" min="0" value="${isLeaf ? node.cost : rolled.cost}" ${costEditable ? "" : "disabled"} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>% Avance</label>
        <input id="f_percent" type="number" min="0" max="100" value="${isLeaf ? node.percent : rolled.percent}" ${isLeaf ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Responsable</label>
        ${raciLocksResource(node) ? `<input id="f_resource" value="${escapeAttr(node.resource)}" disabled title="Definido por la Matriz RACI" />` : resourceFieldHtml(node, obsOptions)}
      </div>
    </div>
    ${raciLocksResource(node) ? `<div class="empty-hint">🔗 <b>Definido en la Matriz RACI</b> a partir del "R" (Responsable) asignado a este paquete. Para cambiarlo, abre <a href="RACI_Matrix.html" style="color:var(--cyan-dark); font-weight:700;">Matriz RACI ▸</a></div>` : !obsOptions.length ? `<div class="empty-hint">⚠ <b>Aún no existe la OBS de este proyecto.</b> Créala primero en <a href="OBS_Builder.html" style="color:var(--cyan-dark); font-weight:700;">OBS Builder ▸</a> para poder asignar responsables desde una lista.</div>` : isLeaf ? `<div class="empty-hint">Sugerencia: define el responsable en la <a href="RACI_Matrix.html" style="color:var(--cyan-dark); font-weight:700;">Matriz RACI ▸</a> (rol "R") en vez de elegirlo aquí — así queda formalmente registrado en la RAM del proyecto.</div>` : ""}
    <div class="field">
      <label>Descripción del trabajo</label>
      <textarea id="f_notes" placeholder="${isRoot ? "" : "Qué trabajo incluye este elemento (y qué no)"}">${escapeHtml(node.notes || "")}</textarea>
    </div>
    ${isRoot ? "" : `<div class="field">
      <label>Criterio de aceptación</label>
      <textarea id="f_accept" placeholder="Cómo se comprueba que está terminado">${escapeHtml(node.acceptance || "")}</textarea>
    </div>`}
    ${isLeaf && !isRoot ? `<label class="chk" title="Gestión, seguimiento y otro trabajo que dura lo que dura el proyecto: queda exento de las reglas de duración máxima y de concentración de costo."><input type="checkbox" id="f_loe" ${node.loe ? "checked" : ""}> Esfuerzo continuo (LOE)</label>` : ""}
    ${costLocked ? `<div class="empty-hint">🔗 <b>Tomado de Estimar los Costos</b> (suma del Subtotal de todas sus actividades). Para cambiarlo, abre <a href="Estimar_Costos.html" style="color:var(--cyan-dark); font-weight:700;">Estimar los Costos ▸</a></div>` : isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Este costo se ingresa aquí (bottom-up) hasta que <a href="Estimar_Costos.html" style="color:var(--cyan-dark); font-weight:700;">Estimar los Costos ▸</a> calcule uno real para este paquete.</div>` : ""}
    ${cpmLocked ? `<div class="empty-hint">🔗 <b>Tomado del Cronograma (CPM)</b> a partir de las actividades y la ruta crítica calculadas para este paquete. Para cambiarlo, abre <a href="Cronograma_CPM.html" style="color:var(--cyan-dark); font-weight:700;">Cronograma CPM ▸</a></div>` : hasDates ? `<div class="empty-hint">📐 <b>Estimado.</b> Duración calculada automáticamente a partir de las fechas (${rolled.duration} d). Borra alguna fecha para editarla manualmente.</div>` : isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Cuando definas las actividades de este paquete y calcules la ruta crítica en <a href="Cronograma_CPM.html" style="color:var(--cyan-dark); font-weight:700;">Cronograma CPM ▸</a>, la fecha real se toma automáticamente de ahí.</div>` : ""}
    ${!isLeaf ? `<div class="empty-hint">Este paquete agrupa subtareas: el costo se suma (estimación bottom-up), pero <b>la duración se calcula como el tramo entre el inicio más temprano y el fin más tardío</b> de sus subtareas — no la suma, porque pueden ejecutarse en paralelo.</div>` : ""}
    <div id="nodeQuality">${nodeQualityHtml(selectedId)}</div>
    ${!isRoot ? `<div class="danger-zone"><button class="btn danger" id="f_delete" style="width:100%;">🗑 Eliminar este nodo y sus subtareas</button></div>` : ""}
  `;
		const bind = (id, key, isNum) => {
			const el = document.getElementById(id);
			if (!el) return;
			el.addEventListener("input", () => {
				node[key] = isNum ? parseFloat(el.value) || 0 : el.value;
				refreshValues();
				markDirty();
			});
		};
		bind("f_name", "name", false);
		if (costEditable) bind("f_cost", "cost", true);
		bind("f_percent", "percent", true);
		if (!raciLocksResource(node) && obsOptions.length) bind("f_resource", "resource", false);
		bind("f_notes", "notes", false);
		bind("f_accept", "acceptance", false);
		const loeEl = document.getElementById("f_loe");
		if (loeEl) loeEl.addEventListener("change", () => {
			if (loeEl.checked) node.loe = true;
			else delete node.loe;
			refreshValues();
			markDirty();
		});
		if (durationEditable) bind("f_duration", "duration", true);
		const bindDate = (id, key) => {
			const el = document.getElementById(id);
			if (!el || !datesEditable) return;
			el.addEventListener("change", () => {
				node[key] = el.value;
				render();
				markDirty();
			});
		};
		bindDate("f_start", "start");
		bindDate("f_end", "end");
		const delBtn = document.getElementById("f_delete");
		if (delBtn) delBtn.addEventListener("click", async () => {
			if (await showConfirm(`¿Eliminar "${node.name}" y todas sus subtareas?`)) {
				deleteSubtree(selectedId);
				selectedId = rootId;
				render();
				markDirty();
			}
		});
	}
	function focusNameField() {
		setTimeout(() => {
			const el = document.getElementById("f_name");
			if (el) {
				el.focus();
				el.select();
			}
		}, 30);
	}
	function renderStats(rolled) {
		const total = rolled[rootId];
		let leafCount = 0, maxDepth = 0;
		Object.keys(nodes).forEach((id) => {
			if (id !== rootId) {
				if (nodes[id].children.length === 0) leafCount++;
				maxDepth = Math.max(maxDepth, depthOf(id));
			}
		});
		const grid = document.getElementById("statGrid");
		grid.innerHTML = `
    <div class="stat"><div class="v">${fmtMoney(total.cost)}</div><div class="l">Costo total</div></div>
    <div class="stat"><div class="v">${total.duration} d</div><div class="l">Duración total</div></div>
    <div class="stat"><div class="v">${leafCount}</div><div class="l">Paquetes de trabajo</div></div>
    <div class="stat"><div class="v">${total.percent}%</div><div class="l">Avance global</div></div>
  `;
	}
	function renderLegend() {
		const box = document.getElementById("legendBox");
		let maxDepth = 0;
		Object.keys(nodes).forEach((id) => {
			maxDepth = Math.max(maxDepth, depthOf(id));
		});
		let html = `<div class="legend-item"><span class="legend-dot" style="background:#00b6ec"></span> Nivel 0 — Proyecto</div>`;
		for (let i = 1; i <= Math.max(maxDepth, 2); i++) {
			const c = LEVEL_COLORS[Math.min(i - 1, LEVEL_COLORS.length - 1)];
			html += `<div class="legend-item"><span class="legend-dot" style="background:${c}"></span> Nivel ${i}${i === 1 ? " — Fase" : i === 2 ? " — Entregable" : " — Paquete de trabajo"}</div>`;
		}
		box.innerHTML = html;
	}
	function raciLocksResource(node) {
		if (!node || node.children.length > 0) return false;
		if (!gpiRaciModule || !window.GPI || !window.GPI.util) return false;
		return window.GPI.util.raciResponsibleIds(gpiRaciModule, node.id).length > 0;
	}
	function cpmLocksDates(node) {
		if (!node || node.children.length > 0) return false;
		return scheduleLockedLeafIds.has(node.id);
	}
	function costEstimateLocksCost(node) {
		if (!node || node.children.length > 0) return false;
		return costEstimateLockedLeafIds.has(node.id);
	}
	function obsOptionLabel(o) {
		return o.person && o.person.trim() ? `${o.role} — ${o.person}` : o.role || o.person || "";
	}
	function resourceFieldHtml(node, options) {
		if (!options.length) return `<input id="f_resource" value="${escapeAttr(node.resource)}" disabled title="Crea primero la OBS del proyecto" placeholder="— Crea la OBS primero —" />`;
		const current = node.resource || "";
		const known = options.some((o) => obsOptionLabel(o) === current);
		let opts = `<option value="">— Selecciona del OBS —</option>`;
		if (current && !known) opts += `<option value="${escapeAttr(current)}" selected>⚠ (valor anterior) ${escapeHtml(current)}</option>`;
		opts += options.map((o) => {
			const label = obsOptionLabel(o);
			return `<option value="${escapeAttr(label)}"${label === current ? " selected" : ""}>${escapeHtml(label)}</option>`;
		}).join("");
		return `<select id="f_resource">${opts}</select>`;
	}
	function escapeHtml(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	function escapeAttr(s) {
		return escapeHtml(s);
	}
	function hexA(hex, alpha) {
		const h = hex.replace("#", "");
		return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${alpha})`;
	}
	function setStatus(msg) {
		document.getElementById("statusLeft").textContent = msg;
	}
	function showModal({ title, message, confirmText, cancelText, danger }) {
		return new Promise((resolve) => {
			const overlay = document.getElementById("modalOverlay");
			const confirmBtn = document.getElementById("modalConfirmBtn");
			const cancelBtn = document.getElementById("modalCancelBtn");
			document.getElementById("modalTitle").textContent = title || "Confirmar";
			document.getElementById("modalMessage").textContent = message || "";
			confirmBtn.textContent = confirmText || "Aceptar";
			confirmBtn.className = "btn" + (danger ? " danger" : " primary");
			cancelBtn.style.display = cancelText === null ? "none" : "";
			cancelBtn.textContent = cancelText || "Cancelar";
			const cleanup = (result) => {
				overlay.classList.remove("open");
				confirmBtn.onclick = null;
				cancelBtn.onclick = null;
				overlay.onclick = null;
				document.removeEventListener("keydown", onKey);
				resolve(result);
			};
			const onKey = (e) => {
				if (e.key === "Escape") {
					cleanup(false);
					return;
				}
				if (e.key === "Enter") {
					cleanup(true);
					return;
				}
				if (e.key !== "Tab") return;
				const card = overlay.querySelector(".modal-card");
				const f = Array.from(card.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])")).filter((el) => el.offsetParent !== null);
				if (!f.length) return;
				const first = f[0], last = f[f.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			};
			confirmBtn.onclick = () => cleanup(true);
			cancelBtn.onclick = () => cleanup(false);
			overlay.onclick = (e) => {
				if (e.target === overlay) cleanup(false);
			};
			document.addEventListener("keydown", onKey);
			overlay.classList.add("open");
			confirmBtn.focus();
		});
	}
	function showConfirm(message, title) {
		return showModal({
			title: title || "Confirmar acción",
			message,
			confirmText: "Eliminar",
			cancelText: "Cancelar",
			danger: true
		});
	}
	function showAlert(message, title) {
		return showModal({
			title: title || "Aviso",
			message,
			confirmText: "Entendido",
			cancelText: null,
			danger: false
		});
	}
	function xmlEsc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	var TEMPLATE_HEADERS = [
		"Código EDT",
		"Paquete de trabajo",
		"Nivel",
		"Duración",
		"Inicio",
		"Fin",
		"Costo",
		"Responsable",
		"Avance"
	];
	var DATA_SHEET_NAME = "WBS";
	function xlsxStylesXml() {
		const xfs = [
			"<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/>",
			"<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/></xf>",
			"<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\"/></xf>",
			"<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyNumberFormat=\"1\" applyAlignment=\"1\"><alignment horizontal=\"right\"/></xf>",
			"<xf numFmtId=\"0\" fontId=\"3\" fillId=\"0\" borderId=\"0\" applyFont=\"1\" applyAlignment=\"1\"><alignment vertical=\"top\" wrapText=\"1\"/></xf>"
		];
		for (let i = 0; i < 10; i++) xfs.push("<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"left\" indent=\"" + i + "\"/></xf>");
		for (let i = 0; i < 10; i++) xfs.push("<xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" applyFont=\"1\" applyAlignment=\"1\"><alignment horizontal=\"left\" indent=\"" + i + "\"/></xf>");
		xfs.push("<xf numFmtId=\"0\" fontId=\"2\" fillId=\"3\" borderId=\"0\" applyFont=\"1\" applyFill=\"1\"/>");
		return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"#,##0.00\"/></numFmts><fonts count=\"4\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"12\"/><name val=\"Calibri\"/></font><font><i/><sz val=\"10\"/><color rgb=\"FF4D5768\"/><name val=\"Calibri\"/></font></fonts><fills count=\"4\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFDDEBF7\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFE8F6FC\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style=\"thin\"><color rgb=\"FFB9C6D2\"/></left><right style=\"thin\"><color rgb=\"FFB9C6D2\"/></right><top style=\"thin\"><color rgb=\"FFB9C6D2\"/></top><bottom style=\"thin\"><color rgb=\"FFB9C6D2\"/></bottom><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"" + xfs.length + "\">" + xfs.join("") + "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";
	}
	function xlsxSheetXml(rows, widths, freezeTop) {
		const COLS = "ABCDEFGHIJ";
		const cols = widths.map((w, i) => "<col min=\"" + (i + 1) + "\" max=\"" + (i + 1) + "\" width=\"" + w + "\" customWidth=\"1\"/>").join("");
		const body = rows.map((cells, ri) => {
			const cs = cells.map((c, ci) => {
				if (c == null || c.v === "" || c.v == null) return "";
				const ref = COLS[ci] + (ri + 1), st = c.s ? " s=\"" + c.s + "\"" : "";
				if (c.t === "n") return "<c r=\"" + ref + "\"" + st + "><v>" + c.v + "</v></c>";
				return "<c r=\"" + ref + "\"" + st + " t=\"inlineStr\"><is><t xml:space=\"preserve\">" + xmlEsc(c.v) + "</t></is></c>";
			}).join("");
			return "<row r=\"" + (ri + 1) + "\">" + cs + "</row>";
		}).join("");
		return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" + (freezeTop ? "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>" : "") + "<cols>" + cols + "</cols><sheetData>" + body + "</sheetData></worksheet>";
	}
	function exportRowModel() {
		const codes = computeCodes();
		const rolled = computeRollup();
		const out = [TEMPLATE_HEADERS.map((h) => ({
			v: h,
			t: "s",
			s: 1
		}))];
		const rows = [];
		function walk(id, depth) {
			if (id !== rootId) rows.push({
				id,
				depth
			});
			nodes[id].children.forEach((cid) => walk(cid, depth + 1));
		}
		walk(rootId, 0);
		rows.forEach(({ id, depth }) => {
			const node = nodes[id], r = rolled[id];
			out.push([
				{
					v: codes[id],
					t: "s",
					s: 2
				},
				{
					v: node.name || "",
					t: "s",
					s: 0
				},
				{
					v: depth,
					t: "n"
				},
				{
					v: r.duration,
					t: "n"
				},
				r.start ? {
					v: r.start,
					t: "s",
					s: 0
				} : null,
				r.end ? {
					v: r.end,
					t: "s",
					s: 0
				} : null,
				{
					v: r.cost,
					t: "n",
					s: 3
				},
				node.resource ? {
					v: node.resource,
					t: "s",
					s: 0
				} : null,
				{
					v: r.percent,
					t: "n"
				}
			]);
		});
		return out;
	}
	function templateInstructions() {
		return [
			["Cómo completar este archivo", 25],
			["", 0],
			["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “WBS” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan, para no mezclar datos de otro módulo por error.", 4],
			["1. Cada fila es un nodo de la EDT (una fase o un paquete de trabajo). La jerarquía se reconstruye ÚNICAMENTE a partir de la columna “Código EDT” (1, 1.1, 1.1.1…) -- no hace falta ninguna columna de “padre”: quitando el último segmento del código de una fila debe quedar el código de OTRA fila del archivo (o nada, si es de primer nivel). Puedes reordenar las filas libremente: se reordenan solas por código al importar.", 4],
			["2. La columna “Nivel” es de solo referencia (se recalcula del propio Código EDT): no hace falta completarla ni editarla.", 4],
			["3. “Duración”, “Inicio”, “Fin”, “Costo” y “Avance” solo se aplican en las filas que son PAQUETES (las que no tienen ninguna fila hija debajo, con un código un nivel más profundo): en una FASE (con paquetes debajo), esas mismas columnas muestran un resumen calculado de sus paquetes -- se recalcula solo al importar, lo que hayas escrito ahí se ignora.", 4],
			["3b. Si completas “Inicio” y “Fin” de un paquete, la Duración se calcula sola a partir de esas fechas (igual que en pantalla, formato AAAA-MM-DD); si dejas las fechas en blanco, se usa el número que pongas en “Duración”.", 4],
			["4. Si el Cronograma CPM, la Matriz RACI o Estimar los Costos ya fijan la fecha, el responsable o el costo de un paquete, ese valor se sobrescribe de nuevo en la próxima sincronización con esos módulos -- lo que importes aquí no lo anula de forma permanente.", 4],
			["5. Un Código EDT que ya existía en la EDT actual conserva su mismo identificador interno al importar (no pierde sus enlaces con RACI, Definir las Actividades, etc.); un Código EDT nuevo en el archivo crea un nodo nuevo; un Código EDT que YA NO aparece en el archivo se elimina -- igual que si lo borraras a mano.", 4],
			["6. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
			["7. Guarda el archivo y vuelve a “WBS Builder” > botón “⇧ Importar desde Excel” para subirlo.", 4],
			["", 0],
			["8. Este mismo archivo se puede volver a generar en cualquier momento con “⇩ Exportar a Excel”: reproduce exactamente la EDT actual, útil como plantilla y como respaldo.", 4],
			["", 0],
			["Generado por el simulador GPI — módulo WBS Builder.", 4]
		].map((row) => [{
			v: row[0],
			t: "s",
			s: row[1] === 25 ? 25 : 4
		}]);
	}
	async function buildWbsXlsxBlob() {
		const zip = new window.JSZip();
		zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
		zip.file("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
		zip.file("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"WBS\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Instrucciones\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
		zip.file("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
		zip.file("xl/styles.xml", xlsxStylesXml());
		zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(exportRowModel(), [
			12,
			34,
			8,
			10,
			11,
			11,
			12,
			20,
			10
		], true));
		zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
		return zip.generateAsync({
			type: "blob",
			mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		});
	}
	function buildWbsCsv() {
		function cell(v) {
			const s = String(v == null ? "" : v);
			return /[";\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
		}
		const codes = computeCodes(), rolled = computeRollup();
		const lines = [TEMPLATE_HEADERS.join(";")];
		const rows = [];
		function walk(id, depth) {
			if (id !== rootId) rows.push({
				id,
				depth
			});
			nodes[id].children.forEach((cid) => walk(cid, depth + 1));
		}
		walk(rootId, 0);
		rows.forEach(({ id, depth }) => {
			const node = nodes[id], r = rolled[id];
			lines.push([
				cell(codes[id]),
				cell(node.name || ""),
				cell(depth),
				cell(r.duration),
				cell(r.start || ""),
				cell(r.end || ""),
				cell(r.cost),
				cell(node.resource || ""),
				cell(r.percent)
			].join(";"));
		});
		return lines.join("\r\n");
	}
	function downloadBlob(blob, filename) {
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}
	async function downloadWbsExcel() {
		const safe = (document.getElementById("projectTitle").value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		if (window.JSZip) try {
			downloadBlob(await buildWbsXlsxBlob(), "wbs_" + safe + ".xlsx");
			setStatus("Archivo exportado. Complétalo o revísalo en Excel/MS Project y vuelve a subirlo con «⇧ Importar desde Excel».");
			return;
		} catch (_) {}
		downloadBlob(new Blob(["﻿" + buildWbsCsv()], { type: "text/csv;charset=utf-8" }), "wbs_" + safe + ".csv");
		setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): descargué un CSV equivalente.");
	}
	function colIndexFromRef(ref) {
		const m = /^([A-Z]+)/.exec(ref);
		if (!m) return 0;
		let n = 0;
		for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
		return n - 1;
	}
	async function resolveDataSheetPath(zip, expectedName) {
		const wbEntry = zip.file("xl/workbook.xml");
		if (!wbEntry) return { kind: "invalid" };
		const doc = new DOMParser().parseFromString(await wbEntry.async("string"), "application/xml");
		const sheets = Array.from(doc.getElementsByTagName("sheet"));
		const wanted = normalizeHeader(expectedName);
		const sheetEl = sheets.find((s) => normalizeHeader(s.getAttribute("name") || "") === wanted);
		if (!sheetEl) return {
			kind: "not-found",
			sheetNames: sheets.map((s) => s.getAttribute("name") || "").filter(Boolean)
		};
		const rId = sheetEl.getAttribute("r:id");
		const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
		if (!rId || !relsEntry) return { kind: "invalid" };
		const relsDoc = new DOMParser().parseFromString(await relsEntry.async("string"), "application/xml");
		const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rId);
		const target = rel ? rel.getAttribute("Target") || "" : "";
		if (!target) return { kind: "invalid" };
		return {
			kind: "found",
			path: target.startsWith("/") ? target.slice(1) : "xl/" + target
		};
	}
	async function loadSharedStrings(zip) {
		const entry = zip.file("xl/sharedStrings.xml");
		if (!entry) return [];
		const doc = new DOMParser().parseFromString(await entry.async("string"), "application/xml");
		return Array.from(doc.getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join(""));
	}
	function parseSheetRows(xmlText, sharedStrings) {
		const doc = new DOMParser().parseFromString(xmlText, "application/xml");
		return Array.from(doc.getElementsByTagName("row")).map((rowEl) => {
			const row = [];
			Array.from(rowEl.getElementsByTagName("c")).forEach((c) => {
				const idx = colIndexFromRef(c.getAttribute("r") || "");
				const t = c.getAttribute("t");
				let val;
				if (t === "inlineStr") {
					const isEl = c.getElementsByTagName("is")[0];
					const tEl = isEl ? isEl.getElementsByTagName("t")[0] : null;
					val = tEl ? tEl.textContent || "" : "";
				} else {
					const vEl = c.getElementsByTagName("v")[0];
					const raw = vEl ? vEl.textContent || "" : "";
					val = t === "s" ? sharedStrings[Number(raw)] || "" : raw;
				}
				row[idx] = val;
			});
			for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = "";
			return row;
		});
	}
	async function parseWbsXlsx(file) {
		const buf = await file.arrayBuffer();
		const zip = await window.JSZip.loadAsync(buf);
		const resolution = await resolveDataSheetPath(zip, DATA_SHEET_NAME);
		if (resolution.kind === "invalid") return { kind: "empty" };
		if (resolution.kind === "not-found") return {
			kind: "sheet-not-found",
			sheetNames: resolution.sheetNames
		};
		const sheetEntry = zip.file(resolution.path);
		if (!sheetEntry) return { kind: "empty" };
		const [sheetXml, sharedStrings] = await Promise.all([sheetEntry.async("string"), loadSharedStrings(zip)]);
		const allRows = parseSheetRows(sheetXml, sharedStrings);
		if (!allRows.length) return { kind: "empty" };
		return {
			kind: "ok",
			headers: allRows[0],
			rows: allRows.slice(1)
		};
	}
	var TEMPLATE_HEADER_FIELDS = [
		"code",
		"name",
		null,
		"duration",
		"start",
		"end",
		"cost",
		"resource",
		"percent"
	];
	function normalizeHeader(s) {
		return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	}
	var HEADER_FIELD_BY_TEXT = {};
	TEMPLATE_HEADERS.forEach((h, i) => {
		const field = TEMPLATE_HEADER_FIELDS[i];
		if (field) HEADER_FIELD_BY_TEXT[normalizeHeader(h)] = field;
	});
	function mapHeaderColumns(headerRow) {
		const map = {};
		headerRow.forEach((h, idx) => {
			const field = HEADER_FIELD_BY_TEXT[normalizeHeader(h)];
			if (field) map[field] = idx;
		});
		if (map.code == null || map.name == null) return null;
		return map;
	}
	function parseNumOrZero(s) {
		const n = Number(String(s == null ? "" : s).trim().replace(/[^\d.-]/g, ""));
		return isFinite(n) ? n : 0;
	}
	var WBS_CODE_RE = /^\d+(\.\d+)*$/;
	function analyzeWbsRows(rows, colMap) {
		const seen = {};
		const invalidCodes = [];
		const duplicateCodes = [];
		const blankNames = [];
		const parsedAll = [];
		rows.forEach((row) => {
			const codeRaw = (row[colMap.code] || "").trim();
			const name = (row[colMap.name] || "").trim();
			if (!codeRaw && !name) return;
			if (!WBS_CODE_RE.test(codeRaw)) {
				invalidCodes.push(codeRaw || "(vacío)");
				return;
			}
			if (seen[codeRaw]) {
				duplicateCodes.push(codeRaw);
				return;
			}
			seen[codeRaw] = true;
			if (!name) {
				blankNames.push(codeRaw);
				return;
			}
			parsedAll.push({
				code: codeRaw,
				segs: codeRaw.split(".").map(Number),
				name,
				duration: colMap.duration != null ? row[colMap.duration] || "" : "",
				start: colMap.start != null ? row[colMap.start] || "" : "",
				end: colMap.end != null ? row[colMap.end] || "" : "",
				cost: colMap.cost != null ? row[colMap.cost] || "" : "",
				resource: colMap.resource != null ? row[colMap.resource] || "" : "",
				percent: colMap.percent != null ? row[colMap.percent] || "" : ""
			});
		});
		parsedAll.sort((a, b) => {
			const n = Math.max(a.segs.length, b.segs.length);
			for (let i = 0; i < n; i++) {
				const d = (a.segs[i] || 0) - (b.segs[i] || 0);
				if (d) return d;
			}
			return 0;
		});
		const placedSet = {};
		const orphanCodes = [];
		const placed = [];
		parsedAll.forEach((p) => {
			const parentCode = p.segs.slice(0, -1).join(".");
			if (parentCode && !placedSet[parentCode]) {
				orphanCodes.push(p.code);
				return;
			}
			placedSet[p.code] = true;
			placed.push(p);
		});
		return {
			placed,
			invalidCodes,
			duplicateCodes,
			blankNames,
			orphanCodes
		};
	}
	function applyWbsRows(placed) {
		const placedCodes = placed.map((p) => p.code);
		function isLeaf(code) {
			return !placedCodes.some((c) => c !== code && c.startsWith(code + "."));
		}
		const oldCodeOf = computeCodes();
		const oldIdByCode = {};
		Object.keys(oldCodeOf).forEach((id) => {
			oldIdByCode[oldCodeOf[id]] = id;
		});
		const oldNodes = nodes;
		const prevRoot = oldNodes[rootId];
		nodes = {};
		const newRootId = oldIdByCode["0"] || uid();
		nodes[newRootId] = {
			id: newRootId,
			parentId: null,
			name: prevRoot && prevRoot.name || "Proyecto sin título",
			duration: 0,
			cost: 0,
			resource: prevRoot && prevRoot.resource || "",
			percent: 0,
			start: "",
			end: "",
			notes: prevRoot && prevRoot.notes || "",
			children: [],
			collapsed: false,
			orientation: prevRoot && prevRoot.orientation || "spread"
		};
		rootId = newRootId;
		const idByCode = { "0": newRootId };
		placed.forEach((p) => {
			const parentCode = p.segs.slice(0, -1).join(".") || "0";
			const parentId = idByCode[parentCode];
			if (!parentId) return;
			const leaf = isLeaf(p.code);
			const reusedId = oldIdByCode[p.code];
			const id = reusedId || uid();
			const prev = reusedId ? oldNodes[reusedId] : null;
			nodes[id] = {
				id,
				parentId,
				name: p.name,
				duration: leaf ? parseNumOrZero(p.duration) : 0,
				cost: leaf ? parseNumOrZero(p.cost) : 0,
				resource: (p.resource || "").trim(),
				percent: leaf ? Math.max(0, Math.min(100, parseNumOrZero(p.percent))) : 0,
				start: leaf ? p.start.trim() : "",
				end: leaf ? p.end.trim() : "",
				notes: prev && prev.notes || "",
				acceptance: prev && prev.acceptance || "",
				children: [],
				collapsed: false,
				orientation: prev && prev.orientation || "spread",
				delId: prev ? prev.delId : void 0
			};
			if (prev && prev.loe && leaf) nodes[id].loe = true;
			nodes[parentId].children.push(id);
			idByCode[p.code] = id;
		});
		selectedId = rootId;
	}
	async function importWbsExcel(file) {
		if (!window.JSZip) {
			await showAlert("No se pudo cargar la librería para leer archivos .xlsx (JSZip). Recargá la página e intentá de nuevo; este archivo no llegó a leerse, no es que el .xlsx esté mal.");
			return;
		}
		let parsed;
		try {
			parsed = await parseWbsXlsx(file);
		} catch (_) {
			await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
			return;
		}
		if (parsed.kind === "sheet-not-found") {
			const otras = parsed.sheetNames.filter((n) => normalizeHeader(n) !== normalizeHeader(DATA_SHEET_NAME));
			await showAlert("No encontré una hoja llamada «WBS» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con la EDT debe llamarse exactamente «WBS» (como la que genera «⇩ Exportar a Excel» aquí) para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
			return;
		}
		if (parsed.kind === "empty") {
			await showAlert("El archivo no contiene datos reconocibles.");
			return;
		}
		const colMap = mapHeaderColumns(parsed.headers);
		if (!colMap) {
			await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna columna, p. ej. «EDT» en vez de «Código EDT»?). Se esperan al menos «Código EDT» y «Paquete de trabajo» escritas tal cual.");
			return;
		}
		const result = analyzeWbsRows(parsed.rows, colMap);
		if (!result.placed.length) {
			await showAlert("El archivo no tiene ninguna fila con un «Código EDT» válido y ubicable (formato esperado: números separados por puntos, p. ej. 1, 1.2, 1.2.3 -- y el código de un nivel menos debe ser también una fila del archivo). No se modificó la EDT actual.");
			return;
		}
		let msg = "Se reemplazará la EDT actual (" + (Object.keys(nodes).length - 1) + " nodo(s)) por " + result.placed.length + " nodo(s) importado(s) del archivo. Fases y paquetes se reconstruyen a partir del Código EDT; los que ya existían conservan sus enlaces con RACI/Actividades/Costos.";
		if (result.invalidCodes.length) msg += " " + result.invalidCodes.length + " fila(s) con Código EDT inválido se ignoraron: " + result.invalidCodes.slice(0, 8).join(", ") + (result.invalidCodes.length > 8 ? "…" : "") + ".";
		if (result.duplicateCodes.length) msg += " " + result.duplicateCodes.length + " fila(s) con Código EDT repetido se ignoraron (se usó la primera aparición): " + result.duplicateCodes.slice(0, 8).join(", ") + (result.duplicateCodes.length > 8 ? "…" : "") + ".";
		if (result.blankNames.length) msg += " " + result.blankNames.length + " fila(s) sin «Paquete de trabajo» se ignoraron: " + result.blankNames.slice(0, 8).join(", ") + (result.blankNames.length > 8 ? "…" : "") + ".";
		if (result.orphanCodes.length) msg += " " + result.orphanCodes.length + " fila(s) no se pudieron ubicar porque su código padre no aparece (o tampoco se pudo ubicar) en el archivo: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
		if (!await showConfirm(msg, "Importar EDT desde Excel")) return;
		applyWbsRows(result.placed);
		render();
		setTimeout(fitToScreen, 50);
		markDirty();
		const issues = result.invalidCodes.length + result.duplicateCodes.length + result.blankNames.length + result.orphanCodes.length;
		setStatus(result.placed.length + " nodo(s) importado(s) desde Excel" + (issues ? " · " + issues + " fila(s) no importada(s)" : "") + ".");
	}
	function selectNode(id) {
		selectedId = id;
		render();
	}
	function applyZoom() {
		document.getElementById("canvas").style.transform = `scale(${zoom})`;
		document.getElementById("zoomReadout").textContent = Math.round(zoom * 100) + "%";
	}
	function fitToScreen() {
		const wrap = document.getElementById("canvasWrap");
		const canvas = document.getElementById("canvas");
		const cw = canvas.scrollWidth || 800, ch = canvas.scrollHeight || 600;
		const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 40;
		zoom = Math.min(availW / cw, availH / ch, 1.1);
		zoom = Math.max(zoom, .25);
		applyZoom();
	}
	function setView(v) {
		currentView = v;
		document.getElementById("canvasWrap").style.display = v === "tree" ? "block" : "none";
		document.getElementById("tableView").style.display = v === "tree" ? "none" : "block";
		document.getElementById("viewTreeBtn").classList.toggle("active", v === "tree");
		document.getElementById("viewTableBtn").classList.toggle("active", v === "tree" ? false : true);
		render();
	}
	function setOrientation(o) {
		setOrientationForBranch(selectedId || rootId, o);
	}
	function updateOrientationUI() {
		const target = nodes[selectedId] || nodes[rootId];
		if (!target) return;
		const o = target.orientation || "spread";
		const spreadBtn = document.getElementById("orientSpreadBtn");
		const stackBtn = document.getElementById("orientStackBtn");
		if (spreadBtn) spreadBtn.classList.toggle("active", o === "spread");
		if (stackBtn) stackBtn.classList.toggle("active", o === "stack");
		const label = document.getElementById("orientTargetLabel");
		if (label) label.textContent = selectedId && selectedId !== rootId ? `Rama: ${target.name}` : "Todo el proyecto";
	}
	async function seedFromScope() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
			await showAlert("La siembra de entregables necesita un proyecto activo. Abre la EDT desde el Panel de Control.", "Sembrar Entregables");
			return;
		}
		if (ensureProjectFresh && !ensureProjectFresh()) return;
		const p = window.GPI.active();
		gpiScopeModule = p && p.modules && p.modules.scopeStatement || null;
		const dels = gpiScopeModule && window.GPI.util ? window.GPI.util.scopeDeliverables(gpiScopeModule) : [];
		if (!dels.length) {
			await showAlert("Aún no hay entregables en el Enunciado del Alcance. Ábrelo, define los entregables (idealmente sugiriéndolos desde el Acta) y vuelve a sembrar. Recuerda: la EDT descompone entregables, no requisitos.", "Sembrar Entregables");
			return;
		}
		const usedDel = {};
		Object.keys(nodes).forEach((id) => {
			if (nodes[id].delId) usedDel[nodes[id].delId] = true;
		});
		const byName = {};
		(nodes[rootId].children || []).forEach((cid) => {
			if (nodes[cid]) byName[(nodes[cid].name || "").toLowerCase().trim()] = cid;
		});
		let added = 0, linked = 0;
		dels.forEach((d) => {
			if (usedDel[d.id]) return;
			const nm = (d.name || "").toLowerCase().trim();
			const existing = byName[nm];
			if (existing && !nodes[existing].delId) {
				nodes[existing].delId = d.id;
				linked++;
				return;
			}
			if (existing && nodes[existing].delId) return;
			newNode(rootId, d.name || "Entregable", { delId: d.id });
			added++;
		});
		render();
		setTimeout(fitToScreen, 50);
		markDirty();
		const msg = added ? "Se sembraron " + added + " entregable(s) como ramas de la EDT" + (linked ? " y se enlazaron " + linked + " existentes" : "") + ". Ahora descompón cada entregable en sus paquetes de trabajo." : linked ? "Se enlazaron " + linked + " rama(s) existentes con sus entregables." : "Todos los entregables del alcance ya están representados en la EDT.";
		setStatus(msg);
		await showAlert(msg, "Sembrar Entregables");
	}
	function init() {
		blankProject();
		render();
		setTimeout(fitToScreen, 50);
		document.getElementById("btnAddPhase").addEventListener("click", () => {
			selectedId = newNode(rootId, "Nueva fase");
			render();
			focusNameField();
			markDirty();
		});
		document.getElementById("btnAddChild").addEventListener("click", () => {
			selectedId = newNode(selectedId || rootId, "Nueva subtarea");
			render();
			focusNameField();
			markDirty();
		});
		document.getElementById("btnSeedScope").addEventListener("click", seedFromScope);
		document.getElementById("btnDelete").addEventListener("click", async () => {
			if (!selectedId || selectedId === rootId) {
				await showAlert("Selecciona un nodo distinto del proyecto raíz.");
				return;
			}
			if (await showConfirm(`¿Eliminar "${nodes[selectedId].name}" y sus subtareas?`)) {
				deleteSubtree(selectedId);
				selectedId = rootId;
				render();
				markDirty();
			}
		});
		document.getElementById("zoomIn").addEventListener("click", () => {
			zoom = Math.min(zoom + .1, 2);
			applyZoom();
		});
		document.getElementById("zoomOut").addEventListener("click", () => {
			zoom = Math.max(zoom - .1, .2);
			applyZoom();
		});
		document.getElementById("zoomFit").addEventListener("click", fitToScreen);
		document.getElementById("viewTreeBtn").addEventListener("click", () => setView("tree"));
		document.getElementById("viewTableBtn").addEventListener("click", () => setView("table"));
		document.getElementById("orientSpreadBtn").addEventListener("click", () => setOrientation("spread"));
		document.getElementById("orientStackBtn").addEventListener("click", () => setOrientation("stack"));
		document.getElementById("btnCollapseAll").addEventListener("click", () => {
			Object.values(nodes).forEach((n) => {
				if (n.children.length > 0) n.collapsed = true;
			});
			render();
			setTimeout(fitToScreen, 50);
		});
		document.getElementById("btnExpandAll").addEventListener("click", () => {
			Object.values(nodes).forEach((n) => {
				n.collapsed = false;
			});
			render();
			setTimeout(fitToScreen, 50);
		});
		document.getElementById("btnExportExcel").addEventListener("click", downloadWbsExcel);
		document.getElementById("btnImportExcel").addEventListener("click", () => {
			document.getElementById("xlsxFileInput").click();
		});
		document.getElementById("xlsxFileInput").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) importWbsExcel(files[0]);
			e.target.value = "";
		});
		document.getElementById("btnPrint").addEventListener("click", () => window.print());
		document.getElementById("btnSample").addEventListener("click", async () => {
			if (await showConfirm("Esto reemplazará el proyecto actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo")) {
				loadSample();
				render();
				setTimeout(fitToScreen, 50);
				markDirty();
			}
		});
		document.getElementById("btnReset").addEventListener("click", async () => {
			if (await showConfirm("Esto borrará el proyecto actual. ¿Continuar?", "Nuevo proyecto")) {
				blankProject();
				render();
				setTimeout(fitToScreen, 50);
				markDirty();
			}
		});
		document.getElementById("canvasWrap").addEventListener("click", () => {
			selectedId = rootId;
			render();
		});
		window.addEventListener("keydown", async (e) => {
			if (document.getElementById("modalOverlay").classList.contains("open")) return;
			if (e.key === "Delete" && selectedId && selectedId !== rootId && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
				if (await showConfirm(`¿Eliminar "${nodes[selectedId].name}"?`)) {
					deleteSubtree(selectedId);
					selectedId = rootId;
					render();
					markDirty();
				}
			}
		});
	}
	document.addEventListener("DOMContentLoaded", init);
	document.addEventListener("DOMContentLoaded", function gpiBridge() {
		if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
		const GPI = window.GPI;
		const proj = GPI.active();
		const loadedProjectId = proj ? GPI.activeId() : null;
		let session = null;
		let projectStale = false;
		function markProjectStale() {
			if (projectStale) return;
			projectStale = true;
			setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
			const banner = document.getElementById("banner");
			if (banner) {
				banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la EDT aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
				banner.classList.add("show");
			}
		}
		const titleEl = document.getElementById("projectTitle");
		const courseEl = document.getElementById("courseTitle");
		function pull() {
			const p = GPI.active();
			if (!p) return;
			session = GPI.openSession("wbs");
			if (p.meta) {
				if (p.meta.name) titleEl.value = p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			gpiRaciModule = p.modules && p.modules.raci || null;
			gpiObsModule = p.modules && p.modules.obs || null;
			gpiScopeModule = p.modules && p.modules.scopeStatement || null;
			gpiActivitiesModule = p.modules && p.modules.activities || null;
			gpiPertModule = p.modules && p.modules.pert || null;
			gpiScheduleModule = p.modules && p.modules.schedule || null;
			gpiSchedulePlanModule = p.modules && p.modules.schedulePlan || null;
			gpiCostEstimateModule = p.modules && p.modules.costEstimate || null;
			const mod = p.modules && p.modules.wbs;
			if (mod && mod.nodes && mod.rootId) {
				const modWbs = gpiRaciModule && gpiObsModule && GPI.util ? GPI.util.applyRaciToWbs(mod, gpiRaciModule, gpiObsModule) : mod;
				const schedSync = GPI.util && GPI.util.applyScheduleToWbs ? GPI.util.applyScheduleToWbs(modWbs, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta) : {
					wbs: modWbs,
					lockedLeafIds: []
				};
				const costSync = GPI.util && GPI.util.applyCostEstimateToWbs ? GPI.util.applyCostEstimateToWbs(schedSync.wbs, gpiCostEstimateModule, gpiActivitiesModule) : {
					wbs: schedSync.wbs,
					lockedLeafIds: []
				};
				nodes = costSync.wbs.nodes;
				rootId = costSync.wbs.rootId;
				idCounter = costSync.wbs.idCounter || 1;
				selectedId = rootId;
				scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
				costEstimateLockedLeafIds = new Set(costSync.lockedLeafIds);
				GPI.rebaseSession(session, {
					rootId,
					idCounter,
					nodes
				});
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Proyecto cargado desde el Panel de Control.");
			} else {
				blankProject(p.meta && p.meta.name || "Proyecto sin título");
				scheduleLockedLeafIds = /* @__PURE__ */ new Set();
				costEstimateLockedLeafIds = /* @__PURE__ */ new Set();
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Proyecto sin EDT todavía. Agrega fases y paquetes, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!GPI.active()) return false;
			if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(GPI, "wbs", "La EDT", {
				rootId,
				idCounter,
				nodes
			}, {
				name: titleEl.value,
				course: courseEl.value
			}, session, {
				setStatus,
				onStale: markProjectStale
			});
			session = r.session;
			return r.ok;
		}
		requestGpiPush = push;
		ensureProjectFresh = () => {
			if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			return true;
		};
		function refreshRaciSync() {
			const p = GPI.active();
			if (!p) return;
			gpiRaciModule = p.modules && p.modules.raci || null;
			gpiObsModule = p.modules && p.modules.obs || null;
			gpiScopeModule = p.modules && p.modules.scopeStatement || null;
			if (!gpiRaciModule || !gpiObsModule || !GPI.util) return;
			let changed = false;
			Object.keys(nodes).forEach((id) => {
				const n = nodes[id];
				if (!n || n.children.length > 0) return;
				const ids = GPI.util.raciResponsibleIds(gpiRaciModule, id);
				if (!ids.length) return;
				const labels = ids.map((rid) => GPI.util.obsLabel(gpiObsModule.nodes[rid])).filter(Boolean);
				if (!labels.length) return;
				const joined = labels.join(", ");
				if (n.resource !== joined) {
					n.resource = joined;
					changed = true;
				}
			});
			if (changed) {
				render();
				setStatus("Responsables actualizados desde la Matriz RACI.");
			}
		}
		function refreshScheduleSync() {
			const p = GPI.active();
			if (!p) return;
			gpiActivitiesModule = p.modules && p.modules.activities || null;
			gpiPertModule = p.modules && p.modules.pert || null;
			gpiScheduleModule = p.modules && p.modules.schedule || null;
			gpiSchedulePlanModule = p.modules && p.modules.schedulePlan || null;
			if (!GPI.util || !GPI.util.applyScheduleToWbs) return;
			const snapshot = {
				rootId,
				idCounter,
				nodes
			};
			const schedSync = GPI.util.applyScheduleToWbs(snapshot, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta);
			scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
			let changed = false;
			schedSync.lockedLeafIds.forEach((id) => {
				const n = nodes[id], sn = schedSync.wbs.nodes[id];
				if (!n || !sn) return;
				const s = sn.start || "", e = sn.end || "";
				if (n.start !== s || n.end !== e) {
					n.start = s;
					n.end = e;
					changed = true;
				}
			});
			if (changed) {
				render();
				setStatus("Fechas actualizadas desde el Cronograma CPM.");
			}
		}
		function refreshCostEstimateSync() {
			const p = GPI.active();
			if (!p) return;
			gpiCostEstimateModule = p.modules && p.modules.costEstimate || null;
			gpiActivitiesModule = p.modules && p.modules.activities || null;
			if (!GPI.util || !GPI.util.applyCostEstimateToWbs) return;
			const snapshot = {
				rootId,
				idCounter,
				nodes
			};
			const costSync = GPI.util.applyCostEstimateToWbs(snapshot, gpiCostEstimateModule, gpiActivitiesModule);
			costEstimateLockedLeafIds = new Set(costSync.lockedLeafIds);
			let changed = false;
			costSync.lockedLeafIds.forEach((id) => {
				const n = nodes[id], sn = costSync.wbs.nodes[id];
				if (!n || !sn) return;
				const c = Number(sn.cost) || 0;
				if (Number(n.cost) !== c) {
					n.cost = c;
					changed = true;
				}
			});
			if (changed) {
				render();
				setStatus("Costo actualizado desde Estimar los Costos.");
			}
		}
		if (proj) pull();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
			else if (loadedProjectId == null || GPI.activeId() === loadedProjectId) {
				refreshRaciSync();
				refreshScheduleSync();
				refreshCostEstimateSync();
			} else markProjectStale();
		});
		GPI.onChange(() => {
			if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return;
			}
			if (!document.hidden) {
				refreshRaciSync();
				refreshScheduleSync();
				refreshCostEstimateSync();
			}
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	});
	function gpiBadge(name, pushFn) {
		installGpiBadge({
			name,
			onSync: pushFn
		});
	}
	function reportShell(docTitle, moduleName, bodyHtml) {
		let el = document.getElementById("gpiReport");
		if (!el) {
			el = document.createElement("div");
			el.id = "gpiReport";
			document.body.appendChild(el);
		}
		let meta = {};
		try {
			if (window.GPI && window.GPI.available() && window.GPI.meta()) meta = window.GPI.meta();
		} catch (_) {}
		const tEl = document.getElementById("projectTitle"), cEl = document.getElementById("courseTitle");
		const pName = tEl && tEl.value || meta.name || "Proyecto";
		const course = cEl && cEl.value || meta.course || "Gestión de Proyectos de Ingeniería";
		const today = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
		el.innerHTML = "<div class=\"rep-head\"><div><h1>" + escapeHtml(docTitle) + "</h1><div class=\"sub\">" + escapeHtml(pName) + (meta.code ? " · " + escapeHtml(meta.code) : "") + "</div><div class=\"sub\" style=\"font-weight:500\">" + escapeHtml(course) + "</div></div><div class=\"rep-meta\">" + escapeHtml(moduleName) + "<br>Emitido: " + escapeHtml(today) + (meta.client ? "<br>Cliente: " + escapeHtml(meta.client) : "") + (meta.location ? "<br>" + escapeHtml(meta.location) : "") + "</div></div>" + bodyHtml;
		document.body.classList.add("report-mode");
		function repDone() {
			document.body.classList.remove("report-mode");
			window.removeEventListener("afterprint", repDone);
		}
		window.addEventListener("afterprint", repDone);
		setTimeout(() => {
			window.print();
			setTimeout(repDone, 500);
		}, 60);
	}
	function repDate(s) {
		if (!s) return "—";
		const p = String(s).split("-");
		return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s;
	}
	function buildReport() {
		const CURW = {
			USD: "USD $",
			PEN: "S/",
			EUR: "€"
		};
		let curr = "USD";
		try {
			if (window.GPI && window.GPI.available() && window.GPI.meta()) curr = window.GPI.meta().currency || "USD";
		} catch (_) {}
		function m(v) {
			const n = Number(v) || 0;
			return (CURW[curr] || "$") + " " + n.toLocaleString("es-PE");
		}
		function agg(id) {
			const n = nodes[id];
			if (!n) return {
				cost: 0,
				start: "",
				end: "",
				leaves: 0
			};
			if (!n.children.length) return {
				cost: Number(n.cost) || 0,
				start: n.start || "",
				end: n.end || "",
				leaves: 1
			};
			const out = {
				cost: 0,
				start: "",
				end: "",
				leaves: 0
			};
			n.children.forEach((cid) => {
				const a = agg(cid);
				out.cost += a.cost;
				out.leaves += a.leaves;
				if (a.start && (!out.start || a.start < out.start)) out.start = a.start;
				if (a.end && (!out.end || a.end > out.end)) out.end = a.end;
			});
			return out;
		}
		let rowsHtml = "", dictHtml = "", leafCount = 0;
		(function walk(id, code, depth) {
			const n = nodes[id];
			if (!n) return;
			const isLeaf = !n.children.length;
			const a = agg(id);
			const pad = "style=\"padding-left:" + (6 + depth * 14) + "px\"";
			rowsHtml += "<tr><td class=\"num\">" + escapeHtml(code || "—") + "</td><td " + pad + ">" + (isLeaf ? escapeHtml(n.name) : "<b>" + escapeHtml(n.name) + "</b>") + "</td><td>" + escapeHtml(n.resource || "—") + "</td><td class=\"num\">" + repDate(a.start) + "</td><td class=\"num\">" + repDate(a.end) + "</td><td class=\"num\" style=\"text-align:right\">" + m(a.cost) + "</td><td class=\"num\" style=\"text-align:right\">" + (Number(n.percent) || 0) + "%</td></tr>";
			if (isLeaf) {
				leafCount++;
				const fromCpm = scheduleLockedLeafIds.has(id);
				const fromEstimate = costEstimateLockedLeafIds.has(id);
				dictHtml += "<tr><td class=\"num\">" + escapeHtml(code || "—") + "</td><td><b>" + escapeHtml(n.name) + "</b></td><td>" + escapeHtml(n.resource || "—") + "</td><td class=\"num\" style=\"text-align:center\">" + (Number(n.duration) || 0) + "</td><td class=\"num\">" + repDate(n.start) + (fromCpm ? " ¹" : "") + "</td><td class=\"num\">" + repDate(n.end) + (fromCpm ? " ¹" : "") + "</td><td class=\"num\" style=\"text-align:right\">" + m(n.cost) + (fromEstimate ? " ²" : "") + "</td><td>" + escapeHtml(n.notes || "—") + "</td><td>" + escapeHtml(n.acceptance || "—") + (n.loe ? " <i>(esfuerzo continuo, LOE)</i>" : "") + "</td></tr>";
			}
			n.children.forEach((cid, i) => {
				walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1);
			});
		})(rootId, "", 0);
		const total = agg(rootId);
		const body = "<h2>1. Estructura de Desglose del Trabajo (EDT)</h2><p class=\"rep-note\">Los costos y fechas de fases y del proyecto son consolidados (rollup) de sus paquetes de trabajo; las fechas de los niveles superiores reflejan el rango inicio más temprano → fin más tardío (ejecución en paralelo incluida).</p><table><tr><th style=\"width:8%\">Código EDT</th><th>Elemento</th><th style=\"width:15%\">Responsable</th><th style=\"width:9%\">Inicio</th><th style=\"width:9%\">Fin</th><th style=\"width:12%\">Costo</th><th style=\"width:8%\">Avance</th></tr>" + rowsHtml + "<tr><td colspan=\"5\" style=\"text-align:right\"><b>Costo total del proyecto (rollup de " + leafCount + " paquetes)</b></td><td class=\"num\" style=\"text-align:right\"><b>" + m(total.cost) + "</b></td><td></td></tr></table><h2>2. Diccionario de la EDT — paquetes de trabajo</h2><table><tr><th style=\"width:8%\">Código EDT</th><th style=\"width:17%\">Paquete de trabajo</th><th style=\"width:12%\">Responsable</th><th style=\"width:7%\">Dur. (d)</th><th style=\"width:9%\">Inicio</th><th style=\"width:9%\">Fin</th><th style=\"width:11%\">Costo</th><th>Descripción del trabajo</th><th style=\"width:18%\">Criterio de aceptación</th></tr>" + (dictHtml || "<tr><td colspan=\"9\" class=\"rep-note\">— Sin paquetes de trabajo —</td></tr>") + "</table><p class=\"rep-note\">El responsable de cada paquete proviene de la Matriz RACI (rol marcado con \"R\") o, si aún no la tiene, de una selección manual dentro del OBS del proyecto — nunca de texto libre. Las fechas marcadas con ¹ provienen del Cronograma CPM (ruta crítica ya calculable para ese paquete); los costos marcados con ² provienen de Estimar los Costos (Cantidad × Precio unitario ya calculados para ese paquete); el resto de fechas y costos son una estimación manual bottom-up ingresada en esta EDT, sujeta a cambiar una vez calculados los valores reales en esos módulos.</p>";
		computeQuality();
		const qd = quality.dictionary, qc = quality.counts;
		const qBody = quality.state === "vacio" ? "<p class=\"rep-note\">— Sin elementos que revisar —</p>" : "<p>Diccionario completo (descripción, criterio de aceptación y responsable): <b>" + qd.complete + " de " + qd.total + " paquetes (" + qd.pct + " %)</b>. Hallazgos: <b>" + qc.riesgo + "</b> riesgos · <b>" + qc.aviso + "</b> avisos · <b>" + qc.info + "</b> sugerencias.</p>" + (quality.groups.length ? "<table><tr><th style=\"width:6%\">Regla</th><th style=\"width:26%\">Revisión</th><th>Elementos</th></tr>" + quality.groups.map((g) => "<tr><td class=\"num\">" + g.code + "</td><td><b>" + escapeHtml(g.title) + "</b><br><span class=\"rep-note\">" + escapeHtml(g.hint) + "</span></td><td>" + g.items.map((f) => "<b>" + escapeHtml(f.nodeCode) + "</b> " + escapeHtml(f.text)).join("<br>") + "</td></tr>").join("") + "</table>" : "<p class=\"rep-note\">Sin hallazgos: la estructura, el diccionario y el tamaño de los paquetes cumplen los criterios revisados.</p>");
		reportShell("EDT y Diccionario del Proyecto", "WBS Builder · Gestión del Alcance", body + "<h2>3. Calidad de la EDT</h2>" + qBody);
	}
	(function() {
		const b = document.getElementById("btnReport");
		if (b) b.addEventListener("click", buildReport);
	})();
	//#endregion
})();
