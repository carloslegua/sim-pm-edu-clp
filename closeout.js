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
	//#region src/shared/procurement-plan.ts
	var STATUS_RANK = {
		Planificada: 0,
		Convocada: 1,
		Adjudicada: 2,
		Contratada: 3,
		Entregada: 4
	};
	var PAY_STATUSES = [
		"programado",
		"pagado",
		"retenido"
	];
	var CLAIM_STATUSES = [
		"abierto",
		"resuelto",
		"rechazado"
	];
	var str$5 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs$3 = (v) => Array.isArray(v) ? v.map(str$5).filter(Boolean) : [];
	var numOrNull$3 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec$5 = (o) => o && typeof o === "object" ? o : {};
	var iso$3 = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeItem$1(o, fb) {
		const x = rec$5(o), id = str$5(x.id) || fb;
		return {
			id,
			code: str$5(x.code) || id,
			name: str$5(x.name),
			wbsIds: strs$3(x.wbsIds),
			full: x.full === false ? false : true,
			decision: str$5(x.decision),
			contractType: str$5(x.contractType),
			selection: str$5(x.selection),
			criteria: (Array.isArray(x.criteria) ? x.criteria : []).map((c) => {
				const q = rec$5(c);
				return {
					name: str$5(q.name),
					weight: numOrNull$3(q.weight)
				};
			}),
			value: numOrNull$3(x.value),
			needDate: str$5(x.needDate),
			leadDays: numOrNull$3(x.leadDays),
			selectionDays: numOrNull$3(x.selectionDays),
			supplier: str$5(x.supplier),
			status: STATUS_RANK[str$5(x.status)] !== void 0 ? str$5(x.status) : "Planificada",
			owner: str$5(x.owner),
			awardDate: str$5(x.awardDate),
			riskIds: strs$3(x.riskIds),
			notes: str$5(x.notes)
		};
	}
	function normalizePayment(o, fb) {
		const x = rec$5(o), id = str$5(x.id) || fb;
		return {
			id,
			code: str$5(x.code) || id,
			itemId: str$5(x.itemId),
			date: str$5(x.date),
			concept: str$5(x.concept),
			amount: numOrNull$3(x.amount),
			status: PAY_STATUSES.indexOf(x.status) >= 0 ? x.status : "programado"
		};
	}
	function normalizeClaim(o, fb) {
		const x = rec$5(o), id = str$5(x.id) || fb;
		return {
			id,
			code: str$5(x.code) || id,
			itemId: str$5(x.itemId),
			date: str$5(x.date),
			description: str$5(x.description),
			amount: numOrNull$3(x.amount),
			status: CLAIM_STATUSES.indexOf(x.status) >= 0 ? x.status : "abierto",
			resolvedOn: str$5(x.resolvedOn)
		};
	}
	function normalizeProcurement(raw, today = "") {
		const x = rec$5(raw), items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem$1(o, "pr" + (i + 1))), ad = rec$5(x.admin);
		const payments = (Array.isArray(ad.payments) ? ad.payments : []).map((o, i) => normalizePayment(o, "pg" + (i + 1))), claims = (Array.isArray(ad.claims) ? ad.claims : []).map((o, i) => normalizeClaim(o, "rc" + (i + 1)));
		return {
			strategy: str$5(x.strategy),
			performance: str$5(x.performance),
			approvals: str$5(x.approvals),
			asOf: iso$3(str$5(x.asOf)) ? str$5(x.asOf) : today,
			items,
			idCounter: Number(x.idCounter) || items.length + payments.length + claims.length + 1,
			admin: {
				payments,
				claims
			}
		};
	}
	var isBuy = (it) => it.decision !== "Hacer (recursos propios)";
	//#endregion
	//#region src/shared/quality-plan.ts
	var COQ_CATS = [
		"prevencion",
		"evaluacion",
		"falla_interna",
		"falla_externa"
	];
	var INSPECTION_RESULTS = [
		"conforme",
		"observada",
		"no_conforme"
	];
	var NCR_SEVERITIES = [
		"menor",
		"mayor",
		"critica"
	];
	var NCR_STATUSES = [
		"abierta",
		"en_correccion",
		"cerrada"
	];
	var str$4 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs$2 = (v) => Array.isArray(v) ? v.map(str$4).filter(Boolean) : [];
	var numOrNull$2 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec$4 = (o) => o && typeof o === "object" ? o : {};
	function normalizeMetric(o, fb) {
		const x = rec$4(o), id = str$4(x.id) || fb;
		return {
			id,
			code: str$4(x.code) || id,
			name: str$4(x.name),
			wbsIds: strs$2(x.wbsIds),
			definition: str$4(x.definition),
			target: str$4(x.target),
			tolerance: str$4(x.tolerance),
			method: str$4(x.method),
			frequency: str$4(x.frequency),
			owner: str$4(x.owner)
		};
	}
	function normalizeCheck(o, fb) {
		const x = rec$4(o), id = str$4(x.id) || fb;
		return {
			id,
			code: str$4(x.code) || id,
			wbsId: str$4(x.wbsId),
			what: str$4(x.what),
			criterion: str$4(x.criterion),
			kind: str$4(x.kind),
			method: str$4(x.method),
			frequency: str$4(x.frequency),
			owner: str$4(x.owner),
			record: str$4(x.record),
			metricId: str$4(x.metricId)
		};
	}
	function normalizeCoq(o, fb) {
		const x = rec$4(o);
		return {
			id: str$4(x.id) || fb,
			cat: COQ_CATS.indexOf(x.cat) >= 0 ? x.cat : "prevencion",
			description: str$4(x.description),
			amount: numOrNull$2(x.amount)
		};
	}
	function normalizeInspection(o, fb) {
		const x = rec$4(o), id = str$4(x.id) || fb;
		return {
			id,
			code: str$4(x.code) || id,
			checkId: str$4(x.checkId),
			date: str$4(x.date),
			result: INSPECTION_RESULTS.indexOf(x.result) >= 0 ? x.result : "conforme",
			inspector: str$4(x.inspector),
			notes: str$4(x.notes),
			ncrId: str$4(x.ncrId)
		};
	}
	function normalizeNcr(o, fb) {
		const x = rec$4(o), id = str$4(x.id) || fb;
		return {
			id,
			code: str$4(x.code) || id,
			wbsId: str$4(x.wbsId),
			description: str$4(x.description),
			severity: NCR_SEVERITIES.indexOf(x.severity) >= 0 ? x.severity : "menor",
			detectedOn: str$4(x.detectedOn),
			status: NCR_STATUSES.indexOf(x.status) >= 0 ? x.status : "abierta",
			action: str$4(x.action),
			owner: str$4(x.owner),
			dueDate: str$4(x.dueDate),
			closedOn: str$4(x.closedOn)
		};
	}
	function normalizeQuality(raw) {
		const x = rec$4(raw), metrics = (Array.isArray(x.metrics) ? x.metrics : []).map((o, i) => normalizeMetric(o, "qm" + (i + 1))), checks = (Array.isArray(x.checks) ? x.checks : []).map((o, i) => normalizeCheck(o, "qc" + (i + 1)));
		const coq = (Array.isArray(x.coq) ? x.coq : []).map((o, i) => normalizeCoq(o, "cq" + (i + 1)));
		const inspections = (Array.isArray(x.inspections) ? x.inspections : []).map((o, i) => normalizeInspection(o, "in" + (i + 1))), ncrs = (Array.isArray(x.ncrs) ? x.ncrs : []).map((o, i) => normalizeNcr(o, "nc" + (i + 1)));
		return {
			policy: str$4(x.policy),
			standards: str$4(x.standards),
			metrics,
			checks,
			coq,
			idCounter: Number(x.idCounter) || metrics.length + checks.length + coq.length + inspections.length + ncrs.length + 1,
			inspections,
			ncrs,
			asOf: /^\d{4}-\d{2}-\d{2}$/.test(str$4(x.asOf)) ? str$4(x.asOf) : ""
		};
	}
	//#endregion
	//#region src/shared/scope-validation.ts
	var DECISIONS = [
		"pendiente",
		"aceptado",
		"aceptado_con_observaciones",
		"rechazado"
	];
	var str$3 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs$1 = (v) => Array.isArray(v) ? v.map(str$3).filter(Boolean) : [];
	var rec$3 = (o) => o && typeof o === "object" ? o : {};
	var iso$2 = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeAcceptance(o, fb) {
		const x = rec$3(o), id = str$3(x.id) || fb;
		return {
			id,
			code: str$3(x.code) || id,
			delivId: str$3(x.delivId),
			wbsIds: strs$1(x.wbsIds),
			presentedOn: str$3(x.presentedOn),
			presentedBy: str$3(x.presentedBy),
			reviewer: str$3(x.reviewer),
			criteria: str$3(x.criteria),
			evidence: str$3(x.evidence),
			decision: DECISIONS.indexOf(x.decision) >= 0 ? x.decision : "pendiente",
			decidedOn: str$3(x.decidedOn),
			observations: str$3(x.observations)
		};
	}
	function normalizeValidation(raw) {
		const x = rec$3(raw), records = (Array.isArray(x.records) ? x.records : []).map((o, i) => normalizeAcceptance(o, "va" + (i + 1)));
		return {
			records,
			asOf: iso$2(str$3(x.asOf)) ? str$3(x.asOf) : "",
			idCounter: Number(x.idCounter) || records.length + 1
		};
	}
	function coverage(d, f) {
		return f.deliverables.map((dv) => {
			const rs = d.records.filter((r) => r.delivId === dv.id);
			return {
				deliverable: dv,
				records: rs,
				state: !rs.length ? "sin_validacion" : rs.some((r) => r.decision === "aceptado" || r.decision === "aceptado_con_observaciones") ? "aceptado" : rs.some((r) => r.decision === "rechazado") ? "rechazado" : "pendiente"
			};
		});
	}
	//#endregion
	//#region src/shared/knowledge.ts
	var LESSON_KINDS = [
		"buena_practica",
		"problema",
		"oportunidad"
	];
	var LESSON_STATUSES = [
		"capturada",
		"validada",
		"transferida"
	];
	var str$2 = (v) => v === null || v === void 0 ? "" : String(v);
	var rec$2 = (o) => o && typeof o === "object" ? o : {};
	var iso$1 = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeLesson(o, fb) {
		const x = rec$2(o), id = str$2(x.id) || fb;
		return {
			id,
			code: str$2(x.code) || id,
			date: str$2(x.date),
			kind: LESSON_KINDS.indexOf(x.kind) >= 0 ? x.kind : "problema",
			category: str$2(x.category),
			wbsId: str$2(x.wbsId),
			riskCode: str$2(x.riskCode),
			situation: str$2(x.situation),
			lesson: str$2(x.lesson),
			recommendation: str$2(x.recommendation),
			owner: str$2(x.owner),
			audience: str$2(x.audience),
			status: LESSON_STATUSES.indexOf(x.status) >= 0 ? x.status : "capturada"
		};
	}
	function normalizeKnowledge(raw) {
		const x = rec$2(raw), lessons = (Array.isArray(x.lessons) ? x.lessons : []).map((o, i) => normalizeLesson(o, "ll" + (i + 1)));
		return {
			lessons,
			asOf: iso$1(str$2(x.asOf)) ? str$2(x.asOf) : "",
			idCounter: Number(x.idCounter) || lessons.length + 1
		};
	}
	//#endregion
	//#region src/shared/change-control.ts
	var AREAS$1 = [
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
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
	var numOrNull$1 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var strs = (v) => Array.isArray(v) ? v.map(str$1).filter(Boolean) : [];
	function normalizeCr(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {}, im = x.impact && typeof x.impact === "object" ? x.impact : {};
		const impact = {};
		AREAS$1.forEach((a) => {
			const q = im[a] && typeof im[a] === "object" ? im[a] : {};
			impact[a] = {
				state: ["sin_impacto", "con_impacto"].indexOf(str$1(q.state)) >= 0 ? q.state : "sin_evaluar",
				note: str$1(q.note)
			};
		});
		const id = str$1(x.id) || fallbackId;
		return {
			id,
			code: str$1(x.code) || id,
			title: str$1(x.title),
			description: str$1(x.description),
			requester: str$1(x.requester),
			requestedOn: str$1(x.requestedOn),
			origin: str$1(x.origin),
			type: str$1(x.type),
			impact,
			wbsIds: strs(x.wbsIds),
			actIds: strs(x.actIds),
			daysDelta: numOrNull$1(x.daysDelta),
			costDelta: numOrNull$1(x.costDelta),
			fund: str$1(x.fund),
			orderIds: strs(x.orderIds),
			modIds: strs(x.modIds),
			riskIds: strs(x.riskIds),
			scheduleBaseline: str$1(x.scheduleBaseline),
			status: CR_STATUSES.indexOf(x.status) >= 0 ? x.status : "Pendiente",
			decidedOn: str$1(x.decidedOn),
			approver: str$1(x.approver),
			authLevel: str$1(x.authLevel),
			sponsorAuth: !!x.sponsorAuth,
			rationale: str$1(x.rationale),
			implementedOn: str$1(x.implementedOn),
			notes: str$1(x.notes)
		};
	}
	//#endregion
	//#region src/shared/plan-facts.ts
	var rec$1 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var rolesOf = (G) => Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)));
	var deliverablesOf = (G) => (Array.isArray(rec$1(G.getModule("scopeStatement")).deliverables) ? rec$1(G.getModule("scopeStatement")).deliverables.map(rec$1) : []).map((d) => ({
		id: String(d.id),
		code: String(d.code || ""),
		name: String(d.name || d.id),
		criteria: String(d.acceptanceCriteria || "")
	}));
	function gatherCloseFacts(G) {
		const dels = deliverablesOf(G), cov = coverage(normalizeValidation(G.getModule("scopeValidation")), {
			deliverables: dels,
			leaves: [],
			roles: [],
			openNcr: {}
		});
		const ncr = normalizeQuality(G.getModule("quality")).ncrs.filter((n) => n.status !== "cerrada"), proc = normalizeProcurement(G.getModule("procurement")), buys = proc.items.filter(isBuy);
		const lessons = normalizeKnowledge(G.getModule("knowledge")).lessons, crs = (Array.isArray(rec$1(G.getModule("changes")).requests) ? rec$1(G.getModule("changes")).requests : []).map((o, i) => normalizeCr(o, "cr" + (i + 1)));
		const cs = G.util.costSummary(G.getModule("cost"));
		return {
			deliverables: {
				total: dels.length,
				accepted: cov.filter((r) => r.state === "aceptado").length
			},
			ncr: {
				open: ncr.length,
				critical: ncr.filter((n) => n.severity === "critica").length
			},
			contracts: {
				total: buys.length,
				notDelivered: buys.filter((i) => i.status !== "Entregada").length,
				claimsOpen: proc.admin.claims.filter((c) => c.status === "abierto").length
			},
			lessons: {
				total: lessons.length,
				transferred: lessons.filter((l) => l.status === "transferida").length
			},
			changes: { open: crs.filter((c) => c.status === "Pendiente" || c.status === "Aprobada").length },
			bac: cs.hasData ? cs.bacCurrent || cs.bac || null : null,
			roles: rolesOf(G)
		};
	}
	//#endregion
	//#region src/shared/closeout.ts
	var KINDS = ["proyecto", "fase"];
	var AREAS = [
		"Alcance",
		"Contratos",
		"Recursos",
		"Lecciones",
		"Finanzas",
		"Documentación",
		"Otro"
	];
	var ITEM_STATUSES = [
		"pendiente",
		"hecho",
		"no_aplica"
	];
	var ITEM_LABEL = {
		pendiente: "Pendiente",
		hecho: "Hecho",
		no_aplica: "No aplica"
	};
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var rec = (o) => o && typeof o === "object" ? o : {};
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeItem(o, fb) {
		const x = rec(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			area: str(x.area),
			what: str(x.what),
			owner: str(x.owner),
			dueDate: str(x.dueDate),
			status: ITEM_STATUSES.indexOf(x.status) >= 0 ? x.status : "pendiente",
			doneOn: str(x.doneOn),
			evidence: str(x.evidence)
		};
	}
	function normalizeCloseout(raw) {
		const x = rec(raw), c = rec(x.closure), items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "ci" + (i + 1)));
		return {
			kind: KINDS.indexOf(x.kind) >= 0 ? x.kind : "proyecto",
			phase: str(x.phase),
			items,
			closure: {
				closed: c.closed === true,
				closedOn: str(c.closedOn),
				approvedBy: str(c.approvedBy),
				report: str(c.report),
				finalCost: numOrNull(c.finalCost),
				outcome: str(c.outcome)
			},
			asOf: iso(str(x.asOf)) ? str(x.asOf) : "",
			idCounter: Number(x.idCounter) || items.length + 1
		};
	}
	var blankCloseout = () => normalizeCloseout(null);
	function nextCode(items) {
		let max = 0;
		items.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "CI-" + String(max + 1).padStart(2, "0");
	}
	var asOfOf = (d, today) => iso(d.asOf) ? d.asOf : today;
	var emptyFacts = () => ({
		deliverables: {
			total: 0,
			accepted: 0
		},
		ncr: {
			open: 0,
			critical: 0
		},
		contracts: {
			total: 0,
			notDelivered: 0,
			claimsOpen: 0
		},
		lessons: {
			total: 0,
			transferred: 0
		},
		changes: { open: 0 },
		bac: null,
		roles: []
	});
	function autoChecks(d, f) {
		const dl = f.deliverables, fc = d.closure.finalCost;
		return [
			{
				key: "entregables",
				label: "Entregables aceptados por el cliente",
				ok: dl.total ? dl.accepted === dl.total : null,
				detail: dl.total ? dl.accepted + " de " + dl.total + " entregables aceptados" : "sin entregables o sin validaciones registradas",
				file: "Validar_Alcance.html"
			},
			{
				key: "calidad",
				label: "Sin no conformidades abiertas",
				ok: f.ncr.open === 0,
				detail: f.ncr.open ? f.ncr.open + " abierta(s)" + (f.ncr.critical ? " (" + f.ncr.critical + " crítica(s))" : "") : "ninguna abierta",
				file: "Plan_Calidad.html"
			},
			{
				key: "contratos",
				label: "Contratos entregados y sin reclamos abiertos",
				ok: f.contracts.total ? f.contracts.notDelivered === 0 && f.contracts.claimsOpen === 0 : null,
				detail: f.contracts.total ? f.contracts.notDelivered + " adquisición(es) sin entregar · " + f.contracts.claimsOpen + " reclamo(s) abierto(s)" : "sin adquisiciones",
				file: "Plan_Adquisiciones.html"
			},
			{
				key: "lecciones",
				label: "Lecciones aprendidas transferidas",
				ok: f.lessons.total ? f.lessons.transferred === f.lessons.total : null,
				detail: f.lessons.total ? f.lessons.transferred + " de " + f.lessons.total + " transferidas" : "sin lecciones registradas",
				file: "Gestion_Conocimiento.html"
			},
			{
				key: "cambios",
				label: "Solicitudes de cambio cerradas",
				ok: f.changes.open === 0,
				detail: f.changes.open ? f.changes.open + " pendiente(s) o aprobada(s) sin implementar" : "ninguna abierta",
				file: "Control_Cambios.html"
			},
			{
				key: "costo",
				label: "Costo final registrado y dentro del presupuesto",
				ok: fc === null ? false : f.bac !== null && f.bac > 0 ? fc <= f.bac + .5 : null,
				detail: fc === null ? "falta registrar el costo final" : f.bac !== null && f.bac > 0 ? "costo final " + Math.round(fc).toLocaleString("es-PE") + " frente al presupuesto vigente " + Math.round(f.bac).toLocaleString("es-PE") : "sin presupuesto contra el cual comparar",
				file: "Cost-management.html"
			},
			{
				key: "lista",
				label: "Lista de verificación del cierre completa",
				ok: d.items.length ? d.items.every((i) => i.status !== "pendiente") : null,
				detail: d.items.length ? d.items.filter((i) => i.status === "pendiente").length + " ítem(s) pendiente(s) de " + d.items.length : "sin ítems",
				file: ""
			}
		];
	}
	function pendingChecks(d, f) {
		return autoChecks(d, f).filter((c) => c.ok === false);
	}
	function closeoutFindings(d, f, today0 = "") {
		const today = asOfOf(d, today0), out = [], F = (code, severity, itemId, text) => {
			out.push({
				code,
				severity,
				itemId,
				text
			});
		};
		const cl = d.closure, roles = new Set(f.roles.map((r) => r.toLowerCase())), pend = pendingChecks(d, f);
		d.items.forEach((i) => {
			const w = i.code + (i.what.trim() ? " «" + i.what.trim().slice(0, 50) + "»" : "");
			if (i.status === "pendiente") {
				if (!i.owner.trim() || !iso(i.dueDate)) F("C3", "aviso", i.id, w + ": pendiente sin " + [!i.owner.trim() ? "responsable" : "", !iso(i.dueDate) ? "fecha límite" : ""].filter(Boolean).join(" ni ") + ": nadie sabe quién lo cierra ni para cuándo.");
				else if (iso(today) && i.dueDate < today) F("C3", "aviso", i.id, w + ": venció el " + i.dueDate + " y sigue pendiente.");
			}
			if (i.status === "hecho" && (!iso(i.doneOn) || !i.evidence.trim())) F("C5", "info", i.id, w + ": marcado hecho sin " + (!iso(i.doneOn) ? "fecha" : "evidencia") + ": el cierre necesita dejar constancia.");
			if (i.owner.trim() && roles.size && !roles.has(i.owner.trim().toLowerCase())) F("C6", "info", i.id, w + ": el responsable «" + i.owner + "» no figura entre los puestos del OBS.");
		});
		if (d.kind === "fase" && !d.phase.trim()) F("C4", "aviso", null, "Se cierra una FASE y no se indica cuál: el cierre de una fase necesita nombrarla.");
		if (cl.closed) {
			if (pend.length) F("C1", "riesgo", null, "Se declaró el cierre con " + pend.length + " frente(s) sin resolver — " + pend.map((p) => p.label.toLowerCase() + " (" + p.detail + ")").join("; ") + ": un cierre con deuda traslada al cliente y a la organización lo que el proyecto no terminó.");
			if (!cl.approvedBy.trim() || !iso(cl.closedOn)) F("C2", "aviso", null, "El cierre está declarado sin " + [!cl.approvedBy.trim() ? "quién lo aprueba" : "", !iso(cl.closedOn) ? "fecha" : ""].filter(Boolean).join(" ni ") + ".");
			if (!cl.report.trim()) F("C2", "aviso", null, "El cierre está declarado sin informe final (resultados contra los objetivos del Acta, costo final, lecciones y entrega).");
			if (!cl.outcome.trim()) F("C5", "info", null, "El cierre no evalúa el resultado contra los objetivos y criterios de éxito del Acta de Constitución.");
		} else if (d.items.length || cl.finalCost !== null) {
			if (pend.length && iso(today) && d.items.length) F("C7", "info", null, "Para poder cerrar faltan " + pend.length + " frente(s): " + pend.map((p) => p.label.toLowerCase()).join("; ") + ".");
		}
		if (cl.finalCost !== null && f.bac !== null && f.bac > 0 && cl.finalCost > f.bac + .5) F("C8", "aviso", null, "El costo final (" + Math.round(cl.finalCost).toLocaleString("es-PE") + ") supera el presupuesto vigente (" + Math.round(f.bac).toLocaleString("es-PE") + ") en " + Math.round((cl.finalCost / f.bac - 1) * 1e3) / 10 + " %: documenta la causa en el informe final.");
		return out;
	}
	function closeState(d, f, today = "") {
		if (!d.items.length && !d.closure.closed && d.closure.finalCost === null) return "vacio";
		const fs = closeoutFindings(d, f, today);
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
	//#endregion
	//#region src/shared/closeout-sample.ts
	var SAMPLE_CLOSEOUT_AS_OF = "2026-11-03";
	var sampleCloseFacts = () => ({
		...emptyFacts(),
		deliverables: {
			total: 6,
			accepted: 1
		},
		ncr: {
			open: 1,
			critical: 0
		},
		contracts: {
			total: 5,
			notDelivered: 5,
			claimsOpen: 0
		},
		lessons: {
			total: 8,
			transferred: 0
		},
		changes: { open: 3 },
		bac: 8081108,
		roles: SAMPLE_OBS_ROLES.slice()
	});
	var ROWS = [
		[
			"CI-01",
			"Alcance",
			"Obtener la aceptación formal de los seis entregables del Enunciado del Alcance (Validar el Alcance)",
			"Director de Proyecto",
			"2027-07-23"
		],
		[
			"CI-02",
			"Contratos",
			"Recibir conforme y liquidar los contratos de procura y del subcontrato MEP; cerrar los reclamos abiertos",
			"Jefe de Logística",
			"2027-07-30"
		],
		[
			"CI-03",
			"Recursos",
			"Liberar a la Subcontrata MEP y a las cuadrillas al terminar sus paquetes y devolver los equipos alquilados",
			"Residente de Obra",
			"2027-07-30"
		],
		[
			"CI-04",
			"Documentación",
			"Archivar el dossier de calidad, los planos as-built y los manuales de operación y mantenimiento",
			"Control de Calidad",
			"2027-07-30"
		],
		[
			"CI-05",
			"Lecciones",
			"Transferir las lecciones aprendidas a la oficina de proyectos y al siguiente proyecto de DISTRIB+",
			"Director de Proyecto",
			"2027-08-06"
		],
		[
			"CI-06",
			"Finanzas",
			"Registrar el costo final, conciliarlo con el presupuesto vigente y cerrar las órdenes de cambio",
			"Director de Proyecto",
			"2027-08-06"
		],
		[
			"CI-07",
			"Documentación",
			"Firmar el acta de entrega y cierre con la Gerencia de Operaciones (recepción de la obra y puesta en marcha)",
			"Comité Directivo / Sponsor",
			"2027-07-23"
		]
	];
	function buildSampleCloseout() {
		const items = ROWS.map(([code, area, what, owner, dueDate], i) => normalizeItem({
			id: "ci" + (i + 1),
			code,
			area,
			what,
			owner,
			dueDate,
			status: "pendiente"
		}, "ci" + (i + 1)));
		return {
			...normalizeCloseout(null),
			kind: "proyecto",
			items,
			asOf: SAMPLE_CLOSEOUT_AS_OF,
			idCounter: items.length + 1
		};
	}
	//#endregion
	//#region src/modules/closeout/main.ts
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
			let facts = emptyFacts();
			if (!connected) facts = sampleCloseFacts();
			else if (G && G.util) try {
				facts = gatherCloseFacts(G);
			} catch (e) {}
			ctx = {
				connected,
				facts
			};
			ctxDirty = false;
		}
		return ctx;
	}
	var data = blankCloseout();
	var newId = () => "ci" + data.idCounter++;
	var enumOpts = (list, labels, cur) => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
	var areaOpts = (cur) => `<option value=""></option>` + AREAS.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && AREAS.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
	function itemRow(i, flagged) {
		return `<tr data-id="${esc(i.id)}"${flagged.has(i.id) ? " class=\"hasf\"" : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(i.code)}" aria-label="Código"></td>
    <td style="width:130px"><select data-f="area" aria-label="Área">${areaOpts(i.area)}</select></td>
    <td style="min-width:240px"><textarea data-f="what" aria-label="Qué hay que cerrar">${esc(i.what)}</textarea></td>
    <td style="min-width:150px"><input data-f="owner" list="rolesList" value="${esc(i.owner)}" aria-label="Responsable"></td>
    <td style="width:130px"><input data-f="dueDate" type="date" value="${esc(i.dueDate)}" aria-label="Fecha límite"></td>
    <td style="width:130px"><select data-f="status" aria-label="Estado">${enumOpts(ITEM_STATUSES, ITEM_LABEL, i.status)}</select><input data-f="doneOn" type="date" value="${esc(i.doneOn)}" style="margin-top:3px" aria-label="Hecho el"></td>
    <td style="min-width:170px"><input data-f="evidence" value="${esc(i.evidence)}" aria-label="Evidencia"></td>
    <td><button class="btn sm danger" data-del="${esc(i.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
	}
	function render() {
		const f = getCtx().facts, root = $("mainArea"), flagged = new Set(closeoutFindings(data, f, todayLocalISO()).map((x) => x.itemId).filter((x) => !!x)), cl = data.closure;
		root.innerHTML = `
    <div class="view-head"><h2>Cierre del proyecto o fase</h2>
      <p>Cerrar no es un botón: es comprobar que todo lo prometido está <b>hecho, aceptado, pagado, liberado y aprendido</b>, y dejar quién lo aprueba. Las comprobaciones de abajo se <b>leen de las demás herramientas</b>; la lista de verificación y la aprobación son de este módulo. Puedes declarar el cierre con pendientes, pero queda escrito como riesgo: un cierre con deuda.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="grid2">
      <div class="card fd"><h3>Qué se cierra</h3><label for="kind">Tipo de cierre</label><select id="kind" data-h="kind">${enumOpts(KINDS, {
			proyecto: "Proyecto completo",
			fase: "Una fase del proyecto"
		}, data.kind)}</select>
        <label for="phase" style="margin-top:6px">Fase (si se cierra una fase)</label><input id="phase" data-h="phase" value="${esc(data.phase)}"></div>
      <div class="card fd"><h3>Fecha de corte</h3><label for="asOf">Contra ella se juzgan los plazos (vacía = hoy)</label><input id="asOf" type="date" data-h="asOf" value="${esc(data.asOf)}"></div>
      <div class="card fd"><h3>Costo final</h3><label for="finalCost">Costo total ejecutado (se compara con el presupuesto vigente)</label><input id="finalCost" type="number" min="0" step="any" data-c="finalCost" value="${cl.finalCost === null ? "" : cl.finalCost}"></div>
    </div>
    <div class="card"><h3>Comprobaciones automáticas (lo que dicen las demás herramientas)</h3><div id="checks"></div></div>
    <div class="card"><h3>Lista de verificación del cierre (${data.items.length})</h3>
      ${data.items.length ? `<table class="an" id="tblItems"><thead><tr><th>Cód.</th><th>Área</th><th>Qué hay que cerrar</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th>Evidencia</th><th></th></tr></thead><tbody>${data.items.map((i) => itemRow(i, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>` : `<div class="empty-hint">Aún no hay ítems. Agrega el primero con <b>＋ Ítem de cierre</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Aprobación del cierre</h3>
      <label class="rng-chk" style="display:flex;gap:8px;align-items:center;font-weight:700;margin-bottom:8px"><input type="checkbox" id="closed" data-c="closed"${cl.closed ? " checked" : ""} style="width:auto"> Se declara el cierre</label>
      <div class="grid2">
        <div class="fd"><label for="closedOn">Fecha del cierre</label><input id="closedOn" type="date" data-c="closedOn" value="${esc(cl.closedOn)}"></div>
        <div class="fd"><label for="approvedBy">Aprobado por</label><input id="approvedBy" list="rolesList" data-c="approvedBy" value="${esc(cl.approvedBy)}"></div>
        <div class="fd"><label for="outcome">Resultado frente a los objetivos y criterios de éxito del Acta</label><textarea id="outcome" data-c="outcome">${esc(cl.outcome)}</textarea></div>
      </div>
      <div class="fd" style="margin-top:8px"><label for="report">Informe final (resultados, costo final, entrega, pendientes aceptados)</label><textarea id="report" data-c="report">${esc(cl.report)}</textarea></div></div>
    <div class="card"><h3>Hallazgos</h3><div id="finds"></div></div>`;
		refreshMeta();
		wireMain();
	}
	function refreshMeta() {
		const f = getCtx().facts, today = todayLocalISO(), fs = closeoutFindings(data, f, today), st = closeState(data, f, today), ck = autoChecks(data, f);
		const ok = ck.filter((c) => c.ok === true).length, pend = ck.filter((c) => c.ok === false).length, done = data.items.filter((i) => i.status !== "pendiente").length;
		$("kpis").innerHTML = `<div class="kpi"><b>${ok}/${ck.length}</b><span>Comprobaciones que cumplen</span></div>
    <div class="kpi"><b>${pend}</b><span>Frentes que impiden cerrar</span></div>
    <div class="kpi"><b>${done}/${data.items.length}</b><span>Ítems de la lista resueltos</span></div>
    <div class="kpi"><b>${data.closure.closed ? "Declarado" : "Abierto"}</b><span>${data.kind === "fase" ? "Cierre de fase" : "Cierre del proyecto"}</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado</span></div>`;
		$("checks").innerHTML = `<table class="an"><thead><tr><th>Comprobación</th><th>Resultado</th><th>Estado</th><th>Módulo</th></tr></thead><tbody>${ck.map((c) => `<tr><td>${esc(c.label)}</td><td class="small">${esc(c.detail)}</td><td>${c.ok === null ? "<span class=\"pill st-vacio\">sin datos</span>" : c.ok ? "<span class=\"pill st-verde\">cumple</span>" : "<span class=\"pill st-ambar\">falta</span>"}</td><td>${c.file ? `<a href="${esc(c.file)}">Abrir</a>` : "<span class=\"muted\">—</span>"}</td></tr>`).join("")}</tbody></table>`;
		const icon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		$("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.items.length || data.closure.closed ? "Sin hallazgos." : "Sin nada que revisar todavía."}</p>`;
	}
	function wireMain() {
		document.querySelectorAll("[data-h]").forEach((el) => {
			const h = el.getAttribute("data-h"), ev = el.tagName === "SELECT" ? "change" : "input";
			el.addEventListener(ev, () => {
				if (h === "kind") data.kind = el.value === "fase" ? "fase" : "proyecto";
				else if (h === "phase") data.phase = el.value;
				else data.asOf = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : "";
				refreshMeta();
				save();
			});
		});
		document.querySelectorAll("[data-c]").forEach((el) => {
			const k = el.getAttribute("data-c");
			el.addEventListener(k === "closed" ? "change" : "input", () => {
				const c = data.closure;
				if (k === "closed") c.closed = el.checked;
				else if (k === "finalCost") c.finalCost = el.value === "" || !isFinite(Number(el.value)) ? null : Number(el.value);
				else c[k] = el.value;
				refreshMeta();
				save();
			});
		});
		const t = document.getElementById("tblItems");
		if (!t) return;
		const upd = (el) => {
			const tr = el.closest("tr"), i = tr && data.items.find((x) => x.id === tr.getAttribute("data-id")), fld = el.getAttribute("data-f");
			if (!i || !fld) return;
			i[fld] = el.value;
			refreshMeta();
			save();
		};
		t.addEventListener("input", (e) => {
			const x = e.target;
			if (x.tagName !== "SELECT") upd(x);
		});
		t.addEventListener("change", (e) => upd(e.target));
		t.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
			data.items = data.items.filter((x) => x.id !== b.dataset.del);
			render();
			save();
			setStatus("Ítem eliminado.");
		}));
	}
	function addItem() {
		const id = newId(), i = normalizeItem({
			id,
			code: nextCode(data.items),
			status: "pendiente"
		}, id);
		data.items.push(i);
		render();
		save();
		setStatus(i.code + " creado: di qué hay que cerrar, quién y para cuándo.");
		const el = document.querySelector(`tr[data-id="${id}"] textarea`);
		if (el) el.focus();
	}
	function exportCsv() {
		const q = (v) => "\"" + v.replace(/"/g, "\"\"") + "\"";
		const lines = [[
			"Código",
			"Área",
			"Qué hay que cerrar",
			"Responsable",
			"Fecha límite",
			"Estado",
			"Hecho el",
			"Evidencia"
		].map(q).join(",")];
		data.items.forEach((i) => lines.push([
			i.code,
			i.area,
			i.what,
			i.owner,
			i.dueDate,
			ITEM_LABEL[i.status],
			i.doneOn,
			i.evidence
		].map(q).join(",")));
		const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "lista_de_cierre.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Lista de cierre exportada como CSV.");
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
	function wireToolbar() {
		$("btnAdd").addEventListener("click", addItem);
		$("btnCsv").addEventListener("click", exportCsv);
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el cierre actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				ctxDirty = true;
				data = buildSampleCloseout();
				render();
				save();
				setStatus("Caso de ejemplo cargado: el cierre está preparado, no declarado.");
			});
		});
		$("btnClear").addEventListener("click", () => {
			showConfirm("Esto borrará la lista de verificación y la aprobación del cierre. ¿Continuar?", "Nuevo cierre").then((ok) => {
				if (ok) {
					data = blankCloseout();
					render();
					save();
					setStatus("Cierre nuevo iniciado.");
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el cierre aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			kind: data.kind,
			phase: data.phase,
			items: data.items,
			closure: data.closure,
			asOf: data.asOf,
			idCounter: data.idCounter
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("closeout");
			ctxDirty = true;
			const mod = p.modules && p.modules.closeout;
			if (mod && typeof mod === "object") {
				data = normalizeCloseout(mod);
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = blankCloseout();
				render();
				setStatus("Proyecto sin cierre todavía. Agrega el primer ítem, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "closeout", "El cierre del proyecto", payload(), null, session, {
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
		data = buildSampleCloseout();
		ctxDirty = true;
		render();
	} else render();
	//#endregion
})();
