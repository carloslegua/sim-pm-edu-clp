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
	function quadrantOf(power, interest, threshold = 50) {
		const P = power >= threshold, I = interest >= threshold;
		return P && I ? "cerca" : P ? "satisfecho" : I ? "informado" : "monitorear";
	}
	//#endregion
	//#region src/shared/plan-facts.ts
	var rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var num = (v) => {
		const n = Number(v);
		return isFinite(n) ? n : 0;
	};
	function gatherCommFacts(G) {
		return {
			stakeholders: (Array.isArray(rec(G.getModule("stakeholders")).stakeholders) ? rec(G.getModule("stakeholders")).stakeholders.map(rec) : []).map((s) => ({
				id: String(s.id),
				name: String(s.name || s.id),
				quadrant: quadrantOf(num(s.power), num(s.interest)),
				engCurrent: s.engCurrent === null || s.engCurrent === void 0 ? null : num(s.engCurrent),
				engDesired: s.engDesired === null || s.engDesired === void 0 ? null : num(s.engDesired)
			})),
			roles: Array.from(new Set(G.util.obsNodes(G.getModule("obs")).map((n) => (n.role || "").trim()).filter(Boolean)))
		};
	}
	//#endregion
	//#region src/shared/local-date.ts
	function todayLocalISO(d = /* @__PURE__ */ new Date()) {
		const p = (n) => (n < 10 ? "0" : "") + n;
		return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
	}
	//#endregion
	//#region src/shared/comms-plan.ts
	var FREQUENCIES = [
		"Única vez",
		"Diaria",
		"Semanal",
		"Quincenal",
		"Mensual",
		"Por hito",
		"Por evento"
	];
	var METHODS = [
		"Reunión presencial",
		"Videollamada",
		"Informe escrito",
		"Correo electrónico",
		"Plataforma o tablero",
		"Comunicado o nota de prensa",
		"Presentación"
	];
	var HIGH_FREQ = ["Diaria", "Semanal"];
	var LOG_STATUSES = [
		"emitida",
		"reprogramada",
		"omitida"
	];
	var LOG_STATUS_LABEL = {
		emitida: "Emitida",
		reprogramada: "Reprogramada",
		omitida: "Omitida"
	};
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var strs = (v) => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
	var blankPlan = () => ({
		escalation: "",
		restrictions: "",
		review: ""
	});
	function normalizeItem(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {}, id = str(x.id) || fallbackId;
		return {
			id,
			code: str(x.code) || id,
			info: str(x.info),
			purpose: str(x.purpose),
			stkIds: strs(x.stkIds),
			audience: str(x.audience),
			sender: str(x.sender),
			frequency: str(x.frequency),
			method: str(x.method),
			channel: str(x.channel),
			storage: str(x.storage),
			notes: str(x.notes)
		};
	}
	function normalizeLog(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {}, id = str(x.id) || fallbackId;
		return {
			id,
			code: str(x.code) || id,
			itemId: str(x.itemId),
			date: str(x.date),
			status: LOG_STATUSES.indexOf(x.status) >= 0 ? x.status : "emitida",
			by: str(x.by),
			summary: str(x.summary),
			evidence: str(x.evidence)
		};
	}
	function normalizeComms(raw) {
		const x = raw && typeof raw === "object" ? raw : {}, p = x.plan && typeof x.plan === "object" ? x.plan : {};
		const items = (Array.isArray(x.items) ? x.items : []).map((o, i) => normalizeItem(o, "cm" + (i + 1)));
		const log = (Array.isArray(x.log) ? x.log : []).map((o, i) => normalizeLog(o, "lg" + (i + 1)));
		return {
			items,
			plan: {
				escalation: str(p.escalation),
				restrictions: str(p.restrictions),
				review: str(p.review)
			},
			idCounter: Number(x.idCounter) || items.length + log.length + 1,
			log,
			asOf: /^\d{4}-\d{2}-\d{2}$/.test(str(x.asOf)) ? str(x.asOf) : ""
		};
	}
	var blankItem = (id, code) => normalizeItem({
		id,
		code
	}, id);
	function nextLogCode(log) {
		let max = 0;
		log.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "LG-" + String(max + 1).padStart(2, "0");
	}
	var isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	var asOfOf = (d, today) => isoOk(d.asOf) ? d.asOf : today;
	var dayGap = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
	var PERIOD_DAYS = {
		Diaria: 1,
		Semanal: 7,
		Quincenal: 15,
		Mensual: 30
	};
	function nextCode(items) {
		let max = 0;
		items.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "CM-" + String(max + 1).padStart(2, "0");
	}
	var channelsFor = (n) => n > 1 ? n * (n - 1) / 2 : 0;
	function coverage(items, f) {
		return f.stakeholders.map((s) => ({
			stk: s,
			items: items.filter((c) => c.stkIds.indexOf(s.id) >= 0),
			gap: s.engCurrent !== null && s.engDesired !== null ? s.engDesired - s.engCurrent : null
		}));
	}
	function commFindings(d, f, today0 = "") {
		const today = asOfOf(d, today0), out = [], F = (code, severity, itemId, text) => {
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
		coverage(d.items, f).forEach((r) => {
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
		const itemBy = new Map(d.items.map((c) => [c.id, c])), emitted = d.log.filter((l) => l.status === "emitida" && isoOk(l.date));
		d.log.forEach((l) => {
			const w = l.code + (itemBy.has(l.itemId) ? " (" + itemBy.get(l.itemId).code + ")" : "");
			if (!itemBy.has(l.itemId)) F("M13", "aviso", null, w + ": no corresponde a ninguna comunicación de la matriz" + (l.itemId ? " (ya no existe)" : "") + ": lo que se comunica sin estar planificado no tiene destinatarios ni propósito acordados.");
			if (l.status !== "emitida" && !l.summary.trim()) F("M14", "aviso", null, w + ": está " + LOG_STATUS_LABEL[l.status].toLowerCase() + " y no dice por qué: una comunicación que no se hizo necesita su motivo y, si se reprograma, su nueva fecha.");
			if (l.status === "emitida" && (!isoOk(l.date) || !l.evidence.trim())) F("M14", "info", null, w + ": emitida sin " + (!isoOk(l.date) ? "fecha" : "evidencia") + " registrada: sin evidencia no se puede demostrar que se comunicó.");
		});
		if (isoOk(today) && d.log.length) {
			d.items.filter((c) => PERIOD_DAYS[c.frequency] !== void 0).forEach((c) => {
				const mine = emitted.filter((l) => l.itemId === c.id).map((l) => l.date).sort(), last = mine.length ? mine[mine.length - 1] : "", limit = PERIOD_DAYS[c.frequency] * 2;
				if (!last || dayGap(last, today) > limit) F("M16", "aviso", c.id, c.code + " «" + c.info.trim().slice(0, 50) + "»: es " + c.frequency.toLowerCase() + " y " + (last ? "la última emitida fue el " + last + " (hace " + dayGap(last, today) + " días)" : "no hay ninguna emitida") + " a la fecha de corte " + today + ": el plan promete un ritmo que la ejecución no cumple.");
			});
			coverage(d.items, f).forEach((r) => {
				if (r.stk.quadrant !== "cerca") return;
				const ids = new Set(r.items.map((c) => c.id)), mine = emitted.filter((l) => ids.has(l.itemId)).map((l) => l.date).sort(), last = mine.length ? mine[mine.length - 1] : "";
				if (!last || dayGap(last, today) > 45) F("M15", "aviso", null, "«" + r.stk.name + "» es un interesado a gestionar de cerca y " + (last ? "su última comunicación emitida fue el " + last + " (hace " + dayGap(last, today) + " días)" : "no se le ha emitido ninguna comunicación") + ": supera los 45 días de silencio.");
			});
		}
		return out;
	}
	function commState(d, f, today = "") {
		if (!d.items.length) return "vacio";
		const fs = commFindings(d, f, today);
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
	var SAMPLE_COMM_STAKEHOLDERS = [
		[
			"Gerencia General DISTRIB+",
			4,
			5
		],
		[
			"Banco financista",
			3,
			4
		],
		[
			"Constructora principal",
			4,
			4
		],
		[
			"Municipalidad de Lurín",
			3,
			4
		],
		[
			"OEFA / Autoridad ambiental",
			3,
			3
		],
		[
			"SUNAFIL",
			3,
			3
		],
		[
			"Junta de vecinos de Lurín",
			2,
			4
		],
		[
			"Sindicato de construcción civil",
			2,
			4
		],
		[
			"Futuros operarios del almacén",
			1,
			4
		],
		[
			"Clientes / distribuidores",
			3,
			4
		],
		[
			"Proveedor de estructuras",
			3,
			4
		],
		[
			"Prensa / medios locales",
			1,
			3
		]
	].map(([name, c, d], i) => ({
		id: "s" + (i + 1),
		name,
		quadrant: null,
		engCurrent: c,
		engDesired: d
	}));
	var SAMPLE_COMM_ROLES = SAMPLE_OBS_ROLES;
	var sampleCommFacts = () => ({
		stakeholders: SAMPLE_COMM_STAKEHOLDERS.map((s) => ({ ...s })),
		roles: SAMPLE_COMM_ROLES.slice()
	});
	var ROWS = [
		[
			"CM-01",
			"Avance del proyecto y decisiones pendientes",
			"Mantener alineado al sponsor y obtener las decisiones de reserva de gestión y de líneas base",
			["s1"],
			"Director de Proyecto",
			"Quincenal",
			"Reunión presencial",
			"Reunión de avance con agenda fija",
			"Acta de reunión archivada en la carpeta del proyecto"
		],
		[
			"CM-02",
			"Informe de avance físico-financiero (valor ganado)",
			"Sustentar cada desembolso con el avance real y el pronóstico de costo",
			["s2", "s1"],
			"Director de Proyecto",
			"Mensual",
			"Informe escrito",
			"Informe mensual del paquete 1.3",
			"Informe firmado y enviado antes del desembolso"
		],
		[
			"CM-03",
			"Estado del trámite de la licencia de edificación (paquete 2.4)",
			"Anticipar observaciones y evitar el retraso del inicio de obra (riesgo R-01)",
			["s4"],
			"Asesoría Legal",
			"Semanal",
			"Reunión presencial",
			"Reunión técnica y seguimiento del expediente",
			"Cargo de ingreso y acta de cada reunión"
		],
		[
			"CM-04",
			"Plan de manejo de tráfico y ruido; canal de reclamos",
			"Reducir la oposición vecinal y atender los reclamos a tiempo (riesgo R-07)",
			["s7"],
			"Residente de Obra",
			"Mensual",
			"Reunión presencial",
			"Mesa de diálogo con la comunidad",
			"Acta de la mesa y libro de reclamos"
		],
		[
			"CM-05",
			"Cumplimiento del acuerdo laboral, jornadas y seguridad",
			"Prevenir paros y acordar la contratación local (riesgo R-05)",
			["s8"],
			"Asesoría Legal",
			"Quincenal",
			"Reunión presencial",
			"Reunión de seguimiento con el sindicato",
			"Acta firmada por ambas partes"
		],
		[
			"CM-06",
			"Avance de fabricación y fechas de entrega de las estructuras (paquete 3.1)",
			"Detectar a tiempo un retraso de fabricación (riesgo R-08)",
			["s11"],
			"Jefe de Logística",
			"Semanal",
			"Videollamada",
			"Seguimiento semanal con el proveedor",
			"Reporte de fabricación semanal"
		],
		[
			"CM-07",
			"Talleres de capacitación y visitas guiadas a obra",
			"Preparar a los futuros operarios y subir su compromiso durante la puesta en marcha (paquetes 5.x)",
			["s9"],
			"Director de Proyecto",
			"Por hito",
			"Reunión presencial",
			"Talleres y visitas guiadas",
			"Registro de asistencia"
		],
		[
			"CM-08",
			"Comunicado de hitos del proyecto y encuesta de necesidades logísticas",
			"Mantener informados a los clientes y recoger sus necesidades del nuevo almacén",
			["s10"],
			"Director de Proyecto",
			"Por hito",
			"Correo electrónico",
			"Comunicado por hito",
			"Copia del comunicado y de las respuestas"
		],
		[
			"CM-09",
			"Notas de prensa de inicio y cierre",
			"Dar cobertura al proyecto y evitar versiones no oficiales",
			["s12"],
			"Director de Proyecto",
			"Por hito",
			"Comunicado o nota de prensa",
			"Nota de prensa al inicio y al cierre",
			"Nota publicada archivada"
		],
		[
			"CM-10",
			"Reunión semanal de obra: avance, interferencias y pendientes",
			"Coordinar la ejecución con la constructora y cerrar los pendientes",
			["s3"],
			"Residente de Obra",
			"Semanal",
			"Reunión presencial",
			"Reunión de coordinación en obra",
			"Acta semanal de obra"
		],
		[
			"CM-11",
			"Cumplimiento ambiental y de seguridad y salud en el trabajo",
			"Evidenciar el cumplimiento ante los fiscalizadores y prevenir sanciones",
			["s5", "s6"],
			"Control de Calidad",
			"Mensual",
			"Informe escrito",
			"Informe mensual de cumplimiento",
			"Informe con cargo de recepción"
		]
	];
	var LOG = [
		[
			"LG-01",
			"CM-01",
			"2026-10-16",
			"emitida",
			"Director de Proyecto",
			"Avance: hitos de ingeniería cerrados; pedido al sponsor de la decisión sobre la reserva de gestión.",
			"Acta de reunión del 16/10"
		],
		[
			"LG-02",
			"CM-01",
			"2026-10-30",
			"emitida",
			"Director de Proyecto",
			"Avance de Procura y estado de la licencia; se aprueba mantener la línea base LB-1.",
			"Acta de reunión del 30/10"
		],
		[
			"LG-03",
			"CM-02",
			"2026-10-30",
			"emitida",
			"Director de Proyecto",
			"Informe de valor ganado al 30/10: SPI 0,93 y CPI 0,98; sustenta el desembolso de octubre.",
			"Informe firmado y cargo del banco"
		],
		[
			"LG-04",
			"CM-03",
			"2026-10-27",
			"emitida",
			"Asesoría Legal",
			"Observaciones de la municipalidad al expediente de la licencia; plazo de subsanación de 10 días.",
			"Cargo de ingreso y acta de reunión técnica"
		],
		[
			"LG-05",
			"CM-03",
			"2026-11-02",
			"emitida",
			"Asesoría Legal",
			"Subsanación presentada; se espera la resolución.",
			"Cargo de ingreso 2026-11-02"
		],
		[
			"LG-06",
			"CM-04",
			"2026-10-15",
			"emitida",
			"Residente de Obra",
			"Mesa de diálogo: plan de tráfico y ruido para el inicio del movimiento de tierras.",
			"Acta de la mesa y libro de reclamos"
		],
		[
			"LG-07",
			"CM-05",
			"2026-10-22",
			"emitida",
			"Asesoría Legal",
			"Seguimiento del acuerdo laboral y cupo de contratación local.",
			"Acta firmada por ambas partes"
		],
		[
			"LG-08",
			"CM-05",
			"2026-11-05",
			"reprogramada",
			"Asesoría Legal",
			"La reunión del 5/11 se pasa al 9/11 por la agenda del sindicato.",
			""
		],
		[
			"LG-09",
			"CM-06",
			"2026-10-30",
			"emitida",
			"Jefe de Logística",
			"Lote 2 de estructuras con soldadura fuera de tolerancia: reproceso en fábrica y nueva fecha de entrega (NC-01).",
			"Reporte de fabricación semanal"
		],
		[
			"LG-10",
			"CM-10",
			"2026-10-29",
			"emitida",
			"Residente de Obra",
			"Coordinación con la constructora del inicio de movimiento de tierras y pendientes de Procura.",
			"Acta semanal de obra"
		],
		[
			"LG-11",
			"CM-11",
			"2026-10-28",
			"emitida",
			"Control de Calidad",
			"Informe mensual de cumplimiento ambiental y de seguridad: sin observaciones.",
			"Informe con cargo de recepción"
		],
		[
			"LG-12",
			"CM-08",
			"2026-08-06",
			"emitida",
			"Director de Proyecto",
			"Comunicado del hito «Aprobación del Plan de Gestión»: línea base inicial aprobada.",
			"Copia del comunicado"
		]
	];
	function buildSampleComms() {
		const items = ROWS.map(([code, info, purpose, stkIds, sender, frequency, method, channel, storage], i) => normalizeItem({
			id: "cm" + (i + 1),
			code,
			info,
			purpose,
			stkIds,
			audience: "",
			sender,
			frequency,
			method,
			channel,
			storage
		}, "cm" + (i + 1)));
		const plan = {
			...blankPlan(),
			escalation: "Un asunto sin respuesta en 48 horas pasa del responsable de la comunicación al Director de Proyecto; si afecta una línea base, a la Gerencia General (sponsor) en la siguiente reunión quincenal o antes si es urgente.",
			restrictions: "Las cifras de costo y las negociaciones con el sindicato y la municipalidad son de circulación restringida (solo sponsor, Director de Proyecto y Asesoría Legal). Toda comunicación a la prensa y a la comunidad la emite únicamente el Director de Proyecto. Idioma: español.",
			review: "La matriz se revisa cada mes con el informe de avance y siempre que cambie el registro de interesados o se apruebe un cambio que afecte a un interesado."
		};
		const itemId = (code) => "cm" + (ROWS.findIndex((r) => r[0] === code) + 1);
		const log = LOG.map(([code, cm, date, status, by, summary, evidence], i) => normalizeLog({
			id: "lg" + (i + 1),
			code,
			itemId: itemId(cm),
			date,
			status,
			by,
			summary,
			evidence
		}, "lg" + (i + 1)));
		return {
			items,
			plan,
			log,
			asOf: "2026-11-03",
			idCounter: items.length + log.length + 1
		};
	}
	//#endregion
	//#region src/modules/comms/main.ts
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
	var QUAD = {
		cerca: "Gestionar de cerca",
		satisfecho: "Mantener satisfecho",
		informado: "Mantener informado",
		monitorear: "Monitorear"
	};
	var ctx = null;
	var ctxDirty = true;
	function getCtx() {
		if (ctxDirty || !ctx) {
			const G = window.GPI, connected = !!(G && G.available() && G.active());
			let facts = {
				stakeholders: [],
				roles: []
			};
			if (!connected) facts = sampleCommFacts();
			else if (G && G.util) try {
				facts = gatherCommFacts(G);
			} catch (e) {}
			ctx = {
				connected,
				facts
			};
			ctxDirty = false;
		}
		return ctx;
	}
	var data = normalizeComms(null);
	var byId = (id) => data.items.find((c) => c.id === id);
	var opts = (list, cur) => `<option value=""></option>` + list.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("") + (cur && list.indexOf(cur) < 0 ? `<option selected>${esc(cur)}</option>` : "");
	function rowHtml(c, f, flagged) {
		const stkOpts = f.stakeholders.map((s) => `<option value="${esc(s.id)}"${c.stkIds.indexOf(s.id) >= 0 ? " selected" : ""}>${esc(s.name)}</option>`).join("");
		const missing = c.stkIds.filter((i) => !f.stakeholders.some((s) => s.id === i));
		return `<tr data-id="${esc(c.id)}"${flagged.has(c.id) ? " class=\"hasf\"" : ""}>
    <td style="width:74px"><input data-f="code" value="${esc(c.code)}" aria-label="Código"></td>
    <td style="min-width:190px"><textarea data-f="info" aria-label="Información">${esc(c.info)}</textarea></td>
    <td style="min-width:190px"><textarea data-f="purpose" aria-label="Propósito">${esc(c.purpose)}</textarea></td>
    <td style="min-width:170px"><select data-f="stkIds" multiple aria-label="Destinatarios">${stkOpts}${missing.map((i) => `<option value="${esc(i)}" selected>(ya no existe: ${esc(i)})</option>`).join("")}</select><input data-f="audience" placeholder="Otra audiencia…" value="${esc(c.audience)}" style="margin-top:3px"></td>
    <td style="min-width:140px"><input data-f="sender" list="rolesList" value="${esc(c.sender)}" aria-label="Emisor"></td>
    <td style="width:110px"><select data-f="frequency" aria-label="Frecuencia">${opts(FREQUENCIES, c.frequency)}</select></td>
    <td style="width:150px"><select data-f="method" aria-label="Medio">${opts(METHODS, c.method)}</select></td>
    <td style="min-width:140px"><input data-f="channel" value="${esc(c.channel)}" aria-label="Canal o formato"></td>
    <td style="min-width:150px"><input data-f="storage" value="${esc(c.storage)}" aria-label="Registro"></td>
    <td><button class="btn sm danger" data-del="${esc(c.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
	}
	function logRow(l) {
		return `<tr data-lk="log" data-id="${esc(l.id)}">
    <td style="width:74px"><input data-lf="code" value="${esc(l.code)}" aria-label="Código"></td>
    <td style="min-width:170px"><select data-lf="itemId" aria-label="Comunicación del plan">${`<option value=""></option>` + data.items.map((c) => `<option value="${esc(c.id)}"${c.id === l.itemId ? " selected" : ""}>${esc(c.code)} ${esc(c.info.slice(0, 45))}</option>`).join("") + (l.itemId && !data.items.some((c) => c.id === l.itemId) ? `<option value="${esc(l.itemId)}" selected>(ya no existe)</option>` : "")}</select></td>
    <td style="width:130px"><input data-lf="date" type="date" value="${esc(l.date)}" aria-label="Fecha"></td>
    <td style="width:130px"><select data-lf="status" aria-label="Estado">${LOG_STATUSES.map((s) => `<option value="${s}"${s === l.status ? " selected" : ""}>${LOG_STATUS_LABEL[s]}</option>`).join("")}</select></td>
    <td style="min-width:130px"><input data-lf="by" list="rolesList" value="${esc(l.by)}" aria-label="Emitió"></td>
    <td style="min-width:200px"><textarea data-lf="summary" aria-label="Qué se comunicó o motivo">${esc(l.summary)}</textarea></td>
    <td style="min-width:150px"><input data-lf="evidence" value="${esc(l.evidence)}" aria-label="Evidencia"></td>
    <td><button class="btn sm danger" data-dellog="${esc(l.id)}" title="Eliminar" aria-label="Eliminar">✕</button></td></tr>`;
	}
	function render() {
		const f = getCtx().facts, root = $("mainArea");
		const flagged = new Set(commFindings(data, f, todayLocalISO()).map((x) => x.itemId).filter((x) => !!x));
		root.innerHTML = `
    <div class="view-head"><h2>Matriz de comunicaciones</h2>
      <p>Cada fila responde: <b>qué</b> información, <b>para qué</b>, <b>a quién</b>, <b>quién</b> la emite, <b>cada cuánto</b>, <b>por qué medio</b> y <b>dónde queda el registro</b>. Los destinatarios salen de Stakeholder Studio y los emisores del OBS. Abajo se revisa que a cada interesado le llegue lo que su estrategia exige.</p></div>
    <div class="kpis" id="kpis"></div>
    <div class="card"><h3>Comunicaciones (${data.items.length})</h3>
      ${data.items.length ? `<table class="an" id="matrix"><thead><tr><th>Cód.</th><th>Información</th><th>Propósito</th><th>Destinatarios</th><th>Emisor</th><th>Frecuencia</th><th>Medio</th><th>Canal / formato</th><th>Registro</th><th></th></tr></thead><tbody>${data.items.map((c) => rowHtml(c, f, flagged)).join("")}</tbody></table>
      <datalist id="rolesList">${f.roles.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>` : `<div class="empty-hint">Aún no hay comunicaciones. Agrega la primera con <b>＋ Nueva comunicación</b>, o usa <b>Cargar ejemplo</b> para explorar el caso DISTRIB+.</div>`}
    </div>
    <div class="card"><h3>Ejecución: bitácora de comunicaciones emitidas (${data.log.length})</h3><p class="hint">Lo que realmente se comunicó (o se reprogramó u omitió): qué comunicación del plan, cuándo, quién y dónde queda la evidencia. Contra la fecha de corte se avisa la comunicación periódica sin emitir.</p>
      <div class="fd" style="max-width:260px"><label for="asOf">Fecha de corte del seguimiento (vacía = hoy)</label><input id="asOf" type="date" data-p="asOf" value="${esc(data.asOf)}"></div>
      ${data.log.length ? `<table class="an" id="tblLog"><thead><tr><th>Cód.</th><th>Comunicación del plan</th><th>Fecha</th><th>Estado</th><th>Emitió</th><th>Qué se comunicó / motivo</th><th>Evidencia</th><th></th></tr></thead><tbody>${data.log.map((l) => logRow(l)).join("")}</tbody></table>` : `<div class="empty-hint">Sin comunicaciones registradas. Cuando empiece la ejecución, registra la primera con <b>＋ Comunicación emitida</b>.</div>`}</div>
    <div class="grid2">
      <div class="card fd"><h3>Escalamiento</h3><label for="planEscalation">Ruta y plazos para los asuntos sin respuesta</label><textarea id="planEscalation" data-p="escalation">${esc(data.plan.escalation)}</textarea></div>
      <div class="card fd"><h3>Restricciones y confidencialidad</h3><label for="planRestrictions">Quién puede decir qué, idioma, información restringida</label><textarea id="planRestrictions" data-p="restrictions">${esc(data.plan.restrictions)}</textarea></div>
      <div class="card fd"><h3>Actualización del plan</h3><label for="planReview">Cuándo y cómo se revisa la matriz</label><textarea id="planReview" data-p="review">${esc(data.plan.review)}</textarea></div>
    </div>
    <div class="card"><h3>Cobertura de interesados</h3><div id="cover"></div></div>
    <div class="card"><h3>Hallazgos del plan</h3><div id="finds"></div></div>`;
		refreshMeta();
		wireMain();
	}
	function refreshMeta() {
		const f = getCtx().facts, cov = coverage(data.items, f), fs = commFindings(data, f, todayLocalISO()), st = commState(data, f, todayLocalISO());
		const covered = cov.filter((r) => r.items.length).length;
		$("kpis").innerHTML = `<div class="kpi"><b>${data.items.length}</b><span>Comunicaciones planificadas</span></div>
    <div class="kpi"><b>${covered}/${f.stakeholders.length}</b><span>Interesados con comunicación</span></div>
    <div class="kpi"><b>${fs.length}</b><span>Hallazgos</span></div>
    <div class="kpi"><b>${channelsFor(f.stakeholders.length)}</b><span>Canales potenciales entre ${f.stakeholders.length} interesados (n(n−1)/2)</span></div>
    <div class="kpi"><span class="pill st-${st}">${STATE_LABEL[st]}</span><span style="display:block;margin-top:6px">Estado del plan</span></div>`;
		$("cover").innerHTML = f.stakeholders.length ? `<table class="an"><thead><tr><th>Interesado</th><th>Estrategia</th><th>Compromiso</th><th>Comunicaciones</th></tr></thead><tbody>${cov.map((r) => `<tr><td>${esc(r.stk.name)}</td><td>${r.stk.quadrant ? esc(QUAD[r.stk.quadrant]) : "<span class=\"muted\">—</span>"}</td><td>${r.stk.engCurrent !== null || r.stk.engDesired !== null ? esc(levelName(r.stk.engCurrent)) + " → " + esc(levelName(r.stk.engDesired)) : "—"}</td><td>${r.items.length ? r.items.map((c) => esc(c.code)).join(", ") : "<span class=\"pill st-ambar\">ninguna</span>"}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No hay interesados registrados: define quiénes son en Stakeholder Studio para revisar la cobertura.</p>`;
		const icon = {
			riesgo: "⛔",
			aviso: "⚠",
			info: "ℹ"
		};
		$("finds").innerHTML = fs.length ? `<ul class="finds">${fs.map((x) => `<li class="${x.severity}"><b class="cd">${x.code} ${icon[x.severity]}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted small">${data.items.length ? "Sin hallazgos." : "Sin comunicaciones que revisar."}</p>`;
	}
	function wireMain() {
		const m = document.getElementById("matrix");
		const upd = (el) => {
			const tr = el.closest("tr"), c = tr && byId(tr.getAttribute("data-id") || ""), f = el.getAttribute("data-f");
			if (!c || !f) return;
			if (f === "stkIds") c.stkIds = Array.from(el.selectedOptions).map((o) => o.value);
			else c[f] = el.value;
			refreshMeta();
			save();
		};
		if (m) {
			m.addEventListener("input", (e) => {
				const t = e.target;
				if (t.tagName !== "SELECT") upd(t);
			});
			m.addEventListener("change", (e) => upd(e.target));
			m.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
				data.items = data.items.filter((c) => c.id !== b.dataset.del);
				render();
				save();
				setStatus("Comunicación eliminada.");
			}));
		}
		document.querySelectorAll("[data-p]").forEach((t) => t.addEventListener("input", () => {
			const k = t.dataset.p;
			if (k === "asOf") data.asOf = t.value;
			else data.plan[k] = t.value;
			refreshMeta();
			save();
		}));
		const lg = document.getElementById("tblLog");
		if (lg) {
			const updLog = (el) => {
				const tr = el.closest("tr"), l = tr && data.log.find((x) => x.id === tr.getAttribute("data-id")), f = el.getAttribute("data-lf");
				if (!l || !f) return;
				l[f] = el.value;
				refreshMeta();
				save();
			};
			lg.addEventListener("input", (e) => {
				const t = e.target;
				if (t.tagName !== "SELECT") updLog(t);
			});
			lg.addEventListener("change", (e) => updLog(e.target));
			lg.querySelectorAll("[data-dellog]").forEach((b) => b.addEventListener("click", () => {
				data.log = data.log.filter((l) => l.id !== b.dataset.dellog);
				render();
				save();
				setStatus("Registro eliminado.");
			}));
		}
	}
	function addItem() {
		const id = "cm" + data.idCounter++, c = blankItem(id, nextCode(data.items));
		data.items.push(c);
		render();
		save();
		setStatus(c.code + " creada: completa qué, para qué, a quién y cada cuánto.");
		const row = document.querySelector(`tr[data-id="${id}"] textarea`);
		if (row) row.focus();
	}
	function addLog() {
		const id = "lg" + data.idCounter++, l = normalizeLog({
			id,
			code: nextLogCode(data.log),
			date: todayLocalISO()
		}, id);
		data.log.push(l);
		render();
		save();
		setStatus(l.code + " creada: elige la comunicación del plan y registra la evidencia.");
		const row = document.querySelector(`tr[data-id="${id}"] select`);
		if (row) row.focus();
	}
	function exportCsv() {
		const f = getCtx().facts, name = (id) => (f.stakeholders.find((s) => s.id === id) || { name: id }).name, q = (v) => "\"" + v.replace(/"/g, "\"\"") + "\"";
		const lines = [[
			"Código",
			"Información",
			"Propósito",
			"Destinatarios",
			"Emisor",
			"Frecuencia",
			"Medio",
			"Canal",
			"Registro"
		].map(q).join(",")];
		data.items.forEach((c) => lines.push([
			c.code,
			c.info,
			c.purpose,
			c.stkIds.map(name).concat(c.audience ? [c.audience] : []).join("; "),
			c.sender,
			c.frequency,
			c.method,
			c.channel,
			c.storage
		].map(q).join(",")));
		const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "matriz_de_comunicaciones.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Matriz exportada como CSV.");
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
		$("btnAddLog").addEventListener("click", addLog);
		$("btnCsv").addEventListener("click", exportCsv);
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará la matriz actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				data = buildSampleComms();
				render();
				save();
				const C = getCtx();
				setStatus("Caso de ejemplo cargado." + ((C.connected ? data.items.flatMap((c) => c.stkIds).filter((i, k, a) => a.indexOf(i) === k && !C.facts.stakeholders.some((s) => s.id === i)) : []).length ? " Los destinatarios (s1…s12) se enlazan con los interesados del ejemplo de Stakeholder Studio: cárgalo allí (o elige tus interesados) para que coincidan." : ""));
			});
		});
		$("btnClear").addEventListener("click", () => {
			showConfirm("Esto borrará toda la matriz de comunicaciones y las reglas del plan. ¿Continuar?", "Nueva matriz").then((ok) => {
				if (ok) {
					data = normalizeComms(null);
					render();
					save();
					setStatus("Matriz nueva iniciada.");
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar la matriz de comunicaciones aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			items: data.items,
			plan: data.plan,
			idCounter: data.idCounter,
			log: data.log,
			asOf: data.asOf
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("comms");
			ctxDirty = true;
			const mod = p.modules && p.modules.comms;
			if (mod && typeof mod === "object") {
				data = normalizeComms(mod);
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = normalizeComms(null);
				render();
				setStatus("Proyecto sin plan de comunicaciones todavía. Agrega la primera comunicación, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "comms", "El plan de comunicaciones", payload(), null, session, {
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
			accent: "#1f63d1",
			hover: "#3a86ff"
		});
	}
	wireToolbar();
	if (!(window.GPI && window.GPI.available() && window.GPI.active())) {
		data = buildSampleComms();
		ctxDirty = true;
		render();
	} else render();
	//#endregion
})();
