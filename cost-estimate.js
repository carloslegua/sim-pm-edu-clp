(function() {
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
		const rMod = G.saveModule(name, data, session);
		const next = !session && rMod.status === "saved" ? G.openSession(name) : session;
		const rMeta = patch ? G.saveMeta(patch, session) : null;
		const problems = [[rMod, label]];
		if (rMeta) problems.push([rMeta, "Los datos del proyecto"]);
		for (const [r, lab] of problems) {
			if (writeOk(r)) continue;
			if (r.status === "rejected" && r.reason === "project-changed") hooks.onStale();
			else showWriteProblem(G.describeWrite(r, lab), hooks.setStatus);
			return {
				ok: false,
				session: next
			};
		}
		return {
			ok: true,
			session: next
		};
	}
	//#endregion
	//#region src/modules/cost-estimate/main.ts
	var mode = "live";
	var stateLive = { byActivity: {} };
	var loadedProjectId = null;
	var session = null;
	var projectStale = false;
	var stateSample = null;
	var wbsLive = null;
	var activitiesLive = null;
	function state() {
		return mode === "sample" ? stateSample : stateLive;
	}
	function wbsData() {
		return mode === "sample" ? SAMPLE_WBS : wbsLive;
	}
	function activitiesData() {
		return mode === "sample" ? SAMPLE_ACTIVITIES : activitiesLive;
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
		const by = {}, src = obj.byActivity || {};
		Object.keys(src).forEach((k) => {
			if (src[k] != null && src[k] !== "") by[k] = src[k];
		});
		return { byActivity: by };
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
	function activitiesOf(leafId) {
		const acts = activitiesData();
		return acts && acts.byLeaf && acts.byLeaf[leafId] || [];
	}
	function milestonesOf(leafId) {
		const acts = activitiesData();
		return (acts && acts.milestones || []).filter((m) => m.leafId === leafId);
	}
	function allMilestones() {
		const acts = activitiesData();
		return acts && acts.milestones || [];
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
	function numOrNull(v) {
		if (v === "" || v == null) return null;
		const p = parseExcelNum(v);
		return p === null || p === "" ? null : Number(p);
	}
	function subtotalOf(a) {
		const qty = numOrNull(a.qty), price = numOrNull(state().byActivity[a.id]);
		return qty != null && price != null ? qty * price : null;
	}
	function fmtMoney(v) {
		if (v == null || !isFinite(v)) return "—";
		return v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
	}
	function fmtQty(v) {
		const n = numOrNull(v);
		return n == null ? "—" : n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
	}
	function stats() {
		const leaves = leafRows();
		let totalCost = 0, totalActivities = 0, pricedActivities = 0, completeLeaves = 0, leavesWithActivities = 0;
		const leavesWithoutActivities = [];
		leaves.forEach((l) => {
			const list = activitiesOf(l.id);
			if (!list.length) {
				leavesWithoutActivities.push(l);
				return;
			}
			leavesWithActivities++;
			let allPriced = true;
			list.forEach((a) => {
				totalActivities++;
				const sub = subtotalOf(a);
				if (sub != null) {
					pricedActivities++;
					totalCost += sub;
				} else allPriced = false;
			});
			if (allPriced) completeLeaves++;
		});
		return {
			totalCost,
			totalActivities,
			pricedActivities,
			pct: totalActivities ? Math.round(pricedActivities / totalActivities * 100) : 0,
			leavesWithActivities,
			completeLeaves,
			leavesWithoutActivities
		};
	}
	function fullRows() {
		const w = wbsData(), out = [];
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
		const tree = treeRows();
		const knownLeafIds = {};
		tree.forEach((r) => {
			if (r.kind === "package") knownLeafIds[r.id] = true;
		});
		const loose = placeLooseMilestones(allMilestones(), knownLeafIds);
		loose.start.forEach((m) => {
			out.push({
				kind: "milestone",
				n: n++,
				code: m.code,
				level: 2,
				name: m.name
			});
		});
		tree.forEach((r) => {
			if (r.kind === "phase") {
				out.push({
					kind: "phase",
					n: n++,
					code: r.code,
					level: r.depth + 1,
					name: r.name,
					id: r.id
				});
				return;
			}
			const list = activitiesOf(r.id);
			let pkgSubtotal = 0, pkgComplete = list.length > 0;
			list.forEach((a) => {
				const sub = subtotalOf(a);
				if (sub != null) pkgSubtotal += sub;
				else pkgComplete = false;
			});
			out.push({
				kind: "package",
				n: n++,
				code: r.code,
				level: r.depth + 1,
				name: r.name,
				id: r.id,
				activityCount: list.length,
				pkgSubtotal: list.length ? pkgSubtotal : null,
				pkgComplete
			});
			list.forEach((a, i) => {
				out.push({
					kind: "activity",
					n: n++,
					code: r.code + "." + (i + 1),
					level: r.depth + 2,
					name: a.name || "",
					activityId: a.id,
					unit: a.unit || "",
					qty: a.qty,
					unitPrice: state().byActivity[a.id],
					subtotal: subtotalOf(a)
				});
			});
			milestonesOf(r.id).forEach((m) => {
				out.push({
					kind: "milestone",
					n: n++,
					code: m.code,
					level: r.depth + 2,
					name: m.name,
					leafId: r.id
				});
			});
			(loose.afterLeaf[r.id] || []).forEach((m) => {
				out.push({
					kind: "milestone",
					n: n++,
					code: m.code,
					level: r.depth + 1,
					name: m.name
				});
			});
		});
		loose.orphan.forEach((m) => {
			out.push({
				kind: "milestone",
				n: n++,
				code: m.code,
				level: 2,
				name: m.name
			});
		});
		return out;
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
	function renderTable() {
		const tbody = document.getElementById("estBody");
		const empty = document.getElementById("emptyState");
		const rows = fullRows();
		if (!rows.length) {
			tbody.innerHTML = "";
			empty.style.display = "";
			empty.innerHTML = mode === "live" ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo estima el costo de las actividades de cada paquete.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>" : "<b>Sin EDT de ejemplo.</b>";
			const bi = document.getElementById("btnSampleInner");
			if (bi) bi.addEventListener("click", enterSample);
			return;
		}
		empty.style.display = "none";
		let html = "", total = 0;
		rows.forEach((r) => {
			if (r.kind === "project") html += "<tr class=\"proj-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\" style=\"color:var(--ink-1)\">0</td><td colspan=\"5\">" + esc(r.name) + " <span class=\"proj-hint\">Fila 0</span></td></tr>";
			else if (r.kind === "phase") html += "<tr class=\"phase-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\">" + esc(r.code) + "</td><td colspan=\"5\" style=\"padding-left:" + (10 + Math.max(0, r.level - 2) * 16) + "px\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") {
				if (r.pkgSubtotal != null) total += r.pkgSubtotal;
				const sub = !r.activityCount ? "<td class=\"sub-cell empty\" title=\"Este paquete todavía no tiene actividades definidas en Definir las Actividades\">sin actividades</td>" : r.pkgComplete ? "<td class=\"sub-cell\" title=\"Suma del Subtotal de sus actividades\">" + fmtMoney(r.pkgSubtotal) + "</td>" : "<td class=\"sub-cell partial\" title=\"Suma parcial: todavía faltan precios en alguna actividad de este paquete\">" + fmtMoney(r.pkgSubtotal) + " ⚠</td>";
				html += "<tr class=\"pkg-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"pk-code\">" + esc(r.code) + "</td><td colspan=\"4\" style=\"padding-left:" + (8 + Math.max(0, r.level - 2) * 16) + "px\"><span class=\"pk-name\">" + esc(r.name) + "</span><span class=\"pk-count" + (r.activityCount ? "" : " zero") + "\">" + (r.activityCount || 0) + " act.</span></td>" + sub + "</tr>";
			} else if (r.kind === "milestone") html += "<tr class=\"act-row milestone-row\"><td class=\"n-cell act-item\">" + r.n + "</td><td class=\"act-code milestone-code\">◆ " + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "<span class=\"milestone-tag\">Hito</span></td><td>—</td><td class=\"num\">—</td><td class=\"num\">—</td><td class=\"sub-cell empty\" title=\"Los hitos no tienen costo\">—</td></tr>";
			else html += "<tr class=\"act-row\"><td class=\"n-cell act-item\">" + r.n + "</td><td class=\"act-code\">" + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "</td><td>" + esc(r.unit || "—") + "</td><td class=\"num\">" + fmtQty(r.qty) + "</td><td class=\"num\">" + fmtQty(r.unitPrice) + "</td>" + (r.subtotal == null ? "<td class=\"sub-cell empty\" title=\"Falta el Precio unitario\">—</td>" : "<td class=\"sub-cell\" title=\"Subtotal = Cantidad × Precio unitario\">" + fmtMoney(r.subtotal) + "</td>") + "</tr>";
		});
		html += "<tr class=\"total-row\"><td colspan=\"6\" style=\"text-align:right\">Total estimado</td><td class=\"sub-cell\">" + fmtMoney(total) + "</td></tr>";
		tbody.innerHTML = html;
	}
	function copyWholeTable() {
		const rows = fullRows();
		if (!rows.length) {
			setStatus("No hay tabla que copiar.");
			return;
		}
		const lines = ["Id.	Código EDT	Paquete de trabajo / Actividad	Unidad	Cantidad	Precio unitario	Subtotal"];
		rows.forEach((r) => {
			const isAct = r.kind === "activity", isMs = r.kind === "milestone";
			lines.push([
				r.n,
				r.code,
				(r.name || "") + (isMs ? " (hito)" : ""),
				isAct ? r.unit || "" : "",
				isAct ? r.qty == null ? "" : r.qty : "",
				isAct ? r.unitPrice == null ? "" : r.unitPrice : "",
				isAct && r.subtotal != null ? r.subtotal : r.kind === "package" && r.pkgSubtotal != null ? r.pkgSubtotal : ""
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
		document.getElementById("sbTotal").textContent = fmtMoney(s.totalCost);
		document.getElementById("sbCov").textContent = s.pricedActivities + "/" + s.totalActivities + " actividades con precio";
		document.getElementById("sbPct").textContent = s.pct + "%";
		const bar = document.getElementById("sbBar");
		bar.style.width = s.pct + "%";
		bar.style.background = s.pct >= 100 ? "var(--good)" : s.pct >= 50 ? "var(--warn)" : "var(--act-a)";
		document.getElementById("sbPkg").textContent = s.completeLeaves + "/" + s.leavesWithActivities + " paquetes con estimado completo";
		const host = document.getElementById("missList");
		if (!s.leavesWithActivities && !s.leavesWithoutActivities.length) host.innerHTML = "<div style=\"font-size:11.5px;color:var(--ink-2)\">Sin EDT cargada.</div>";
		else if (!s.leavesWithoutActivities.length) host.innerHTML = "<div class=\"miss-ok\">✓ Todos los paquetes de trabajo tienen actividades definidas.</div>";
		else host.innerHTML = s.leavesWithoutActivities.map((l) => "<div class=\"miss-item\"><span class=\"mc\">" + esc(l.code) + "</span><span>" + esc(l.name) + "</span></div>").join("");
	}
	function renderOrphans() {
		const st = state();
		const activityIds = {};
		leafRows().forEach((l) => {
			activitiesOf(l.id).forEach((a) => {
				activityIds[a.id] = true;
			});
		});
		const orphanKeys = Object.keys(st.byActivity).filter((k) => !activityIds[k]);
		const bn = document.getElementById("orphanBanner");
		if (!orphanKeys.length) {
			bn.classList.remove("show");
			bn.innerHTML = "";
			return;
		}
		bn.classList.add("show");
		bn.innerHTML = "<b>⚠ " + orphanKeys.length + " precio(s) huérfano(s):</b> tienen un Precio Unitario guardado, pero esa actividad ya no existe en Definir las Actividades (se eliminó o cambió de paquete). No aparecen en la tabla ni en los conteos. <button class=\"btn sm danger\" id=\"btnOrphans\">Eliminar huérfanos</button>";
		document.getElementById("btnOrphans").addEventListener("click", async () => {
			if (!await showConfirm("Se eliminarán definitivamente los " + orphanKeys.length + " precios huérfanos. Si en realidad las actividades cambiaron por error, corrígelas primero en Definir las Actividades y vuelve a recargar.", "Eliminar precios huérfanos")) return;
			orphanKeys.forEach((k) => {
				delete st.byActivity[k];
			});
			onDirty(true);
			setStatus("Precios huérfanos eliminados.");
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
	var SAMPLE_ACTIVITIES = (function() {
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
	})();
	function sampleEstimate() {
		return { byActivity: {
			a1: 12e3,
			a2: 2e4,
			a3: 3e3,
			a4: 4e3,
			a5: 800,
			a6: 800,
			a7: 15e3,
			a8: 6600,
			a9: 45e3,
			a10: 5e3,
			a11: 35e3,
			a12: 4e3,
			a13: 25e3,
			a14: 15e3,
			a15: 6500,
			a16: 1e4,
			a17: 850,
			a18: 35e3,
			a19: 12e3,
			a20: 23500,
			a21: 40,
			a22: 35,
			a23: 25,
			a24: 7,
			a25: 45,
			a26: 60,
			a27: 4.5,
			a28: 550,
			a29: 85,
			a30: 3500,
			a31: 6500,
			a33: 45,
			a34: 25,
			a35: 800,
			a36: 350,
			a37: 320,
			a38: 350,
			a39: 18e3,
			a40: 300,
			a41: 8e3,
			a42: 25e3,
			a43: 15e3
		} };
	}
	function enterSample() {
		mode = "sample";
		if (!stateSample) stateSample = sampleEstimate();
		render();
		setStatus("Modo ejemplo: EDT y actividades didácticas de DISTRIB+ (no toca los datos del proyecto).");
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
	function samplePriceByName() {
		const est = sampleEstimate();
		const out = {};
		Object.keys(SAMPLE_ACTIVITIES.byLeaf).forEach((leafId) => {
			SAMPLE_ACTIVITIES.byLeaf[leafId].forEach((a) => {
				const p = est.byActivity[a.id];
				if (p != null && a.name) out[a.name] = Number(p);
			});
		});
		return out;
	}
	function sampleVirtualRows() {
		const codes = wbsCodesOf(SAMPLE_WBS);
		const priceByName = samplePriceByName();
		const rows = [];
		Object.keys(SAMPLE_ACTIVITIES.byLeaf).forEach((leafId) => {
			const code = codes[leafId];
			if (!code) return;
			SAMPLE_ACTIVITIES.byLeaf[leafId].forEach((a) => {
				const price = priceByName[a.name || ""];
				rows.push([
					code,
					"",
					a.name || "",
					a.unit || "",
					String(a.qty ?? ""),
					price != null ? String(price) : ""
				]);
			});
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
		const liveLeaves = leafRows();
		if (!liveLeaves.length) {
			mode = prevMode;
			await showAlert("La EDT del proyecto activo está vacía. Carga primero el ejemplo en WBS Builder (\"Cargar ejemplo\") y vuelve aquí.");
			return;
		}
		if (!liveLeaves.some((l) => activitiesOf(l.id).length > 0)) {
			mode = prevMode;
			await showAlert("El proyecto activo todavía no tiene actividades. Carga primero el ejemplo en Definir las Actividades (\"⇩ Cargar ejemplo en el proyecto\") y vuelve aquí.");
			return;
		}
		const result = reconcileImportRows(sampleVirtualRows(), {
			code: 0,
			activityName: 2,
			unit: 3,
			qty: 4,
			unitPrice: 5
		});
		if (!result.matched) {
			mode = prevMode;
			await showAlert("Ninguna actividad de ejemplo coincide con las actividades reales del proyecto (Código EDT + nombre). Revisa que hayas cargado el mismo ejemplo en Definir las Actividades.");
			return;
		}
		let msg = "Se reemplazará el estimado del PROYECTO ACTIVO (no el modo ejemplo) con precios para " + result.matched + " actividad(es) que coinciden con sus actividades reales.";
		if (result.orphanCodes.length) msg += " " + result.orphanCodes.length + " código(s) del ejemplo no se encontraron en la EDT actual: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
		if (result.unmatchedActivities.length) {
			const ex = result.unmatchedActivities.slice(0, 8).map((u) => u.code + " \"" + u.name + "\"").join(", ");
			msg += " " + result.unmatchedActivities.length + " actividad(es) de ejemplo no se encontraron bajo su paquete real: " + ex + (result.unmatchedActivities.length > 8 ? "…" : "") + ".";
		}
		if (result.missingActivities.length) {
			const ex = result.missingActivities.slice(0, 8).map((u) => u.code).join(", ");
			msg += " ⚠ " + result.missingActivities.length + " actividad(es) reales quedan sin precio: " + ex + (result.missingActivities.length > 8 ? "…" : "") + ".";
		}
		if (!await showConfirm(msg, "Cargar ejemplo en el proyecto")) {
			mode = prevMode;
			render();
			return;
		}
		stateLive = { byActivity: result.byActivity };
		render();
		gpiPush();
		setStatus("Ejemplo DISTRIB+ cargado en el proyecto activo (" + result.matched + " actividad(es) con precio).");
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
	function buildReport() {
		const s = stats();
		let body = (mode === "sample" ? "<p class=\"rep-note\"><b>Modo ejemplo:</b> este listado usa la EDT y las actividades didácticas, no los datos del proyecto activo.</p>" : "") + "<h2>1. Resumen</h2><table class=\"rep-kv\"><tr><td>Costo total estimado</td><td><b>" + fmtMoney(s.totalCost) + "</b></td></tr><tr><td>Actividades con precio</td><td>" + s.pricedActivities + " de " + s.totalActivities + " (<b>" + s.pct + "%</b>)</td></tr><tr><td>Paquetes con estimado completo</td><td>" + s.completeLeaves + " de " + s.leavesWithActivities + " paquetes con actividades definidas</td></tr>" + (s.leavesWithoutActivities.length ? "<tr><td>Paquetes sin actividades definidas</td><td>⚠ " + s.leavesWithoutActivities.length + " (no se pueden costear hasta definirlas en Definir las Actividades)</td></tr>" : "") + "</table><h2>2. Estimación de costos por actividad</h2><p class=\"rep-note\">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el Id corre consecutivo, sin saltos, por todas las filas (incluidos los hitos) — igual que el Task ID de MS Project, para que esta tabla se pueda cotejar fila por fila contra un cronograma pegado o exportado ahí. Unidad y Cantidad vienen de Definir las Actividades; Subtotal = Cantidad × Precio unitario, valor calculado (nunca se ingresa directamente). El costo de un paquete es la suma del Subtotal de sus actividades.</p><table><tr><th style=\"width:6%\">Id.</th><th style=\"width:9%\">Código EDT</th><th>Paquete de trabajo / Actividad</th><th style=\"width:8%\">Unidad</th><th style=\"width:10%\">Cantidad</th><th style=\"width:11%\">Precio unitario</th><th style=\"width:11%\">Subtotal</th></tr>";
		const repRows = fullRows();
		let total = 0;
		if (!repRows.length) body += "<tr><td colspan=\"7\" class=\"rep-note\">— Sin EDT cargada —</td></tr>";
		repRows.forEach((r) => {
			if (r.kind === "project") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">0</td><td class=\"num rep-phase\">0</td><td class=\"rep-phase\" colspan=\"5\">" + esc(r.name) + " <span class=\"rep-note\">(tarea resumen del proyecto)</span></td></tr>";
			else if (r.kind === "phase") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-phase\">" + esc(r.code) + "</td><td class=\"rep-phase\" colspan=\"5\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") {
				const pkgTxt = !r.activityCount ? "<span class=\"rep-note\">sin actividades definidas</span>" : "<b>" + fmtMoney(r.pkgSubtotal) + "</b>" + (r.pkgComplete ? "" : " (parcial)");
				body += "<tr><td class=\"num rep-pkg\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-pkg\">" + esc(r.code) + "</td><td class=\"rep-pkg\">" + esc(r.name) + "</td><td class=\"rep-pkg\" colspan=\"3\">" + (r.activityCount || 0) + " actividad(es)</td><td class=\"num rep-pkg\" style=\"text-align:right\">" + pkgTxt + "</td></tr>";
			} else if (r.kind === "milestone") body += "<tr><td class=\"num\" style=\"text-align:center\">" + r.n + "</td><td class=\"num\">◆ " + esc(r.code) + "</td><td>" + esc(r.name) + " <span class=\"rep-note\">(hito)</span></td><td>—</td><td class=\"num\" style=\"text-align:right\">—</td><td class=\"num\" style=\"text-align:right\">—</td><td class=\"num\" style=\"text-align:right\">—</td></tr>";
			else {
				if (r.subtotal != null) total += r.subtotal;
				body += "<tr><td class=\"num\" style=\"text-align:center\">" + r.n + "</td><td class=\"num\">" + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "</td><td>" + esc(r.unit || "—") + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.qty) + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.unitPrice) + "</td><td class=\"num\" style=\"text-align:right\">" + fmtMoney(r.subtotal) + "</td></tr>";
			}
		});
		if (repRows.length) body += "<tr><td colspan=\"6\" style=\"text-align:right\"><b>Total estimado</b></td><td class=\"num\" style=\"text-align:right\"><b>" + fmtMoney(total) + "</b></td></tr>";
		body += "</table>";
		reportShell("Estimación de Costos por Actividad", "Estimar los Costos · Gestión de Costos", body);
	}
	function xmlEsc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	var TEMPLATE_HEADERS = [
		"Id.",
		"Código EDT",
		"Paquete de trabajo",
		"Nombre de la actividad",
		"Tipo",
		"Unidad",
		"Cantidad",
		"Precio unitario",
		"Subtotal"
	];
	var DATA_SHEET_NAME = "Estimado";
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
	function exportRowModel() {
		const out = [TEMPLATE_HEADERS.map((h) => ({
			v: h,
			t: "s",
			s: 1
		}))];
		let pkgCode = "", pkgName = "";
		fullRows().forEach((r) => {
			if (r.kind === "project") {
				out.push([
					{
						v: r.n,
						t: "n"
					},
					{
						v: r.code,
						t: "s",
						s: 2
					},
					{
						v: r.name || "",
						t: "s",
						s: 0
					},
					{
						v: r.name || "",
						t: "s",
						s: 0
					},
					{
						v: "Proyecto",
						t: "s",
						s: 0
					},
					null,
					null,
					null,
					null
				]);
				return;
			}
			if (r.kind === "phase") {
				out.push([
					{
						v: r.n,
						t: "n"
					},
					{
						v: r.code,
						t: "s",
						s: 2
					},
					{
						v: r.name || "",
						t: "s",
						s: 0
					},
					{
						v: r.name || "",
						t: "s",
						s: 0
					},
					{
						v: "Fase",
						t: "s",
						s: 0
					},
					null,
					null,
					null,
					null
				]);
				return;
			}
			if (r.kind === "package") {
				pkgCode = r.code;
				pkgName = r.name;
				out.push([
					{
						v: r.n,
						t: "n"
					},
					{
						v: r.code,
						t: "s",
						s: 2
					},
					{
						v: r.name || "",
						t: "s",
						s: 0
					},
					{
						v: r.name || "",
						t: "s",
						s: 0
					},
					{
						v: "Paquete",
						t: "s",
						s: 0
					},
					null,
					null,
					null,
					r.pkgSubtotal != null ? {
						v: r.pkgSubtotal,
						t: "n",
						s: 3
					} : null
				]);
				return;
			}
			if (r.kind === "milestone") {
				const tied = r.leafId != null;
				out.push([
					{
						v: r.n,
						t: "n"
					},
					tied ? {
						v: pkgCode,
						t: "s",
						s: 2
					} : null,
					tied ? {
						v: pkgName,
						t: "s",
						s: 0
					} : null,
					{
						v: r.code + " — " + r.name,
						t: "s",
						s: 0
					},
					{
						v: "Hito",
						t: "s",
						s: 0
					},
					null,
					null,
					null,
					null
				]);
				return;
			}
			const qty = numOrNull(r.qty), price = numOrNull(r.unitPrice), subtotal = r.subtotal ?? null;
			out.push([
				{
					v: r.n,
					t: "n"
				},
				{
					v: r.code,
					t: "s",
					s: 2
				},
				{
					v: pkgName,
					t: "s",
					s: 0
				},
				{
					v: r.name || "",
					t: "s",
					s: 0
				},
				null,
				r.unit ? {
					v: r.unit,
					t: "s",
					s: 0
				} : null,
				qty != null ? {
					v: qty,
					t: "n"
				} : null,
				price != null ? {
					v: price,
					t: "n",
					s: 3
				} : null,
				subtotal != null ? {
					v: subtotal,
					t: "n",
					s: 3
				} : null
			]);
		});
		return out;
	}
	function templateInstructions() {
		return [
			["Cómo completar este archivo", 25],
			["", 0],
			["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “Estimado” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan, para no mezclar datos de otro módulo por error.", 4],
			["1. Este archivo es un reflejo COMPLETO de la tabla: trae una fila por cada fila que ves en pantalla -- el proyecto (Tipo=“Proyecto”), cada fase (Tipo=“Fase”), cada paquete de trabajo (Tipo=“Paquete”, con su Subtotal acumulado si ya tiene precios) y, debajo de cada paquete, sus actividades. Solo las filas de ACTIVIDAD llevan precio: para completar el precio de una, ubícala por su “Código EDT” y “Nombre de la actividad” (ya vienen de “Definir las Actividades”, no las edites) -- si además cambias “Paquete de trabajo”, debe seguir siendo el nombre real de ese paquete: si no coincide, la fila se rechaza al importar (protección contra mezclar filas de otro proyecto).", 4],
			["1b. Las filas de Proyecto/Fase/Paquete son de referencia -- repiten su propio nombre también en “Nombre de la actividad” (para que esa columna nunca quede vacía, útil si armas una tabla dinámica en Excel), pero se identifican y se ignoran solas al reimportar por su columna “Tipo”, no hace falta tocarlas ni borrarlas.", 4],
			["1c. La columna “Id.” es el mismo correlativo consecutivo (sin saltos, como el Task ID de MS Project) que ves en pantalla y en Definir las Actividades -- Código EDT y Nombre de la actividad siguen siendo la clave para reconciliar el precio, pero si el Id. de una fila ya no corresponde, en el proyecto actual, al mismo Código EDT/Nombre que trae el archivo (por ejemplo, porque editaste la EDT o las actividades después de exportarlo), se avisa igual: revisa esas filas antes de confiar en el resultado.", 4],
			["2. Completa “Precio unitario” para cada actividad.", 4],
			["3. La columna “Subtotal” es de referencia (Cantidad × Precio unitario, o la suma de sus actividades en la fila de un paquete): se recalcula sola al importar, no hace falta completarla ni editarla a mano.", 4],
			["4. Un paquete sin ninguna actividad debajo (fila “Paquete” seguida directo de la del siguiente paquete o fase) todavía no tiene actividades definidas -- complétalas primero en “Definir las Actividades”, no aquí.", 4],
			["4b. Hitos: las filas con “Tipo”=“Hito” son las definidas en “Definir las Actividades” -- aparecen aquí solo como referencia (nunca tienen costo) y se ignoran por completo al reimportar el archivo, no hace falta tocarlas.", 4],
			["5. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
			["6. Guarda el archivo y vuelve a “Estimar los Costos” > botón “⇧ Importar desde Excel” para subirlo.", 4],
			["", 0],
			["7. Este mismo archivo se puede volver a generar en cualquier momento con “⇩ Exportar a Excel”: si el proyecto ya tiene precios cargados, el archivo sale completo (no en blanco) y, si se reimporta sin tocarlo, reproduce exactamente los mismos datos.", 4],
			["", 0],
			["Generado por el simulador GPI — módulo Estimar los Costos.", 4]
		].map((row) => [{
			v: row[0],
			t: "s",
			s: row[1] === 25 ? 25 : 4
		}]);
	}
	async function buildEstimateXlsxBlob() {
		const zip = new window.JSZip();
		zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
		zip.file("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
		zip.file("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Estimado\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Instrucciones\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
		zip.file("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
		zip.file("xl/styles.xml", xlsxStylesXml());
		zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(exportRowModel(), [
			6,
			10,
			26,
			34,
			8,
			10,
			11,
			14,
			14
		], true));
		zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(templateInstructions(), [115], false));
		return zip.generateAsync({
			type: "blob",
			mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		});
	}
	function buildEstimateCsv() {
		function cell(v) {
			const s = String(v == null ? "" : v);
			return /[";\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
		}
		const lines = [TEMPLATE_HEADERS.join(";")];
		let pkgCode = "", pkgName = "";
		fullRows().forEach((r) => {
			if (r.kind === "project") {
				lines.push([
					cell(r.n),
					cell(r.code),
					cell(r.name || ""),
					cell(r.name || ""),
					"Proyecto",
					"",
					"",
					"",
					""
				].join(";"));
				return;
			}
			if (r.kind === "phase") {
				lines.push([
					cell(r.n),
					cell(r.code),
					cell(r.name || ""),
					cell(r.name || ""),
					"Fase",
					"",
					"",
					"",
					""
				].join(";"));
				return;
			}
			if (r.kind === "package") {
				pkgCode = r.code;
				pkgName = r.name;
				lines.push([
					cell(r.n),
					cell(r.code),
					cell(r.name || ""),
					cell(r.name || ""),
					"Paquete",
					"",
					"",
					"",
					cell(r.pkgSubtotal ?? "")
				].join(";"));
				return;
			}
			if (r.kind === "milestone") {
				const tied = r.leafId != null;
				lines.push([
					cell(r.n),
					tied ? cell(pkgCode) : "",
					tied ? cell(pkgName) : "",
					cell(r.code + " — " + r.name),
					"Hito",
					"",
					"",
					"",
					""
				].join(";"));
				return;
			}
			lines.push([
				cell(r.n),
				cell(r.code),
				cell(pkgName),
				cell(r.name || ""),
				"",
				cell(r.unit || ""),
				cell(numOrNull(r.qty) ?? ""),
				cell(numOrNull(r.unitPrice) ?? ""),
				cell(r.subtotal ?? "")
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
	async function downloadEstimate() {
		if (!leafRows().length) {
			await showAlert("No hay EDT cargada: construye la estructura en WBS Builder (o entra al modo ejemplo) antes de exportar.");
			return;
		}
		const safe = (document.getElementById("projectTitle").value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		if (window.JSZip) try {
			downloadBlob(await buildEstimateXlsxBlob(), "estimacion_costos_" + safe + ".xlsx");
			setStatus("Archivo exportado. Complétalo o revísalo en Excel/MS Project y vuelve a subirlo con «⇧ Importar desde Excel».");
			return;
		} catch (_) {}
		downloadBlob(new Blob(["﻿" + buildEstimateCsv()], { type: "text/csv;charset=utf-8" }), "estimacion_costos_" + safe + ".csv");
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
	async function parseEstimateXlsx(file) {
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
	var NON_ACTIVITY_TYPES = [
		"hito",
		"proyecto",
		"fase",
		"paquete"
	];
	var TEMPLATE_HEADER_FIELDS = [
		"id",
		"code",
		"pkgName",
		"activityName",
		"type",
		"unit",
		"qty",
		"unitPrice",
		null
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
		if (map.code == null || map.activityName == null) return null;
		return map;
	}
	function exportNameOf(r) {
		return r.kind === "milestone" ? r.code + " — " + r.name : r.name || "";
	}
	function reconcileImportRows(rows, colMap) {
		const leaves = leafRows();
		const byCode = {};
		leaves.forEach((l) => {
			byCode[l.code] = l;
		});
		function resolveLeaf(code) {
			if (byCode[code]) return byCode[code];
			const idx = code.lastIndexOf(".");
			return idx > 0 ? byCode[code.slice(0, idx)] : void 0;
		}
		const currentById = /* @__PURE__ */ new Map();
		if (colMap.id != null) fullRows().forEach((r) => {
			currentById.set(r.n, {
				code: r.code,
				name: exportNameOf(r)
			});
		});
		const byActivity = {};
		const orphanCodes = [];
		const unmatchedActivities = [];
		const packageMismatches = [];
		const idMismatches = [];
		const pricedIds = /* @__PURE__ */ new Set();
		let matched = 0;
		rows.forEach((row) => {
			const type = colMap.type != null ? normalizeHeader(String(row[colMap.type] || "")) : "";
			const code = String(row[colMap.code] || "").trim();
			const activityName = String(row[colMap.activityName] || "").trim();
			if (colMap.id != null) {
				const idStr = String(row[colMap.id] || "").trim();
				const idNum = idStr === "" ? NaN : Number(idStr);
				if (!Number.isNaN(idNum)) {
					const current = currentById.get(idNum);
					if (current) {
						const codeMismatch = current.code !== code;
						const nameMismatch = normalizeHeader(current.name) !== normalizeHeader(activityName);
						if (codeMismatch || nameMismatch) idMismatches.push({
							id: idNum,
							codeMismatch,
							nameMismatch
						});
					}
				}
			}
			if (NON_ACTIVITY_TYPES.some((t) => type.indexOf(t) !== -1)) return;
			if (!code) return;
			if (!activityName) return;
			const leaf = resolveLeaf(code);
			if (!leaf) {
				orphanCodes.push(code);
				return;
			}
			if (colMap.pkgName != null) {
				const fileName = String(row[colMap.pkgName] || "").trim();
				if (fileName && normalizeHeader(fileName) !== normalizeHeader(leaf.name)) {
					packageMismatches.push({
						code,
						fileName,
						realName: leaf.name
					});
					return;
				}
			}
			const candidates = activitiesOf(leaf.id).filter((a) => normalizeHeader(a.name || "") === normalizeHeader(activityName));
			if (!candidates.length) {
				unmatchedActivities.push({
					code,
					name: activityName
				});
				return;
			}
			const price = colMap.unitPrice != null ? parseExcelNum(row[colMap.unitPrice]) || "" : "";
			if (!price) return;
			candidates.forEach((a) => {
				byActivity[a.id] = price;
				pricedIds.add(a.id);
			});
			matched += candidates.length;
		});
		const missingActivities = [];
		leaves.forEach((l) => {
			activitiesOf(l.id).forEach((a) => {
				if (!pricedIds.has(a.id)) missingActivities.push({
					code: l.code,
					name: a.name || ""
				});
			});
		});
		return {
			byActivity,
			matched,
			orphanCodes,
			unmatchedActivities,
			packageMismatches,
			idMismatches,
			missingActivities
		};
	}
	async function importEstimateExcel(file) {
		if (!window.JSZip) {
			await showAlert("No se pudo cargar la librería para leer archivos .xlsx (JSZip). Recargá la página e intentá de nuevo; este archivo no llegó a leerse, no es que el .xlsx esté mal.");
			return;
		}
		let parsed;
		try {
			parsed = await parseEstimateXlsx(file);
		} catch (_) {
			await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
			return;
		}
		if (parsed.kind === "sheet-not-found") {
			const otras = parsed.sheetNames.filter((n) => normalizeHeader(n) !== normalizeHeader(DATA_SHEET_NAME));
			await showAlert("No encontré una hoja llamada «Estimado» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con los datos a importar aquí debe llamarse exactamente «Estimado» (como la que genera «⇩ Exportar a Excel») para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
			return;
		}
		if (parsed.kind === "empty") {
			await showAlert("El archivo no contiene datos reconocibles.");
			return;
		}
		const colMap = mapHeaderColumns(parsed.headers);
		if (!colMap) {
			await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna columna, p. ej. «EDT» en vez de «Código EDT», o «Paquete» en vez de «Paquete de trabajo»?). Se esperan al menos «Código EDT» y «Nombre de la actividad» escritas tal cual.");
			return;
		}
		const result = reconcileImportRows(parsed.rows, colMap);
		const totalIssues = result.orphanCodes.length + result.unmatchedActivities.length + result.packageMismatches.length;
		if (!result.matched && !totalIssues) {
			await showAlert("El archivo no tiene ninguna fila con datos: revisa que hayas completado el Precio unitario.");
			return;
		}
		if (!result.matched && totalIssues) {
			await showAlert("Ninguna fila del archivo coincide con la EDT ni con las actividades del proyecto activo (Código EDT" + (colMap.pkgName != null ? " + Paquete de trabajo" : "") + " + Nombre de la actividad). ¿Es el archivo correcto para este proyecto? No se modificó el estimado actual.", "Archivo no reconciliado");
			return;
		}
		let msg = "Se reemplazará el estimado actual por precios para " + result.matched + " actividad(es) del archivo" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT y las actividades no se tocan.";
		if (result.orphanCodes.length) msg += " " + result.orphanCodes.length + " fila(s) no se importaron por no coincidir con ningún código EDT actual: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
		if (result.packageMismatches.length) {
			const ex = result.packageMismatches.slice(0, 8).map((u) => u.code + " (\"" + u.fileName + "\" ≠ \"" + u.realName + "\")").join(", ");
			msg += " " + result.packageMismatches.length + " fila(s) no se importaron porque el Paquete de trabajo del archivo no coincide con el nombre real de ese Código EDT: " + ex + (result.packageMismatches.length > 8 ? "…" : "") + ".";
		}
		if (result.unmatchedActivities.length) {
			const ex = result.unmatchedActivities.slice(0, 8).map((u) => u.code + " \"" + u.name + "\"").join(", ");
			msg += " " + result.unmatchedActivities.length + " fila(s) no se importaron porque no hay ninguna actividad con ese nombre bajo ese paquete (¿cambiaron en Definir las Actividades?): " + ex + (result.unmatchedActivities.length > 8 ? "…" : "") + ".";
		}
		if (result.idMismatches.length) {
			const anyCode = result.idMismatches.some((m) => m.codeMismatch);
			const anyName = result.idMismatches.some((m) => m.nameMismatch);
			const which = anyCode && anyName ? "la columna Código EDT y la columna Paquete de trabajo / Actividad" : anyCode ? "la columna Código EDT" : "la columna Paquete de trabajo / Actividad";
			msg += " ⚠ " + result.idMismatches.length + " fila(s) tienen un Id. que ya no coincide con lo cargado en Definir las Actividades para esa misma posición: " + which + " no coincide(n) exactamente (¿se editó la EDT o las actividades después de exportar este archivo?).";
		}
		if (result.missingActivities.length) {
			const ex = result.missingActivities.slice(0, 8).map((u) => u.code).join(", ");
			msg += " ⚠ " + result.missingActivities.length + " actividad(es) de la EDT actual quedan sin precio: " + ex + (result.missingActivities.length > 8 ? "…" : "") + ".";
		}
		if (!await showConfirm(msg, "Importar estimado desde Excel")) return;
		if (mode === "sample") stateSample = { byActivity: result.byActivity };
		else stateLive = { byActivity: result.byActivity };
		onDirty(true);
		const issues = totalIssues;
		setStatus(result.matched + " actividad(es) con precio importado" + (issues ? " · " + issues + " fila(s) no reconciliada(s)" : "") + (result.idMismatches.length ? " · " + result.idMismatches.length + " fila(s) con Id. desactualizado" : "") + (result.missingActivities.length ? " · " + result.missingActivities.length + " actividad(es) sin precio" : "") + ".");
	}
	function wireToolbar() {
		document.getElementById("btnReload").addEventListener("click", () => {
			gpiPullWbs();
			render();
			setStatus("EDT y actividades recargadas desde el proyecto activo.");
		});
		document.getElementById("btnCopyTable").addEventListener("click", copyWholeTable);
		document.getElementById("btnExportExcel").addEventListener("click", downloadEstimate);
		document.getElementById("btnImportExcel").addEventListener("click", () => {
			document.getElementById("xlsxFileInput").click();
		});
		document.getElementById("xlsxFileInput").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) importEstimateExcel(files[0]);
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
			if (!await showConfirm("Se eliminará el precio de las " + stats().pricedActivities + " actividades ya con precio" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT y las actividades no se tocan. ¿Continuar?", "Limpiar estimado")) return;
			if (mode === "sample") stateSample = { byActivity: {} };
			else stateLive = { byActivity: {} };
			onDirty(true);
			setStatus("Estimado de costos vacío.");
		});
	}
	function gpiPullWbs() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		wbsLive = window.GPI.getModule("wbs") ?? null;
		activitiesLive = window.GPI.getModule("activities") ?? null;
	}
	function markProjectStale() {
		if (projectStale) return;
		projectStale = true;
		setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
		const banner = document.getElementById("banner");
		if (banner) {
			banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el estimado aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
			banner.classList.add("show");
		}
	}
	function gpiPush() {
		if (mode === "sample") return false;
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return false;
		if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
			markProjectStale();
			return false;
		}
		const r = pushWithSession(window.GPI, "costEstimate", "El estimado de costos", stateLive, {
			name: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value
		}, session, {
			setStatus,
			onStale: markProjectStale
		});
		session = r.session;
		return r.ok;
	}
	var initialized = false;
	function init() {
		if (initialized) return;
		initialized = true;
		wireToolbar();
		if (typeof window.GPI !== "undefined" && window.GPI.available()) {
			const proj = window.GPI.active();
			loadedProjectId = window.GPI.activeId();
			if (proj) {
				if (proj.meta) {
					if (proj.meta.name) document.getElementById("projectTitle").value = proj.meta.name;
					if (proj.meta.course) document.getElementById("courseTitle").value = proj.meta.course;
				}
				gpiPullWbs();
				session = window.GPI.openSession("costEstimate");
				const mod = window.GPI.getModule("costEstimate");
				if (mod) {
					stateLive = normalizeState(mod);
					window.GPI.rebaseSession(session, stateLive);
				}
				setStatus("Proyecto cargado desde el Panel de Control.");
			}
			window.addEventListener("beforeunload", gpiPush);
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) gpiPush();
			});
			window.GPI.onChange(() => {
				if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
					markProjectStale();
					return;
				}
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
