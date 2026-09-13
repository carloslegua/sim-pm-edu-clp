(function() {
	//#region src/modules/panel-control/main.ts
	var GPI = window.GPI;
	var MODULOS_EXTRA = [];
	var CUR = {
		USD: "USD $",
		PEN: "S/",
		EUR: "€"
	};
	var GROUPS = [
		{
			key: "integ",
			name: "Integración",
			hint: "dirige y unifica el proyecto de principio a fin"
		},
		{
			key: "stake",
			name: "Interesados",
			hint: "identificación y compromiso de las partes interesadas"
		},
		{
			key: "scope",
			name: "Alcance",
			hint: "qué incluye y qué no incluye el proyecto"
		},
		{
			key: "sched",
			name: "Cronograma",
			hint: "actividades, duraciones y ruta crítica"
		},
		{
			key: "cost",
			name: "Costo",
			hint: "estimación, presupuesto y control del gasto"
		},
		{
			key: "qual",
			name: "Calidad",
			hint: "requisitos de calidad y su aseguramiento"
		},
		{
			key: "res",
			name: "Recursos",
			hint: "equipo, organigrama y asignación de responsabilidades"
		},
		{
			key: "comm",
			name: "Comunicaciones",
			hint: "flujo de información entre los involucrados"
		},
		{
			key: "risk",
			name: "Riesgos",
			hint: "incertidumbre, respuesta y análisis cuantitativo"
		},
		{
			key: "proc",
			name: "Adquisiciones",
			hint: "contratación y gestión de proveedores"
		}
	];
	var MODULES = [
		{
			key: "charter",
			group: "integ",
			name: "Acta de Constitución",
			file: "Project_Charter.html",
			icon: "📜",
			color: "#00967f",
			desc: "Project Charter (PMBOK): propósito, objetivos y criterios de éxito, hitos, presupuesto, supuestos, restricciones, exclusiones y aprobación formal del proyecto."
		},
		{
			key: "pmplan",
			group: "integ",
			name: "Plan para la Dirección",
			file: null,
			icon: "📘",
			color: "#00967f",
			desc: "Documento integrador que consolida los planes subsidiarios y las líneas base de alcance, cronograma y costo."
		},
		{
			key: "changes",
			group: "integ",
			name: "Control Integrado de Cambios",
			file: null,
			icon: "🔁",
			color: "#00967f",
			desc: "Registro de solicitudes de cambio, evaluación de impacto, decisión del CCB y actualización de las líneas base."
		},
		{
			key: "closeout",
			group: "integ",
			name: "Cierre del Proyecto",
			file: null,
			icon: "🏁",
			color: "#00967f",
			desc: "Aceptación de entregables, liberación de recursos, lecciones aprendidas y cierre administrativo y contractual."
		},
		{
			key: "stakeholders",
			group: "stake",
			name: "Stakeholder Studio",
			file: "Stakeholder_Studio.html",
			icon: "◉",
			color: "#00b6ec",
			desc: "Registro y análisis de interesados: matriz poder–interés, modelo de prominencia y matriz de compromiso."
		},
		{
			key: "requirements",
			group: "scope",
			name: "Recopilar Requisitos",
			file: "Recopilar_Requisitos.html",
			icon: "📝",
			color: "#6c5ce7",
			desc: "Matriz de trazabilidad de requisitos: cada REQ.00X enlaza el RAN del Acta y el interesado que lo origina. Separa la línea base de sus modificaciones de alcance."
		},
		{
			key: "scopeStatement",
			group: "scope",
			name: "Enunciado del Alcance",
			file: "Enunciado_del_Alcance.html",
			icon: "🎯",
			color: "#6c5ce7",
			desc: "Definir el Alcance (PMBOK 8): descripción del alcance, entregables (DEL.0X) con criterios de aceptación, y supuestos/restricciones/exclusiones. Es el puente que agrupa los REQ en entregables; la EDT descompone esos entregables, no los requisitos."
		},
		{
			key: "wbs",
			group: "scope",
			name: "WBS Builder",
			file: "WBS_Builder.html",
			icon: "▦",
			color: "#6c5ce7",
			desc: "Estructura de desglose del trabajo con costo, duración, avance y diccionario WBS. Siembra sus ramas desde los entregables del Enunciado del Alcance."
		},
		{
			key: "activities",
			group: "sched",
			name: "Definir las Actividades",
			file: "Activity_Definition.html",
			icon: "☰",
			color: "#e56a10",
			desc: "Descompone cada paquete de trabajo de la EDT en actividades con unidad de medida y metrado: la base para estimar duraciones, recursos y costos del cronograma."
		},
		{
			key: "pert",
			group: "sched",
			name: "Análisis PERT",
			file: "Pert_Analysis.html",
			icon: "σ",
			color: "#8f2fd0",
			desc: "Estimación probabilística de duraciones: por cada actividad, Optimista / Más probable / Pesimista con TE = (O+4M+P)/6, σ y σ². La M automática sigue a la duración por rendimiento de cuadrillas."
		},
		{
			key: "schedulePlan",
			group: "sched",
			name: "Plan de Gestión del Cronograma",
			file: "Schedule_Management_Plan.html",
			icon: "📋",
			color: "#3a86ff",
			desc: "Metodología, calendario, umbrales de control, hitos, reserva y reglas de medición del desempeño (AACE RP 38R-06 / PMBOK)."
		},
		{
			key: "schedule",
			group: "sched",
			name: "Cronograma / CPM",
			file: "Cronograma_CPM.html",
			icon: "⏱",
			color: "#00c2a8",
			desc: "Red de precedencias (pegado desde MS Project/Excel), ruta crítica, holguras y diagrama de Gantt."
		},
		{
			key: "cost",
			group: "cost",
			name: "Gestión de Costos",
			file: "Cost-management.html",
			icon: "S/",
			color: "#0093c0",
			desc: "Plan de gestión de costos (PMBOK 8 + AACE): moneda, clase de estimado, contingencia e inflación, umbrales CV/CPI, órdenes de cambio y documento BOE. Toma la estimación base de la EDT."
		},
		{
			key: "evm",
			group: "cost",
			name: "Valor Ganado (EVM)",
			file: null,
			icon: "📈",
			color: "#2e4374",
			desc: "PV, EV, AC, CV, SV, CPI, SPI, EAC y línea de corte dinámica."
		},
		{
			key: "quality",
			group: "qual",
			name: "Gestión de la Calidad",
			file: null,
			icon: "✔",
			color: "#00c2a8",
			desc: "Métricas de calidad, plan de aseguramiento y control, y costo de la calidad (conformidad vs. no conformidad)."
		},
		{
			key: "obs",
			group: "res",
			name: "Equipo del Proyecto",
			file: "OBS_Builder.html",
			icon: "🗂",
			color: "#2e4374",
			desc: "Organigrama del equipo del proyecto (OBS): roles, tipo de autoridad y personas asignadas."
		},
		{
			key: "raci",
			group: "res",
			name: "Matriz RACI",
			file: "RACI_Matrix.html",
			icon: "▤",
			color: "#ff6b8b",
			desc: "Intersección EDT × OBS a nivel de paquete de trabajo: asigna R/A/C/I y sincroniza el responsable con el WBS."
		},
		{
			key: "comms",
			group: "comm",
			name: "Gestión de las Comunicaciones",
			file: null,
			icon: "📣",
			color: "#3a86ff",
			desc: "Matriz de comunicaciones: qué información, a quién, cuándo, por qué medio y con qué frecuencia."
		},
		{
			key: "risks",
			group: "risk",
			name: "Gestión de Riesgos",
			file: null,
			icon: "⚠",
			color: "#ff9f1c",
			desc: "RBS, matriz probabilidad–impacto y plan de respuesta a riesgos."
		},
		{
			key: "montecarlo",
			group: "risk",
			name: "Simulación Monte Carlo",
			file: null,
			icon: "🎲",
			color: "#ff6b8b",
			desc: "Riesgo cuantitativo de costo y plazo: histograma, curva S y tornado."
		},
		{
			key: "procurement",
			group: "proc",
			name: "Gestión de las Adquisiciones",
			file: null,
			icon: "📦",
			color: "#8f2fd0",
			desc: "Estrategia de contratación, tipos de contrato, criterios de selección y administración de proveedores."
		}
	];
	MODULES = MODULES.concat((Array.isArray(MODULOS_EXTRA) ? MODULOS_EXTRA : []).filter((m) => {
		return m && m.key && m.file && !MODULES.some((x) => x.key === m.key);
	}));
	function isDelivered(mod) {
		if (!mod.file) return false;
		return true;
	}
	function probeModules(done) {
		done();
	}
	var CAT_COLORS = {
		Interno: "#00b6ec",
		Cliente: "#00c2a8",
		Regulador: "#2e4374",
		Comunidad: "#ff9f1c",
		Proveedor: "#6c5ce7",
		Financiero: "#ff6b8b"
	};
	var OBS_TYPE_COLORS = {
		patrocinio: "#2e4374",
		direccion: "#00b6ec",
		core: "#6c5ce7",
		funcional: "#00c2a8",
		externo: "#ff9f1c"
	};
	var OBS_TYPE_LABELS = {
		patrocinio: "Patrocinio",
		direccion: "Dirección de Proyecto",
		core: "Equipo Core",
		funcional: "Área Funcional",
		externo: "Externo / Proveedor"
	};
	var META_FIELDS = [
		{
			k: "name",
			l: "Nombre del proyecto",
			full: true
		},
		{
			k: "code",
			l: "Código / N.º"
		},
		{
			k: "client",
			l: "Cliente"
		},
		{
			k: "location",
			l: "Ubicación"
		},
		{
			k: "sponsor",
			l: "Patrocinador (Sponsor)"
		},
		{
			k: "manager",
			l: "Director de proyecto"
		},
		{
			k: "startDate",
			l: "Inicio",
			type: "date"
		},
		{
			k: "endDate",
			l: "Fin",
			type: "date"
		},
		{
			k: "currency",
			l: "Moneda"
		},
		{
			k: "capex",
			l: "Presupuesto (CAPEX)",
			type: "number"
		},
		{
			k: "course",
			l: "Curso"
		},
		{
			k: "description",
			l: "Descripción",
			full: true,
			area: true
		}
	];
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	function money(v, cur) {
		const n = Number(v);
		if (!isFinite(n) || !v && v !== 0) return "—";
		return (CUR[cur || ""] || "$") + " " + n.toLocaleString("es-PE");
	}
	function setStatus(m) {
		document.getElementById("statusLeft").textContent = m;
	}
	function toast(m) {
		const t = document.getElementById("toast");
		t.textContent = m;
		t.classList.add("show");
		clearTimeout(t._t);
		t._t = setTimeout(() => {
			t.classList.remove("show");
		}, 1900);
	}
	function ensureSeed() {
		if (GPI.listProjects().length) return;
		GPI.createProject({
			name: "DISTRIB+ S.A. — Almacén Lurín",
			code: "DPLU-2026",
			client: "DISTRIB+ S.A.",
			location: "Lurín, Lima",
			sponsor: "Gerencia General DISTRIB+",
			manager: "",
			startDate: "2026-07-06",
			endDate: "2026-11-06",
			currency: "USD",
			capex: "8500000",
			description: "Construcción de un almacén logístico para DISTRIB+ S.A. en Lurín. Caso pedagógico compartido por todas las herramientas del curso."
		});
	}
	function render() {
		const avail = GPI.available();
		document.getElementById("banner").classList.toggle("show", !avail);
		if (!avail) document.getElementById("banner").innerHTML = "<b>Vista previa sin almacenamiento persistente.</b> Para que las herramientas compartan datos de forma automática, descarga los archivos y ábrelos desde un servidor local o GitHub Pages (mismo origen). Aquí puedes explorar el panel, pero los cambios no se guardarán entre pestañas.";
		renderProjBar();
		renderMeta();
		renderLauncher();
		renderDashboard();
		renderInteg();
	}
	function renderProjBar() {
		const sel = document.getElementById("projSelect");
		const list = GPI.listProjects(), active = GPI.activeId();
		sel.innerHTML = list.map((p) => "<option value=\"" + p.id + "\" " + (p.id === active ? "selected" : "") + ">" + esc(p.name) + (p.code ? " · " + esc(p.code) : "") + "</option>").join("");
		document.getElementById("btnDel").disabled = list.length <= 1;
	}
	function renderMeta() {
		const m = GPI.meta() || {};
		document.getElementById("metaGrid").innerHTML = META_FIELDS.map((f) => {
			const val = esc(m[f.k] == null ? "" : m[f.k]);
			const ctrl = f.area ? "<textarea data-k=\"" + f.k + "\">" + val + "</textarea>" : "<input data-k=\"" + f.k + "\" " + (f.type ? "type=\"" + f.type + "\"" : "") + " value=\"" + val + "\">";
			return "<div class=\"field" + (f.full ? " full" : "") + "\"><label>" + esc(f.l) + "</label>" + ctrl + "</div>";
		}).join("");
		document.querySelectorAll("#metaGrid [data-k]").forEach((el) => {
			el.addEventListener("input", () => {
				const patch = {};
				patch[el.dataset.k] = el.value;
				GPI.patchMeta(patch);
				if (el.dataset.k === "name") renderProjBar();
				if (el.dataset.k === "capex" || el.dataset.k === "currency") renderDashboard();
				setStatus("Metadatos actualizados.");
			});
		});
	}
	function statChips(key) {
		if (key === "charter") {
			const ch = GPI.getModule("charter");
			const a = GPI.util.charterAudit(ch);
			const milC = (ch?.milestones || []).filter((m) => m && (m.name || "").trim()).length;
			return [{
				v: a.pct + "%",
				l: "completitud del acta"
			}, {
				v: milC,
				l: "hitos declarados"
			}];
		}
		if (key === "stakeholders") {
			const arr = GPI.getModule("stakeholders")?.stakeholders || [];
			const close = arr.filter((s) => (s.power ?? 0) >= 50 && (s.interest ?? 0) >= 50).length;
			return [{
				v: arr.length,
				l: "interesados"
			}, {
				v: close,
				l: "gestionar de cerca"
			}];
		}
		if (key === "requirements") {
			const rq = GPI.getModule("requirements");
			const ra = GPI.util.requirementsAudit(rq, GPI.getModule("charter"), GPI.getModule("wbs"));
			const ver = ra.baselineFrozen ? "LB " + (ra.baselineVersion || "1.0") : "sin LB";
			return [{
				v: ra.total,
				l: "requisitos (REQ)"
			}, {
				v: ra.tracePct + "%",
				l: "trazados a la EDT · " + ver
			}];
		}
		if (key === "scopeStatement") {
			const sc = GPI.getModule("scopeStatement");
			const sa = GPI.util.scopeAudit(sc, GPI.getModule("requirements"), GPI.getModule("charter"), GPI.getModule("wbs"));
			const lbS = sa.baselineFrozen ? "LB v" + (sa.baselineVersion || "1.0") : "sin LB";
			return [{
				v: sa.total,
				l: "entregables (DEL)"
			}, {
				v: sa.decompPct + "%",
				l: "descompuestos en EDT · " + lbS
			}];
		}
		if (key === "wbs") {
			const w = GPI.getModule("wbs");
			const r = GPI.util.wbsRollup(w);
			return [{
				v: r.leafCount,
				l: "paquetes (hojas)"
			}, {
				v: money(r.cost, GPI.meta()?.currency).replace(/^\S+\s/, ""),
				l: "costo hoja"
			}];
		}
		if (key === "activities") {
			const act = GPI.getModule("activities");
			const as = GPI.util.activitiesStats(act, GPI.getModule("wbs"));
			return [{
				v: as.total,
				l: "actividades"
			}, {
				v: as.covered + "/" + as.leaves,
				l: "paquetes cubiertos"
			}];
		}
		if (key === "pert") {
			const pertMod = GPI.getModule("pert");
			const ps = GPI.util.pertStats(pertMod, GPI.getModule("activities"), GPI.getModule("wbs"));
			return [{
				v: ps.complete + "/" + ps.total,
				l: "ternas O-M-P"
			}, {
				v: ps.invalid,
				l: "ternas inválidas"
			}];
		}
		if (key === "obs") {
			const o = GPI.getModule("obs");
			const roles = GPI.util.obsNodes(o);
			const covered = roles.filter((n) => (n.person || "").trim()).length;
			return [{
				v: roles.length,
				l: "puestos"
			}, {
				v: covered,
				l: "con persona"
			}];
		}
		if (key === "raci") {
			const raci = GPI.getModule("raci");
			const wbs = GPI.getModule("wbs");
			const cov = GPI.util.raciCoverage(raci, wbs);
			return [{
				v: cov.withR + "/" + cov.total,
				l: "paquetes con R"
			}, {
				v: cov.withoutA.length,
				l: "sin aprobador"
			}];
		}
		if (key === "schedulePlan") {
			const sp = GPI.getModule("schedulePlan");
			const audit = GPI.util.schedulePlanAudit(sp);
			const milCount = (sp?.milestones || []).length;
			return [{
				v: audit.pct + "%",
				l: "completitud del plan"
			}, {
				v: milCount,
				l: "hitos definidos"
			}];
		}
		if (key === "cost") {
			const cm = GPI.getModule("cost");
			const cs = GPI.util.costSummary(cm);
			const cur = GPI.meta()?.currency;
			return [{
				v: cs.bac ? money(cs.bac, cur).replace(/^\S+\s/, "") : "—",
				l: "BAC (" + (CUR[cur || ""] || "$").replace(/\s.*/, "") + ")"
			}, {
				v: cs.changeOrders,
				l: "órdenes de cambio"
			}];
		}
		return null;
	}
	function moduleCard(mod) {
		const built = !!mod.file;
		const open = isDelivered(mod);
		const locked = built && !open;
		const stats = open ? statChips(mod.key) : null;
		const hasData = open && !!GPI.getModule(mod.key);
		const pill = !built ? "<span class=\"pill soon\">próximamente</span>" : locked ? "<span class=\"pill locked\">no entregado aún</span>" : hasData ? "<span class=\"pill on\">con datos</span>" : "<span class=\"pill off\">vacío</span>";
		const statsHtml = stats ? "<div class=\"mod-stats\">" + stats.map((s) => "<div class=\"mod-stat\"><div class=\"v\">" + esc(String(s.v)) + "</div><div class=\"l\">" + esc(s.l) + "</div></div>").join("") + "</div>" : "";
		const actions = !built ? "<button class=\"btn sm\" disabled>En desarrollo</button>" : locked ? "<button class=\"btn sm\" disabled title=\"Tu profesor habilitará esta herramienta más adelante\">🔒 Se habilita más adelante</button>" : "<a class=\"btn sm primary\" href=\"" + mod.file + "\">Abrir ▸</a><button class=\"btn sm\" data-import=\"" + mod.key + "\">⭱ Importar .json</button>" + (hasData ? "<button class=\"btn sm\" data-clear=\"" + mod.key + "\">Vaciar</button>" : "");
		return "<div class=\"mod-card " + (open ? "active" : "soon") + "\">" + pill + "<div class=\"mod-top\"><div class=\"mod-ic\" style=\"background:" + mod.color + "\">" + mod.icon + "</div><div><div class=\"mod-name\">" + esc(mod.name) + "</div></div></div><div class=\"mod-desc\">" + esc(mod.desc) + "</div>" + statsHtml + "<div class=\"mod-actions\">" + actions + "</div></div>";
	}
	function renderLauncher() {
		const html = GROUPS.map((g) => {
			const mods = MODULES.filter((m) => m.group === g.key);
			if (!mods.length) return "";
			const ready = mods.filter(isDelivered).length;
			let ribbon = "";
			if (g.key === "scope") ribbon = "<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:9px 13px;background:linear-gradient(180deg,#faf9ff,#fff);border:1px solid var(--panel-border);border-radius:10px;font-size:12px;color:var(--ink-1)\"><span style=\"font-family:var(--display);font-weight:800;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-2)\">Flujo recomendado</span>" + [
				"Recopilar Requisitos",
				"Enunciado del Alcance",
				"Crear la EDT (WBS)"
			].map((s, i) => {
				return (i ? "<span style=\"color:var(--ink-2);font-family:var(--mono)\">→</span>" : "") + "<span style=\"display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--panel-border);border-radius:20px;padding:4px 11px;font-weight:600\"><span style=\"font-family:var(--mono);font-weight:700;font-size:10px;width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--cat-prov);color:#fff\">" + (i + 1) + "</span>" + esc(s) + "</span>";
			}).join("") + "<span style=\"color:var(--ink-2);margin-left:4px\">— la EDT descompone <b>entregables</b>, no requisitos.</span></div>";
			return "<h2 class=\"section\">" + esc(g.name) + " <span class=\"hint\">— " + esc(g.hint) + " · " + ready + "/" + mods.length + " disponibles</span></h2>" + ribbon + "<div class=\"launch-grid\">" + mods.map(moduleCard).join("") + "</div>";
		}).join("");
		document.getElementById("launchGrid").innerHTML = html;
		document.querySelectorAll("#launchGrid [data-import]").forEach((b) => {
			b.addEventListener("click", () => {
				importToolInto();
			});
		});
		document.querySelectorAll("#launchGrid [data-clear]").forEach((b) => {
			b.addEventListener("click", () => {
				confirmModal("Vaciar módulo", "¿Borrar los datos de este módulo en el proyecto activo? (no afecta a los demás módulos)", () => {
					GPI.setModule(b.dataset.clear, null);
					render();
					toast("Módulo vaciado");
				});
			});
		});
	}
	function renderDashboard() {
		const meta = GPI.meta();
		const sh = GPI.getModule("stakeholders")?.stakeholders || [];
		const wbs = GPI.getModule("wbs");
		const roll = GPI.util.wbsRollup(wbs);
		const cards = [];
		cards.push("<div class=\"dash-card\"><h4>Resumen</h4>" + kpi(sh.length, "", "interesados registrados") + kpi(roll.leafCount, "", "paquetes de trabajo (hojas de la EDT)") + kpi(money(roll.cost, meta?.currency), "", "costo estimado (suma de hojas)") + "</div>");
		const capex = Number(meta?.capex) || 0;
		const pct = capex > 0 ? Math.min(100, Math.round(roll.cost / capex * 100)) : 0;
		const capBody = capex > 0 ? "<div class=\"kpi\"><span class=\"v\">" + pct + "%</span><span class=\"l\">del CAPEX presupuestado está desglosado en el WBS</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + pct + "%;background:" + (pct > 100 ? "var(--danger)" : "var(--cyan)") + "\"></div></div><div class=\"empty\">CAPEX meta: <b>" + money(capex, meta?.currency) + "</b> · WBS: <b>" + money(roll.cost, meta?.currency) + "</b></div>" : "<div class=\"empty\">Define el CAPEX en los datos comunes para comparar contra el costo desglosado en el WBS.</div>";
		cards.push("<div class=\"dash-card\"><h4>Presupuesto vs. WBS</h4>" + capBody + "</div>");
		const reqMod = GPI.getModule("requirements");
		const chMod = GPI.getModule("charter");
		const ra = GPI.util.requirementsAudit(reqMod, chMod, wbs);
		if (ra.total > 0 || ra.rans > 0) {
			const rColor = ra.state === "verde" ? "var(--good)" : ra.state === "ambar" ? "var(--warn)" : "var(--danger)";
			const lbTxt = ra.baselineFrozen ? "línea base <b>v" + esc(ra.baselineVersion || "1.0") + "</b> congelada" + (ra.changes ? " · <b>" + ra.changes + "</b> modificación(es) de alcance" : "") : "línea base <b>aún no congelada</b>";
			let reqBody = "<div class=\"kpi\"><span class=\"v\" style=\"color:" + rColor + "\">" + ra.tracePct + "%</span><span class=\"l\">de los <b>" + ra.total + "</b> requisitos están trazados a un paquete de la EDT · " + lbTxt + "</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + ra.tracePct + "%;background:" + rColor + "\"></div></div>";
			const reqWarns = [];
			if (ra.ransUncovered.length) reqWarns.push(ra.ransUncovered.length + " RAN del Acta sin ningún REQ que lo desarrolle");
			if (ra.reqsWithoutWbs) reqWarns.push(ra.reqsWithoutWbs + " requisito(s) sin paquete de la EDT");
			if (ra.leavesWithoutReq.length) reqWarns.push(ra.leavesWithoutReq.length + " paquete(s) de la EDT sin requisito (posible sobre-alcance)");
			if (ra.reqsBrokenWbs) reqWarns.push(ra.reqsBrokenWbs + " requisito(s) con enlace a un paquete eliminado");
			if (ra.reqsWithoutStk) reqWarns.push(ra.reqsWithoutStk + " requisito(s) sin interesado de origen");
			if (reqWarns.length) reqBody += "<ul class=\"warn-list\">" + reqWarns.slice(0, 5).map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>";
			else reqBody += "<div class=\"ok-note\">✓ Todo RAN tiene REQ, y todo REQ está trazado a la EDT y verificable.</div>";
			cards.push("<div class=\"dash-card\"><h4>Requisitos · trazabilidad</h4>" + reqBody + "</div>");
		}
		const scMod = GPI.getModule("scopeStatement");
		const sca = GPI.util.scopeAudit(scMod, reqMod, chMod, wbs);
		if (sca.total > 0 || sca.reqTotal > 0) {
			const sColor = sca.state === "verde" ? "var(--good)" : sca.state === "ambar" ? "var(--warn)" : "var(--danger)";
			const lbS = sca.baselineFrozen ? "línea base <b>v" + esc(sca.baselineVersion || "1.0") + "</b> congelada" : "línea base <b>aún no congelada</b>";
			let scBody = "<div class=\"kpi\"><span class=\"v\" style=\"color:" + sColor + "\">" + sca.total + "</span><span class=\"l\">entregables (DEL) · " + sca.reqCovPct + "% de los " + sca.reqTotal + " REQ tienen entregable · " + lbS + "</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + sca.decompPct + "%;background:" + sColor + "\"></div></div><div class=\"empty\" style=\"margin:-4px 0 8px\">" + sca.decompPct + "% de los entregables ya están descompuestos en la EDT.</div>";
			const scWarns = [];
			if (sca.delsWithoutReq.length) scWarns.push(sca.delsWithoutReq.length + " entregable(s) sin ningún REQ que los justifique (posible sobre-alcance)");
			if (sca.reqsWithoutDel.length) scWarns.push(sca.reqsWithoutDel.length + " requisito(s) sin entregable que los acoja (alcance faltante)");
			if (sca.delsNotDecomposed.length) scWarns.push(sca.delsNotDecomposed.length + " entregable(s) sin descomponer en la EDT (usa «↧ Sembrar Entregables» en el WBS)");
			if (sca.delsWithoutAccept.length) scWarns.push(sca.delsWithoutAccept.length + " entregable(s) sin criterio de aceptación");
			if (sca.ransWithoutDel.length) scWarns.push(sca.ransWithoutDel.length + " RAN del Acta sin entregable que lo materialice");
			if (scWarns.length) scBody += "<ul class=\"warn-list\">" + scWarns.slice(0, 5).map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>";
			else scBody += "<div class=\"ok-note\">✓ Todo REQ tiene entregable, cada entregable tiene REQ y criterio, y todos están descompuestos en la EDT.</div>";
			cards.push("<div class=\"dash-card\"><h4>Alcance · coherencia (Entregables)</h4>" + scBody + "</div>");
		}
		const actMod = GPI.getModule("activities");
		if (roll.leafCount > 0) {
			const as = GPI.util.activitiesStats(actMod, wbs);
			const actColor = as.pct >= 100 ? "var(--good)" : as.pct >= 50 ? "var(--warn)" : "var(--danger)";
			let actBody = "<div class=\"kpi\"><span class=\"v\" style=\"color:" + actColor + "\">" + as.pct + "%</span><span class=\"l\">de los paquetes de trabajo ya tienen actividades definidas (" + as.covered + "/" + as.leaves + ") · <b>" + as.total + "</b> actividades en total</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + as.pct + "%;background:" + actColor + "\"></div></div>";
			if (as.uncovered.length) actBody += "<ul class=\"warn-list\">" + as.uncovered.slice(0, 5).map((l) => "<li><span class=\"tag\">" + esc(l.code) + "</span>" + esc(l.name) + "</li>").join("") + (as.uncovered.length > 5 ? "<li class=\"empty\">…y " + (as.uncovered.length - 5) + " paquetes más sin actividades</li>" : "") + "</ul>";
			else actBody += "<div class=\"ok-note\">✓ Todos los paquetes de trabajo están descompuestos en actividades.</div>";
			if (as.orphans) actBody += "<div class=\"empty\" style=\"margin-top:8px\">⚠ " + as.orphans + " actividad(es) huérfana(s): su paquete ya no existe en la EDT. Revísalas en Definir las Actividades.</div>";
			cards.push("<div class=\"dash-card\"><h4>Actividades por paquete de trabajo</h4>" + actBody + "</div>");
			const pertMod = GPI.getModule("pert");
			if (pertMod || as.total > 0) {
				const ps = GPI.util.pertStats(pertMod, actMod, wbs);
				if (ps.total > 0) {
					const pePct = ps.pct;
					const peColor = ps.invalid ? "var(--danger)" : pePct >= 100 ? "var(--good)" : pePct >= 50 ? "var(--warn)" : "var(--ink-2)";
					let peBody = "<div class=\"kpi\"><span class=\"v\" style=\"color:" + peColor + "\">" + ps.complete + "/" + ps.total + "</span><span class=\"l\">actividades con terna O–M–P completa" + (ps.invalid ? " · <b style=\"color:var(--danger)\">" + ps.invalid + " inválida(s) (O ≤ M ≤ P roto)</b>" : "") + "</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + pePct + "%;background:" + peColor + "\"></div></div>";
					if (ps.complete - ps.invalid > 0) peBody += "<div class=\"empty\">Σ TE (esperada) = <b>" + ps.sumTe.toLocaleString("es-PE", { maximumFractionDigits: 1 }) + " días</b> · Σ σ² = " + ps.sumVar.toLocaleString("es-PE", { maximumFractionDigits: 2 }) + ". La probabilidad de cumplimiento del plazo se calcula sobre la ruta crítica en el módulo Cronograma / CPM.</div>";
					else peBody += "<div class=\"empty\">Estima Optimista y Pesimista por actividad en el Análisis PERT; la M automática ya sigue a la duración por rendimiento de cuadrillas.</div>";
					if (ps.orphans) peBody += "<div class=\"empty\" style=\"margin-top:8px\">⚠ " + ps.orphans + " terna(s) huérfana(s): su actividad ya no existe. Revísalas en el Análisis PERT.</div>";
					cards.push("<div class=\"dash-card\"><h4>Análisis PERT</h4>" + peBody + "</div>");
				}
			}
		} else cards.push("<div class=\"dash-card\"><h4>Actividades por paquete de trabajo</h4><div class=\"empty\">Construye primero la EDT en WBS Builder; luego descompón cada paquete de trabajo en actividades con unidad y metrado en Definir las Actividades.</div></div>");
		if (sh.length) {
			const byCat = {};
			sh.forEach((s) => {
				const cat = String(s.category);
				byCat[cat] = (byCat[cat] || 0) + 1;
			});
			const max = Math.max.apply(null, Object.keys(byCat).map((k) => byCat[k]));
			const rows = Object.keys(byCat).map((k) => {
				return "<div class=\"bar-row\"><span class=\"nm\">" + esc(k) + "</span><span class=\"bar-track\"><span class=\"bar-fill\" style=\"width:" + Math.round(byCat[k] / max * 100) + "%;background:" + (CAT_COLORS[k] || "#8992a3") + "\"></span></span><span class=\"n\">" + byCat[k] + "</span></div>";
			}).join("");
			cards.push("<div class=\"dash-card\"><h4>Interesados por categoría</h4>" + rows + "</div>");
		} else cards.push("<div class=\"dash-card\"><h4>Interesados por categoría</h4><div class=\"empty\">Abre Stakeholder Studio y registra interesados para ver el desglose aquí.</div></div>");
		const obs = GPI.getModule("obs");
		const roles = GPI.util.obsNodes(obs);
		if (roles.length) {
			const byType = {};
			roles.forEach((r) => {
				byType[r.type] = (byType[r.type] || 0) + 1;
			});
			const maxT = Math.max.apply(null, Object.keys(byType).map((k) => byType[k]));
			const rowsT = Object.keys(byType).map((k) => {
				return "<div class=\"bar-row\"><span class=\"nm\">" + esc(OBS_TYPE_LABELS[k] || k) + "</span><span class=\"bar-track\"><span class=\"bar-fill\" style=\"width:" + Math.round(byType[k] / maxT * 100) + "%;background:" + (OBS_TYPE_COLORS[k] || "#8992a3") + "\"></span></span><span class=\"n\">" + byType[k] + "</span></div>";
			}).join("");
			cards.push("<div class=\"dash-card\"><h4>Equipo del Proyecto (OBS) por tipo de rol</h4>" + rowsT + "</div>");
		} else cards.push("<div class=\"dash-card\"><h4>Equipo del Proyecto (OBS) por tipo de rol</h4><div class=\"empty\">Abre Equipo del Proyecto y registra los puestos del equipo para ver el desglose aquí.</div></div>");
		const raci = GPI.getModule("raci");
		if (GPI.util.wbsLeaves(wbs).length) {
			const cov = GPI.util.raciCoverage(raci, wbs);
			let body;
			if (!raci || !raci.assignments || Object.keys(raci.assignments).length === 0) body = "<div class=\"empty\">Completa la Matriz RACI para asignar el Responsable (\"R\") de cada paquete de trabajo. Esa asignación es la que alimenta el campo \"Responsable\" del WBS — ya no la lista de interesados.</div>";
			else if (cov.withoutR.length) body = "<ul class=\"warn-list\">" + cov.withoutR.slice(0, 8).map((l) => "<li><span class=\"tag\">sin R</span>" + esc(l.code + " " + l.name) + "</li>").join("") + (cov.withoutR.length > 8 ? "<li class=\"empty\">…y " + (cov.withoutR.length - 8) + " más</li>" : "") + "</ul><div class=\"empty\" style=\"margin-top:8px\">Paquetes de trabajo sin Responsable asignado en la Matriz RACI (" + cov.withR + "/" + cov.total + " cubiertos). El \"Responsable\" del WBS solo se completa automáticamente para los paquetes que sí tienen un \"R\" en la RACI.</div>";
			else body = "<div class=\"ok-note\">✓ Los " + cov.total + " paquetes de trabajo tienen Responsable asignado en la Matriz RACI, sincronizado con el WBS.</div>";
			if (cov.withoutA && cov.withoutA.length) body += "<div class=\"empty\" style=\"margin-top:8px\">⚠ " + cov.withoutA.length + " paquete(s) sin Aprobador (\"A\") único definido en la RACI.</div>";
			cards.push("<div class=\"dash-card\"><h4>Coherencia RACI ↔ WBS</h4>" + body + "</div>");
		}
		const ch = GPI.getModule("charter");
		if (ch) {
			const chAudit = GPI.util.charterAudit(ch);
			const chColor = {
				verde: "var(--good)",
				ambar: "var(--warn)",
				rojo: "var(--danger)"
			}[chAudit.state] || "var(--ink-2)";
			const chLabel = {
				verde: "Lista para aprobar",
				ambar: "En progreso",
				rojo: "Incompleta"
			}[chAudit.state] || "—";
			const chPending = chAudit.items.filter((i) => !i.ok);
			let chBody = "<div class=\"kpi\"><span class=\"v\" style=\"color:" + chColor + "\">" + chAudit.pct + "%</span><span class=\"l\">" + esc(chLabel) + " · " + chAudit.okCount + "/" + chAudit.total + " elementos del checklist</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + chAudit.pct + "%;background:" + chColor + "\"></div></div>";
			if (chPending.length) chBody += "<ul class=\"warn-list\">" + chPending.slice(0, 5).map((i) => "<li><span class=\"tag\">" + esc(i.cat) + "</span>" + esc(i.label) + "</li>").join("") + (chPending.length > 5 ? "<li class=\"empty\">…y " + (chPending.length - 5) + " más</li>" : "") + "</ul>";
			else chBody += "<div class=\"ok-note\">✓ Los " + chAudit.total + " elementos del acta están cubiertos. Emite el reporte para la firma.</div>";
			const chBudget = ch.budget;
			const chBud = Number(chBudget?.amount) || 0;
			if (chBud > 0 && capex > 0 && chBud !== capex) chBody += "<div class=\"empty\" style=\"margin-top:8px\">⚠ El presupuesto del acta (" + money(chBud, chBudget?.currency || meta?.currency) + ") difiere del CAPEX de los datos comunes (" + money(capex, meta?.currency) + "). Sincroniza desde el Acta de Constitución.</div>";
			cards.push("<div class=\"dash-card\"><h4>Acta de Constitución</h4>" + chBody + "</div>");
		} else cards.push("<div class=\"dash-card\"><h4>Acta de Constitución</h4><div class=\"empty\">Abre el Acta de Constitución y registra propósito, objetivos, hitos, presupuesto y aprobación para autorizar formalmente el proyecto y ver aquí su índice de completitud.</div></div>");
		const sp = GPI.getModule("schedulePlan");
		if (sp) {
			const spAudit = GPI.util.schedulePlanAudit(sp);
			const stateColor = {
				verde: "var(--good)",
				ambar: "var(--warn)",
				rojo: "var(--danger)"
			}[spAudit.state] || "var(--ink-2)";
			const stateLabel = {
				verde: "Completo",
				ambar: "En progreso",
				rojo: "Incompleto"
			}[spAudit.state] || "—";
			const pending = spAudit.items.filter((i) => !i.ok);
			let body = "<div class=\"kpi\"><span class=\"v\" style=\"color:" + stateColor + "\">" + spAudit.pct + "%</span><span class=\"l\">" + esc(stateLabel) + " · " + spAudit.okCount + "/" + spAudit.total + " elementos del checklist</span></div><div class=\"bar-track\" style=\"margin:4px 0 10px\"><div class=\"bar-fill\" style=\"width:" + spAudit.pct + "%;background:" + stateColor + "\"></div></div>";
			if (pending.length) body += "<ul class=\"warn-list\">" + pending.slice(0, 5).map((i) => "<li><span class=\"tag\">" + esc(i.cat) + "</span>" + esc(i.label) + "</li>").join("") + (pending.length > 5 ? "<li class=\"empty\">…y " + (pending.length - 5) + " más</li>" : "") + "</ul>";
			else body += "<div class=\"ok-note\">✓ Los " + spAudit.total + " elementos del checklist de la base del cronograma (RP 38R-06) están cubiertos.</div>";
			cards.push("<div class=\"dash-card\"><h4>Plan de Gestión del Cronograma</h4>" + body + "</div>");
		} else cards.push("<div class=\"dash-card\"><h4>Plan de Gestión del Cronograma</h4><div class=\"empty\">Abre el Plan de Gestión del Cronograma y define metodología, calendario, hitos y umbrales de control para ver aquí su índice de completitud.</div></div>");
		const sch = GPI.getModule("schedule");
		if (sch && (sch.links || []).length) {
			const ss = GPI.util.scheduleStats();
			let scBody;
			if (ss.ok) {
				scBody = "<div class=\"kpi\"><span class=\"v\" style=\"color:var(--danger)\">" + ss.projectDuration + "</span><span class=\"l\">días laborables · " + ss.criticalCount + " actividad(es) crítica(s) · " + ss.links + " enlace(s)</span></div>";
				if (ss.finishDate) scBody += "<div class=\"ok-note\" style=\"margin-top:6px\">Fin estimado: <b>" + esc(ss.finishDate) + "</b></div>";
			} else scBody = "<div class=\"empty\">La red tiene un ciclo (dependencia circular). Ábrela en Cronograma / CPM para corregir los enlaces.</div>";
			cards.push("<div class=\"dash-card\"><h4>Cronograma / CPM</h4>" + scBody + "</div>");
		} else cards.push("<div class=\"dash-card\"><h4>Cronograma / CPM</h4><div class=\"empty\">Construye la red del cronograma en <b>Cronograma / CPM</b> (pega desde MS Project/Excel o agrega precedencias) para ver aquí la duración del proyecto y la ruta crítica.</div></div>");
		document.getElementById("dashGrid").innerHTML = cards.join("");
	}
	function kpi(v, u, l) {
		return "<div class=\"kpi\"><span class=\"v\">" + esc(String(v)) + "</span>" + (u ? "<span class=\"u\">" + esc(u) + "</span>" : "") + "<span class=\"l\">" + esc(l) + "</span></div>";
	}
	function renderInteg() {
		const snippet = "<script src=\"gpi-core.js\"><\/script>\n<script>\n  // 1) AL CARGAR: hidratar tu herramienta con el proyecto activo\n  if (window.GPI && GPI.available()) {\n    var proj = GPI.active();\n    if (proj) {\n      // metadatos comunes → encabezado\n      document.getElementById(\"projectTitle\").value = proj.meta.name;\n      document.getElementById(\"courseTitle\").value  = proj.meta.course;\n      // tu rebanada de datos (si existe)\n      var data = GPI.getModule(\"miModulo\");   // p. ej. \"wbs\", \"stakeholders\"\n      if (data) { /* cargar data en el estado interno y re-render */ }\n    }\n  }\n  // 2) AL CAMBIAR / AL SALIR: devolver los datos al proyecto\n  function sincronizar() {\n    if (!(window.GPI && GPI.active())) return;\n    GPI.setModule(\"miModulo\", /* tu objeto de datos */ estado);\n    GPI.patchMeta({ name: projectTitle.value, course: courseTitle.value });\n  }\n  window.addEventListener(\"beforeunload\", sincronizar);\n<\/script>";
		document.getElementById("integBody").innerHTML = "<p>Cada herramienta es un archivo HTML independiente. Todas leen y escriben un mismo objeto <code>proyecto</code> guardado en el navegador. El contrato es simple:</p><div class=\"step\"><span class=\"n\">1</span><div>Incluye <code>gpi-core.js</code> (mismo folder) antes de tu script.</div></div><div class=\"step\"><span class=\"n\">2</span><div>Al cargar, si hay proyecto activo, hidrata tu vista con <code>GPI.getModule(\"clave\")</code> y los metadatos comunes.</div></div><div class=\"step\"><span class=\"n\">3</span><div>Al cambiar o al salir, devuelve tu rebanada con <code>GPI.setModule(\"clave\", datos)</code>. Eso alimenta al Panel y a las demás herramientas.</div></div><div class=\"code\"><div class=\"cp\"><button class=\"btn sm\" id=\"btnCopy\">⧉ Copiar</button></div><pre>" + esc(snippet) + "</pre></div><p style=\"margin-top:12px\"><b>Esquema del proyecto</b> (una rebanada <code>modules.&lt;clave&gt;</code> por herramienta):</p><div class=\"code\"><pre>" + esc("{\n  meta: { name, code, client, location, sponsor, manager,\n          startDate, endDate, currency, capex, description, course },\n  modules: {\n    charter:      { identification, purpose, description, boundaries,\n                    objectives[], requirements[], deliverables[], milestones[],\n                    budget, risks[], assumptions[], constraints[], exclusions[],\n                    stakeholders[], approval },  // PMBOK — Project Charter\n    stakeholders: { stakeholders[], powerWeights, interestWeights },\n    wbs:          { rootId, idCounter, nodes },\n    activities:   { byLeaf: { wbsLeafId: [ {id, name, unit, qty} ] } },\n    pert:         { byActivity: { actId: {o, m, mAuto, p} }, inputMode },\n    obs:          { rootId, idCounter, nodes },   // roles del organigrama\n    raci:         { assignments: { wbsLeafId: { obsNodeId: \"R\"|\"A\"|\"C\"|\"I\" } } },\n    schedulePlan: { methodology, calendar, durationEstimating, criticalPath,\n                    controlThresholds[], performanceMeasurement, milestones[],\n                    scheduleReserve, roles[], reportingFormats[], changeControl,\n                    assumptions[], exclusions[], approval },  // AACE RP 38R-06 / PMBOK\n    cost:         { plan:{currency, evMethod, thresholds:{cpi, cv}},\n                    estimate:{class, boe}, budget:{baseCost, contingency,\n                    escalation, computed}, changeOrders[] },  // PMBOK 8 + AACE\n    // risks, schedule (CPM/Gantt), evm, montecarlo, ...\n  }\n}") + "</pre></div><p class=\"empty\">Si <code>gpi-core.js</code> no está presente, la herramienta sigue funcionando de forma independiente (el puente simplemente no se activa).</p>";
		const cp = document.getElementById("btnCopy");
		if (cp) cp.addEventListener("click", () => {
			navigator.clipboard && navigator.clipboard.writeText(snippet).then(() => {
				toast("Fragmento copiado");
			}, () => {
				toast("Copia manual: selecciona el texto");
			});
		});
	}
	function importToolInto() {
		const fi = document.getElementById("fileProject");
		fi.value = "";
		fi._mode = "module";
		fi.click();
	}
	function handleFile(file, mode) {
		const r = new FileReader();
		r.onload = (e) => {
			let obj;
			try {
				obj = JSON.parse(e.target.result);
			} catch (_) {
				toast("Archivo no válido");
				return;
			}
			if (mode === "module") {
				const res = GPI.ingestToolExport(obj);
				if (res.ok) {
					render();
					toast("Datos importados al módulo «" + res.module + "»");
				} else if (res.reason === "unknown-format") toast("No reconocí el formato de esa herramienta");
				else toast("No hay proyecto activo");
			} else {
				GPI.importProject(obj, true);
				render();
				toast("Proyecto importado");
			}
		};
		r.readAsText(file);
	}
	function baseModal(opts) {
		return new Promise((resolve) => {
			const ov = document.getElementById("modalOverlay");
			document.getElementById("modalTitle").textContent = opts.title || "";
			document.getElementById("modalMsg").textContent = opts.msg || "";
			const inp = document.getElementById("modalInput");
			if (opts.prompt !== void 0) {
				inp.style.display = "block";
				inp.value = opts.prompt || "";
			} else inp.style.display = "none";
			const ok = document.getElementById("modalOk"), cancel = document.getElementById("modalCancel");
			ok.textContent = opts.okText || "Aceptar";
			ok.className = "btn " + (opts.danger ? "danger" : "primary");
			function done(v) {
				ov.classList.remove("open");
				ok.onclick = cancel.onclick = null;
				ov.onclick = null;
				document.removeEventListener("keydown", key);
				resolve(v);
			}
			function key(e) {
				if (e.key === "Escape") done(null);
				if (e.key === "Enter") done(opts.prompt !== void 0 ? inp.value : true);
			}
			ok.onclick = () => {
				done(opts.prompt !== void 0 ? inp.value : true);
			};
			cancel.onclick = () => {
				done(null);
			};
			ov.onclick = (e) => {
				if (e.target === ov) done(null);
			};
			document.addEventListener("keydown", key);
			ov.classList.add("open");
			(opts.prompt !== void 0 ? inp : ok).focus();
		});
	}
	function confirmModal(title, msg, onOk) {
		baseModal({
			title,
			msg,
			okText: "Confirmar",
			danger: true
		}).then((v) => {
			if (v) onOk();
		});
	}
	function promptModal(title, msg, val) {
		return baseModal({
			title,
			msg,
			prompt: val || "",
			okText: "Guardar"
		});
	}
	function wire() {
		document.getElementById("projSelect").addEventListener("change", (e) => {
			GPI.setActive(e.target.value);
			render();
			setStatus("Proyecto cambiado.");
		});
		document.getElementById("btnNew").addEventListener("click", () => {
			promptModal("Nuevo proyecto", "Nombre del proyecto:", "Nuevo proyecto").then((name) => {
				if (name == null) return;
				GPI.createProject({ name: name || "Nuevo proyecto" });
				render();
				toast("Proyecto creado");
			});
		});
		document.getElementById("btnRename").addEventListener("click", () => {
			const m = GPI.meta();
			if (!m) return;
			promptModal("Renombrar proyecto", "Nuevo nombre:", m.name).then((name) => {
				if (name == null || !name.trim()) return;
				GPI.patchMeta({ name: name.trim() });
				render();
				toast("Renombrado");
			});
		});
		document.getElementById("btnDup").addEventListener("click", () => {
			const m = GPI.meta();
			if (!m) return;
			GPI.duplicateProject(GPI.activeId(), m.name + " (copia)");
			render();
			toast("Proyecto duplicado");
		});
		document.getElementById("btnDel").addEventListener("click", () => {
			const m = GPI.meta();
			if (!m) return;
			confirmModal("Eliminar proyecto", "¿Eliminar «" + m.name + "» y todos sus módulos? Esta acción no se puede deshacer.", () => {
				GPI.deleteProject(GPI.activeId());
				render();
				toast("Proyecto eliminado");
			});
		});
		document.getElementById("btnExport").addEventListener("click", () => {
			const p = GPI.exportActive();
			if (!p) return;
			const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob), a = document.createElement("a");
			const safe = (p.meta.name || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
			a.href = url;
			a.download = "proyecto_" + safe + ".json";
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			toast("Proyecto exportado");
		});
		document.getElementById("btnImport").addEventListener("click", () => {
			const fi = document.getElementById("fileProject");
			fi.value = "";
			fi._mode = "project";
			fi.click();
		});
		document.getElementById("fileProject").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) handleFile(files[0], e.target._mode || "project");
		});
	}
	ensureSeed();
	wire();
	render();
	probeModules(() => {});
	GPI.onChange(() => {
		render();
	});
	function reportShell(docTitle, moduleName, bodyHtml) {
		let el = document.getElementById("gpiReport");
		if (!el) {
			el = document.createElement("div");
			el.id = "gpiReport";
			document.body.appendChild(el);
		}
		const meta = GPI.meta();
		const today = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
		el.innerHTML = "<div class=\"rep-head\"><div><h1>" + esc(docTitle) + "</h1><div class=\"sub\">" + esc(meta?.name || "Proyecto") + (meta?.code ? " · " + esc(meta.code) : "") + "</div><div class=\"sub\" style=\"font-weight:500\">" + esc(meta?.course || "Gestión de Proyectos de Ingeniería") + "</div></div><div class=\"rep-meta\">" + esc(moduleName) + "<br>Emitido: " + esc(today) + (meta?.client ? "<br>Cliente: " + esc(meta.client) : "") + (meta?.location ? "<br>" + esc(meta.location) : "") + "</div></div>" + bodyHtml;
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
		const meta = GPI.meta();
		if (!meta) {
			toast("No hay un proyecto activo para reportar");
			return;
		}
		let body = "";
		body += "<h2>1. Datos comunes del proyecto</h2><table class=\"rep-kv\"><tr><td>Código</td><td>" + esc(meta.code || "—") + "</td></tr><tr><td>Cliente</td><td>" + esc(meta.client || "—") + "</td></tr><tr><td>Ubicación</td><td>" + esc(meta.location || "—") + "</td></tr><tr><td>Patrocinador</td><td>" + esc(meta.sponsor || "—") + "</td></tr><tr><td>Director de Proyecto</td><td>" + esc(meta.manager || "—") + "</td></tr><tr><td>Fechas del proyecto</td><td>" + repDate(meta.startDate) + " → " + repDate(meta.endDate) + "</td></tr><tr><td>Presupuesto (CAPEX)</td><td><b>" + money(meta.capex, meta.currency) + "</b></td></tr><tr><td>Descripción</td><td>" + esc(meta.description || "—") + "</td></tr></table>";
		const stk = GPI.getModule("stakeholders"), wbs = GPI.getModule("wbs"), raci = GPI.getModule("raci");
		const charter = GPI.getModule("charter"), plan = GPI.getModule("schedulePlan");
		const roll = GPI.util.wbsRollup(wbs);
		const cov = GPI.util.raciCoverage(raci, wbs);
		const actStats = GPI.util.activitiesStats(GPI.getModule("activities"), wbs);
		const chA = GPI.util.charterAudit(charter);
		const spA = GPI.util.schedulePlanAudit(plan);
		const capex = Number(meta.capex) || 0;
		const capexPct = capex > 0 ? Math.round(roll.cost / capex * 100) : null;
		body += "<h2>2. Indicadores integrados</h2><table class=\"rep-kv\"><tr><td>Interesados registrados</td><td>" + (stk?.stakeholders || []).length + "</td></tr><tr><td>Paquetes de trabajo (EDT)</td><td>" + roll.leafCount + " hojas · " + roll.count + " elementos</td></tr><tr><td>Actividades definidas</td><td>" + actStats.total + " · cobertura de paquetes: " + actStats.covered + "/" + actStats.leaves + " (" + actStats.pct + "%)</td></tr><tr><td>Costo desglosado (rollup EDT)</td><td>" + money(roll.cost, meta.currency) + (capexPct != null ? " — <b>" + capexPct + "%</b> del CAPEX autorizado" : "") + "</td></tr><tr><td>Cobertura RACI</td><td>" + cov.withR + "/" + cov.total + " paquetes con Responsable · " + cov.withoutA.length + " sin Aprobador</td></tr><tr><td>Acta de Constitución</td><td>" + (charter ? chA.pct + "% de completitud (" + chA.okCount + "/" + chA.total + ")" : "Sin iniciar") + "</td></tr><tr><td>Plan de Gestión del Cronograma</td><td>" + (plan ? spA.pct + "% de completitud (" + spA.okCount + "/" + spA.total + ")" : "Sin iniciar") + "</td></tr></table>";
		body += "<h2>3. Estado por herramienta</h2><table><tr><th style=\"width:26%\">Herramienta</th><th style=\"width:14%\">Estado</th><th>Indicadores</th></tr>" + MODULES.map((mod) => {
			if (!mod.file) return "<tr><td>" + esc(mod.name) + "</td><td>Próximamente</td><td class=\"rep-note\">Módulo en desarrollo</td></tr>";
			if (!isDelivered(mod)) return "<tr><td>" + esc(mod.name) + "</td><td>No entregado</td><td class=\"rep-note\">Se habilitará más adelante en el curso</td></tr>";
			const has = !!GPI.getModule(mod.key);
			const stats = has ? statChips(mod.key) : null;
			const statTxt = stats ? stats.map((s) => "<b>" + esc(String(s.v)) + "</b> " + esc(s.l)).join(" · ") : "—";
			return "<tr><td>" + esc(mod.name) + "</td><td>" + (has ? "Con datos" : "Vacío") + "</td><td>" + statTxt + "</td></tr>";
		}).join("") + "</table><p class=\"rep-note\">Reporte generado desde el Panel de Control GPI. Cada herramienta emite además su propio reporte detallado con el botón \"📄 Reporte\".</p>";
		reportShell("Reporte Ejecutivo del Proyecto", "Panel de Control · Ecosistema GPI", body);
	}
	(function() {
		const b = document.getElementById("btnReport");
		if (b) b.addEventListener("click", buildReport);
	})();
	//#endregion
})();
