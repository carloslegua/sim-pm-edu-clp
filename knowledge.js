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
	//#endregion
	//#region src/shared/reserve-policy.ts
	var DEFAULT_RESERVES = {
		pmLimit: null,
		ccbLimit: null,
		contAlertPct: null
	};
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return typeof n === "number" && isFinite(n) ? n : null;
	};
	function normalizeReserves(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			pmLimit: numOrNull(x.pmLimit),
			ccbLimit: numOrNull(x.ccbLimit),
			contAlertPct: numOrNull(x.contAlertPct)
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
	var isNum = (v) => typeof v === "number" && isFinite(v);
	function toNum(v) {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return isNum(n) ? n : null;
	}
	function toLevel(v) {
		const n = toNum(v);
		return n !== null && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
	}
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
	var arrNum = (v, def) => Array.isArray(v) && v.length === def.length && v.every((x) => toNum(x) !== null) ? v.map((x) => toNum(x)) : def.slice();
	function normalizePlan(p) {
		const o = p && typeof p === "object" ? p : {};
		const cats = Array.isArray(o.categories) ? o.categories.map(str$1).map((s) => s.trim()).filter(Boolean) : [];
		return {
			probPct: arrNum(o.probPct, DEFAULT_PLAN.probPct),
			costBandsPct: arrNum(o.costBandsPct, DEFAULT_PLAN.costBandsPct),
			timeBandsDays: arrNum(o.timeBandsDays, DEFAULT_PLAN.timeBandsDays),
			scopeDescriptors: Array.isArray(o.scopeDescriptors) && o.scopeDescriptors.length === 5 ? o.scopeDescriptors.map(str$1) : DEFAULT_PLAN.scopeDescriptors.slice(),
			thresholdMedium: toNum(o.thresholdMedium) ?? DEFAULT_PLAN.thresholdMedium,
			thresholdHigh: toNum(o.thresholdHigh) ?? DEFAULT_PLAN.thresholdHigh,
			reviewDays: toNum(o.reviewDays) ?? DEFAULT_PLAN.reviewDays,
			categories: cats.length ? cats : DEFAULT_PLAN.categories.slice(),
			methodology: str$1(o.methodology),
			reservePolicy: str$1(o.reservePolicy),
			roles: str$1(o.roles),
			reserves: normalizeReserves(o.reserves)
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
		const id = str$1(x.id) || fallbackId;
		return {
			id,
			code: str$1(x.code) || id,
			title: str$1(x.title),
			cause: str$1(x.cause),
			event: str$1(x.event),
			effect: str$1(x.effect),
			type,
			category: str$1(x.category),
			wbsIds: Array.isArray(x.wbsIds) ? x.wbsIds.map(str$1).filter(Boolean) : [],
			actIds: Array.isArray(x.actIds) ? x.actIds.map(str$1).filter(Boolean) : [],
			owner: str$1(x.owner),
			proximity: PROXIMITY.indexOf(str$1(x.proximity)) >= 0 ? str$1(x.proximity) : "",
			identifiedOn: str$1(x.identifiedOn),
			reviewedOn: str$1(x.reviewedOn),
			status,
			prob: toLevel(x.prob),
			impCost: toLevel(x.impCost),
			impTime: toLevel(x.impTime),
			impScope: toLevel(x.impScope),
			probPct: toNum(x.probPct),
			costImpact: range(x.costImpact),
			timeImpact: range(x.timeImpact),
			strategy: str$1(x.strategy),
			response: str$1(x.response),
			trigger: str$1(x.trigger),
			responseOwner: str$1(x.responseOwner),
			responseCost: toNum(x.responseCost),
			secondary: str$1(x.secondary),
			resProb: toLevel(x.resProb),
			resImpCost: toLevel(x.resImpCost),
			resImpTime: toLevel(x.resImpTime),
			resImpScope: toLevel(x.resImpScope),
			resProbPct: toNum(x.resProbPct),
			resCostImpact: range(x.resCostImpact),
			resTimeImpact: range(x.resTimeImpact),
			materializedOn: str$1(x.materializedOn),
			actualCost: toNum(x.actualCost),
			actualDelay: toNum(x.actualDelay),
			notes: str$1(x.notes)
		};
	}
	//#endregion
	//#region src/shared/knowledge.ts
	var LESSON_KINDS = [
		"buena_practica",
		"problema",
		"oportunidad"
	];
	var KIND_LABEL = {
		buena_practica: "Buena práctica",
		problema: "Problema",
		oportunidad: "Oportunidad de mejora"
	};
	var CATEGORIES = [
		"Alcance",
		"Cronograma",
		"Costos",
		"Calidad",
		"Riesgos",
		"Adquisiciones",
		"Comunicaciones",
		"Interesados",
		"Recursos",
		"Seguridad",
		"Otro"
	];
	var LESSON_STATUSES = [
		"capturada",
		"validada",
		"transferida"
	];
	var STATUS_LABEL = {
		capturada: "Capturada",
		validada: "Validada",
		transferida: "Transferida"
	};
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var rec = (o) => o && typeof o === "object" ? o : {};
	var iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeLesson(o, fb) {
		const x = rec(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			date: str(x.date),
			kind: LESSON_KINDS.indexOf(x.kind) >= 0 ? x.kind : "problema",
			category: str(x.category),
			wbsId: str(x.wbsId),
			riskCode: str(x.riskCode),
			situation: str(x.situation),
			lesson: str(x.lesson),
			recommendation: str(x.recommendation),
			owner: str(x.owner),
			audience: str(x.audience),
			status: LESSON_STATUSES.indexOf(x.status) >= 0 ? x.status : "capturada"
		};
	}
	function normalizeKnowledge(raw) {
		const x = rec(raw), lessons = (Array.isArray(x.lessons) ? x.lessons : []).map((o, i) => normalizeLesson(o, "ll" + (i + 1)));
		return {
			lessons,
			asOf: iso(str(x.asOf)) ? str(x.asOf) : "",
			idCounter: Number(x.idCounter) || lessons.length + 1
		};
	}
	var blankKnowledge = () => normalizeKnowledge(null);
	function nextCode(items) {
		let max = 0;
		items.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "LL-" + String(max + 1).padStart(2, "0");
	}
	var asOfOf = (d, today) => iso(d.asOf) ? d.asOf : today;
	var gap = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
	function knowledgeFindings(d, f, today0 = "") {
		const today = asOfOf(d, today0), out = [], F = (code, severity, lessonId, text) => {
			out.push({
				code,
				severity,
				lessonId,
				text
			});
		};
		const leafBy = new Set(f.leaves.map((l) => l.id)), roles = new Set(f.roles.map((r) => r.toLowerCase())), codes = new Set(f.riskCodes.map((c) => c.toLowerCase()));
		if (!d.lessons.length && !f.materialized.length) return out;
		d.lessons.forEach((l) => {
			const w = l.code + (l.lesson.trim() ? " «" + l.lesson.trim().slice(0, 60) + (l.lesson.trim().length > 60 ? "…" : "") + "»" : "");
			if (!l.situation.trim() || !l.lesson.trim()) F("K2", "aviso", l.id, l.code + ": falta qué pasó o qué se aprendió: sin contexto la lección no se entiende ni se puede reutilizar.");
			if (!l.recommendation.trim()) F("K1", "aviso", l.id, w + ": no dice QUÉ HACER distinto la próxima vez: una lección sin recomendación accionable es una anécdota.");
			if (l.status === "capturada" && iso(l.date) && iso(today) && gap(l.date, today) > 30) F("K4", "info", l.id, w + ": capturada el " + l.date + " y sin validar hace " + gap(l.date, today) + " días: valídala o descártala mientras se recuerde el contexto.");
			if (l.status === "transferida" && !l.audience.trim()) F("K5", "aviso", l.id, w + ": figura transferida pero no dice a quién (siguiente proyecto, área, organización).");
			if (l.owner.trim() && roles.size && !roles.has(l.owner.trim().toLowerCase())) F("K6", "info", l.id, w + ": el responsable «" + l.owner + "» no figura entre los puestos del OBS.");
			if (l.wbsId && f.leaves.length && !leafBy.has(l.wbsId)) F("K7", "aviso", l.id, w + ": apunta a un paquete de la EDT que ya no existe.");
			if (l.riskCode.trim() && codes.size && !codes.has(l.riskCode.trim().toLowerCase())) F("K7", "aviso", l.id, w + ": cita el riesgo " + l.riskCode + " que no existe en el Registro de Riesgos.");
		});
		const cited = new Set(d.lessons.map((l) => l.riskCode.trim().toLowerCase()).filter(Boolean));
		f.materialized.filter((r) => !cited.has(r.code.toLowerCase())).forEach((r) => F("K3", "aviso", null, "El riesgo " + r.code + " «" + r.title + "» se MATERIALIZÓ y ninguna lección lo cita: lo que costó aprender no queda registrado."));
		return out;
	}
	function knowledgeState(d, f, today = "") {
		if (!d.lessons.length) return "vacio";
		const fs = knowledgeFindings(d, f, today);
		return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
	}
	function summary(d) {
		const byStatus = {
			capturada: 0,
			validada: 0,
			transferida: 0
		}, byKind = {
			buena_practica: 0,
			problema: 0,
			oportunidad: 0
		};
		d.lessons.forEach((l) => {
			byStatus[l.status]++;
			byKind[l.kind]++;
		});
		return {
			total: d.lessons.length,
			byStatus,
			byKind
		};
	}
	//#endregion
	//#region src/shared/plan-facts.ts
	var rolesOf = (G) => Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)));
	function gatherKnowledgeFacts(G) {
		const rk = G.getModule("risks"), risks = (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1)));
		return {
			materialized: risks.filter((r) => r.status === "materializado").map((r) => ({
				code: r.code,
				title: r.title
			})),
			riskCodes: risks.map((r) => r.code),
			leaves: G.util.wbsLeaves(G.util.effectiveWbs()).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name
			})),
			roles: rolesOf(G)
		};
	}
	//#endregion
	//#region src/shared/case-distribplus.ts
	var SAMPLE_OBS_ROLES = [
		"Comité Directivo / Sponsor",
		"Director de Proyecto",
		"Jefe de Ingeniería",
		"Especialista en Geotecnia",
		"Ingeniero Estructural",
		"Ingeniero MEP",
		"Jefe de Logística",
		"Proveedor — Estructuras metálicas",
		"Proveedor — Materiales de construcción",
		"Proveedor — Equipos eléctricos",
		"Residente de Obra",
		"Subcontrata MEP",
		"Control de Calidad",
		"Asesoría Legal"
	];
	var SAMPLE_CASE_LEAVES = [
		{
			code: "1.1",
			name: "Acta de constitución",
			cost: 12e3
		},
		{
			code: "1.2",
			name: "Plan de gestión del proyecto",
			cost: 38e3
		},
		{
			code: "1.3",
			name: "Informes de seguimiento y control",
			cost: 145e3
		},
		{
			code: "2.1",
			name: "Estudio de suelos",
			cost: 28e3
		},
		{
			code: "2.2",
			name: "Diseño estructural",
			cost: 165e3
		},
		{
			code: "2.3",
			name: "Diseño eléctrico y sanitario",
			cost: 98e3
		},
		{
			code: "2.4",
			name: "Permisos y licencias municipales",
			cost: 64e3
		},
		{
			code: "3.1",
			name: "Estructuras metálicas prefabricadas",
			cost: 182e4
		},
		{
			code: "3.2",
			name: "Materiales de construcción",
			cost: 715e3
		},
		{
			code: "3.3",
			name: "Equipos eléctricos e instalaciones",
			cost: 415e3
		},
		{
			code: "4.1",
			name: "Movimiento de tierras",
			cost: 38e4
		},
		{
			code: "4.2",
			name: "Cimentaciones",
			cost: 735e3
		},
		{
			code: "4.3",
			name: "Estructura y cobertura",
			cost: 1165e3
		},
		{
			code: "4.4",
			name: "Acabados y cerramientos",
			cost: 55e4
		},
		{
			code: "4.5",
			name: "Instalaciones MEP",
			cost: 485e3
		},
		{
			code: "5.1",
			name: "Pruebas de instalaciones",
			cost: 145e3
		},
		{
			code: "5.2",
			name: "Capacitación al cliente",
			cost: 48e3
		},
		{
			code: "5.3",
			name: "Acta de entrega y cierre",
			cost: 92e3
		}
	];
	normalizePlan({
		methodology: "Identificación por talleres de expertos y revisión de lecciones aprendidas; análisis cualitativo con la matriz probabilidad × impacto del plan; cuantificación del valor esperado con rangos de tres puntos para los riesgos de costo ≥ 3; respuesta por estrategia; revisión mensual en la reunión de control.",
		reservePolicy: "La contingencia cubre la incertidumbre del estimado (análisis de rangos de Costos) y la exposición residual de los riesgos abiertos. La libera la instancia que corresponde al monto de cada orden (límites de abajo) y solo contra un riesgo del registro. La reserva de gestión (fuera de la línea base) solo se usa con autorización del sponsor. Si la contingencia disponible baja del umbral de alerta, el Director de Proyecto escala al sponsor.",
		reserves: {
			pmLimit: 5e4,
			ccbLimit: 25e4,
			contAlertPct: 25
		},
		roles: "Director de Proyecto: dueño del proceso y del registro. Propietario del riesgo: vigila el disparador y ejecuta la respuesta. Sponsor: autoriza el uso de la reserva de gestión. CCB: aprueba los cambios a la línea base."
	});
	var SAMPLE_RISKS = [
		{
			code: "R-01",
			title: "Retraso en la licencia municipal",
			type: "amenaza",
			category: "Externo",
			owner: "Asesoría Legal",
			proximity: "corta",
			status: "con_respuesta",
			wbs: ["2.4"],
			cause: "la Municipalidad de Lurín observa el expediente de licencia de edificación",
			event: "se retrasa la emisión de la licencia",
			effect: "se posterga el inicio de obra y se extiende el cronograma",
			prob: 4,
			impCost: 2,
			impTime: 4,
			impScope: 1,
			costImpact: {
				low: 2e4,
				likely: 45e3,
				high: 8e4
			},
			timeImpact: {
				low: 10,
				likely: 20,
				high: 35
			},
			strategy: "mitigar",
			response: "Reuniones técnicas previas al ingreso del expediente y seguimiento semanal del trámite (ver compromiso de la Municipalidad en Stakeholder Studio).",
			trigger: "Observaciones al expediente en la primera revisión",
			responseOwner: "Asesoría Legal",
			responseCost: 6e3,
			resProb: 2,
			resImpCost: 2,
			resImpTime: 3,
			resImpScope: 1,
			resCostImpact: {
				low: 2e4,
				likely: 45e3,
				high: 8e4
			},
			resTimeImpact: {
				low: 10,
				likely: 20,
				high: 35
			}
		},
		{
			code: "R-02",
			title: "Alza del precio del acero estructural",
			type: "amenaza",
			category: "Externo",
			owner: "Jefe de Logística",
			proximity: "media",
			status: "con_respuesta",
			wbs: ["3.1"],
			cause: "la volatilidad del precio internacional del acero",
			event: "el Proveedor A revisa al alza el precio antes de cerrar el contrato",
			effect: "aumenta el costo de procura de las estructuras metálicas",
			prob: 3,
			impCost: 4,
			impTime: 1,
			impScope: 1,
			costImpact: {
				low: 1e5,
				likely: 25e4,
				high: 5e5
			},
			strategy: "transferir",
			response: "Contrato a precio fijo con vigencia de la oferta de 60 días.",
			trigger: "Oferta del Proveedor A próxima a vencer sin contrato firmado",
			responseOwner: "Jefe de Logística",
			resProb: 1,
			resImpCost: 4,
			resImpTime: 1,
			resImpScope: 1,
			resCostImpact: {
				low: 1e5,
				likely: 25e4,
				high: 5e5
			}
		},
		{
			code: "R-03",
			title: "Suelo con menor capacidad portante que la esperada",
			type: "amenaza",
			category: "Técnico",
			owner: "Jefe de Ingeniería",
			proximity: "inmediata",
			status: "materializado",
			wbs: ["2.1", "4.2"],
			cause: "el estudio de suelos detecta estratos de baja capacidad portante",
			event: "se debe reforzar la cimentación",
			effect: "aumenta el costo y se extiende la ejecución de cimentaciones",
			prob: 3,
			impCost: 3,
			impTime: 3,
			impScope: 1,
			costImpact: {
				low: 9e4,
				likely: 18e4,
				high: 35e4
			},
			timeImpact: {
				low: 5,
				likely: 10,
				high: 20
			},
			strategy: "mitigar",
			response: "Estudio de suelos ampliado y refuerzo de cimentación (orden de cambio OC-001, financiada con contingencia).",
			trigger: "Resultados del estudio de suelos (2.1)",
			responseOwner: "Jefe de Ingeniería",
			materializedOn: "2026-08-31",
			actualCost: 18e4,
			actualDelay: 8
		},
		{
			code: "R-04",
			title: "Fluctuación del tipo de cambio",
			type: "amenaza",
			category: "Externo",
			owner: "Director de Proyecto",
			proximity: "media",
			status: "monitoreo",
			wbs: ["3.1", "3.3"],
			cause: "el 30 % del costo está denominado en moneda extranjera (estructuras y equipos importados)",
			event: "el tipo de cambio sube por encima de la banda prevista",
			effect: "aumenta el costo en moneda local de la procura",
			prob: 3,
			impCost: 3,
			impTime: 1,
			impScope: 1,
			costImpact: {
				low: 15e4,
				likely: 3e5,
				high: 6e5
			},
			strategy: "mitigar",
			response: "Cobertura cambiaria (forward) para el 30 % en moneda extranjera al cerrar los contratos de procura.",
			trigger: "Variación del tipo de cambio mayor al 3 % respecto de la fecha base",
			responseOwner: "Director de Proyecto",
			responseCost: 12e3,
			resProb: 2,
			resImpCost: 2,
			resImpTime: 1,
			resImpScope: 1,
			resCostImpact: {
				low: 6e4,
				likely: 12e4,
				high: 24e4
			}
		},
		{
			code: "R-05",
			title: "Paro del sindicato de construcción civil",
			type: "amenaza",
			category: "Externo",
			owner: "Asesoría Legal",
			proximity: "media",
			status: "con_respuesta",
			wbs: [
				"4.1",
				"4.2",
				"4.3"
			],
			cause: "no se acuerdan las condiciones laborales con el sindicato",
			event: "el sindicato paraliza la obra",
			effect: "se detiene la ejecución y hay costos de desmovilización y removilización de cuadrillas",
			prob: 2,
			impCost: 3,
			impTime: 4,
			impScope: 1,
			costImpact: {
				low: 1e5,
				likely: 2e5,
				high: 4e5
			},
			timeImpact: {
				low: 15,
				likely: 30,
				high: 60
			},
			strategy: "evitar",
			response: "Acuerdo laboral previo al inicio de obra: jornadas, seguridad y contratación local.",
			trigger: "Rechazo del sindicato a la propuesta de acuerdo",
			responseOwner: "Asesoría Legal",
			resProb: 1,
			resImpCost: 3,
			resImpTime: 4,
			resImpScope: 1,
			resCostImpact: {
				low: 1e5,
				likely: 2e5,
				high: 4e5
			},
			resTimeImpact: {
				low: 15,
				likely: 30,
				high: 60
			}
		},
		{
			code: "R-06",
			title: "Accidente grave en obra",
			type: "amenaza",
			category: "Técnico",
			owner: "Residente de Obra",
			proximity: "larga",
			status: "con_respuesta",
			wbs: ["4.1", "4.3"],
			cause: "trabajos en altura y con maquinaria pesada en simultáneo",
			event: "ocurre un accidente grave",
			effect: "se paraliza el frente de trabajo y hay sanciones de SUNAFIL",
			prob: 2,
			impCost: 3,
			impTime: 4,
			impScope: 3,
			costImpact: {
				low: 8e4,
				likely: 15e4,
				high: 4e5
			},
			timeImpact: {
				low: 10,
				likely: 25,
				high: 60
			},
			strategy: "mitigar",
			response: "Plan de SST, inducción obligatoria y supervisión diaria; auditoría previa de cumplimiento.",
			trigger: "Incidente sin lesión (casi accidente) reportado",
			responseOwner: "Residente de Obra",
			resProb: 1,
			resImpCost: 3,
			resImpTime: 4,
			resImpScope: 3,
			resCostImpact: {
				low: 8e4,
				likely: 15e4,
				high: 4e5
			},
			resTimeImpact: {
				low: 10,
				likely: 25,
				high: 60
			}
		},
		{
			code: "R-07",
			title: "Oposición vecinal y restricciones de tráfico",
			type: "amenaza",
			category: "Externo",
			owner: "Residente de Obra",
			proximity: "corta",
			status: "con_respuesta",
			wbs: ["4.1"],
			cause: "la Junta de vecinos de Lurín percibe impactos de ruido y tránsito de camiones",
			event: "los vecinos reclaman y las autoridades restringen los horarios de trabajo",
			effect: "se reducen las horas productivas del movimiento de tierras",
			prob: 3,
			impCost: 2,
			impTime: 3,
			impScope: 1,
			costImpact: {
				low: 2e4,
				likely: 5e4,
				high: 12e4
			},
			timeImpact: {
				low: 5,
				likely: 10,
				high: 25
			},
			strategy: "mitigar",
			response: "Mesas de diálogo mensuales, canal de reclamos y plan de manejo de tráfico comunicado antes del inicio.",
			trigger: "Primer reclamo formal de los vecinos",
			responseOwner: "Residente de Obra",
			resProb: 2,
			resImpCost: 2,
			resImpTime: 2,
			resImpScope: 1,
			resCostImpact: {
				low: 1e4,
				likely: 25e3,
				high: 6e4
			},
			resTimeImpact: {
				low: 2,
				likely: 5,
				high: 12
			}
		},
		{
			code: "R-08",
			title: "Retraso en la fabricación de estructuras metálicas",
			type: "amenaza",
			category: "Externo",
			owner: "Jefe de Logística",
			proximity: "media",
			status: "con_respuesta",
			wbs: ["3.1", "4.3"],
			cause: "la fábrica del Proveedor A acumula pedidos",
			event: "las estructuras se entregan tarde",
			effect: "se retrasa el montaje de la estructura y cobertura",
			prob: 3,
			impCost: 2,
			impTime: 4,
			impScope: 1,
			costImpact: {
				low: 3e4,
				likely: 6e4,
				high: 15e4
			},
			timeImpact: {
				low: 15,
				likely: 25,
				high: 45
			},
			strategy: "mitigar",
			response: "Inspección en fábrica cada dos semanas e hitos de fabricación pagados contra avance.",
			trigger: "Avance de fabricación menor al 90 % del programado",
			responseOwner: "Jefe de Logística",
			resProb: 2,
			resImpCost: 2,
			resImpTime: 3,
			resImpScope: 1,
			resCostImpact: {
				low: 3e4,
				likely: 6e4,
				high: 15e4
			},
			resTimeImpact: {
				low: 10,
				likely: 15,
				high: 30
			}
		},
		{
			code: "R-09",
			title: "Rendimientos de cuadrilla menores a los estimados",
			type: "amenaza",
			category: "Gestión del proyecto",
			owner: "Residente de Obra",
			proximity: "media",
			status: "monitoreo",
			wbs: ["4.3", "4.4"],
			cause: "las duraciones se estimaron con rendimientos teóricos de cuadrilla",
			event: "el rendimiento real resulta menor",
			effect: "aumentan la duración y el costo de mano de obra",
			prob: 4,
			impCost: 3,
			impTime: 3,
			impScope: 1,
			costImpact: {
				low: 1e5,
				likely: 22e4,
				high: 45e4
			},
			timeImpact: {
				low: 10,
				likely: 20,
				high: 30
			},
			strategy: "aceptar",
			response: "Aceptación activa: se cubre con la contingencia del estimado y se mide el rendimiento real cada semana.",
			trigger: "Rendimiento real menor al 85 % del estimado durante dos semanas seguidas",
			responseOwner: "Residente de Obra"
		},
		{
			code: "R-10",
			title: "Descuento por volumen al consolidar compras",
			type: "oportunidad",
			category: "Gestión del proyecto",
			owner: "Jefe de Logística",
			proximity: "corta",
			status: "con_respuesta",
			wbs: ["3.2", "3.3"],
			cause: "las compras de materiales y de equipos eléctricos se concentran en el mismo periodo",
			event: "se consolida el pedido con un mismo proveedor",
			effect: "se obtiene un descuento por volumen",
			prob: 3,
			impCost: 3,
			impTime: 1,
			impScope: 1,
			costImpact: {
				low: 4e4,
				likely: 9e4,
				high: 15e4
			},
			strategy: "mejorar",
			response: "Solicitar cotización consolidada a los Proveedores B y C.",
			trigger: "Cotizaciones recibidas para 3.2 y 3.3",
			responseOwner: "Jefe de Logística",
			resProb: 4,
			resImpCost: 3,
			resImpTime: 1,
			resImpScope: 1,
			resCostImpact: {
				low: 4e4,
				likely: 9e4,
				high: 15e4
			}
		}
	];
	function buildSampleRisks(resolveWbs) {
		return SAMPLE_RISKS.map((s, i) => normalizeRisk({
			...s,
			id: "rk" + (i + 1),
			identifiedOn: "2026-07-06",
			wbsIds: s.wbs.map(resolveWbs).filter(Boolean)
		}, "rk" + (i + 1)));
	}
	//#endregion
	//#region src/shared/knowledge-sample.ts
	var SAMPLE_KNOWLEDGE_AS_OF = "2026-11-03";
	var sampleKnowledgeFacts = () => {
		const risks = buildSampleRisks((code) => "w-" + code);
		return {
			materialized: risks.filter((r) => r.status === "materializado").map((r) => ({
				code: r.code,
				title: r.title
			})),
			riskCodes: risks.map((r) => r.code),
			leaves: SAMPLE_CASE_LEAVES.map((l) => ({
				id: "w-" + l.code,
				code: l.code,
				name: l.name
			})),
			roles: SAMPLE_OBS_ROLES.slice()
		};
	};
	var ROWS = [
		[
			"LL-01",
			"2026-07-15",
			"buena_practica",
			"Alcance",
			"1.2",
			"",
			"El criterio de aceptación de cada paquete se escribió en el diccionario de la EDT antes de armar los controles de calidad.",
			"Tener el criterio de aceptación en la EDT permitió planificar cada control de calidad sin volver a preguntar qué significa «conforme».",
			"En todo proyecto, redactar el criterio de aceptación de cada paquete en la EDT antes de planificar la calidad y las adquisiciones.",
			"Jefe de Ingeniería",
			"Oficina de proyectos",
			"validada"
		],
		[
			"LL-02",
			"2026-08-06",
			"buena_practica",
			"Adquisiciones",
			"3.1",
			"R-02",
			"La fabricación de las estructuras metálicas es el paquete de mayor plazo y de mayor exposición al precio del acero.",
			"Convocar primero la compra crítica, con un contrato de ajuste económico, evitó que el alza del acero cayera entera sobre el proyecto.",
			"Calcular para cada compra la fecha límite de convocatoria contra el cronograma y lanzar antes la de mayor plazo y volatilidad de precio.",
			"Jefe de Logística",
			"Oficina de proyectos",
			"validada"
		],
		[
			"LL-03",
			"2026-08-27",
			"oportunidad",
			"Cronograma",
			"1.3",
			"",
			"Los informes de seguimiento (1.3) figuraban como un paquete de duración y aparecían como paquete demasiado largo en la calidad de la EDT.",
			"El seguimiento es esfuerzo continuo: medirlo por duración lo distorsiona.",
			"Declarar como esfuerzo continuo (LOE) los paquetes de gestión al armar el diccionario de la EDT.",
			"Director de Proyecto",
			"Oficina de proyectos",
			"validada"
		],
		[
			"LL-04",
			"2026-09-02",
			"problema",
			"Riesgos",
			"4.2",
			"R-03",
			"En la excavación de las zapatas apareció un suelo con menor capacidad portante que la del estudio: se aprobó el refuerzo de cimentación OC-001 (180.000) con cargo a la contingencia.",
			"Las calicatas del estudio de suelos no cubrieron el punto de mayor carga; el riesgo estaba identificado pero sin respuesta específica.",
			"Exigir una densidad mínima de calicatas por área de cimentación y reservar una contingencia geotécnica propia cuando el estudio es limitado.",
			"Jefe de Ingeniería",
			"Oficina de proyectos y Comité de Control de Cambios",
			"validada"
		],
		[
			"LL-05",
			"2026-09-30",
			"problema",
			"Cronograma",
			"4.4",
			"R-09",
			"Acabados y cerramientos (4.4) resultó con 106 días de duración porque sus tres actividades van en serie.",
			"Un paquete con actividades en serie es largo y difícil de controlar con avance real.",
			"Descomponer el paquete por zonas o frentes para que puedan avanzar en paralelo antes de fijar la línea base.",
			"Residente de Obra",
			"",
			"validada"
		],
		[
			"LL-06",
			"2026-10-15",
			"buena_practica",
			"Comunicaciones",
			"4.1",
			"R-07",
			"Se abrió la mesa de diálogo con la comunidad de Lurín un mes antes del movimiento de tierras.",
			"Explicar el plan de tráfico y ruido antes de empezar redujo la oposición y dio un canal para los reclamos.",
			"Abrir el canal con los vecinos antes del primer movimiento en obra y llevar un libro de reclamos con respuesta en plazo.",
			"Residente de Obra",
			"Oficina de proyectos",
			"validada"
		],
		[
			"LL-07",
			"2026-10-20",
			"problema",
			"Calidad",
			"3.1",
			"R-08",
			"Al recibir el lote 2 de estructuras, tres piezas tenían soldadura fuera de tolerancia y el certificado de calidad estaba incompleto (NC-01).",
			"Inspeccionar solo a la recepción en obra detecta el defecto tarde: el reproceso ocurre con la pieza ya despachada.",
			"Inspeccionar en fábrica antes del embarque, con protocolo de soldadura y certificados por lote como requisito de despacho.",
			"Control de Calidad",
			"",
			"capturada"
		],
		[
			"LL-08",
			"2026-10-27",
			"buena_practica",
			"Interesados",
			"2.4",
			"R-01",
			"La municipalidad envió por escrito observaciones al expediente de la licencia cuando el trámite ya estaba avanzado.",
			"Las reuniones técnicas semanales con la autoridad adelantaron la subsanación (presentada el 2/11) sin frenar el resto del cronograma.",
			"Pedir reunión técnica semanal con la autoridad desde el ingreso del expediente y registrar cada observación con su fecha.",
			"Asesoría Legal",
			"",
			"capturada"
		]
	];
	function buildSampleKnowledge(resolveLeaf = (c) => "w-" + c) {
		const lessons = ROWS.map(([code, date, kind, category, wbs, riskCode, situation, lesson, recommendation, owner, audience, status], i) => normalizeLesson({
			id: "ll" + (i + 1),
			code,
			date,
			kind,
			category,
			wbsId: resolveLeaf(wbs),
			riskCode,
			situation,
			lesson,
			recommendation,
			owner,
			audience,
			status
		}, "ll" + (i + 1)));
		return {
			lessons,
			asOf: SAMPLE_KNOWLEDGE_AS_OF,
			idCounter: lessons.length + 1
		};
	}
	//#endregion
	//#region src/modules/knowledge/main.ts
	var $ = (id) => document.getElementById(id);
	function setStatus(msg) {
		$("statusLeft").textContent = msg;
	}
	var STATE_LABEL = {
		vacio: "Sin datos",
		verde: "En orden",
		ambar: "Con avisos",
		rojo: "Con riesgos"
	};
	var ctx = null;
	var ctxDirty = true;
	function getCtx() {
		if (ctxDirty || !ctx) {
			const G = window.GPI, connected = !!(G && G.available() && G.active());
			let facts = {
				materialized: [],
				riskCodes: [],
				leaves: [],
				roles: []
			};
			if (!connected) facts = sampleKnowledgeFacts();
			else if (G && G.util) try {
				facts = gatherKnowledgeFacts(G);
			} catch (e) {}
			ctx = {
				connected,
				facts
			};
			ctxDirty = false;
		}
		return ctx;
	}
	var data = blankKnowledge();
	var newId = () => "ll" + data.idCounter++;
	var enumOpts = (list, labels, cur) => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
	var catOpts = (cur) => `<option value=""></option>` + CATEGORIES.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && CATEGORIES.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
	function lessonRow(l, f, flagged) {
		const leafOpts = `<option value=""></option>` + f.leaves.map((x) => `<option value="${esc(x.id)}"${x.id === l.wbsId ? " selected" : ""}>${esc(x.code)} ${esc(x.name)}</option>`).join("") + (l.wbsId && !f.leaves.some((x) => x.id === l.wbsId) ? `<option value="${esc(l.wbsId)}" selected>(ya no existe)</option>` : "");
		return `<tr data-id="${esc(l.id)}"${flagged.has(l.id) ? " class=\"hasf\"" : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(l.code)}" aria-label="Código"></td>
    <td style="width:130px"><input data-f="date" type="date" value="${esc(l.date)}" aria-label="Fecha"></td>
    <td style="width:150px"><select data-f="kind" aria-label="Tipo">${enumOpts(LESSON_KINDS, KIND_LABEL, l.kind)}</select><select data-f="category" style="margin-top:3px" aria-label="Categoría">${catOpts(l.category)}</select></td>
    <td style="min-width:150px"><select data-f="wbsId" aria-label="Paquete">${leafOpts}</select><input data-f="riskCode" list="risksList" value="${esc(l.riskCode)}" placeholder="Riesgo (R-03)" style="margin-top:3px" aria-label="Riesgo relacionado"></td>
    <td style="min-width:200px"><textarea data-f="situation" aria-label="Qué pasó">${esc(l.situation)}</textarea></td>
    <td style="min-width:200px"><textarea data-f="lesson" aria-label="Qué se aprendió">${esc(l.lesson)}</textarea></td>
    <td style="min-width:200px"><textarea data-f="recommendation" aria-label="Qué hacer distinto">${esc(l.recommendation)}</textarea></td>
    <td style="min-width:140px"><input data-f="owner" list="rolesList" value="${esc(l.owner)}" aria-label="Responsable"><input data-f="audience" value="${esc(l.audience)}" placeholder="A quién se transfiere" style="margin-top:3px" aria-label="Destinatarios"></td>
    <td style="width:130px"><select data-f="status" aria-label="Estado">${enumOpts(LESSON_STATUSES, STATUS_LABEL, l.status)}</select></td>
    <td><button class="btn sm danger" data-del="${esc(l.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
	}
	function render() {
		const f = getCtx().facts, root = $("mainArea"), flagged = new Set(knowledgeFindings(data, f, todayLocalISO()).map((x) => x.lessonId).filter((x) => !!x));
		root.innerHTML = `
    <div class="view-head"><h2>Lecciones aprendidas</h2>
      <p>Cada lección responde: <b>qué pasó</b>, <b>qué se aprendió</b> y <b>qué hacer distinto</b> la próxima vez. Se captura <b>durante</b> la ejecución (no al cierre, cuando ya nadie recuerda por qué pasó), se <b>valida</b> y se <b>transfiere</b> a quien la necesita. Cada riesgo que se materializó debería dejar su lección.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="card"><h3>Registro de lecciones (${data.lessons.length})</h3>
      <div class="fd" style="max-width:260px;margin-bottom:8px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" value="${esc(data.asOf)}"></div>
      ${data.lessons.length ? `<table class="an" id="tblLessons"><thead><tr><th>Cód.</th><th>Fecha</th><th>Tipo y categoría</th><th>Paquete y riesgo</th><th>Qué pasó</th><th>Qué se aprendió</th><th>Qué hacer distinto</th><th>Responsable y destinatarios</th><th>Estado</th><th></th></tr></thead><tbody>${data.lessons.map((l) => lessonRow(l, f, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist><datalist id="risksList">${f.riskCodes.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>` : `<div class="empty-hint">Aún no hay lecciones. Agrega la primera con <b>＋ Lección</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Riesgos materializados</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos</h3><div id="finds"></div></div>`;
		refreshMeta();
		wireMain();
	}
	function refreshMeta() {
		const f = getCtx().facts, today = todayLocalISO(), fs = knowledgeFindings(data, f, today), st = knowledgeState(data, f, today), s = summary(data);
		const cited = new Set(data.lessons.map((l) => l.riskCode.trim().toLowerCase()).filter(Boolean)), sinLeccion = f.materialized.filter((r) => !cited.has(r.code.toLowerCase())).length;
		$("kpis").innerHTML = `<div class="kpi"><b>${s.total}</b><span>Lecciones registradas</span></div>
    <div class="kpi"><b>${s.byStatus.validada + s.byStatus.transferida}/${s.total}</b><span>Validadas o transferidas</span></div>
    <div class="kpi"><b>${s.byStatus.transferida}</b><span>Transferidas</span></div>
    <div class="kpi"><b>${sinLeccion}/${f.materialized.length}</b><span>Riesgos materializados sin lección</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado</span></div>`;
		$("cover").innerHTML = f.materialized.length ? `<table class="an"><thead><tr><th>Riesgo materializado (Registro de Riesgos)</th><th>Lecciones</th></tr></thead><tbody>${f.materialized.map((r) => {
			const ls = data.lessons.filter((l) => l.riskCode.trim().toLowerCase() === r.code.toLowerCase());
			return `<tr><td>${esc(r.code)} ${esc(r.title)}</td><td>${ls.length ? ls.map((l) => esc(l.code)).join(", ") : "<span class=\"pill st-ambar\">ninguna</span>"}</td></tr>`;
		}).join("")}</tbody></table>` : `<p class="muted small">Ningún riesgo del Registro se ha materializado (o no hay Registro de Riesgos).</p>`;
		const icon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		$("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.lessons.length ? "Sin hallazgos." : "Sin lecciones que revisar."}</p>`;
	}
	function wireMain() {
		const asOf = document.getElementById("asOf");
		if (asOf) asOf.addEventListener("change", () => {
			data.asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf.value) ? asOf.value : "";
			refreshMeta();
			save();
		});
		const t = document.getElementById("tblLessons");
		if (!t) return;
		const upd = (el) => {
			const tr = el.closest("tr"), l = tr && data.lessons.find((x) => x.id === tr.getAttribute("data-id")), fld = el.getAttribute("data-f");
			if (!l || !fld) return;
			l[fld] = el.value;
			refreshMeta();
			save();
		};
		t.addEventListener("input", (e) => {
			const x = e.target;
			if (x.tagName !== "SELECT") upd(x);
		});
		t.addEventListener("change", (e) => upd(e.target));
		t.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
			data.lessons = data.lessons.filter((x) => x.id !== b.dataset.del);
			render();
			save();
			setStatus("Lección eliminada.");
		}));
	}
	function addLesson() {
		const id = newId(), l = normalizeLesson({
			id,
			code: nextCode(data.lessons),
			date: todayLocalISO()
		}, id);
		data.lessons.push(l);
		render();
		save();
		setStatus(l.code + " creada: cuenta qué pasó, qué se aprendió y qué hacer distinto.");
		const el = document.querySelector(`tr[data-id="${id}"] textarea`);
		if (el) el.focus();
	}
	function exportCsv() {
		const f = getCtx().facts, leaf = (id) => {
			const l = f.leaves.find((x) => x.id === id);
			return l ? l.code + " " + l.name : "";
		}, q = (v) => "\"" + v.replace(/"/g, "\"\"") + "\"";
		const lines = [[
			"Código",
			"Fecha",
			"Tipo",
			"Categoría",
			"Paquete",
			"Riesgo",
			"Qué pasó",
			"Qué se aprendió",
			"Qué hacer distinto",
			"Responsable",
			"Destinatarios",
			"Estado"
		].map(q).join(",")];
		data.lessons.forEach((l) => lines.push([
			l.code,
			l.date,
			KIND_LABEL[l.kind],
			l.category,
			leaf(l.wbsId),
			l.riskCode,
			l.situation,
			l.lesson,
			l.recommendation,
			l.owner,
			l.audience,
			STATUS_LABEL[l.status]
		].map(q).join(",")));
		const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "lecciones_aprendidas.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Lecciones exportadas como CSV.");
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
	function sampleForProject() {
		const C = getCtx();
		if (!C.connected) return buildSampleKnowledge();
		const leaf = new Map(C.facts.leaves.map((l) => [l.code, l.id]));
		return buildSampleKnowledge((c) => leaf.get(c) || "");
	}
	function wireToolbar() {
		$("btnAdd").addEventListener("click", addLesson);
		$("btnCsv").addEventListener("click", exportCsv);
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el registro actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				ctxDirty = true;
				data = sampleForProject();
				render();
				save();
				const C = getCtx(), miss = C.connected ? data.lessons.filter((l) => l.riskCode && !C.facts.riskCodes.some((c) => c.toLowerCase() === l.riskCode.toLowerCase())).length : 0;
				setStatus("Caso de ejemplo cargado." + (miss ? " " + miss + " lección(es) citan riesgos (R-01…R-09) que no están en el Registro de Riesgos del proyecto: carga el ejemplo en Gestión de Riesgos para que coincidan." : ""));
			});
		});
		$("btnClear").addEventListener("click", () => {
			showConfirm("Esto borrará todas las lecciones. ¿Continuar?", "Nuevo registro").then((ok) => {
				if (ok) {
					data = blankKnowledge();
					render();
					save();
					setStatus("Registro nuevo iniciado.");
				}
			});
		});
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar las lecciones aprendidas aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			lessons: data.lessons,
			asOf: data.asOf,
			idCounter: data.idCounter
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("knowledge");
			ctxDirty = true;
			const mod = p.modules && p.modules.knowledge;
			if (mod && typeof mod === "object") {
				data = normalizeKnowledge(mod);
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = blankKnowledge();
				render();
				setStatus("Proyecto sin lecciones todavía. Agrega la primera, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "knowledge", "Las lecciones aprendidas", payload(), null, session, {
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
		const reread = () => {
			ctxDirty = true;
			const a = document.activeElement;
			if (!(a && $("mainArea").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
			else refreshMeta();
		};
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
			else reread();
		});
		window.GPI.onChange(() => {
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return;
			}
			reread();
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	})();
	function gpiBadge(name, pushFn) {
		installGpiBadge({
			name,
			onSync: pushFn,
			accent: "#00705f",
			hover: "#00967f"
		});
	}
	wireToolbar();
	if (!(window.GPI && window.GPI.available() && window.GPI.active())) {
		data = buildSampleKnowledge();
		ctxDirty = true;
		render();
	} else render();
	//#endregion
})();
