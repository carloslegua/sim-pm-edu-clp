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
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
	var strs$1 = (v) => Array.isArray(v) ? v.map(str$1).filter(Boolean) : [];
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var rec$2 = (o) => o && typeof o === "object" ? o : {};
	function normalizeMetric(o, fb) {
		const x = rec$2(o), id = str$1(x.id) || fb;
		return {
			id,
			code: str$1(x.code) || id,
			name: str$1(x.name),
			wbsIds: strs$1(x.wbsIds),
			definition: str$1(x.definition),
			target: str$1(x.target),
			tolerance: str$1(x.tolerance),
			method: str$1(x.method),
			frequency: str$1(x.frequency),
			owner: str$1(x.owner)
		};
	}
	function normalizeCheck(o, fb) {
		const x = rec$2(o), id = str$1(x.id) || fb;
		return {
			id,
			code: str$1(x.code) || id,
			wbsId: str$1(x.wbsId),
			what: str$1(x.what),
			criterion: str$1(x.criterion),
			kind: str$1(x.kind),
			method: str$1(x.method),
			frequency: str$1(x.frequency),
			owner: str$1(x.owner),
			record: str$1(x.record),
			metricId: str$1(x.metricId)
		};
	}
	function normalizeCoq(o, fb) {
		const x = rec$2(o);
		return {
			id: str$1(x.id) || fb,
			cat: COQ_CATS.indexOf(x.cat) >= 0 ? x.cat : "prevencion",
			description: str$1(x.description),
			amount: numOrNull(x.amount)
		};
	}
	function normalizeInspection(o, fb) {
		const x = rec$2(o), id = str$1(x.id) || fb;
		return {
			id,
			code: str$1(x.code) || id,
			checkId: str$1(x.checkId),
			date: str$1(x.date),
			result: INSPECTION_RESULTS.indexOf(x.result) >= 0 ? x.result : "conforme",
			inspector: str$1(x.inspector),
			notes: str$1(x.notes),
			ncrId: str$1(x.ncrId)
		};
	}
	function normalizeNcr(o, fb) {
		const x = rec$2(o), id = str$1(x.id) || fb;
		return {
			id,
			code: str$1(x.code) || id,
			wbsId: str$1(x.wbsId),
			description: str$1(x.description),
			severity: NCR_SEVERITIES.indexOf(x.severity) >= 0 ? x.severity : "menor",
			detectedOn: str$1(x.detectedOn),
			status: NCR_STATUSES.indexOf(x.status) >= 0 ? x.status : "abierta",
			action: str$1(x.action),
			owner: str$1(x.owner),
			dueDate: str$1(x.dueDate),
			closedOn: str$1(x.closedOn)
		};
	}
	function normalizeQuality(raw) {
		const x = rec$2(raw), metrics = (Array.isArray(x.metrics) ? x.metrics : []).map((o, i) => normalizeMetric(o, "qm" + (i + 1))), checks = (Array.isArray(x.checks) ? x.checks : []).map((o, i) => normalizeCheck(o, "qc" + (i + 1)));
		const coq = (Array.isArray(x.coq) ? x.coq : []).map((o, i) => normalizeCoq(o, "cq" + (i + 1)));
		const inspections = (Array.isArray(x.inspections) ? x.inspections : []).map((o, i) => normalizeInspection(o, "in" + (i + 1))), ncrs = (Array.isArray(x.ncrs) ? x.ncrs : []).map((o, i) => normalizeNcr(o, "nc" + (i + 1)));
		return {
			policy: str$1(x.policy),
			standards: str$1(x.standards),
			metrics,
			checks,
			coq,
			idCounter: Number(x.idCounter) || metrics.length + checks.length + coq.length + inspections.length + ncrs.length + 1,
			inspections,
			ncrs,
			asOf: /^\d{4}-\d{2}-\d{2}$/.test(str$1(x.asOf)) ? str$1(x.asOf) : ""
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
	var DECISION_LABEL = {
		pendiente: "Pendiente",
		aceptado: "Aceptado",
		aceptado_con_observaciones: "Aceptado con observaciones",
		rechazado: "Rechazado"
	};
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var strs = (v) => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
	var rec$1 = (o) => o && typeof o === "object" ? o : {};
	var iso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	function normalizeAcceptance(o, fb) {
		const x = rec$1(o), id = str(x.id) || fb;
		return {
			id,
			code: str(x.code) || id,
			delivId: str(x.delivId),
			wbsIds: strs(x.wbsIds),
			presentedOn: str(x.presentedOn),
			presentedBy: str(x.presentedBy),
			reviewer: str(x.reviewer),
			criteria: str(x.criteria),
			evidence: str(x.evidence),
			decision: DECISIONS.indexOf(x.decision) >= 0 ? x.decision : "pendiente",
			decidedOn: str(x.decidedOn),
			observations: str(x.observations)
		};
	}
	function normalizeValidation(raw) {
		const x = rec$1(raw), records = (Array.isArray(x.records) ? x.records : []).map((o, i) => normalizeAcceptance(o, "va" + (i + 1)));
		return {
			records,
			asOf: iso(str(x.asOf)) ? str(x.asOf) : "",
			idCounter: Number(x.idCounter) || records.length + 1
		};
	}
	var blankValidation = () => normalizeValidation(null);
	function nextCode(items) {
		let max = 0;
		items.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "VA-" + String(max + 1).padStart(2, "0");
	}
	var asOfOf = (d, today) => iso(d.asOf) ? d.asOf : today;
	var gap = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
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
	function summary(d, f) {
		const c = coverage(d, f);
		return {
			deliverables: f.deliverables.length,
			accepted: c.filter((r) => r.state === "aceptado").length,
			pending: c.filter((r) => r.state === "pendiente").length,
			rejected: c.filter((r) => r.state === "rechazado").length,
			uncovered: c.filter((r) => r.state === "sin_validacion").length
		};
	}
	function validationFindings(d, f, today0 = "") {
		const today = asOfOf(d, today0), out = [], F = (code, severity, recordId, text) => {
			out.push({
				code,
				severity,
				recordId,
				text
			});
		};
		if (!d.records.length) return out;
		const delBy = new Map(f.deliverables.map((x) => [x.id, x])), leafBy = new Map(f.leaves.map((l) => [l.id, l])), roles = new Set(f.roles.map((r) => r.toLowerCase()));
		d.records.forEach((r) => {
			const dv = delBy.get(r.delivId), w = r.code + (dv ? " «" + dv.name + "»" : ""), accepted = r.decision === "aceptado" || r.decision === "aceptado_con_observaciones";
			if (!dv) F("V6", "aviso", r.id, r.code + ": no corresponde a ningún entregable del Enunciado del Alcance" + (r.delivId ? " (el entregable ya no existe)" : "") + ": no hay contra qué criterio aceptarlo.");
			if (accepted) {
				if (!r.evidence.trim() || !r.reviewer.trim() || !iso(r.decidedOn)) F("V2", "aviso", r.id, w + ": está aceptado sin " + [
					!r.reviewer.trim() ? "quién lo acepta" : "",
					!iso(r.decidedOn) ? "fecha de la decisión" : "",
					!r.evidence.trim() ? "evidencia (acta o protocolo firmado)" : ""
				].filter(Boolean).join(", ") + ": una aceptación sin firma ni fecha no es formal.");
				const ncr = r.wbsIds.reduce((s, id) => ({
					count: s.count + (f.openNcr[id] || { count: 0 }).count,
					critical: s.critical + (f.openNcr[id] || { critical: 0 }).critical
				}), {
					count: 0,
					critical: 0
				});
				if (ncr.count > 0) F("V1", ncr.critical > 0 ? "riesgo" : "aviso", r.id, w + ": se aceptó con " + ncr.count + " no conformidad(es) ABIERTA(S) en sus paquetes" + (ncr.critical ? " (" + ncr.critical + " crítica(s))" : "") + ": aceptar un entregable con defectos sin cerrar traslada el problema al cliente o a la garantía.");
			}
			if ((r.decision === "rechazado" || r.decision === "aceptado_con_observaciones") && !r.observations.trim()) F("V3", "aviso", r.id, w + ": está «" + DECISION_LABEL[r.decision].toLowerCase() + "» y no dice por qué: las observaciones son lo que el equipo debe corregir.");
			if (dv && dv.criteria.trim() && r.criteria.trim() && r.criteria.trim() !== dv.criteria.trim()) F("V4", "aviso", r.id, w + ": el criterio con que se validó difiere del criterio vigente del Enunciado del Alcance: se acepta contra otra vara.");
			else if (dv && dv.criteria.trim() && !r.criteria.trim() && (accepted || r.decision === "rechazado")) F("V4", "info", r.id, w + ": no copia el criterio de aceptación del Enunciado (puedes traerlo con «↧ Tomar del Enunciado»).");
			if (r.decision === "pendiente" && iso(r.presentedOn) && iso(today) && gap(r.presentedOn, today) > 15) F("V8", "aviso", r.id, w + ": presentado el " + r.presentedOn + " y sin decisión hace " + gap(r.presentedOn, today) + " días (más de 15 a la fecha de corte " + today + "): una validación que no se decide retrasa la aceptación del proyecto.");
			if (r.wbsIds.some((id) => !leafBy.has(id)) && f.leaves.length) F("V6", "aviso", r.id, w + ": apunta a un paquete de la EDT que ya no existe.");
			if (accepted && !r.wbsIds.length) F("V5", "info", r.id, w + ": no dice qué paquetes de la EDT cubre: no se puede comprobar que estén cerrados.");
			if (accepted && r.reviewer.trim() && roles.size && !roles.has(r.reviewer.trim().toLowerCase())) F("V7", "info", r.id, w + ": quien lo acepta («" + r.reviewer + "») no figura entre los puestos del OBS.");
		});
		const unc = coverage(d, f).filter((r) => r.state === "sin_validacion");
		if (unc.length) F("V5", "info", null, unc.length + " entregable(s) del Enunciado sin ninguna validación registrada: " + unc.slice(0, 4).map((r) => r.deliverable.name).join("; ") + (unc.length > 4 ? "…" : "") + ".");
		return out;
	}
	function validationState(d, f, today = "") {
		if (!d.records.length) return "vacio";
		const fs = validationFindings(d, f, today);
		return fs.some((x) => x.severity === "riesgo") ? "rojo" : fs.some((x) => x.severity === "aviso") ? "ambar" : "verde";
	}
	//#endregion
	//#region src/shared/plan-facts.ts
	var rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var rolesOf = (G) => Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)));
	function openNcrByLeaf(G) {
		const out = {};
		normalizeQuality(G.getModule("quality")).ncrs.filter((n) => n.status !== "cerrada" && n.wbsId).forEach((n) => {
			const o = out[n.wbsId] || (out[n.wbsId] = {
				count: 0,
				critical: 0
			});
			o.count++;
			if (n.severity === "critica") o.critical++;
		});
		return out;
	}
	var deliverablesOf = (G) => (Array.isArray(rec(G.getModule("scopeStatement")).deliverables) ? rec(G.getModule("scopeStatement")).deliverables.map(rec) : []).map((d) => ({
		id: String(d.id),
		code: String(d.code || ""),
		name: String(d.name || d.id),
		criteria: String(d.acceptanceCriteria || "")
	}));
	function gatherValidationFacts(G) {
		const wbs = G.util.effectiveWbs(), nodes = rec(wbs && wbs.nodes), leavesOf = {};
		const leaves = (id) => {
			const k = rec(nodes[id]).children;
			return Array.isArray(k) && k.length ? k.flatMap(leaves) : [id];
		};
		Object.keys(nodes).forEach((id) => {
			const d = String(rec(nodes[id]).delId || "");
			if (d) leavesOf[d] = Array.from(new Set((leavesOf[d] || []).concat(leaves(id))));
		});
		return {
			deliverables: deliverablesOf(G),
			leaves: G.util.wbsLeaves(wbs).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name,
				acceptance: String(rec(nodes[l.id]).acceptance || "")
			})),
			roles: rolesOf(G),
			openNcr: openNcrByLeaf(G),
			leavesOf
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
	//#region src/shared/scope-validation-sample.ts
	var SAMPLE_VALIDATION_AS_OF = "2026-11-03";
	var SAMPLE_DELIVERABLES = [
		[
			"Expediente técnico de ingeniería",
			"Expediente revisado y aprobado por la supervisión; planos aptos para construcción.",
			[
				"2.1",
				"2.2",
				"2.3"
			]
		],
		[
			"Permisos y licencias municipales de construcción",
			"Licencias emitidas por la Municipalidad de Lurín y certificado de seguridad aprobado.",
			["2.4"]
		],
		[
			"Obra civil y estructura del almacén",
			"Altura libre, disposición de racks y acabados conformes a los planos aprobados.",
			[
				"3.1",
				"4.1",
				"4.2",
				"4.3",
				"4.4"
			]
		],
		[
			"Instalaciones MEP operativas y probadas",
			"Cargas eléctricas y caudales sanitarios probados y conformes a memoria de cálculo.",
			[
				"3.3",
				"4.5",
				"5.1"
			]
		],
		[
			"Patio de maniobras y obras exteriores",
			"Radios de giro y áreas de maniobra verificados con vehículo de diseño (tráiler).",
			[]
		],
		[
			"Dossier de calidad y acta de entrega final",
			"Dossier de calidad completo y acta de entrega y cierre firmada por el cliente.",
			["5.3"]
		]
	];
	var sampleValidationFacts = () => ({
		deliverables: SAMPLE_DELIVERABLES.map(([name, criteria], i) => ({
			id: "d" + (i + 1),
			code: "DEL." + String(i + 1).padStart(2, "0"),
			name,
			criteria
		})),
		leaves: SAMPLE_CASE_LEAVES.map((l) => ({
			id: "w-" + l.code,
			code: l.code,
			name: l.name,
			acceptance: SAMPLE_WBS_DICTIONARY[l.code].acceptance
		})),
		roles: SAMPLE_OBS_ROLES.slice(),
		openNcr: { "w-3.1": {
			count: 1,
			critical: 0
		} },
		leavesOf: Object.fromEntries(SAMPLE_DELIVERABLES.map(([, , wbs], i) => ["d" + (i + 1), wbs.map((c) => "w-" + c)]))
	});
	function buildSampleValidation(resolveDel = (n) => "d" + (SAMPLE_DELIVERABLES.findIndex((x) => x[0] === n) + 1), resolveLeaf = (c) => "w-" + c) {
		const records = SAMPLE_DELIVERABLES.map(([name, criteria, wbs], i) => {
			const first = i === 0;
			return normalizeAcceptance({
				id: "va" + (i + 1),
				code: "VA-" + String(i + 1).padStart(2, "0"),
				delivId: resolveDel(name),
				wbsIds: wbs.map(resolveLeaf).filter(Boolean),
				criteria,
				presentedOn: first ? "2026-10-02" : "",
				presentedBy: first ? "Jefe de Ingeniería" : "",
				reviewer: first ? "Comité Directivo / Sponsor" : "Comité Directivo / Sponsor",
				evidence: first ? "Acta de aceptación del expediente técnico" : "",
				decision: first ? "aceptado_con_observaciones" : "pendiente",
				decidedOn: first ? "2026-10-09" : "",
				observations: first ? "Cuadros de columnas de los planos estructurales (NC-02): corregidos y reemitidos en la revisión B; sin más observaciones." : i === 1 ? "Licencia en trámite (observaciones de la municipalidad subsanadas el 2/11): se presenta al recibirla." : i === 2 ? "Se valida por etapas al terminar la estructura y cobertura (paquete 4.3); aún no se presenta." : i === 3 ? "Se presenta con los protocolos de prueba de tableros y redes (paquete 5.1)." : i === 4 ? "Aún sin paquetes propios en la EDT: se define con el Residente de Obra." : "Se presenta al final, con el dossier de calidad auditado (QC-17)."
			}, "va" + (i + 1));
		});
		return {
			records,
			asOf: SAMPLE_VALIDATION_AS_OF,
			idCounter: records.length + 1
		};
	}
	//#endregion
	//#region src/modules/scope-validation/main.ts
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
	var COV_LABEL = {
		sin_validacion: "sin validación",
		pendiente: "pendiente",
		aceptado: "aceptado",
		rechazado: "rechazado"
	};
	var COV_CLASS = {
		sin_validacion: "st-ambar",
		pendiente: "st-vacio",
		aceptado: "st-verde",
		rechazado: "st-rojo"
	};
	var ctx = null;
	var ctxDirty = true;
	function getCtx() {
		if (ctxDirty || !ctx) {
			const G = window.GPI, connected = !!(G && G.available() && G.active());
			let facts = {
				deliverables: [],
				leaves: [],
				roles: [],
				openNcr: {},
				leavesOf: {}
			};
			if (!connected) facts = sampleValidationFacts();
			else if (G && G.util) try {
				facts = gatherValidationFacts(G);
			} catch (e) {}
			ctx = {
				connected,
				facts
			};
			ctxDirty = false;
		}
		return ctx;
	}
	var data = blankValidation();
	var newId = () => "va" + data.idCounter++;
	var enumOpts = (list, labels, cur) => list.map((o) => `<option value="${o}"${o === cur ? " selected" : ""}>${esc(labels[o])}</option>`).join("");
	function recRow(r, f, flagged) {
		const delOpts = `<option value=""></option>` + f.deliverables.map((d) => `<option value="${esc(d.id)}"${d.id === r.delivId ? " selected" : ""}>${esc(d.code)} ${esc(d.name)}</option>`).join("") + (r.delivId && !f.deliverables.some((d) => d.id === r.delivId) ? `<option value="${esc(r.delivId)}" selected>(ya no existe)</option>` : "");
		const leafOpts = f.leaves.map((l) => `<option value="${esc(l.id)}"${r.wbsIds.indexOf(l.id) >= 0 ? " selected" : ""}>${esc(l.code)} ${esc(l.name)}</option>`).join("");
		return `<tr data-id="${esc(r.id)}"${flagged.has(r.id) ? " class=\"hasf\"" : ""}>
    <td style="width:70px"><input data-f="code" value="${esc(r.code)}" aria-label="Código"></td>
    <td style="min-width:170px"><select data-f="delivId" aria-label="Entregable">${delOpts}</select></td>
    <td style="min-width:170px"><select data-f="wbsIds" multiple aria-label="Paquetes de la EDT">${leafOpts}</select><button class="btn sm" data-leaves="${esc(r.id)}" style="margin-top:3px" title="Tomar los paquetes vinculados a este entregable en WBS Builder">↧ Paquetes del entregable</button></td>
    <td style="width:130px"><input data-f="presentedOn" type="date" value="${esc(r.presentedOn)}" aria-label="Presentado el"><input data-f="presentedBy" list="rolesList" value="${esc(r.presentedBy)}" placeholder="Presentó…" style="margin-top:3px" aria-label="Presentó"></td>
    <td style="min-width:140px"><input data-f="reviewer" list="rolesList" value="${esc(r.reviewer)}" aria-label="Quién acepta"></td>
    <td style="min-width:190px"><textarea data-f="criteria" aria-label="Criterio de aceptación">${esc(r.criteria)}</textarea><button class="btn sm" data-crit="${esc(r.id)}" style="margin-top:3px" title="Copiar el criterio de aceptación del Enunciado del Alcance">↧ Tomar del Enunciado</button></td>
    <td style="width:170px"><select data-f="decision" aria-label="Decisión">${enumOpts(DECISIONS, DECISION_LABEL, r.decision)}</select><input data-f="decidedOn" type="date" value="${esc(r.decidedOn)}" style="margin-top:3px" aria-label="Fecha de la decisión"></td>
    <td style="min-width:150px"><input data-f="evidence" value="${esc(r.evidence)}" aria-label="Evidencia"></td>
    <td style="min-width:190px"><textarea data-f="observations" aria-label="Observaciones">${esc(r.observations)}</textarea></td>
    <td><button class="btn sm danger" data-del="${esc(r.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
	}
	function render() {
		const f = getCtx().facts, root = $("mainArea"), flagged = new Set(validationFindings(data, f, todayLocalISO()).map((x) => x.recordId).filter((x) => !!x));
		root.innerHTML = `
    <div class="view-head"><h2>Validar el alcance</h2>
      <p>Validar es que <b>quien recibe</b> acepte formalmente cada entregable terminado, contra el criterio con que se definió. No es lo mismo que controlar la calidad: la calidad verifica que el entregable es <b>correcto</b>; la validación lo hace <b>aceptar</b>. Los entregables y sus criterios salen del Enunciado del Alcance; los defectos abiertos, del Plan de Calidad.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="card"><h3>Validaciones (${data.records.length})</h3>
      <div class="fd" style="max-width:260px;margin-bottom:8px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" value="${esc(data.asOf)}"></div>
      ${data.records.length ? `<table class="an" id="tblVal"><thead><tr><th>Cód.</th><th>Entregable</th><th>Paquetes</th><th>Presentado</th><th>Quién acepta</th><th>Criterio</th><th>Decisión</th><th>Evidencia</th><th>Observaciones</th><th></th></tr></thead><tbody>${data.records.map((r) => recRow(r, f, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>` : `<div class="empty-hint">Aún no hay validaciones. Agrega la primera con <b>＋ Validación</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Cobertura de entregables</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos</h3><div id="finds"></div></div>`;
		refreshMeta();
		wireMain();
	}
	function refreshMeta() {
		const f = getCtx().facts, today = todayLocalISO(), cov = coverage(data, f), fs = validationFindings(data, f, today), st = validationState(data, f, today), s = summary(data, f);
		$("kpis").innerHTML = `<div class="kpi"><b>${s.accepted}/${s.deliverables}</b><span>Entregables aceptados</span></div>
    <div class="kpi"><b>${s.pending}</b><span>Pendientes de decisión</span></div>
    <div class="kpi"><b>${s.rejected}</b><span>Rechazados</span></div>
    <div class="kpi"><b>${s.uncovered}</b><span>Sin ninguna validación</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado</span></div>`;
		$("cover").innerHTML = f.deliverables.length ? `<table class="an"><thead><tr><th>Entregable (Enunciado del Alcance)</th><th>Criterio de aceptación</th><th>Validaciones</th><th>Estado</th></tr></thead><tbody>${cov.map((r) => `<tr><td>${esc(r.deliverable.code)} ${esc(r.deliverable.name)}</td><td class="small">${r.deliverable.criteria.trim() ? esc(r.deliverable.criteria) : "<span class=\"muted\">sin criterio en el Enunciado</span>"}</td><td>${r.records.length ? r.records.map((x) => esc(x.code)).join(", ") : "—"}</td><td><span class="pill ${COV_CLASS[r.state]}">${COV_LABEL[r.state]}</span></td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No hay entregables: define los entregables y sus criterios de aceptación en el Enunciado del Alcance para poder validarlos.</p>`;
		const icon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		$("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.records.length ? "Sin hallazgos." : "Sin validaciones que revisar."}</p>`;
	}
	function wireMain() {
		const asOf = document.getElementById("asOf");
		if (asOf) asOf.addEventListener("change", () => {
			data.asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf.value) ? asOf.value : "";
			refreshMeta();
			save();
		});
		const t = document.getElementById("tblVal");
		if (!t) return;
		const upd = (el) => {
			const tr = el.closest("tr"), r = tr && data.records.find((x) => x.id === tr.getAttribute("data-id")), fld = el.getAttribute("data-f");
			if (!r || !fld) return;
			if (fld === "wbsIds") r.wbsIds = Array.from(el.selectedOptions).map((o) => o.value);
			else r[fld] = el.value;
			refreshMeta();
			save();
		};
		t.addEventListener("input", (e) => {
			const x = e.target;
			if (x.tagName !== "SELECT") upd(x);
		});
		t.addEventListener("change", (e) => upd(e.target));
		t.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
			data.records = data.records.filter((x) => x.id !== b.dataset.del);
			render();
			save();
			setStatus("Validación eliminada.");
		}));
		t.querySelectorAll("[data-crit]").forEach((b) => b.addEventListener("click", () => {
			const r = data.records.find((x) => x.id === b.dataset.crit), dv = r && getCtx().facts.deliverables.find((d) => d.id === r.delivId);
			if (!r || !dv) {
				setStatus("Elige primero el entregable.");
				return;
			}
			if (!dv.criteria.trim()) {
				setStatus("El entregable " + dv.code + " no tiene criterio de aceptación en el Enunciado del Alcance.");
				return;
			}
			r.criteria = dv.criteria;
			render();
			save();
			setStatus("Criterio copiado del Enunciado del Alcance (" + dv.code + ").");
		}));
		t.querySelectorAll("[data-leaves]").forEach((b) => b.addEventListener("click", () => {
			const r = data.records.find((x) => x.id === b.dataset.leaves), ids = r && (getCtx().facts.leavesOf || {})[r.delivId];
			if (!r || !r.delivId) {
				setStatus("Elige primero el entregable.");
				return;
			}
			if (!ids || !ids.length) {
				setStatus("Ningún elemento de la EDT está vinculado a ese entregable: vincúlalo en WBS Builder o elige los paquetes a mano.");
				return;
			}
			r.wbsIds = ids.slice();
			render();
			save();
			setStatus("Paquetes tomados de la EDT (" + ids.length + ").");
		}));
	}
	function addRecord() {
		const id = newId(), r = normalizeAcceptance({
			id,
			code: nextCode(data.records)
		}, id);
		data.records.push(r);
		render();
		save();
		setStatus(r.code + " creada: elige el entregable y registra la decisión.");
		const el = document.querySelector(`tr[data-id="${id}"] select`);
		if (el) el.focus();
	}
	function exportCsv() {
		const f = getCtx().facts, dn = (id) => {
			const d = f.deliverables.find((x) => x.id === id);
			return d ? d.code + " " + d.name : "";
		}, ln = (ids) => ids.map((i) => (f.leaves.find((l) => l.id === i) || { code: "" }).code).filter(Boolean).join("; "), q = (v) => "\"" + v.replace(/"/g, "\"\"") + "\"";
		const lines = [[
			"Código",
			"Entregable",
			"Paquetes",
			"Presentado el",
			"Presentó",
			"Quién acepta",
			"Criterio",
			"Decisión",
			"Fecha de la decisión",
			"Evidencia",
			"Observaciones"
		].map(q).join(",")];
		data.records.forEach((r) => lines.push([
			r.code,
			dn(r.delivId),
			ln(r.wbsIds),
			r.presentedOn,
			r.presentedBy,
			r.reviewer,
			r.criteria,
			DECISION_LABEL[r.decision],
			r.decidedOn,
			r.evidence,
			r.observations
		].map(q).join(",")));
		const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "validacion_del_alcance.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Validaciones exportadas como CSV.");
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
		if (!C.connected) return buildSampleValidation();
		const del = new Map(C.facts.deliverables.map((d) => [d.name.trim().toLowerCase(), d.id])), leaf = new Map(C.facts.leaves.map((l) => [l.code, l.id]));
		return buildSampleValidation((n) => del.get(n.trim().toLowerCase()) || "", (c) => leaf.get(c) || "");
	}
	function wireToolbar() {
		$("btnAdd").addEventListener("click", addRecord);
		$("btnCsv").addEventListener("click", exportCsv);
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará las validaciones actuales con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				ctxDirty = true;
				data = sampleForProject();
				render();
				save();
				const sin = getCtx().connected ? data.records.filter((r) => !r.delivId).length : 0;
				setStatus("Caso de ejemplo cargado." + (sin ? " " + sin + " validación(es) no encontraron su entregable en el Enunciado del Alcance del proyecto: carga el ejemplo en Enunciado del Alcance (o elige tus entregables) para enlazarlas." : ""));
			});
		});
		$("btnClear").addEventListener("click", () => {
			showConfirm("Esto borrará todas las validaciones. ¿Continuar?", "Nueva validación").then((ok) => {
				if (ok) {
					data = blankValidation();
					render();
					save();
					setStatus("Validación nueva iniciada.");
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la validación del alcance aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			records: data.records,
			asOf: data.asOf,
			idCounter: data.idCounter
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("scopeValidation");
			ctxDirty = true;
			const mod = p.modules && p.modules.scopeValidation;
			if (mod && typeof mod === "object") {
				data = normalizeValidation(mod);
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = blankValidation();
				render();
				setStatus("Proyecto sin validaciones todavía. Agrega la primera, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "scopeValidation", "La validación del alcance", payload(), null, session, {
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
			accent: "#5646c9",
			hover: "#6c5ce7"
		});
	}
	wireToolbar();
	if (!(window.GPI && window.GPI.available() && window.GPI.active())) {
		data = buildSampleValidation();
		ctxDirty = true;
		render();
	} else render();
	//#endregion
})();
