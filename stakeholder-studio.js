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
	function engagementGap(s) {
		const c = asLevel(s.engCurrent), d = asLevel(s.engDesired);
		return c && d ? d - c : null;
	}
	function engagementPriority(s) {
		const g = engagementGap(s);
		if (g === null || g <= 0) return null;
		const score = Math.round(g * (Math.max(0, Math.min(100, Number(s.power) || 0)) / 100) * 100) / 100;
		return {
			score,
			level: score >= 1.5 ? "alta" : score >= .75 ? "media" : "baja"
		};
	}
	function daysBetween(fromIso, toIso) {
		const a = Date.parse(fromIso + "T12:00:00Z"), b = Date.parse(toIso + "T12:00:00Z");
		return isFinite(a) && isFinite(b) ? Math.round((b - a) / 864e5) : null;
	}
	function engagementFindings(s, today, staleDays = 90) {
		const out = [];
		const c = asLevel(s.engCurrent), d = asLevel(s.engDesired), q = quadrantOf(Number(s.power) || 0, Number(s.interest) || 0);
		const key = q === "cerca" || q === "satisfecho";
		if (!c || !d) {
			out.push({
				code: "E1",
				severity: key ? "aviso" : "info",
				text: "Sin evaluar" + (!c && !d ? "" : !c ? " el compromiso actual" : " el compromiso deseado") + (key ? " (interesado con poder alto: evaluarlo primero)" : "")
			});
			return out;
		}
		const g = d - c;
		if (g < 0) out.push({
			code: "E2",
			severity: "info",
			text: "El nivel deseado es menor que el actual: confirmar que es intencional (¿sobre-involucramiento?)."
		});
		if (g >= 1 && !String(s.engStrategy || "").trim()) out.push({
			code: "E3",
			severity: g >= 2 ? "riesgo" : "aviso",
			text: "Hay una brecha de " + g + " nivel(es) y no hay estrategia para cerrarla."
		});
		if (g >= 1 && !String(s.engOwner || "").trim()) out.push({
			code: "E4",
			severity: "aviso",
			text: "La brecha no tiene un responsable asignado."
		});
		if (q === "cerca" && d < 4) out.push({
			code: "E5",
			severity: "aviso",
			text: "Un interesado a gestionar de cerca normalmente requiere al menos «Partidario» como nivel deseado."
		});
		if ((Number(s.power) || 0) >= 50 && c <= 2) out.push({
			code: "E6",
			severity: "riesgo",
			text: "Poder alto con postura «" + levelName(c) + "»: riesgo de resistencia o de desconocimiento de quien puede frenar el proyecto."
		});
		if (today && s.engAssessedOn) {
			const n = daysBetween(s.engAssessedOn, today);
			if (n !== null && n > staleDays) out.push({
				code: "E7",
				severity: "info",
				text: "Evaluado hace " + n + " días: reevaluar (el compromiso cambia durante el proyecto)."
			});
		}
		return out;
	}
	function engagementSummary(list) {
		const sum = {
			total: list.length,
			assessed: 0,
			coveragePct: 0,
			withGap: 0,
			withGapNoStrategy: 0,
			highPowerResistant: 0,
			byCurrent: [
				0,
				0,
				0,
				0,
				0
			],
			byDesired: [
				0,
				0,
				0,
				0,
				0
			]
		};
		list.forEach((s) => {
			const c = asLevel(s.engCurrent), d = asLevel(s.engDesired);
			if (c) sum.byCurrent[c - 1]++;
			if (d) sum.byDesired[d - 1]++;
			if (!c || !d) return;
			sum.assessed++;
			if (d - c >= 1) {
				sum.withGap++;
				if (!String(s.engStrategy || "").trim()) sum.withGapNoStrategy++;
			}
			if ((Number(s.power) || 0) >= 50 && c <= 2) sum.highPowerResistant++;
		});
		sum.coveragePct = sum.total ? Math.round(sum.assessed / sum.total * 100) : 0;
		return sum;
	}
	function rankByPriority(list) {
		const r = [];
		list.forEach((s) => {
			const p = engagementPriority(s);
			if (p) r.push({
				s,
				score: p.score,
				level: p.level,
				gap: engagementGap(s)
			});
		});
		return r.sort((a, b) => b.score - a.score || b.gap - a.gap);
	}
	function approachHint(current, desired, q) {
		const c = asLevel(current), d = asLevel(desired);
		if (!c || !d) return "Evalúa primero el compromiso actual y el deseado.";
		if (d <= c) return "Mantener el nivel actual: seguimiento periódico y reevaluación.";
		const how = c === 1 ? "Informar: dar a conocer el proyecto y sus impactos con un mensaje adaptado." : c === 2 ? "Escuchar sus objeciones y atenderlas: reuniones directas, acuerdos y seguimiento de compromisos." : c === 3 ? "Involucrar: mostrar el beneficio para su agenda y darle un rol concreto." : "Empoderar: delegarle una responsabilidad visible en el éxito del proyecto.";
		const who = q === "cerca" ? "Es un interesado a gestionar de cerca: contacto directo y frecuente del director del proyecto." : q === "satisfecho" ? "Tiene poder pero poco interés: consultarlo en decisiones clave sin saturarlo." : q === "informado" ? "Tiene interés pero poco poder: comunicación frecuente y canal de retroalimentación." : "Bajo poder e interés: esfuerzo mínimo, vigilar cambios.";
		return how + " " + who;
	}
	//#endregion
	//#region src/modules/stakeholder-studio/main.ts
	var CATS = {
		"Interno": {
			color: "var(--cat-int)",
			hex: "#00b6ec"
		},
		"Cliente": {
			color: "var(--cat-cli)",
			hex: "#00c2a8"
		},
		"Regulador": {
			color: "var(--cat-reg)",
			hex: "#2e4374"
		},
		"Comunidad": {
			color: "var(--cat-com)",
			hex: "#ff9f1c"
		},
		"Proveedor": {
			color: "var(--cat-prov)",
			hex: "#6c5ce7"
		},
		"Financiero": {
			color: "var(--cat-fin)",
			hex: "#ff6b8b"
		}
	};
	var THRESHOLD = 50;
	var POWER_CRITERIA = [
		{
			key: "pos",
			label: "Poder posicional (formal)",
			desc: "Autoridad legítima dentro de la organización o del proyecto para tomar decisiones, aprobar presupuestos o cambiar el alcance."
		},
		{
			key: "res",
			label: "Control de recursos",
			desc: "Capacidad para asignar, retener o redireccionar recursos críticos (financieros, humanos, tecnológicos o de infraestructura)."
		},
		{
			key: "net",
			label: "Poder político / de red",
			desc: "Influencia informal para incidir en las decisiones de otros actores clave por su prestigio, conexiones o antigüedad."
		},
		{
			key: "veto",
			label: "Poder de veto / bloqueo",
			desc: "Capacidad legal, regulatoria o sindical para paralizar el proyecto (entidades gubernamentales, comisiones de auditoría, sindicatos)."
		},
		{
			key: "expert",
			label: "Conocimiento experto",
			desc: "Dependencia que tiene el proyecto de su conocimiento técnico, patentes o know-how exclusivo."
		}
	];
	var POWER_LEVELS = {
		1: {
			t: "Muy bajo",
			d: "No afecta decisiones ni recursos; es un receptor pasivo."
		},
		2: {
			t: "Bajo",
			d: "Puede causar retrasos menores; influencia limitada a su área inmediata."
		},
		3: {
			t: "Medio",
			d: "Su aprobación es necesaria para hitos intermedios; controla recursos parciales."
		},
		4: {
			t: "Alto",
			d: "Miembro del comité de control o dirección; puede modificar el alcance o presupuesto."
		},
		5: {
			t: "Muy alto",
			d: "Capacidad de cancelar el proyecto o redefinir el rumbo estratégico por completo."
		}
	};
	var INTEREST_CRITERIA = [
		{
			key: "afect",
			label: "Afectación por resultados",
			desc: "Grado en que los entregables o resultados del proyecto afectan directamente al stakeholder: su operación, bienestar o entorno."
		},
		{
			key: "stake",
			label: "Beneficio o pérdida en juego",
			desc: "Magnitud de lo que gana o pierde con el proyecto: económico, estratégico o reputacional."
		},
		{
			key: "align",
			label: "Alineación con sus objetivos",
			desc: "Medida en que el proyecto es central para su agenda, misión o mandato institucional."
		},
		{
			key: "prox",
			label: "Proximidad / involucramiento",
			desc: "Cercanía y frecuencia con que participa en las actividades del día a día del proyecto."
		},
		{
			key: "atten",
			label: "Involucramiento manifiesto",
			desc: "Atención y participación observable: solicita información, asiste a reuniones, plantea inquietudes, hace seguimiento."
		}
	];
	var INTEREST_LEVELS = {
		1: {
			t: "Muy bajo",
			d: "Indiferente; los resultados no le afectan y no presta atención al proyecto."
		},
		2: {
			t: "Bajo",
			d: "Interés marginal; afectación tangencial y participa sólo si se le convoca."
		},
		3: {
			t: "Medio",
			d: "Sigue el proyecto en hitos clave; afectación moderada y participación reactiva."
		},
		4: {
			t: "Alto",
			d: "Muy afectado o con un stake importante; participa activamente y hace seguimiento frecuente."
		},
		5: {
			t: "Muy alto",
			d: "El proyecto es crítico para sus objetivos; máxima atención e involucramiento constante."
		}
	};
	var stakeholders = [];
	var selectedId = null;
	var currentView = "registro";
	var idCounter = 1;
	var expandedIds = /* @__PURE__ */ new Set();
	var powerWeights = {
		pos: 20,
		res: 20,
		net: 20,
		veto: 20,
		expert: 20
	};
	var interestWeights = {
		afect: 25,
		stake: 25,
		align: 20,
		prox: 15,
		atten: 15
	};
	function uid() {
		return "s" + idCounter++;
	}
	function newStakeholder(over) {
		const id = uid();
		const s = Object.assign({
			id,
			name: "Nuevo interesado",
			org: "",
			role: "",
			category: "Interno",
			power: 50,
			interest: 50,
			legitimacy: 50,
			urgency: 50,
			powerCriteria: {
				pos: 3,
				res: 3,
				net: 3,
				veto: 3,
				expert: 3
			},
			interestCriteria: {
				afect: 3,
				stake: 3,
				align: 3,
				prox: 3,
				atten: 3
			}
		}, over || {});
		s.powerCriteria = Object.assign({
			pos: 3,
			res: 3,
			net: 3,
			veto: 3,
			expert: 3
		}, s.powerCriteria || {});
		s.interestCriteria = Object.assign({
			afect: 3,
			stake: 3,
			align: 3,
			prox: 3,
			atten: 3
		}, s.interestCriteria || {});
		recomputePower(s);
		recomputeInterest(s);
		stakeholders.push(s);
		return id;
	}
	function powerLevel(s) {
		const w = powerWeights, c = s.powerCriteria || {};
		const wsum = w.pos + w.res + w.net + w.veto + w.expert || 1;
		return ((c.pos || 0) * w.pos + (c.res || 0) * w.res + (c.net || 0) * w.net + (c.veto || 0) * w.veto + (c.expert || 0) * w.expert) / wsum;
	}
	function recomputePower(s) {
		s.power = Math.round((powerLevel(s) - 1) / 4 * 100);
		return s.power;
	}
	function recomputeAllPower() {
		stakeholders.forEach(recomputePower);
	}
	function interestLevel(s) {
		const w = interestWeights, c = s.interestCriteria || {};
		const wsum = w.afect + w.stake + w.align + w.prox + w.atten || 1;
		return ((c.afect || 0) * w.afect + (c.stake || 0) * w.stake + (c.align || 0) * w.align + (c.prox || 0) * w.prox + (c.atten || 0) * w.atten) / wsum;
	}
	function recomputeInterest(s) {
		s.interest = Math.round((interestLevel(s) - 1) / 4 * 100);
		return s.interest;
	}
	function recomputeAllInterest() {
		stakeholders.forEach(recomputeInterest);
	}
	function getSel() {
		return stakeholders.find((s) => s.id === selectedId) || null;
	}
	function loadSample() {
		stakeholders = [];
		idCounter = 1;
		const S = (o) => newStakeholder(o);
		S({
			name: "Gerencia General DISTRIB+",
			org: "DISTRIB+ S.A.",
			role: "Patrocinador (Sponsor)",
			category: "Interno",
			powerCriteria: {
				pos: 5,
				res: 5,
				net: 5,
				veto: 5,
				expert: 4
			},
			interestCriteria: {
				afect: 5,
				stake: 5,
				align: 5,
				prox: 4,
				atten: 4
			},
			legitimacy: 95,
			urgency: 70,
			engCurrent: 4,
			engDesired: 5,
			engOwner: "Director de Proyecto",
			engStrategy: "Reunión de avance quincenal; las decisiones de reserva de gestión y de línea base se llevan y se registran con el sponsor."
		});
		S({
			name: "Banco financista",
			org: "BCP",
			role: "Financiamiento del proyecto",
			category: "Financiero",
			powerCriteria: {
				pos: 4,
				res: 5,
				net: 4,
				veto: 5,
				expert: 3
			},
			interestCriteria: {
				afect: 4,
				stake: 5,
				align: 4,
				prox: 3,
				atten: 5
			},
			legitimacy: 85,
			urgency: 75,
			engCurrent: 3,
			engDesired: 4,
			engOwner: "Director de Proyecto",
			engStrategy: "Informe mensual de avance físico-financiero antes de cada desembolso."
		});
		S({
			name: "Constructora principal",
			org: "Contratista EPC",
			role: "Ejecución de obra",
			category: "Proveedor",
			powerCriteria: {
				pos: 3,
				res: 4,
				net: 3,
				veto: 4,
				expert: 5
			},
			interestCriteria: {
				afect: 5,
				stake: 4,
				align: 4,
				prox: 5,
				atten: 5
			},
			legitimacy: 80,
			urgency: 60,
			engCurrent: 4,
			engDesired: 4
		});
		S({
			name: "Municipalidad de Lurín",
			org: "Gobierno Local",
			role: "Licencias y permisos",
			category: "Regulador",
			powerCriteria: {
				pos: 5,
				res: 3,
				net: 4,
				veto: 5,
				expert: 3
			},
			interestCriteria: {
				afect: 3,
				stake: 2,
				align: 3,
				prox: 2,
				atten: 3
			},
			legitimacy: 90,
			urgency: 35,
			engCurrent: 3,
			engDesired: 4,
			engOwner: "Asesoría Legal",
			engStrategy: "Reuniones técnicas previas al ingreso del expediente de licencia (paquete 2.4) y seguimiento semanal del trámite."
		});
		S({
			name: "OEFA / Autoridad ambiental",
			org: "Estado",
			role: "Fiscalización ambiental",
			category: "Regulador",
			powerCriteria: {
				pos: 4,
				res: 2,
				net: 3,
				veto: 5,
				expert: 5
			},
			interestCriteria: {
				afect: 3,
				stake: 2,
				align: 2,
				prox: 2,
				atten: 3
			},
			legitimacy: 88,
			urgency: 40,
			engCurrent: 3,
			engDesired: 3
		});
		S({
			name: "SUNAFIL",
			org: "Estado",
			role: "Fiscalización laboral / SST",
			category: "Regulador",
			powerCriteria: {
				pos: 4,
				res: 2,
				net: 3,
				veto: 5,
				expert: 4
			},
			interestCriteria: {
				afect: 2,
				stake: 2,
				align: 2,
				prox: 2,
				atten: 3
			},
			legitimacy: 85,
			urgency: 45,
			engCurrent: 3,
			engDesired: 3
		});
		S({
			name: "Junta de vecinos de Lurín",
			org: "Comunidad",
			role: "Vecinos del entorno",
			category: "Comunidad",
			powerCriteria: {
				pos: 2,
				res: 2,
				net: 4,
				veto: 3,
				expert: 1
			},
			interestCriteria: {
				afect: 5,
				stake: 4,
				align: 5,
				prox: 3,
				atten: 5
			},
			legitimacy: 75,
			urgency: 80,
			engCurrent: 2,
			engDesired: 4,
			engOwner: "Residente de Obra",
			engStrategy: "Mesas de diálogo mensuales, canal de reclamos y plan de manejo de tráfico y ruido comunicado antes del inicio de obra."
		});
		S({
			name: "Sindicato de construcción civil",
			org: "Gremio",
			role: "Mano de obra sindicalizada",
			category: "Comunidad",
			powerCriteria: {
				pos: 3,
				res: 3,
				net: 4,
				veto: 5,
				expert: 3
			},
			interestCriteria: {
				afect: 4,
				stake: 4,
				align: 4,
				prox: 3,
				atten: 4
			},
			legitimacy: 45,
			urgency: 85,
			engCurrent: 2,
			engDesired: 4,
			engOwner: "Asesoría Legal",
			engStrategy: "Acuerdo laboral previo al inicio de obra: jornadas, seguridad y contratación local; reunión de seguimiento cada dos semanas."
		});
		S({
			name: "Futuros operarios del almacén",
			org: "DISTRIB+ S.A.",
			role: "Personal de operación",
			category: "Interno",
			powerCriteria: {
				pos: 1,
				res: 1,
				net: 2,
				veto: 2,
				expert: 3
			},
			interestCriteria: {
				afect: 5,
				stake: 3,
				align: 4,
				prox: 4,
				atten: 4
			},
			legitimacy: 70,
			urgency: 40,
			engCurrent: 1,
			engDesired: 4,
			engOwner: "Director de Proyecto",
			engStrategy: "Talleres de capacitación y visitas guiadas a obra durante la puesta en marcha (paquetes 5.x)."
		});
		S({
			name: "Clientes / distribuidores",
			org: "Cartera comercial",
			role: "Usuarios del servicio logístico",
			category: "Cliente",
			powerCriteria: {
				pos: 3,
				res: 4,
				net: 3,
				veto: 2,
				expert: 2
			},
			interestCriteria: {
				afect: 3,
				stake: 3,
				align: 3,
				prox: 3,
				atten: 4
			},
			legitimacy: 65,
			urgency: 35,
			engCurrent: 3,
			engDesired: 4,
			engOwner: "Director de Proyecto",
			engStrategy: "Comunicado de hitos del proyecto y encuesta de necesidades logísticas del nuevo almacén."
		});
		S({
			name: "Proveedor de estructuras",
			org: "Proveedor A",
			role: "Estructuras metálicas prefabricadas",
			category: "Proveedor",
			powerCriteria: {
				pos: 2,
				res: 4,
				net: 2,
				veto: 3,
				expert: 5
			},
			interestCriteria: {
				afect: 3,
				stake: 3,
				align: 3,
				prox: 3,
				atten: 3
			},
			legitimacy: 40,
			urgency: 30,
			engCurrent: 3,
			engDesired: 4,
			engOwner: "Jefe de Logística",
			engStrategy: "Seguimiento semanal de fabricación y de fechas de entrega comprometidas (paquete 3.1)."
		});
		S({
			name: "Prensa / medios locales",
			org: "Medios",
			role: "Cobertura del proyecto",
			category: "Comunidad",
			powerCriteria: {
				pos: 1,
				res: 1,
				net: 4,
				veto: 3,
				expert: 2
			},
			interestCriteria: {
				afect: 2,
				stake: 2,
				align: 2,
				prox: 2,
				atten: 2
			},
			legitimacy: 40,
			urgency: 65,
			engCurrent: 1,
			engDesired: 3,
			engOwner: "Director de Proyecto",
			engStrategy: "Nota de prensa al inicio y al cierre del proyecto."
		});
		selectedId = stakeholders[0].id;
	}
	function blankAnalysis() {
		stakeholders = [];
		idCounter = 1;
		selectedId = newStakeholder({ name: "Interesado 1" });
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
	function catHex(cat) {
		return (CATS[cat] || CATS.Interno).hex;
	}
	function initials(name) {
		const stop = /* @__PURE__ */ new Set([
			"de",
			"del",
			"la",
			"el",
			"los",
			"las",
			"y",
			"e",
			"o",
			"u",
			"the",
			"of"
		]);
		const w = String(name || "").trim().split(/\s+/).filter((t) => /[a-zA-Z0-9]/.test(t[0]) && !stop.has(t.toLowerCase()));
		if (!w.length) return "?";
		if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
		return (w[0][0] + w[1][0]).toUpperCase();
	}
	function setStatus(msg) {
		document.getElementById("statusLeft").textContent = msg;
	}
	function render() {
		const main = document.getElementById("mainArea");
		const prevScroll = main ? main.scrollTop : 0;
		document.querySelectorAll("#viewGroup .btn").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
		if (currentView === "registro") main.innerHTML = renderRegister();
		else if (currentView === "poderInteres") main.innerHTML = renderPowerInterest();
		else if (currentView === "prominencia") main.innerHTML = renderSalience();
		else if (currentView === "compromiso") main.innerHTML = renderEngagement();
		wireMainInteractions();
		renderSidebar();
		if (main) main.scrollTop = prevScroll;
		document.getElementById("btnDelete").disabled = !selectedId;
	}
	function renderDetailEditor(s) {
		const catOpts = Object.keys(CATS).map((c) => `<option ${c === s.category ? "selected" : ""}>${c}</option>`).join("");
		const slider = (key, label) => `<div class="slider-field">
      <div class="lab"><label>${label}</label><span class="val d-val" data-id="${escapeHtml(s.id)}" data-field="${key}">${escapeHtml(s[key])}</span></div>
      <input type="range" min="0" max="100" step="5" value="${escapeHtml(s[key])}" class="d-sld" data-id="${escapeHtml(s.id)}" data-field="${key}">
    </div>`;
		const t = salienceType(s);
		return `<div class="reg-detail-inner">
    <div class="detail-cols">
      <div class="field"><label>Nombre</label><input class="d-inp" data-id="${escapeHtml(s.id)}" data-field="name" value="${escapeHtml(s.name)}"></div>
      <div class="field"><label>Organización</label><input class="d-inp" data-id="${escapeHtml(s.id)}" data-field="org" value="${escapeHtml(s.org)}"></div>
      <div class="field"><label>Categoría</label><select class="d-sel" data-id="${escapeHtml(s.id)}" data-field="category">${catOpts}</select></div>
      <div class="field"><label>Rol / Cargo</label><input class="d-inp" data-id="${escapeHtml(s.id)}" data-field="role" value="${escapeHtml(s.role)}"></div>
    </div>
    <div class="input-map-note"><b>Poder</b> e <b>Interés</b> se calculan abajo a partir de 5 criterios ponderados (no se editan directamente) y ubican al interesado en la Matriz Poder–Interés. <b>Legitimidad</b> y <b>Urgencia</b> se registran directamente y, junto con el Poder ya calculado, determinan su tipo de Prominencia.</div>
    ${powerPanelHtml(s)}
    ${interestPanelHtml(s)}
    <div class="slider-group">
      <div class="slider-group-label">Legitimidad y Urgencia → Prominencia (junto con Poder)</div>
      <div class="detail-sliders">${slider("legitimacy", "Legitimidad")}${slider("urgency", "Urgencia")}</div>
    </div>
    <div class="detail-foot">
      <span class="sal-badge" style="background:${salColor(t)}">Prominencia: ${SAL_INFO[t].t}</span>
      <button class="btn danger d-del" data-id="${escapeHtml(s.id)}">🗑 Eliminar interesado</button>
    </div>
  </div>`;
	}
	function powerPanelHtml(s) {
		const raw = powerLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
		const info = POWER_LEVELS[lvl] || POWER_LEVELS[3];
		const rows = POWER_CRITERIA.map((cr) => {
			const val = s.powerCriteria[cr.key] ?? 3;
			const opts = [
				1,
				2,
				3,
				4,
				5
			].map((n) => `<option value="${n}" ${n === val ? "selected" : ""}>${n} · ${POWER_LEVELS[n].t}</option>`).join("");
			return `<div class="field" title="${escapeHtml(cr.desc)}">
        <label>${escapeHtml(cr.label)} <span class="wtag">${powerWeights[cr.key]}%</span></label>
        <select class="d-pc" data-id="${escapeHtml(s.id)}" data-crit="${cr.key}">${opts}</select>
      </div>`;
		}).join("");
		return `<div class="power-panel">
      <div class="power-head">
        <div class="power-title">⚡ Poder — capacidad de influencia</div>
        <div class="power-score">
          <span class="pl-badge pl-${lvl}">Nivel ${lvl} · ${info.t}</span>
          <span class="pl-num">${pct}<i>/100</i></span>
        </div>
      </div>
      <div class="power-crit-grid">${rows}</div>
      <div class="power-desc">${escapeHtml(info.d)}</div>
    </div>`;
	}
	function interestPanelHtml(s) {
		const raw = interestLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
		const info = INTEREST_LEVELS[lvl] || INTEREST_LEVELS[3];
		const rows = INTEREST_CRITERIA.map((cr) => {
			const val = s.interestCriteria[cr.key] ?? 3;
			const opts = [
				1,
				2,
				3,
				4,
				5
			].map((n) => `<option value="${n}" ${n === val ? "selected" : ""}>${n} · ${INTEREST_LEVELS[n].t}</option>`).join("");
			return `<div class="field" title="${escapeHtml(cr.desc)}">
        <label>${escapeHtml(cr.label)} <span class="wtag">${interestWeights[cr.key]}%</span></label>
        <select class="d-ic" data-id="${escapeHtml(s.id)}" data-crit="${cr.key}">${opts}</select>
      </div>`;
		}).join("");
		return `<div class="power-panel interest-panel">
      <div class="power-head">
        <div class="power-title">🎯 Interés — nivel de involucramiento</div>
        <div class="power-score">
          <span class="il-badge pl-${lvl}">Nivel ${lvl} · ${info.t}</span>
          <span class="il-num">${pct}<i>/100</i></span>
        </div>
      </div>
      <div class="power-crit-grid">${rows}</div>
      <div class="interest-desc">${escapeHtml(info.d)}</div>
    </div>`;
	}
	function renderRegister() {
		if (!stakeholders.length) return `<div class="view-head"><h2>Registro de interesados</h2>
      <p>Aún no hay interesados. Usa <b>+ Interesado</b> para empezar o <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</p></div>`;
		return `<div class="view-head">
      <h2>Registro de interesados</h2>
      <p>La base de datos única del análisis (equivale al <i>Stakeholder Register</i> de Simply Stakeholders y del PMBOK). Cada interesado que registres alimenta automáticamente la <b>Matriz Poder–Interés</b> y el <b>Modelo de Prominencia</b>. <b>Haz clic en un interesado</b> para desplegar y editar sus atributos; usa el botón <b>▸</b> a la izquierda del nombre para colapsarlo.</p>
    </div>
    <div class="reg-toolbar">
      <button class="btn" id="btnExpandAll">⊞ Expandir todo</button>
      <button class="btn" id="btnCollapseAll">⊟ Colapsar todo</button>
    </div>
    <div class="reg-list">${stakeholders.map((s) => {
			const c = catHex(s.category);
			const open = expandedIds.has(s.id);
			return `<div class="reg-card ${open ? "expanded" : ""}" data-id="${escapeHtml(s.id)}">
      <div class="reg-header" data-id="${escapeHtml(s.id)}" role="button" tabindex="0" aria-expanded="${open}">
        <div class="reg-headmain">
          <button class="reg-toggle" data-id="${escapeHtml(s.id)}" aria-label="Desplegar o colapsar">${open ? "▾" : "▸"}</button>
          <div class="reg-namewrap">
            <div class="sh-name">${escapeHtml(s.name)}</div>
            <div class="sh-org">${escapeHtml(s.org || "—")}${s.role ? " · " + escapeHtml(s.role) : ""}</div>
          </div>
        </div>
        <div class="reg-headcat">
          <span class="cat-chip" style="background:${c}">${escapeHtml(s.category)}</span>
        </div>
        <div class="reg-quick">
          <div class="q"><span class="ql">Poder</span><b class="q-power">${s.power}</b></div>
          <div class="q"><span class="ql">Interés</span><b class="q-interest">${s.interest}</b></div>
        </div>
      </div>
      <div class="reg-detail">${open ? renderDetailEditor(s) : ""}</div>
    </div>`;
		}).join("")}</div>`;
	}
	function renderPowerInterest() {
		const W = 620, H = 620, m = 70;
		const px = (v) => m + v / 100 * 480;
		const py = (v) => 550 - v / 100 * 480;
		const midX = px(50), midY = py(50);
		const quadSvg = [
			{
				x: m,
				y: m,
				w: 240,
				h: 240,
				fill: "rgba(108,92,231,0.08)",
				t: "Mantener satisfecho",
				s: "Alto poder · Bajo interés",
				tx: "end",
				ty: "start",
				cx: midX - 12,
				cy: 88
			},
			{
				x: midX,
				y: m,
				w: 240,
				h: 240,
				fill: "rgba(0,182,236,0.09)",
				t: "Gestionar de cerca",
				s: "Alto poder · Alto interés",
				tx: "start",
				ty: "start",
				cx: midX + 12,
				cy: 88
			},
			{
				x: m,
				y: midY,
				w: 240,
				h: 240,
				fill: "rgba(137,146,163,0.10)",
				t: "Monitorear",
				s: "Bajo poder · Bajo interés",
				tx: "end",
				ty: "end",
				cx: midX - 12,
				cy: 526
			},
			{
				x: midX,
				y: midY,
				w: 240,
				h: 240,
				fill: "rgba(255,159,28,0.08)",
				t: "Mantener informado",
				s: "Bajo poder · Alto interés",
				tx: "start",
				ty: "end",
				cx: midX + 12,
				cy: 526
			}
		].map((q) => {
			const anchor = q.tx === "end" ? "end" : "start";
			return `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}"/>
      <text x="${q.cx}" y="${q.cy}" text-anchor="${anchor}" class="quad-label" fill="var(--ink-1)">${q.t}</text>
      <text x="${q.cx}" y="${q.cy + 16}" text-anchor="${anchor}" class="quad-sub" fill="var(--ink-2)">${q.s}</text>`;
		}).join("");
		const bubbles = plotBubbles(stakeholders.map((s) => ({
			s,
			x: px(s.interest),
			y: py(s.power)
		})), 15);
		return `<div class="view-head">
      <h2>Matriz Poder–Interés (Mendelow)</h2>
      <p>El clásico grid 2×2 de Mendelow. Cada burbuja se ubica según su <b>interés</b> (eje horizontal) y su <b>poder</b> (eje vertical); el cuadrante define la <b>estrategia de gestión</b>. Arrastra los deslizadores del panel derecho y observa cómo un interesado migra de cuadrante.</p>
    </div>
    <div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      ${quadSvg}
      <line x1="${midX}" y1="${m}" x2="${midX}" y2="550" stroke="var(--panel-border)" stroke-width="1.5" stroke-dasharray="4 4"/>
      <line x1="${m}" y1="${midY}" x2="550" y2="${midY}" stroke="var(--panel-border)" stroke-width="1.5" stroke-dasharray="4 4"/>
      <line x1="${m}" y1="550" x2="550" y2="550" stroke="var(--ink-2)" stroke-width="1.5"/>
      <line x1="${m}" y1="${m}" x2="${m}" y2="550" stroke="var(--ink-2)" stroke-width="1.5"/>
      <text x="${W / 2}" y="602" text-anchor="middle" class="axis-label">INTERÉS →</text>
      <text x="22" y="${H / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 22 ${H / 2})">PODER →</text>
      ${bubbles}
    </svg></div>`;
	}
	function salienceType(s) {
		const P = s.power >= THRESHOLD, L = s.legitimacy >= THRESHOLD, U = s.urgency >= THRESHOLD;
		if (P && L && U) return "definitivo";
		if (P && L) return "dominante";
		if (P && U) return "peligroso";
		if (L && U) return "dependiente";
		if (P) return "durmiente";
		if (L) return "discrecional";
		if (U) return "demandante";
		return "no";
	}
	var SAL_INFO = {
		definitivo: {
			t: "Definitivo",
			d: "Poder + Legitimidad + Urgencia. Máxima prioridad; atender de inmediato."
		},
		dominante: {
			t: "Dominante",
			d: "Poder + Legitimidad. Expectativas legítimas y capacidad de imponerlas."
		},
		peligroso: {
			t: "Peligroso",
			d: "Poder + Urgencia (sin legitimidad). Puede recurrir a la coerción."
		},
		dependiente: {
			t: "Dependiente",
			d: "Legitimidad + Urgencia (sin poder). Depende de otros para ser escuchado."
		},
		durmiente: {
			t: "Latente: Durmiente",
			d: "Solo poder. Poder sin usar; vigilar por si se activa."
		},
		discrecional: {
			t: "Latente: Discrecional",
			d: "Solo legitimidad. Candidato a acciones de responsabilidad social."
		},
		demandante: {
			t: "Latente: Exigente",
			d: "Solo urgencia. Reclama mucho, pero sin poder ni legitimidad."
		},
		no: {
			t: "No interesado",
			d: "Ninguno de los tres atributos supera el umbral."
		}
	};
	function renderSalience() {
		const W = 640, H = 620, cx = W / 2, r = 150;
		const cP = {
			x: cx,
			y: 212
		};
		const cL = {
			x: 232,
			y: 366
		};
		const cU = {
			x: 408,
			y: 366
		};
		const regionCenter = {
			durmiente: {
				x: cP.x,
				y: cP.y - r * .45
			},
			discrecional: {
				x: cL.x - r * .5,
				y: cL.y + r * .4
			},
			demandante: {
				x: cU.x + r * .5,
				y: cU.y + r * .4
			},
			dominante: {
				x: (cP.x + cL.x) / 2 - r * .28,
				y: (cP.y + cL.y) / 2
			},
			peligroso: {
				x: (cP.x + cU.x) / 2 + r * .28,
				y: (cP.y + cU.y) / 2
			},
			dependiente: {
				x: cx,
				y: (cL.y + cU.y) / 2 + r * .55
			},
			definitivo: {
				x: cx,
				y: 306
			},
			no: {
				x: cx,
				y: 586
			}
		};
		const groups = {};
		stakeholders.forEach((s) => {
			const t = salienceType(s);
			(groups[t] = groups[t] || []).push(s);
		});
		let dots = "";
		Object.keys(groups).forEach((type) => {
			const arr = groups[type], ctr = regionCenter[type];
			const n = arr.length;
			arr.forEach((s, i) => {
				const ang = i / Math.max(n, 1) * Math.PI * 2;
				const rad = n === 1 ? 0 : 15 + i % 2 * 13;
				const x = ctr.x + Math.cos(ang) * rad;
				const y = ctr.y + Math.sin(ang) * rad;
				dots += bubbleNode(s, x, y, 14);
			});
		});
		return `<div class="view-head">
      <h2>Modelo de Prominencia (Mitchell, Agle &amp; Wood, 1997)</h2>
      <p>Clasifica a cada interesado según posea <b>Poder</b>, <b>Legitimidad</b> y/o <b>Urgencia</b> (umbral ${THRESHOLD}). Las intersecciones definen 7 tipos de <i>salience</i>: cuantos más atributos, mayor prioridad. Ajusta esos tres deslizadores en el panel derecho y verás la burbuja saltar de región.</p>
    </div>
    <div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <circle cx="${cP.x}" cy="${cP.y}" r="${r}" fill="rgba(0,182,236,0.16)" stroke="#00b6ec" stroke-width="2"/>
      <circle cx="${cL.x}" cy="${cL.y}" r="${r}" fill="rgba(0,194,168,0.16)" stroke="#00c2a8" stroke-width="2"/>
      <circle cx="${cU.x}" cy="${cU.y}" r="${r}" fill="rgba(255,84,112,0.15)" stroke="#ff5470" stroke-width="2"/>
      <text x="${cP.x}" y="${cP.y - r + 26}" text-anchor="middle" class="venn-label" fill="#0090c2">PODER</text>
      <text x="${cL.x - r * .62}" y="${cL.y + r * .9}" text-anchor="middle" class="venn-label" fill="#00967f">LEGITIMIDAD</text>
      <text x="${cU.x + r * .62}" y="${cU.y + r * .9}" text-anchor="middle" class="venn-label" fill="#c02747">URGENCIA</text>
      <text x="${regionCenter.durmiente.x}" y="${regionCenter.durmiente.y - 24}" text-anchor="middle" class="region-name">1 Durmiente</text>
      <text x="${regionCenter.discrecional.x}" y="${regionCenter.discrecional.y - 24}" text-anchor="middle" class="region-name">2 Discrecional</text>
      <text x="${regionCenter.demandante.x}" y="${regionCenter.demandante.y - 24}" text-anchor="middle" class="region-name">3 Exigente</text>
      <text x="${regionCenter.dominante.x - 4}" y="${regionCenter.dominante.y - 30}" text-anchor="middle" class="region-name">4 Dominante</text>
      <text x="${regionCenter.peligroso.x + 4}" y="${regionCenter.peligroso.y - 30}" text-anchor="middle" class="region-name">5 Peligroso</text>
      <text x="${regionCenter.dependiente.x}" y="${regionCenter.dependiente.y + 30}" text-anchor="middle" class="region-name">6 Dependiente</text>
      <text x="${regionCenter.definitivo.x}" y="${regionCenter.definitivo.y - 30}" text-anchor="middle" class="region-name" style="fill:var(--ink-0)">7 Definitivo</text>
      ${dots}
    </svg></div>`;
	}
	var todayISO = () => todayLocalISO();
	var PRIO_TXT = {
		alta: "ALTA",
		media: "MEDIA",
		baja: "BAJA"
	};
	function engFindingsHtml(s) {
		const f = engagementFindings(s, todayISO());
		return f.length ? `<ul class="eng-finds">${f.map((x) => `<li><span class="sv ${x.severity}">${x.severity === "riesgo" ? "RIESGO" : x.severity === "aviso" ? "AVISO" : "NOTA"}</span>${escapeHtml(x.text)}</li>`).join("")}</ul>` : "";
	}
	function engGapHtml(s) {
		const g = engagementGap(s);
		if (g === null) return `<span class="eng-gap" style="color:var(--ink-2)" title="Falta evaluar el nivel actual o el deseado">—</span>`;
		return `<span class="eng-gap" style="color:${g >= 2 ? "#a3172f" : g === 1 ? "#8a5300" : g === 0 ? "#00675a" : "var(--ink-2)"}" title="Deseado − actual">${g > 0 ? "+" + g : g}</span>`;
	}
	function engPrioHtml(s) {
		const p = engagementPriority(s);
		return p ? `<span class="eng-pill ${p.level}" title="Prioridad = brecha × poder / 100 = ${p.score}">${PRIO_TXT[p.level]} · ${p.score}</span>` : `<span style="color:var(--ink-2)">—</span>`;
	}
	function engLevelOptions(v) {
		return `<option value="">Sin evaluar</option>` + ENG_LEVELS.map((l) => `<option value="${l.v}" ${asLevel(v) === l.v ? "selected" : ""}>${l.v} · ${l.t}</option>`).join("");
	}
	function renderEngagement() {
		const head = `<div class="view-head">
      <h2>Matriz de evaluación del compromiso</h2>
      <p>Para cada interesado, compara su nivel de compromiso <b>actual</b> (<b>C</b>) con el nivel <b>deseado</b> (<b>D</b>) para que el proyecto tenga éxito: la <b>brecha</b> (D − C) justifica las acciones del plan de involucramiento. Los niveles los evalúas tú, con evidencia: no se calculan ni se asumen. La <b>prioridad</b> pondera la brecha por el poder del interesado.</p>
    </div>`;
		if (!stakeholders.length) return head + `<div class="empty-hint">Aún no hay interesados. Usa <b>+ Interesado</b> o <b>Cargar ejemplo</b>.</div>`;
		const rows = stakeholders.map((s) => {
			const c = asLevel(s.engCurrent), d = asLevel(s.engDesired), q = quadrantOf(s.power, s.interest);
			const cells = ENG_LEVELS.map((l) => {
				const isC = c === l.v, isD = d === l.v;
				const mk = isC && isD ? `<span class="eng-mk cd" title="Actual y deseado coinciden: ${l.t}">C=D</span>` : isC ? `<span class="eng-mk c" title="Actual: ${l.t}">C</span>` : isD ? `<span class="eng-mk d" title="Deseado: ${l.t}">D</span>` : "";
				return `<td class="eng-cell" data-lv="${l.v}">${mk}</td>`;
			}).join("");
			return `<tr class="eng-r" data-id="${escapeHtml(s.id)}">
      <td class="l"><div class="eng-name">${escapeHtml(s.name)}</div>
        <div class="eng-sub">${escapeHtml(s.category)} · ${QUADRANT_LABEL[q]} · P${escapeHtml(s.power)}/I${escapeHtml(s.interest)}</div>
        <div class="eng-f">${engFindingsHtml(s)}</div></td>
      ${cells}
      <td class="e-gap">${engGapHtml(s)}</td>
      <td class="e-prio">${engPrioHtml(s)}</td>
      <td><select class="e-cur" data-id="${escapeHtml(s.id)}" aria-label="Compromiso actual de ${escapeHtml(s.name)}">${engLevelOptions(s.engCurrent)}</select></td>
      <td><select class="e-des" data-id="${escapeHtml(s.id)}" aria-label="Compromiso deseado de ${escapeHtml(s.name)}">${engLevelOptions(s.engDesired)}</select></td>
      <td class="l"><textarea class="e-str" data-id="${escapeHtml(s.id)}" placeholder="${escapeHtml(approachHint(s.engCurrent, s.engDesired, q))}" aria-label="Estrategia de involucramiento de ${escapeHtml(s.name)}">${escapeHtml(s.engStrategy || "")}</textarea></td>
      <td><input class="e-own" data-id="${escapeHtml(s.id)}" value="${escapeHtml(s.engOwner || "")}" placeholder="Responsable" aria-label="Responsable de ${escapeHtml(s.name)}"></td>
    </tr>`;
		}).join("");
		return head + `<div class="eng-legend">
      <span><span class="eng-mk c">C</span> compromiso actual</span>
      <span><span class="eng-mk d">D</span> compromiso deseado</span>
      <span><span class="eng-mk cd">C=D</span> ya coinciden</span>
    </div>
    <div class="eng-wrap"><table class="eng">
      <thead><tr><th class="l">Interesado</th>${ENG_LEVELS.map((l) => `<th title="${escapeHtml(l.d)}">${l.t}</th>`).join("")}<th>Brecha</th><th>Prioridad</th><th>Actual</th><th>Deseado</th><th class="l">Estrategia para cerrar la brecha</th><th>Responsable</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
	}
	function engagementSidebar() {
		const sum = engagementSummary(stakeholders), rank = rankByPriority(stakeholders).slice(0, 5);
		const counts = ENG_LEVELS.map((l) => `<tr><td>${l.v} · ${l.t}</td><td>${sum.byCurrent[l.v - 1]}</td><td>${sum.byDesired[l.v - 1]}</td></tr>`).join("");
		const prio = rank.length ? rank.map((r) => `<div class="strat-box"><div class="st"><span class="eng-pill ${r.level}">${PRIO_TXT[r.level]} · ${r.score}</span> ${escapeHtml(r.s.name)}</div>${levelName(r.s.engCurrent)} → ${levelName(r.s.engDesired)} (brecha +${r.gap})${String(r.s.engStrategy || "").trim() ? "" : " · <b>sin estrategia</b>"}</div>`).join("") : `<div class="empty-hint">No hay brechas de compromiso por cerrar${sum.assessed ? "." : ": aún no evaluaste a ningún interesado."}</div>`;
		return `<h3 class="mt">Compromiso: resumen</h3>
    <div class="stat-grid">
      <div class="stat"><div class="v">${sum.assessed}/${sum.total}</div><div class="l">Evaluados (${sum.coveragePct}%)</div></div>
      <div class="stat"><div class="v">${sum.withGap}</div><div class="l">Con brecha</div></div>
      <div class="stat"><div class="v" title="Poder alto (≥50) y postura Reticente o Desconocedor">${sum.highPowerResistant}</div><div class="l">Poder alto en riesgo</div></div>
    </div>
    <table class="eng-mini"><thead><tr><th>Nivel</th><th>Actual</th><th>Deseado</th></tr></thead><tbody>${counts}</tbody></table>
    <h3 class="mt">Prioridades para cerrar brechas</h3>
    ${prio}
    <div class="tip-box"><b>Prioridad</b> = brecha × poder / 100 (alta ≥ 1,5 · media ≥ 0,75). Una brecha grande en quien no tiene poder pesa menos que una menor en quien puede frenar el proyecto.</div>
    <h3 class="mt">Niveles de compromiso (PMI)</h3>
    ${ENG_LEVELS.map((l) => strat("#0090c2", l.v + " · " + l.t, l.d)).join("")}`;
	}
	function wireEngagement() {
		const byId = (el) => stakeholders.find((x) => x.id === el.dataset.id);
		document.querySelectorAll("table.eng select.e-cur, table.eng select.e-des").forEach((el) => {
			el.addEventListener("change", () => {
				const s = byId(el);
				if (!s) return;
				const v = asLevel(el.value);
				if (el.classList.contains("e-cur")) {
					s.engCurrent = v;
					s.engAssessedOn = v ? todayISO() : void 0;
				} else s.engDesired = v;
				render();
			});
		});
		const live = (el, set) => el.addEventListener("input", () => {
			const s = byId(el);
			if (!s) return;
			set(s);
			const tr = document.querySelector(`tr.eng-r[data-id="${s.id}"]`);
			if (!tr) return;
			const f = tr.querySelector(".eng-f");
			if (f) f.innerHTML = engFindingsHtml(s);
			renderSidebar();
		});
		document.querySelectorAll("table.eng textarea.e-str").forEach((el) => live(el, (s) => {
			s.engStrategy = el.value;
		}));
		document.querySelectorAll("table.eng input.e-own").forEach((el) => live(el, (s) => {
			s.engOwner = el.value;
		}));
	}
	function bubbleNode(s, x, y, rBase) {
		const r = rBase || 14;
		return `<g class="bubble ${s.id === selectedId ? "selected" : ""}" data-id="${escapeHtml(s.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" role="button" tabindex="0" aria-label="${escapeHtml(s.name || "Interesado sin nombre")}">
    <circle r="${r}" fill="${catHex(s.category)}" stroke="#fff" stroke-width="2" opacity="0.92"/>
    <text text-anchor="middle" dy="3.5">${escapeHtml(initials(s.name))}</text>
  </g>`;
	}
	function plotBubbles(points, rBase) {
		const pts = points.map((p) => ({
			...p,
			r: p.size || rBase || 14
		}));
		for (let iter = 0; iter < 60; iter++) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
			const a = pts[i], b = pts[j];
			const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01;
			const min = a.r + b.r + 3;
			if (d < min) {
				const push = (min - d) / 2, ux = dx / d, uy = dy / d;
				a.x -= ux * push;
				a.y -= uy * push;
				b.x += ux * push;
				b.y += uy * push;
			}
		}
		return pts.map((p) => bubbleNode(p.s, p.x, p.y, p.r)).join("");
	}
	function renderSidebar() {
		const sb = document.getElementById("sidebar");
		if (currentView === "compromiso") {
			sb.innerHTML = statsBlock() + engagementSidebar();
			return;
		}
		if (currentView === "registro") {
			sb.innerHTML = statsBlock() + weightsBlock({
				title: "Ponderación del poder",
				criteria: POWER_CRITERIA,
				weights: powerWeights,
				inpClass: "winp",
				normClass: "wnorm",
				tip: "El <b>poder</b> de cada interesado se calcula ponderando 5 criterios (escala 1–5) y se mapea a 0–100. Ajusta los pesos según tu metodología; conviene que sumen 100%."
			}) + weightsBlock({
				title: "Ponderación del interés",
				criteria: INTEREST_CRITERIA,
				weights: interestWeights,
				inpClass: "iinp",
				normClass: "inorm",
				tip: "El <b>interés</b> se calcula ponderando 5 indicadores (escala 1–5) y se mapea a 0–100. Los dos primeros (afectación y stake) pesan más por ser los motores del interés genuino."
			}) + viewGuideBlock();
			wireWeights("winp", "wnorm", powerWeights, POWER_CRITERIA, recomputeAllPower);
			wireWeights("iinp", "inorm", interestWeights, INTEREST_CRITERIA, recomputeAllInterest);
			return;
		}
		sb.innerHTML = statsBlock() + selectedBlock() + viewGuideBlock() + dangerBlock();
		wireSidebar();
	}
	function weightsBlock(cfg) {
		const rows = cfg.criteria.map((cr) => `
    <div class="wrow" title="${escapeHtml(cr.desc)}">
      <label>${escapeHtml(cr.label)}</label>
      <input type="number" min="0" max="100" step="5" class="${cfg.inpClass}" data-crit="${cr.key}" value="${cfg.weights[cr.key]}">
    </div>`).join("");
		const sum = cfg.criteria.reduce((a, cr) => a + Number(cfg.weights[cr.key] || 0), 0);
		const ok = sum === 100;
		return `<h3 class="mt">${escapeHtml(cfg.title)}</h3>
    <div class="tip-box">${cfg.tip}</div>
    <div class="weights">${rows}
      <div class="wsum">Suma de pesos: <b style="color:${ok ? "var(--good)" : "var(--danger)"}">${sum}%</b>
        ${ok ? "" : `<button class="btn ${cfg.normClass}" style="padding:4px 9px; margin-left:6px;">Normalizar a 100%</button>`}
      </div>
    </div>`;
	}
	function wireWeights(inpClass, normClass, weights, criteria, recomputeFn) {
		document.querySelectorAll(`#sidebar .${inpClass}`).forEach((inp) => {
			inp.addEventListener("change", () => {
				let v = Number(inp.value);
				if (isNaN(v) || v < 0) v = 0;
				weights[inp.dataset.crit] = v;
				recomputeFn();
				render();
			});
		});
		const norm = document.querySelector(`#sidebar .${normClass}`);
		if (norm) norm.addEventListener("click", () => {
			const sum = criteria.reduce((a, cr) => a + Number(weights[cr.key] || 0), 0) || 1;
			let acc = 0;
			criteria.forEach((cr, i) => {
				if (i < criteria.length - 1) {
					weights[cr.key] = Math.round(weights[cr.key] / sum * 100);
					acc += weights[cr.key];
				} else weights[cr.key] = 100 - acc;
			});
			recomputeFn();
			render();
		});
	}
	function statsBlock() {
		return `<h3>Resumen del análisis</h3>
    <div class="stat-grid">
      <div class="stat"><div class="v">${stakeholders.length}</div><div class="l">Interesados</div></div>
      <div class="stat"><div class="v">${stakeholders.filter((s) => s.power >= THRESHOLD && s.interest >= THRESHOLD).length}</div><div class="l">Gestionar de cerca</div></div>
      <div class="stat"><div class="v">${stakeholders.filter((s) => salienceType(s) === "definitivo").length}</div><div class="l">Prominencia definitiva</div></div>
    </div>`;
	}
	function selectedBlock() {
		const s = getSel();
		if (!s) return `<h3 class="mt">Interesado</h3><div class="empty-hint">Selecciona un interesado (fila o burbuja) para editar sus atributos.</div>`;
		const catOpts = Object.keys(CATS).map((c) => `<option ${c === s.category ? "selected" : ""}>${c}</option>`).join("");
		const slider = (key, label) => `<div class="slider-field">
      <div class="lab"><label>${label}</label><span class="val" id="v_${key}">${escapeHtml(s[key])}</span></div>
      <input type="range" min="0" max="100" step="5" value="${escapeHtml(s[key])}" data-field="${key}" class="sld">
    </div>`;
		return `<h3 class="mt">Atributos del interesado</h3>
    <div class="field"><label>Nombre</label><input id="f_name" value="${escapeHtml(s.name)}"></div>
    <div class="field-row">
      <div class="field"><label>Organización</label><input id="f_org" value="${escapeHtml(s.org)}"></div>
      <div class="field"><label>Categoría</label><select id="f_category">${catOpts}</select></div>
    </div>
    <div class="field"><label>Rol / Cargo</label><input id="f_role" value="${escapeHtml(s.role)}"></div>
    <div class="power-readout" title="El poder se calcula por 5 criterios ponderados en la vista Registro">
      <span>⚡ Poder <b>Nivel ${Math.round(powerLevel(s))}</b> · ${POWER_LEVELS[Math.round(powerLevel(s))].t}</span>
      <span class="pr-num">${s.power}<i>/100</i></span>
    </div>
    <div class="power-readout interest-readout" title="El interés se calcula por 5 indicadores ponderados en la vista Registro">
      <span>🎯 Interés <b>Nivel ${Math.round(interestLevel(s))}</b> · ${INTEREST_LEVELS[Math.round(interestLevel(s))].t}</span>
      <span class="pr-num">${s.interest}<i>/100</i></span>
    </div>
    <div class="pr-hint">Edita poder e interés por criterios en la vista <b>Registro</b>.</div>
    ${slider("legitimacy", "Legitimidad")}
    ${slider("urgency", "Urgencia")}`;
	}
	function viewGuideBlock() {
		if (currentView === "poderInteres") return `<div class="tip-box"><b>Insumo del registro:</b> cada burbuja se ubica según el <b>Poder</b> (eje vertical) y el <b>Interés</b> (eje horizontal) de ese interesado. Ambos se calculan en la vista Registro a partir de 5 criterios ponderados cada uno; no se editan directamente.</div>
      <h3 class="mt">Estrategias por cuadrante</h3>
      ${strat("#00b6ec", "Gestionar de cerca", "Alto poder + alto interés. Involúcralos plenamente; son socios clave del proyecto.")}
      ${strat("#6c5ce7", "Mantener satisfecho", "Alto poder + bajo interés. Consúltalos en decisiones clave sin saturarlos.")}
      ${strat("#ff9f1c", "Mantener informado", "Bajo poder + alto interés. Comunicación frecuente; pueden volverse aliados o críticos.")}
      ${strat("#8992a3", "Monitorear", "Bajo poder + bajo interés. Esfuerzo mínimo; vigila cambios.")}`;
		if (currentView === "prominencia") return `<div class="tip-box"><b>Insumo del registro:</b> el tipo de prominencia se deriva de tres valores: <b>Poder</b> (calculado por criterios ponderados), <b>Legitimidad</b> y <b>Urgencia</b> (registradas directamente), cada uno evaluado contra el umbral ${THRESHOLD}. Según cuáles de los tres lo superen, el interesado cae en una de las 7 regiones del diagrama.</div>
      <h3 class="mt">Los 7 tipos de prominencia</h3>
      ${Object.keys(SAL_INFO).filter((k) => k !== "no").map((k) => strat(salColor(k), SAL_INFO[k].t, SAL_INFO[k].d)).join("")}`;
		return `<h3 class="mt">Leyenda de categorías</h3>
    <div class="legend">${Object.keys(CATS).map((c) => `<div class="legend-item"><span class="legend-dot" style="background:${CATS[c].hex}"></span>${c}</div>`).join("")}</div>
    <h3 class="mt">Cómo se usa cada dato</h3>
    <div class="tip-box"><b>Poder</b> e <b>Interés</b> (calculados por criterios ponderados) → posicionan la burbuja en la vista <b>Poder–Interés</b> (Mendelow).</div>
    <div class="tip-box"><b>Poder</b>, <b>Legitimidad</b> y <b>Urgencia</b> → clasifican al interesado en la vista <b>Prominencia</b> (Mitchell, Agle &amp; Wood).</div>
    <div class="tip-box"><b>Un dato, muchas vistas:</b> mantén el registro al día y ambas matrices se recalculan solas, sin volver a cargar nada.</div>`;
	}
	function strat(color, title, desc) {
		return `<div class="strat-box"><div class="st"><span class="d" style="background:${color}"></span>${escapeHtml(title)}</div>${escapeHtml(desc)}</div>`;
	}
	function salColor(k) {
		return {
			definitivo: "#1a1a1c",
			dominante: "#6c5ce7",
			peligroso: "#ff5470",
			dependiente: "#00c2a8",
			durmiente: "#00b6ec",
			discrecional: "#3bb0e6",
			demandante: "#ff9f1c"
		}[k] || "#8992a3";
	}
	function dangerBlock() {
		if (!getSel()) return "";
		const s = getSel();
		let extra = "";
		if (currentView === "prominencia") {
			const t = salienceType(s);
			extra = `<div class="tip-box" style="margin-bottom:10px"><b>Clasificación actual:</b> ${SAL_INFO[t].t}. ${SAL_INFO[t].d}</div>`;
		}
		return `<div class="danger-zone">${extra}
    <button class="btn danger" id="btnDeleteSb" style="width:100%; justify-content:center;">🗑 Eliminar «${escapeHtml((s.name || "").slice(0, 22))}»</button>
  </div>`;
	}
	function wireMainInteractions() {
		document.querySelectorAll(".bubble[data-id]").forEach((el) => {
			el.addEventListener("click", () => {
				selectedId = el.dataset.id;
				render();
			});
			el.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					selectedId = el.dataset.id;
					render();
				}
			});
		});
		document.querySelectorAll(".reg-header").forEach((h) => {
			h.addEventListener("click", () => toggleExpand(h.dataset.id));
			h.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggleExpand(h.dataset.id);
				}
			});
		});
		const bxa = document.getElementById("btnExpandAll");
		if (bxa) bxa.addEventListener("click", () => {
			stakeholders.forEach((s) => expandedIds.add(s.id));
			render();
		});
		const bca = document.getElementById("btnCollapseAll");
		if (bca) bca.addEventListener("click", () => {
			expandedIds.clear();
			render();
		});
		wireDetailEditors();
		wireEngagement();
	}
	function toggleExpand(id) {
		if (!id) return;
		if (expandedIds.has(id)) expandedIds.delete(id);
		else {
			expandedIds.add(id);
			selectedId = id;
		}
		render();
	}
	function wireDetailEditors() {
		document.querySelectorAll(".reg-detail .d-inp").forEach((el) => {
			el.addEventListener("input", () => {
				const s = stakeholders.find((x) => x.id === el.dataset.id);
				if (!s) return;
				s[el.dataset.field] = el.value;
				liveHeaderUpdate(s);
			});
		});
		document.querySelectorAll(".reg-detail .d-sel").forEach((el) => {
			el.addEventListener("change", () => {
				const s = stakeholders.find((x) => x.id === el.dataset.id);
				if (!s) return;
				const f = el.dataset.field;
				s[f] = el.value;
				selectedId = s.id;
				render();
			});
		});
		document.querySelectorAll(".reg-detail .d-sld").forEach((el) => {
			el.addEventListener("input", () => {
				const s = stakeholders.find((x) => x.id === el.dataset.id);
				if (!s) return;
				s[el.dataset.field] = Number(el.value);
				const badge = el.closest(".slider-field").querySelector(".d-val");
				if (badge) badge.textContent = String(s[el.dataset.field]);
				liveHeaderUpdate(s);
				liveSalienceBadge(s);
				liveStats();
			});
		});
		document.querySelectorAll(".reg-detail .d-pc").forEach((el) => {
			el.addEventListener("change", () => {
				const s = stakeholders.find((x) => x.id === el.dataset.id);
				if (!s) return;
				if (!s.powerCriteria) s.powerCriteria = {
					pos: 3,
					res: 3,
					net: 3,
					veto: 3,
					expert: 3
				};
				s.powerCriteria[el.dataset.crit] = Number(el.value);
				recomputePower(s);
				liveHeaderUpdate(s);
				liveSalienceBadge(s);
				liveStats();
				livePowerPanel(s);
			});
		});
		document.querySelectorAll(".reg-detail .d-ic").forEach((el) => {
			el.addEventListener("change", () => {
				const s = stakeholders.find((x) => x.id === el.dataset.id);
				if (!s) return;
				if (!s.interestCriteria) s.interestCriteria = {
					afect: 3,
					stake: 3,
					align: 3,
					prox: 3,
					atten: 3
				};
				s.interestCriteria[el.dataset.crit] = Number(el.value);
				recomputeInterest(s);
				liveHeaderUpdate(s);
				liveStats();
				liveInterestPanel(s);
			});
		});
		document.querySelectorAll(".reg-detail .d-del").forEach((el) => {
			el.addEventListener("click", () => {
				selectedId = el.dataset.id;
				deleteSelected();
			});
		});
	}
	function liveHeaderUpdate(s) {
		const card = document.querySelector(`.reg-card[data-id="${s.id}"]`);
		if (!card) return;
		const nm = card.querySelector(".reg-namewrap .sh-name");
		if (nm) nm.textContent = s.name;
		const og = card.querySelector(".reg-namewrap .sh-org");
		if (og) og.textContent = (s.org || "—") + (s.role ? " · " + s.role : "");
		const qp = card.querySelector(".q-power");
		if (qp) qp.textContent = String(s.power);
		const qi = card.querySelector(".q-interest");
		if (qi) qi.textContent = String(s.interest);
	}
	function liveSalienceBadge(s) {
		const card = document.querySelector(`.reg-card[data-id="${s.id}"]`);
		if (!card) return;
		const b = card.querySelector(".sal-badge");
		if (b) {
			const t = salienceType(s);
			b.textContent = "Prominencia: " + SAL_INFO[t].t;
			b.style.background = salColor(t);
		}
	}
	function livePowerPanel(s) {
		const card = document.querySelector(`.reg-card[data-id="${s.id}"]`);
		if (!card) return;
		const raw = powerLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
		const info = POWER_LEVELS[lvl] || POWER_LEVELS[3];
		const badge = card.querySelector(".pl-badge");
		if (badge) {
			badge.textContent = `Nivel ${lvl} · ${info.t}`;
			badge.className = "pl-badge pl-" + lvl;
		}
		const num = card.querySelector(".pl-num");
		if (num) num.innerHTML = `${pct}<i>/100</i>`;
		const desc = card.querySelector(".power-desc");
		if (desc) desc.textContent = info.d;
	}
	function liveInterestPanel(s) {
		const card = document.querySelector(`.reg-card[data-id="${s.id}"]`);
		if (!card) return;
		const raw = interestLevel(s), lvl = Math.round(raw), pct = Math.round((raw - 1) / 4 * 100);
		const info = INTEREST_LEVELS[lvl] || INTEREST_LEVELS[3];
		const badge = card.querySelector(".il-badge");
		if (badge) {
			badge.textContent = `Nivel ${lvl} · ${info.t}`;
			badge.className = "il-badge pl-" + lvl;
		}
		const num = card.querySelector(".il-num");
		if (num) num.innerHTML = `${pct}<i>/100</i>`;
		const desc = card.querySelector(".interest-desc");
		if (desc) desc.textContent = info.d;
	}
	function liveStats() {
		const vals = document.querySelectorAll("#sidebar .stat .v");
		if (vals.length < 3) return;
		vals[0].textContent = String(stakeholders.length);
		vals[1].textContent = String(stakeholders.filter((s) => s.power >= THRESHOLD && s.interest >= THRESHOLD).length);
		vals[2].textContent = String(stakeholders.filter((s) => salienceType(s) === "definitivo").length);
	}
	function wireSidebar() {
		const s = getSel();
		if (!s) return;
		const bind = (id, field, isNum) => {
			const el = document.getElementById(id);
			if (!el) return;
			el.addEventListener("input", () => {
				s[field] = isNum ? Number(el.value) : el.value;
				softRefresh();
			});
		};
		bind("f_name", "name", false);
		bind("f_org", "org", false);
		bind("f_role", "role", false);
		const cat = document.getElementById("f_category");
		if (cat) cat.addEventListener("change", () => {
			s.category = cat.value;
			render();
		});
		document.querySelectorAll(".sld").forEach((sld) => {
			sld.addEventListener("input", () => {
				const f = sld.dataset.field;
				s[f] = Number(sld.value);
				const badge = document.getElementById("v_" + f);
				if (badge) badge.textContent = String(s[f]);
				rerenderChartOnly();
			});
		});
		const dsb = document.getElementById("btnDeleteSb");
		if (dsb) dsb.addEventListener("click", deleteSelected);
	}
	function softRefresh() {
		if (currentView === "registro") {
			const s = getSel();
			const row = document.querySelector(`tr.row[data-id="${selectedId}"]`);
			if (row && s) {
				row.querySelector(".sh-name").textContent = s.name;
				row.querySelector(".sh-org").textContent = (s.org || "—") + (s.role ? " · " + s.role : "");
			}
		}
	}
	function rerenderChartOnly() {
		const main = document.getElementById("mainArea");
		const scrollY = main.scrollTop;
		if (currentView === "poderInteres") main.innerHTML = renderPowerInterest();
		else if (currentView === "prominencia") main.innerHTML = renderSalience();
		else if (currentView === "registro") {
			softRefresh();
			return;
		} else return;
		main.scrollTop = scrollY;
		wireMainInteractions();
	}
	function deleteSelected() {
		const s = getSel();
		if (!s) return;
		showConfirm(`¿Eliminar a «${s.name}» del análisis? Esta acción no se puede deshacer.`).then((ok) => {
			if (!ok) return;
			const idx = stakeholders.findIndex((x) => x.id === selectedId);
			if (idx > -1) {
				expandedIds.delete(selectedId);
				stakeholders.splice(idx, 1);
			}
			selectedId = stakeholders.length ? stakeholders[Math.max(0, idx - 1)].id : null;
			render();
			setStatus("Interesado eliminado.");
		});
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
			const cleanup = (r) => {
				overlay.classList.remove("open");
				confirmBtn.onclick = null;
				cancelBtn.onclick = null;
				overlay.onclick = null;
				document.removeEventListener("keydown", onKey);
				resolve(r);
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
	function exportCsv() {
		const cols = [
			"name",
			"org",
			"role",
			"category",
			"power",
			"interest",
			"legitimacy",
			"urgency"
		];
		const head = [
			"Nombre",
			"Organizacion",
			"Rol",
			"Categoria",
			"Poder",
			"Interes",
			"Legitimidad",
			"Urgencia",
			"Poder_Posicional",
			"Poder_Recursos",
			"Poder_Red",
			"Poder_Veto",
			"Poder_Experto",
			"Poder_Nivel",
			"Interes_Afectacion",
			"Interes_Stake",
			"Interes_Alineacion",
			"Interes_Proximidad",
			"Interes_Atencion",
			"Interes_Nivel",
			"Prominencia",
			"Compromiso_Actual",
			"Compromiso_Deseado",
			"Compromiso_Brecha",
			"Compromiso_Prioridad",
			"Compromiso_Estrategia",
			"Compromiso_Responsable"
		];
		const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`;
		const lines = [head.join(",")];
		stakeholders.forEach((s) => {
			const pc = s.powerCriteria || {}, ic = s.interestCriteria || {};
			const row = cols.map((c) => esc(s[c]));
			row.push(esc(pc.pos), esc(pc.res), esc(pc.net), esc(pc.veto), esc(pc.expert), esc(Math.round(powerLevel(s))));
			row.push(esc(ic.afect), esc(ic.stake), esc(ic.align), esc(ic.prox), esc(ic.atten), esc(Math.round(interestLevel(s))));
			row.push(esc(SAL_INFO[salienceType(s)].t));
			const gap = engagementGap(s), pr = engagementPriority(s);
			row.push(esc(levelName(s.engCurrent)), esc(levelName(s.engDesired)), esc(gap === null ? "" : gap), esc(pr ? pr.level + " (" + pr.score + ")" : ""), esc(s.engStrategy), esc(s.engOwner));
			lines.push(row.join(","));
		});
		const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "interesados.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Registro exportado como CSV.");
	}
	function wireToolbar() {
		document.getElementById("btnAdd").addEventListener("click", () => {
			const id = newStakeholder({ name: "Nuevo interesado " + (stakeholders.length + 1) });
			selectedId = id;
			if (currentView === "registro") expandedIds.add(id);
			render();
			const card = document.querySelector(`.reg-card[data-id="${id}"]`);
			if (card) card.scrollIntoView({
				behavior: "smooth",
				block: "center"
			});
			setStatus("Interesado agregado. Edita sus atributos en la tarjeta desplegada.");
		});
		document.getElementById("btnDelete").addEventListener("click", deleteSelected);
		document.querySelectorAll("#viewGroup .btn").forEach((b) => {
			b.addEventListener("click", () => {
				currentView = b.dataset.view;
				render();
				const m = document.getElementById("mainArea");
				if (m) m.scrollTop = 0;
			});
		});
		document.getElementById("btnExportCsv").addEventListener("click", exportCsv);
		document.getElementById("btnPrint").addEventListener("click", () => window.print());
		document.getElementById("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el análisis actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (ok) {
					loadSample();
					render();
					setStatus("Caso de ejemplo cargado.");
				}
			});
		});
		document.getElementById("btnReset").addEventListener("click", () => {
			showConfirm("Esto borrará todos los interesados y empezará un análisis nuevo. ¿Continuar?", "Nuevo análisis").then((ok) => {
				if (ok) {
					blankAnalysis();
					currentView = "registro";
					render();
					setStatus("Nuevo análisis iniciado.");
				}
			});
		});
	}
	loadSample();
	wireToolbar();
	render();
	(function gpiBridge() {
		if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
		const proj = window.GPI.active();
		const titleEl = document.getElementById("projectTitle");
		const courseEl = document.getElementById("courseTitle");
		let loadedProjectId = null;
		let session = null;
		let projectStale = false;
		function markProjectStale() {
			if (projectStale) return;
			projectStale = true;
			setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
			const banner = document.getElementById("banner");
			if (banner) {
				banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar los interesados aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
				banner.classList.add("show");
			}
		}
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("stakeholders");
			if (p.meta) {
				if (p.meta.name) titleEl.value = p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			const mod = p.modules && p.modules.stakeholders;
			if (mod && Array.isArray(mod.stakeholders) && mod.stakeholders.length) {
				stakeholders = mod.stakeholders;
				if (mod.powerWeights) Object.assign(powerWeights, mod.powerWeights);
				if (mod.interestWeights) Object.assign(interestWeights, mod.interestWeights);
				idCounter = mod.idCounter || stakeholders.length + 1;
				stakeholders.forEach((s) => {
					s.powerCriteria = Object.assign({
						pos: 3,
						res: 3,
						net: 3,
						veto: 3,
						expert: 3
					}, s.powerCriteria || {});
					s.interestCriteria = Object.assign({
						afect: 3,
						stake: 3,
						align: 3,
						prox: 3,
						atten: 3
					}, s.interestCriteria || {});
					recomputePower(s);
					recomputeInterest(s);
				});
				selectedId = stakeholders.length ? stakeholders[0].id : null;
				expandedIds = /* @__PURE__ */ new Set();
				window.GPI.rebaseSession(session, {
					stakeholders,
					powerWeights,
					interestWeights,
					idCounter
				});
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				blankAnalysis();
				render();
				setStatus("Proyecto sin interesados todavía. Regístralos aquí, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "stakeholders", "Los interesados", {
				stakeholders,
				powerWeights,
				interestWeights,
				idCounter
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
		if (proj) pull();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
		});
		window.GPI.onChange(() => {
			const p = window.GPI.active();
			if (!p || !p.meta) return;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				if (document.hidden) {
					pull();
					return;
				}
				markProjectStale();
				return;
			}
			if (p.meta.name && document.activeElement !== titleEl) titleEl.value = p.meta.name;
			if (p.meta.course && document.activeElement !== courseEl) courseEl.value = p.meta.course;
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	})();
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
			const m = window.GPI && window.GPI.available() ? window.GPI.meta() : null;
			if (m) meta = m;
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
	function buildReport() {
		function quad(s) {
			const P = Number(s.power) >= 50, I = Number(s.interest) >= 50;
			if (P && I) return "Gestionar de cerca";
			if (P) return "Mantener satisfecho";
			if (I) return "Mantener informado";
			return "Monitorear";
		}
		const counts = {
			"Gestionar de cerca": 0,
			"Mantener satisfecho": 0,
			"Mantener informado": 0,
			"Monitorear": 0
		};
		const catCounts = {};
		stakeholders.forEach((s) => {
			counts[quad(s)]++;
			const c = s.category || "Sin categoría";
			catCounts[c] = (catCounts[c] || 0) + 1;
		});
		reportShell("Registro y Análisis de Interesados", "Stakeholder Studio · Gestión de Interesados", "<h2>1. Resumen</h2><table class=\"rep-kv\"><tr><td>Interesados registrados</td><td><b>" + stakeholders.length + "</b></td></tr><tr><td>Por cuadrante poder–interés</td><td>" + Object.keys(counts).map((k) => k + ": <b>" + counts[k] + "</b>").join(" · ") + "</td></tr><tr><td>Por categoría</td><td>" + (Object.keys(catCounts).map((k) => escapeHtml(k) + ": <b>" + catCounts[k] + "</b>").join(" · ") || "—") + "</td></tr></table><h2>2. Registro y análisis de interesados</h2><p class=\"rep-note\">El poder y el interés (0–100) son valores derivados del análisis multicriterio ponderado (nunca editados a mano). El cuadrante usa el umbral 50 y la prominencia sigue el modelo de Mitchell, Agle y Wood (poder, legitimidad, urgencia).</p><table><tr><th>Interesado</th><th>Organización / rol</th><th style=\"width:9%\">Categoría</th><th style=\"width:6%\">Poder</th><th style=\"width:6%\">Interés</th><th style=\"width:14%\">Cuadrante</th><th style=\"width:14%\">Prominencia</th></tr>" + (stakeholders.map((s) => {
			const t = salienceType(s);
			return "<tr><td><b>" + escapeHtml(s.name) + "</b></td><td>" + escapeHtml([s.org, s.role].filter((x) => x).join(" — ") || "—") + "</td><td>" + escapeHtml(s.category || "—") + "</td><td class=\"num\" style=\"text-align:center\">" + (Number(s.power) || 0) + "</td><td class=\"num\" style=\"text-align:center\">" + (Number(s.interest) || 0) + "</td><td>" + quad(s) + "</td><td>" + escapeHtml(SAL_INFO[t].t) + "</td></tr>";
		}).join("") || "<tr><td colspan=\"7\" class=\"rep-note\">— Sin interesados registrados —</td></tr>") + "</table><h2>3. Evaluación del compromiso de los interesados</h2><p class=\"rep-note\">Compromiso actual frente al deseado (PMI, matriz de evaluación del compromiso). Brecha = deseado − actual; la prioridad pondera la brecha por el poder (brecha × poder / 100). Los niveles los evalúa el equipo: «Sin evaluar» significa que aún no se valoró.</p>" + (function() {
			const sm = engagementSummary(stakeholders);
			return "<table class=\"rep-kv\"><tr><td>Evaluados</td><td><b>" + sm.assessed + "/" + sm.total + "</b> (" + sm.coveragePct + "%)</td></tr><tr><td>Con brecha por cerrar</td><td><b>" + sm.withGap + "</b>" + (sm.withGapNoStrategy ? " · sin estrategia: <b>" + sm.withGapNoStrategy + "</b>" : "") + "</td></tr><tr><td>Poder alto con postura reticente o desconocedora</td><td><b>" + sm.highPowerResistant + "</b></td></tr></table>";
		})() + "<table><tr><th>Interesado</th><th style=\"width:11%\">Actual</th><th style=\"width:11%\">Deseado</th><th style=\"width:7%\">Brecha</th><th style=\"width:10%\">Prioridad</th><th>Estrategia</th><th style=\"width:14%\">Responsable</th></tr>" + (stakeholders.map((s) => {
			const g = engagementGap(s), p = engagementPriority(s);
			return "<tr><td><b>" + escapeHtml(s.name) + "</b></td><td>" + escapeHtml(levelName(s.engCurrent)) + "</td><td>" + escapeHtml(levelName(s.engDesired)) + "</td><td class=\"num\" style=\"text-align:center\">" + (g === null ? "—" : g > 0 ? "+" + g : g) + "</td><td>" + (p ? p.level + " · " + p.score : "—") + "</td><td>" + escapeHtml(s.engStrategy || "—") + "</td><td>" + escapeHtml(s.engOwner || "—") + "</td></tr>";
		}).join("") || "<tr><td colspan=\"7\" class=\"rep-note\">— Sin interesados registrados —</td></tr>") + "</table>");
	}
	(function() {
		const b = document.getElementById("btnReport");
		if (b) b.addEventListener("click", buildReport);
	})();
	//#endregion
})();
