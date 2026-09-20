(function() {
	//#region src/modules/project-charter/main.ts
	var OBJ_DIMS = [
		"Alcance",
		"Cronograma",
		"Costo",
		"Calidad",
		"Otro"
	];
	var CUR = {
		USD: "USD $",
		PEN: "S/",
		EUR: "€"
	};
	function defaultState() {
		return {
			identification: {
				preparedDate: "",
				sponsor: "",
				manager: "",
				deputy: "",
				client: "",
				approach: "",
				language: "",
				authority: ""
			},
			purpose: "",
			businessCase: {
				justification: "",
				investment: "",
				annualBenefit: "",
				payback: "",
				indicators: "",
				intangibles: ""
			},
			description: "",
			boundaries: "",
			objectives: [
				{
					dim: "Alcance",
					objective: "",
					criteria: ""
				},
				{
					dim: "Cronograma",
					objective: "",
					criteria: ""
				},
				{
					dim: "Costo",
					objective: "",
					criteria: ""
				}
			],
			requirements: [],
			deliverables: [],
			milestones: [],
			budget: {
				amount: "",
				currency: "USD",
				fundingNotes: ""
			},
			preAssignedResources: [],
			risks: [],
			assumptions: [],
			constraints: [],
			exclusions: [],
			stakeholders: [],
			approvalRequirements: [],
			exitCriteria: [],
			sponsors: [],
			approval: {
				sponsorName: "",
				sponsorDate: "",
				managerName: "",
				managerDate: ""
			}
		};
	}
	function sampleState() {
		return {
			identification: {
				preparedDate: "2026-07-06",
				sponsor: "Gerencia General DISTRIB+",
				manager: "Director de Proyecto (por designar en el OBS)",
				deputy: "Coordinador Técnico de Obra (por designar)",
				client: "DISTRIB+ S.A. (uso interno — operación logística)",
				approach: "Predictivo",
				language: "Español",
				authority: "El Director de Proyecto puede aprobar cambios de hasta el 2% del CAPEX sin escalar al Sponsor, contratar servicios menores dentro del presupuesto aprobado y aceptar entregables intermedios. Los cambios de alcance, plazo total o presupuesto por encima de ese umbral requieren aprobación del Comité de Control de Cambios y del Sponsor."
			},
			purpose: "DISTRIB+ S.A. necesita ampliar su capacidad de almacenamiento y despacho en Lima Sur para sostener el crecimiento de su cartera de distribución. El propósito del proyecto es construir y poner en marcha un almacén logístico en Lurín que permita consolidar operaciones hoy tercerizadas, reducir el costo logístico unitario y mejorar los tiempos de atención a los clientes de la zona sur.",
			businessCase: {
				justification: "Hoy DISTRIB+ terceriza el almacenamiento y despacho de la zona sur en operadores logísticos externos, con un costo aproximado de USD 2.6 millones al año y sin control sobre los tiempos de atención. Con almacén propio, el costo operativo anual estimado baja a USD 1.4 millones. Se evaluaron tres alternativas: (a) mantener la tercerización, (b) alquilar un almacén existente y (c) construir en terreno propio. La opción (c) es la de mayor inversión inicial pero la única que asegura la capacidad y el layout que exige la operación proyectada a 10 años.",
				investment: "USD 8.5 millones (CAPEX)",
				annualBenefit: "USD 1.2 millones / año (ahorro operativo)",
				payback: "≈ 7.1 años (solo por ahorro operativo)",
				indicators: "VAN positivo a 10 años con tasa de descuento del 12%; TIR estimada 14.5%",
				intangibles: "Control directo sobre los niveles de servicio y los tiempos de despacho; capacidad de crecer sin renegociar con terceros; activo inmobiliario propio que revaloriza; menor exposición a la variación de tarifas del mercado logístico."
			},
			description: "El proyecto comprende la ingeniería, procura, construcción y puesta en marcha de un almacén logístico de estructura metálica prefabricada sobre un terreno propio en Lurín, incluyendo movimiento de tierras, cimentaciones, estructura y cobertura, acabados, instalaciones MEP, patio de maniobras y las pruebas de instalaciones previas a la entrega. La gestión sigue las buenas prácticas del PMBOK y los estándares de AACE International usados en el curso.",
			boundaries: "El proyecto abarca desde la aprobación de esta acta hasta la firma del acta de entrega final (dossier de calidad incluido). Incluye la obtención de permisos y licencias municipales de construcción. No incluye la operación logística posterior, la contratación del personal de operación, ni la implementación del sistema de gestión de almacenes (WMS), que corresponden a la organización funcional de DISTRIB+ S.A.",
			objectives: [
				{
					dim: "Alcance",
					objective: "Entregar el almacén logístico completo y operativo según la ingeniería aprobada",
					criteria: "100% de los entregables de la EDT aceptados; dossier de calidad sin observaciones mayores"
				},
				{
					dim: "Cronograma",
					objective: "Concluir el proyecto en 4 meses (julio–noviembre 2026)",
					criteria: "Entrega final a más tardar el 06/11/2026; SPI ≥ 0.95 en los cortes de control"
				},
				{
					dim: "Costo",
					objective: "Ejecutar el proyecto dentro del CAPEX autorizado de USD 8.5 millones",
					criteria: "Costo final ≤ 100% del presupuesto (contingencia incluida); CPI ≥ 0.95"
				},
				{
					dim: "Calidad",
					objective: "Construir conforme al Reglamento Nacional de Edificaciones y a las especificaciones técnicas",
					criteria: "Pruebas de instalaciones conformes; cero no conformidades abiertas al cierre"
				}
			],
			requirements: [
				{
					id: "ran1",
					code: "RAN.01",
					text: "Nave de almacenamiento con altura libre y capacidad de racks conforme a la ingeniería de detalle aprobada."
				},
				{
					id: "ran2",
					code: "RAN.02",
					text: "Cumplimiento del Reglamento Nacional de Edificaciones y de la normativa de seguridad (INDECI)."
				},
				{
					id: "ran3",
					code: "RAN.03",
					text: "Instalaciones eléctricas y sanitarias dimensionadas para la operación logística proyectada."
				},
				{
					id: "ran4",
					code: "RAN.04",
					text: "Patio de maniobras apto para vehículos de carga pesada."
				}
			],
			deliverables: [
				"Expediente técnico de ingeniería (estudio de suelos, diseño estructural, diseño MEP).",
				"Permisos y licencias municipales de construcción aprobados.",
				"Obra civil y estructura del almacén concluidas (nave, cobertura, acabados).",
				"Instalaciones MEP operativas y probadas.",
				"Dossier de calidad y acta de entrega final firmada."
			],
			milestones: [
				{
					name: "Acta de constitución aprobada",
					date: "2026-07-08"
				},
				{
					name: "Fin de Ingeniería y Diseño",
					date: "2026-08-14"
				},
				{
					name: "Permisos y licencias municipales aprobados",
					date: "2026-08-21"
				},
				{
					name: "Fin de Procura (estructuras metálicas en obra)",
					date: "2026-08-26"
				},
				{
					name: "Fin de Construcción",
					date: "2026-10-23"
				},
				{
					name: "Entrega final y acta de cierre",
					date: "2026-11-06"
				}
			],
			budget: {
				amount: "8500000",
				currency: "USD",
				fundingNotes: "70% financiamiento bancario (BCP) con desembolsos contra hitos de obra valorizados; 30% recursos propios de DISTRIB+ S.A. La contingencia de costo se gestiona según el plan de gestión de riesgos del curso."
			},
			preAssignedResources: [
				"Jefatura de Proyectos e Infraestructura: 1 Director de Proyecto a dedicación completa.",
				"Área de Ingeniería: 1 coordinador de diseño, 1 ingeniero estructural y 1 ingeniero MEP a media dedicación.",
				"Supervisión de obra externa: 1 residente y 1 supervisor HSE (contratados para la etapa de construcción).",
				"Área de Logística y Compras: apoyo en licitación, contratos y procura de equipos.",
				"Asesoría Legal: gestión de permisos, licencias municipales y contratos con el contratista EPC.",
				"Terreno propio de 12 000 m² en Lurín, ya saneado e inscrito a nombre de DISTRIB+ S.A."
			],
			risks: [
				"Condiciones geotécnicas desfavorables en cimentaciones que incrementen costo y plazo.",
				"Demora en la aprobación de permisos y licencias municipales.",
				"Variación del tipo de cambio y del precio del acero que erosione el presupuesto de procura.",
				"Conflictos con la comunidad o paralizaciones sindicales durante la construcción."
			],
			assumptions: [
				"El terreno de Lurín está saneado legalmente y disponible desde el inicio del proyecto.",
				"Los proveedores de estructuras metálicas cumplen los lead times contractuales.",
				"La municipalidad de Lurín procesa la licencia de construcción dentro del plazo regular.",
				"No se producen restricciones logísticas mayores en el corredor Lima Sur durante la obra."
			],
			constraints: [
				"CAPEX máximo autorizado: USD 8.5 millones (incluida contingencia).",
				"Fecha límite de entrega: 06/11/2026, antes de la campaña logística de fin de año.",
				"La obra debe ejecutarse sin interrumpir la operación del local vecino de DISTRIB+ S.A.",
				"Cumplimiento obligatorio de la normativa ambiental (OEFA) y laboral (SUNAFIL)."
			],
			exclusions: [
				"Operación logística y contratación del personal del almacén.",
				"Implementación del sistema de gestión de almacenes (WMS) y equipamiento de racks.",
				"Proyectos paralelos de DISTRIB+ S.A. fuera del almacén de Lurín."
			],
			stakeholders: [
				{
					name: "Gerencia General DISTRIB+",
					role: "Patrocinador (Sponsor)",
					expectation: "Proyecto dentro del CAPEX y operativo antes de la campaña de fin de año."
				},
				{
					name: "Banco financista (BCP)",
					role: "Financiamiento del proyecto",
					expectation: "Desembolsos contra avance verificable y control de costos riguroso."
				},
				{
					name: "Constructora principal (Contratista EPC)",
					role: "Ejecución de obra",
					expectation: "Ingeniería aprobada a tiempo y frente de obra liberado según cronograma."
				},
				{
					name: "Municipalidad de Lurín",
					role: "Licencias y permisos",
					expectation: "Expediente técnico completo y cumplimiento de la normativa municipal."
				},
				{
					name: "Junta de vecinos de Lurín",
					role: "Comunidad del entorno",
					expectation: "Obra sin impactos de ruido, polvo ni tránsito fuera de horario permitido."
				}
			],
			approvalRequirements: [
				{
					item: "Ingeniería de detalle y especificaciones técnicas",
					approver: "Gerencia de Operaciones + Director de Proyecto",
					criteria: "Planos y memorias firmados por el proyectista; revisión sin observaciones mayores"
				},
				{
					item: "Presupuesto y línea base de costos",
					approver: "Gerencia General (Sponsor)",
					criteria: "Estimado clase 3 (AACE 17R-97) aprobado con contingencia sustentada"
				},
				{
					item: "Adjudicación del contrato de obra",
					approver: "Comité de Adquisiciones",
					criteria: "Acta de buena pro con evaluación técnico-económica documentada"
				},
				{
					item: "Recepción de obra y puesta en marcha",
					approver: "Gerencia de Operaciones",
					criteria: "Pruebas de instalaciones conformes y dossier de calidad completo"
				}
			],
			exitCriteria: [
				"Almacén construido, con licencia de funcionamiento vigente y pruebas de instalaciones conformes.",
				"Dossier de calidad, planos as-built y manuales de operación y mantenimiento entregados y aceptados.",
				"Acta de entrega final firmada por la Gerencia de Operaciones, sin observaciones abiertas.",
				"Objetivos de plazo, costo y calidad cumplidos dentro de los umbrales declarados en esta acta.",
				"Cierre anticipado: si se demuestra que el proyecto no puede alcanzar el caso de negocio con un plan realista, se recomendará su cierre y la reevaluación de alternativas ante el Sponsor."
			],
			sponsors: [
				{
					name: "Gerencia General DISTRIB+ S.A.",
					role: "Patrocinador ejecutivo — autoriza el proyecto y el CAPEX"
				},
				{
					name: "Gerencia de Operaciones y Logística",
					role: "Patrocinador funcional — define los requisitos operativos y recibe el activo"
				},
				{
					name: "Gerencia de Administración y Finanzas",
					role: "Valida el caso de negocio y asegura el financiamiento"
				}
			],
			approval: {
				sponsorName: "Gerencia General DISTRIB+ (Sponsor)",
				sponsorDate: "2026-07-08",
				managerName: "Director de Proyecto — DPLU-2026",
				managerDate: "2026-07-08"
			}
		};
	}
	function normalizeState(obj) {
		const base = defaultState();
		if (!obj || typeof obj !== "object") return base;
		const out = base;
		[
			"purpose",
			"description",
			"boundaries"
		].forEach((k) => {
			if (typeof obj[k] === "string") out[k] = obj[k];
		});
		out.identification = Object.assign(out.identification, obj.identification || {});
		out.budget = Object.assign(out.budget, obj.budget || {});
		out.approval = Object.assign(out.approval, obj.approval || {});
		out.businessCase = Object.assign(out.businessCase, obj.businessCase || {});
		[
			"objectives",
			"requirements",
			"deliverables",
			"milestones",
			"risks",
			"assumptions",
			"constraints",
			"exclusions",
			"stakeholders",
			"preAssignedResources",
			"approvalRequirements",
			"exitCriteria",
			"sponsors"
		].forEach((k) => {
			if (Array.isArray(obj[k])) out[k] = obj[k];
		});
		out.requirements = migrateRequirements(out.requirements);
		return out;
	}
	function ranPad(n) {
		const num = Number(n) || 0;
		return (num < 10 ? "0" : "") + num;
	}
	function migrateRequirements(arr) {
		const list = Array.isArray(arr) ? arr : [];
		let maxNum = 0;
		list.forEach((r) => {
			if (r && typeof r === "object" && r.code) {
				const m = /RAN\.0*(\d+)/.exec(r.code);
				if (m) maxNum = Math.max(maxNum, Number(m[1]));
			}
		});
		return list.map((r) => {
			if (r && typeof r === "object") {
				if (!r.code) {
					maxNum++;
					r.code = "RAN." + ranPad(maxNum);
				}
				if (!r.id) r.id = "ran" + (/RAN\.0*(\d+)/.exec(r.code) || [0, maxNum])[1];
				if (typeof r.text !== "string") r.text = "";
				return r;
			}
			maxNum++;
			return {
				id: "ran" + maxNum,
				code: "RAN." + ranPad(maxNum),
				text: String(r == null ? "" : r)
			};
		});
	}
	function nextRanCode() {
		let maxNum = 0;
		(state.requirements || []).forEach((r) => {
			const m = r && r.code && /RAN\.0*(\d+)/.exec(r.code);
			if (m) maxNum = Math.max(maxNum, Number(m[1]));
		});
		return {
			num: maxNum + 1,
			code: "RAN." + ranPad(maxNum + 1)
		};
	}
	var state = defaultState();
	var loadedProjectId = null;
	var session = null;
	var projectStale = false;
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	function setStatus(m) {
		document.getElementById("statusLeft").textContent = m;
	}
	function repDate(s) {
		if (!s) return "—";
		const p = String(s).split("-");
		return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s;
	}
	function money(v, cur) {
		const n = Number(v);
		if (!isFinite(n) || !v && v !== 0) return "—";
		return (CUR[cur] || "$") + " " + n.toLocaleString("es-PE");
	}
	function getPath(path) {
		return path.split(".").reduce((o, k) => o == null ? o : o[k], state);
	}
	function setPath(path, val) {
		const keys = path.split(".");
		let o = state;
		for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] = o[keys[i]] || {};
		o[keys[keys.length - 1]] = val;
	}
	function showModal(opts) {
		return new Promise((resolve) => {
			const ov = document.getElementById("modalOverlay");
			document.getElementById("modalTitle").textContent = opts.title || "";
			document.getElementById("modalMsg").textContent = opts.message || "";
			const ok = document.getElementById("modalOk"), cancel = document.getElementById("modalCancel");
			ok.textContent = opts.confirmText || "Aceptar";
			ok.className = "btn " + (opts.danger ? "danger" : "primary");
			cancel.style.display = opts.cancelText === null ? "none" : "";
			cancel.textContent = opts.cancelText || "Cancelar";
			function done(v) {
				ov.classList.remove("open");
				ok.onclick = cancel.onclick = null;
				ov.onclick = null;
				document.removeEventListener("keydown", key);
				resolve(v);
			}
			function key(e) {
				if (e.key === "Escape") {
					done(false);
					return;
				}
				if (e.key === "Enter") {
					done(true);
					return;
				}
				if (e.key !== "Tab") return;
				const card = ov.querySelector(".modal-card");
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
			}
			ok.onclick = () => {
				done(true);
			};
			cancel.onclick = () => {
				done(false);
			};
			ov.onclick = (e) => {
				if (e.target === ov) done(false);
			};
			document.addEventListener("keydown", key);
			ov.classList.add("open");
			ok.focus();
		});
	}
	function showConfirm(message, title) {
		return showModal({
			title: title || "Confirmar acción",
			message,
			confirmText: "Continuar",
			cancelText: "Cancelar"
		});
	}
	function showAlert(message, title) {
		return showModal({
			title: title || "Aviso",
			message,
			confirmText: "Entendido",
			cancelText: null
		});
	}
	function localAudit(ch) {
		const c = ch || {};
		const id = c.identification || {}, bud = c.budget || {}, ap = c.approval || {}, bc = c.businessCase || {};
		const objs = c.objectives || [], reqs = c.requirements || [], dels = c.deliverables || [], mil = c.milestones || [], risks = c.risks || [], asum = c.assumptions || [], cons = c.constraints || [], excl = c.exclusions || [], sh = c.stakeholders || [], pre = c.preAssignedResources || [], areq = c.approvalRequirements || [], exitc = c.exitCriteria || [], spon = c.sponsors || [];
		function nz(s) {
			return !!(s && String(s).trim());
		}
		function hasObj(dim) {
			return objs.some((o) => o && o.dim === dim && nz(o.objective) && nz(o.criteria));
		}
		const items = [
			{
				id: "roles",
				cat: "Identificación",
				label: "Patrocinador y Director de Proyecto declarados",
				ok: nz(id.sponsor) && nz(id.manager)
			},
			{
				id: "contexto",
				cat: "Identificación",
				label: "Cliente y fecha de preparación registrados",
				ok: nz(id.client) && nz(id.preparedDate)
			},
			{
				id: "autoridad",
				cat: "Identificación",
				label: "Nivel de autoridad del Director de Proyecto definido",
				ok: nz(id.authority)
			},
			{
				id: "enfoque",
				cat: "Identificación",
				label: "Enfoque de desarrollo declarado (predictivo / ágil / híbrido)",
				ok: nz(id.approach)
			},
			{
				id: "proposito",
				cat: "Justificación y alcance",
				label: "Propósito o justificación del proyecto",
				ok: nz(c.purpose)
			},
			{
				id: "casonegocio",
				cat: "Justificación y alcance",
				label: "Caso de negocio: justificación económica e inversión estimada",
				ok: nz(bc.justification) && nz(bc.investment)
			},
			{
				id: "descripcion",
				cat: "Justificación y alcance",
				label: "Descripción de alto nivel del proyecto",
				ok: nz(c.description)
			},
			{
				id: "limites",
				cat: "Justificación y alcance",
				label: "Límites del proyecto declarados",
				ok: nz(c.boundaries)
			},
			{
				id: "requisitos",
				cat: "Justificación y alcance",
				label: "Requisitos de alto nivel registrados",
				ok: reqs.length > 0
			},
			{
				id: "entregables",
				cat: "Justificación y alcance",
				label: "Entregables clave registrados",
				ok: dels.length > 0
			},
			{
				id: "objetivos",
				cat: "Objetivos e hitos",
				label: "Objetivos con criterio de éxito en alcance, cronograma y costo",
				ok: hasObj("Alcance") && hasObj("Cronograma") && hasObj("Costo")
			},
			{
				id: "hitos",
				cat: "Objetivos e hitos",
				label: "Al menos un hito del resumen con fecha",
				ok: mil.some((m) => m && nz(m.name) && nz(m.date))
			},
			{
				id: "presupuesto",
				cat: "Objetivos e hitos",
				label: "Presupuesto preasignado mayor que cero",
				ok: Number(bud.amount) > 0
			},
			{
				id: "riesgos",
				cat: "Riesgos, supuestos y restricciones",
				label: "Riesgo general del proyecto (alto nivel) registrado",
				ok: risks.length > 0
			},
			{
				id: "supuestos",
				cat: "Riesgos, supuestos y restricciones",
				label: "Supuestos del proyecto registrados",
				ok: asum.length > 0
			},
			{
				id: "restricciones",
				cat: "Riesgos, supuestos y restricciones",
				label: "Restricciones del proyecto registradas",
				ok: cons.length > 0
			},
			{
				id: "exclusiones",
				cat: "Riesgos, supuestos y restricciones",
				label: "Exclusiones (fuera del alcance) registradas",
				ok: excl.length > 0
			},
			{
				id: "interesados",
				cat: "Interesados y autorización",
				label: "Interesados clave identificados en el acta",
				ok: sh.length > 0
			},
			{
				id: "recursospre",
				cat: "Recursos y aprobación",
				label: "Recursos preasignados al proyecto declarados",
				ok: pre.length > 0
			},
			{
				id: "reqaprob",
				cat: "Recursos y aprobación",
				label: "Requisitos de aprobación con responsable definido",
				ok: areq.some((r) => r && nz(r.item) && nz(r.approver))
			},
			{
				id: "criteriossalida",
				cat: "Recursos y aprobación",
				label: "Criterios de salida / cierre del proyecto registrados",
				ok: exitc.length > 0
			},
			{
				id: "patrocinadores",
				cat: "Interesados y autorización",
				label: "Patrocinadores que autorizan el proyecto registrados",
				ok: spon.some((s) => s && nz(s.name))
			},
			{
				id: "aprobacion",
				cat: "Interesados y autorización",
				label: "Acta con firmas de Patrocinador y Director de Proyecto",
				ok: nz(ap.sponsorName) && nz(ap.managerName)
			}
		];
		const okCount = items.filter((i) => i.ok).length;
		const total = items.length;
		const pct = total ? Math.round(okCount / total * 100) : 0;
		const st = pct >= 80 ? "verde" : pct >= 50 ? "ambar" : "rojo";
		const cats = {};
		items.forEach((i) => {
			cats[i.cat] = cats[i.cat] || {
				total: 0,
				ok: 0
			};
			cats[i.cat].total++;
			if (i.ok) cats[i.cat].ok++;
		});
		return {
			items,
			okCount,
			total,
			pct,
			state: st,
			categories: cats
		};
	}
	function audit() {
		if (typeof window.GPI !== "undefined" && window.GPI.util && window.GPI.util.charterAudit) return window.GPI.util.charterAudit(state);
		return localAudit(state);
	}
	function hydrateStatics() {
		document.querySelectorAll("[data-bind]").forEach((el) => {
			const v = getPath(el.dataset.bind);
			el.value = v == null ? "" : String(v);
		});
	}
	function wireStatics() {
		document.querySelectorAll("[data-bind]").forEach((el) => {
			el.addEventListener("input", () => {
				setPath(el.dataset.bind, el.value);
				onDirty();
			});
		});
	}
	function renderObjectives() {
		const tb = document.querySelector("#tblObjectives tbody");
		tb.innerHTML = state.objectives.map((o, i) => {
			const opts = OBJ_DIMS.map((d) => "<option value=\"" + d + "\" " + (o.dim === d ? "selected" : "") + ">" + d + "</option>").join("");
			return "<tr><td><select data-obj=\"" + i + "\" data-f=\"dim\">" + opts + "</select></td><td><textarea data-obj=\"" + i + "\" data-f=\"objective\" placeholder=\"Objetivo medible…\">" + esc(o.objective) + "</textarea></td><td><textarea data-obj=\"" + i + "\" data-f=\"criteria\" placeholder=\"Cómo se declara el éxito…\">" + esc(o.criteria) + "</textarea></td><td class=\"rt-del\"><button data-del-obj=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar objetivo\">🗑</button></td></tr>";
		}).join("");
		tb.querySelectorAll("[data-obj]").forEach((el) => {
			el.addEventListener("input", () => {
				state.objectives[Number(el.dataset.obj)][el.dataset.f] = el.value;
				onDirty();
			});
		});
		tb.querySelectorAll("[data-del-obj]").forEach((b) => {
			b.addEventListener("click", () => {
				state.objectives.splice(Number(b.dataset.delObj), 1);
				renderObjectives();
				onDirty();
			});
		});
	}
	function renderMilestones() {
		const tb = document.querySelector("#tblMilestones tbody");
		tb.innerHTML = state.milestones.map((m, i) => {
			return "<tr><td><input data-mil=\"" + i + "\" data-f=\"name\" value=\"" + esc(m.name) + "\" placeholder=\"Nombre del hito\"></td><td><input type=\"date\" data-mil=\"" + i + "\" data-f=\"date\" value=\"" + esc(m.date) + "\"></td><td class=\"rt-del\"><button data-del-mil=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar hito\">🗑</button></td></tr>";
		}).join("");
		tb.querySelectorAll("[data-mil]").forEach((el) => {
			el.addEventListener("input", () => {
				state.milestones[Number(el.dataset.mil)][el.dataset.f] = el.value;
				onDirty();
			});
		});
		tb.querySelectorAll("[data-del-mil]").forEach((b) => {
			b.addEventListener("click", () => {
				state.milestones.splice(Number(b.dataset.delMil), 1);
				renderMilestones();
				onDirty();
			});
		});
	}
	function renderStakeTable() {
		const tb = document.querySelector("#tblStakeholders tbody");
		tb.innerHTML = state.stakeholders.map((s, i) => {
			return "<tr><td><input data-st=\"" + i + "\" data-f=\"name\" value=\"" + esc(s.name) + "\" placeholder=\"Nombre / grupo\"></td><td><input data-st=\"" + i + "\" data-f=\"role\" value=\"" + esc(s.role) + "\" placeholder=\"Rol en el proyecto\"></td><td><textarea data-st=\"" + i + "\" data-f=\"expectation\" placeholder=\"Qué espera del proyecto…\">" + esc(s.expectation) + "</textarea></td><td class=\"rt-del\"><button data-del-st=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar interesado\">🗑</button></td></tr>";
		}).join("");
		tb.querySelectorAll("[data-st]").forEach((el) => {
			el.addEventListener("input", () => {
				state.stakeholders[Number(el.dataset.st)][el.dataset.f] = el.value;
				onDirty();
			});
		});
		tb.querySelectorAll("[data-del-st]").forEach((b) => {
			b.addEventListener("click", () => {
				state.stakeholders.splice(Number(b.dataset.delSt), 1);
				renderStakeTable();
				onDirty();
			});
		});
	}
	function renderApprovalReq() {
		const tb = document.querySelector("#tblApprovalReq tbody");
		if (!tb) return;
		tb.innerHTML = state.approvalRequirements.map((r, i) => {
			return "<tr><td><input data-ar=\"" + i + "\" data-f=\"item\" value=\"" + esc(r.item) + "\" placeholder=\"Entregable, fase o decisión\"></td><td><input data-ar=\"" + i + "\" data-f=\"approver\" value=\"" + esc(r.approver) + "\" placeholder=\"Rol / comité que aprueba\"></td><td><textarea data-ar=\"" + i + "\" data-f=\"criteria\" placeholder=\"Cómo se evidencia la aprobación…\">" + esc(r.criteria) + "</textarea></td><td class=\"rt-del\"><button data-del-ar=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar requisito de aprobación\">🗑</button></td></tr>";
		}).join("");
		tb.querySelectorAll("[data-ar]").forEach((el) => {
			el.addEventListener("input", () => {
				state.approvalRequirements[Number(el.dataset.ar)][el.dataset.f] = el.value;
				onDirty();
			});
		});
		tb.querySelectorAll("[data-del-ar]").forEach((b) => {
			b.addEventListener("click", () => {
				state.approvalRequirements.splice(Number(b.dataset.delAr), 1);
				renderApprovalReq();
				onDirty();
			});
		});
	}
	function renderSponsors() {
		const tb = document.querySelector("#tblSponsors tbody");
		if (!tb) return;
		tb.innerHTML = state.sponsors.map((s, i) => {
			return "<tr><td><input data-sp=\"" + i + "\" data-f=\"name\" value=\"" + esc(s.name) + "\" placeholder=\"Nombre y apellido\"></td><td><input data-sp=\"" + i + "\" data-f=\"role\" value=\"" + esc(s.role) + "\" placeholder=\"Ej.: Patrocinador ejecutivo\"></td><td class=\"rt-del\"><button data-del-sp=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar patrocinador\">🗑</button></td></tr>";
		}).join("");
		tb.querySelectorAll("[data-sp]").forEach((el) => {
			el.addEventListener("input", () => {
				state.sponsors[Number(el.dataset.sp)][el.dataset.f] = el.value;
				onDirty();
			});
		});
		tb.querySelectorAll("[data-del-sp]").forEach((b) => {
			b.addEventListener("click", () => {
				state.sponsors.splice(Number(b.dataset.delSp), 1);
				renderSponsors();
				onDirty();
			});
		});
	}
	var LISTS = {
		deliverables: "listDeliverables",
		preAssignedResources: "listPreAssigned",
		risks: "listRisks",
		assumptions: "listAssumptions",
		constraints: "listConstraints",
		exclusions: "listExclusions",
		exitCriteria: "listExitCriteria"
	};
	function renderList(key) {
		const host = document.getElementById(LISTS[key]);
		host.innerHTML = state[key].map((txt, i) => {
			return "<div class=\"sl-row\"><input data-list=\"" + key + "\" data-i=\"" + i + "\" value=\"" + esc(txt) + "\"><button class=\"row-del\" data-del-list=\"" + key + "\" data-i=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar elemento\">🗑</button></div>";
		}).join("") || "<div style=\"font-size:12px;color:var(--ink-2);padding:2px 0;\">Sin elementos aún.</div>";
		host.querySelectorAll("[data-list]").forEach((el) => {
			el.addEventListener("input", () => {
				state[el.dataset.list][Number(el.dataset.i)] = el.value;
				onDirty();
			});
		});
		host.querySelectorAll("[data-del-list]").forEach((b) => {
			b.addEventListener("click", () => {
				state[b.dataset.delList].splice(Number(b.dataset.i), 1);
				renderList(b.dataset.delList);
				onDirty();
			});
		});
	}
	function renderAllLists() {
		Object.keys(LISTS).forEach(renderList);
		renderRequirements();
	}
	function renderRequirements() {
		const host = document.getElementById("listRequirements");
		if (!host) return;
		state.requirements = migrateRequirements(state.requirements);
		host.innerHTML = state.requirements.map((r, i) => {
			return "<div class=\"sl-row\"><span class=\"ran-code\" title=\"Requisito de alto nivel — código de enlace\">" + esc(r.code) + "</span><input data-req-i=\"" + i + "\" value=\"" + esc(r.text) + "\" placeholder=\"Condición o capacidad que el resultado debe satisfacer…\"><button class=\"row-del\" data-del-req=\"" + i + "\" title=\"Eliminar\" aria-label=\"Eliminar requisito\">🗑</button></div>";
		}).join("") || "<div style=\"font-size:12px;color:var(--ink-2);padding:2px 0;\">Sin requisitos aún.</div>";
		host.querySelectorAll("[data-req-i]").forEach((el) => {
			el.addEventListener("input", () => {
				state.requirements[Number(el.dataset.reqI)].text = el.value;
				onDirty();
			});
		});
		host.querySelectorAll("[data-del-req]").forEach((b) => {
			b.addEventListener("click", () => {
				state.requirements.splice(Number(b.dataset.delReq), 1);
				renderRequirements();
				onDirty();
			});
		});
	}
	function updateSidebar() {
		const a = audit();
		const color = {
			verde: "var(--good)",
			ambar: "var(--warn)",
			rojo: "var(--danger)"
		}[a.state] || "var(--ink-2)";
		const label = {
			verde: "Acta completa — lista para aprobar",
			ambar: "Acta en progreso",
			rojo: "Acta incompleta"
		}[a.state] || "—";
		const pctEl = document.getElementById("sbPct");
		pctEl.textContent = a.pct + "%";
		pctEl.style.color = color;
		const bar = document.getElementById("sbBar");
		bar.style.width = a.pct + "%";
		bar.style.background = color;
		document.getElementById("sbState").textContent = label + " · " + a.okCount + "/" + a.total;
		const cats = {};
		a.items.forEach((i) => {
			(cats[i.cat] = cats[i.cat] || []).push(i);
		});
		document.getElementById("sbChecklist").innerHTML = Object.keys(cats).map((cat) => {
			const items = cats[cat], ok = items.filter((i) => i.ok).length;
			return "<div class=\"chk-cat\"><div class=\"chk-cat-h\">" + esc(cat) + "<span>" + ok + "/" + items.length + "</span></div>" + items.map((i) => "<div class=\"chk-item " + (i.ok ? "ok" : "") + "\"><span class=\"chk-dot\">" + (i.ok ? "✓" : "○") + "</span>" + esc(i.label) + "</div>").join("") + "</div>";
		}).join("");
	}
	function renderAll() {
		hydrateStatics();
		renderObjectives();
		renderMilestones();
		renderStakeTable();
		renderApprovalReq();
		renderSponsors();
		renderAllLists();
		updateSidebar();
	}
	var dirtyTimer;
	function onDirty() {
		updateSidebar();
		clearTimeout(dirtyTimer);
		dirtyTimer = setTimeout(gpiPush, 800);
		setStatus("Cambios sin exportar — se sincronizan solos con el Panel.");
	}
	async function importMilestonesFromWbs() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.util || !window.GPI.active()) {
			await showAlert("Esta acción requiere un proyecto activo con una EDT cargada. Ábrelo desde el Panel de Control y completa WBS Builder primero.");
			return;
		}
		const wbs = window.GPI.getModule("wbs");
		const phases = window.GPI.util.wbsPhases(wbs || {});
		if (!phases.length) {
			await showAlert("El proyecto activo aún no tiene fases en la EDT. Complétala primero en WBS Builder.");
			return;
		}
		if (!await showConfirm("Se agregará un hito de \"fin de fase\" por cada una de las " + phases.length + " fases de la EDT actual (no se eliminan los hitos existentes). ¿Continuar?", "Importar hitos desde la EDT")) return;
		let added = 0;
		phases.forEach((p) => {
			if (!p.end) return;
			const name = "Fin de " + p.name;
			if (state.milestones.some((m) => m.name === name)) return;
			state.milestones.push({
				name,
				date: p.end
			});
			added++;
		});
		renderMilestones();
		onDirty();
		setStatus(added ? "Se importaron " + added + " hito(s) desde la EDT." : "Los hitos de las fases actuales ya estaban registrados.");
	}
	async function importKeyStakeholders() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
			await showAlert("Esta acción requiere un proyecto activo con interesados registrados. Ábrelo desde el Panel de Control y completa Stakeholder Studio primero.");
			return;
		}
		const mod = window.GPI.getModule("stakeholders");
		const all = mod && mod.stakeholders || [];
		if (!all.length) {
			await showAlert("El proyecto activo aún no tiene interesados. Regístralos primero en Stakeholder Studio.");
			return;
		}
		let key = all.filter((s) => Number(s.power) >= 50 && Number(s.interest) >= 50);
		const basis = key.length ? "del cuadrante \"gestionar de cerca\" (poder e interés ≥ 50)" : "con mayor poder + interés";
		if (!key.length) key = all.slice().sort((a, b) => Number(b.power) + Number(b.interest) - (Number(a.power) + Number(a.interest))).slice(0, 5);
		if (!await showConfirm("Se agregarán " + key.length + " interesado(s) " + basis + " desde Stakeholder Studio (los ya presentes no se duplican). ¿Continuar?", "Importar interesados clave")) return;
		let added = 0;
		key.forEach((s) => {
			if (state.stakeholders.some((t) => t.name === s.name)) return;
			state.stakeholders.push({
				name: s.name || "",
				role: s.role || s.org || "",
				expectation: (s.notes || "").trim()
			});
			added++;
		});
		renderStakeTable();
		onDirty();
		setStatus(added ? "Se importaron " + added + " interesado(s) clave." : "Los interesados clave ya estaban registrados en el acta.");
	}
	function reportShell(docTitle, moduleName, bodyHtml) {
		const el = document.getElementById("gpiReport");
		let meta = {};
		try {
			const m = window.GPI && window.GPI.available() ? window.GPI.meta() : null;
			if (m) meta = m;
		} catch (_) {}
		const pName = document.getElementById("projectTitle").value || meta.name || "Proyecto";
		const course = document.getElementById("courseTitle").value || meta.course || "Gestión de Proyectos de Ingeniería";
		const today = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
		el.innerHTML = "<div class=\"rep-head\"><div><h1>" + esc(docTitle) + "</h1><div class=\"sub\">" + esc(pName) + (meta.code ? " · " + esc(meta.code) : "") + "</div><div class=\"sub\" style=\"font-weight:500\">" + esc(course) + "</div></div><div class=\"rep-meta\">" + esc(moduleName) + "<br>Emitido: " + esc(today) + (meta.location ? "<br>" + esc(meta.location) : "") + "</div></div>" + bodyHtml;
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
	function repList(arr) {
		const items = (arr || []).filter((t) => t && String(t).trim());
		if (!items.length) return "<p class=\"rep-note\">— No registrado —</p>";
		return "<ul>" + items.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>";
	}
	function repReqList(arr) {
		const items = (arr || []).filter((r) => r && String(r.text || "").trim());
		if (!items.length) return "<p class=\"rep-note\">— No registrado —</p>";
		return "<ul>" + items.map((r) => "<li><b>" + esc(r.code) + "</b> — " + esc(r.text) + "</li>").join("") + "</ul>";
	}
	function buildReport() {
		const id = state.identification, ap = state.approval, bud = state.budget, bc = state.businessCase || {};
		const a = audit();
		let body = "";
		body += "<h2>1. Identificación del proyecto</h2><table class=\"rep-kv\"><tr><td>Título del proyecto</td><td>" + esc(document.getElementById("projectTitle").value) + "</td></tr><tr><td>Patrocinador (Sponsor)</td><td>" + esc(id.sponsor || "—") + "</td></tr><tr><td>Director de Proyecto</td><td>" + esc(id.manager || "—") + "</td></tr>" + (id.deputy ? "<tr><td>Director adjunto</td><td>" + esc(id.deputy) + "</td></tr>" : "") + "<tr><td>Cliente del proyecto</td><td>" + esc(id.client || "—") + "</td></tr><tr><td>Enfoque de desarrollo</td><td>" + esc(id.approach || "—") + "</td></tr>" + (id.language ? "<tr><td>Idioma del proyecto</td><td>" + esc(id.language) + "</td></tr>" : "") + "<tr><td>Fecha de preparación</td><td>" + esc(repDate(id.preparedDate)) + "</td></tr></table>";
		body += "<h2>2. Propósito o justificación</h2><p>" + (state.purpose ? esc(state.purpose) : "<span class=\"rep-note\">— No registrado —</span>") + "</p>";
		body += "<h2>3. Caso de negocio</h2>";
		body += bc.justification ? "<p>" + esc(bc.justification) + "</p>" : "<p class=\"rep-note\">— No registrado —</p>";
		if (bc.investment || bc.annualBenefit || bc.payback || bc.indicators) body += "<table class=\"rep-kv\">" + (bc.investment ? "<tr><td>Inversión estimada</td><td><b>" + esc(bc.investment) + "</b></td></tr>" : "") + (bc.annualBenefit ? "<tr><td>Beneficio o ahorro anual</td><td>" + esc(bc.annualBenefit) + "</td></tr>" : "") + (bc.payback ? "<tr><td>Periodo de recuperación</td><td>" + esc(bc.payback) + "</td></tr>" : "") + (bc.indicators ? "<tr><td>Otros indicadores</td><td>" + esc(bc.indicators) + "</td></tr>" : "") + "</table>";
		if (bc.intangibles) body += "<p><b>Beneficios no monetarios:</b> " + esc(bc.intangibles) + "</p>";
		body += "<h2>4. Descripción de alto nivel</h2><p>" + (state.description ? esc(state.description) : "<span class=\"rep-note\">— No registrado —</span>") + "</p>";
		body += "<h2>5. Límites del proyecto</h2><p>" + (state.boundaries ? esc(state.boundaries) : "<span class=\"rep-note\">— No registrado —</span>") + "</p>";
		const objs = state.objectives.filter((o) => (o.objective || "").trim() || (o.criteria || "").trim());
		body += "<h2>6. Objetivos del proyecto y criterios de éxito</h2>";
		body += objs.length ? "<table><tr><th style=\"width:15%\">Dimensión</th><th>Objetivo</th><th>Criterio de éxito</th></tr>" + objs.map((o) => "<tr><td><b>" + esc(o.dim) + "</b></td><td>" + esc(o.objective) + "</td><td>" + esc(o.criteria) + "</td></tr>").join("") + "</table>" : "<p class=\"rep-note\">— No registrado —</p>";
		body += "<h2>7. Requisitos de alto nivel</h2>" + repReqList(state.requirements);
		body += "<h2>8. Entregables clave</h2>" + repList(state.deliverables);
		const mil = state.milestones.filter((m) => (m.name || "").trim());
		body += "<h2>9. Resumen de hitos</h2>";
		body += mil.length ? "<table><tr><th>Hito</th><th style=\"width:20%\">Fecha objetivo</th></tr>" + mil.map((m) => "<tr><td>" + esc(m.name) + "</td><td>" + esc(repDate(m.date)) + "</td></tr>").join("") + "</table>" : "<p class=\"rep-note\">— No registrado —</p>";
		body += "<h2>10. Presupuesto preasignado</h2><table class=\"rep-kv\"><tr><td>Monto autorizado (CAPEX)</td><td><b>" + esc(money(bud.amount, bud.currency)) + "</b></td></tr>" + (bud.fundingNotes ? "<tr><td>Financiamiento / condiciones</td><td>" + esc(bud.fundingNotes) + "</td></tr>" : "") + "</table>";
		body += "<h2>11. Recursos preasignados</h2>" + repList(state.preAssignedResources);
		body += "<h2>12. Riesgo general del proyecto</h2>" + repList(state.risks);
		body += "<h2>13. Supuestos del proyecto</h2>" + repList(state.assumptions);
		body += "<h2>14. Restricciones del proyecto</h2>" + repList(state.constraints);
		body += "<h2>15. Exclusiones (fuera del alcance)</h2>" + repList(state.exclusions);
		const sh = state.stakeholders.filter((s) => (s.name || "").trim());
		body += "<h2>16. Interesados clave</h2>";
		body += sh.length ? "<table><tr><th style=\"width:26%\">Interesado</th><th style=\"width:28%\">Rol / relación</th><th>Expectativa principal</th></tr>" + sh.map((s) => "<tr><td>" + esc(s.name) + "</td><td>" + esc(s.role) + "</td><td>" + esc(s.expectation) + "</td></tr>").join("") + "</table>" : "<p class=\"rep-note\">— No registrado —</p>";
		const areq = (state.approvalRequirements || []).filter((r) => (r.item || "").trim());
		body += "<h2>17. Requisitos para la aprobación del proyecto</h2>";
		body += areq.length ? "<table><tr><th style=\"width:30%\">Qué se aprueba</th><th style=\"width:28%\">Quién aprueba</th><th>Criterio / evidencia</th></tr>" + areq.map((r) => "<tr><td>" + esc(r.item) + "</td><td>" + esc(r.approver) + "</td><td>" + esc(r.criteria) + "</td></tr>").join("") + "</table>" : "<p class=\"rep-note\">— No registrado —</p>";
		body += "<h2>18. Criterios de salida del proyecto</h2>" + repList(state.exitCriteria);
		body += "<h2>19. Nivel de autoridad del Director de Proyecto</h2><p>" + (id.authority ? esc(id.authority) : "<span class=\"rep-note\">— No registrado —</span>") + "</p>";
		const spon = (state.sponsors || []).filter((s) => (s.name || "").trim());
		body += "<h2>20. Patrocinadores que autorizan el proyecto</h2>";
		body += spon.length ? "<table><tr><th style=\"width:45%\">Nombre</th><th>Cargo / rol en la autorización</th></tr>" + spon.map((s) => "<tr><td>" + esc(s.name) + "</td><td>" + esc(s.role) + "</td></tr>").join("") + "</table>" : "<p class=\"rep-note\">— No registrado —</p>";
		body += "<p class=\"rep-note\" style=\"margin-top:14px\">Índice de completitud del acta al momento de emisión: <b>" + a.pct + "%</b> (" + a.okCount + "/" + a.total + " elementos del checklist).</p>";
		body += "<div class=\"rep-sign\"><div class=\"box\"><b>" + esc(ap.sponsorName || "Patrocinador (Sponsor)") + "</b><div class=\"r\">Patrocinador — Fecha: " + esc(repDate(ap.sponsorDate)) + "</div></div><div class=\"box\"><b>" + esc(ap.managerName || "Director de Proyecto") + "</b><div class=\"r\">Director de Proyecto — Fecha: " + esc(repDate(ap.managerDate)) + "</div></div></div>";
		reportShell("Acta de Constitución del Proyecto", "Project Charter · PMBOK", body);
	}
	function wireToolbar() {
		document.getElementById("btnImportMilestones").addEventListener("click", importMilestonesFromWbs);
		document.getElementById("btnImportStakeholders").addEventListener("click", importKeyStakeholders);
		document.getElementById("btnReport").addEventListener("click", buildReport);
		document.getElementById("btnPrint").addEventListener("click", () => {
			window.print();
		});
		document.getElementById("btnSample").addEventListener("click", async () => {
			if (!await showConfirm("Se reemplazará el contenido actual del acta por el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo")) return;
			state = sampleState();
			renderAll();
			gpiPush();
			setStatus("Ejemplo DISTRIB+ S.A. cargado.");
		});
		document.getElementById("btnReset").addEventListener("click", async () => {
			if (!await showConfirm("Se vaciará el acta (los demás módulos del proyecto no se tocan). Esta acción no se puede deshacer. ¿Continuar?", "Nueva acta")) return;
			state = defaultState();
			renderAll();
			gpiPush();
			setStatus("Acta nueva.");
		});
		document.querySelectorAll("[data-add-list]").forEach((b) => {
			b.addEventListener("click", () => {
				const key = b.dataset.addList;
				state[key].push("");
				renderList(key);
				onDirty();
				const inputs = document.getElementById(LISTS[key]).querySelectorAll("input");
				if (inputs.length) inputs[inputs.length - 1].focus();
			});
		});
		document.getElementById("btnAddRequirement").addEventListener("click", () => {
			const nx = nextRanCode();
			state.requirements.push({
				id: "ran" + nx.num,
				code: nx.code,
				text: ""
			});
			renderRequirements();
			onDirty();
			const inputs = document.getElementById("listRequirements").querySelectorAll("input");
			if (inputs.length) inputs[inputs.length - 1].focus();
		});
		document.getElementById("btnAddObjective").addEventListener("click", () => {
			state.objectives.push({
				dim: "Otro",
				objective: "",
				criteria: ""
			});
			renderObjectives();
			onDirty();
		});
		document.getElementById("btnAddMilestone").addEventListener("click", () => {
			state.milestones.push({
				name: "",
				date: ""
			});
			renderMilestones();
			onDirty();
		});
		document.getElementById("btnAddStakeholder").addEventListener("click", () => {
			state.stakeholders.push({
				name: "",
				role: "",
				expectation: ""
			});
			renderStakeTable();
			onDirty();
		});
		document.getElementById("btnAddApprovalReq").addEventListener("click", () => {
			state.approvalRequirements.push({
				item: "",
				approver: "",
				criteria: ""
			});
			renderApprovalReq();
			onDirty();
		});
		document.getElementById("btnAddSponsor").addEventListener("click", () => {
			state.sponsors.push({
				name: "",
				role: ""
			});
			renderSponsors();
			onDirty();
		});
	}
	function markProjectStale() {
		if (projectStale) return;
		projectStale = true;
		setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
		const banner = document.getElementById("banner");
		if (banner) {
			banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el Acta aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
			banner.classList.add("show");
		}
	}
	function reportWrite(r, label) {
		if (r.status === "saved" || r.status === "unchanged") return true;
		if (r.status === "rejected" && r.reason === "project-changed") {
			markProjectStale();
			return false;
		}
		const msg = window.GPI.describeWrite(r, label);
		setStatus(msg);
		const banner = document.getElementById("banner");
		if (banner && (r.status === "conflict" || r.status === "pending")) {
			banner.textContent = msg;
			banner.classList.add("show");
		}
		return false;
	}
	function gpiPush() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return false;
		if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
			markProjectStale();
			return false;
		}
		const rMod = window.GPI.saveModule("charter", state, session);
		if (!session && rMod.status === "saved") session = window.GPI.openSession("charter");
		const patch = {
			name: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value
		};
		if ((state.identification.sponsor || "").trim()) patch.sponsor = state.identification.sponsor;
		if ((state.identification.manager || "").trim()) patch.manager = state.identification.manager;
		if ((state.identification.client || "").trim()) patch.client = state.identification.client;
		if (Number(state.budget.amount) > 0) {
			patch.capex = state.budget.amount;
			patch.currency = state.budget.currency;
		}
		const rMeta = window.GPI.saveMeta(patch, session);
		return reportWrite(rMod, "El Acta") && reportWrite(rMeta, "Los datos del proyecto");
	}
	function init() {
		wireStatics();
		wireToolbar();
		if (typeof window.GPI !== "undefined" && window.GPI.available()) {
			const proj = window.GPI.active();
			loadedProjectId = window.GPI.activeId();
			const titleEl = document.getElementById("projectTitle");
			const courseEl = document.getElementById("courseTitle");
			if (proj) {
				if (proj.meta) {
					if (proj.meta.name) titleEl.value = proj.meta.name;
					if (proj.meta.course) courseEl.value = proj.meta.course;
				}
				session = window.GPI.openSession("charter");
				const mod = window.GPI.getModule("charter");
				if (mod) {
					state = normalizeState(mod);
					window.GPI.rebaseSession(session, state);
				} else {
					const m = proj.meta || {};
					if (m.sponsor) state.identification.sponsor = m.sponsor;
					if (m.manager) state.identification.manager = m.manager;
					if (m.client) state.identification.client = m.client;
					if (m.startDate) state.identification.preparedDate = m.startDate;
					if (m.capex) state.budget.amount = m.capex;
					if (m.currency) state.budget.currency = m.currency;
					if (m.description && !state.description) state.description = m.description;
				}
				setStatus("Proyecto cargado desde el Panel de Control.");
			}
			window.addEventListener("beforeunload", gpiPush);
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) gpiPush();
			});
			window.GPI.onChange(() => {
				if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) markProjectStale();
			});
			gpiBadge(proj ? proj.meta && proj.meta.name : "", gpiPush);
		} else document.getElementById("banner").classList.add("show");
		renderAll();
	}
	function gpiBadge(name, pushFn) {
		const css = document.createElement("style");
		css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
		document.head.appendChild(css);
		const bar = document.createElement("div");
		bar.className = "gpi-badge";
		bar.innerHTML = "<span class=\"gpi-dot\"></span><span>Panel: <b>" + String(name || "—").replace(/</g, "&lt;") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		const sb = bar.querySelector("#gpiSyncBtn");
		if (sb) sb.addEventListener("click", () => {
			const ok = pushFn();
			const t = sb.textContent;
			sb.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
			setTimeout(() => {
				sb.textContent = t;
			}, 1400);
		});
	}
	document.addEventListener("DOMContentLoaded", init);
	//#endregion
})();
