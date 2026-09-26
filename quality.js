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
	//#region src/shared/quality-plan.ts
	var CHECK_KINDS = ["Aseguramiento", "Control"];
	var QUALITY_METHODS = [
		"Revisión de documentos",
		"Inspección visual",
		"Medición",
		"Ensayo de laboratorio",
		"Prueba funcional",
		"Auditoría"
	];
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
	var COQ_GROUP = {
		prevencion: "conformidad",
		evaluacion: "conformidad",
		falla_interna: "no_conformidad",
		falla_externa: "no_conformidad"
	};
	var INSPECTION_RESULTS = [
		"conforme",
		"observada",
		"no_conforme"
	];
	var RESULT_LABEL = {
		conforme: "Conforme",
		observada: "Con observaciones",
		no_conforme: "No conforme"
	};
	var NCR_SEVERITIES = [
		"menor",
		"mayor",
		"critica"
	];
	var SEVERITY_LABEL = {
		menor: "Menor",
		mayor: "Mayor",
		critica: "Crítica"
	};
	var NCR_STATUSES = [
		"abierta",
		"en_correccion",
		"cerrada"
	];
	var NCR_STATUS_LABEL = {
		abierta: "Abierta",
		en_correccion: "En corrección",
		cerrada: "Cerrada"
	};
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var strs = (v) => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec$1 = (o) => o && typeof o === "object" ? o : {};
	function normalizeMetric(o, fb) {
		const x = rec$1(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			name: str(x.name),
			wbsIds: strs(x.wbsIds),
			definition: str(x.definition),
			target: str(x.target),
			tolerance: str(x.tolerance),
			method: str(x.method),
			frequency: str(x.frequency),
			owner: str(x.owner)
		};
	}
	function normalizeCheck(o, fb) {
		const x = rec$1(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			wbsId: str(x.wbsId),
			what: str(x.what),
			criterion: str(x.criterion),
			kind: str(x.kind),
			method: str(x.method),
			frequency: str(x.frequency),
			owner: str(x.owner),
			record: str(x.record),
			metricId: str(x.metricId)
		};
	}
	function normalizeCoq(o, fb) {
		const x = rec$1(o);
		return {
			id: str(x.id) || fb,
			cat: COQ_CATS.indexOf(x.cat) >= 0 ? x.cat : "prevencion",
			description: str(x.description),
			amount: numOrNull(x.amount)
		};
	}
	function normalizeInspection(o, fb) {
		const x = rec$1(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			checkId: str(x.checkId),
			date: str(x.date),
			result: INSPECTION_RESULTS.indexOf(x.result) >= 0 ? x.result : "conforme",
			inspector: str(x.inspector),
			notes: str(x.notes),
			ncrId: str(x.ncrId)
		};
	}
	function normalizeNcr(o, fb) {
		const x = rec$1(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			wbsId: str(x.wbsId),
			description: str(x.description),
			severity: NCR_SEVERITIES.indexOf(x.severity) >= 0 ? x.severity : "menor",
			detectedOn: str(x.detectedOn),
			status: NCR_STATUSES.indexOf(x.status) >= 0 ? x.status : "abierta",
			action: str(x.action),
			owner: str(x.owner),
			dueDate: str(x.dueDate),
			closedOn: str(x.closedOn)
		};
	}
	function normalizeQuality(raw) {
		const x = rec$1(raw), metrics = (Array.isArray(x.metrics) ? x.metrics : []).map((o, i) => normalizeMetric(o, "qm" + (i + 1))), checks = (Array.isArray(x.checks) ? x.checks : []).map((o, i) => normalizeCheck(o, "qc" + (i + 1)));
		const coq = (Array.isArray(x.coq) ? x.coq : []).map((o, i) => normalizeCoq(o, "cq" + (i + 1)));
		const inspections = (Array.isArray(x.inspections) ? x.inspections : []).map((o, i) => normalizeInspection(o, "in" + (i + 1))), ncrs = (Array.isArray(x.ncrs) ? x.ncrs : []).map((o, i) => normalizeNcr(o, "nc" + (i + 1)));
		return {
			policy: str(x.policy),
			standards: str(x.standards),
			metrics,
			checks,
			coq,
			idCounter: Number(x.idCounter) || metrics.length + checks.length + coq.length + inspections.length + ncrs.length + 1,
			inspections,
			ncrs,
			asOf: /^\d{4}-\d{2}-\d{2}$/.test(str(x.asOf)) ? str(x.asOf) : ""
		};
	}
	var blankQuality = () => normalizeQuality(null);
	function nextOf(items, prefix) {
		let max = 0;
		items.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return prefix + String(max + 1).padStart(2, "0");
	}
	var nextMetricCode = (m) => nextOf(m, "QM-");
	var nextCheckCode = (c) => nextOf(c, "QC-");
	var nextInspectionCode = (c) => nextOf(c, "IN-");
	var nextNcrCode = (c) => nextOf(c, "NC-");
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
	var isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	var asOfOf = (d, today) => isoOk(d.asOf) ? d.asOf : today;
	function executionSummary(d, today0) {
		const today = asOfOf(d, today0), open = d.ncrs.filter((n) => n.status !== "cerrada");
		return {
			inspections: d.inspections.length,
			nonConforming: d.inspections.filter((i) => i.result === "no_conforme").length,
			ncrs: d.ncrs.length,
			ncrOpen: open.length,
			ncrOverdue: isoOk(today) ? open.filter((n) => isoOk(n.dueDate) && n.dueDate < today).length : 0,
			ncrCritical: open.filter((n) => n.severity === "critica").length
		};
	}
	function qualityFindings(d, f, today0 = "") {
		const today = asOfOf(d, today0), out = [], F = (code, severity, text) => {
			out.push({
				code,
				severity,
				text
			});
		};
		const leafBy = new Map(f.leaves.map((l) => [l.id, l])), roles = new Set(f.roles.map((r) => r.toLowerCase()));
		if (!(d.checks.length || d.metrics.length || d.coq.length || d.inspections.length || d.ncrs.length)) return out;
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
		const checkBy = new Map(d.checks.map((c) => [c.id, c])), ncrBy = new Map(d.ncrs.map((n) => [n.id, n]));
		d.inspections.forEach((i) => {
			const w = i.code + (checkBy.has(i.checkId) ? " (" + checkBy.get(i.checkId).code + ")" : "");
			if (!checkBy.has(i.checkId)) F("Q15", "aviso", w + ": no corresponde a ningún control del plan" + (i.checkId ? " (el control ya no existe)" : "") + ": una inspección sin control planificado no tiene criterio de aceptación contra el cual juzgarla.");
			if (i.result === "no_conforme" && !(i.ncrId && ncrBy.has(i.ncrId))) F("Q13", "aviso", w + ": resultado NO CONFORME sin una no conformidad registrada: el defecto se detectó pero nadie está obligado a corregirlo.");
			if (!isoOk(i.date)) F("Q15", "info", w + ": sin fecha de inspección.");
		});
		d.ncrs.forEach((n) => {
			const w = n.code + (n.description.trim() ? " «" + n.description.trim().slice(0, 60) + (n.description.trim().length > 60 ? "…" : "") + "»" : ""), open = n.status !== "cerrada";
			if (open && n.severity === "critica") F("Q12", "riesgo", w + ": no conformidad CRÍTICA sin cerrar: puede comprometer la aceptación del entregable (y la seguridad o el cumplimiento normativo).");
			if (open && isoOk(today) && isoOk(n.dueDate) && n.dueDate < today) F("Q12", n.severity === "menor" ? "info" : "aviso", w + ": la corrección vencía el " + n.dueDate + " y sigue " + NCR_STATUS_LABEL[n.status].toLowerCase() + ".");
			if (open && (!n.action.trim() || !n.owner.trim() || !isoOk(n.dueDate))) F("Q14", "aviso", w + ": abierta sin acción correctiva, responsable o fecha límite: nadie sabe qué hacer ni para cuándo.");
			if (!open && (!n.action.trim() || !isoOk(n.closedOn))) F("Q14", "info", w + ": cerrada sin registrar la acción correctiva o la fecha de cierre (no queda evidencia de cómo se resolvió).");
			if (!n.wbsId || !leafBy.has(n.wbsId)) F("Q15", "info", w + ": no apunta a un paquete de trabajo de la EDT.");
		});
		return out;
	}
	function qualityState(d, f, today = "") {
		if (!(d.checks.length || d.metrics.length || d.coq.length || d.inspections.length || d.ncrs.length)) return "vacio";
		const fs = qualityFindings(d, f, today);
		return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
	}
	//#endregion
	//#region src/shared/plan-facts.ts
	var rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
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
		const wbs = G.util.effectiveWbs(), nodes = rec(wbs && wbs.nodes);
		return {
			leaves: G.util.wbsLeaves(wbs).map((l) => {
				const n = rec(nodes[l.id]);
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
	//#endregion
	//#region src/shared/local-date.ts
	function todayLocalISO(d = /* @__PURE__ */ new Date()) {
		const p = (n) => (n < 10 ? "0" : "") + n;
		return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
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
	//#region src/shared/quality-sample.ts
	var sampleQualityFacts = () => {
		const risks = buildSampleRisks((code) => "w-" + code), high = /* @__PURE__ */ new Set();
		risks.filter(isOpen).filter((r) => levelOf(inherentScore(r), SAMPLE_PLAN) === "alto").forEach((r) => r.wbsIds.forEach((w) => high.add(w)));
		return {
			leaves: SAMPLE_CASE_LEAVES.map((l) => ({
				id: "w-" + l.code,
				code: l.code,
				name: l.name,
				acceptance: SAMPLE_WBS_DICTIONARY[l.code].acceptance,
				loe: !!SAMPLE_WBS_DICTIONARY[l.code].loe,
				cost: l.cost
			})),
			roles: SAMPLE_OBS_ROLES.slice(),
			highRiskLeafIds: Array.from(high),
			baseCost: SAMPLE_CASE_BASE_COST
		};
	};
	var METRICS = [
		[
			"QM-01",
			"Resistencia a compresión del concreto",
			["4.2", "4.3"],
			"Resistencia de probetas cilíndricas a 28 días respecto de la resistencia de diseño f'c",
			"Promedio de tres ensayos consecutivos ≥ f'c",
			"Ningún ensayo individual menor que f'c − 35 kg/cm²",
			"Ensayo de laboratorio",
			"Por vaciado",
			"Control de Calidad"
		],
		[
			"QM-02",
			"Compactación de la plataforma",
			["4.1"],
			"Densidad de campo respecto de la máxima densidad seca del ensayo Proctor",
			"≥ 95 % de la máxima densidad seca",
			"Sin resultados por debajo del 92 %",
			"Ensayo de laboratorio",
			"Por capa compactada",
			"Control de Calidad"
		],
		[
			"QM-03",
			"Verticalidad del montaje metálico",
			["4.3"],
			"Desviación de plomada de las columnas montadas",
			"Desviación ≤ 1/500 de la altura",
			"Ninguna columna fuera de 1/300",
			"Medición",
			"Por eje de columnas",
			"Control de Calidad"
		],
		[
			"QM-04",
			"Conformidad de las piezas recibidas",
			["3.1"],
			"Piezas recibidas conformes a planos y con certificado de calidad del fabricante",
			"100 % de las piezas conformes",
			"Sin tolerancia: la pieza no conforme se rechaza",
			"Inspección visual",
			"Por entrega",
			"Control de Calidad"
		],
		[
			"QM-05",
			"Protocolos de prueba aprobados",
			["4.5", "5.1"],
			"Circuitos, tableros y redes con su protocolo de prueba firmado",
			"100 % con protocolo aprobado",
			"Sin tolerancia",
			"Prueba funcional",
			"Por sistema",
			"Control de Calidad"
		]
	];
	var CHECKS = [
		[
			"QC-01",
			"1.1",
			"Revisión y firma del Acta de constitución",
			"Aseguramiento",
			"Revisión de documentos",
			"Por entregable",
			"Director de Proyecto",
			"Acta firmada",
			""
		],
		[
			"QC-02",
			"1.2",
			"Revisión del plan para la dirección y de las líneas base antes de iniciar la construcción",
			"Aseguramiento",
			"Revisión de documentos",
			"Por entregable",
			"Comité Directivo / Sponsor",
			"Acta de aprobación del plan",
			""
		],
		[
			"QC-03",
			"2.1",
			"Revisión del informe geotécnico por un especialista colegiado",
			"Aseguramiento",
			"Revisión de documentos",
			"Por entregable",
			"Jefe de Ingeniería",
			"Informe firmado y acta de revisión",
			""
		],
		[
			"QC-04",
			"2.2",
			"Revisión independiente del expediente estructural",
			"Aseguramiento",
			"Revisión de documentos",
			"Por entrega de planos",
			"Jefe de Ingeniería",
			"Acta de revisión y planos aptos para construcción",
			""
		],
		[
			"QC-05",
			"2.3",
			"Revisión de la memoria de cálculo eléctrica y sanitaria",
			"Aseguramiento",
			"Revisión de documentos",
			"Por entregable",
			"Jefe de Ingeniería",
			"Acta de revisión",
			""
		],
		[
			"QC-06",
			"2.4",
			"Verificación de la licencia de edificación y del certificado ITSE",
			"Control",
			"Revisión de documentos",
			"Por entregable",
			"Asesoría Legal",
			"Licencia y certificado archivados",
			""
		],
		[
			"QC-07",
			"3.1",
			"Inspección en fábrica y recepción en obra de las estructuras metálicas",
			"Control",
			"Inspección visual",
			"Por entrega",
			"Control de Calidad",
			"Acta de recepción con certificados del fabricante",
			"qm4"
		],
		[
			"QC-08",
			"3.2",
			"Recepción de materiales: guías, certificados y cantidades",
			"Control",
			"Inspección visual",
			"Por entrega",
			"Control de Calidad",
			"Guías de remisión y certificados",
			""
		],
		[
			"QC-09",
			"3.3",
			"Verificación del protocolo de fábrica de los equipos",
			"Control",
			"Revisión de documentos",
			"Por entrega",
			"Control de Calidad",
			"Protocolo de fábrica archivado",
			""
		],
		[
			"QC-10",
			"4.1",
			"Ensayo de densidad de campo de la plataforma",
			"Control",
			"Ensayo de laboratorio",
			"Por capa compactada",
			"Control de Calidad",
			"Informe de ensayo de densidad",
			"qm2"
		],
		[
			"QC-11",
			"4.2",
			"Ensayo de resistencia del concreto de las zapatas",
			"Control",
			"Ensayo de laboratorio",
			"Por vaciado",
			"Control de Calidad",
			"Informe de ensayo de probetas",
			"qm1"
		],
		[
			"QC-12",
			"4.3",
			"Verificación de verticalidad y de altura libre del montaje",
			"Control",
			"Medición",
			"Por eje de columnas",
			"Control de Calidad",
			"Registro topográfico de montaje",
			"qm3"
		],
		[
			"QC-13",
			"4.4",
			"Inspección de pisos, señalización y anchos de pasillo contra el layout",
			"Control",
			"Inspección visual",
			"Por zona terminada",
			"Control de Calidad",
			"Acta de inspección con fotografías",
			""
		],
		[
			"QC-14",
			"4.5",
			"Inspección de la instalación de tableros, circuitos y redes",
			"Control",
			"Inspección visual",
			"Por sistema",
			"Control de Calidad",
			"Registro de inspección",
			"qm5"
		],
		[
			"QC-15",
			"5.1",
			"Pruebas funcionales de circuitos e hidráulicas de las redes",
			"Control",
			"Prueba funcional",
			"Por sistema",
			"Control de Calidad",
			"Protocolos de prueba firmados por QA/QC",
			"qm5"
		],
		[
			"QC-16",
			"5.2",
			"Verificación del registro de asistencia y de la entrega de manuales",
			"Control",
			"Revisión de documentos",
			"Por sesión",
			"Director de Proyecto",
			"Registro de asistencia y cargo de manuales",
			""
		],
		[
			"QC-17",
			"5.3",
			"Auditoría del dossier de calidad antes de la entrega",
			"Aseguramiento",
			"Auditoría",
			"Por entregable",
			"Control de Calidad",
			"Informe de auditoría del dossier",
			""
		]
	];
	var COQ = [
		[
			"prevencion",
			"Revisiones de diseño y planificación de la calidad",
			6e4
		],
		[
			"prevencion",
			"Inducción y capacitación en procedimientos constructivos",
			3e4
		],
		[
			"evaluacion",
			"Ensayos de laboratorio (concreto, suelos y densidad de campo)",
			95e3
		],
		[
			"evaluacion",
			"Inspecciones y pruebas de recepción",
			55e3
		],
		[
			"falla_interna",
			"Retrabajo previsto por observaciones de inspección",
			7e4
		],
		[
			"falla_externa",
			"Reserva para garantías y reparaciones después de la entrega",
			4e4
		]
	];
	var INSPECTIONS = [
		[
			"IN-01",
			"QC-01",
			"2026-07-09",
			"conforme",
			"Director de Proyecto",
			"Acta firmada por el Sponsor.",
			""
		],
		[
			"IN-02",
			"QC-02",
			"2026-08-05",
			"conforme",
			"Comité Directivo / Sponsor",
			"Plan y líneas base aprobados.",
			""
		],
		[
			"IN-03",
			"QC-03",
			"2026-08-31",
			"conforme",
			"Jefe de Ingeniería",
			"Informe geotécnico firmado por especialista colegiado.",
			""
		],
		[
			"IN-04",
			"QC-04",
			"2026-09-30",
			"observada",
			"Jefe de Ingeniería",
			"Observaciones de detalle en los cuadros de columnas: se corrigen y reemiten.",
			"nc2"
		],
		[
			"IN-05",
			"QC-05",
			"2026-09-29",
			"conforme",
			"Jefe de Ingeniería",
			"Memoria eléctrica y sanitaria sin observaciones.",
			""
		],
		[
			"IN-06",
			"QC-09",
			"2026-10-13",
			"conforme",
			"Control de Calidad",
			"Protocolos de fábrica de tableros y equipos archivados.",
			""
		],
		[
			"IN-07",
			"QC-07",
			"2026-10-20",
			"no_conforme",
			"Control de Calidad",
			"Lote 2: tres piezas con soldadura fuera de tolerancia y certificado de calidad incompleto.",
			"nc1"
		],
		[
			"IN-08",
			"QC-08",
			"2026-11-02",
			"conforme",
			"Control de Calidad",
			"Guías, certificados y cantidades de materiales conformes.",
			""
		]
	];
	var NCRS = [[
		"NC-01",
		"3.1",
		"Lote 2 de estructuras: tres piezas con soldadura fuera de tolerancia y certificado de calidad incompleto",
		"mayor",
		"2026-10-20",
		"en_correccion",
		"Reproceso de soldadura en fábrica, nueva inspección de Control de Calidad y entrega del certificado del lote 2",
		"Proveedor — Estructuras metálicas",
		"2026-11-20",
		""
	], [
		"NC-02",
		"2.2",
		"Observaciones de detalle en los cuadros de columnas de los planos estructurales",
		"menor",
		"2026-09-30",
		"cerrada",
		"Planos corregidos y reemitidos (revisión B) y revisados por el Jefe de Ingeniería",
		"Ingeniero Estructural",
		"2026-10-07",
		"2026-10-06"
	]];
	function buildSampleQuality() {
		const id = (code) => "w-" + code, metrics = METRICS.map(([code, name, wbs, definition, target, tolerance, method, frequency, owner], i) => normalizeMetric({
			id: "qm" + (i + 1),
			code,
			name,
			wbsIds: wbs.map(id),
			definition,
			target,
			tolerance,
			method,
			frequency,
			owner
		}, "qm" + (i + 1)));
		const checks = CHECKS.map(([code, wbs, what, kind, method, frequency, owner, record, metricId], i) => normalizeCheck({
			id: "qc" + (i + 1),
			code,
			wbsId: id(wbs),
			what,
			criterion: SAMPLE_WBS_DICTIONARY[wbs].acceptance,
			kind,
			method,
			frequency,
			owner,
			record,
			metricId
		}, "qc" + (i + 1)));
		const coq = COQ.map(([cat, description, amount], i) => normalizeCoq({
			id: "cq" + (i + 1),
			cat,
			description,
			amount
		}, "cq" + (i + 1)));
		const checkId = (code) => "qc" + (CHECKS.findIndex((c) => c[0] === code) + 1);
		const inspections = INSPECTIONS.map(([code, qc, date, result, inspector, notes, ncr], i) => normalizeInspection({
			id: "in" + (i + 1),
			code,
			checkId: checkId(qc),
			date,
			result,
			inspector,
			notes,
			ncrId: ncr
		}, "in" + (i + 1)));
		const ncrs = NCRS.map(([code, wbs, description, severity, detectedOn, status, action, owner, dueDate, closedOn], i) => normalizeNcr({
			id: "nc" + (i + 1),
			code,
			wbsId: id(wbs),
			description,
			severity,
			detectedOn,
			status,
			action,
			owner,
			dueDate,
			closedOn
		}, "nc" + (i + 1)));
		return {
			policy: "DISTRIB+ entrega un almacén que cumple los planos aprobados y las normas aplicables, verificado con ensayos y pruebas documentados: la calidad se planifica y se previene antes de inspeccionarse, y ninguna entrega se acepta sin su registro de conformidad.",
			standards: "Reglamento Nacional de Edificaciones (RNE): E.050 Suelos y Cimentaciones, E.060 Concreto Armado, E.090 Estructuras Metálicas; Código Nacional de Electricidad — Utilización; planos y especificaciones técnicas aprobados. (Ilustrativo: verificar contra la versión vigente.)",
			metrics,
			checks,
			coq,
			inspections,
			ncrs,
			asOf: "2026-11-03",
			idCounter: metrics.length + checks.length + coq.length + inspections.length + ncrs.length + 1
		};
	}
	//#endregion
	//#region src/modules/quality/main.ts
	var $ = (id) => document.getElementById(id);
	function setStatus(msg) {
		$("statusLeft").textContent = msg;
	}
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
				highRiskLeafIds: [],
				baseCost: null
			}, sym = "$";
			if (!connected) facts = sampleQualityFacts();
			else if (G && G.util) try {
				const m = G.meta();
				sym = CUR[m && m.currency || ""] || "$";
				facts = gatherQualityFacts(G);
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
	var data = blankQuality();
	var newId = (p) => p + data.idCounter++;
	var opts = (list, cur) => `<option value=""></option>` + list.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && list.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
	var leafOpts = (f, cur) => `<option value=""></option>` + f.leaves.map((l) => `<option value="${esc(l.id)}"${l.id === cur ? " selected" : ""}>${esc(l.code)} ${esc(l.name)}</option>`).join("") + (cur && !f.leaves.some((l) => l.id === cur) ? `<option value="${esc(cur)}" selected>(ya no existe)</option>` : "");
	var del = (k, id) => `<td><button class="btn sm danger" data-del="${k}:${esc(id)}" title="Eliminar" aria-label="Eliminar">✕</button></td>`;
	function metricRow(m, f) {
		return `<tr data-k="metric" data-id="${esc(m.id)}">
    <td style="width:70px"><input data-f="code" value="${esc(m.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><input data-f="name" value="${esc(m.name)}" aria-label="Métrica"><textarea data-f="definition" placeholder="Definición…" style="margin-top:3px">${esc(m.definition)}</textarea></td>
    <td style="min-width:170px"><select data-f="wbsIds" multiple aria-label="Paquetes">${f.leaves.map((l) => `<option value="${esc(l.id)}"${m.wbsIds.indexOf(l.id) >= 0 ? " selected" : ""}>${esc(l.code)} ${esc(l.name)}</option>`).join("")}</select></td>
    <td style="min-width:150px"><textarea data-f="target" aria-label="Objetivo">${esc(m.target)}</textarea></td>
    <td style="min-width:150px"><textarea data-f="tolerance" aria-label="Tolerancia">${esc(m.tolerance)}</textarea></td>
    <td style="width:150px"><select data-f="method" aria-label="Método">${opts(QUALITY_METHODS, m.method)}</select></td>
    <td style="min-width:110px"><input data-f="frequency" value="${esc(m.frequency)}" aria-label="Frecuencia"></td>
    <td style="min-width:130px"><input data-f="owner" list="rolesList" value="${esc(m.owner)}" aria-label="Responsable"></td>${del("metric", m.id)}</tr>`;
	}
	function checkRow(c, f, d, flagged) {
		return `<tr data-k="check" data-id="${esc(c.id)}"${flagged.has(c.code) ? " class=\"hasf\"" : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(c.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><select data-f="wbsId" aria-label="Paquete">${leafOpts(f, c.wbsId)}</select></td>
    <td style="min-width:170px"><textarea data-f="what" aria-label="Qué se verifica">${esc(c.what)}</textarea></td>
    <td style="min-width:170px"><textarea data-f="criterion" aria-label="Criterio">${esc(c.criterion)}</textarea><button class="btn sm" data-edt="${esc(c.id)}" style="margin-top:3px" title="Copiar el criterio de aceptación del Diccionario de la EDT">↧ Tomar de la EDT</button></td>
    <td style="width:120px"><select data-f="kind" aria-label="Tipo">${opts(CHECK_KINDS, c.kind)}</select></td>
    <td style="width:150px"><select data-f="method" aria-label="Método">${opts(QUALITY_METHODS, c.method)}</select></td>
    <td style="min-width:110px"><input data-f="frequency" value="${esc(c.frequency)}" aria-label="Frecuencia"></td>
    <td style="min-width:130px"><input data-f="owner" list="rolesList" value="${esc(c.owner)}" aria-label="Responsable"></td>
    <td style="min-width:150px"><input data-f="record" value="${esc(c.record)}" aria-label="Registro"></td>
    <td style="min-width:120px"><select data-f="metricId" aria-label="Métrica">${`<option value=""></option>` + d.metrics.map((m) => `<option value="${esc(m.id)}"${m.id === c.metricId ? " selected" : ""}>${esc(m.code)}</option>`).join("")}</select></td>${del("check", c.id)}</tr>`;
	}
	var enumOpts = (list, labels, cur) => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
	function inspRow(i, d) {
		return `<tr data-k="insp" data-id="${esc(i.id)}">
    <td style="width:70px"><input data-f="code" value="${esc(i.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><select data-f="checkId" aria-label="Control del plan">${`<option value=""></option>` + d.checks.map((c) => `<option value="${esc(c.id)}"${c.id === i.checkId ? " selected" : ""}>${esc(c.code)} ${esc(c.what.slice(0, 50))}</option>`).join("") + (i.checkId && !d.checks.some((c) => c.id === i.checkId) ? `<option value="${esc(i.checkId)}" selected>(ya no existe)</option>` : "")}</select></td>
    <td style="width:130px"><input data-f="date" type="date" value="${esc(i.date)}" aria-label="Fecha"></td>
    <td style="width:150px"><select data-f="result" aria-label="Resultado">${enumOpts(INSPECTION_RESULTS, RESULT_LABEL, i.result)}</select></td>
    <td style="min-width:130px"><input data-f="inspector" list="rolesList" value="${esc(i.inspector)}" aria-label="Inspector"></td>
    <td style="min-width:200px"><textarea data-f="notes" aria-label="Observaciones">${esc(i.notes)}</textarea></td>
    <td style="min-width:120px"><select data-f="ncrId" aria-label="No conformidad">${`<option value=""></option>` + d.ncrs.map((n) => `<option value="${esc(n.id)}"${n.id === i.ncrId ? " selected" : ""}>${esc(n.code)}</option>`).join("")}</select></td>${del("insp", i.id)}</tr>`;
	}
	function ncrRow(n, f) {
		return `<tr data-k="ncr" data-id="${esc(n.id)}">
    <td style="width:70px"><input data-f="code" value="${esc(n.code)}" aria-label="Código"></td>
    <td style="min-width:150px"><select data-f="wbsId" aria-label="Paquete">${leafOpts(f, n.wbsId)}</select></td>
    <td style="min-width:200px"><textarea data-f="description" aria-label="Descripción">${esc(n.description)}</textarea></td>
    <td style="width:110px"><select data-f="severity" aria-label="Gravedad">${enumOpts(NCR_SEVERITIES, SEVERITY_LABEL, n.severity)}</select></td>
    <td style="width:130px"><input data-f="detectedOn" type="date" value="${esc(n.detectedOn)}" aria-label="Detectada"></td>
    <td style="width:130px"><select data-f="status" aria-label="Estado">${enumOpts(NCR_STATUSES, NCR_STATUS_LABEL, n.status)}</select></td>
    <td style="min-width:200px"><textarea data-f="action" aria-label="Acción correctiva">${esc(n.action)}</textarea></td>
    <td style="min-width:130px"><input data-f="owner" list="rolesList" value="${esc(n.owner)}" aria-label="Responsable"></td>
    <td style="width:130px"><input data-f="dueDate" type="date" value="${esc(n.dueDate)}" aria-label="Fecha límite"></td>
    <td style="width:130px"><input data-f="closedOn" type="date" value="${esc(n.closedOn)}" aria-label="Cerrada el"></td>${del("ncr", n.id)}</tr>`;
	}
	function render() {
		const f = getCtx().facts, root = $("mainArea"), fs = qualityFindings(data, f, todayLocalISO());
		const flagged = /* @__PURE__ */ new Set();
		fs.forEach((x) => {
			const m = /^(QC-\d+)/.exec(x.text);
			if (m) flagged.add(m[1]);
		});
		root.innerHTML = `
    <div class="view-head"><h2>Plan de calidad</h2>
      <p>La calidad se <b>planifica</b> (métricas y normas), se <b>asegura</b> (prevenir: revisiones y auditorías del proceso) y se <b>controla</b> (detectar: inspecciones, ensayos y pruebas), y cuesta: prevenir y evaluar es más barato que corregir. El criterio de aceptación de cada paquete viene del Diccionario de la EDT; abajo se comprueba que todos tengan cómo verificarse.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="grid2">
      <div class="card fd"><h3>Política de calidad</h3><label for="policy">Compromiso de calidad del proyecto</label><textarea id="policy" data-p="policy">${esc(data.policy)}</textarea></div>
      <div class="card fd"><h3>Normas y especificaciones</h3><label for="standards">Qué define la conformidad (normas, planos, especificaciones)</label><textarea id="standards" data-p="standards">${esc(data.standards)}</textarea></div>
    </div>
    <div class="card"><h3>Métricas de calidad (${data.metrics.length})</h3><p class="hint">Qué se mide, con qué objetivo y tolerancia, y cómo.</p>
      ${data.metrics.length ? `<table class="an" id="tblMetrics"><thead><tr><th>Cód.</th><th>Métrica y definición</th><th>Paquetes</th><th>Objetivo</th><th>Tolerancia</th><th>Método</th><th>Frecuencia</th><th>Responsable</th><th></th></tr></thead><tbody>${data.metrics.map((m) => metricRow(m, f)).join("")}</tbody></table>` : `<div class="empty-hint">Sin métricas. Agrega la primera con <b>＋ Métrica</b>.</div>`}</div>
    <div class="card"><h3>Aseguramiento y control por paquete (${data.checks.length})</h3><p class="hint">Cada paquete con criterio de aceptación necesita al menos una actividad que lo verifique; «Aseguramiento» previene, «Control» detecta.</p>
      ${data.checks.length ? `<table class="an" id="tblChecks"><thead><tr><th>Cód.</th><th>Paquete</th><th>Qué se verifica</th><th>Criterio de aceptación</th><th>Tipo</th><th>Método</th><th>Frecuencia</th><th>Responsable</th><th>Registro</th><th>Métrica</th><th></th></tr></thead><tbody>${data.checks.map((c) => checkRow(c, f, data, flagged)).join("")}</tbody></table>` : `<div class="empty-hint">Sin actividades de control ni aseguramiento. Agrega la primera con <b>＋ Control / aseguramiento</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist></div>
    <div class="card"><h3>Ejecución: inspecciones (${data.inspections.length})</h3><div class="fd" style="max-width:260px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" data-p="asOf" value="${esc(data.asOf)}"></div><p class="hint">Lo que realmente se inspeccionó, ensayó o probó: qué control del plan, cuándo y con qué resultado. Un resultado «No conforme» exige registrar su no conformidad.</p>
      ${data.inspections.length ? `<table class="an" id="tblInsp"><thead><tr><th>Cód.</th><th>Control del plan</th><th>Fecha</th><th>Resultado</th><th>Inspector</th><th>Observaciones</th><th>No conformidad</th><th></th></tr></thead><tbody>${data.inspections.map((i) => inspRow(i, data)).join("")}</tbody></table>` : `<div class="empty-hint">Sin inspecciones. Cuando empiece la ejecución, registra la primera con <b>＋ Inspección</b>.</div>`}</div>
    <div class="card"><h3>Ejecución: no conformidades (${data.ncrs.length})</h3><p class="hint">Cada defecto detectado con su gravedad, la acción correctiva, quién la hace y para cuándo. Una crítica sin cerrar es un riesgo para la aceptación; una abierta sin acción o vencida se avisa.</p>
      ${data.ncrs.length ? `<table class="an" id="tblNcr"><thead><tr><th>Cód.</th><th>Paquete</th><th>Descripción</th><th>Gravedad</th><th>Detectada</th><th>Estado</th><th>Acción correctiva</th><th>Responsable</th><th>Fecha límite</th><th>Cerrada</th><th></th></tr></thead><tbody>${data.ncrs.map((n) => ncrRow(n, f)).join("")}</tbody></table>` : `<div class="empty-hint">Sin no conformidades registradas.</div>`}</div>
    <div class="card"><h3>Costo de la calidad</h3><p class="hint">Conformidad: prevención + evaluación. No conformidad: fallas internas (antes de la entrega) + externas (después).</p>
      ${data.coq.length ? `<table class="an" id="tblCoq"><thead><tr><th>Categoría</th><th>Descripción</th><th>Monto</th><th></th></tr></thead><tbody>${data.coq.map((c) => `<tr data-k="coq" data-id="${esc(c.id)}"><td style="width:170px"><select data-f="cat" aria-label="Categoría">${COQ_CATS.map((k) => `<option value="${k}"${k === c.cat ? " selected" : ""}>${COQ_LABEL[k]}</option>`).join("")}</select></td><td><input data-f="description" value="${esc(c.description)}" aria-label="Descripción"></td><td style="width:140px"><input data-f="amount" type="number" min="0" step="any" value="${c.amount === null ? "" : c.amount}" aria-label="Monto"></td>${del("coq", c.id)}</tr>`).join("")}</tbody></table>` : `<div class="empty-hint">Sin partidas. Agrega la primera con <b>＋ Partida de costo</b>.</div>`}
      <div class="bars" id="coqBars"></div></div>
    <div class="card"><h3>Cobertura por paquete</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos del plan</h3><div id="finds"></div></div>`;
		refreshMeta();
		wireMain();
	}
	function refreshMeta() {
		const f = getCtx().facts, cov = coverage(data, f), today = todayLocalISO(), fs = qualityFindings(data, f, today), st = qualityState(data, f, today), s = coqSummary(data.coq, f.baseCost), ex = executionSummary(data, today);
		const needing = cov.filter((r) => r.needs), ok = needing.filter((r) => r.checks.length).length;
		$("kpis").innerHTML = `<div class="kpi"><b>${ok}/${needing.length}</b><span>Paquetes con criterio de aceptación verificados</span></div>
    <div class="kpi"><b>${data.metrics.length}</b><span>Métricas</span></div>
    <div class="kpi"><b>${data.checks.filter((c) => c.kind === "Aseguramiento").length} / ${data.checks.filter((c) => c.kind === "Control").length}</b><span>Aseguramiento / control</span></div>
    <div class="kpi"><b>${ex.inspections} / ${ex.ncrOpen}</b><span>Inspecciones / no conformidades abiertas${ex.ncrOverdue ? " · " + ex.ncrOverdue + " vencida(s)" : ""}${ex.ncrCritical ? " · " + ex.ncrCritical + " crítica(s)" : ""}</span></div>
    <div class="kpi"><b>${money(s.total)}</b><span>Costo de la calidad${s.pctOfBase !== null ? " · " + s.pctOfBase.toFixed(1) + " % del costo base" : ""}</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado del plan</span></div>`;
		const bars = document.getElementById("coqBars");
		if (bars) bars.innerHTML = s.total > 0 ? COQ_CATS.map((k) => `<div class="bar${COQ_GROUP[k] === "no_conformidad" ? " nc" : ""}"><span>${COQ_LABEL[k]}</span><span><i style="width:${Math.max(1, Math.round(s.byCat[k] / s.total * 100))}%"></i></span><span class="mono">${money(s.byCat[k])} · ${Math.round(s.byCat[k] / s.total * 100)} %</span></div>`).join("") + `<p class="small muted">Conformidad ${money(s.conformity)} (${Math.round(100 - (s.failureShare || 0))} %) · no conformidad ${money(s.nonConformity)} (${Math.round(s.failureShare || 0)} %)</p>` : "";
		$("cover").innerHTML = f.leaves.length ? `<table class="an"><thead><tr><th>Paquete</th><th>Criterio de aceptación (Diccionario de la EDT)</th><th>Controles</th><th>Estado</th></tr></thead><tbody>${cov.map((r) => `<tr><td>${esc(r.leaf.code)} ${esc(r.leaf.name)}${r.highRisk ? " <span class=\"pill st-rojo\" title=\"Riesgo alto abierto\">riesgo alto</span>" : ""}</td><td class="small">${r.leaf.acceptance.trim() ? esc(r.leaf.acceptance) : "<span class=\"muted\">sin criterio en el diccionario</span>"}</td><td>${r.checks.length ? r.checks.map((c) => esc(c.code)).join(", ") : "—"}</td><td>${!r.needs ? `<span class="pill st-vacio">${r.leaf.loe ? "esfuerzo continuo" : "sin criterio"}</span>` : r.checks.length ? "<span class=\"pill st-verde\">verificado</span>" : `<span class="pill ${r.highRisk ? "st-rojo" : "st-ambar"}">sin verificación</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No hay paquetes de trabajo: arma la EDT en WBS Builder para revisar la cobertura.</p>`;
		const icon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		$("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.checks.length || data.metrics.length || data.coq.length ? "Sin hallazgos." : "Sin nada que revisar todavía."}</p>`;
	}
	function wireMain() {
		const upd = (el) => {
			const tr = el.closest("tr"), f = el.getAttribute("data-f");
			if (!tr || !f) return;
			const k = tr.getAttribute("data-k"), id = tr.getAttribute("data-id");
			const item = (k === "metric" ? data.metrics : k === "check" ? data.checks : k === "insp" ? data.inspections : k === "ncr" ? data.ncrs : data.coq).find((x) => x.id === id);
			if (!item) return;
			if (f === "wbsIds") item.wbsIds = Array.from(el.selectedOptions).map((o) => o.value);
			else if (f === "amount") {
				const v = el.value;
				item.amount = v === "" || !isFinite(Number(v)) ? null : Number(v);
			} else item[f] = el.value;
			refreshMeta();
			save();
		};
		[
			"tblMetrics",
			"tblChecks",
			"tblCoq",
			"tblInsp",
			"tblNcr"
		].forEach((tid) => {
			const t = document.getElementById(tid);
			if (!t) return;
			t.addEventListener("input", (e) => {
				const x = e.target;
				if (x.tagName !== "SELECT") upd(x);
			});
			t.addEventListener("change", (e) => upd(e.target));
		});
		document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
			const [k, id] = b.dataset.del.split(":");
			if (k === "metric") {
				data.metrics = data.metrics.filter((m) => m.id !== id);
				data.checks.forEach((c) => {
					if (c.metricId === id) c.metricId = "";
				});
			} else if (k === "check") {
				data.checks = data.checks.filter((c) => c.id !== id);
				data.inspections.forEach((i) => {
					if (i.checkId === id) i.checkId = "";
				});
			} else if (k === "insp") data.inspections = data.inspections.filter((i) => i.id !== id);
			else if (k === "ncr") {
				data.ncrs = data.ncrs.filter((n) => n.id !== id);
				data.inspections.forEach((i) => {
					if (i.ncrId === id) i.ncrId = "";
				});
			} else data.coq = data.coq.filter((c) => c.id !== id);
			render();
			save();
			setStatus("Fila eliminada.");
		}));
		document.querySelectorAll("[data-edt]").forEach((b) => b.addEventListener("click", () => {
			const c = data.checks.find((x) => x.id === b.dataset.edt), leaf = c && getCtx().facts.leaves.find((l) => l.id === c.wbsId);
			if (!c || !leaf) {
				setStatus("Elige primero el paquete de trabajo.");
				return;
			}
			if (!leaf.acceptance.trim()) {
				setStatus("El paquete " + leaf.code + " no tiene criterio de aceptación en el Diccionario de la EDT.");
				return;
			}
			c.criterion = leaf.acceptance;
			render();
			save();
			setStatus("Criterio copiado del Diccionario de la EDT (" + leaf.code + ").");
		}));
		document.querySelectorAll("[data-p]").forEach((t) => t.addEventListener("input", () => {
			data[t.dataset.p] = t.value;
			refreshMeta();
			save();
		}));
	}
	function focusLast(sel) {
		const els = document.querySelectorAll(sel);
		if (els.length) els[els.length - 1].focus();
	}
	function addCheck() {
		const id = newId("qc");
		data.checks.push(normalizeCheck({
			id,
			code: nextCheckCode(data.checks)
		}, id));
		render();
		save();
		setStatus("Control agregado: elige el paquete y completa qué se verifica.");
		focusLast("#tblChecks select[data-f=wbsId]");
	}
	function addMetric() {
		const id = newId("qm");
		data.metrics.push(normalizeMetric({
			id,
			code: nextMetricCode(data.metrics)
		}, id));
		render();
		save();
		setStatus("Métrica agregada.");
		focusLast("#tblMetrics input[data-f=name]");
	}
	function addInsp() {
		const id = newId("in");
		data.inspections.push(normalizeInspection({
			id,
			code: nextInspectionCode(data.inspections),
			date: todayLocalISO()
		}, id));
		render();
		save();
		setStatus("Inspección agregada: elige el control del plan y el resultado.");
		focusLast("#tblInsp select[data-f=checkId]");
	}
	function addNcr() {
		const id = newId("nc");
		data.ncrs.push(normalizeNcr({
			id,
			code: nextNcrCode(data.ncrs),
			detectedOn: todayLocalISO()
		}, id));
		render();
		save();
		setStatus("No conformidad agregada: elige el paquete y describe el defecto.");
		focusLast("#tblNcr select[data-f=wbsId]");
	}
	function addCoq() {
		const id = newId("cq");
		data.coq.push(normalizeCoq({ id }, id));
		render();
		save();
		setStatus("Partida agregada.");
		focusLast("#tblCoq input[data-f=description]");
	}
	function exportCsv() {
		const f = getCtx().facts, leaf = (id) => {
			const l = f.leaves.find((x) => x.id === id);
			return l ? l.code + " " + l.name : "";
		}, q = (v) => "\"" + v.replace(/"/g, "\"\"") + "\"";
		const lines = [[
			"Código",
			"Paquete",
			"Qué se verifica",
			"Criterio de aceptación",
			"Tipo",
			"Método",
			"Frecuencia",
			"Responsable",
			"Registro",
			"Métrica"
		].map(q).join(",")];
		data.checks.forEach((c) => lines.push([
			c.code,
			leaf(c.wbsId),
			c.what,
			c.criterion,
			c.kind,
			c.method,
			c.frequency,
			c.owner,
			c.record,
			(data.metrics.find((m) => m.id === c.metricId) || { code: "" }).code
		].map(q).join(",")));
		const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "plan_de_control_de_calidad.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Plan de control exportado como CSV.");
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
	function remapSample(d) {
		const C = getCtx();
		if (!C.connected) return d;
		const byCode = new Map(C.facts.leaves.map((l) => [l.code, l.id])), re = (id) => {
			const c = id.replace(/^w-/, "");
			return byCode.get(c) || "";
		};
		d.checks.forEach((c) => {
			c.wbsId = re(c.wbsId);
		});
		d.metrics.forEach((m) => {
			m.wbsIds = m.wbsIds.map(re).filter(Boolean);
		});
		d.ncrs.forEach((n) => {
			n.wbsId = re(n.wbsId);
		});
		return d;
	}
	function wireToolbar() {
		$("btnAddCheck").addEventListener("click", addCheck);
		$("btnAddMetric").addEventListener("click", addMetric);
		$("btnAddCoq").addEventListener("click", addCoq);
		$("btnAddInsp").addEventListener("click", addInsp);
		$("btnAddNcr").addEventListener("click", addNcr);
		$("btnCsv").addEventListener("click", exportCsv);
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el plan actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				ctxDirty = true;
				data = remapSample(buildSampleQuality());
				render();
				save();
				const sin = getCtx().connected ? data.checks.filter((c) => !c.wbsId).length : 0;
				setStatus("Caso de ejemplo cargado." + (sin ? " " + sin + " control(es) del ejemplo no encontraron su paquete en la EDT del proyecto: carga el ejemplo en WBS Builder (o elige tus paquetes) para enlazarlos." : ""));
			});
		});
		$("btnClear").addEventListener("click", () => {
			showConfirm("Esto borrará las métricas, los controles, el costo de la calidad y la política. ¿Continuar?", "Nuevo plan").then((ok) => {
				if (ok) {
					data = blankQuality();
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el plan de calidad aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			policy: data.policy,
			standards: data.standards,
			metrics: data.metrics,
			checks: data.checks,
			coq: data.coq,
			idCounter: data.idCounter,
			inspections: data.inspections,
			ncrs: data.ncrs,
			asOf: data.asOf
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("quality");
			ctxDirty = true;
			const mod = p.modules && p.modules.quality;
			if (mod && typeof mod === "object") {
				data = normalizeQuality(mod);
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = blankQuality();
				render();
				setStatus("Proyecto sin plan de calidad todavía. Agrega el primer control, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "quality", "El plan de calidad", payload(), null, session, {
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
			accent: "#00937f",
			hover: "#00c2a8"
		});
	}
	wireToolbar();
	if (!(window.GPI && window.GPI.available() && window.GPI.active())) {
		data = buildSampleQuality();
		ctxDirty = true;
		render();
	} else render();
	//#endregion
})();
