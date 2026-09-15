(function() {
	//#region src/modules/activities/main.ts
	var mode = "live";
	var stateLive = {
		byLeaf: {},
		idCounter: 1,
		milestones: []
	};
	var stateSample = null;
	var wbsLive = null;
	function state() {
		return mode === "sample" ? stateSample : stateLive;
	}
	function wbsData() {
		return mode === "sample" ? SAMPLE_WBS : wbsLive;
	}
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
	function normalizeState(obj) {
		obj = obj || {};
		const by = {}, src = obj.byLeaf || {};
		Object.keys(src).forEach((k) => {
			by[k] = (Array.isArray(src[k]) ? src[k] : []).map((a) => ({
				id: a.id || "a" + Math.random().toString(36).slice(2, 8),
				name: a.name || "",
				unit: a.unit || "",
				qty: a.qty == null ? "" : a.qty,
				perf: a.perf == null ? "" : a.perf,
				teams: a.teams == null || a.teams === "" ? 1 : a.teams
			}));
		});
		const milestones = (Array.isArray(obj.milestones) ? obj.milestones : []).map((m) => ({
			id: m.id || "m" + Math.random().toString(36).slice(2, 8),
			code: m.code || "",
			name: m.name || "",
			leafId: m.leafId || null,
			afterLeafId: m.afterLeafId || null
		}));
		return {
			byLeaf: by,
			idCounter: Number(obj.idCounter) || 1,
			milestones
		};
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
	function treeRows() {
		const w = wbsData();
		const out = [];
		if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
		(function walk(id, code, depth) {
			const n = w.nodes[id];
			if (!n) return;
			const kids = n.children || [];
			if (id !== w.rootId) out.push({
				kind: kids.length ? "phase" : "package",
				id,
				code,
				name: n.name || "",
				depth
			});
			kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1));
		})(w.rootId, "", 0);
		return out;
	}
	function leafRows() {
		return treeRows().filter((r) => r.kind === "package");
	}
	function stats() {
		const st = state(), leaves = leafRows();
		const leafIds = {};
		leaves.forEach((l) => {
			leafIds[l.id] = true;
		});
		let total = 0, orphans = 0, covered = 0;
		const uncovered = [];
		Object.keys(st.byLeaf).forEach((k) => {
			const n = (st.byLeaf[k] || []).length;
			if (leafIds[k]) total += n;
			else orphans += n;
		});
		leaves.forEach((l) => {
			if ((st.byLeaf[l.id] || []).length) covered++;
			else uncovered.push(l);
		});
		return {
			total,
			leaves: leaves.length,
			covered,
			uncovered,
			orphans,
			pct: leaves.length ? Math.round(covered / leaves.length * 100) : 0
		};
	}
	function render() {
		const chip = document.getElementById("modeChip");
		chip.textContent = mode === "sample" ? "MODO EJEMPLO" : "EDT del proyecto";
		chip.className = "mode-chip " + (mode === "sample" ? "sample" : "live");
		document.getElementById("btnSample").style.display = mode === "sample" ? "none" : "";
		document.getElementById("btnLive").style.display = mode === "sample" ? "" : "none";
		document.getElementById("btnReload").disabled = mode === "sample";
		renderTable();
		renderSidebar();
		renderOrphans();
	}
	function numVal(v) {
		if (v === "" || v == null) return NaN;
		const p = parseExcelNum(v);
		return p === null || p === "" ? NaN : Number(p);
	}
	function durActivity(a) {
		const met = numVal(a.qty), r = numVal(a.perf);
		let eq = numVal(a.teams);
		if (!isFinite(met) || met <= 0 || !isFinite(r) || r <= 0) return null;
		if (!isFinite(eq) || eq < 1) eq = 1;
		return Math.ceil(met / (eq * r));
	}
	function placeLooseMilestones(milestones, knownLeafIds) {
		const start = [], orphan = [];
		const afterLeaf = {};
		milestones.filter((m) => !m.leafId).forEach((m) => {
			if (!m.afterLeafId) start.push(m);
			else if (knownLeafIds[m.afterLeafId]) (afterLeaf[m.afterLeafId] ||= []).push(m);
			else orphan.push(m);
		});
		return {
			start,
			afterLeaf,
			orphan
		};
	}
	function fullRows() {
		const w = wbsData(), st = state(), out = [];
		if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
		let n = 0;
		const rootName = (w.nodes[w.rootId].name || "").trim() || document.getElementById("projectTitle").value || "Proyecto";
		out.push({
			kind: "project",
			n: n++,
			code: "0",
			level: 1,
			name: rootName
		});
		const milestones = st.milestones || [];
		const tree = treeRows();
		const knownLeafIds = {};
		tree.forEach((r) => {
			if (r.kind === "package") knownLeafIds[r.id] = true;
		});
		const loose = placeLooseMilestones(milestones, knownLeafIds);
		loose.start.forEach((m) => {
			out.push({
				kind: "milestone",
				n: n++,
				code: m.code,
				level: 2,
				name: m.name,
				dur: 0
			});
		});
		tree.forEach((r) => {
			if (r.kind === "phase") out.push({
				kind: "phase",
				n: n++,
				code: r.code,
				level: r.depth + 1,
				name: r.name,
				id: r.id
			});
			else {
				out.push({
					kind: "package",
					n: n++,
					code: r.code,
					level: r.depth + 1,
					name: r.name,
					id: r.id,
					count: (st.byLeaf[r.id] || []).length
				});
				(st.byLeaf[r.id] || []).forEach((a, i) => {
					out.push({
						kind: "activity",
						n: n++,
						code: r.code + "." + (i + 1),
						level: r.depth + 2,
						name: a.name,
						unit: a.unit,
						qty: a.qty,
						perf: a.perf,
						teams: a.teams,
						dur: durActivity(a),
						leafId: r.id,
						actIndex: i
					});
				});
				milestones.filter((m) => m.leafId === r.id).forEach((m) => {
					out.push({
						kind: "milestone",
						n: n++,
						code: m.code,
						level: r.depth + 2,
						name: m.name,
						dur: 0,
						leafId: r.id
					});
				});
				(loose.afterLeaf[r.id] || []).forEach((m) => {
					out.push({
						kind: "milestone",
						n: n++,
						code: m.code,
						level: r.depth + 1,
						name: m.name,
						dur: 0
					});
				});
			}
		});
		loose.orphan.forEach((m) => {
			out.push({
				kind: "milestone",
				n: n++,
				code: m.code,
				level: 2,
				name: m.name,
				dur: 0
			});
		});
		return out;
	}
	function renderTable() {
		const tbody = document.getElementById("actsBody");
		const empty = document.getElementById("emptyState");
		const rows = fullRows();
		if (!rows.length) {
			tbody.innerHTML = "";
			empty.style.display = "";
			empty.innerHTML = mode === "live" ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo descompone sus paquetes de trabajo en actividades.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>" : "<b>Sin EDT de ejemplo.</b>";
			const bi = document.getElementById("btnSampleInner");
			if (bi) bi.addEventListener("click", enterSample);
			return;
		}
		empty.style.display = "none";
		let html = "";
		rows.forEach((r) => {
			if (r.kind === "project") html += "<tr class=\"proj-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\" style=\"color:var(--ink-1)\">0</td><td colspan=\"6\">" + esc(r.name) + " <span class=\"proj-hint\">Fila 0</span></td></tr>";
			else if (r.kind === "phase") html += "<tr class=\"phase-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\">" + esc(r.code) + "</td><td colspan=\"6\" style=\"padding-left:" + (10 + Math.max(0, r.level - 2) * 16) + "px\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") html += "<tr class=\"pkg-row\" id=\"pkg-" + esc(r.id) + "\"><td class=\"n-cell\">" + r.n + "</td><td class=\"pk-code\">" + esc(r.code) + "</td><td colspan=\"6\" style=\"padding-left:" + (8 + Math.max(0, r.level - 2) * 16) + "px\"><span class=\"pk-name\">" + esc(r.name) + "</span><span class=\"pk-count" + (r.count ? "" : " zero") + "\">" + r.count + " act.</span></td></tr>";
			else if (r.kind === "milestone") html += "<tr class=\"act-row milestone-row\"><td class=\"n-cell act-item\">" + r.n + "</td><td class=\"act-code milestone-code\">◆ " + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "<span class=\"milestone-tag\">Hito</span></td><td>—</td><td class=\"num\">—</td><td class=\"num\">—</td><td class=\"num\" style=\"text-align:center\">—</td><td class=\"dur-cell\" title=\"Los hitos tienen duración cero por definición\">0</td></tr>";
			else html += "<tr class=\"act-row\"><td class=\"n-cell act-item\">" + r.n + "</td><td class=\"act-code\">" + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "</td><td>" + esc(r.unit || "—") + "</td><td class=\"num\">" + fmtQty(r.qty) + "</td><td class=\"num\">" + fmtQty(r.perf) + "</td><td class=\"num\" style=\"text-align:center\">" + esc(String(Math.max(1, numVal(r.teams) || 1))) + "</td>" + (r.dur == null ? "<td class=\"dur-cell empty\" title=\"Falta el metrado o el rendimiento para calcular la duración\">—</td>" : "<td class=\"dur-cell\" title=\"Dur = " + esc(r.qty) + " ÷ (" + esc(String(Math.max(1, numVal(r.teams) || 1))) + " × " + esc(r.perf) + "), redondeada al entero superior\">" + r.dur + "</td>") + "</tr>";
		});
		tbody.innerHTML = html;
	}
	function parseExcelNum(s) {
		let str = String(s == null ? "" : s).trim().replace(/[\s ]/g, "");
		if (!str) return "";
		const hasDot = str.indexOf(".") !== -1, hasComma = str.indexOf(",") !== -1;
		if (hasDot && hasComma) {
			if (str.lastIndexOf(".") > str.lastIndexOf(",")) str = str.replace(/,/g, "");
			else str = str.replace(/\./g, "").replace(/,/g, ".");
		} else if (hasComma) {
			const parts = str.split(",");
			str = parts.length >= 2 && parts.slice(1).every((p) => p.length === 3 && /^\d+$/.test(p)) ? parts.join("") : parts.join(".");
		}
		const n = Number(str);
		return isFinite(n) ? String(n) : null;
	}
	function copyWholeTable() {
		const rows = fullRows();
		if (!rows.length) {
			setStatus("No hay tabla que copiar.");
			return;
		}
		const lines = ["Id.	EDT	Paquete de trabajo / Actividad	Unidad	Metrado	Rend. (R)	#Eq	Dur. (d)"];
		rows.forEach((r) => {
			const isAct = r.kind === "activity", isMs = r.kind === "milestone";
			lines.push([
				r.n,
				r.code,
				(r.name || "") + (isMs ? " (hito)" : ""),
				isAct ? r.unit || "" : "",
				isAct ? r.qty == null ? "" : r.qty : "",
				isAct ? r.perf == null ? "" : r.perf : "",
				isAct ? Math.max(1, numVal(r.teams) || 1) : "",
				isAct && r.dur != null ? r.dur : isMs ? 0 : ""
			].join("	"));
		});
		const text = lines.join("\n");
		function done() {
			setStatus("Tabla copiada al portapapeles (" + rows.length + " filas + encabezado): pégala en Excel con Ctrl+V.");
		}
		function legacy() {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.style.cssText = "position:fixed;opacity:0";
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand("copy");
				done();
			} catch (_) {
				setStatus("No se pudo copiar al portapapeles.");
			}
			ta.remove();
		}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy);
		else legacy();
	}
	function renderSidebar() {
		const s = stats();
		document.getElementById("sbTotal").textContent = String(s.total);
		document.getElementById("sbCov").textContent = s.covered + "/" + s.leaves + " paquetes con actividades";
		document.getElementById("sbPct").textContent = s.pct + "%";
		const bar = document.getElementById("sbBar");
		bar.style.width = s.pct + "%";
		bar.style.background = s.pct >= 100 ? "var(--good)" : s.pct >= 50 ? "var(--warn)" : "var(--act-a)";
		const host = document.getElementById("missList");
		if (!s.leaves) host.innerHTML = "<div style=\"font-size:11.5px;color:var(--ink-2)\">Sin EDT cargada.</div>";
		else if (!s.uncovered.length) host.innerHTML = "<div class=\"miss-ok\">✓ Todos los paquetes de trabajo tienen al menos una actividad.</div>";
		else {
			host.innerHTML = s.uncovered.map((l) => "<div class=\"miss-item\" data-goto=\"" + esc(l.id) + "\"><span class=\"mc\">" + esc(l.code) + "</span><span>" + esc(l.name) + "</span></div>").join("");
			host.querySelectorAll("[data-goto]").forEach((el) => {
				el.addEventListener("click", () => {
					const row = document.getElementById("pkg-" + el.dataset.goto);
					if (row) row.scrollIntoView({
						behavior: "smooth",
						block: "center"
					});
				});
			});
		}
	}
	function renderOrphans() {
		const st = state(), leaves = leafRows();
		const leafIds = {};
		leaves.forEach((l) => {
			leafIds[l.id] = true;
		});
		const orphanKeys = Object.keys(st.byLeaf).filter((k) => !leafIds[k] && (st.byLeaf[k] || []).length);
		const n = orphanKeys.reduce((acc, k) => acc + st.byLeaf[k].length, 0);
		const bn = document.getElementById("orphanBanner");
		if (!n) {
			bn.classList.remove("show");
			bn.innerHTML = "";
			return;
		}
		bn.classList.add("show");
		bn.innerHTML = "<b>⚠ " + n + " actividad(es) huérfana(s):</b> su paquete de trabajo ya no existe en la EDT o dejó de ser una hoja (se le agregaron sub-paquetes). No aparecen en la tabla ni en los conteos. <button class=\"btn sm danger\" id=\"btnOrphans\">Eliminar huérfanas</button>";
		document.getElementById("btnOrphans").addEventListener("click", async () => {
			if (!await showConfirm("Se eliminarán definitivamente las " + n + " actividades huérfanas. Si en realidad la EDT cambió por error, corrígela primero en WBS Builder y vuelve a recargar.", "Eliminar actividades huérfanas")) return;
			orphanKeys.forEach((k) => {
				delete st.byLeaf[k];
			});
			onDirty(true);
			setStatus("Actividades huérfanas eliminadas.");
		});
	}
	var dirtyTimer;
	function onDirty(rerender) {
		if (rerender) render();
		else renderSidebar();
		clearTimeout(dirtyTimer);
		dirtyTimer = setTimeout(gpiPush, 800);
		setStatus("Cambios sin exportar — se sincronizan solos con el Panel.");
	}
	var SAMPLE_WBS = (function() {
		const nodes = {};
		let k = 0;
		function N(parentId, name) {
			const id = "w" + ++k;
			nodes[id] = {
				id,
				parentId: parentId ?? void 0,
				name,
				children: []
			};
			if (parentId) nodes[parentId].children.push(id);
			return id;
		}
		const root = N(null, "Proyecto DISTRIB+ S.A. — Almacén Lurín");
		const f1 = N(root, "Dirección de Proyecto");
		const p11 = N(f1, "Acta de constitución"), p12 = N(f1, "Plan de gestión del proyecto"), p13 = N(f1, "Informes de seguimiento y control");
		const f2 = N(root, "Ingeniería y Diseño");
		const p21 = N(f2, "Estudio de suelos"), p22 = N(f2, "Diseño estructural"), p23 = N(f2, "Diseño eléctrico y sanitario"), p24 = N(f2, "Permisos y licencias municipales");
		const f3 = N(root, "Procura");
		const p31 = N(f3, "Estructuras metálicas prefabricadas"), p32 = N(f3, "Materiales de construcción"), p33 = N(f3, "Equipos eléctricos e instalaciones");
		const f4 = N(root, "Construcción");
		const p41 = N(f4, "Movimiento de tierras"), p42 = N(f4, "Cimentaciones"), p43 = N(f4, "Estructura y cobertura"), p44 = N(f4, "Acabados y cerramientos"), p45 = N(f4, "Instalaciones MEP");
		const f5 = N(root, "Pruebas y Puesta en Marcha");
		const p51 = N(f5, "Pruebas de instalaciones"), p52 = N(f5, "Capacitación al cliente"), p53 = N(f5, "Acta de entrega y cierre");
		return {
			rootId: root,
			idCounter: k + 1,
			nodes,
			ids: {
				p11,
				p12,
				p13,
				p21,
				p22,
				p23,
				p24,
				p31,
				p32,
				p33,
				p41,
				p42,
				p43,
				p44,
				p45,
				p51,
				p52,
				p53
			}
		};
	})();
	function sampleActivities() {
		const I = SAMPLE_WBS.ids;
		const by = {};
		let n = 0;
		function A(name, unit, qty, perf, teams) {
			return {
				id: "a" + ++n,
				name,
				unit,
				qty,
				perf: perf == null ? "" : perf,
				teams: teams == null ? 1 : teams
			};
		}
		by[I.p11] = [A("Elaboración y aprobación del acta de constitución", "doc", 1, .25)];
		by[I.p12] = [A("Plan para la dirección del proyecto (líneas base)", "doc", 1, .2), A("Planes subsidiarios de gestión", "doc", 6, .5)];
		by[I.p13] = [A("Elaboración de informes mensuales de avance", "doc", 4, .5), A("Reuniones de control y seguimiento del proyecto", "reunión", 16, 2)];
		by[I.p21] = [
			A("Calicatas exploratorias", "und", 8, 2),
			A("Ensayos de laboratorio de suelos", "glb", 1, .1),
			A("Informe geotécnico", "doc", 1, .25)
		];
		by[I.p22] = [A("Memoria de cálculo estructural", "doc", 1, .1), A("Planos estructurales", "lám", 24, 2)];
		by[I.p23] = [A("Memoria de cálculo eléctrico y sanitario", "doc", 1, .15), A("Planos eléctricos y sanitarios", "lám", 18, 2)];
		by[I.p24] = [A("Trámite de licencia de edificación municipal", "trámite", 1, .05), A("Trámite de certificado ITSE", "trámite", 1, .1)];
		by[I.p31] = [A("Fabricación de estructuras metálicas", "ton", 260, 15, 2), A("Transporte y entrega de estructuras a obra", "viaje", 12, 3)];
		by[I.p32] = [A("Adquisición y suministro de cemento y agregados", "ton", 800, 100), A("Adquisición y suministro de materiales varios de construcción", "glb", 1, .15)];
		by[I.p33] = [A("Adquisición de tableros y equipos eléctricos", "und", 15, 3), A("Adquisición de equipos de instalaciones sanitarias", "und", 10, 2)];
		by[I.p41] = [
			A("Corte y excavación masiva", "m³", 4800, 320, 2),
			A("Relleno y compactación con material propio", "m³", 2100, 250),
			A("Eliminación de material excedente", "m³", 2700, 300),
			A("Nivelación y perfilado de plataforma", "m²", 6500, 1200)
		];
		by[I.p42] = [
			A("Excavación de zanjas para zapatas", "m³", 620, 60, 2),
			A("Solado de concreto e=10 cm", "m²", 480, 120),
			A("Acero de refuerzo fy=4200 kg/cm²", "kg", 38500, 2500, 2),
			A("Concreto f'c=280 kg/cm² en zapatas", "m³", 410, 45, 2),
			A("Encofrado y desencofrado de cimentaciones", "m²", 950, 90, 2)
		];
		by[I.p43] = [
			A("Montaje de columnas metálicas", "und", 48, 6),
			A("Montaje de vigas y tijerales", "ton", 96, 8),
			A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)
		];
		by[I.p44] = [
			A("Tarrajeo de muros y cielorrasos", "m²", 3200, 40, 2),
			A("Pintura general de interiores y exteriores", "m²", 3200, 80, 2),
			A("Cerramiento perimétrico", "m", 320, 20)
		];
		by[I.p45] = [A("Instalación de tableros y circuitos eléctricos", "pto", 980, 25, 2), A("Instalación de redes sanitarias", "m", 450, 30)];
		by[I.p51] = [A("Pruebas de tableros y circuitos eléctricos", "pto", 120, 30), A("Pruebas hidráulicas de redes sanitarias", "glb", 1, .5)];
		by[I.p52] = [A("Capacitación operativa al personal del cliente", "hora", 40, 5), A("Elaboración de manuales de operación y mantenimiento", "doc", 2, .5)];
		by[I.p53] = [A("Elaboración de dossier de calidad y planos as-built", "doc", 1, .1), A("Acta de entrega y cierre del proyecto", "doc", 1, .5)];
		const milestones = [
			{
				id: "m1",
				code: "H1",
				name: "Inicio del Proyecto",
				leafId: null,
				afterLeafId: null
			},
			{
				id: "m2",
				code: "H2",
				name: "Fin de Cimentaciones",
				leafId: I.p42
			},
			{
				id: "m3",
				code: "H3",
				name: "Cierre del Proyecto",
				leafId: null,
				afterLeafId: I.p53
			}
		];
		return {
			byLeaf: by,
			idCounter: n + 1,
			milestones
		};
	}
	function enterSample() {
		mode = "sample";
		if (!stateSample) stateSample = sampleActivities();
		render();
		setStatus("Modo ejemplo: EDT y actividades didácticas (no toca los datos del proyecto).");
	}
	function enterLive() {
		mode = "live";
		render();
		setStatus("De vuelta a la EDT del proyecto activo.");
	}
	function wbsCodesOf(wbs) {
		const codes = {};
		(function walk(id, code) {
			codes[id] = code;
			(wbs.nodes[id].children || []).forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
		})(wbs.rootId, "");
		return codes;
	}
	function sampleVirtualRows() {
		const codes = wbsCodesOf(SAMPLE_WBS);
		const sample = sampleActivities();
		const rows = [];
		const packageIds = Object.keys(sample.byLeaf);
		const knownLeafIds = {};
		packageIds.forEach((id) => {
			knownLeafIds[id] = true;
		});
		const loose = placeLooseMilestones(sample.milestones, knownLeafIds);
		loose.start.forEach((m) => {
			rows.push([
				"",
				"",
				m.name,
				"Hito",
				m.code,
				"",
				"",
				"",
				""
			]);
		});
		packageIds.forEach((leafId) => {
			const code = codes[leafId];
			if (!code) return;
			sample.byLeaf[leafId].forEach((a) => {
				rows.push([
					code,
					"",
					a.name,
					"",
					"",
					a.unit,
					String(a.qty),
					String(a.perf ?? ""),
					String(a.teams ?? "")
				]);
			});
			sample.milestones.filter((m) => m.leafId === leafId).forEach((m) => {
				rows.push([
					code,
					"",
					m.name,
					"Hito",
					m.code,
					"",
					"",
					"",
					""
				]);
			});
			(loose.afterLeaf[leafId] || []).forEach((m) => {
				rows.push([
					"",
					"",
					m.name,
					"Hito",
					m.code,
					"",
					"",
					"",
					""
				]);
			});
		});
		loose.orphan.forEach((m) => {
			rows.push([
				"",
				"",
				m.name,
				"Hito",
				m.code,
				"",
				"",
				"",
				""
			]);
		});
		return rows;
	}
	async function loadSampleIntoProject() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
			await showAlert("Esto solo aplica con un proyecto activo conectado al Panel de Control. Usa \"Modo ejemplo\" para explorar el caso DISTRIB+ sin conexión.");
			return;
		}
		gpiPullWbs();
		const prevMode = mode;
		mode = "live";
		if (!leafRows().length) {
			mode = prevMode;
			await showAlert("La EDT del proyecto activo está vacía. Carga primero el ejemplo en WBS Builder (\"Cargar ejemplo\") y vuelve aquí.");
			return;
		}
		const result = reconcileImportRows(sampleVirtualRows(), {
			code: 0,
			name: 2,
			type: 3,
			milestoneCode: 4,
			unit: 5,
			qty: 6,
			perf: 7,
			teams: 8
		});
		if (!result.matched && !result.matchedMilestones) {
			mode = prevMode;
			await showAlert("Ningún código EDT del ejemplo coincide con la EDT actual del proyecto. Carga primero el caso DISTRIB+ en WBS Builder (\"Cargar ejemplo\").");
			return;
		}
		let msg = "Se reemplazarán las actividades del PROYECTO ACTIVO (no el modo ejemplo) por las " + result.matched + " actividad(es)" + (result.matchedMilestones ? " y " + result.matchedMilestones + " hito(s)" : "") + " de ejemplo de DISTRIB+ que coinciden con su EDT actual.";
		if (result.unmatchedCodes.length) msg += " " + result.unmatchedCodes.length + " código(s) del ejemplo no se encontraron en la EDT actual (¿la cargaste igual que en WBS Builder?): " + result.unmatchedCodes.slice(0, 8).join(", ") + (result.unmatchedCodes.length > 8 ? "…" : "") + ".";
		if (!await showConfirm(msg, "Cargar ejemplo en el proyecto")) {
			mode = prevMode;
			render();
			return;
		}
		stateLive = {
			byLeaf: result.byLeaf,
			idCounter: result.idCounter,
			milestones: result.milestones
		};
		render();
		gpiPush();
		setStatus("Ejemplo DISTRIB+ cargado en el proyecto activo (" + result.matched + " actividad(es)" + (result.matchedMilestones ? ", " + result.matchedMilestones + " hito(s)" : "") + ").");
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
		el.innerHTML = "<div class=\"rep-head\"><div><h1>" + esc(docTitle) + "</h1><div class=\"sub\">" + esc(pName) + (meta.code ? " · " + esc(meta.code) : "") + "</div><div class=\"sub\" style=\"font-weight:500\">" + esc(course) + "</div></div><div class=\"rep-meta\">" + esc(moduleName) + "<br>Emitido: " + esc(today) + (meta.client ? "<br>Cliente: " + esc(meta.client) : "") + (meta.location ? "<br>" + esc(meta.location) : "") + "</div></div>" + bodyHtml;
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
	function fmtQty(v) {
		const n = numVal(v);
		if (!isFinite(n) || v === "" || v == null) return "—";
		return n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
	}
	function buildReport() {
		const s = stats();
		let body = (mode === "sample" ? "<p class=\"rep-note\"><b>Modo ejemplo:</b> este listado usa la EDT y las actividades didácticas, no los datos del proyecto activo.</p>" : "") + "<h2>1. Resumen</h2><table class=\"rep-kv\"><tr><td>Actividades definidas</td><td><b>" + s.total + "</b></td></tr><tr><td>Cobertura de paquetes de trabajo</td><td>" + s.covered + " de " + s.leaves + " paquetes con actividades (<b>" + s.pct + "%</b>)</td></tr>" + (s.orphans ? "<tr><td>Actividades huérfanas</td><td>⚠ " + s.orphans + " (su paquete ya no existe en la EDT)</td></tr>" : "") + "</table><h2>2. Listado de actividades y metrados</h2><p class=\"rep-note\">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el Id corre consecutivo, sin saltos, por todas las filas (incluidos los hitos) — igual que el Task ID de MS Project, para que esta tabla se pueda cotejar fila por fila contra un cronograma pegado o exportado ahí. Cada actividad hereda el código EDT de su paquete más un correlativo. La duración es un valor calculado: Dur = Met ÷ (#Eq × R), donde R es el rendimiento diario de un equipo y #Eq el número de equipos en paralelo, redondeada al entero superior.</p><table><tr><th style=\"width:6%\">Id.</th><th style=\"width:9%\">Código EDT</th><th>Paquete de trabajo / Actividad</th><th style=\"width:7%\">Unidad</th><th style=\"width:9%\">Metrado</th><th style=\"width:9%\">Rend. (R)</th><th style=\"width:6%\">#Eq</th><th style=\"width:8%\">Dur. (d)</th></tr>";
		const repRows = fullRows();
		if (!repRows.length) body += "<tr><td colspan=\"8\" class=\"rep-note\">— Sin EDT cargada —</td></tr>";
		repRows.forEach((r) => {
			if (r.kind === "project") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">0</td><td class=\"num rep-phase\">0</td><td class=\"rep-phase\" colspan=\"6\">" + esc(r.name) + " <span class=\"rep-note\">(tarea resumen del proyecto)</span></td></tr>";
			else if (r.kind === "phase") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-phase\">" + esc(r.code) + "</td><td class=\"rep-phase\" colspan=\"6\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") body += "<tr><td class=\"num rep-pkg\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-pkg\">" + esc(r.code) + "</td><td class=\"rep-pkg\">" + esc(r.name) + "</td><td class=\"rep-pkg\" colspan=\"5\">" + (r.count ? r.count + " actividad(es)" : "<span class=\"rep-note\">sin actividades</span>") + "</td></tr>";
			else if (r.kind === "milestone") body += "<tr><td class=\"num\" style=\"text-align:center\">" + r.n + "</td><td class=\"num\">◆ " + esc(r.code) + "</td><td>" + esc(r.name) + " <span class=\"rep-note\">(hito)</span></td><td>—</td><td class=\"num\" style=\"text-align:right\">—</td><td class=\"num\" style=\"text-align:right\">—</td><td class=\"num\" style=\"text-align:center\">—</td><td class=\"num\" style=\"text-align:center\"><b>0</b></td></tr>";
			else body += "<tr><td class=\"num\" style=\"text-align:center\">" + r.n + "</td><td class=\"num\">" + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "</td><td>" + esc(r.unit || "—") + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.qty) + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.perf) + "</td><td class=\"num\" style=\"text-align:center\">" + esc(String(Math.max(1, numVal(r.teams) || 1))) + "</td><td class=\"num\" style=\"text-align:center\"><b>" + (r.dur == null ? "—" : r.dur) + "</b></td></tr>";
		});
		body += "</table>";
		reportShell("Listado de Actividades y Metrados", "Definir las Actividades · Gestión del Cronograma", body);
	}
	function xmlEsc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	var TEMPLATE_HEADERS = [
		"Código EDT",
		"Paquete de trabajo",
		"Nombre de la actividad",
		"Tipo",
		"Código de hito",
		"Unidad",
		"Metrado",
		"Rendimiento (R)",
		"N.º de equipos"
	];
	var DATA_SHEET_NAME = "EDT";
	function xlsxStylesXml() {
		const xfs = [
			"<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/>",
			"<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/></xf>",
			"<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\"/></xf>",
			"<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyNumberFormat=\"1\" applyAlignment=\"1\"><alignment horizontal=\"right\"/></xf>",
			"<xf numFmtId=\"0\" fontId=\"3\" fillId=\"0\" borderId=\"0\" applyFont=\"1\" applyAlignment=\"1\"><alignment vertical=\"top\" wrapText=\"1\"/></xf>"
		];
		for (let i = 0; i < 10; i++) xfs.push("<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"left\" indent=\"" + i + "\"/></xf>");
		for (let i = 0; i < 10; i++) xfs.push("<xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" applyFont=\"1\" applyAlignment=\"1\"><alignment horizontal=\"left\" indent=\"" + i + "\"/></xf>");
		xfs.push("<xf numFmtId=\"0\" fontId=\"2\" fillId=\"3\" borderId=\"0\" applyFont=\"1\" applyFill=\"1\"/>");
		return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"#,##0.00\"/></numFmts><fonts count=\"4\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"12\"/><name val=\"Calibri\"/></font><font><i/><sz val=\"10\"/><color rgb=\"FF4D5768\"/><name val=\"Calibri\"/></font></fonts><fills count=\"4\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFDDEBF7\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFE8F6FC\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style=\"thin\"><color rgb=\"FFB9C6D2\"/></left><right style=\"thin\"><color rgb=\"FFB9C6D2\"/></right><top style=\"thin\"><color rgb=\"FFB9C6D2\"/></top><bottom style=\"thin\"><color rgb=\"FFB9C6D2\"/></bottom><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"" + xfs.length + "\">" + xfs.join("") + "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";
	}
	function xlsxSheetXml(rows, widths, freezeTop) {
		const COLS = "ABCDEFGHIJ";
		const cols = widths.map((w, i) => "<col min=\"" + (i + 1) + "\" max=\"" + (i + 1) + "\" width=\"" + w + "\" customWidth=\"1\"/>").join("");
		const body = rows.map((cells, ri) => {
			const cs = cells.map((c, ci) => {
				if (c == null || c.v === "" || c.v == null) return "";
				const ref = COLS[ci] + (ri + 1), st = c.s ? " s=\"" + c.s + "\"" : "";
				if (c.t === "n") return "<c r=\"" + ref + "\"" + st + "><v>" + c.v + "</v></c>";
				return "<c r=\"" + ref + "\"" + st + " t=\"inlineStr\"><is><t xml:space=\"preserve\">" + xmlEsc(c.v) + "</t></is></c>";
			}).join("");
			return "<row r=\"" + (ri + 1) + "\">" + cs + "</row>";
		}).join("");
		return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" + (freezeTop ? "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>" : "") + "<cols>" + cols + "</cols><sheetData>" + body + "</sheetData></worksheet>";
	}
	function templateRowModel() {
		const out = [TEMPLATE_HEADERS.map((h) => ({
			v: h,
			t: "s",
			s: 1
		}))];
		leafRows().forEach((l) => {
			out.push([
				{
					v: l.code,
					t: "s",
					s: 2
				},
				{
					v: l.name || "",
					t: "s",
					s: 0
				},
				null,
				null,
				null,
				null,
				null,
				null,
				null
			]);
		});
		return out;
	}
	function templateInstructions() {
		return [
			["Cómo completar esta plantilla", 25],
			["", 0],
			["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “EDT” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan, para no mezclar datos de otro módulo por error.", 4],
			["1. Cada fila es un paquete de trabajo de la EDT. Las columnas “Código EDT” y “Paquete de trabajo” son de referencia — no las edites ni las borres: son la clave con la que este simulador reconoce a qué paquete pertenece cada actividad al importar el archivo de vuelta. La EDT (WBS Builder) es la que manda sobre este módulo: si “Paquete de trabajo” no coincide con el nombre real de ese Código EDT en WBS Builder ahora mismo, esa fila se rechaza al importar (por ejemplo, si el paquete se renombró en WBS Builder después de descargar esta plantilla — vuelve a descargarla).", 4],
			["2. Completa “Nombre de la actividad”, “Unidad”, “Metrado”, “Rendimiento (R)” y “N.º de equipos” para cada actividad del paquete.", 4],
			["3. ¿Más de una actividad por el mismo paquete? Copia la fila completa (Ctrl+D en Excel) y repite el mismo “Código EDT” en la copia, cambiando el nombre de la actividad.", 4],
			["4. Hitos: para marcar una fila como hito (duración cero) en vez de una actividad normal, escribe “Hito” en la columna “Tipo” y asígnale un código propio en “Código de hito” (por ejemplo “H1”, “H2”… la numeración la decides tú) — deja en blanco Unidad/Metrado/Rendimiento/N.º de equipos, no aplican a un hito. Si el hito pertenece a un paquete de trabajo, completa su “Código EDT”; si es un hito del proyecto en general (no depende de un paquete puntual), deja “Código EDT” en blanco.", 4],
			["4b. Un hito NUNCA forma parte de la EDT ni de su numeración: su posición en el listado es dónde insertes su fila en este archivo, respecto de las filas de paquete. Una fila de hito insertada ANTES de la primera fila de paquete aparece al principio de todo (p. ej. un hito de inicio de proyecto); insertada DESPUÉS de la última fila de paquete aparece al final de todo (p. ej. un hito de fin de proyecto); insertada entre dos paquetes cualesquiera, aparece justo ahí — no se agrupan todos juntos en un bloque aparte.", 4],
			["5. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
			["6. Guarda el archivo y vuelve a “Definir las Actividades” > botón “⇧ Importar actividades desde Excel” para subirlo.", 4],
			["", 0],
			["La duración de cada actividad (Metrado ÷ (N.º de equipos × Rendimiento), redondeada al entero superior) se calcula sola al importar — no hace falta traerla en este archivo. Los hitos tienen duración cero por definición.", 4],
			["", 0],
			["Generado por el simulador GPI — módulo Definir las Actividades.", 4]
		].map((row) => [{
			v: row[0],
			t: "s",
			s: row[1] === 25 ? 25 : row[1] === 15 ? 16 : 4
		}]);
	}
	async function buildTemplateXlsxBlob() {
		const zip = new window.JSZip();
		zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
		zip.file("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
		zip.file("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"EDT\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Instrucciones\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
		zip.file("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
		zip.file("xl/styles.xml", xlsxStylesXml());
		zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(templateRowModel(), [
			10,
			30,
			30,
			8,
			12,
			10,
			11,
			14,
			12
		], true));
		zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
		return zip.generateAsync({
			type: "blob",
			mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		});
	}
	function buildTemplateCsv() {
		function cell(v) {
			const s = String(v == null ? "" : v);
			return /[";\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
		}
		const lines = [TEMPLATE_HEADERS.join(";")];
		leafRows().forEach((l) => {
			lines.push([
				cell(l.code),
				cell(l.name || ""),
				"",
				"",
				"",
				"",
				"",
				"",
				""
			].join(";"));
		});
		return lines.join("\r\n");
	}
	function downloadBlob(blob, filename) {
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}
	async function downloadTemplate() {
		if (!leafRows().length) {
			await showAlert("No hay EDT cargada: construye la estructura en WBS Builder (o entra al modo ejemplo) antes de descargar la plantilla.");
			return;
		}
		const safe = (document.getElementById("projectTitle").value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		if (window.JSZip) try {
			downloadBlob(await buildTemplateXlsxBlob(), "plantilla_actividades_" + safe + ".xlsx");
			setStatus("Plantilla descargada. Complétala en Excel o MS Project y vuelve a subirla con «⇧ Importar actividades».");
			return;
		} catch (_) {}
		downloadBlob(new Blob(["﻿" + buildTemplateCsv()], { type: "text/csv;charset=utf-8" }), "plantilla_actividades_" + safe + ".csv");
		setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): descargué un CSV equivalente.");
	}
	function colIndexFromRef(ref) {
		const m = /^([A-Z]+)/.exec(ref);
		if (!m) return 0;
		let n = 0;
		for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
		return n - 1;
	}
	async function resolveDataSheetPath(zip, expectedName) {
		const wbEntry = zip.file("xl/workbook.xml");
		if (!wbEntry) return { kind: "invalid" };
		const doc = new DOMParser().parseFromString(await wbEntry.async("string"), "application/xml");
		const sheets = Array.from(doc.getElementsByTagName("sheet"));
		const wanted = normalizeHeader(expectedName);
		const sheetEl = sheets.find((s) => normalizeHeader(s.getAttribute("name") || "") === wanted);
		if (!sheetEl) return {
			kind: "not-found",
			sheetNames: sheets.map((s) => s.getAttribute("name") || "").filter(Boolean)
		};
		const rId = sheetEl.getAttribute("r:id");
		const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
		if (!rId || !relsEntry) return { kind: "invalid" };
		const relsDoc = new DOMParser().parseFromString(await relsEntry.async("string"), "application/xml");
		const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rId);
		const target = rel ? rel.getAttribute("Target") || "" : "";
		if (!target) return { kind: "invalid" };
		return {
			kind: "found",
			path: target.startsWith("/") ? target.slice(1) : "xl/" + target
		};
	}
	async function loadSharedStrings(zip) {
		const entry = zip.file("xl/sharedStrings.xml");
		if (!entry) return [];
		const doc = new DOMParser().parseFromString(await entry.async("string"), "application/xml");
		return Array.from(doc.getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join(""));
	}
	function parseSheetRows(xmlText, sharedStrings) {
		const doc = new DOMParser().parseFromString(xmlText, "application/xml");
		return Array.from(doc.getElementsByTagName("row")).map((rowEl) => {
			const row = [];
			Array.from(rowEl.getElementsByTagName("c")).forEach((c) => {
				const idx = colIndexFromRef(c.getAttribute("r") || "");
				const t = c.getAttribute("t");
				let val;
				if (t === "inlineStr") {
					const isEl = c.getElementsByTagName("is")[0];
					const tEl = isEl ? isEl.getElementsByTagName("t")[0] : null;
					val = tEl ? tEl.textContent || "" : "";
				} else {
					const vEl = c.getElementsByTagName("v")[0];
					const raw = vEl ? vEl.textContent || "" : "";
					val = t === "s" ? sharedStrings[Number(raw)] || "" : raw;
				}
				row[idx] = val;
			});
			for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = "";
			return row;
		});
	}
	async function parseActivitiesXlsx(file) {
		const buf = await file.arrayBuffer();
		const zip = await window.JSZip.loadAsync(buf);
		const resolution = await resolveDataSheetPath(zip, DATA_SHEET_NAME);
		if (resolution.kind === "invalid") return { kind: "empty" };
		if (resolution.kind === "not-found") return {
			kind: "sheet-not-found",
			sheetNames: resolution.sheetNames
		};
		const sheetEntry = zip.file(resolution.path);
		if (!sheetEntry) return { kind: "empty" };
		const [sheetXml, sharedStrings] = await Promise.all([sheetEntry.async("string"), loadSharedStrings(zip)]);
		const allRows = parseSheetRows(sheetXml, sharedStrings);
		if (!allRows.length) return { kind: "empty" };
		return {
			kind: "ok",
			headers: allRows[0],
			rows: allRows.slice(1)
		};
	}
	var TEMPLATE_HEADER_FIELDS = [
		"code",
		"pkgName",
		"name",
		"type",
		"milestoneCode",
		"unit",
		"qty",
		"perf",
		"teams"
	];
	function normalizeHeader(s) {
		return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	}
	var HEADER_FIELD_BY_TEXT = {};
	TEMPLATE_HEADERS.forEach((h, i) => {
		const field = TEMPLATE_HEADER_FIELDS[i];
		if (field) HEADER_FIELD_BY_TEXT[normalizeHeader(h)] = field;
	});
	function mapHeaderColumns(headerRow) {
		const map = {};
		headerRow.forEach((h, idx) => {
			const field = HEADER_FIELD_BY_TEXT[normalizeHeader(h)];
			if (field) map[field] = idx;
		});
		if (map.code == null || map.name == null) return null;
		return map;
	}
	function reconcileImportRows(rows, colMap) {
		const codeToId = {};
		const codeToName = {};
		leafRows().forEach((l) => {
			codeToId[l.code] = l.id;
			codeToName[l.code] = l.name;
		});
		const byLeaf = {};
		const milestones = [];
		let n = 0, matched = 0, mn = 0, matchedMilestones = 0;
		let lastLeafId = null;
		const unmatched = /* @__PURE__ */ new Set();
		const milestoneIssues = [];
		const packageMismatches = [];
		rows.forEach((row) => {
			const code = String(row[colMap.code] || "").trim();
			const name = String(row[colMap.name] || "").trim();
			const type = colMap.type != null ? normalizeHeader(String(row[colMap.type] || "")) : "";
			const milestoneCode = colMap.milestoneCode != null ? String(row[colMap.milestoneCode] || "").trim() : "";
			if (type.indexOf("hito") !== -1 || !!milestoneCode) {
				if (!name) return;
				if (!milestoneCode) {
					milestoneIssues.push("Hito \"" + name + "\" sin \"Código de hito\": no se importó.");
					return;
				}
				let leafId = null;
				if (code) {
					leafId = codeToId[code] || null;
					if (!leafId) {
						milestoneIssues.push("Hito \"" + milestoneCode + " — " + name + "\": el Código EDT \"" + code + "\" no coincide con ningún paquete de la EDT actual, no se importó.");
						return;
					}
				}
				milestones.push({
					id: "m" + ++mn,
					code: milestoneCode,
					name,
					leafId,
					afterLeafId: leafId ? null : lastLeafId
				});
				matchedMilestones++;
				return;
			}
			if (!code || !name) return;
			const leafId = codeToId[code];
			if (!leafId) {
				unmatched.add(code);
				return;
			}
			if (colMap.pkgName != null) {
				const fileName = String(row[colMap.pkgName] || "").trim();
				const realName = codeToName[code] || "";
				if (fileName && normalizeHeader(fileName) !== normalizeHeader(realName)) {
					packageMismatches.push({
						code,
						fileName,
						realName
					});
					return;
				}
			}
			lastLeafId = leafId;
			const unit = colMap.unit != null ? String(row[colMap.unit] || "").trim() : "";
			const qty = colMap.qty != null ? parseExcelNum(row[colMap.qty]) || "" : "";
			const perf = colMap.perf != null ? parseExcelNum(row[colMap.perf]) || "" : "";
			const teams = colMap.teams != null ? parseExcelNum(row[colMap.teams]) || "" : "";
			if (!byLeaf[leafId]) byLeaf[leafId] = [];
			byLeaf[leafId].push({
				id: "a" + ++n,
				name,
				unit,
				qty,
				perf,
				teams: teams || 1
			});
			matched++;
		});
		return {
			byLeaf,
			idCounter: n + 1,
			matched,
			unmatchedCodes: Array.from(unmatched),
			milestones,
			matchedMilestones,
			milestoneIssues,
			packageMismatches
		};
	}
	async function importActivitiesExcel(file) {
		let parsed;
		try {
			parsed = await parseActivitiesXlsx(file);
		} catch (_) {
			await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
			return;
		}
		if (parsed.kind === "sheet-not-found") {
			const otras = parsed.sheetNames.filter((n) => normalizeHeader(n) !== normalizeHeader(DATA_SHEET_NAME));
			await showAlert("No encontré una hoja llamada «EDT» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con los datos a importar aquí debe llamarse exactamente «EDT» (como la que genera «⇩ Descargar plantilla EDT») para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
			return;
		}
		if (parsed.kind === "empty") {
			await showAlert("El archivo no contiene datos reconocibles.");
			return;
		}
		const colMap = mapHeaderColumns(parsed.headers);
		if (!colMap) {
			await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna columna, p. ej. «EDT» en vez de «Código EDT»?). Se esperan al menos «Código EDT» y «Nombre de la actividad» escritas tal cual.");
			return;
		}
		const result = reconcileImportRows(parsed.rows, colMap);
		if (!result.matched && !result.matchedMilestones) {
			await showAlert("No se encontró ninguna fila válida para importar: revisa que los códigos EDT del archivo coincidan con la EDT actual y que la columna de nombre de actividad esté completa.");
			return;
		}
		const s = stats();
		let msg = "Se reemplazarán las " + (s.total + s.orphans) + " actividades de la lista actual por " + result.matched + " actividad(es)" + (result.matchedMilestones ? " y " + result.matchedMilestones + " hito(s)" : "") + " importado(s) del archivo" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca.";
		if (result.unmatchedCodes.length) msg += " " + result.unmatchedCodes.length + " fila(s) no se importaron por no coincidir con ningún código EDT actual: " + result.unmatchedCodes.slice(0, 8).join(", ") + (result.unmatchedCodes.length > 8 ? "…" : "") + ".";
		if (result.packageMismatches.length) {
			const ex = result.packageMismatches.slice(0, 8).map((u) => u.code + " (\"" + u.fileName + "\" ≠ \"" + u.realName + "\")").join(", ");
			msg += " " + result.packageMismatches.length + " fila(s) no se importaron porque el Paquete de trabajo del archivo no coincide con el nombre real de ese Código EDT en la EDT actual: " + ex + (result.packageMismatches.length > 8 ? "…" : "") + ".";
		}
		if (result.milestoneIssues.length) msg += " " + result.milestoneIssues.length + " hito(s) con problemas: " + result.milestoneIssues.slice(0, 5).join(" ") + (result.milestoneIssues.length > 5 ? "…" : "");
		if (!await showConfirm(msg, "Importar actividades desde Excel")) return;
		if (mode === "sample") stateSample = {
			byLeaf: result.byLeaf,
			idCounter: result.idCounter,
			milestones: result.milestones
		};
		else stateLive = {
			byLeaf: result.byLeaf,
			idCounter: result.idCounter,
			milestones: result.milestones
		};
		onDirty(true);
		const issues = result.unmatchedCodes.length + result.packageMismatches.length + result.milestoneIssues.length;
		setStatus(result.matched + " actividad(es)" + (result.matchedMilestones ? " y " + result.matchedMilestones + " hito(s)" : "") + " importado(s) desde Excel" + (issues ? " · " + issues + " fila(s) no reconciliada(s)" : "") + ".");
	}
	function wireToolbar() {
		document.getElementById("btnReload").addEventListener("click", () => {
			gpiPullWbs();
			render();
			setStatus("EDT recargada desde el proyecto activo.");
		});
		document.getElementById("btnCopyTable").addEventListener("click", copyWholeTable);
		document.getElementById("btnDownloadTemplate").addEventListener("click", downloadTemplate);
		document.getElementById("btnImportExcel").addEventListener("click", () => {
			document.getElementById("xlsxFileInput").click();
		});
		document.getElementById("xlsxFileInput").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) importActivitiesExcel(files[0]);
			e.target.value = "";
		});
		document.getElementById("btnReport").addEventListener("click", buildReport);
		document.getElementById("btnPrint").addEventListener("click", () => {
			window.print();
		});
		document.getElementById("btnSample").addEventListener("click", enterSample);
		document.getElementById("btnLive").addEventListener("click", enterLive);
		document.getElementById("btnLoadSampleLive").addEventListener("click", loadSampleIntoProject);
		document.getElementById("btnClear").addEventListener("click", async () => {
			const s = stats();
			if (!await showConfirm("Se eliminarán las " + (s.total + s.orphans) + " actividades de la lista actual" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca. ¿Continuar?", "Limpiar actividades")) return;
			if (mode === "sample") stateSample = {
				byLeaf: {},
				idCounter: 1,
				milestones: []
			};
			else stateLive = {
				byLeaf: {},
				idCounter: 1,
				milestones: []
			};
			onDirty(true);
			setStatus("Lista de actividades vacía.");
		});
	}
	function gpiPullWbs() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		wbsLive = window.GPI.getModule("wbs") ?? null;
	}
	function gpiPush() {
		if (mode === "sample") return;
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		window.GPI.setModule("activities", stateLive);
		window.GPI.patchMeta({
			name: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value
		});
	}
	var initialized = false;
	function init() {
		if (initialized) return;
		initialized = true;
		wireToolbar();
		if (typeof window.GPI !== "undefined" && window.GPI.available()) {
			const proj = window.GPI.active();
			if (proj) {
				if (proj.meta) {
					if (proj.meta.name) document.getElementById("projectTitle").value = proj.meta.name;
					if (proj.meta.course) document.getElementById("courseTitle").value = proj.meta.course;
				}
				gpiPullWbs();
				const mod = window.GPI.getModule("activities");
				if (mod) stateLive = normalizeState(mod);
				setStatus("Proyecto cargado desde el Panel de Control.");
			}
			window.addEventListener("beforeunload", gpiPush);
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) gpiPush();
			});
			window.GPI.onChange(() => {
				if (mode === "live") {
					gpiPullWbs();
					render();
				}
			});
			gpiBadge(proj ? proj.meta && proj.meta.name : "", gpiPush);
		} else {
			const bn = document.getElementById("banner");
			bn.classList.add("show");
			bn.innerHTML = "<b>Vista previa sin almacenamiento persistente.</b> Abre este archivo junto a <code>gpi-core.js</code> y los demás módulos desde un servidor local o GitHub Pages para leer la EDT real del proyecto. Mientras tanto trabajas con el modo ejemplo.";
			enterSample();
			return;
		}
		render();
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
			pushFn();
			const t = sb.textContent;
			sb.textContent = "✓ Sincronizado";
			setTimeout(() => {
				sb.textContent = t;
			}, 1400);
		});
	}
	document.addEventListener("DOMContentLoaded", init);
	//#endregion
})();
