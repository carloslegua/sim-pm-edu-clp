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
	//#region src/shared/local-date.ts
	function todayLocalISO(d = /* @__PURE__ */ new Date()) {
		const p = (n) => (n < 10 ? "0" : "") + n;
		return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
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
	var str$8 = (v) => v === null || v === void 0 ? "" : String(v);
	var fin = (v, d = 0) => {
		const x = Number(v);
		return isFinite(x) ? x : d;
	};
	function normalizeBaseline(o) {
		if (!o || typeof o !== "object") return null;
		const x = o, s = x.snapshot;
		if (!s || typeof s !== "object" || !Array.isArray(s.rows) || !isFinite(Number(s.projectDuration))) return null;
		const rows = s.rows.filter((r) => r && typeof r === "object").map((r) => {
			const q = r;
			return {
				id: str$8(q.id),
				code: str$8(q.code),
				name: str$8(q.name),
				isMilestone: !!q.isMilestone,
				dur: fin(q.dur),
				es: fin(q.es),
				ef: fin(q.ef),
				tf: fin(q.tf),
				critical: !!q.critical
			};
		}).filter((r) => r.id);
		const log = (Array.isArray(x.log) ? x.log : []).filter((e) => e && typeof e === "object").map((e) => {
			const q = e;
			return {
				version: str$8(q.version),
				date: str$8(q.date),
				reason: str$8(q.reason),
				approver: str$8(q.approver),
				sponsorAuth: !!q.sponsorAuth,
				projectDuration: fin(q.projectDuration),
				finishDate: str$8(q.finishDate),
				deviationPct: q.deviationPct === null || q.deviationPct === void 0 ? null : fin(q.deviationPct)
			};
		});
		return {
			frozen: x.frozen !== false,
			version: str$8(x.version) || "LB-1",
			date: str$8(x.date),
			snapshot: {
				projectDuration: fin(s.projectDuration),
				startDate: str$8(s.startDate),
				finishDate: str$8(s.finishDate),
				nearCriticalDays: fin(s.nearCriticalDays, 10),
				rows,
				evm: normalizeEvmReference(s.evm)
			},
			log
		};
	}
	var optNum = (v) => v === null || v === void 0 || v === "" || !isFinite(Number(v)) ? null : Number(v);
	function normalizeEvmReference(o) {
		if (!o || typeof o !== "object") return null;
		const x = o, cal = x.calendar && typeof x.calendar === "object" ? x.calendar : {};
		if (!Array.isArray(x.packages)) return null;
		const packages = x.packages.filter((p) => p && typeof p === "object").map((p) => {
			const q = p;
			return {
				id: str$8(q.id),
				code: str$8(q.code),
				name: str$8(q.name),
				bac: fin(q.bac),
				source: str$8(q.source),
				es: optNum(q.es),
				ef: optNum(q.ef)
			};
		}).filter((p) => p.id);
		return {
			calendar: {
				workDayIdx: (Array.isArray(cal.workDayIdx) ? cal.workDayIdx : [
					1,
					2,
					3,
					4,
					5
				]).map((d) => Number(d)).filter((d) => isFinite(d)),
				holidays: (Array.isArray(cal.holidays) ? cal.holidays : []).map(str$8)
			},
			packages,
			total: fin(x.total, packages.reduce((s, p) => s + p.bac, 0))
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
	var num$2 = (v) => {
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
		const totalCost = leafIds.reduce((s, id) => s + Math.max(0, num$2(nodes[id].cost)), 0);
		let complete = 0;
		leafIds.forEach((id) => {
			const n = nodes[id];
			const okDesc = !blank(n.notes), okAcc = !blank(n.acceptance), okRes = !blank(n.resource);
			if (!okDesc) add("D1", id, nm(id) + " no tiene descripción del trabajo.");
			if (!okAcc) add("D2", id, nm(id) + " no tiene criterio de aceptación.");
			if (!okRes) add("D3", id, nm(id) + " no tiene responsable.");
			if (okDesc && okAcc && okRes) complete++;
			const cost = num$2(n.cost);
			if (cost <= 0) add("D4", id, nm(id) + " no tiene costo estimado.");
			const days = calendarDays(n.start, n.end) ?? Math.max(0, num$2(n.duration));
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
	//#region src/shared/boe.ts
	var STATUS_LABEL = {
		borrador: "Borrador",
		revision: "En revisión",
		aprobada: "Aprobada"
	};
	var STATUSES$1 = [
		"borrador",
		"revision",
		"aprobada"
	];
	var TEXT_KEYS = Array.from(new Set([
		{
			id: "3.1.1",
			group: "g1",
			from: 5,
			title: "Propósito",
			en: "Purpose",
			keys: ["purpose"],
			hint: "Para qué se prepara el estimado: estudio de costos, opciones, financiamiento, autorización de presupuesto…",
			placeholder: "Ej. Sustentar el presupuesto de autorización y servir de base del control de cambios."
		},
		{
			id: "3.1.2",
			group: "g1",
			from: 4,
			title: "Objetivos del proyecto y del estimado",
			en: "Project and Estimate Objectives",
			keys: ["objectives"],
			hint: "Qué busca el proyecto y qué decisión debe soportar el estimado."
		},
		{
			id: "3.1.3",
			group: "g1",
			from: 5,
			title: "Descripción del alcance del proyecto",
			en: "Project Scope Description",
			keys: ["scope"],
			auto: "scope",
			hint: "El alcance que cubre el estimado (viene del Enunciado del Alcance). La BOE es el entregable que lo define y la base del control de cambios."
		},
		{
			id: "3.1.4",
			group: "g1",
			from: 3,
			title: "Resumen del plan de ejecución",
			en: "Project Execution Plan Summary",
			keys: ["execution"],
			auto: "execution",
			hint: "Estrategia de contratación, secuencia y fases, jornadas y turnos, hitos que condicionan el costo."
		},
		{
			id: "3.1.5",
			group: "g1",
			from: 3,
			title: "Parámetros de construcción, fabricación y operación",
			en: "Construction, Fabrication, and Operating Parameters",
			keys: ["parameters"],
			hint: "Condiciones del sitio, accesos, restricciones de horario, ubicación, clima, servicios provisionales."
		},
		{
			id: "3.1.6",
			group: "g1",
			from: 5,
			title: "Clasificación del estimado",
			en: "Estimate Classification",
			keys: ["classNote"],
			auto: "classification",
			hint: "La clase AACE (pestaña 02) y por qué corresponde a la madurez de la definición."
		},
		{
			id: "3.2.1",
			group: "g2",
			from: 4,
			title: "Herramientas de estimación",
			en: "Estimating Tools",
			keys: ["tools"],
			hint: "Programas, hojas de cálculo, bases de datos y técnicas usadas para producir el estimado."
		},
		{
			id: "3.2.2",
			group: "g2",
			from: 4,
			title: "Estructura de codificación",
			en: "Coding Structure",
			keys: ["coding"],
			auto: "coding",
			hint: "Cómo se codifican los costos (EDT y cuentas de costo)."
		},
		{
			id: "3.3.1",
			group: "g3",
			from: 3,
			title: "Unidades de medida",
			en: "Units of Measure",
			keys: ["units"],
			hint: "Sistema de unidades y unidades por tipo de trabajo; califica los rendimientos (unidades/hora o horas/unidad)."
		},
		{
			id: "3.3.2",
			group: "g3",
			from: 5,
			title: "Moneda y tipos de cambio",
			en: "Currency and Exchange Rates",
			keys: ["currencyNote"],
			auto: "currency",
			hint: "Moneda del estimado, fecha y fuente del tipo de cambio. El tipo de cambio se estima aparte de la escalación (58R-10)."
		},
		{
			id: "3.3.3",
			group: "g3",
			from: 1,
			title: "Redondeo",
			en: "Rounding",
			keys: ["rounding"],
			hint: "Criterio de redondeo de cantidades y costos."
		},
		{
			id: "3.4",
			group: "g3",
			from: 3,
			title: "Base de cantidades",
			en: "Quantity Basis",
			keys: ["quantities"],
			hint: "De dónde salen las cantidades (metrados de planos, factores, paramétricos) y su nivel de madurez."
		},
		{
			id: "3.5",
			group: "g5",
			from: 5,
			title: "Base de costos: fecha y fuente de precios",
			en: "Cost Basis",
			keys: ["date", "source"],
			all: true,
			hint: "La fecha base de los precios (de ella se mide la escalación) y su fuente: cotizaciones, bases de precios, contratos.",
			area: false
		},
		{
			id: "3.5.1",
			group: "g5",
			from: 4,
			title: "Base de costos: criterios de costeo",
			en: "Cost Basis",
			keys: ["costBasis"],
			hint: "Costos directos e indirectos, impuestos, gastos generales, utilidad, moneda de las cotizaciones."
		},
		{
			id: "3.5.2",
			group: "g5",
			from: 4,
			title: "Frontera entre escalación, contingencia, asignaciones y tipo de cambio",
			en: "Cost Basis (RP 58R-10)",
			keys: ["boundary"],
			auto: "escalation",
			when: "escalation",
			hint: "58R-10: cada organización debe definir qué es escalación (incluye la inflación), qué es asignación, contingencia y tipo de cambio, y documentarlo en la BOE. La contingencia excluye la escalación."
		},
		{
			id: "3.6",
			group: "g5",
			from: 4,
			title: "Base de planificación",
			en: "Planning Basis",
			keys: ["planning"],
			auto: "planning",
			hint: "El cronograma en que se apoya el estimado: duración, calendario, fechas de gasto y línea base."
		},
		{
			id: "3.7",
			group: "g7",
			from: 2,
			title: "Materiales a granel",
			en: "Bulk Commodity Material",
			keys: ["bulk"],
			hint: "Cómo se cuantifican y cotizan los materiales a granel (desperdicios, factores, suministro)."
		},
		{
			id: "3.8",
			group: "g7",
			from: 2,
			title: "Mano de obra",
			en: "Labor",
			keys: ["labor", "productivity"],
			hint: "Tarifas, jornada, rendimientos y factores de productividad o de ajuste."
		},
		{
			id: "3.9",
			group: "g7",
			from: 1,
			title: "Demolición",
			en: "Demolition",
			keys: ["demolition"],
			hint: "Qué demolición incluye o excluye el estimado. Si no aplica, escribe «No aplica»."
		},
		{
			id: "3.10",
			group: "g8",
			from: 3,
			title: "Asignaciones",
			en: "Allowances",
			keys: ["allowances"],
			hint: "Montos previstos para trabajo aún no definido y qué cubren (no son contingencia). Si no hay, escribe «Sin asignaciones»."
		},
		{
			id: "3.11",
			group: "g8",
			from: 5,
			title: "Supuestos",
			en: "Assumptions",
			keys: ["assumptions"],
			hint: "Lo que se da por cierto para estimar y cuyo cambio invalidaría el estimado."
		},
		{
			id: "3.12",
			group: "g8",
			from: 5,
			title: "Exclusiones",
			en: "Exclusions",
			keys: ["exclusions"],
			hint: "Lo que el lector podría esperar dentro del estimado y NO está."
		},
		{
			id: "3.13",
			group: "g8",
			from: 2,
			title: "Excepciones",
			en: "Exceptions",
			keys: ["exceptions"],
			hint: "Desviaciones de la práctica estándar de estimación de la organización. Si no hay, escribe «Ninguna»."
		},
		{
			id: "3.14",
			group: "g9",
			from: 4,
			title: "Riesgos y oportunidades",
			en: "Risks and Opportunities",
			keys: ["risksNote"],
			auto: "risks",
			hint: "Los riesgos y oportunidades de costo que el estimador conoce (viene del Registro de Riesgos) y cómo se tratan."
		},
		{
			id: "3.16",
			group: "g9",
			from: 5,
			title: "Contingencias",
			en: "Contingencies",
			keys: ["contingencyNote"],
			auto: "contingency",
			hint: "Método y monto de la contingencia; de quién es y cómo se libera."
		},
		{
			id: "3.17",
			group: "g9",
			from: 4,
			title: "Reserva de gestión",
			en: "Management Reserve",
			keys: ["mgmtNote"],
			auto: "mgmt",
			hint: "Monto de la reserva de gestión, quién la controla y cómo se autoriza su uso (fuera de la línea base)."
		},
		{
			id: "3.18",
			group: "g10",
			from: 3,
			title: "Conciliación",
			en: "Reconciliation",
			keys: ["reconciliation"],
			auto: "capex",
			hint: "Cómo se concilia el estimado con estimados anteriores y con el presupuesto autorizado o CAPEX."
		},
		{
			id: "3.19",
			group: "g10",
			from: 1,
			title: "Benchmarking",
			en: "Benchmarking",
			keys: ["benchmarking"],
			hint: "Proyectos comparables con los que se contrastó el estimado (costos por unidad, ratios)."
		},
		{
			id: "3.20",
			group: "g10",
			from: 2,
			title: "Aseguramiento de la calidad del estimado",
			en: "Estimate Quality Assurance",
			keys: ["qa"],
			hint: "Revisiones internas, chequeos y quién los hizo."
		},
		{
			id: "3.21",
			group: "g10",
			from: 3,
			title: "Equipo estimador",
			en: "Estimating Team",
			keys: [],
			list: "team",
			hint: "Quiénes prepararon el estimado y su rol."
		},
		{
			id: "3.22.A",
			group: "g10",
			from: 2,
			title: "Anexo A: entregables del estimado",
			en: "Attachment A: Estimate Deliverables Checklist",
			keys: [],
			list: "checklist",
			hint: "Lista de control de lo que se entrega con el estimado (lista propia; la de 34R-05 no se pudo verificar)."
		},
		{
			id: "3.22.B",
			group: "g10",
			from: 3,
			title: "Anexo B: documentos de referencia",
			en: "Attachment B: Reference Documents",
			keys: [],
			list: "refs",
			hint: "Documentos y proyectos usados o referenciados al preparar el estimado."
		}
	].reduce((a, s) => a.concat(s.keys), [])));
	var CHECKLIST_ITEMS = [
		{
			id: "boe",
			label: "Basis of Estimate (este documento)"
		},
		{
			id: "summary",
			label: "Resumen del estimado por paquete de la EDT"
		},
		{
			id: "detail",
			label: "Estimado detallado (precios unitarios por actividad)"
		},
		{
			id: "quantities",
			label: "Hoja de cantidades (metrados)"
		},
		{
			id: "schedule",
			label: "Cronograma y flujo de caja"
		},
		{
			id: "risk",
			label: "Análisis de riesgo y contingencia"
		},
		{
			id: "escalation",
			label: "Cálculo de la escalación"
		},
		{
			id: "reconc",
			label: "Conciliación y comparación con proyectos similares"
		},
		{
			id: "signoff",
			label: "Revisión y aprobación del estimado"
		}
	];
	var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
	var str$7 = (v) => v === null || v === void 0 ? "" : String(v);
	function blankBoe() {
		const text = {};
		TEXT_KEYS.forEach((k) => {
			text[k] = "";
		});
		return {
			version: "1.0",
			status: "borrador",
			preparedBy: "",
			reviewedBy: "",
			approvedBy: "",
			approvedOn: "",
			text,
			team: [],
			refs: [],
			checklist: CHECKLIST_ITEMS.map((c) => ({
				id: c.id,
				done: false
			}))
		};
	}
	function normalizeBoe(raw) {
		const b = blankBoe();
		if (!isObj(raw)) return b;
		TEXT_KEYS.forEach((k) => {
			b.text[k] = str$7(raw[k]);
		});
		b.version = str$7(raw.version) || "1.0";
		b.status = STATUSES$1.indexOf(raw.status) >= 0 ? raw.status : "borrador";
		b.preparedBy = str$7(raw.preparedBy);
		b.reviewedBy = str$7(raw.reviewedBy);
		b.approvedBy = str$7(raw.approvedBy);
		b.approvedOn = /^\d{4}-\d{2}-\d{2}$/.test(str$7(raw.approvedOn)) ? str$7(raw.approvedOn) : "";
		if (Array.isArray(raw.team)) b.team = raw.team.filter(isObj).map((m) => ({
			name: str$7(m.name),
			role: str$7(m.role)
		})).filter((m) => m.name.trim() || m.role.trim());
		if (Array.isArray(raw.refs)) b.refs = raw.refs.filter(isObj).map((r) => ({
			title: str$7(r.title),
			note: str$7(r.note)
		})).filter((r) => r.title.trim() || r.note.trim());
		if (Array.isArray(raw.checklist)) raw.checklist.filter(isObj).forEach((c) => {
			const it = b.checklist.find((x) => x.id === c.id);
			if (it) it.done = c.done === true;
		});
		return b;
	}
	//#endregion
	//#region src/shared/reserve-policy.ts
	var DEFAULT_RESERVES = {
		pmLimit: null,
		ccbLimit: null,
		contAlertPct: null
	};
	var numOrNull$3 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return typeof n === "number" && isFinite(n) ? n : null;
	};
	function normalizeReserves(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			pmLimit: numOrNull$3(x.pmLimit),
			ccbLimit: numOrNull$3(x.ccbLimit),
			contAlertPct: numOrNull$3(x.contAlertPct)
		};
	}
	//#endregion
	//#region src/shared/change-control.ts
	var AREAS = [
		"scope",
		"schedule",
		"cost",
		"risk",
		"quality",
		"resources"
	];
	var CR_STATUSES = [
		"Pendiente",
		"Aprobada",
		"Rechazada",
		"Diferida",
		"Implementada"
	];
	var str$6 = (v) => v === null || v === void 0 ? "" : String(v);
	var numOrNull$2 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var strs$3 = (v) => Array.isArray(v) ? v.map(str$6).filter(Boolean) : [];
	function normalizeCr(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {}, im = x.impact && typeof x.impact === "object" ? x.impact : {};
		const impact = {};
		AREAS.forEach((a) => {
			const q = im[a] && typeof im[a] === "object" ? im[a] : {};
			impact[a] = {
				state: ["sin_impacto", "con_impacto"].indexOf(str$6(q.state)) >= 0 ? q.state : "sin_evaluar",
				note: str$6(q.note)
			};
		});
		const id = str$6(x.id) || fallbackId;
		return {
			id,
			code: str$6(x.code) || id,
			title: str$6(x.title),
			description: str$6(x.description),
			requester: str$6(x.requester),
			requestedOn: str$6(x.requestedOn),
			origin: str$6(x.origin),
			type: str$6(x.type),
			impact,
			wbsIds: strs$3(x.wbsIds),
			actIds: strs$3(x.actIds),
			daysDelta: numOrNull$2(x.daysDelta),
			costDelta: numOrNull$2(x.costDelta),
			fund: str$6(x.fund),
			orderIds: strs$3(x.orderIds),
			modIds: strs$3(x.modIds),
			riskIds: strs$3(x.riskIds),
			scheduleBaseline: str$6(x.scheduleBaseline),
			status: CR_STATUSES.indexOf(x.status) >= 0 ? x.status : "Pendiente",
			decidedOn: str$6(x.decidedOn),
			approver: str$6(x.approver),
			authLevel: str$6(x.authLevel),
			sponsorAuth: !!x.sponsorAuth,
			rationale: str$6(x.rationale),
			implementedOn: str$6(x.implementedOn),
			notes: str$6(x.notes)
		};
	}
	var MOD_STATUS_LABEL = {
		propuesto: "Propuesta",
		enEvaluacion: "En evaluación",
		aprobado: "Aprobada",
		rechazado: "Rechazada",
		implementado: "Implementada"
	};
	var sigOf = (o) => JSON.stringify([
		o.text,
		o.type,
		o.priority,
		o.status,
		o.acceptanceCriteria,
		o.verificationMethod,
		o.normativeBasis,
		Array.isArray(o.wbsNodeIds) ? o.wbsNodeIds.map(String).sort() : [],
		Array.isArray(o.sourceRanIds) ? o.sourceRanIds.map(String).sort() : []
	]);
	function modFacts(req) {
		const r = req && typeof req === "object" ? req : {}, items = (Array.isArray(r.items) ? r.items : []).filter((x) => x && typeof x === "object");
		const bl = r.baseline && typeof r.baseline === "object" ? r.baseline : {}, snap = /* @__PURE__ */ new Map();
		(Array.isArray(bl.snapshot) ? bl.snapshot : []).forEach((s) => {
			if (s && typeof s === "object") {
				const o = s;
				snap.set(String(o.id), sigOf(o));
			}
		});
		return (Array.isArray(r.changes) ? r.changes : []).filter((x) => x && typeof x === "object").map((x) => {
			const m = x, id = String(m.id || ""), aff = items.filter((it) => String(it.changeId || "") === id);
			return {
				id,
				code: String(m.code || m.id || ""),
				title: String(m.summary || m.title || ""),
				status: String(m.status || "propuesto"),
				approver: String(m.approver || ""),
				ccrRef: String(m.ccrRef || ""),
				evidence: {
					baselineFrozen: !!bl.frozen,
					baselineVersion: String(bl.version || ""),
					baselineDate: String(bl.date || ""),
					affected: aff.length,
					incorporated: aff.filter((it) => snap.get(String(it.id)) === sigOf(it)).length
				}
			};
		});
	}
	var isCont = (fund) => fund === "Contingencia";
	var EPS = 1e-6;
	function summarize(cr, f) {
		const delay = f.projectDelay ? f.projectDelay(cr) : null, reasons = [];
		const scope = cr.impact.scope.state === "con_impacto";
		const schedule = delay !== null && Math.abs(delay) > .05;
		const cost = cr.impact.cost.state === "con_impacto" && !!cr.costDelta && Math.abs(cr.costDelta) > EPS && !isCont(cr.fund);
		if (scope) reasons.push("cambia el alcance: se registra como modificación de alcance (MOD) en Recopilar Requisitos");
		if (schedule) reasons.push("mueve el fin del proyecto " + (delay > 0 ? "+" : "") + Math.round(delay * 10) / 10 + " d: exige una nueva versión de la línea base del cronograma");
		if (cost) reasons.push("se financia con " + cr.fund.toLowerCase() + ": la orden debe incorporarse a la línea base de costos");
		else if (cr.impact.cost.state === "con_impacto" && cr.costDelta && isCont(cr.fund)) reasons.push("se financia con contingencia: dentro de la línea base de costos, sin cambiarla (pero sí consume contingencia)");
		return {
			projectDelay: delay,
			baselines: {
				scope,
				schedule,
				cost
			},
			reasons
		};
	}
	function implementationProblems(cr, f) {
		const p = [], s = summarize(cr, f);
		if (s.baselines.scope) {
			const linked = cr.modIds.map((id) => f.mods.find((m) => m.id === id)).filter((m) => !!m);
			if (cr.modIds.length > linked.length) p.push("vincula una modificación de alcance que ya no existe en Recopilar Requisitos");
			if (!linked.length) {
				if (!cr.modIds.length) p.push("registra la modificación de alcance en Recopilar Requisitos y vincúlala (MOD)");
			}
			linked.forEach((m) => {
				const st = MOD_STATUS_LABEL[m.status] || m.status;
				if (m.status === "rechazado") p.push("la modificación " + m.code + " está «Rechazada»: no puede respaldar un cambio de alcance aprobado (corrige el vínculo o el estado de la MOD)");
				else if (m.status !== "aprobado" && m.status !== "implementado") p.push("la modificación " + m.code + " está «" + st + "»: apruébala en Recopilar Requisitos antes de implementar el cambio");
				else if (!m.approver.trim()) p.push("la modificación " + m.code + " no registra quién la aprobó");
				const ccr = m.ccrRef.trim().toLowerCase();
				if (!ccr) p.push("la modificación " + m.code + " no cita esta solicitud: escribe «" + cr.code + "» en su campo de solicitud de cambio (CCR) en Recopilar Requisitos");
				else if (ccr !== cr.code.trim().toLowerCase()) p.push("la modificación " + m.code + " responde a la solicitud «" + m.ccrRef.trim() + "», no a " + cr.code + ": no corresponde a este cambio");
				const e = m.evidence;
				if (!e.baselineFrozen) p.push("la línea base de requisitos no está congelada: el cambio de alcance no tiene una línea base a la que incorporarse");
				else if (!e.affected) p.push("la modificación " + m.code + " no afecta ningún requisito: no hay evidencia de que el alcance cambió (actívala y edita la matriz de requisitos)");
				else if (e.incorporated < e.affected) p.push("solo " + e.incorporated + " de " + e.affected + " requisito(s) de " + m.code + " están tal cual en la línea base de requisitos v" + e.baselineVersion + ": congela una nueva versión de la línea base que incorpore la modificación");
				else if (cr.decidedOn && e.baselineDate && e.baselineDate < cr.decidedOn) p.push("la línea base de requisitos v" + e.baselineVersion + " (" + e.baselineDate + ") es anterior a la decisión (" + cr.decidedOn + "): no puede incorporar este cambio");
			});
		}
		if (cr.impact.cost.state === "con_impacto" && cr.costDelta) {
			const os = cr.orderIds.map((id) => f.orders.find((o) => o.id === id)).filter((o) => !!o);
			if (!os.length) p.push("registra la orden de cambio en Costos y vincúlala (OC)");
			else {
				const total = os.reduce((sum, o) => sum + o.cost, 0);
				if (Math.abs(total - cr.costDelta) > .5) p.push("las órdenes vinculadas suman " + Math.round(total) + " y el Δ costo de la solicitud es " + Math.round(cr.costDelta));
				os.forEach((o) => {
					if (o.status !== "Aprobada") p.push("la orden " + o.id + " está «" + o.status + "»: aprueba la orden en Costos");
					else if (!isCont(o.fund) && !o.baselined) p.push("la orden " + o.id + " usa " + o.fund.toLowerCase() + " y aún no está incorporada a la línea base de costos");
				});
			}
		}
		if (s.baselines.schedule) {
			if (!cr.scheduleBaseline) p.push("fija en Cronograma/CPM la nueva versión de la línea base e indica cuál (LB-n)");
			else if (!f.scheduleLog.some((l) => l.version === cr.scheduleBaseline)) p.push("la versión " + cr.scheduleBaseline + " no existe en la línea base del cronograma del proyecto");
			else {
				const v = f.scheduleLog.find((l) => l.version === cr.scheduleBaseline);
				if (cr.decidedOn && v.date && v.date < cr.decidedOn) p.push("la versión " + cr.scheduleBaseline + " (" + v.date + ") es anterior a la decisión (" + cr.decidedOn + "): no puede incorporar este cambio");
			}
		}
		return p;
	}
	var daysBetween$1 = (a, b) => {
		const x = Date.parse(a + "T12:00:00Z"), y = Date.parse(b + "T12:00:00Z");
		return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : null;
	};
	function portfolio$1(crs, f, today) {
		const byStatus = {
			Pendiente: 0,
			Aprobada: 0,
			Rechazada: 0,
			Diferida: 0,
			Implementada: 0
		};
		let approvedCost = 0, approvedDays = 0, pendingBaseline = 0, oldest = null;
		crs.forEach((c) => {
			byStatus[c.status]++;
			if (c.status === "Aprobada" || c.status === "Implementada") {
				approvedCost += c.impact.cost.state === "con_impacto" ? c.costDelta || 0 : 0;
				const d = f.projectDelay ? f.projectDelay(c) : null;
				approvedDays += d || 0;
			}
			if (c.status === "Aprobada" && implementationProblems(c, f).length) pendingBaseline++;
			if (c.status === "Pendiente" && c.requestedOn) {
				const a = daysBetween$1(c.requestedOn, today);
				if (a !== null && (oldest === null || a > oldest)) oldest = a;
			}
		});
		return {
			total: crs.length,
			byStatus,
			approvedCost,
			approvedDays,
			pendingBaseline,
			oldestPendingDays: oldest
		};
	}
	//#endregion
	//#region src/shared/risk-analysis.ts
	var RISK_STATUSES = [
		"identificado",
		"analizado",
		"con_respuesta",
		"monitoreo",
		"materializado",
		"cerrado"
	];
	var PROXIMITY = [
		"inmediata",
		"corta",
		"media",
		"larga"
	];
	var DEFAULT_PLAN = {
		probPct: [
			10,
			30,
			50,
			70,
			90
		],
		costBandsPct: [
			1,
			3,
			5,
			10
		],
		timeBandsDays: [
			5,
			15,
			30,
			60
		],
		scopeDescriptors: [
			"Cambio apenas perceptible",
			"Áreas menores del alcance afectadas",
			"Áreas importantes del alcance afectadas",
			"Reducción inaceptable para el patrocinador",
			"El entregable final es inservible"
		],
		thresholdMedium: 6,
		thresholdHigh: 15,
		reviewDays: 30,
		categories: [
			"Técnico",
			"Externo",
			"Organizacional",
			"Gestión del proyecto"
		],
		methodology: "",
		reservePolicy: "",
		roles: "",
		reserves: DEFAULT_RESERVES
	};
	var isNum$1 = (v) => typeof v === "number" && isFinite(v);
	function toNum(v) {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return isNum$1(n) ? n : null;
	}
	function toLevel(v) {
		const n = toNum(v);
		return n !== null && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
	}
	var str$5 = (v) => v === null || v === void 0 ? "" : String(v);
	var arrNum = (v, def) => Array.isArray(v) && v.length === def.length && v.every((x) => toNum(x) !== null) ? v.map((x) => toNum(x)) : def.slice();
	function normalizePlan(p) {
		const o = p && typeof p === "object" ? p : {};
		const cats = Array.isArray(o.categories) ? o.categories.map(str$5).map((s) => s.trim()).filter(Boolean) : [];
		return {
			probPct: arrNum(o.probPct, DEFAULT_PLAN.probPct),
			costBandsPct: arrNum(o.costBandsPct, DEFAULT_PLAN.costBandsPct),
			timeBandsDays: arrNum(o.timeBandsDays, DEFAULT_PLAN.timeBandsDays),
			scopeDescriptors: Array.isArray(o.scopeDescriptors) && o.scopeDescriptors.length === 5 ? o.scopeDescriptors.map(str$5) : DEFAULT_PLAN.scopeDescriptors.slice(),
			thresholdMedium: toNum(o.thresholdMedium) ?? DEFAULT_PLAN.thresholdMedium,
			thresholdHigh: toNum(o.thresholdHigh) ?? DEFAULT_PLAN.thresholdHigh,
			reviewDays: toNum(o.reviewDays) ?? DEFAULT_PLAN.reviewDays,
			categories: cats.length ? cats : DEFAULT_PLAN.categories.slice(),
			methodology: str$5(o.methodology),
			reservePolicy: str$5(o.reservePolicy),
			roles: str$5(o.roles),
			reserves: normalizeReserves(o.reserves)
		};
	}
	function maxImpact(c, t, s) {
		const v = [
			c,
			t,
			s
		].filter((x) => x !== null);
		return v.length ? Math.max(...v) : null;
	}
	function riskScore(prob, c, t, s) {
		const i = maxImpact(c, t, s);
		return prob !== null && i !== null ? prob * i : null;
	}
	function levelOf(score, p) {
		if (score === null) return null;
		return score >= p.thresholdHigh ? "alto" : score >= p.thresholdMedium ? "medio" : "bajo";
	}
	var inherentScore = (r) => riskScore(r.prob, r.impCost, r.impTime, r.impScope);
	function rangeProblems(rg, label) {
		const out = [];
		if ([
			rg.low,
			rg.likely,
			rg.high
		].some((x) => x !== null && x < 0)) out.push(label + ": los valores no pueden ser negativos (se registra la magnitud)");
		if (rg.low !== null && rg.likely !== null && rg.low > rg.likely) out.push(label + ": el mínimo supera al más probable");
		if (rg.likely !== null && rg.high !== null && rg.likely > rg.high) out.push(label + ": el más probable supera al máximo");
		if (rg.low !== null && rg.high !== null && rg.low > rg.high) out.push(label + ": el mínimo supera al máximo");
		return out;
	}
	function impactMean(rg) {
		if (rangeProblems(rg, "").length) return null;
		if (rg.low !== null && rg.likely !== null && rg.high !== null) return (rg.low + rg.likely + rg.high) / 3;
		return rg.likely;
	}
	function probEffective(pct, level, p) {
		if (pct !== null && pct >= 0 && pct <= 100) return pct / 100;
		return level !== null ? p.probPct[level - 1] / 100 : null;
	}
	function ev(pct, level, cost, time, p) {
		const pr = probEffective(pct, level, p), c = impactMean(cost), t = impactMean(time);
		return {
			cost: pr !== null && c !== null ? pr * c : null,
			time: pr !== null && t !== null ? pr * t : null
		};
	}
	var inherentEV = (r, p) => ev(r.probPct, r.prob, r.costImpact, r.timeImpact, p);
	function residualOf(r, p) {
		if (r.strategy === "aceptar") return {
			assessed: r.prob !== null,
			derived: true,
			prob: r.prob,
			impCost: r.impCost,
			impTime: r.impTime,
			impScope: r.impScope,
			ev: inherentEV(r, p),
			score: inherentScore(r)
		};
		const has = r.resProb !== null || r.resImpCost !== null || r.resImpTime !== null || r.resImpScope !== null;
		const prob = r.resProb;
		return {
			assessed: has && prob !== null,
			derived: false,
			prob,
			impCost: r.resImpCost,
			impTime: r.resImpTime,
			impScope: r.resImpScope,
			ev: ev(r.resProbPct, r.resProb, r.resCostImpact, r.resTimeImpact, p),
			score: riskScore(prob, r.resImpCost, r.resImpTime, r.resImpScope)
		};
	}
	function range(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			low: toNum(x.low),
			likely: toNum(x.likely),
			high: toNum(x.high)
		};
	}
	function normalizeRisk(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {};
		const type = x.type === "oportunidad" ? "oportunidad" : "amenaza";
		const status = RISK_STATUSES.indexOf(x.status) >= 0 ? x.status : "identificado";
		const id = str$5(x.id) || fallbackId;
		return {
			id,
			code: str$5(x.code) || id,
			title: str$5(x.title),
			cause: str$5(x.cause),
			event: str$5(x.event),
			effect: str$5(x.effect),
			type,
			category: str$5(x.category),
			wbsIds: Array.isArray(x.wbsIds) ? x.wbsIds.map(str$5).filter(Boolean) : [],
			actIds: Array.isArray(x.actIds) ? x.actIds.map(str$5).filter(Boolean) : [],
			owner: str$5(x.owner),
			proximity: PROXIMITY.indexOf(str$5(x.proximity)) >= 0 ? str$5(x.proximity) : "",
			identifiedOn: str$5(x.identifiedOn),
			reviewedOn: str$5(x.reviewedOn),
			status,
			prob: toLevel(x.prob),
			impCost: toLevel(x.impCost),
			impTime: toLevel(x.impTime),
			impScope: toLevel(x.impScope),
			probPct: toNum(x.probPct),
			costImpact: range(x.costImpact),
			timeImpact: range(x.timeImpact),
			strategy: str$5(x.strategy),
			response: str$5(x.response),
			trigger: str$5(x.trigger),
			responseOwner: str$5(x.responseOwner),
			responseCost: toNum(x.responseCost),
			secondary: str$5(x.secondary),
			resProb: toLevel(x.resProb),
			resImpCost: toLevel(x.resImpCost),
			resImpTime: toLevel(x.resImpTime),
			resImpScope: toLevel(x.resImpScope),
			resProbPct: toNum(x.resProbPct),
			resCostImpact: range(x.resCostImpact),
			resTimeImpact: range(x.resTimeImpact),
			materializedOn: str$5(x.materializedOn),
			actualCost: toNum(x.actualCost),
			actualDelay: toNum(x.actualDelay),
			notes: str$5(x.notes)
		};
	}
	var isOpen = (r) => r.status !== "materializado" && r.status !== "cerrado";
	function portfolio(risks, p) {
		const pf = {
			total: risks.length,
			open: 0,
			threats: 0,
			opportunities: 0,
			materialized: 0,
			closed: 0,
			byLevel: {
				alto: 0,
				medio: 0,
				bajo: 0,
				sin: 0
			},
			residualByLevel: {
				alto: 0,
				medio: 0,
				bajo: 0,
				sin: 0
			},
			byCategory: [],
			evThreatCost: 0,
			evOpportunityCost: 0,
			netEvCost: 0,
			resEvThreatCost: 0,
			resEvOpportunityCost: 0,
			netResEvCost: 0,
			evThreatDays: 0,
			actualCost: 0,
			coverage: {
				withOwner: 0,
				withResponse: 0,
				withWbs: 0,
				analyzed: 0,
				quantified: 0,
				openCount: 0
			}
		};
		const cat = {};
		risks.forEach((r) => {
			if (r.status === "materializado") {
				pf.materialized++;
				pf.actualCost += r.actualCost || 0;
			}
			if (r.status === "cerrado") pf.closed++;
			if (r.type === "amenaza") pf.threats++;
			else pf.opportunities++;
			if (!isOpen(r)) return;
			pf.open++;
			pf.coverage.openCount++;
			const lv = levelOf(inherentScore(r), p);
			pf.byLevel[lv || "sin"]++;
			const res = residualOf(r, p);
			pf.residualByLevel[res.assessed ? levelOf(res.score, p) || "sin" : "sin"]++;
			if (r.owner.trim()) pf.coverage.withOwner++;
			if (r.strategy) pf.coverage.withResponse++;
			if (r.wbsIds.length) pf.coverage.withWbs++;
			if (lv) pf.coverage.analyzed++;
			const e = inherentEV(r, p);
			if (e.cost !== null) pf.coverage.quantified++;
			const k = r.category.trim() || "Sin categoría";
			cat[k] = cat[k] || {
				count: 0,
				evCost: 0
			};
			cat[k].count++;
			if (e.cost !== null) cat[k].evCost += r.type === "amenaza" ? e.cost : -e.cost;
			if (r.type === "amenaza") {
				pf.evThreatCost += e.cost || 0;
				pf.evThreatDays += e.time || 0;
				pf.resEvThreatCost += res.assessed ? res.ev.cost || 0 : 0;
			} else {
				pf.evOpportunityCost += e.cost || 0;
				pf.resEvOpportunityCost += res.assessed ? res.ev.cost || 0 : 0;
			}
		});
		pf.netEvCost = pf.evThreatCost - pf.evOpportunityCost;
		pf.netResEvCost = pf.resEvThreatCost - pf.resEvOpportunityCost;
		pf.byCategory = Object.keys(cat).map((k) => ({
			category: k,
			count: cat[k].count,
			evCost: cat[k].evCost
		})).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
		return pf;
	}
	function rankRisks(risks, _plan) {
		const prox = (r) => {
			const i = PROXIMITY.indexOf(r.proximity);
			return i < 0 ? 9 : i;
		};
		return risks.filter(isOpen).filter((r) => inherentScore(r) !== null).sort((a, b) => inherentScore(b) - inherentScore(a) || prox(a) - prox(b) || a.code.localeCompare(b.code));
	}
	//#endregion
	//#region src/shared/stakeholder-engagement.ts
	var ENG_LEVELS = [
		{
			v: 1,
			t: "Desconocedor",
			d: "No conoce el proyecto ni sus posibles impactos."
		},
		{
			v: 2,
			t: "Reticente",
			d: "Conoce el proyecto y sus impactos, pero se resiste al cambio."
		},
		{
			v: 3,
			t: "Neutral",
			d: "Conoce el proyecto, pero ni lo apoya ni se resiste."
		},
		{
			v: 4,
			t: "Partidario",
			d: "Conoce el proyecto y sus impactos, y lo apoya."
		},
		{
			v: 5,
			t: "Líder",
			d: "Conoce el proyecto y se involucra activamente para asegurar su éxito."
		}
	];
	var isNum = (v) => typeof v === "number" && isFinite(v);
	function asLevel(v) {
		const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
		return isNum(n) && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
	}
	function levelName(v) {
		const l = asLevel(v);
		return l ? ENG_LEVELS[l - 1].t : "Sin evaluar";
	}
	var QUADRANT_LABEL = {
		cerca: "Gestionar de cerca",
		satisfecho: "Mantener satisfecho",
		informado: "Mantener informado",
		monitorear: "Monitorear"
	};
	function quadrantOf(power, interest, threshold = 50) {
		const P = power >= threshold, I = interest >= threshold;
		return P && I ? "cerca" : P ? "satisfecho" : I ? "informado" : "monitorear";
	}
	//#endregion
	//#region src/shared/plan-facts.ts
	var rec$4 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var num$1 = (v) => {
		const n = Number(v);
		return isFinite(n) ? n : 0;
	};
	function gatherCommFacts(G) {
		return {
			stakeholders: (Array.isArray(rec$4(G.getModule("stakeholders")).stakeholders) ? rec$4(G.getModule("stakeholders")).stakeholders.map(rec$4) : []).map((s) => ({
				id: String(s.id),
				name: String(s.name || s.id),
				quadrant: quadrantOf(num$1(s.power), num$1(s.interest)),
				engCurrent: s.engCurrent === null || s.engCurrent === void 0 ? null : num$1(s.engCurrent),
				engDesired: s.engDesired === null || s.engDesired === void 0 ? null : num$1(s.engDesired)
			})),
			roles: Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)))
		};
	}
	function openRisks(G) {
		const rk = G.getModule("risks"), plan = normalizePlan(rk && rk.plan);
		return (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))).filter(isOpen).map((r) => ({
			id: r.id,
			code: r.code,
			title: r.title,
			wbsIds: r.wbsIds,
			high: levelOf(inherentScore(r), plan) === "alto",
			threat: r.type === "amenaza"
		}));
	}
	function baseCostOf(G) {
		const cost = G.getModule("cost"), b = cost && cost.budget, base = Number(b && (b.baseCost || b.computed && b.computed.base)) || 0;
		return base > 0 ? base : null;
	}
	var rolesOf = (G) => Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)));
	function gatherQualityFacts(G) {
		const wbs = G.util.effectiveWbs(), nodes = rec$4(wbs && wbs.nodes);
		return {
			leaves: G.util.wbsLeaves(wbs).map((l) => {
				const n = rec$4(nodes[l.id]);
				return {
					id: l.id,
					code: l.code,
					name: l.name,
					acceptance: String(n.acceptance || ""),
					loe: !!n.loe,
					cost: Number(n.cost) || 0
				};
			}),
			roles: rolesOf(G),
			highRiskLeafIds: Array.from(new Set(openRisks(G).filter((r) => r.high).flatMap((r) => r.wbsIds))),
			baseCost: baseCostOf(G)
		};
	}
	function gatherProcurementFacts(G) {
		const wbs = G.util.effectiveWbs(), nodes = rec$4(wbs && wbs.nodes), obs = G.util.obsNodes(G.getModule("obs")), sk = rec$4(G.getModule("stakeholders")).stakeholders;
		const cost = G.getModule("cost"), cl = Number(String(cost && cost.estimate && cost.estimate.class).replace(/\D/g, ""));
		return {
			leaves: G.util.wbsLeaves(wbs).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name,
				cost: Number(rec$4(nodes[l.id]).cost) || 0
			})),
			roles: rolesOf(G),
			risks: openRisks(G),
			suppliers: Array.from(new Set(obs.map((n) => (n.person || "").trim()).concat((Array.isArray(sk) ? sk : []).map((s) => String(rec$4(s).org || "").trim())).filter(Boolean))),
			estimateClass: cl >= 1 && cl <= 5 ? cl : null,
			baseCost: baseCostOf(G)
		};
	}
	//#endregion
	//#region src/shared/pm-plan.ts
	var PLAN_COMPONENTS = [
		{
			key: "meta",
			label: "Ficha del proyecto"
		},
		{
			key: "charter",
			label: "Acta de Constitución"
		},
		{
			key: "requirements",
			label: "Requisitos"
		},
		{
			key: "scopeStatement",
			label: "Enunciado del Alcance"
		},
		{
			key: "wbs",
			label: "EDT y diccionario"
		},
		{
			key: "activities",
			label: "Actividades"
		},
		{
			key: "pert",
			label: "Estimación PERT"
		},
		{
			key: "costEstimate",
			label: "Estimación de costos"
		},
		{
			key: "schedulePlan",
			label: "Plan del Cronograma"
		},
		{
			key: "schedule",
			label: "Cronograma y línea base"
		},
		{
			key: "cost",
			label: "Plan de Costos y BOE"
		},
		{
			key: "riskPlan",
			label: "Plan de Riesgos"
		},
		{
			key: "obs",
			label: "Organización (OBS)"
		},
		{
			key: "raci",
			label: "Matriz RACI"
		},
		{
			key: "quality",
			label: "Plan de Calidad"
		},
		{
			key: "comms",
			label: "Plan de Comunicaciones"
		},
		{
			key: "procurement",
			label: "Plan de Adquisiciones"
		}
	];
	function stableStringify(v) {
		if (v === null || v === void 0) return "null";
		if (typeof v !== "object") return JSON.stringify(v);
		if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
		const o = v;
		return "{" + Object.keys(o).sort().filter((k) => o[k] !== void 0).map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
	}
	function digestOf(v) {
		const s = stableStringify(v);
		let h1 = 3735928559, h2 = 1103547991;
		for (let i = 0; i < s.length; i++) {
			const c = s.charCodeAt(i);
			h1 = Math.imul(h1 ^ c, 2654435761);
			h2 = Math.imul(h2 ^ c, 1597334677);
		}
		h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
		h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
		return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
	}
	var emptyBase = () => ({
		has: false,
		version: "",
		date: "",
		approver: ""
	});
	function emptyFacts(today = "") {
		return {
			charter: {
				has: false,
				pct: 0,
				end: ""
			},
			scope: {
				has: false,
				state: "vacio",
				base: emptyBase(),
				notDecomposed: 0
			},
			requirements: {
				has: false,
				state: "vacio",
				base: emptyBase(),
				total: 0
			},
			wbs: {
				leaves: 0,
				state: "vacio",
				dictPct: 0,
				riesgo: 0,
				aviso: 0
			},
			schedule: {
				has: false,
				ok: true,
				activities: 0,
				duration: null,
				start: "",
				finish: "",
				critical: 0,
				base: emptyBase(),
				deviationPct: null
			},
			cost: {
				has: false,
				bac: 0,
				bacCurrent: 0,
				total: 0,
				pendingBaseline: 0,
				capex: null,
				boeStatus: "",
				boeApprovedOn: "",
				baselineVersion: "",
				baselineDate: ""
			},
			risks: {
				total: 0,
				open: 0,
				high: 0
			},
			stakeholders: {
				count: 0,
				close: 0
			},
			resources: {
				roles: 0,
				withPerson: 0,
				leaves: 0,
				withR: 0,
				withoutA: 0
			},
			changes: {
				total: 0,
				pending: 0,
				approvedOpen: 0,
				oldestPending: null
			},
			evm: {
				reports: 0,
				lastCut: ""
			},
			quality: {
				has: false,
				state: "vacio",
				needing: 0,
				verified: 0,
				checks: 0,
				coqTotal: 0
			},
			comms: {
				has: false,
				state: "vacio",
				items: 0,
				covered: 0,
				stakeholders: 0,
				closeUncovered: 0
			},
			procurement: {
				has: false,
				state: "vacio",
				items: 0,
				total: 0,
				late: 0,
				soon: 0,
				asOf: ""
			},
			projectEnd: "",
			contractualEnd: "",
			today,
			digests: {},
			plan: {
				status: "borrador",
				version: "1.0",
				approvedBy: "",
				approvedOn: "",
				snapshot: null
			}
		};
	}
	var STATE_LABEL = {
		vacio: "Sin datos",
		verde: "En orden",
		ambar: "Con avisos",
		rojo: "Con riesgos"
	};
	var pctState = (has, pct) => !has ? "vacio" : pct >= 100 ? "verde" : pct >= 50 ? "ambar" : "rojo";
	var iso$1 = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	var days = (a, b) => {
		if (!iso$1(a) || !iso$1(b)) return null;
		return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
	};
	var money$1 = (n) => Math.round(n).toLocaleString("es-PE");
	function areaRows(f) {
		const c = f.changes, s = f.schedule, k = f.cost;
		const schedState = !s.has ? "vacio" : !s.ok ? "rojo" : !s.base.has || s.deviationPct !== null && s.deviationPct > 10 ? "ambar" : "verde";
		const costState = !k.has ? "vacio" : k.capex !== null && k.total > k.capex + .5 ? "rojo" : k.boeStatus !== "aprobada" || k.pendingBaseline > 0 ? "ambar" : "verde";
		const riskState = f.risks.total === 0 ? "vacio" : f.risks.high > 0 ? "ambar" : "verde";
		const resState = f.resources.roles === 0 ? "vacio" : f.resources.withoutA > 0 || f.resources.leaves > 0 && f.resources.withR < f.resources.leaves ? "ambar" : "verde";
		const chState = c.total === 0 ? "vacio" : c.approvedOpen > 0 ? "ambar" : "verde";
		return [
			{
				key: "charter",
				label: "Acta de Constitución",
				file: "Project_Charter.html",
				state: pctState(f.charter.has, f.charter.pct),
				metric: f.charter.has ? f.charter.pct + " % completa" : "—",
				note: ""
			},
			{
				key: "requirements",
				label: "Requisitos",
				file: "Recopilar_Requisitos.html",
				state: f.requirements.state,
				metric: f.requirements.has ? f.requirements.total + " requisito(s) · " + (f.requirements.base.has ? "línea base " + f.requirements.base.version : "sin línea base") : "—",
				note: ""
			},
			{
				key: "scope",
				label: "Enunciado del Alcance",
				file: "Enunciado_del_Alcance.html",
				state: f.scope.state,
				metric: f.scope.has ? (f.scope.base.has ? "línea base v" + f.scope.base.version : "sin línea base") + (f.scope.notDecomposed ? " · " + f.scope.notDecomposed + " entregable(s) sin descomponer" : "") : "—",
				note: ""
			},
			{
				key: "wbs",
				label: "EDT y diccionario",
				file: "WBS_Builder.html",
				state: f.wbs.state,
				metric: f.wbs.leaves ? f.wbs.leaves + " paquetes · diccionario " + f.wbs.dictPct + " %" : "—",
				note: ""
			},
			{
				key: "schedule",
				label: "Cronograma",
				file: "Cronograma_CPM.html",
				state: schedState,
				metric: s.has ? (s.duration !== null ? s.duration + " d laborables" : "—") + (s.finish ? " · fin " + s.finish : "") + (s.base.has ? " · " + s.base.version : " · sin línea base") : "—",
				note: ""
			},
			{
				key: "cost",
				label: "Costos y BOE",
				file: "Cost-management.html",
				state: costState,
				metric: k.has ? "BAC " + money$1(k.bacCurrent || k.bac) + " · BOE " + (k.boeStatus || "sin datos") : "—",
				note: ""
			},
			{
				key: "risks",
				label: "Riesgos",
				file: "Risk_Register.html",
				state: riskState,
				metric: f.risks.total ? f.risks.open + " abiertos · " + f.risks.high + " de nivel alto" : "—",
				note: ""
			},
			{
				key: "stakeholders",
				label: "Interesados",
				file: "Stakeholder_Studio.html",
				state: f.stakeholders.count ? "verde" : "vacio",
				metric: f.stakeholders.count ? f.stakeholders.count + " interesado(s) · " + f.stakeholders.close + " a gestionar de cerca" : "—",
				note: ""
			},
			{
				key: "resources",
				label: "Equipo y responsabilidades",
				file: "RACI_Matrix.html",
				state: resState,
				metric: f.resources.roles ? f.resources.roles + " puestos · " + f.resources.withR + "/" + f.resources.leaves + " paquetes con responsable" : "—",
				note: ""
			},
			{
				key: "changes",
				label: "Control integrado de cambios",
				file: "Control_Cambios.html",
				state: chState,
				metric: c.total ? c.pending + " pendiente(s) · " + c.approvedOpen + " aprobada(s) sin implementar" : "—",
				note: ""
			},
			{
				key: "evm",
				label: "Valor ganado",
				file: "Valor_Ganado.html",
				state: f.evm.reports ? "verde" : "vacio",
				metric: f.evm.reports ? f.evm.reports + " corte(s) · último " + f.evm.lastCut : "—",
				note: ""
			},
			{
				key: "quality",
				label: "Plan de Calidad",
				file: "Plan_Calidad.html",
				state: f.quality.state,
				metric: f.quality.has ? f.quality.verified + "/" + f.quality.needing + " paquetes verificados · " + f.quality.checks + " control(es) · costo de la calidad " + money$1(f.quality.coqTotal) : "—",
				note: ""
			},
			{
				key: "comms",
				label: "Plan de Comunicaciones",
				file: "Plan_Comunicaciones.html",
				state: f.comms.state,
				metric: f.comms.has ? f.comms.items + " comunicación(es) · " + f.comms.covered + "/" + f.comms.stakeholders + " interesados cubiertos" : "—",
				note: ""
			},
			{
				key: "procurement",
				label: "Plan de Adquisiciones",
				file: "Plan_Adquisiciones.html",
				state: f.procurement.state,
				metric: f.procurement.has ? f.procurement.items + " adquisición(es) · " + money$1(f.procurement.total) + " · " + f.procurement.late + " convocatoria(s) vencida(s)" : "—",
				note: ""
			}
		];
	}
	function snapshotOf(f) {
		return {
			scopeVersion: f.scope.base.has ? f.scope.base.version : "",
			scopeDate: f.scope.base.date,
			requirementsVersion: f.requirements.base.has ? f.requirements.base.version : "",
			scheduleVersion: f.schedule.base.has ? f.schedule.base.version : "",
			scheduleDate: f.schedule.base.date,
			scheduleFinish: f.schedule.finish,
			bacCurrent: Math.round((f.cost.bacCurrent || f.cost.bac) * 100) / 100,
			costBaseline: f.cost.baselineVersion,
			boeStatus: f.cost.boeStatus,
			digests: { ...f.digests }
		};
	}
	function snapshotDiff(a, b) {
		const out = [], d = (label, x, y) => {
			if (String(x) !== String(y)) out.push({
				label,
				from: String(x || "—"),
				to: String(y || "—")
			});
		};
		d("Línea base del alcance", a.scopeVersion, b.scopeVersion);
		d("Línea base de requisitos", a.requirementsVersion, b.requirementsVersion);
		d("Línea base del cronograma", a.scheduleVersion, b.scheduleVersion);
		d("Fin del cronograma", a.scheduleFinish, b.scheduleFinish);
		d("BAC vigente", money$1(a.bacCurrent), money$1(b.bacCurrent));
		d("Línea base de costos", a.costBaseline, b.costBaseline);
		d("Estado de la BOE", a.boeStatus, b.boeStatus);
		if (a.digests) PLAN_COMPONENTS.forEach((c) => {
			if (a.digests[c.key] !== void 0 && a.digests[c.key] !== (b.digests || {})[c.key]) out.push({
				label: c.label,
				from: "aprobado",
				to: "modificado"
			});
		});
		return out;
	}
	function integrationFindings(f) {
		const out = [], F = (code, severity, area, text) => {
			out.push({
				code,
				severity,
				area,
				text
			});
		};
		const s = f.schedule, k = f.cost, anyData = f.scope.has || s.has || k.has || f.wbs.leaves > 0;
		if (!f.charter.has && anyData) F("P1", "aviso", "Acta", "El proyecto tiene planes y líneas base pero no un Acta de Constitución que los autorice y fije sus objetivos y restricciones.");
		if (f.scope.has && !f.scope.base.has) F("P2", "aviso", "Alcance", "El Enunciado del Alcance no tiene línea base: el alcance del plan no está congelado y no hay contra qué controlar los cambios de alcance.");
		if (f.requirements.has && !f.requirements.base.has) F("P2", "aviso", "Requisitos", "La matriz de requisitos no tiene línea base: los cambios a los requisitos no se distinguen de la definición inicial.");
		if (s.has && s.ok && !s.base.has) F("P3", "aviso", "Cronograma", "El cronograma no tiene línea base (LB-n): no se puede medir el avance ni la variación del plazo.");
		if (k.has && k.boeStatus !== "aprobada") F("P4", "aviso", "Costos", "La Basis of Estimate no está aprobada" + (k.boeStatus ? " (" + k.boeStatus + ")" : "") + ": la línea base de costos no tiene su documento de sustento aprobado.");
		const sd = f.scope.base.date, td = s.base.date;
		if (sd && td && sd > td) F("P5", "aviso", "Integración", "La línea base del alcance (v" + f.scope.base.version + ", " + sd + ") es posterior a la del cronograma (" + s.base.version + ", " + td + "): el cronograma no refleja el alcance vigente.");
		if (sd && f.cost.boeApprovedOn && sd > f.cost.boeApprovedOn) F("P5", "aviso", "Integración", "La línea base del alcance (" + sd + ") es posterior a la aprobación de la BOE (" + f.cost.boeApprovedOn + "): el presupuesto no refleja el alcance vigente.");
		const dr = f.scope.drift;
		if (f.scope.base.has && dr) {
			if (!dr.wbsInBaseline) F("P22", "aviso", "Alcance", "La línea base del alcance v" + f.scope.base.version + " se congeló sin la EDT y su diccionario: no se puede comprobar si los paquetes cambiaron desde la aprobación. Fija una nueva versión (con motivo y aprobador) que los incluya.");
			else if (dr.wbsChanges > 0 || dr.enunciadoChanged) F("P21", "aviso", "Alcance", "El trabajo en edición difiere de la línea base del alcance v" + f.scope.base.version + ": " + (dr.wbsChanges ? dr.wbsChanges + " cambio(s) en la EDT y su diccionario" : "") + (dr.wbsChanges && dr.enunciadoChanged ? " y " : "") + (dr.enunciadoChanged ? "cambios en el enunciado" : "") + ". El plan describe un alcance que no es el aprobado: fija una nueva versión de la línea base (con motivo y aprobación).");
		}
		if (f.changes.approvedOpen > 0) F("P6", "aviso", "Cambios", f.changes.approvedOpen + " solicitud(es) de cambio aprobada(s) aún sin implementar: sus líneas base (alcance, cronograma o costo) no están actualizadas.");
		const end = f.contractualEnd || f.projectEnd, over = s.finish && end ? days(end, s.finish) : null;
		if (over !== null && over > 0) F("P7", "aviso", "Cronograma", "El cronograma termina el " + s.finish + ", " + over + " día(s) después de la fecha de fin del proyecto (" + end + "): el plazo comprometido no es alcanzable con el plan actual.");
		if (k.capex !== null && k.total > k.capex + .5) F("P8", "aviso", "Costos", "El presupuesto total (" + money$1(k.total) + ") supera el CAPEX autorizado (" + money$1(k.capex) + "): requiere reconciliación o una autorización adicional.");
		if (f.changes.oldestPending !== null && f.changes.oldestPending > 14) F("P9", "info", "Cambios", "Hay solicitudes de cambio pendientes hace más de 14 días (la más antigua, " + f.changes.oldestPending + "): el plan puede estar desactualizado respecto de la realidad.");
		if (f.risks.total === 0 && (s.has || k.has)) F("P10", "aviso", "Riesgos", "El plan no tiene Registro de Riesgos: la contingencia y el plazo no tienen sustento en riesgos identificados.");
		if (f.procurement.late > 0) F("P15", "aviso", "Adquisiciones", f.procurement.late + " adquisición(es) con la convocatoria ya vencida a la fecha de corte " + f.procurement.asOf + ": el suministro llegará después de lo que el cronograma necesita.");
		if (f.quality.has && f.quality.needing > f.quality.verified) F("P16", "aviso", "Calidad", f.quality.needing - f.quality.verified + " paquete(s) con criterio de aceptación sin ninguna actividad que lo verifique: el plan de calidad no cubre lo que el alcance promete entregar.");
		if (f.comms.closeUncovered > 0) F("P18", "aviso", "Comunicaciones", f.comms.closeUncovered + " interesado(s) a gestionar de cerca sin ninguna comunicación planificada.");
		const bac = f.cost.bacCurrent || f.cost.bac;
		if (f.procurement.has && bac > 0 && f.procurement.total > bac) F("P19", "aviso", "Adquisiciones", "El valor estimado de las adquisiciones (" + money$1(f.procurement.total) + ") supera el BAC vigente (" + money$1(bac) + "): concilia los contratos con el presupuesto.");
		if (anyData) [
			["quality", "Calidad"],
			["comms", "Comunicaciones"],
			["procurement", "Adquisiciones"]
		].forEach(([k, n]) => {
			if (!f[k].has) F("P17", "info", n, "El Plan de " + n + " aún no está elaborado: el plan para la dirección se aprueba con sus planes subsidiarios.");
		});
		if (s.base.has && s.deviationPct !== null && s.deviationPct > 10) F("P11", "aviso", "Cronograma", "El pronóstico del cronograma se desvía " + Math.round(s.deviationPct * 10) / 10 + " % de su línea base: evalúa un cambio (o una nueva línea base) antes de aprobar el plan.");
		if (f.plan.status === "aprobado") {
			if (!f.plan.approvedBy.trim() || !f.plan.approvedOn) F("P14", "riesgo", "Plan", "El plan figura «aprobado» sin registrar quién lo aprueba y en qué fecha.");
			if (f.plan.snapshot) {
				const diff = snapshotDiff(f.plan.snapshot, snapshotOf(f));
				if (diff.length) F("P12", "riesgo", "Plan", "El plan aprobado (v" + f.plan.version + (f.plan.approvedOn ? ", " + f.plan.approvedOn : "") + ") tiene CAMBIOS SIN APROBAR desde su aprobación: " + diff.map((x) => x.label + " " + x.from + " → " + x.to).join("; ") + ". El documento aprobado se conserva tal como se aprobó; los cambios vigentes forman un borrador que necesita una nueva versión aprobada.");
				if (!f.plan.snapshot.digests || !f.plan.docPreserved) F("P20", "aviso", "Plan", "El plan v" + f.plan.version + " se aprobó antes de conservar su contenido (huellas de cada plan y documento aprobado): no se puede demostrar que el documento actual sea el aprobado. Crea una nueva versión y apruébala para conservar su contenido.");
			}
		} else if (s.base.has && f.scope.base.has && k.boeStatus === "aprobada") F("P13", "info", "Plan", "Las líneas base de alcance, cronograma y costo existen y la BOE está aprobada: el plan puede aprobarse como un conjunto.");
		return out;
	}
	function approvalBlockers(f) {
		const b = [];
		if (!f.scope.base.has) b.push("falta la línea base del alcance");
		if (!f.schedule.base.has) b.push("falta la línea base del cronograma");
		if (!f.cost.has) b.push("falta el presupuesto (línea base de costos)");
		return b;
	}
	//#endregion
	//#region src/shared/scope-baseline.ts
	var str$4 = (v) => v === null || v === void 0 ? "" : String(v);
	var rec$3 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	function wbsScopeOf(wbs) {
		const w = rec$3(wbs), nodes = rec$3(w.nodes), rootId = str$4(w.rootId);
		if (!rootId || !nodes[rootId]) return null;
		const out = {};
		Object.keys(nodes).forEach((id) => {
			const n = rec$3(nodes[id]);
			out[id] = {
				name: str$4(n.name),
				children: (Array.isArray(n.children) ? n.children : []).map(str$4),
				delId: str$4(n.delId),
				notes: str$4(n.notes),
				acceptance: str$4(n.acceptance),
				loe: !!n.loe
			};
		});
		return {
			rootId,
			nodes: out
		};
	}
	function normalizeWbsScope(o) {
		return wbsScopeOf(o);
	}
	function wbsScopeCodes(s) {
		const codes = {}, seen = /* @__PURE__ */ new Set();
		const walk = (id, prefix) => {
			const n = s.nodes[id];
			if (!n || seen.has(id)) return;
			seen.add(id);
			n.children.forEach((c, i) => {
				const code = (prefix ? prefix + "." : "") + (i + 1);
				if (s.nodes[c]) {
					codes[c] = code;
					walk(c, code);
				}
			});
		};
		walk(s.rootId, "");
		return codes;
	}
	var parentMap = (s) => {
		const p = {};
		Object.keys(s.nodes).forEach((id) => s.nodes[id].children.forEach((c) => {
			p[c] = id;
		}));
		return p;
	};
	function wbsScopeDiff(frozen, live) {
		const out = [], fc = wbsScopeCodes(frozen), lc = live ? wbsScopeCodes(live) : {}, fp = parentMap(frozen), lp = live ? parentMap(live) : {};
		Object.keys(frozen.nodes).forEach((id) => {
			if (id === frozen.rootId) return;
			const a = frozen.nodes[id], b = live ? live.nodes[id] : void 0;
			if (!b) {
				out.push({
					id,
					code: fc[id] || "",
					name: a.name,
					kind: "eliminado",
					detail: "ya no está en la EDT vigente"
				});
				return;
			}
			if (a.name !== b.name) out.push({
				id,
				code: lc[id] || fc[id] || "",
				name: b.name,
				kind: "renombrado",
				detail: "«" + a.name + "» → «" + b.name + "»"
			});
			if ((fp[id] || "") !== (lp[id] || "")) out.push({
				id,
				code: lc[id] || "",
				name: b.name,
				kind: "movido",
				detail: "cambió de padre en la estructura" + (fc[id] !== lc[id] ? " (" + (fc[id] || "—") + " → " + (lc[id] || "—") + ")" : "")
			});
			const fields = [];
			if (a.notes !== b.notes) fields.push("descripción del trabajo");
			if (a.acceptance !== b.acceptance) fields.push("criterio de aceptación");
			if (a.loe !== b.loe) fields.push("esfuerzo continuo (LOE)");
			if (a.delId !== b.delId) fields.push("entregable al que responde");
			if (fields.length) out.push({
				id,
				code: lc[id] || fc[id] || "",
				name: b.name,
				kind: "diccionario",
				detail: "cambió " + fields.join(", ")
			});
		});
		if (live) Object.keys(live.nodes).forEach((id) => {
			if (id !== live.rootId && !frozen.nodes[id]) out.push({
				id,
				code: lc[id] || "",
				name: live.nodes[id].name,
				kind: "agregado",
				detail: "no estaba en la EDT aprobada"
			});
		});
		return out;
	}
	function snapOf(v) {
		if (!v || typeof v !== "object") return null;
		const s = { ...v };
		if (s.wbs !== void 0) s.wbs = normalizeWbsScope(s.wbs);
		return s;
	}
	function normalizeScopeBaseline(o) {
		const x = rec$3(o);
		return {
			frozen: !!x.frozen,
			version: str$4(x.version) || "1.0",
			date: str$4(x.date),
			approver: str$4(x.approver),
			reason: str$4(x.reason),
			snapshot: snapOf(x.snapshot),
			history: (Array.isArray(x.history) ? x.history : []).filter((h) => h && typeof h === "object").map((h) => {
				const q = rec$3(h);
				return {
					version: str$4(q.version),
					date: str$4(q.date),
					approver: str$4(q.approver),
					reason: str$4(q.reason),
					supersededOn: str$4(q.supersededOn),
					snapshot: snapOf(q.snapshot)
				};
			})
		};
	}
	var ENUNCIADO = [
		"deliverables",
		"assumptions",
		"constraints",
		"exclusions",
		"productScope",
		"projectScope"
	];
	function scopeDriftOf(baseline, live, wbs) {
		if (!baseline.frozen || !baseline.snapshot) return {
			frozen: false,
			version: baseline.version,
			wbsInBaseline: false,
			wbsChanges: [],
			enunciadoChanged: false,
			total: 0
		};
		const snap = baseline.snapshot, lv = live;
		const enunciadoChanged = ENUNCIADO.some((k) => stableStringify(snap[k] === void 0 ? null : snap[k]) !== stableStringify(lv[k] === void 0 ? null : lv[k]));
		const frozenWbs = snap.wbs || null, wbsChanges = frozenWbs ? wbsScopeDiff(frozenWbs, wbsScopeOf(wbs)) : [];
		return {
			frozen: true,
			version: baseline.version,
			wbsInBaseline: !!frozenWbs,
			wbsChanges,
			enunciadoChanged,
			total: wbsChanges.length + (enunciadoChanged ? 1 : 0)
		};
	}
	//#endregion
	//#region src/shared/comms-plan.ts
	var HIGH_FREQ = ["Diaria", "Semanal"];
	var str$3 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs$2 = (v) => Array.isArray(v) ? v.map(str$3).filter(Boolean) : [];
	function normalizeItem$1(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {}, id = str$3(x.id) || fallbackId;
		return {
			id,
			code: str$3(x.code) || id,
			info: str$3(x.info),
			purpose: str$3(x.purpose),
			stkIds: strs$2(x.stkIds),
			audience: str$3(x.audience),
			sender: str$3(x.sender),
			frequency: str$3(x.frequency),
			method: str$3(x.method),
			channel: str$3(x.channel),
			storage: str$3(x.storage),
			notes: str$3(x.notes)
		};
	}
	function normalizeComms(raw) {
		const x = raw && typeof raw === "object" ? raw : {}, p = x.plan && typeof x.plan === "object" ? x.plan : {};
		const items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem$1(o, "cm" + (i + 1)));
		return {
			items,
			plan: {
				escalation: str$3(p.escalation),
				restrictions: str$3(p.restrictions),
				review: str$3(p.review)
			},
			idCounter: Number(x.idCounter) || items.length + 1
		};
	}
	function coverage$1(items, f) {
		return f.stakeholders.map((s) => ({
			stk: s,
			items: items.filter((c) => c.stkIds.indexOf(s.id) >= 0),
			gap: s.engCurrent !== null && s.engDesired !== null ? s.engDesired - s.engCurrent : null
		}));
	}
	function commFindings(d, f) {
		const out = [], F = (code, severity, itemId, text) => {
			out.push({
				code,
				severity,
				itemId,
				text
			});
		};
		const known = new Set(f.stakeholders.map((s) => s.id)), roles = new Set(f.roles.map((r) => r.toLowerCase()));
		d.items.forEach((c) => {
			const w = c.code + (c.info.trim() ? " «" + c.info.trim() + "»" : "");
			if (!c.info.trim() || !c.purpose.trim()) F("M4", "aviso", c.id, w + ": falta qué información se comunica o para qué (sin propósito no se puede juzgar si hace falta).");
			if (!c.stkIds.length && !c.audience.trim()) F("M5", "aviso", c.id, w + ": no tiene destinatarios (elige interesados o describe la audiencia).");
			if (c.stkIds.some((i) => !known.has(i)) && known.size) F("M6", "aviso", c.id, w + ": apunta a un interesado que ya no existe en Stakeholder Studio.");
			if (!c.sender.trim()) F("M7", "aviso", c.id, w + ": no dice quién la emite.");
			else if (roles.size && !roles.has(c.sender.trim().toLowerCase())) F("M7", "info", c.id, w + ": el emisor «" + c.sender + "» no figura entre los puestos del OBS.");
			if (!c.frequency || !c.method) F("M8", "aviso", c.id, w + ": falta la frecuencia o el medio.");
			if (!c.storage.trim()) F("M9", "info", c.id, w + ": no dice dónde queda el registro (acta, informe archivado): sin registro no hay evidencia de que se comunicó.");
		});
		coverage$1(d.items, f).forEach((r) => {
			const s = r.stk;
			if (!r.items.length) {
				if (s.quadrant === "cerca") F("M1", "riesgo", null, "«" + s.name + "» es un interesado a gestionar de cerca y no recibe ninguna comunicación planificada.");
				else if (r.gap !== null && r.gap > 0) F("M2", "aviso", null, "«" + s.name + "» debe pasar del compromiso " + s.engCurrent + " al " + s.engDesired + " y ninguna comunicación va dirigida a ellos.");
				else F("M3", "info", null, "«" + s.name + "» no figura como destinatario de ninguna comunicación.");
			} else if (r.gap !== null && r.gap >= 2 && r.items.every((c) => c.frequency === "Única vez" || c.frequency === "Por evento")) F("M2", "aviso", null, "«" + s.name + "» tiene una brecha de compromiso de " + r.gap + " niveles y solo recibe comunicaciones puntuales: un cambio de actitud necesita contacto sostenido.");
			if (s.quadrant === "monitorear" && r.items.some((c) => HIGH_FREQ.indexOf(c.frequency) >= 0)) F("M10", "info", null, "«" + s.name + "» es un interesado a solo monitorear y recibe comunicaciones diarias o semanales: se sobrecomunica.");
		});
		if (d.items.length && !d.plan.escalation.trim()) F("M11", "aviso", null, "El plan no define la ruta de escalamiento de los asuntos de comunicación (a quién y en cuánto tiempo).");
		if (d.items.length && !d.plan.review.trim()) F("M12", "info", null, "El plan no dice cómo ni cuándo se revisa y actualiza la matriz (p. ej. tras cada cambio de interesados).");
		return out;
	}
	function commState(d, f) {
		if (!d.items.length) return "vacio";
		const fs = commFindings(d, f);
		return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
	}
	//#endregion
	//#region src/shared/quality-plan.ts
	var COQ_CATS = [
		"prevencion",
		"evaluacion",
		"falla_interna",
		"falla_externa"
	];
	var COQ_LABEL = {
		prevencion: "Prevención",
		evaluacion: "Evaluación",
		falla_interna: "Fallas internas",
		falla_externa: "Fallas externas"
	};
	var str$2 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs$1 = (v) => Array.isArray(v) ? v.map(str$2).filter(Boolean) : [];
	var numOrNull$1 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec$2 = (o) => o && typeof o === "object" ? o : {};
	function normalizeMetric(o, fb) {
		const x = rec$2(o), id = str$2(x.id) || fb;
		return {
			id,
			code: str$2(x.code) || id,
			name: str$2(x.name),
			wbsIds: strs$1(x.wbsIds),
			definition: str$2(x.definition),
			target: str$2(x.target),
			tolerance: str$2(x.tolerance),
			method: str$2(x.method),
			frequency: str$2(x.frequency),
			owner: str$2(x.owner)
		};
	}
	function normalizeCheck(o, fb) {
		const x = rec$2(o), id = str$2(x.id) || fb;
		return {
			id,
			code: str$2(x.code) || id,
			wbsId: str$2(x.wbsId),
			what: str$2(x.what),
			criterion: str$2(x.criterion),
			kind: str$2(x.kind),
			method: str$2(x.method),
			frequency: str$2(x.frequency),
			owner: str$2(x.owner),
			record: str$2(x.record),
			metricId: str$2(x.metricId)
		};
	}
	function normalizeCoq(o, fb) {
		const x = rec$2(o);
		return {
			id: str$2(x.id) || fb,
			cat: COQ_CATS.indexOf(x.cat) >= 0 ? x.cat : "prevencion",
			description: str$2(x.description),
			amount: numOrNull$1(x.amount)
		};
	}
	function normalizeQuality(raw) {
		const x = rec$2(raw), metrics = (Array.isArray(x.metrics) ? x.metrics : []).map((o, i) => normalizeMetric(o, "qm" + (i + 1))), checks = (Array.isArray(x.checks) ? x.checks : []).map((o, i) => normalizeCheck(o, "qc" + (i + 1)));
		const coq = (Array.isArray(x.coq) ? x.coq : []).map((o, i) => normalizeCoq(o, "cq" + (i + 1)));
		return {
			policy: str$2(x.policy),
			standards: str$2(x.standards),
			metrics,
			checks,
			coq,
			idCounter: Number(x.idCounter) || metrics.length + checks.length + coq.length + 1
		};
	}
	function coqSummary(coq, baseCost) {
		const byCat = {
			prevencion: 0,
			evaluacion: 0,
			falla_interna: 0,
			falla_externa: 0
		};
		coq.forEach((c) => {
			byCat[c.cat] += c.amount || 0;
		});
		const conformity = byCat.prevencion + byCat.evaluacion, nonConformity = byCat.falla_interna + byCat.falla_externa, total = conformity + nonConformity;
		return {
			byCat,
			conformity,
			nonConformity,
			total,
			pctOfBase: baseCost && baseCost > 0 ? total / baseCost * 100 : null,
			failureShare: total > 0 ? nonConformity / total * 100 : null
		};
	}
	function coverage(d, f) {
		const hr = new Set(f.highRiskLeafIds);
		return f.leaves.map((l) => ({
			leaf: l,
			checks: d.checks.filter((c) => c.wbsId === l.id),
			needs: !l.loe && !!l.acceptance.trim(),
			highRisk: hr.has(l.id)
		}));
	}
	function qualityFindings(d, f) {
		const out = [], F = (code, severity, text) => {
			out.push({
				code,
				severity,
				text
			});
		};
		const leafBy = new Map(f.leaves.map((l) => [l.id, l])), roles = new Set(f.roles.map((r) => r.toLowerCase()));
		if (!(d.checks.length || d.metrics.length || d.coq.length)) return out;
		coverage(d, f).filter((r) => r.needs).filter((r) => !r.checks.length).forEach((r) => {
			if (r.highRisk) F("Q2", "riesgo", "El paquete " + r.leaf.code + " «" + r.leaf.name + "» tiene un riesgo alto abierto y ninguna actividad de control o aseguramiento: nada verifica su criterio de aceptación.");
			else F("Q1", "aviso", "El paquete " + r.leaf.code + " «" + r.leaf.name + "» tiene criterio de aceptación («" + r.leaf.acceptance.trim().slice(0, 70) + (r.leaf.acceptance.trim().length > 70 ? "…" : "") + "») pero ninguna actividad que lo verifique.");
		});
		d.checks.forEach((c) => {
			const w = c.code + (c.what.trim() ? " «" + c.what.trim() + "»" : "");
			if (!c.wbsId || !leafBy.has(c.wbsId)) F("Q8", "aviso", w + ": no apunta a un paquete de trabajo de la EDT" + (c.wbsId ? " (el paquete ya no existe)" : "") + ".");
			if (!c.what.trim() || !c.criterion.trim() || !c.method || !c.frequency.trim() || !c.owner.trim()) F("Q4", "aviso", w + ": incompleta (falta qué se verifica, el criterio, el método, la frecuencia o el responsable).");
			else if (roles.size && !roles.has(c.owner.trim().toLowerCase())) F("Q6", "info", w + ": el responsable «" + c.owner + "» no figura entre los puestos del OBS.");
			if (!c.record.trim()) F("Q5", "info", w + ": no dice qué registro deja (informe de ensayo, protocolo, acta): sin registro no hay evidencia de conformidad.");
			if (c.metricId && !d.metrics.some((m) => m.id === c.metricId)) F("Q8", "aviso", w + ": apunta a una métrica que ya no existe.");
		});
		d.metrics.forEach((m) => {
			const w = m.code + (m.name.trim() ? " «" + m.name.trim() + "»" : "");
			if (!m.name.trim() || !m.target.trim() || !m.method) F("Q7", "aviso", w + ": una métrica necesita nombre, objetivo medible y método de medición.");
			if (!d.checks.some((c) => c.metricId === m.id)) F("Q7", "info", w + ": ninguna actividad de control la usa: no se está midiendo.");
		});
		if (d.checks.length && !d.checks.some((c) => c.kind === "Aseguramiento")) F("Q9", "info", "Todo el plan es control (detectar defectos): falta aseguramiento de la calidad (prevenir: revisiones de diseño, auditorías del proceso).");
		if (d.checks.length && !d.policy.trim()) F("Q11", "info", "El plan no declara la política de calidad del proyecto.");
		if (d.checks.length && !d.standards.trim()) F("Q11", "info", "El plan no lista las normas y especificaciones que definen la conformidad.");
		const s = coqSummary(d.coq, f.baseCost);
		if (d.checks.length && !d.coq.length) F("Q10", "aviso", "El plan de control y aseguramiento no tiene costo de la calidad: no se sabe cuánto cuesta prevenir y evaluar ni cuánto se reserva por fallas.");
		if (d.coq.length && s.byCat.prevencion <= 0) F("Q10", "aviso", "El costo de la calidad no invierte nada en prevención: es lo que más barato evita fallas (evaluar solo detecta el defecto ya hecho).");
		if (d.coq.length && s.failureShare !== null && s.failureShare > 50) F("Q10", "aviso", "Más de la mitad del costo de la calidad (" + Math.round(s.failureShare) + " %) es por fallas: el plan gasta más en corregir que en prevenir y evaluar.");
		if (d.coq.some((c) => c.amount === null)) F("Q10", "info", "Hay partidas del costo de la calidad sin monto.");
		return out;
	}
	function qualityState(d, f) {
		if (!(d.checks.length || d.metrics.length || d.coq.length)) return "vacio";
		const fs = qualityFindings(d, f);
		return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
	}
	//#endregion
	//#region src/shared/procurement-plan.ts
	var STATUSES = [
		"Planificada",
		"Convocada",
		"Adjudicada",
		"Contratada",
		"Entregada"
	];
	var STATUS_RANK = {
		Planificada: 0,
		Convocada: 1,
		Adjudicada: 2,
		Contratada: 3,
		Entregada: 4
	};
	var FIXED_PRICE = ["Precio fijo (FFP)", "Precio fijo con ajuste económico (FPEPA)"];
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs = (v) => Array.isArray(v) ? v.map(str$1).filter(Boolean) : [];
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec$1 = (o) => o && typeof o === "object" ? o : {};
	var iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeItem(o, fb) {
		const x = rec$1(o), id = str$1(x.id) || fb;
		return {
			id,
			code: str$1(x.code) || id,
			name: str$1(x.name),
			wbsIds: strs(x.wbsIds),
			full: x.full === false ? false : true,
			decision: str$1(x.decision),
			contractType: str$1(x.contractType),
			selection: str$1(x.selection),
			criteria: (Array.isArray(x.criteria) ? x.criteria : []).map((c) => {
				const q = rec$1(c);
				return {
					name: str$1(q.name),
					weight: numOrNull(q.weight)
				};
			}),
			value: numOrNull(x.value),
			needDate: str$1(x.needDate),
			leadDays: numOrNull(x.leadDays),
			selectionDays: numOrNull(x.selectionDays),
			supplier: str$1(x.supplier),
			status: STATUS_RANK[str$1(x.status)] !== void 0 ? str$1(x.status) : "Planificada",
			owner: str$1(x.owner),
			awardDate: str$1(x.awardDate),
			riskIds: strs(x.riskIds),
			notes: str$1(x.notes)
		};
	}
	function normalizeProcurement(raw, today = "") {
		const x = rec$1(raw), items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "pr" + (i + 1)));
		return {
			strategy: str$1(x.strategy),
			performance: str$1(x.performance),
			approvals: str$1(x.approvals),
			asOf: iso(str$1(x.asOf)) ? str$1(x.asOf) : today,
			items,
			idCounter: Number(x.idCounter) || items.length + 1
		};
	}
	var day = (s) => Date.parse(s + "T12:00:00Z");
	var addDays = (s, n) => new Date(day(s) + n * 864e5).toISOString().slice(0, 10);
	var daysBetween = (a, b) => iso(a) && iso(b) ? Math.round((day(b) - day(a)) / 864e5) : null;
	function launchBy(it) {
		if (!iso(it.needDate) || it.leadDays === null || it.selectionDays === null) return null;
		return addDays(it.needDate, -(it.leadDays + it.selectionDays));
	}
	var isBuy = (it) => it.decision !== "Hacer (recursos propios)";
	var criteriaSum = (it) => it.criteria.reduce((s, c) => s + (c.weight || 0), 0);
	function summary(d, f) {
		const byStatus = {};
		STATUSES.forEach((s) => {
			byStatus[s] = 0;
		});
		let total = 0, late = 0, soon = 0;
		d.items.forEach((it) => {
			byStatus[it.status]++;
			total += it.value || 0;
			const lb = launchBy(it), left = lb ? daysBetween(d.asOf, lb) : null;
			if (it.status === "Planificada" && left !== null) {
				if (left < 0) late++;
				else if (left <= 30) soon++;
			}
		});
		return {
			total,
			count: d.items.length,
			byStatus,
			pctOfBase: f.baseCost && f.baseCost > 0 ? total / f.baseCost * 100 : null,
			late,
			soon
		};
	}
	function procurementFindings(d, f) {
		const out = [], F = (code, severity, itemId, text) => {
			out.push({
				code,
				severity,
				itemId,
				text
			});
		};
		const roles = new Set(f.roles.map((r) => r.toLowerCase())), leafBy = new Map(f.leaves.map((l) => [l.id, l])), sup = new Set(f.suppliers.map((s) => s.toLowerCase()));
		d.items.forEach((it) => {
			const w = it.code + (it.name.trim() ? " «" + it.name.trim() + "»" : ""), buy = isBuy(it), rank = STATUS_RANK[it.status];
			if (!it.name.trim() || !it.decision) F("P2", "aviso", it.id, w + ": falta el nombre o la decisión hacer o comprar.");
			if (it.wbsIds.some((i) => !leafBy.has(i)) && f.leaves.length) F("P2", "aviso", it.id, w + ": apunta a un paquete de la EDT que ya no existe.");
			if (!it.wbsIds.length) F("P2", "info", it.id, w + ": no dice qué paquetes de la EDT cubre.");
			if (!it.owner.trim()) F("P10", "aviso", it.id, w + ": no tiene responsable de la adquisición.");
			else if (roles.size && !roles.has(it.owner.trim().toLowerCase())) F("P10", "info", it.id, w + ": el responsable «" + it.owner + "» no figura entre los puestos del OBS.");
			if (!buy) return;
			const lb = launchBy(it);
			if (lb === null) F("P3", "aviso", it.id, w + ": sin fecha requerida o sin plazos (del proveedor y de selección) no se puede calcular cuándo convocar.");
			else if (it.status === "Planificada") {
				const left = daysBetween(d.asOf, lb);
				if (left < 0) F("P1", "riesgo", it.id, w + ": la convocatoria debió lanzarse el " + lb + " (hace " + -left + " días respecto de la fecha de corte " + d.asOf + ") para tener el suministro el " + it.needDate + " y sigue «Planificada»: la fecha de necesidad ya no se sostiene.");
				else if (left <= 30) F("P1", "info", it.id, w + ": la convocatoria debe lanzarse antes del " + lb + " (" + left + " días desde la fecha de corte).");
			}
			if (!it.contractType) F("P4", "aviso", it.id, w + ": falta el tipo de contrato.");
			else if (FIXED_PRICE.indexOf(it.contractType) >= 0 && f.estimateClass !== null && f.estimateClass >= 4) F("P4", "aviso", it.id, w + ": un contrato de precio fijo traslada el riesgo de costo al proveedor y exige un alcance bien definido; el estimado del proyecto es de clase " + f.estimateClass + " (definición insuficiente): el proveedor lo cotizará con un sobreprecio o reclamará después.");
			if (!it.selection) F("P5", "aviso", it.id, w + ": falta el método de selección del proveedor.");
			else if (it.selection === "Adjudicación directa") F("P5", "info", it.id, w + ": adjudicación directa: deja escrita la justificación (proveedor único, urgencia, monto menor) en las notas.");
			else {
				const sum = criteriaSum(it);
				if (!it.criteria.length) F("P5", "aviso", it.id, w + ": no define los criterios de selección con su peso.");
				else if (Math.abs(sum - 100) > .001 || it.criteria.some((c) => !c.name.trim() || c.weight === null)) F("P5", "aviso", it.id, w + ": los criterios de selección deben tener nombre y peso, y sumar 100 (suman " + Math.round(sum * 100) / 100 + ").");
				else if (it.criteria.length < 3) F("P5", "info", it.id, w + ": solo " + it.criteria.length + " criterio(s): la selección se apoya en algo más que el precio (capacidad técnica, plazo, experiencia).");
			}
			const edt = it.wbsIds.map((i) => leafBy.get(i)).filter((l) => !!l).reduce((s, l) => s + l.cost, 0);
			if (it.value === null) F("P6", "aviso", it.id, w + ": falta el valor estimado.");
			else if (it.full && edt > 0 && Math.abs(it.value - edt) / edt * 100 > 10) F("P6", "aviso", it.id, w + ": el valor estimado (" + Math.round(it.value).toLocaleString("es-PE") + ") difiere más de 10 % del costo de los paquetes que cubre en la EDT (" + Math.round(edt).toLocaleString("es-PE") + "): concilia el presupuesto con el contrato.");
			if (rank >= STATUS_RANK.Adjudicada && (!it.supplier.trim() || !iso(it.awardDate))) F("P7", "aviso", it.id, w + ": está «" + it.status + "» pero no registra el proveedor o la fecha de adjudicación.");
			else if (it.supplier.trim() && sup.size && !sup.has(it.supplier.trim().toLowerCase())) F("P12", "info", it.id, w + ": el proveedor «" + it.supplier + "» no figura en el OBS ni entre los interesados: regístralo para gestionar su compromiso.");
			const cited = new Set(it.riskIds);
			f.risks.filter((r) => r.high && r.threat && r.wbsIds.some((i) => it.wbsIds.indexOf(i) >= 0) && !cited.has(r.id)).forEach((r) => F("P8", "info", it.id, w + ": el riesgo alto " + r.code + " «" + r.title + "» afecta sus paquetes y no lo cita: define si el contrato lo transfiere, lo mitiga o lo acepta."));
			if (it.riskIds.some((i) => !f.risks.some((r) => r.id === i)) && f.risks.length) F("P8", "info", it.id, w + ": cita un riesgo que ya no está abierto en el Registro de Riesgos.");
		});
		if (d.items.length && !d.strategy.trim()) F("P13", "info", null, "El plan no declara la estrategia de adquisiciones (qué se compra, qué se hace, cómo se contrata en general).");
		if (d.items.length && !d.performance.trim()) F("P13", "info", null, "El plan no dice cómo se mide y se gestiona el desempeño de los proveedores (entregas, calidad, plazos).");
		if (d.items.length && !d.approvals.trim()) F("P13", "info", null, "El plan no dice quién autoriza contratar y hasta qué monto.");
		return out;
	}
	function procurementState(d, f) {
		if (!d.items.length) return "vacio";
		const fs = procurementFindings(d, f);
		return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
	}
	//#endregion
	//#region src/modules/pmplan/main.ts
	var $ = (id) => document.getElementById(id);
	var todayISO = () => todayLocalISO();
	function setStatus(msg) {
		$("statusLeft").textContent = msg;
	}
	var rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var arr = (v) => Array.isArray(v) ? v.map(rec) : [];
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var num = (v) => {
		const n = Number(v);
		return isFinite(n) ? n : 0;
	};
	var money = (n) => Math.round(n).toLocaleString("es-PE");
	var nl = (s) => esc(s).replace(/\n/g, "<br>");
	var blankPlan = () => ({
		version: "1.0",
		status: "borrador",
		preparedBy: "",
		approvedBy: "",
		approvedOn: "",
		notes: "",
		snapshot: null,
		approvedDoc: "",
		history: []
	});
	function normSnapshot(o) {
		if (!o || typeof o !== "object") return null;
		const x = rec(o), s = {
			scopeVersion: str(x.scopeVersion),
			scopeDate: str(x.scopeDate),
			requirementsVersion: str(x.requirementsVersion),
			scheduleVersion: str(x.scheduleVersion),
			scheduleDate: str(x.scheduleDate),
			scheduleFinish: str(x.scheduleFinish),
			bacCurrent: num(x.bacCurrent),
			costBaseline: str(x.costBaseline),
			boeStatus: str(x.boeStatus)
		};
		if (x.digests && typeof x.digests === "object") {
			const d = {};
			Object.keys(rec(x.digests)).forEach((k) => {
				d[k] = str(rec(x.digests)[k]);
			});
			s.digests = d;
		}
		return s;
	}
	function normPlan(o) {
		const x = rec(o), p = blankPlan();
		p.version = str(x.version) || "1.0";
		p.status = x.status === "aprobado" ? "aprobado" : "borrador";
		p.preparedBy = str(x.preparedBy);
		p.approvedBy = str(x.approvedBy);
		p.approvedOn = str(x.approvedOn);
		p.notes = str(x.notes);
		p.snapshot = normSnapshot(x.snapshot);
		p.approvedDoc = str(x.approvedDoc);
		p.history = arr(x.history).map((h) => ({
			version: str(h.version),
			approvedBy: str(h.approvedBy),
			approvedOn: str(h.approvedOn),
			snapshot: normSnapshot(h.snapshot),
			doc: str(h.doc)
		}));
		return p;
	}
	var plan = blankPlan();
	var ctx = null;
	var ctxDirty = true;
	function getCtx() {
		if (ctxDirty || !ctx) {
			ctx = buildCtx();
			ctxDirty = false;
		}
		return ctx;
	}
	var baseOf = (b) => {
		const x = rec(b);
		return !!x.frozen && !!str(x.version) ? {
			has: true,
			version: str(x.version),
			date: str(x.date),
			approver: str(x.approver)
		} : emptyBase();
	};
	function buildCtx() {
		const G = window.GPI, connected = !!(G && G.available() && G.active());
		const empty = {
			connected,
			name: "",
			meta: {},
			mods: {},
			facts: emptyFacts(todayISO())
		};
		if (!G || !G.util || !connected) return empty;
		const f = emptyFacts(todayISO());
		const m = G.active(), meta = rec(m && m.meta), mods = rec(m && m.modules);
		try {
			const charter = G.getModule("charter"), wbs = G.util.effectiveWbs(), req = G.getModule("requirements"), scope = G.getModule("scopeStatement");
			const sched = G.getModule("schedule"), sp = G.getModule("schedulePlan"), cost = G.getModule("cost"), rk = G.getModule("risks");
			const ca = G.util.charterAudit(charter), ends = arr(charter && charter.milestones).map((x) => str(x.date)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
			f.charter = {
				has: !!charter && ca.okCount > 0,
				pct: ca.pct,
				end: ends.length ? ends[ends.length - 1] : ""
			};
			const ra = G.util.requirementsAudit(req, charter, wbs), sa = G.util.scopeAudit(scope, req, charter, wbs);
			f.requirements = {
				has: ra.total > 0,
				state: ra.state,
				base: baseOf(req && req.baseline),
				total: ra.total
			};
			const sbl = normalizeScopeBaseline(scope && scope.baseline), sc = rec(scope), sd = scopeDriftOf(sbl, {
				deliverables: sc.deliverables,
				assumptions: sc.assumptions,
				constraints: sc.constraints,
				exclusions: sc.exclusions,
				productScope: sc.productScope,
				projectScope: sc.projectScope
			}, wbs);
			f.scope = {
				has: sa.total > 0 || !!str(scope && scope.productScope).trim(),
				state: sa.state,
				base: baseOf(scope && scope.baseline),
				notDecomposed: sa.delsNotDecomposed.length,
				drift: sd.frozen ? {
					wbsInBaseline: sd.wbsInBaseline,
					wbsChanges: sd.wbsChanges.length,
					enunciadoChanged: sd.enunciadoChanged
				} : void 0
			};
			const wq = analyzeWbs(wbs);
			f.wbs = {
				leaves: wq.leaves,
				state: wq.state,
				dictPct: wq.dictionary.pct,
				riesgo: wq.counts.riesgo,
				aviso: wq.counts.aviso
			};
			const ss = G.util.scheduleStats(), bl = normalizeBaseline(sched ? sched.baseline : null), net = G.util.activeScheduleNetwork();
			const last = bl && bl.log.length ? bl.log[bl.log.length - 1] : null;
			f.schedule = {
				has: ss.activities > 0,
				ok: ss.ok,
				activities: ss.activities,
				duration: ss.projectDuration,
				start: net ? net.startDate : "",
				finish: ss.finishDate,
				critical: ss.criticalCount,
				base: bl ? {
					has: true,
					version: bl.version,
					date: bl.date,
					approver: last ? last.approver : ""
				} : emptyBase(),
				deviationPct: ss.baselineDeviationPct
			};
			const cs = G.util.costSummary(cost), boe = normalizeBoe(cost && cost.estimate && cost.estimate.boe);
			const blog = cost && Array.isArray(cost.baselineLog) ? cost.baselineLog : [], lastLb = blog.length ? blog[blog.length - 1] : null;
			const capexN = Number(str(meta.capex).replace(/[^\d.-]/g, ""));
			f.cost = {
				has: cs.hasData,
				bac: cs.bac,
				bacCurrent: cs.bacCurrent,
				total: cs.total,
				pendingBaseline: cs.pendingBaseline,
				capex: isFinite(capexN) && capexN > 0 ? capexN : null,
				boeStatus: cs.hasData ? boe.status : "",
				boeApprovedOn: boe.approvedOn,
				baselineVersion: lastLb ? lastLb.version : "",
				baselineDate: lastLb ? lastLb.date : ""
			};
			const rplan = normalizePlan(rk && rk.plan), risks = (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))), rp = portfolio(risks, rplan);
			f.risks = {
				total: rp.total,
				open: rp.open,
				high: rp.byLevel.alto
			};
			const sk = arr(rec(G.getModule("stakeholders")).stakeholders);
			f.stakeholders = {
				count: sk.length,
				close: sk.filter((s) => quadrantOf(num(s.power), num(s.interest)) === "cerca").length
			};
			const obs = G.util.obsNodes(G.getModule("obs")), rc = G.util.raciCoverage(G.getModule("raci"), wbs);
			f.resources = {
				roles: obs.length,
				withPerson: obs.filter((o) => o.person.trim()).length,
				leaves: rc.total,
				withR: rc.withR,
				withoutA: rc.withoutA.length
			};
			const cp = portfolio$1(arr(rec(G.getModule("changes")).requests).map((o, i) => normalizeCr(o, "cr" + (i + 1))), {
				orders: arr(cost && cost.changeOrders).map((o) => ({
					id: str(o.id),
					cost: num(o.cost),
					fund: str(o.fund),
					status: str(o.status),
					baselined: o.baselined ? str(o.baselined) : null
				})),
				mods: modFacts(req),
				risks: risks.map((r) => ({
					id: r.id,
					code: r.code,
					title: r.title
				})),
				scheduleLog: bl ? bl.log.map((e) => ({
					version: e.version,
					date: e.date
				})) : [],
				policy: rplan.reserves,
				projectDelay: null
			}, todayISO());
			f.changes = {
				total: cp.total,
				pending: cp.byStatus.Pendiente,
				approvedOpen: cp.pendingBaseline,
				oldestPending: cp.oldestPendingDays
			};
			const qd = normalizeQuality(G.getModule("quality")), qf = gatherQualityFacts(G), qcov = coverage(qd, qf).filter((r) => r.needs);
			f.quality = {
				has: qd.checks.length + qd.metrics.length + qd.coq.length > 0,
				state: qualityState(qd, qf),
				needing: qcov.length,
				verified: qcov.filter((r) => r.checks.length).length,
				checks: qd.checks.length,
				coqTotal: coqSummary(qd.coq, qf.baseCost).total
			};
			const cd = normalizeComms(G.getModule("comms")), cf2 = gatherCommFacts(G), ccov = coverage$1(cd.items, cf2);
			f.comms = {
				has: cd.items.length > 0,
				state: commState(cd, cf2),
				items: cd.items.length,
				covered: ccov.filter((r) => r.items.length).length,
				stakeholders: cf2.stakeholders.length,
				closeUncovered: ccov.filter((r) => r.stk.quadrant === "cerca" && !r.items.length).length
			};
			const pd = normalizeProcurement(G.getModule("procurement"), todayISO()), pf = gatherProcurementFacts(G), ps = summary(pd, pf);
			f.procurement = {
				has: pd.items.length > 0,
				state: procurementState(pd, pf),
				items: pd.items.length,
				total: ps.total,
				late: ps.late,
				soon: ps.soon,
				asOf: pd.asOf
			};
			const reps = arr(rec(G.getModule("evm")).reports);
			f.evm = {
				reports: reps.length,
				lastCut: reps.length ? str(reps[reps.length - 1].date) : ""
			};
			f.projectEnd = str(meta.endDate) || f.charter.end;
			const contr = arr(sp && sp.milestones).filter((x) => /contractual/i.test(str(x.type))).map((x) => str(x.date)).filter(Boolean).sort();
			f.contractualEnd = contr.length ? contr[contr.length - 1] : "";
			const METAKEYS = [
				"name",
				"code",
				"client",
				"location",
				"sponsor",
				"manager",
				"startDate",
				"endDate",
				"currency",
				"capex",
				"description"
			], mm = {};
			METAKEYS.forEach((k) => {
				mm[k] = meta[k];
			});
			PLAN_COMPONENTS.forEach((c) => {
				f.digests[c.key] = digestOf(c.key === "meta" ? mm : c.key === "riskPlan" ? rec(G.getModule("risks")).plan : G.getModule(c.key));
			});
			f.plan = {
				status: plan.status,
				version: plan.version,
				approvedBy: plan.approvedBy,
				approvedOn: plan.approvedOn,
				snapshot: plan.snapshot,
				docPreserved: !!plan.approvedDoc
			};
		} catch (e) {}
		return {
			connected,
			name: str(meta.name),
			meta,
			mods,
			facts: f
		};
	}
	var factsNow = () => {
		const c = getCtx();
		c.facts.plan = {
			status: plan.status,
			version: plan.version,
			approvedBy: plan.approvedBy,
			approvedOn: plan.approvedOn,
			snapshot: plan.snapshot,
			docPreserved: !!plan.approvedDoc
		};
		return c.facts;
	};
	var changesSinceApproval = () => plan.status === "aprobado" && plan.snapshot ? snapshotDiff(plan.snapshot, snapshotOf(factsNow())) : [];
	var pill = (s) => `<span class="pill st-${s}">${STATE_LABEL[s]}</span>`;
	var fd = (id, label, val, type = "text", dis = false) => `<div class="fd"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}"${dis ? " disabled" : ""}></div>`;
	function renderState() {
		const C = getCtx(), f = factsNow(), root = $("stateView");
		if (!C.connected) {
			root.innerHTML = `<div class="view-head"><h2>Plan para la Dirección del Proyecto</h2></div><div class="empty-hint"><b>Sin proyecto activo.</b> Este módulo no tiene un ejemplo propio: consolida lo que ya cargaron las demás herramientas. Abre o crea un proyecto desde el <a href="Panel_Control.html">Panel de Control</a>, completa el Acta, el alcance, el cronograma y el presupuesto (o usa «Cargar ejemplo» en cada uno) y vuelve aquí para ver el plan integrado.</div>`;
			return;
		}
		const rows = areaRows(f), finds = integrationFindings(f), blockers = approvalBlockers(f), approved = plan.status === "aprobado";
		const changed = changesSinceApproval(), stale = changed.length > 0;
		const bl = [
			[
				"Requisitos",
				f.requirements.base,
				f.requirements.base.has ? "v" + f.requirements.base.version : ""
			],
			[
				"Alcance",
				f.scope.base,
				f.scope.base.has ? "v" + f.scope.base.version : ""
			],
			[
				"Cronograma",
				f.schedule.base,
				f.schedule.base.has ? f.schedule.base.version : ""
			],
			[
				"Costos (BOE)",
				{
					has: f.cost.has && !!f.cost.boeStatus,
					version: f.cost.boeStatus ? STATUS_LABEL[f.cost.boeStatus] || f.cost.boeStatus : "",
					date: f.cost.boeApprovedOn,
					approver: ""
				},
				f.cost.boeStatus ? STATUS_LABEL[f.cost.boeStatus] || f.cost.boeStatus : ""
			]
		];
		const sevIcon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		root.innerHTML = `
    <div class="view-head"><h2>Estado del plan — ${esc(C.name || "proyecto activo")}</h2>
      <p>El plan para la dirección integra los planes subsidiarios y las líneas base de alcance, cronograma y costo, y se aprueba como un conjunto. Aquí ves el estado de cada área, si las líneas base calzan entre sí, y registras la aprobación. Al aprobarlo se guarda una instantánea de las líneas base: si cambian después, el plan queda desactualizado y toca una nueva versión (por control integrado de cambios).</p></div>
    <div class="grid2">
      <div class="card"><h3>Líneas base</h3>
        <table class="an"><thead><tr><th>Línea base</th><th>Versión / estado</th><th>Fecha</th></tr></thead><tbody>
        ${bl.map(([n, b, v]) => `<tr><td>${n}</td><td>${v ? esc(v) : "<span class=\"muted\">sin línea base</span>"}</td><td class="mono">${esc(b.date || "—")}</td></tr>`).join("")}
        <tr><td>BAC vigente</td><td class="mono">${f.cost.has ? money(f.cost.bacCurrent || f.cost.bac) : "—"}</td><td class="mono">${esc(f.cost.baselineDate || "—")}</td></tr>
        </tbody></table></div>
      <div class="card"><h3>Aprobación del plan</h3>
        ${fd("pfVersion", "Versión del plan", plan.version, "text", approved)}
        ${fd("pfPrepared", "Preparó", plan.preparedBy)}
        ${fd("pfApprover", "Aprueba (nombre y cargo)", plan.approvedBy, "text", approved)}
        ${fd("pfDate", "Fecha de aprobación", plan.approvedOn || todayISO(), "date", approved)}
        <div class="fd"><label for="pfNotes">Notas</label><textarea id="pfNotes" rows="2">${esc(plan.notes)}</textarea></div>
        ${approved ? `<p class="small">${stale ? "⚠ <b>Plan aprobado con CAMBIOS SIN APROBAR</b> desde el " + esc(plan.approvedOn) + ": " + esc(changed.map((d) => d.label + " (" + d.from + " → " + d.to + ")").join("; ")) + ". El documento aprobado se conserva tal como se aprobó; lo vigente es un <b>borrador</b>. Crea una nueva versión para aprobar los cambios." : "✔ <b>Plan aprobado</b> v" + esc(plan.version) + " por " + esc(plan.approvedBy) + " el " + esc(plan.approvedOn) + " (sin cambios desde la aprobación)."}</p><button class="btn${stale ? " primary" : ""}" id="btnNewVersion">＋ Nueva versión del plan${stale ? " con los cambios" : ""}</button>` : `${blockers.length ? `<p class="small" style="color:#a05a00">No se puede aprobar todavía: ${esc(blockers.join("; "))}.</p>` : ""}<button class="btn primary" id="btnApprove"${blockers.length ? " disabled" : ""}>✔ Aprobar el plan</button>`}
        ${plan.history.length ? `<p class="small muted" style="margin-top:8px">Versiones anteriores: ${plan.history.map((h, i) => "v" + esc(h.version) + " (" + esc(h.approvedOn || "—") + ")" + (h.doc ? ` <button class="btn sm" data-histdoc="${i}">Ver documento</button>` : " <span title=\"aprobada antes de conservar su contenido\">sin contenido conservado</span>")).join(" · ")}</p>` : ""}
      </div>
    </div>
    <div class="card"><h3>Áreas del plan</h3>
      <table class="an"><thead><tr><th>Área</th><th>Estado</th><th>Resumen</th><th>Módulo</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${pill(r.state)}</td><td>${esc(r.metric)}${r.note ? ` <span class="muted small">${esc(r.note)}</span>` : ""}</td><td>${r.file ? `<a href="${esc(r.file)}">Abrir</a>` : "<span class=\"muted\">—</span>"}</td></tr>`).join("")}
      </tbody></table></div>
    <div class="card"><h3>Integración entre líneas base y planes (${finds.length})</h3>
      ${finds.length ? `<ul class="finds">${finds.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${sevIcon[x.severity]}</b><b>${esc(x.area)}:</b> ${esc(x.text)}</li>`).join("")}</ul>` : "<p class=\"muted small\">Sin hallazgos: las líneas base calzan entre sí.</p>"}
    </div>`;
		wireState();
	}
	function wireState() {
		const bind = (id, key) => {
			const el = document.getElementById(id);
			if (el) el.addEventListener("input", () => {
				plan[key] = el.value;
				save();
			});
		};
		bind("pfVersion", "version");
		bind("pfPrepared", "preparedBy");
		bind("pfApprover", "approvedBy");
		bind("pfDate", "approvedOn");
		bind("pfNotes", "notes");
		const ap = document.getElementById("btnApprove");
		if (ap) ap.addEventListener("click", approve);
		const nv = document.getElementById("btnNewVersion");
		if (nv) nv.addEventListener("click", newVersion);
		document.querySelectorAll("[data-histdoc]").forEach((b) => b.addEventListener("click", () => {
			docMode = Number(b.dataset.histdoc);
			setView("doc");
		}));
	}
	function approve() {
		const f = factsNow(), b = approvalBlockers(f);
		if (b.length) {
			setStatus("No se puede aprobar: " + b.join("; ") + ".");
			return;
		}
		if (!plan.approvedBy.trim()) {
			setStatus("Indica quién aprueba el plan (nombre y cargo).");
			$("pfApprover").focus();
			return;
		}
		if (!plan.approvedOn) plan.approvedOn = $("pfDate").value || todayISO();
		const finds = integrationFindings(f).filter((x) => x.severity === "aviso" || x.severity === "riesgo");
		showConfirm("Se aprobará el plan v" + plan.version + " con las líneas base actuales" + (finds.length ? " (quedan " + finds.length + " aviso(s) de integración sin resolver)" : "") + ". Si luego cambian, quedará desactualizado. ¿Continuar?", "Aprobar el plan", "Aprobar").then((ok) => {
			if (!ok) return;
			plan.status = "aprobado";
			ctxDirty = true;
			const f2 = factsNow();
			plan.snapshot = snapshotOf(f2);
			docMode = "auto";
			plan.approvedDoc = liveDocHtml();
			save();
			renderState();
			renderDoc();
			setStatus("Plan v" + plan.version + " aprobado: el documento aprobado queda conservado (" + Math.round(plan.approvedDoc.length / 1024) + " KB).");
		});
	}
	function newVersion() {
		showConfirm("Se conserva la versión aprobada (con su documento) en el historial y se abre un borrador nuevo con lo vigente. ¿Continuar?", "Nueva versión del plan", "Crear versión").then((ok) => {
			if (!ok) return;
			plan.history.push({
				version: plan.version,
				approvedBy: plan.approvedBy,
				approvedOn: plan.approvedOn,
				snapshot: plan.snapshot,
				doc: plan.approvedDoc
			});
			const major = Number(String(plan.version).split(".")[0]);
			plan.version = isFinite(major) && major > 0 ? String(major + 1) + ".0" : plan.version + "b";
			plan.status = "borrador";
			plan.approvedBy = "";
			plan.approvedOn = "";
			plan.snapshot = null;
			plan.approvedDoc = "";
			docMode = "auto";
			ctxDirty = true;
			save();
			renderState();
			renderDoc();
			setStatus("Nueva versión v" + plan.version + " en borrador.");
		});
	}
	var tbl = (heads, rows, cls = "") => rows.length ? `<table${cls ? ` class="${cls}"` : ""}><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>").join("")}</tbody></table>` : "";
	var kv = (rows) => `<table class="kv"><tbody>${rows.filter(([, v]) => v.trim()).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
	var nodata = (t) => `<p class="nodata">${esc(t)}</p>`;
	var list = (items) => items.length ? "<ul>" + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>" : "";
	function buildSections() {
		const C = getCtx(), f = factsNow(), G = window.GPI, out = [];
		const meta = C.meta;
		const charter = G.getModule("charter"), wbs = G.util.effectiveWbs(), req = G.getModule("requirements"), scope = G.getModule("scopeStatement");
		const cost = G.getModule("cost"), sp = G.getModule("schedulePlan"), sched = G.getModule("schedule"), sym = {
			USD: "$",
			PEN: "S/",
			EUR: "€"
		}[str(meta.currency)] || "";
		const m = (n) => (sym ? sym + " " : "") + money(n);
		{
			const ch = rec(charter), ident = rec(ch.identification), obj = arr(ch.objectives), mil = arr(ch.milestones);
			let h = kv([
				["Proyecto", esc(meta.name)],
				["Código", esc(meta.code)],
				["Cliente", esc(meta.client)],
				["Ubicación", esc(meta.location)],
				["Patrocinador", esc(meta.sponsor)],
				["Director del proyecto", esc(meta.manager)],
				["Inicio", esc(meta.startDate)],
				["Fin", esc(meta.endDate)],
				["CAPEX autorizado", f.cost.capex !== null ? m(f.cost.capex) : ""]
			]);
			h += `<h3 class="d2" id="s1-prop">Propósito y descripción</h3>` + (str(ch.purpose).trim() || str(ch.description).trim() ? `<p>${nl(ch.purpose)}</p><p>${nl(ch.description)}</p>` : nodata("El Acta no registra propósito ni descripción."));
			h += `<h3 class="d2" id="s1-obj">Objetivos del proyecto</h3>` + (obj.length ? tbl([
				"Dimensión",
				"Objetivo",
				"Criterio de éxito"
			], obj.map((o) => [
				esc(o.dim),
				esc(o.objective),
				esc(o.criteria)
			])) : nodata("Sin objetivos en el Acta."));
			h += `<h3 class="d2" id="s1-mil">Hitos principales</h3>` + (mil.length ? tbl(["Hito", "Fecha"], mil.map((x) => [esc(x.name), esc(x.date)])) : nodata("Sin hitos en el Acta."));
			if (Object.keys(ident).length === 0 && !charter) h = nodata("El Acta de Constitución aún no tiene datos.") + h;
			out.push({
				id: "s1",
				title: "1. Descripción del proyecto",
				subs: [
					{
						id: "s1-prop",
						title: "Propósito y descripción"
					},
					{
						id: "s1-obj",
						title: "Objetivos"
					},
					{
						id: "s1-mil",
						title: "Hitos principales"
					}
				],
				html: h
			});
		}
		{
			const sc = rec(scope), rq = rec(req);
			const tm = G.util.traceMatrix(req, charter, scope, wbs), items = new Map(arr(rq.items).map((x) => [str(x.id), x]));
			const ranText = new Map(G.util.charterRans(charter).map((r) => [r.id, r]));
			let h = `<h3 class="d2" id="s2-tr">Matriz de trazabilidad de requisitos</h3>`;
			h += tm.rows.length ? tbl([
				"Identificación",
				"Requisito",
				"Fuente",
				"Prioridad",
				"Categoría",
				"Objetivo de negocio",
				"Entregable",
				"Verificación",
				"Validación"
			], tm.rows.map((r) => {
				const it = items.get(r.req.id) || {};
				return [
					esc(r.req.code || r.req.id),
					esc(r.req.text),
					esc(r.rans.map((x) => x.code).join(", ")),
					esc(it.priority),
					esc(it.type),
					esc(r.rans.map((x) => {
						const t = ranText.get(x.id);
						return t ? t.code + " " + str(t.text) : x.code;
					}).join("; ")),
					esc(r.dels.map((d) => d.code + " " + d.name).join("; ")),
					esc(it.verificationMethod),
					esc(it.acceptanceCriteria)
				];
			})) : nodata("Sin requisitos registrados.");
			h += `<p class="note">Matriz derivada de Requisitos, Acta, Enunciado del Alcance y EDT: ${tm.kpi.fullChainPct} % de los requisitos con cadena completa requisito → entregable → paquete de trabajo.</p>`;
			h += `<h3 class="d2" id="s2-en">Enunciado del alcance</h3>`;
			h += kv([["Alcance del producto", nl(sc.productScope)], ["Alcance del proyecto", nl(sc.projectScope)]]);
			const w = rec(wbs), nodes = rec(w.nodes), rootId = str(w.rootId), codes = G.util.wbsCodes(wbs), obs = G.util.obsNodes(G.getModule("obs"));
			const obsBy = new Map(obs.map((o) => [o.id, o])), asg = rec(rec(G.getModule("raci")).assignments);
			const parent = /* @__PURE__ */ new Map();
			Object.keys(nodes).forEach((id) => {
				const k = rec(nodes[id]).children;
				if (Array.isArray(k)) k.forEach((c) => parent.set(c, id));
			});
			const leavesUnder = (id) => {
				const k = rec(nodes[id]).children;
				return Array.isArray(k) && k.length ? k.flatMap(leavesUnder) : [id];
			};
			const phaseOf = (id) => {
				let cur = id, guard = 0;
				while (parent.get(cur) && parent.get(cur) !== rootId && guard++ < 50) cur = parent.get(cur);
				return str(rec(nodes[cur]).name);
			};
			const who = (delId, letter) => {
				const s = /* @__PURE__ */ new Set();
				Object.keys(nodes).filter((id) => str(rec(nodes[id]).delId) === delId).forEach((nid) => leavesUnder(nid).forEach((lid) => {
					const cell = rec(asg[lid]);
					Object.keys(cell).forEach((oid) => {
						if (str(cell[oid]).split(/[\s,/]+/).includes(letter) || str(cell[oid]) === letter) {
							const o = obsBy.get(oid);
							if (o) s.add(o.person.trim() || o.role);
						}
					});
				}));
				return Array.from(s).join(", ");
			};
			const dels = arr(sc.deliverables);
			h += dels.length ? tbl([
				"N°",
				"Fase",
				"Entregable",
				"Descripción",
				"Resp. elaboración (R)",
				"Resp. aceptación (A)",
				"Criterio de aceptación"
			], dels.map((d, i) => {
				const nid = Object.keys(nodes).find((id) => str(rec(nodes[id]).delId) === str(d.id));
				return [
					esc(str(d.code) || String(i + 1)),
					esc(nid ? phaseOf(nid) : ""),
					esc(d.name),
					nl(d.description),
					esc(who(str(d.id), "R")),
					esc(who(str(d.id), "A")),
					nl(d.acceptanceCriteria)
				];
			})) : nodata("El Enunciado del Alcance no tiene entregables.");
			const idl = (v) => arr(v).map((x) => str(x.text)).filter(Boolean);
			h += `<h4 class="d3">Restricciones</h4>${list(idl(sc.constraints)) || nodata("Sin restricciones.")}<h4 class="d3">Supuestos</h4>${list(idl(sc.assumptions)) || nodata("Sin supuestos.")}<h4 class="d3">Exclusiones</h4>${list(idl(sc.exclusions)) || nodata("Sin exclusiones.")}`;
			h += `<h3 class="d2" id="s2-edt">Estructura de desglose del trabajo y diccionario</h3>`;
			const rowsE = [], walk = (id, depth) => {
				const n = rec(nodes[id]);
				if (!n || !Object.keys(n).length) return;
				if (id !== rootId) {
					const leaf = !(Array.isArray(n.children) && n.children.length);
					rowsE.push([
						esc(codes[id] || ""),
						`<span style="padding-left:${(depth - 1) * 12}px">${esc(n.name)}</span>`,
						esc(n.resource),
						leaf && num(n.cost) ? m(num(n.cost)) : "",
						esc(str(n.start) && str(n.end) ? n.start + " → " + n.end : ""),
						nl(n.notes),
						nl(n.acceptance)
					]);
				}
				if (Array.isArray(n.children)) n.children.forEach((c) => walk(c, depth + 1));
			};
			if (rootId) walk(rootId, 0);
			h += rowsE.length ? tbl([
				"Código",
				"Elemento",
				"Responsable",
				"Costo",
				"Fechas",
				"Descripción del trabajo",
				"Criterio de aceptación"
			], rowsE) : nodata("La EDT aún no tiene elementos.");
			h += `<h3 class="d2" id="s2-lb">Línea base del alcance</h3>` + kv([["Enunciado del Alcance", f.scope.base.has ? `v${esc(f.scope.base.version)} · ${esc(f.scope.base.date)} · ${esc(f.scope.base.approver)}` : "sin línea base"], ["Requisitos", f.requirements.base.has ? `v${esc(f.requirements.base.version)} · ${esc(f.requirements.base.date)} · ${esc(f.requirements.base.approver)}` : "sin línea base"]]);
			out.push({
				id: "s2",
				title: "2. Plan de gestión del alcance",
				subs: [
					{
						id: "s2-tr",
						title: "Matriz de trazabilidad"
					},
					{
						id: "s2-en",
						title: "Enunciado del alcance"
					},
					{
						id: "s2-edt",
						title: "EDT y diccionario"
					},
					{
						id: "s2-lb",
						title: "Línea base del alcance"
					}
				],
				html: h
			});
		}
		{
			const s = f.schedule, spr = rec(sp), bl = normalizeBaseline(rec(sched).baseline), mil = arr(spr.milestones), th = arr(spr.controlThresholds);
			let h = s.has ? kv([
				["Actividades", String(s.activities)],
				["Duración (días laborables)", s.duration !== null ? String(s.duration) : ""],
				["Inicio", esc(s.start)],
				["Fin", esc(s.finish)],
				["Actividades críticas", String(s.critical)],
				["Línea base vigente", s.base.has ? esc(s.base.version + " · " + s.base.date) : "sin línea base"],
				["Desviación del pronóstico", s.deviationPct !== null ? Math.round(s.deviationPct * 10) / 10 + " %" : ""]
			]) : nodata("El cronograma aún no tiene actividades enlazadas.");
			h += `<h3 class="d2" id="s3-mil">Hitos del plan del cronograma</h3>` + (mil.length ? tbl([
				"Hito",
				"Fecha",
				"Tipo",
				"Restricción"
			], mil.map((x) => [
				esc(x.name),
				esc(x.date),
				esc(x.type),
				esc(x.constraint)
			])) : nodata("Sin hitos en el Plan del Cronograma."));
			h += `<h3 class="d2" id="s3-lb">Versiones de la línea base</h3>` + (bl && bl.log.length ? tbl([
				"Versión",
				"Fecha",
				"Motivo",
				"Aprobó",
				"Duración (d)",
				"Fin"
			], bl.log.map((e) => [
				esc(e.version),
				esc(e.date),
				esc(e.reason),
				esc(e.approver),
				String(e.projectDuration),
				esc(e.finishDate)
			])) : nodata("Sin versiones de línea base."));
			h += `<h3 class="d2" id="s3-um">Umbrales de control</h3>` + (th.length ? tbl([
				"Indicador",
				"Verde",
				"Rojo",
				"Acción"
			], th.map((x) => [
				esc(x.metric),
				esc(x.greenValue),
				esc(x.redValue),
				esc(x.action)
			])) : nodata("Sin umbrales definidos."));
			out.push({
				id: "s3",
				title: "3. Plan de gestión del cronograma",
				subs: [
					{
						id: "s3-mil",
						title: "Hitos"
					},
					{
						id: "s3-lb",
						title: "Línea base"
					},
					{
						id: "s3-um",
						title: "Umbrales"
					}
				],
				html: h
			});
		}
		{
			const cs = G.util.costSummary(cost), boe = normalizeBoe(rec(rec(cost).estimate).boe), log = arr(rec(cost).baselineLog);
			let h = cs.hasData ? kv([
				["Clase del estimado", esc(cs.estimateClass)],
				["Costo base", m(cs.baseCost)],
				["BAC inicial", m(cs.bac)],
				["BAC vigente", m(cs.bacCurrent)],
				["Presupuesto total (con reserva de gestión)", m(cs.total)],
				["Contingencia disponible", m(cs.contingencyAvailable)],
				["Reserva de gestión disponible", m(cs.mgmtAvailable)],
				["Órdenes de cambio", `${cs.changeOrders} (${cs.pending} pendientes)`]
			]) : nodata("El presupuesto aún no tiene datos.");
			h += `<h3 class="d2" id="s4-boe">Basis of Estimate (BOE)</h3>` + kv([
				["Versión", esc(boe.version)],
				["Estado", esc(STATUS_LABEL[boe.status])],
				["Preparó", esc(boe.preparedBy)],
				["Revisó", esc(boe.reviewedBy)],
				["Aprobó", esc(boe.approvedBy)],
				["Fecha de aprobación", esc(boe.approvedOn)],
				["Propósito", nl(boe.text.purpose)],
				["Objetivos", nl(boe.text.objectives)]
			]);
			h += `<h3 class="d2" id="s4-lb">Versiones de la línea base de costos</h3>` + (log.length ? tbl([
				"Versión",
				"Fecha",
				"Órdenes",
				"BAC anterior",
				"BAC nuevo",
				"Aprobó"
			], log.map((e) => [
				esc(e.version),
				esc(e.date),
				esc(Array.isArray(e.orderIds) ? e.orderIds.join(", ") : ""),
				m(num(e.bacBefore)),
				m(num(e.bacAfter)),
				esc(e.approver)
			])) : nodata("Aún no se incorporó ninguna orden de cambio a la línea base."));
			out.push({
				id: "s4",
				title: "4. Plan de gestión de costos",
				subs: [{
					id: "s4-boe",
					title: "Basis of Estimate"
				}, {
					id: "s4-lb",
					title: "Línea base de costos"
				}],
				html: h
			});
		}
		{
			const rk = rec(G.getModule("risks")), rplan = normalizePlan(rk.plan), top = rankRisks((Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))), rplan).slice(0, 10);
			const h = top.length ? tbl([
				"Código",
				"Riesgo",
				"Tipo",
				"Puntaje",
				"Nivel",
				"Estrategia",
				"Responsable"
			], top.map((r) => [
				esc(r.code),
				esc(r.title),
				esc(r.type),
				String(inherentScore(r) ?? ""),
				esc(levelOf(inherentScore(r), rplan) || ""),
				esc(r.strategy),
				esc(r.owner)
			])) + `<p class="note">Los 10 riesgos abiertos de mayor puntaje; ${f.risks.total} en el registro (${f.risks.open} abiertos).</p>` : nodata("El Registro de Riesgos está vacío.");
			out.push({
				id: "s5",
				title: "5. Plan de gestión de riesgos",
				subs: [],
				html: h
			});
		}
		{
			const sk = arr(rec(G.getModule("stakeholders")).stakeholders);
			const h = sk.length ? tbl([
				"Interesado",
				"Organización",
				"Rol",
				"Estrategia (poder–interés)",
				"Compromiso actual",
				"Compromiso deseado"
			], sk.map((s) => [
				esc(s.name),
				esc(s.org),
				esc(s.role),
				esc(QUADRANT_LABEL[quadrantOf(num(s.power), num(s.interest))]),
				esc(levelName(s.engCurrent)),
				esc(levelName(s.engDesired))
			])) : nodata("Sin interesados registrados.");
			out.push({
				id: "s6",
				title: "6. Plan de involucramiento de los interesados",
				subs: [],
				html: h
			});
		}
		{
			const obs = G.util.obsNodes(G.getModule("obs"));
			const h = obs.length ? tbl([
				"Código",
				"Puesto",
				"Persona",
				"Tipo"
			], obs.map((o) => [
				esc(o.code),
				esc(o.role),
				esc(o.person),
				esc(o.type)
			])) + `<p class="note">${f.resources.withR}/${f.resources.leaves} paquetes de trabajo con responsable (R) en la Matriz RACI.</p>` : nodata("Sin estructura de la organización (OBS).");
			out.push({
				id: "s7",
				title: "7. Plan de gestión de recursos (equipo y responsabilidades)",
				subs: [],
				html: h
			});
		}
		{
			const crs = arr(rec(G.getModule("changes")).requests).map((o, i) => normalizeCr(o, "cr" + (i + 1)));
			const h = crs.length ? tbl([
				"Código",
				"Solicitud",
				"Estado",
				"Decidida",
				"Aprobó",
				"Δ costo",
				"Δ días"
			], crs.map((c) => [
				esc(c.code),
				esc(c.title),
				esc(c.status),
				esc(c.decidedOn),
				esc(c.approver),
				c.costDelta === null ? "" : m(c.costDelta),
				c.daysDelta === null ? "" : String(c.daysDelta)
			])) : nodata("Sin solicitudes de cambio: el plan no ha tenido cambios registrados.");
			out.push({
				id: "s8",
				title: "8. Control integrado de cambios",
				subs: [],
				html: h
			});
		}
		{
			const reps = arr(rec(G.getModule("evm")).reports);
			const h = reps.length ? tbl([
				"Corte",
				"PV",
				"EV",
				"AC",
				"CPI",
				"SPI"
			], reps.map((r) => [
				esc(r.date),
				m(num(r.pv)),
				m(num(r.ev)),
				m(num(r.ac)),
				r.cpi === null || r.cpi === void 0 ? "" : num(r.cpi).toFixed(2),
				r.spi === null || r.spi === void 0 ? "" : num(r.spi).toFixed(2)
			])) : nodata("Aún no hay cortes de valor ganado: el seguimiento comienza con la ejecución.");
			out.push({
				id: "s9",
				title: "9. Medición del desempeño (valor ganado)",
				subs: [],
				html: h
			});
		}
		{
			const qd = normalizeQuality(G.getModule("quality")), qf = gatherQualityFacts(G), s = coqSummary(qd.coq, qf.baseCost), cov = coverage(qd, qf).filter((r) => r.needs), leaf = new Map(qf.leaves.map((l) => [l.id, l.code + " " + l.name]));
			let h = qd.checks.length + qd.metrics.length + qd.coq.length > 0 ? kv([
				["Política de calidad", nl(qd.policy)],
				["Normas y especificaciones", nl(qd.standards)],
				["Paquetes con criterio de aceptación verificados", cov.filter((r) => r.checks.length).length + " de " + cov.length]
			]) : nodata("El plan de calidad aún no tiene datos.");
			h += `<h3 class="d2" id="sq-m">Métricas de calidad</h3>` + (qd.metrics.length ? tbl([
				"Código",
				"Métrica",
				"Objetivo",
				"Tolerancia",
				"Método",
				"Frecuencia",
				"Responsable"
			], qd.metrics.map((x) => [
				esc(x.code),
				esc(x.name),
				nl(x.target),
				nl(x.tolerance),
				esc(x.method),
				esc(x.frequency),
				esc(x.owner)
			])) : nodata("Sin métricas definidas."));
			h += `<h3 class="d2" id="sq-c">Aseguramiento y control por paquete</h3>` + (qd.checks.length ? tbl([
				"Código",
				"Paquete",
				"Qué se verifica",
				"Criterio de aceptación",
				"Tipo",
				"Método",
				"Frecuencia",
				"Responsable",
				"Registro"
			], qd.checks.map((x) => [
				esc(x.code),
				esc(leaf.get(x.wbsId) || ""),
				nl(x.what),
				nl(x.criterion),
				esc(x.kind),
				esc(x.method),
				esc(x.frequency),
				esc(x.owner),
				esc(x.record)
			])) : nodata("Sin actividades de control ni aseguramiento."));
			h += `<h3 class="d2" id="sq-k">Costo de la calidad</h3>` + (s.total > 0 ? tbl([
				"Categoría",
				"Monto",
				"Parte"
			], COQ_CATS.map((k) => [
				esc(COQ_LABEL[k]),
				m(s.byCat[k]),
				Math.round(s.byCat[k] / s.total * 100) + " %"
			]).concat([[
				"Total",
				m(s.total),
				s.pctOfBase !== null ? s.pctOfBase.toFixed(1) + " % del costo base" : ""
			]])) : nodata("Sin costo de la calidad definido."));
			out.push({
				id: "sq",
				title: "Plan de gestión de la calidad",
				subs: [
					{
						id: "sq-m",
						title: "Métricas"
					},
					{
						id: "sq-c",
						title: "Aseguramiento y control"
					},
					{
						id: "sq-k",
						title: "Costo de la calidad"
					}
				],
				html: h
			});
		}
		{
			const cd = normalizeComms(G.getModule("comms")), cf = gatherCommFacts(G), who = (ids, aud) => ids.map((i) => (cf.stakeholders.find((x) => x.id === i) || { name: i }).name).concat(aud.trim() ? [aud.trim()] : []).join("; ");
			let h = cd.items.length ? tbl([
				"Código",
				"Información",
				"Propósito",
				"Destinatarios",
				"Emisor",
				"Frecuencia",
				"Medio",
				"Registro"
			], cd.items.map((x) => [
				esc(x.code),
				nl(x.info),
				nl(x.purpose),
				esc(who(x.stkIds, x.audience)),
				esc(x.sender),
				esc(x.frequency),
				esc(x.method),
				esc(x.storage)
			])) : nodata("La matriz de comunicaciones aún no tiene datos.");
			if (cd.items.length) h += `<p class="note">${coverage$1(cd.items, cf).filter((r) => r.items.length).length} de ${cf.stakeholders.length} interesados reciben al menos una comunicación planificada.</p>` + kv([
				["Escalamiento", nl(cd.plan.escalation)],
				["Restricciones y confidencialidad", nl(cd.plan.restrictions)],
				["Actualización del plan", nl(cd.plan.review)]
			]);
			out.push({
				id: "sc",
				title: "Plan de gestión de las comunicaciones",
				subs: [],
				html: h
			});
		}
		{
			const pd = normalizeProcurement(G.getModule("procurement"), todayISO()), pf = gatherProcurementFacts(G), code = (ids) => ids.map((i) => (pf.leaves.find((l) => l.id === i) || { code: "" }).code).filter(Boolean).join(", ");
			let h = pd.items.length ? kv([
				["Fecha de corte del plan", esc(pd.asOf)],
				["Estrategia de adquisiciones", nl(pd.strategy)],
				["Desempeño de proveedores", nl(pd.performance)],
				["Autorizaciones", nl(pd.approvals)]
			]) : nodata("El plan de adquisiciones aún no tiene datos.");
			if (pd.items.length) h += tbl([
				"Código",
				"Adquisición",
				"Paquetes EDT",
				"Decisión",
				"Contrato",
				"Selección",
				"Valor",
				"Fecha requerida",
				"Convocar antes del",
				"Proveedor",
				"Estado",
				"Responsable"
			], pd.items.map((x) => [
				esc(x.code),
				esc(x.name),
				esc(code(x.wbsIds)),
				esc(x.decision),
				esc(x.contractType),
				esc(x.selection) + (x.criteria.length ? "<br><span class=\"note\">" + esc(x.criteria.map((c) => c.name + " " + (c.weight ?? "?") + " %").join("; ")) + "</span>" : ""),
				x.value === null ? "" : m(x.value),
				esc(x.needDate),
				esc(launchBy(x) || ""),
				esc(x.supplier),
				esc(x.status),
				esc(x.owner)
			]));
			out.push({
				id: "sp",
				title: "Plan de gestión de las adquisiciones",
				subs: [],
				html: h
			});
		}
		{
			const diff = changesSinceApproval();
			let h = tbl([
				"Línea base",
				"Versión",
				"Fecha"
			], [
				[
					"Requisitos",
					f.requirements.base.has ? "v" + esc(f.requirements.base.version) : "—",
					esc(f.requirements.base.date)
				],
				[
					"Alcance",
					f.scope.base.has ? "v" + esc(f.scope.base.version) : "—",
					esc(f.scope.base.date)
				],
				[
					"Cronograma",
					f.schedule.base.has ? esc(f.schedule.base.version) : "—",
					esc(f.schedule.base.date)
				],
				[
					"Costos (BAC vigente " + m(f.cost.bacCurrent || f.cost.bac) + ")",
					esc(f.cost.baselineVersion || "inicial"),
					esc(f.cost.baselineDate)
				]
			]);
			h += `<h3 class="d2" id="s10-ap">Aprobación del plan</h3>` + kv([
				["Versión", esc(plan.version)],
				["Estado", esc(coverStatus())],
				["Preparó", esc(plan.preparedBy)],
				["Aprobó", esc(plan.approvedBy)],
				["Fecha de aprobación", esc(plan.approvedOn)],
				["Notas", nl(plan.notes)]
			]);
			if (diff.length) h += `<p class="note"><b>Borrador con cambios sin aprobar:</b> desde la aprobación de la v${esc(plan.version)} cambió ${esc(diff.map((d) => d.label + " " + d.from + " → " + d.to).join("; "))}. Este documento NO es el aprobado.</p>`;
			if (plan.history.length) h += `<h4 class="d3">Versiones anteriores</h4>` + tbl([
				"Versión",
				"Aprobó",
				"Fecha"
			], plan.history.map((x) => [
				esc(x.version),
				esc(x.approvedBy),
				esc(x.approvedOn)
			]));
			h += `<h3 class="d2">Firmas</h3><table><tbody><tr><td style="height:60px;width:50%">Preparó:<br>${esc(plan.preparedBy)}</td><td>Aprobó:<br>${esc(plan.approvedBy)}</td></tr></tbody></table>`;
			out.push({
				id: "s10",
				title: "10. Líneas base y aprobación del plan",
				subs: [{
					id: "s10-ap",
					title: "Aprobación del plan"
				}],
				html: h
			});
		}
		return out;
	}
	var SECTION_ORDER = [
		"s1",
		"s2",
		"s3",
		"s4",
		"sq",
		"s7",
		"sc",
		"s5",
		"sp",
		"s6",
		"s8",
		"s9",
		"s10"
	];
	function coverStatus() {
		return plan.status !== "aprobado" ? "Borrador" : changesSinceApproval().length ? "Borrador con cambios sin aprobar (sobre la v" + plan.version + " aprobada)" : "Aprobado";
	}
	function liveDocHtml() {
		const C = getCtx(), secs = buildSections().sort((a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id));
		secs.forEach((s, i) => {
			s.title = i + 1 + ". " + s.title.replace(/^\d+\.\s*/, "");
		});
		const toc = secs.map((s) => `<div class="l1"><a href="#${s.id}">${esc(s.title)}</a></div>` + s.subs.map((x) => `<div class="l2"><a href="#${x.id}">${esc(x.title)}</a></div>`).join("")).join("");
		return `<div class="paper">
    <div class="cover"><div class="ttl"><h1>Plan para la dirección del proyecto</h1><div class="pn">${esc(C.name || "Proyecto")}</div></div>
      <div class="ft"><div class="dt">${esc(todayISO())}</div><div>Versión ${esc(plan.version)} · ${esc(coverStatus())}${plan.preparedBy ? " · Preparó: " + esc(plan.preparedBy) : ""}</div></div></div>
    <div class="toc"><h2 class="d1">Contenido</h2>${toc}</div>
    ${secs.map((s) => `<section class="sec" id="${s.id}"><h2 class="d1">${esc(s.title)}</h2>${s.html}</section>`).join("")}
  </div>`;
	}
	var docMode = "auto";
	function shownDoc() {
		const changed = changesSinceApproval();
		if (typeof docMode === "number") {
			const h = plan.history[docMode];
			if (h && h.doc) return {
				html: h.doc,
				bar: `<b>Versión anterior v${esc(h.version)}</b> (aprobada el ${esc(h.approvedOn || "—")} por ${esc(h.approvedBy || "—")}): documento tal como se aprobó. <button class="btn sm" id="docBack">Volver</button>`,
				label: "v" + h.version + "_aprobada"
			};
			docMode = "auto";
		}
		if (plan.status === "aprobado" && plan.approvedDoc && docMode !== "current") return {
			html: plan.approvedDoc,
			label: "v" + plan.version + "_aprobada",
			bar: changed.length ? `⚠ <b>Documento APROBADO v${esc(plan.version)}</b> (${esc(plan.approvedOn)}, ${esc(plan.approvedBy)}). El proyecto tiene <b>cambios sin aprobar</b>: ${esc(changed.map((d) => d.label).join(", "))}. Lo que ves es lo aprobado, sin esos cambios. <button class="btn sm" id="docCurrent">Ver borrador con los datos actuales</button>` : `✔ <b>Documento aprobado v${esc(plan.version)}</b> (${esc(plan.approvedOn)}, ${esc(plan.approvedBy)}): sin cambios desde la aprobación. <button class="btn sm" id="docCurrent">Ver con los datos actuales</button>`
		};
		const legacy = plan.status === "aprobado" && !plan.approvedDoc;
		return {
			html: liveDocHtml(),
			label: plan.status === "aprobado" ? "v" + plan.version + "_borrador" : "borrador",
			bar: legacy ? "⚠ Este plan se aprobó antes de conservar su contenido: <b>no se puede demostrar que este documento sea el aprobado</b>. Crea una nueva versión y apruébala para conservar su contenido." : plan.status === "aprobado" ? `📝 <b>BORRADOR con los datos actuales</b>, no es el documento aprobado v${esc(plan.version)}. <button class="btn sm" id="docBack">Volver al documento aprobado</button>` : ""
		};
	}
	function renderDoc() {
		const C = getCtx(), el = $("docView");
		if (!C.connected) {
			el.innerHTML = "<div class=\"empty-hint\">Sin proyecto activo: no hay nada que documentar.</div>";
			return;
		}
		const s = shownDoc();
		el.innerHTML = (s.bar ? `<div class="docbar" id="docBar">${s.bar}</div>` : "") + s.html;
		const cur = document.getElementById("docCurrent"), back = document.getElementById("docBack");
		if (cur) cur.addEventListener("click", () => {
			docMode = "current";
			renderDoc();
		});
		if (back) back.addEventListener("click", () => {
			docMode = "auto";
			renderDoc();
		});
	}
	var WORD_CSS = "body{font-family:Calibri,Arial,sans-serif;font-size:11pt} h1{font-size:26pt;color:#5b9bd5;font-weight:normal} h2.d1{font-size:20pt;font-weight:normal;border-bottom:2px solid #2f5496;margin-top:24pt} h3.d2{font-size:14pt;color:#2e74b5;font-weight:normal} h4.d3{font-size:12pt;color:#2e74b5;font-weight:normal} table{border-collapse:collapse;width:100%;margin:6pt 0} th{background:#f2f2f2;border:1px solid #000;padding:3pt 5pt;text-align:left;font-size:9.5pt} td{border:1px solid #000;padding:3pt 5pt;vertical-align:top;font-size:9.5pt} .cover{text-align:center;page-break-after:always} .sec{page-break-before:always} .note,.nodata{color:#595959;font-style:italic;font-size:9pt}";
	function exportWord() {
		if (!getCtx().connected) {
			setStatus("No hay un proyecto activo que exportar.");
			return;
		}
		const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Plan para la dirección del proyecto</title><style>${WORD_CSS}</style></head><body>${shownDoc().html}</body></html>`;
		const blob = new Blob(["﻿", html], { type: "application/msword" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "plan_para_la_direccion_" + shownDoc().label + ".doc";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Plan exportado a Word (.doc).");
	}
	function printDoc() {
		renderDoc();
		setStatus("Abriendo el diálogo de impresión: elige «Guardar como PDF».");
		window.print();
	}
	function showConfirm(message, title, okText = "Aceptar") {
		return new Promise((resolve) => {
			const overlay = $("modalOverlay"), ok = $("modalConfirmBtn"), cancel = $("modalCancelBtn");
			$("modalTitle").textContent = title;
			$("modalMessage").textContent = message;
			ok.textContent = okText;
			const done = (r) => {
				overlay.classList.remove("open");
				ok.onclick = null;
				cancel.onclick = null;
				overlay.onclick = null;
				document.removeEventListener("keydown", key);
				resolve(r);
			};
			const key = (e) => {
				if (e.key === "Escape") done(false);
				else if (e.key === "Enter") done(true);
			};
			ok.onclick = () => done(true);
			cancel.onclick = () => done(false);
			overlay.onclick = (e) => {
				if (e.target === overlay) done(false);
			};
			document.addEventListener("keydown", key);
			overlay.classList.add("open");
			ok.focus();
		});
	}
	var view = "state";
	function setView(v) {
		view = v;
		$("stateView").style.display = v === "state" ? "" : "none";
		$("docView").style.display = v === "doc" ? "block" : "none";
		document.querySelectorAll("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
		if (v === "doc") renderDoc();
		else renderState();
	}
	function refresh() {
		ctxDirty = true;
		if (view === "state") {
			const a = document.activeElement;
			if (!(a && $("stateView").contains(a) && /INPUT|TEXTAREA/.test(a.tagName))) renderState();
		} else renderDoc();
	}
	var saveFn = () => false;
	function save() {
		saveFn();
	}
	(function gpiBridge() {
		if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
		const proj = window.GPI.active();
		let loadedProjectId = null, session = null, projectStale = false, timer;
		function markProjectStale() {
			if (projectStale) return;
			projectStale = true;
			setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
			const b = document.getElementById("banner");
			if (b) {
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la aprobación del plan aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			version: plan.version,
			status: plan.status,
			preparedBy: plan.preparedBy,
			approvedBy: plan.approvedBy,
			approvedOn: plan.approvedOn,
			notes: plan.notes,
			snapshot: plan.snapshot,
			approvedDoc: plan.approvedDoc,
			history: plan.history
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("pmplan");
			ctxDirty = true;
			const mod = p.modules && p.modules.pmplan;
			if (mod && typeof mod === "object") {
				plan = normPlan(mod);
				window.GPI.rebaseSession(session, payload());
			} else plan = blankPlan();
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "pmplan", "El plan para la dirección", payload(), null, session, {
				setStatus,
				onStale: markProjectStale
			});
			session = r.session;
			return r.ok;
		}
		saveFn = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(push, 800);
			return true;
		};
		if (proj) pull();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
			else refresh();
		});
		window.GPI.onChange(() => {
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return;
			}
			refresh();
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	})();
	function gpiBadge(name, pushFn) {
		installGpiBadge({
			name,
			onSync: pushFn
		});
	}
	document.querySelectorAll("#tabs .tab").forEach((t) => t.addEventListener("click", () => setView(t.dataset.view === "doc" ? "doc" : "state")));
	$("btnRefresh").addEventListener("click", () => {
		ctxDirty = true;
		setView(view);
		setStatus("Plan actualizado con lo que hay hoy en las demás herramientas.");
	});
	$("btnWord").addEventListener("click", exportWord);
	$("btnPrint").addEventListener("click", printDoc);
	setView("state");
	//#endregion
})();
