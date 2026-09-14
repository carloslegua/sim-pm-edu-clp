(function() {
	//#region src/modules/cost-estimate/main.ts
	var mode = "live";
	var stateLive = { byLeaf: {} };
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
			const it = src[k] || {};
			by[k] = {
				unit: it.unit || "",
				qty: it.qty == null ? "" : it.qty,
				unitPrice: it.unitPrice == null ? "" : it.unitPrice
			};
		});
		return { byLeaf: by };
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
	function subtotalOf(item) {
		if (!item) return null;
		const qty = numOrNull(item.qty), price = numOrNull(item.unitPrice);
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
		const st = state(), leaves = leafRows();
		let totalCost = 0, covered = 0;
		const uncovered = [];
		leaves.forEach((l) => {
			const sub = subtotalOf(st.byLeaf[l.id]);
			if (sub != null) {
				covered++;
				totalCost += sub;
			} else uncovered.push(l);
		});
		return {
			totalCost,
			leaves: leaves.length,
			covered,
			uncovered,
			pct: leaves.length ? Math.round(covered / leaves.length * 100) : 0
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
		treeRows().forEach((r) => {
			if (r.kind === "phase") out.push({
				kind: "phase",
				n: n++,
				code: r.code,
				level: r.depth + 1,
				name: r.name,
				id: r.id
			});
			else {
				const item = st.byLeaf[r.id];
				out.push({
					kind: "package",
					n: n++,
					code: r.code,
					level: r.depth + 1,
					name: r.name,
					id: r.id,
					unit: item ? item.unit : "",
					qty: item ? item.qty : "",
					unitPrice: item ? item.unitPrice : "",
					subtotal: subtotalOf(item)
				});
			}
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
			empty.innerHTML = mode === "live" ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo estima el costo de sus paquetes de trabajo.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>" : "<b>Sin EDT de ejemplo.</b>";
			const bi = document.getElementById("btnSampleInner");
			if (bi) bi.addEventListener("click", enterSample);
			return;
		}
		empty.style.display = "none";
		let html = "", total = 0;
		rows.forEach((r) => {
			if (r.kind === "project") html += "<tr class=\"proj-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\" style=\"color:var(--ink-1)\">0</td><td colspan=\"5\">" + esc(r.name) + " <span class=\"proj-hint\">Fila 0</span></td></tr>";
			else if (r.kind === "phase") html += "<tr class=\"phase-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\">" + esc(r.code) + "</td><td colspan=\"5\" style=\"padding-left:" + (10 + Math.max(0, r.level - 2) * 16) + "px\">" + esc(r.name) + "</td></tr>";
			else {
				if (r.subtotal != null) total += r.subtotal;
				html += "<tr class=\"pkg-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"pk-code\">" + esc(r.code) + "</td><td style=\"padding-left:" + (8 + Math.max(0, r.level - 2) * 16) + "px\"><span class=\"pk-name\">" + esc(r.name) + "</span></td><td>" + esc(r.unit || "—") + "</td><td class=\"num\">" + fmtQty(r.qty) + "</td><td class=\"num\">" + fmtQty(r.unitPrice) + "</td>" + (r.subtotal == null ? "<td class=\"sub-cell empty\" title=\"Faltan Cantidad y/o Precio unitario\">—</td>" : "<td class=\"sub-cell\" title=\"Subtotal = Cantidad × Precio unitario\">" + fmtMoney(r.subtotal) + "</td>") + "</tr>";
			}
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
		const lines = ["N.º	Código EDT	Paquete de trabajo	Unidad	Cantidad	Precio unitario	Subtotal"];
		rows.forEach((r) => {
			const isPkg = r.kind === "package";
			lines.push([
				r.n,
				r.code,
				r.name || "",
				isPkg ? r.unit || "" : "",
				isPkg ? r.qty == null ? "" : r.qty : "",
				isPkg ? r.unitPrice == null ? "" : r.unitPrice : "",
				isPkg && r.subtotal != null ? r.subtotal : ""
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
		document.getElementById("sbCov").textContent = s.covered + "/" + s.leaves + " paquetes estimados";
		document.getElementById("sbPct").textContent = s.pct + "%";
		const bar = document.getElementById("sbBar");
		bar.style.width = s.pct + "%";
		bar.style.background = s.pct >= 100 ? "var(--good)" : s.pct >= 50 ? "var(--warn)" : "var(--act-a)";
		const host = document.getElementById("missList");
		if (!s.leaves) host.innerHTML = "<div style=\"font-size:11.5px;color:var(--ink-2)\">Sin EDT cargada.</div>";
		else if (!s.uncovered.length) host.innerHTML = "<div class=\"miss-ok\">✓ Todos los paquetes de trabajo tienen un costo estimado.</div>";
		else host.innerHTML = s.uncovered.map((l) => "<div class=\"miss-item\"><span class=\"mc\">" + esc(l.code) + "</span><span>" + esc(l.name) + "</span></div>").join("");
	}
	function renderOrphans() {
		const st = state(), leaves = leafRows();
		const leafIds = {};
		leaves.forEach((l) => {
			leafIds[l.id] = true;
		});
		const orphanKeys = Object.keys(st.byLeaf).filter((k) => !leafIds[k]);
		const bn = document.getElementById("orphanBanner");
		if (!orphanKeys.length) {
			bn.classList.remove("show");
			bn.innerHTML = "";
			return;
		}
		bn.classList.add("show");
		bn.innerHTML = "<b>⚠ " + orphanKeys.length + " paquete(s) huérfano(s):</b> tienen un costo estimado guardado, pero su paquete de trabajo ya no existe en la EDT (o dejó de ser una hoja). No aparecen en la tabla ni en los conteos. <button class=\"btn sm danger\" id=\"btnOrphans\">Eliminar huérfanos</button>";
		document.getElementById("btnOrphans").addEventListener("click", async () => {
			if (!await showConfirm("Se eliminarán definitivamente los " + orphanKeys.length + " estimados huérfanos. Si en realidad la EDT cambió por error, corrígela primero en WBS Builder y vuelve a recargar.", "Eliminar estimados huérfanos")) return;
			orphanKeys.forEach((k) => {
				delete st.byLeaf[k];
			});
			onDirty(true);
			setStatus("Estimados huérfanos eliminados.");
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
	function exportJson() {
		const data = {
			kind: "gpi.costEstimate/v1",
			title: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value,
			data: state()
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		const safe = (data.title || "estimacion_costos").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		a.href = url;
		a.download = "estimacion_costos_" + safe + ".json";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Estimado exportado como .json.");
	}
	function importJson(file) {
		const r = new FileReader();
		r.onload = (e) => {
			let obj;
			try {
				obj = JSON.parse(e.target.result);
			} catch (_) {
				showAlert("El archivo no es un .json válido.");
				return;
			}
			if (obj && obj.kind === "gpi.costEstimate/v1" && obj.data) {
				if (mode === "sample") stateSample = normalizeState(obj.data);
				else stateLive = normalizeState(obj.data);
				if (obj.title) document.getElementById("projectTitle").value = obj.title;
				if (obj.course) document.getElementById("courseTitle").value = obj.course;
				render();
				gpiPush();
				setStatus("Estimado importado. Los costos se enlazan a la EDT por el id de cada paquete.");
			} else showAlert("No reconocí el formato: se esperaba una exportación de esta herramienta (gpi.costEstimate/v1).");
		};
		r.readAsText(file);
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
	function sampleEstimate() {
		const I = SAMPLE_WBS.ids;
		function E(unit, qty, unitPrice) {
			return {
				unit,
				qty,
				unitPrice
			};
		}
		return { byLeaf: {
			[I.p11]: E("glb", 1, 12e3),
			[I.p12]: E("glb", 1, 38e3),
			[I.p13]: E("glb", 1, 145e3),
			[I.p21]: E("pto", 8, 3500),
			[I.p22]: E("m²", 3e3, 55),
			[I.p23]: E("pto", 980, 100),
			[I.p24]: E("glb", 1, 64e3),
			[I.p31]: E("ton", 260, 7e3),
			[I.p32]: E("glb", 1, 715e3),
			[I.p33]: E("glb", 1, 415e3),
			[I.p41]: E("m³", 2e3, 190),
			[I.p42]: E("m³", 1050, 700),
			[I.p43]: E("m²", 2330, 500),
			[I.p44]: E("m²", 2750, 200),
			[I.p45]: E("pto", 970, 500),
			[I.p51]: E("glb", 1, 145e3),
			[I.p52]: E("hora", 96, 500),
			[I.p53]: E("glb", 1, 92e3)
		} };
	}
	function enterSample() {
		mode = "sample";
		if (!stateSample) stateSample = sampleEstimate();
		render();
		setStatus("Modo ejemplo: EDT y estimado de costos didácticos (no toca los datos del proyecto).");
	}
	function enterLive() {
		mode = "live";
		render();
		setStatus("De vuelta a la EDT del proyecto activo.");
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
		let body = (mode === "sample" ? "<p class=\"rep-note\"><b>Modo ejemplo:</b> este listado usa la EDT y el estimado didácticos, no los datos del proyecto activo.</p>" : "") + "<h2>1. Resumen</h2><table class=\"rep-kv\"><tr><td>Costo total estimado</td><td><b>" + fmtMoney(s.totalCost) + "</b></td></tr><tr><td>Cobertura de paquetes de trabajo</td><td>" + s.covered + " de " + s.leaves + " paquetes estimados (<b>" + s.pct + "%</b>)</td></tr></table><h2>2. Estimación de costos por paquete de trabajo</h2><p class=\"rep-note\">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el N.º corre consecutivo por todas las filas. Subtotal = Cantidad × Precio unitario, valor calculado (nunca se ingresa directamente).</p><table><tr><th style=\"width:6%\">N.º</th><th style=\"width:9%\">Código EDT</th><th>Paquete de trabajo</th><th style=\"width:9%\">Unidad</th><th style=\"width:11%\">Cantidad</th><th style=\"width:12%\">Precio unitario</th><th style=\"width:12%\">Subtotal</th></tr>";
		const repRows = fullRows();
		let total = 0;
		if (!repRows.length) body += "<tr><td colspan=\"7\" class=\"rep-note\">— Sin EDT cargada —</td></tr>";
		repRows.forEach((r) => {
			if (r.kind === "project") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">0</td><td class=\"num rep-phase\">0</td><td class=\"rep-phase\" colspan=\"5\">" + esc(r.name) + " <span class=\"rep-note\">(tarea resumen del proyecto)</span></td></tr>";
			else if (r.kind === "phase") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-phase\">" + esc(r.code) + "</td><td class=\"rep-phase\" colspan=\"5\">" + esc(r.name) + "</td></tr>";
			else {
				if (r.subtotal != null) total += r.subtotal;
				body += "<tr><td class=\"num\" style=\"text-align:center\">" + r.n + "</td><td class=\"num\">" + esc(r.code) + "</td><td>" + esc(r.name) + "</td><td>" + esc(r.unit || "—") + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.qty) + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.unitPrice) + "</td><td class=\"num\" style=\"text-align:right\"><b>" + fmtMoney(r.subtotal) + "</b></td></tr>";
			}
		});
		if (repRows.length) body += "<tr><td colspan=\"6\" style=\"text-align:right\"><b>Total estimado</b></td><td class=\"num\" style=\"text-align:right\"><b>" + fmtMoney(total) + "</b></td></tr>";
		body += "</table>";
		reportShell("Estimación de Costos por Paquete de Trabajo", "Estimar los Costos · Gestión de Costos", body);
	}
	function xmlEsc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	var TEMPLATE_HEADERS = [
		"Código EDT",
		"Nombre del paquete de trabajo/actividad",
		"Unidad de medida",
		"Cantidad",
		"Precio unitario",
		"Subtotal"
	];
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
		const st = state();
		leafRows().forEach((l) => {
			const item = st.byLeaf[l.id];
			const qty = item ? numOrNull(item.qty) : null;
			const unitPrice = item ? numOrNull(item.unitPrice) : null;
			const subtotal = qty != null && unitPrice != null ? Math.round(qty * unitPrice * 100) / 100 : null;
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
				item && item.unit ? {
					v: item.unit,
					t: "s",
					s: 0
				} : null,
				qty != null ? {
					v: qty,
					t: "n"
				} : null,
				unitPrice != null ? {
					v: unitPrice,
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
			["1. Cada fila es un paquete de trabajo de la EDT. Las columnas “Código EDT” y “Nombre del paquete de trabajo/actividad” son de referencia — no las edites ni las borres: son la clave con la que este simulador reconoce a qué paquete pertenece cada fila al importar el archivo de vuelta (deben coincidir AMBAS con la EDT actual).", 4],
			["2. Completa “Unidad de medida”, “Cantidad” y “Precio unitario” para cada paquete.", 4],
			["3. La columna “Subtotal” es de referencia (Cantidad × Precio unitario): se recalcula sola al importar, no hace falta completarla ni editarla a mano.", 4],
			["4. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
			["5. Guarda el archivo y vuelve a “Estimar los Costos” > botón “⇧ Importar desde Excel” para subirlo.", 4],
			["", 0],
			["6. Este mismo archivo se puede volver a generar en cualquier momento con “⇩ Exportar a Excel”: si el proyecto ya tiene un estimado cargado, el archivo sale completo (no en blanco) y, si se reimporta sin tocarlo, reproduce exactamente los mismos datos.", 4],
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
			10,
			34,
			14,
			12,
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
		const st = state();
		leafRows().forEach((l) => {
			const item = st.byLeaf[l.id];
			const qty = item ? numOrNull(item.qty) : null;
			const unitPrice = item ? numOrNull(item.unitPrice) : null;
			const subtotal = qty != null && unitPrice != null ? Math.round(qty * unitPrice * 100) / 100 : null;
			lines.push([
				cell(l.code),
				cell(l.name || ""),
				cell(item ? item.unit : ""),
				cell(qty ?? ""),
				cell(unitPrice ?? ""),
				cell(subtotal ?? "")
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
	async function resolveFirstSheetPath(zip) {
		const wbEntry = zip.file("xl/workbook.xml");
		if (!wbEntry) return null;
		const sheetEl = new DOMParser().parseFromString(await wbEntry.async("string"), "application/xml").getElementsByTagName("sheet")[0];
		const rId = sheetEl ? sheetEl.getAttribute("r:id") : null;
		const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
		if (!rId || !relsEntry) return null;
		const relsDoc = new DOMParser().parseFromString(await relsEntry.async("string"), "application/xml");
		const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rId);
		const target = rel ? rel.getAttribute("Target") || "" : "";
		if (!target) return null;
		return target.startsWith("/") ? target.slice(1) : "xl/" + target;
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
		const sheetPath = await resolveFirstSheetPath(zip);
		if (!sheetPath) return null;
		const sheetEntry = zip.file(sheetPath);
		if (!sheetEntry) return null;
		const [sheetXml, sharedStrings] = await Promise.all([sheetEntry.async("string"), loadSharedStrings(zip)]);
		const allRows = parseSheetRows(sheetXml, sharedStrings);
		if (!allRows.length) return null;
		return {
			headers: allRows[0],
			rows: allRows.slice(1)
		};
	}
	var HEADER_KEYWORDS = [
		{
			field: "code",
			keywords: ["codigo edt", "edt"]
		},
		{
			field: "name",
			keywords: [
				"nombre del paquete",
				"paquete de trabajo",
				"actividad"
			]
		},
		{
			field: "unit",
			keywords: ["unidad"]
		},
		{
			field: "qty",
			keywords: ["cantidad"]
		},
		{
			field: "unitPrice",
			keywords: ["precio unitario", "precio"]
		}
	];
	function normalizeHeader(s) {
		return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	}
	function mapHeaderColumns(headerRow) {
		const norm = headerRow.map(normalizeHeader);
		const map = {};
		HEADER_KEYWORDS.forEach(({ field, keywords }) => {
			const idx = norm.findIndex((h) => keywords.some((kw) => h.indexOf(kw) !== -1));
			if (idx !== -1) map[field] = idx;
		});
		if (map.code == null || map.name == null) return null;
		return map;
	}
	function reconcileImportRows(rows, colMap) {
		const leaves = leafRows();
		const byCode = {};
		leaves.forEach((l) => {
			byCode[l.code] = l;
		});
		const byLeaf = {};
		const presentIds = /* @__PURE__ */ new Set();
		const orphanCodes = [], mismatchCodes = [];
		let matched = 0;
		rows.forEach((row) => {
			const code = String(row[colMap.code] || "").trim();
			if (!code) return;
			const name = String(row[colMap.name] || "").trim();
			const leaf = byCode[code];
			if (!leaf) {
				orphanCodes.push(code);
				return;
			}
			if (name && normalizeHeader(name) !== normalizeHeader(leaf.name)) {
				mismatchCodes.push(code);
				return;
			}
			presentIds.add(leaf.id);
			const unit = colMap.unit != null ? String(row[colMap.unit] || "").trim() : "";
			const qty = colMap.qty != null ? parseExcelNum(row[colMap.qty]) || "" : "";
			const unitPrice = colMap.unitPrice != null ? parseExcelNum(row[colMap.unitPrice]) || "" : "";
			if (unit || qty || unitPrice) {
				byLeaf[leaf.id] = {
					unit,
					qty,
					unitPrice
				};
				matched++;
			}
		});
		const missingLeaves = leaves.filter((l) => !presentIds.has(l.id));
		return {
			byLeaf,
			matched,
			orphanCodes,
			mismatchCodes,
			missingLeaves
		};
	}
	async function importEstimateExcel(file) {
		let parsed;
		try {
			parsed = await parseEstimateXlsx(file);
		} catch (_) {
			await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
			return;
		}
		if (!parsed) {
			await showAlert("El archivo no contiene datos reconocibles.");
			return;
		}
		const colMap = mapHeaderColumns(parsed.headers);
		if (!colMap) {
			await showAlert("No reconocí las columnas del archivo. Se esperan al menos «Código EDT» y «" + TEMPLATE_HEADERS[1] + "» — no renombres esas columnas.");
			return;
		}
		const result = reconcileImportRows(parsed.rows, colMap);
		if (!result.matched && !result.orphanCodes.length && !result.mismatchCodes.length) {
			await showAlert("El archivo no tiene ninguna fila con datos: revisa que hayas completado Cantidad y Precio unitario.");
			return;
		}
		let msg = "Se reemplazará el estimado actual por " + result.matched + " paquete(s) con datos del archivo" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca.";
		if (result.orphanCodes.length) msg += " " + result.orphanCodes.length + " fila(s) no se importaron por no coincidir con ningún código EDT actual: " + result.orphanCodes.slice(0, 8).join(", ") + (result.orphanCodes.length > 8 ? "…" : "") + ".";
		if (result.mismatchCodes.length) msg += " " + result.mismatchCodes.length + " fila(s) no se importaron porque el nombre no coincide con el paquete de ese código EDT (¿la EDT cambió después de exportar?): " + result.mismatchCodes.slice(0, 8).join(", ") + (result.mismatchCodes.length > 8 ? "…" : "") + ".";
		if (result.missingLeaves.length) msg += " ⚠ " + result.missingLeaves.length + " paquete(s) de la EDT actual no aparecen en el archivo: " + result.missingLeaves.slice(0, 8).map((l) => l.code).join(", ") + (result.missingLeaves.length > 8 ? "…" : "") + " — el estimado quedará incompleto para esos paquetes.";
		if (!await showConfirm(msg, "Importar estimado desde Excel")) return;
		if (mode === "sample") stateSample = { byLeaf: result.byLeaf };
		else stateLive = { byLeaf: result.byLeaf };
		onDirty(true);
		const issues = result.orphanCodes.length + result.mismatchCodes.length;
		setStatus(result.matched + " paquete(s) importado(s) desde Excel" + (issues ? " · " + issues + " fila(s) no reconciliada(s)" : "") + (result.missingLeaves.length ? " · " + result.missingLeaves.length + " paquete(s) sin fila en el archivo" : "") + ".");
	}
	function wireToolbar() {
		document.getElementById("btnExportJson").addEventListener("click", exportJson);
		document.getElementById("btnImportJson").addEventListener("click", () => {
			document.getElementById("fileInput").click();
		});
		document.getElementById("fileInput").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) importJson(files[0]);
			e.target.value = "";
		});
		document.getElementById("btnReload").addEventListener("click", () => {
			gpiPullWbs();
			render();
			setStatus("EDT recargada desde el proyecto activo.");
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
		document.getElementById("btnClear").addEventListener("click", async () => {
			if (!await showConfirm("Se eliminará el estimado de los " + stats().covered + " paquetes ya estimados" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca. ¿Continuar?", "Limpiar estimado")) return;
			if (mode === "sample") stateSample = { byLeaf: {} };
			else stateLive = { byLeaf: {} };
			onDirty(true);
			setStatus("Estimado de costos vacío.");
		});
	}
	function gpiPullWbs() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		wbsLive = window.GPI.getModule("wbs") ?? null;
	}
	function gpiPush() {
		if (mode === "sample") return;
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		window.GPI.setModule("costEstimate", stateLive);
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
				const mod = window.GPI.getModule("costEstimate");
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
