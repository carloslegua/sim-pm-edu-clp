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
	var numOrNull$1 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return typeof n === "number" && isFinite(n) ? n : null;
	};
	function normalizeReserves(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			pmLimit: numOrNull$1(x.pmLimit),
			ccbLimit: numOrNull$1(x.ccbLimit),
			contAlertPct: numOrNull$1(x.contAlertPct)
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
	var isOpen = (r) => r.status !== "materializado" && r.status !== "cerrado";
	//#endregion
	//#region src/shared/plan-facts.ts
	var rec$1 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
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
	function gatherProcurementFacts(G) {
		const wbs = G.util.effectiveWbs(), nodes = rec$1(wbs && wbs.nodes), obs = G.util.obsNodes(G.getModule("obs")), sk = rec$1(G.getModule("stakeholders")).stakeholders;
		const cost = G.getModule("cost"), cl = Number(String(cost && cost.estimate && cost.estimate.class).replace(/\D/g, ""));
		return {
			leaves: G.util.wbsLeaves(wbs).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name,
				cost: Number(rec$1(nodes[l.id]).cost) || 0
			})),
			roles: rolesOf(G),
			risks: openRisks(G),
			suppliers: Array.from(new Set(obs.map((n) => (n.person || "").trim()).concat((Array.isArray(sk) ? sk : []).map((s) => String(rec$1(s).org || "").trim())).filter(Boolean))),
			estimateClass: cl >= 1 && cl <= 5 ? cl : null,
			baseCost: baseCostOf(G)
		};
	}
	//#endregion
	//#region src/shared/procurement-plan.ts
	var DECISIONS = [
		"Comprar",
		"Hacer (recursos propios)",
		"Alquilar o arrendar"
	];
	var CONTRACT_TYPES = [
		"Precio fijo (FFP)",
		"Precio fijo con ajuste económico (FPEPA)",
		"Precio unitario",
		"Tiempo y materiales (T&M)",
		"Costo reembolsable (CPFF)",
		"Costo reembolsable con incentivos (CPIF)"
	];
	var SELECTION_METHODS = [
		"Licitación abierta",
		"Invitación restringida",
		"Concurso de precios",
		"Concurso por calidad y costo",
		"Adjudicación directa"
	];
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
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var strs = (v) => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec = (o) => o && typeof o === "object" ? o : {};
	var iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeItem(o, fb) {
		const x = rec(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			name: str(x.name),
			wbsIds: strs(x.wbsIds),
			full: x.full === false ? false : true,
			decision: str(x.decision),
			contractType: str(x.contractType),
			selection: str(x.selection),
			criteria: (Array.isArray(x.criteria) ? x.criteria : []).map((c) => {
				const q = rec(c);
				return {
					name: str(q.name),
					weight: numOrNull(q.weight)
				};
			}),
			value: numOrNull(x.value),
			needDate: str(x.needDate),
			leadDays: numOrNull(x.leadDays),
			selectionDays: numOrNull(x.selectionDays),
			supplier: str(x.supplier),
			status: STATUS_RANK[str(x.status)] !== void 0 ? str(x.status) : "Planificada",
			owner: str(x.owner),
			awardDate: str(x.awardDate),
			riskIds: strs(x.riskIds),
			notes: str(x.notes)
		};
	}
	function normalizeProcurement(raw, today = "") {
		const x = rec(raw), items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "pr" + (i + 1)));
		return {
			strategy: str(x.strategy),
			performance: str(x.performance),
			approvals: str(x.approvals),
			asOf: iso(str(x.asOf)) ? str(x.asOf) : today,
			items,
			idCounter: Number(x.idCounter) || items.length + 1
		};
	}
	var blankProcurement = (today = "") => normalizeProcurement(null, today);
	function nextCode(items) {
		let max = 0;
		items.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "PR-" + String(max + 1).padStart(2, "0");
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
	var SAMPLE_CASE_BASE_COST = 71e5;
	//#endregion
	//#region src/shared/risk-sample.ts
	var SAMPLE_PLAN = normalizePlan({
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
	//#region src/shared/procurement-sample.ts
	var SAMPLE_AS_OF = "2026-08-05";
	var SAMPLE_SUPPLIERS = [
		"Proveedor A",
		"Proveedor B",
		"Proveedor C",
		"Subcontrata MEP"
	];
	var sampleProcurementFacts = () => ({
		leaves: SAMPLE_CASE_LEAVES.map((l) => ({
			id: "w-" + l.code,
			code: l.code,
			name: l.name,
			cost: l.cost
		})),
		roles: SAMPLE_OBS_ROLES.slice(),
		risks: buildSampleRisks((code) => "w-" + code).filter(isOpen).map((r) => ({
			id: r.id,
			code: r.code,
			title: r.title,
			wbsIds: r.wbsIds,
			high: levelOf(inherentScore(r), SAMPLE_PLAN) === "alto",
			threat: r.type === "amenaza"
		})),
		suppliers: SAMPLE_SUPPLIERS.slice(),
		estimateClass: 3,
		baseCost: SAMPLE_CASE_BASE_COST
	});
	var CRITERIA = (price, tech, plazo, exp) => [
		{
			name: "Precio",
			weight: price
		},
		{
			name: "Capacidad técnica y certificados de calidad",
			weight: tech
		},
		{
			name: "Plazo de entrega",
			weight: plazo
		},
		{
			name: "Experiencia en proyectos similares",
			weight: exp
		}
	];
	var ROWS = [
		[
			"PR-01",
			"Estructuras metálicas prefabricadas",
			["3.1"],
			true,
			"Comprar",
			"Precio fijo con ajuste económico (FPEPA)",
			"Concurso por calidad y costo",
			CRITERIA(35, 35, 20, 10),
			182e4,
			"2026-10-19",
			18,
			45,
			"Proveedor A",
			"Convocada",
			"Jefe de Logística",
			[
				"R-02",
				"R-04",
				"R-08"
			]
		],
		[
			"PR-02",
			"Materiales de construcción",
			["3.2"],
			true,
			"Comprar",
			"Precio unitario",
			"Concurso de precios",
			CRITERIA(50, 20, 20, 10),
			715e3,
			"2026-11-04",
			20,
			30,
			"Proveedor B",
			"Planificada",
			"Jefe de Logística",
			["R-10"]
		],
		[
			"PR-03",
			"Equipos eléctricos e instalaciones",
			["3.3"],
			true,
			"Comprar",
			"Precio fijo (FFP)",
			"Invitación restringida",
			CRITERIA(40, 30, 20, 10),
			415e3,
			"2026-10-13",
			13,
			20,
			"Proveedor C",
			"Planificada",
			"Jefe de Logística",
			["R-04", "R-10"]
		],
		[
			"PR-04",
			"Subcontrato de instalaciones MEP",
			["4.5"],
			true,
			"Comprar",
			"Precio fijo (FFP)",
			"Invitación restringida",
			CRITERIA(40, 30, 10, 20),
			485e3,
			"2027-04-16",
			46,
			60,
			"Subcontrata MEP",
			"Planificada",
			"Director de Proyecto",
			[]
		],
		[
			"PR-05",
			"Servicio de ensayos de laboratorio (suelos, concreto y densidad de campo)",
			["4.1", "4.2"],
			false,
			"Comprar",
			"Precio unitario",
			"Concurso de precios",
			CRITERIA(50, 30, 10, 10),
			95e3,
			"2026-11-12",
			10,
			30,
			"",
			"Planificada",
			"Control de Calidad",
			[
				"R-05",
				"R-06",
				"R-07"
			]
		]
	];
	function buildSampleProcurement(resolveWbs = (c) => "w-" + c, resolveRisk = (c) => {
		const r = buildSampleRisks((code) => "w-" + code).find((x) => x.code === c);
		return r ? r.id : "";
	}) {
		const items = ROWS.map(([code, name, wbs, full, decision, contractType, selection, criteria, value, needDate, leadDays, selectionDays, supplier, status, owner, risks], i) => normalizeItem({
			id: "pr" + (i + 1),
			code,
			name,
			wbsIds: wbs.map(resolveWbs).filter(Boolean),
			full,
			decision,
			contractType,
			selection,
			criteria,
			value,
			needDate,
			leadDays,
			selectionDays,
			supplier,
			status,
			owner,
			awardDate: "",
			riskIds: risks.map(resolveRisk).filter(Boolean),
			notes: code === "PR-01" ? "Convocatoria anticipada: la fabricación tiene el plazo más largo y la mayor exposición al precio del acero (R-02) y al tipo de cambio (R-04). El ajuste económico limita el riesgo del proveedor sin trasladarnos el alza total." : ""
		}, "pr" + (i + 1)));
		return {
			strategy: "Se compra todo lo que no es la dirección, la ingeniería ni el control de calidad del proyecto: procura de estructuras, materiales y equipos por paquete, y la instalación MEP a un subcontratista. Cada compra usa el contrato que reparte el riesgo según qué tan definido está su alcance: precio fijo donde hay planos y especificación (equipos, MEP), ajuste económico donde el insumo es volátil (acero) y precio unitario donde la cantidad final varía (materiales, ensayos).",
			performance: "El Jefe de Logística mide a cada proveedor por entregas a tiempo y conformes (registro de recepción de Calidad) y por avance de fabricación; dos entregas no conformes seguidas activan una reunión de acción correctiva con el proveedor y su registro como interesado a gestionar de cerca.",
			approvals: "Adjudicaciones y contratos hasta USD 100.000: Director de Proyecto. Mayores a ese monto: Comité Directivo / Sponsor, con el informe de evaluación de ofertas y la revisión de Asesoría Legal.",
			asOf: SAMPLE_AS_OF,
			items,
			idCounter: items.length + 1
		};
	}
	//#endregion
	//#region src/modules/procurement/main.ts
	var $ = (id) => document.getElementById(id);
	function setStatus(msg) {
		$("statusLeft").textContent = msg;
	}
	var todayISO = () => todayLocalISO();
	var CUR = {
		USD: "$",
		PEN: "S/",
		EUR: "€"
	};
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
				leaves: [],
				roles: [],
				risks: [],
				suppliers: [],
				estimateClass: null,
				baseCost: null
			}, sym = "$";
			if (!connected) facts = sampleProcurementFacts();
			else if (G && G.util) try {
				const m = G.meta();
				sym = CUR[m && m.currency || ""] || "$";
				facts = gatherProcurementFacts(G);
			} catch (e) {}
			ctx = {
				connected,
				facts,
				sym
			};
			ctxDirty = false;
		}
		return ctx;
	}
	var money = (n) => n == null || !isFinite(n) ? "—" : getCtx().sym + " " + Math.round(n).toLocaleString("es-PE");
	var data = blankProcurement(todayISO());
	var openSet = /* @__PURE__ */ new Set();
	var newId = () => "pr" + data.idCounter++;
	var byId = (id) => data.items.find((x) => x.id === id);
	var opts = (list, cur) => `<option value=""></option>` + list.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && list.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
	var fld = (label, inner, cls = "") => `<div class="fd ${cls}"><label>${label}</label>${inner}</div>`;
	function summaryHtml(it) {
		const lb = launchBy(it), left = lb ? daysBetween(data.asOf, lb) : null;
		const pill = !isBuy(it) ? "<span class=\"pill st-vacio\">hacer</span>" : lb === null ? "<span class=\"pill st-ambar\">sin fecha límite</span>" : it.status !== "Planificada" ? "<span class=\"pill st-vacio\">en curso</span>" : left !== null && left < 0 ? `<span class="pill st-rojo">convocar YA · venció ${esc(lb)}</span>` : left !== null && left <= 30 ? `<span class="pill st-ambar">convocar antes del ${esc(lb)}</span>` : `<span class="pill st-verde">convocar antes del ${esc(lb)}</span>`;
		return `<b class="mono">${esc(it.code)}</b><span>${esc(it.name) || "<span class=\"muted\">(sin nombre)</span>"}</span><span class="muted small">${esc(it.contractType)}</span><span class="pill st-vacio">${esc(it.status)}</span>${pill}<span class="mono">${it.value === null ? "—" : money(it.value)}</span>`;
	}
	function itemHtml(it, f, flagged) {
		const buy = isBuy(it), sum = criteriaSum(it);
		const leafOpts = f.leaves.map((l) => `<option value="${esc(l.id)}"${it.wbsIds.indexOf(l.id) >= 0 ? " selected" : ""}>${esc(l.code)} ${esc(l.name)} (${money(l.cost)})</option>`).join("");
		const riskOpts = f.risks.map((r) => `<option value="${esc(r.id)}"${it.riskIds.indexOf(r.id) >= 0 ? " selected" : ""}>${esc(r.code)} ${esc(r.title)}${r.high ? " ⚠" : ""}</option>`).join("");
		return `<details class="pr${flagged.has(it.id) ? " hasf" : ""}" data-id="${esc(it.id)}"${openSet.has(it.id) ? " open" : ""}><summary>${summaryHtml(it)}</summary><div class="body">
    <div class="form">
      ${fld("Código", `<input data-f="code" value="${esc(it.code)}">`)}${fld("Adquisición", `<input data-f="name" value="${esc(it.name)}">`, "w2")}${fld("Decisión", `<select data-f="decision">${opts(DECISIONS, it.decision)}</select>`)}
      ${fld("Paquetes de la EDT que cubre", `<select data-f="wbsIds" multiple>${leafOpts}</select>`, "w2")}
      ${fld("Cobertura", `<label style="font-weight:600;display:flex;gap:6px;align-items:center"><input type="checkbox" data-f="full"${it.full ? " checked" : ""} style="width:auto"> Cubre todo el costo de esos paquetes</label>`)}
      ${fld("Responsable", `<input data-f="owner" list="rolesList" value="${esc(it.owner)}">`)}
      ${buy ? `${fld("Tipo de contrato", `<select data-f="contractType">${opts(CONTRACT_TYPES, it.contractType)}</select>`, "w2")}${fld("Método de selección", `<select data-f="selection">${opts(SELECTION_METHODS, it.selection)}</select>`, "w2")}
      ${fld("Valor estimado", `<input data-f="value" type="number" min="0" step="any" value="${it.value === null ? "" : it.value}">`)}
      ${fld("Fecha requerida (en obra)", `<input data-f="needDate" type="date" value="${esc(it.needDate)}">`)}
      ${fld("Plazo del proveedor (días)", `<input data-f="leadDays" type="number" min="0" step="1" value="${it.leadDays === null ? "" : it.leadDays}">`)}
      ${fld("Tiempo de selección (días)", `<input data-f="selectionDays" type="number" min="0" step="1" value="${it.selectionDays === null ? "" : it.selectionDays}">`)}
      ${fld("Estado", `<select data-f="status">${STATUSES.map((s) => `<option${s === it.status ? " selected" : ""}>${s}</option>`).join("")}</select>`)}
      ${fld("Proveedor", `<input data-f="supplier" list="suppliersList" value="${esc(it.supplier)}">`)}
      ${fld("Fecha de adjudicación", `<input data-f="awardDate" type="date" value="${esc(it.awardDate)}">`)}
      ${fld("Riesgos que el contrato trata (⚠ = alto)", `<select data-f="riskIds" multiple>${riskOpts}</select>`)}
      <div class="fd w4"><label>Criterios de selección (deben sumar 100) — <span class="mono" data-sum="${esc(it.id)}">${Math.round(sum * 100) / 100}</span></label>
        ${it.criteria.map((c, i) => `<div class="crit"><input data-c="${i}" data-cf="name" value="${esc(c.name)}" placeholder="Criterio" aria-label="Criterio"><input data-c="${i}" data-cf="weight" type="number" min="0" max="100" step="any" value="${c.weight === null ? "" : c.weight}" placeholder="Peso" aria-label="Peso"><button class="btn sm danger" data-delcrit="${i}" aria-label="Quitar criterio">✕</button></div>`).join("")}
        <div><button class="btn sm" data-addcrit="1">＋ Criterio</button></div></div>` : ""}
      ${fld("Notas (justificación, condiciones especiales)", `<textarea data-f="notes">${esc(it.notes)}</textarea>`, "w4")}
    </div>
    <div style="margin-top:10px"><button class="btn sm danger" data-del="${esc(it.id)}">Eliminar esta adquisición</button></div></div></details>`;
	}
	function render() {
		const f = getCtx().facts, root = $("mainArea"), fs = procurementFindings(data, f), flagged = new Set(fs.map((x) => x.itemId).filter((x) => !!x));
		$("asOf").value = data.asOf;
		root.innerHTML = `
    <div class="view-head"><h2>Plan de adquisiciones</h2>
      <p>Cada ficha responde: <b>qué</b> se compra (paquetes de la EDT), <b>hacer o comprar</b>, con <b>qué contrato</b> y <b>cómo se elige</b> al proveedor, y <b>cuándo hay que convocar</b>: fecha requerida − plazo del proveedor − tiempo de selección. Si esa fecha ya pasó respecto de la fecha de corte y la adquisición sigue «Planificada», el cronograma no se sostiene.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="grid3">
      <div class="card fd"><h3>Estrategia de adquisiciones</h3><label for="strategy">Qué se compra, qué se hace y cómo se contrata</label><textarea id="strategy" data-p="strategy">${esc(data.strategy)}</textarea></div>
      <div class="card fd"><h3>Desempeño de proveedores</h3><label for="performance">Cómo se mide y se gestiona</label><textarea id="performance" data-p="performance">${esc(data.performance)}</textarea></div>
      <div class="card fd"><h3>Autorizaciones</h3><label for="approvals">Quién autoriza contratar y hasta qué monto</label><textarea id="approvals" data-p="approvals">${esc(data.approvals)}</textarea></div>
    </div>
    <div id="items">${data.items.length ? data.items.map((it) => itemHtml(it, f, flagged)).join("") : `<div class="empty-hint">Aún no hay adquisiciones. Agrega la primera con <b>＋ Nueva adquisición</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}</div>
    <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist><datalist id="suppliersList">${f.suppliers.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
    <div class="card"><h3>Hallazgos del plan</h3><div id="finds"></div></div>`;
		refreshMeta();
		wireMain();
	}
	function refreshMeta() {
		const f = getCtx().facts, s = summary(data, f), fs = procurementFindings(data, f), st = procurementState(data, f);
		$("kpis").innerHTML = `<div class="kpi"><b>${s.count}</b><span>Adquisiciones planificadas</span></div>
    <div class="kpi"><b>${money(s.total)}</b><span>Valor estimado${s.pctOfBase !== null ? " · " + s.pctOfBase.toFixed(0) + " % del costo base" : ""}</span></div>
    <div class="kpi"><b>${s.late} / ${s.soon}</b><span>Convocatorias vencidas / próximas (≤ 30 d)</span></div>
    <div class="kpi"><b>${s.byStatus.Contratada + s.byStatus.Entregada}/${s.count}</b><span>Contratadas o entregadas</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado del plan</span></div>`;
		data.items.forEach((it) => {
			const d = document.querySelector(`details.pr[data-id="${it.id}"]`);
			if (!d) return;
			const sm = d.querySelector("summary");
			if (sm) sm.innerHTML = summaryHtml(it);
			d.classList.toggle("hasf", fs.some((x) => x.itemId === it.id));
			const sum = d.querySelector(`[data-sum="${it.id}"]`);
			if (sum) sum.textContent = String(Math.round(criteriaSum(it) * 100) / 100);
		});
		const icon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		$("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.items.length ? "Sin hallazgos." : "Sin adquisiciones que revisar."}</p>`;
	}
	function wireMain() {
		const items = document.getElementById("items");
		if (!items) return;
		document.querySelectorAll("details.pr").forEach((d) => d.addEventListener("toggle", () => {
			const id = d.dataset.id;
			if (d.open) openSet.add(id);
			else openSet.delete(id);
		}));
		const upd = (el) => {
			const d = el.closest("details.pr"), it = d && byId(d.getAttribute("data-id"));
			if (!it) return;
			const f = el.getAttribute("data-f"), ci = el.getAttribute("data-c");
			if (ci !== null) {
				const c = it.criteria[Number(ci)];
				if (!c) return;
				const v = el.value;
				if (el.getAttribute("data-cf") === "name") c.name = v;
				else c.weight = v === "" || !isFinite(Number(v)) ? null : Number(v);
			} else if (f === "wbsIds" || f === "riskIds") it[f] = Array.from(el.selectedOptions).map((o) => o.value);
			else if (f === "full") it.full = el.checked;
			else if (f === "value" || f === "leadDays" || f === "selectionDays") {
				const v = el.value;
				it[f] = v === "" || !isFinite(Number(v)) ? null : Number(v);
			} else if (f) it[f] = el.value;
			else return;
			if (f === "decision") render();
			else refreshMeta();
			save();
		};
		items.addEventListener("input", (e) => {
			const t = e.target;
			if (t.tagName !== "SELECT" && t.type !== "checkbox") upd(t);
		});
		items.addEventListener("change", (e) => upd(e.target));
		items.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
			data.items = data.items.filter((x) => x.id !== b.dataset.del);
			render();
			save();
			setStatus("Adquisición eliminada.");
		}));
		items.querySelectorAll("[data-addcrit]").forEach((b) => b.addEventListener("click", () => {
			const it = byId(b.closest("details.pr").dataset.id || null);
			if (!it) return;
			it.criteria.push({
				name: "",
				weight: null
			});
			render();
			save();
		}));
		items.querySelectorAll("[data-delcrit]").forEach((b) => b.addEventListener("click", () => {
			const it = byId(b.closest("details.pr").dataset.id || null);
			if (!it) return;
			it.criteria.splice(Number(b.dataset.delcrit), 1);
			render();
			save();
		}));
		document.querySelectorAll("[data-p]").forEach((t) => t.addEventListener("input", () => {
			data[t.dataset.p] = t.value;
			refreshMeta();
			save();
		}));
	}
	function addItem() {
		const id = newId(), it = normalizeItem({
			id,
			code: nextCode(data.items),
			decision: "Comprar",
			status: "Planificada"
		}, id);
		data.items.push(it);
		openSet.add(id);
		render();
		save();
		setStatus(it.code + " creada: completa qué cubre, el contrato y las fechas.");
		const el = document.querySelector(`details.pr[data-id="${id}"] [data-f="name"]`);
		if (el) el.focus();
	}
	function exportCsv() {
		const f = getCtx().facts, leaf = (id) => {
			const l = f.leaves.find((x) => x.id === id);
			return l ? l.code : "";
		}, q = (v) => "\"" + v.replace(/"/g, "\"\"") + "\"";
		const lines = [[
			"Código",
			"Adquisición",
			"Paquetes EDT",
			"Decisión",
			"Contrato",
			"Selección",
			"Valor",
			"Fecha requerida",
			"Plazo proveedor (d)",
			"Selección (d)",
			"Convocar antes del",
			"Proveedor",
			"Estado",
			"Responsable"
		].map(q).join(",")];
		data.items.forEach((it) => lines.push([
			it.code,
			it.name,
			it.wbsIds.map(leaf).join("; "),
			it.decision,
			it.contractType,
			it.selection,
			it.value === null ? "" : String(it.value),
			it.needDate,
			it.leadDays === null ? "" : String(it.leadDays),
			it.selectionDays === null ? "" : String(it.selectionDays),
			launchBy(it) || "",
			it.supplier,
			it.status,
			it.owner
		].map(q).join(",")));
		const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "plan_de_adquisiciones.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Plan exportado como CSV.");
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
		if (!C.connected) return buildSampleProcurement();
		const leaf = new Map(C.facts.leaves.map((l) => [l.code, l.id])), risk = new Map(C.facts.risks.map((r) => [r.code, r.id]));
		return buildSampleProcurement((c) => leaf.get(c) || "", (c) => risk.get(c) || "");
	}
	function wireToolbar() {
		$("btnAdd").addEventListener("click", addItem);
		$("btnCsv").addEventListener("click", exportCsv);
		$("asOf").addEventListener("change", (e) => {
			const v = e.target.value;
			if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
				data.asOf = v;
				refreshMeta();
				save();
			}
		});
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el plan actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				ctxDirty = true;
				openSet.clear();
				data = sampleForProject();
				render();
				save();
				const sin = getCtx().connected ? data.items.filter((it) => !it.wbsIds.length).length : 0;
				setStatus("Caso de ejemplo cargado." + (sin ? " " + sin + " adquisición(es) no encontraron sus paquetes en la EDT del proyecto: carga el ejemplo en WBS Builder (o elige tus paquetes) para enlazarlas." : ""));
			});
		});
		$("btnClear").addEventListener("click", () => {
			showConfirm("Esto borrará la estrategia y todas las adquisiciones. ¿Continuar?", "Nuevo plan").then((ok) => {
				if (ok) {
					openSet.clear();
					data = blankProcurement(todayISO());
					render();
					save();
					setStatus("Plan nuevo iniciado.");
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el plan de adquisiciones aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			strategy: data.strategy,
			performance: data.performance,
			approvals: data.approvals,
			asOf: data.asOf,
			items: data.items,
			idCounter: data.idCounter
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("procurement");
			ctxDirty = true;
			const mod = p.modules && p.modules.procurement;
			if (mod && typeof mod === "object") {
				data = normalizeProcurement(mod, todayISO());
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = blankProcurement(todayISO());
				render();
				setStatus("Proyecto sin plan de adquisiciones todavía. Agrega la primera adquisición, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "procurement", "El plan de adquisiciones", payload(), null, session, {
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
			accent: "#6d1fa6",
			hover: "#8f2fd0"
		});
	}
	wireToolbar();
	if (!(window.GPI && window.GPI.available() && window.GPI.active())) {
		data = buildSampleProcurement();
		ctxDirty = true;
		render();
	} else render();
	//#endregion
})();
