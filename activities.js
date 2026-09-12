(function() {
	//#region src/modules/activities/main.ts
	var mode = "live";
	var stateLive = {
		byLeaf: {},
		idCounter: 1
	};
	var stateSample = null;
	var wbsLive = null;
	function state() {
		return mode === "sample" ? stateSample : stateLive;
	}
	function wbsData() {
		return mode === "sample" ? SAMPLE_WBS : wbsLive;
	}
	function uid() {
		const st = state();
		return "a" + st.idCounter++;
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
		return {
			byLeaf: by,
			idCounter: Number(obj.idCounter) || 1
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
				if (e.key === "Escape") done(false);
				if (e.key === "Enter") done(true);
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
			}
		});
		return out;
	}
	function renderTable() {
		const tbody = document.getElementById("actsBody");
		const empty = document.getElementById("emptyState");
		const rows = fullRows();
		if (!rows.length) {
			actsCache = [];
			selAnchor = null;
			selEnd = null;
			tbody.innerHTML = "";
			empty.style.display = "";
			empty.innerHTML = mode === "live" ? "<b>La EDT del proyecto activo está vacía.</b><br>Construye primero la estructura de desglose del trabajo en WBS Builder; este módulo descompone sus paquetes de trabajo en actividades.<br><a class=\"btn\" href=\"WBS_Builder.html\">▦ Abrir WBS Builder</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>" : "<b>Sin EDT de ejemplo.</b>";
			const bi = document.getElementById("btnSampleInner");
			if (bi) bi.addEventListener("click", enterSample);
			return;
		}
		empty.style.display = "none";
		actsCache = rows.filter((r) => r.kind === "activity");
		selAnchor = null;
		selEnd = null;
		let html = "";
		rows.forEach((r) => {
			if (r.kind === "project") html += "<tr class=\"proj-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\" style=\"color:var(--ink-1)\">0</td><td colspan=\"6\">" + esc(r.name) + "</td><td style=\"text-align:center\"><span class=\"proj-hint\">Fila 0</span></td></tr>";
			else if (r.kind === "phase") html += "<tr class=\"phase-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\">" + esc(r.code) + "</td><td colspan=\"7\" style=\"padding-left:" + (10 + Math.max(0, r.level - 2) * 16) + "px\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") html += "<tr class=\"pkg-row\" id=\"pkg-" + esc(r.id) + "\"><td class=\"n-cell\">" + r.n + "</td><td class=\"pk-code\">" + esc(r.code) + "</td><td style=\"padding-left:" + (8 + Math.max(0, r.level - 2) * 16) + "px\"><span class=\"pk-name\">" + esc(r.name) + "</span><span class=\"pk-count" + (r.count ? "" : " zero") + "\">" + r.count + " act.</span></td><td colspan=\"5\"></td><td style=\"text-align:center\"><button class=\"btn-add-act\" tabindex=\"-1\" data-add=\"" + esc(r.id) + "\" title=\"Agregar actividad a este paquete\">+ Actividad</button></td></tr>";
			else html += "<tr class=\"act-row\"><td class=\"n-cell act-item\">" + r.n + "</td><td class=\"act-code\">" + esc(r.code) + "</td><td class=\"in-cell\"><input data-leaf=\"" + esc(r.leafId) + "\" data-i=\"" + r.actIndex + "\" data-f=\"name\" value=\"" + esc(r.name) + "\" placeholder=\"Nombre de la actividad…\"></td><td class=\"in-cell\"><input data-leaf=\"" + esc(r.leafId) + "\" data-i=\"" + r.actIndex + "\" data-f=\"unit\" value=\"" + esc(r.unit) + "\" list=\"unitList\" placeholder=\"m³, kg…\"></td><td class=\"in-cell\"><input class=\"qty\" type=\"text\" inputmode=\"decimal\" data-leaf=\"" + esc(r.leafId) + "\" data-i=\"" + r.actIndex + "\" data-f=\"qty\" value=\"" + esc(r.qty) + "\" placeholder=\"0.00\"></td><td class=\"in-cell\"><input class=\"qty\" type=\"text\" inputmode=\"decimal\" data-leaf=\"" + esc(r.leafId) + "\" data-i=\"" + r.actIndex + "\" data-f=\"perf\" value=\"" + esc(r.perf) + "\" placeholder=\"p. ej. 25\" title=\"Rendimiento de un equipo por día\"></td><td class=\"in-cell\"><input class=\"qty\" type=\"text\" inputmode=\"numeric\" data-leaf=\"" + esc(r.leafId) + "\" data-i=\"" + r.actIndex + "\" data-f=\"teams\" value=\"" + esc(r.teams) + "\" title=\"Número de equipos en paralelo (1 por defecto)\"></td>" + (r.dur == null ? "<td class=\"dur-cell empty\" title=\"Falta el metrado o el rendimiento para calcular la duración\">—</td>" : "<td class=\"dur-cell\" title=\"Dur = " + esc(r.qty) + " ÷ (" + esc(String(Math.max(1, numVal(r.teams) || 1))) + " × " + esc(r.perf) + "), redondeada al entero superior\">" + r.dur + "</td>") + "<td style=\"text-align:center\"><button class=\"act-del\" tabindex=\"-1\" data-del-leaf=\"" + esc(r.leafId) + "\" data-i=\"" + r.actIndex + "\" title=\"Eliminar actividad\">🗑</button></td></tr>";
		});
		tbody.innerHTML = html;
	}
	var PASTE_FIELDS = [
		"name",
		"unit",
		"qty",
		"perf",
		"teams"
	];
	function parseExcelNum(s) {
		let str = String(s == null ? "" : s).trim().replace(/[\s ]/g, "");
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
	function handleTablePaste(e) {
		const el = e.target.closest ? e.target.closest("input[data-leaf]") : null;
		if (!el || !e.clipboardData) return;
		const text = e.clipboardData.getData("text/plain") || "";
		if (text.indexOf("	") === -1 && !/\r?\n./.test(text)) return;
		e.preventDefault();
		const grid = text.replace(/\r/g, "").split("\n");
		while (grid.length && grid[grid.length - 1] === "") grid.pop();
		if (!grid.length) return;
		const actsList = fullRows().filter((r) => r.kind === "activity");
		const startField = PASTE_FIELDS.indexOf(el.dataset.f);
		let start = -1;
		for (let i = 0; i < actsList.length; i++) if (actsList[i].leafId === el.dataset.leaf && actsList[i].actIndex === Number(el.dataset.i)) {
			start = i;
			break;
		}
		if (start === -1 || startField === -1) return;
		let applied = 0, skipped = 0;
		const fieldsTouched = {};
		grid.forEach((line, ri) => {
			const target = actsList[start + ri];
			if (!target) {
				skipped++;
				return;
			}
			const act = state().byLeaf[target.leafId] && state().byLeaf[target.leafId][target.actIndex];
			if (!act) {
				skipped++;
				return;
			}
			line.split("	").forEach((raw, ci) => {
				const f = PASTE_FIELDS[startField + ci];
				if (!f) return;
				let val;
				if (f === "qty" || f === "perf" || f === "teams") {
					val = parseExcelNum(raw);
					if (val === null) {
						if (String(raw).trim()) skipped++;
						return;
					}
					if (val === "") return;
				} else {
					val = String(raw).trim();
					if (!val) return;
				}
				act[f] = val;
				applied++;
				fieldsTouched[f] = true;
			});
		});
		onDirty(true);
		const LBL = {
			name: "Actividad",
			unit: "Unidad",
			qty: "Metrado",
			perf: "Rend. (R)",
			teams: "#Eq"
		};
		const names = Object.keys(fieldsTouched).map((f) => LBL[f]).join(", ");
		setStatus("Pegado desde Excel: " + applied + " valor(es) en " + Math.min(grid.length, actsList.length - start) + " fila(s)" + (names ? " — " + names : "") + (skipped ? " · " + skipped + " celda(s) omitida(s)" : "") + ".");
	}
	var actsCache = [];
	var selAnchor = null;
	var selEnd = null;
	function cellCoord(el) {
		const f = PASTE_FIELDS.indexOf(el.dataset.f);
		if (f === -1) return null;
		for (let r = 0; r < actsCache.length; r++) if (actsCache[r].leafId === el.dataset.leaf && actsCache[r].actIndex === Number(el.dataset.i)) return {
			r,
			f
		};
		return null;
	}
	function cellInput(r, f) {
		const a = actsCache[r];
		if (!a || !PASTE_FIELDS[f]) return null;
		return document.querySelector("input[data-leaf=\"" + a.leafId + "\"][data-i=\"" + a.actIndex + "\"][data-f=\"" + PASTE_FIELDS[f] + "\"]");
	}
	function clearSelection() {
		selEnd = null;
		paintSelection();
	}
	function paintSelection() {
		document.querySelectorAll("#actsBody td.sel").forEach((td) => td.classList.remove("sel"));
		if (!selAnchor || !selEnd) return;
		const r1 = Math.min(selAnchor.r, selEnd.r), r2 = Math.max(selAnchor.r, selEnd.r);
		const f1 = Math.min(selAnchor.f, selEnd.f), f2 = Math.max(selAnchor.f, selEnd.f);
		for (let r = r1; r <= r2; r++) for (let f = f1; f <= f2; f++) {
			const inp = cellInput(r, f);
			if (inp) inp.closest("td").classList.add("sel");
		}
	}
	function selectionTsv() {
		if (!selAnchor || !selEnd) return null;
		const r1 = Math.min(selAnchor.r, selEnd.r), r2 = Math.max(selAnchor.r, selEnd.r);
		const f1 = Math.min(selAnchor.f, selEnd.f), f2 = Math.max(selAnchor.f, selEnd.f);
		const lines = [];
		for (let r = r1; r <= r2; r++) {
			const a = actsCache[r];
			const act = state().byLeaf[a.leafId] && state().byLeaf[a.leafId][a.actIndex];
			const cells = [];
			for (let f = f1; f <= f2; f++) {
				const v = act ? act[PASTE_FIELDS[f]] : "";
				cells.push(v == null ? "" : String(v));
			}
			lines.push(cells.join("	"));
		}
		return lines.join("\n");
	}
	function moveTo(r, f, keepCaret) {
		const inp = cellInput(r, f);
		if (!inp) return false;
		inp.focus();
		if (!keepCaret) try {
			inp.select();
		} catch (_) {}
		return true;
	}
	function caretAtStart(el) {
		try {
			return el.selectionStart === 0 && el.selectionEnd === 0;
		} catch (_) {
			return false;
		}
	}
	function caretAtEnd(el) {
		try {
			return el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
		} catch (_) {
			return false;
		}
	}
	function handleGridKeys(e) {
		const el = e.target.closest ? e.target.closest("input[data-leaf]") : null;
		if (!el) return;
		const c = cellCoord(el);
		if (!c) return;
		if (e.key === "Enter") {
			e.preventDefault();
			moveTo(c.r + 1, c.f) || el.blur();
			return;
		}
		if (e.key === "ArrowDown" && !e.shiftKey) {
			e.preventDefault();
			moveTo(c.r + 1, c.f);
			return;
		}
		if (e.key === "ArrowUp" && !e.shiftKey) {
			e.preventDefault();
			moveTo(c.r - 1, c.f);
			return;
		}
		if (e.key === "ArrowRight" && !e.shiftKey && caretAtEnd(el)) {
			if (moveTo(c.r, c.f + 1)) e.preventDefault();
			return;
		}
		if (e.key === "ArrowLeft" && !e.shiftKey && caretAtStart(el)) {
			if (moveTo(c.r, c.f - 1)) e.preventDefault();
			return;
		}
		if (e.key === "Escape") {
			clearSelection();
			return;
		}
	}
	function wireGridSelection(tbody) {
		tbody.addEventListener("mousedown", (e) => {
			const el = e.target.closest ? e.target.closest("input[data-leaf]") : null;
			if (!el) return;
			if (e.shiftKey && selAnchor) {
				e.preventDefault();
				const c = cellCoord(el);
				if (c) {
					selEnd = c;
					paintSelection();
				}
			}
		});
		tbody.addEventListener("focusin", (e) => {
			const el = e.target.closest ? e.target.closest("input[data-leaf]") : null;
			if (!el) return;
			const c = cellCoord(el);
			if (c) {
				selAnchor = c;
				clearSelection();
			}
		});
		tbody.addEventListener("copy", (e) => {
			const tsv = selectionTsv();
			if (tsv == null || !e.clipboardData) return;
			e.clipboardData.setData("text/plain", tsv);
			e.preventDefault();
			const r1 = Math.min(selAnchor.r, selEnd.r);
			setStatus("Rango copiado: " + (Math.max(selAnchor.r, selEnd.r) - r1 + 1) + " fila(s) — pégalo en Excel o en otra parte de la tabla.");
		});
		tbody.addEventListener("keydown", handleGridKeys);
	}
	function copyWholeTable() {
		const rows = fullRows();
		if (!rows.length) {
			setStatus("No hay tabla que copiar.");
			return;
		}
		const lines = ["N.º	EDT	Paquete de trabajo / Actividad	Unidad	Metrado	Rend. (R)	#Eq	Dur. (d)"];
		rows.forEach((r) => {
			const isAct = r.kind === "activity";
			lines.push([
				r.n,
				r.code,
				r.name || "",
				isAct ? r.unit || "" : "",
				isAct ? r.qty == null ? "" : r.qty : "",
				isAct ? r.perf == null ? "" : r.perf : "",
				isAct ? Math.max(1, numVal(r.teams) || 1) : "",
				isAct && r.dur != null ? r.dur : ""
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
	function wireTableDelegation() {
		const tbody = document.getElementById("actsBody");
		tbody.addEventListener("paste", handleTablePaste);
		wireGridSelection(tbody);
		tbody.addEventListener("input", (e) => {
			const el = e.target.closest ? e.target.closest("input[data-leaf]") : null;
			if (!el) return;
			const arr = state().byLeaf[el.dataset.leaf];
			if (arr && arr[Number(el.dataset.i)]) {
				const act = arr[Number(el.dataset.i)];
				act[el.dataset.f] = el.value;
				if (el.dataset.f === "qty" || el.dataset.f === "perf" || el.dataset.f === "teams") {
					const tr = el.closest("tr");
					const durCell = tr && tr.querySelector(".dur-cell");
					if (durCell) {
						const dv = durActivity(act);
						durCell.textContent = dv == null ? "—" : String(dv);
						durCell.className = "dur-cell" + (dv == null ? " empty" : "");
					}
				}
				onDirty(false);
			}
		});
		tbody.addEventListener("click", async (e) => {
			const add = e.target.closest ? e.target.closest("[data-add]") : null;
			if (add) {
				addActivity(add.dataset.add);
				return;
			}
			const del = e.target.closest ? e.target.closest("[data-del-leaf]") : null;
			if (!del) return;
			const arr = state().byLeaf[del.dataset.delLeaf];
			const a = arr && arr[Number(del.dataset.i)];
			if (!a) return;
			if ((a.name || "").trim()) {
				if (!await showConfirm("Se eliminará la actividad \"" + a.name + "\". El resto de la tabla se renumera automáticamente.", "Eliminar actividad")) return;
			}
			arr.splice(Number(del.dataset.i), 1);
			if (!arr.length) delete state().byLeaf[del.dataset.delLeaf];
			onDirty(true);
			setStatus("Actividad eliminada — numeración actualizada.");
		});
	}
	function addActivity(leafId) {
		const st = state();
		if (!st.byLeaf[leafId]) st.byLeaf[leafId] = [];
		st.byLeaf[leafId].push({
			id: uid(),
			name: "",
			unit: "",
			qty: "",
			perf: "",
			teams: 1
		});
		onDirty(true);
		const pkgRow = document.getElementById("pkg-" + leafId);
		if (pkgRow) {
			let row = pkgRow;
			const count = st.byLeaf[leafId].length;
			let seen = 0;
			while (row && row.nextElementSibling) {
				row = row.nextElementSibling;
				if (!row.classList.contains("act-row")) break;
				seen++;
				if (seen === count) {
					const inp = row.querySelector("input[data-f=\"name\"]");
					if (inp) inp.focus();
					break;
				}
			}
		}
		setStatus("Actividad agregada — completa nombre, unidad y metrado.");
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
	function exportJson() {
		const data = {
			kind: "gpi.activities/v1",
			title: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value,
			data: state()
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		const safe = (data.title || "actividades").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		a.href = url;
		a.download = "actividades_" + safe + ".json";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Lista de actividades exportada como .json.");
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
			if (obj && obj.kind === "gpi.activities/v1" && obj.data) {
				if (mode === "sample") stateSample = normalizeState(obj.data);
				else stateLive = normalizeState(obj.data);
				if (obj.title) document.getElementById("projectTitle").value = obj.title;
				if (obj.course) document.getElementById("courseTitle").value = obj.course;
				render();
				gpiPush();
				setStatus("Lista de actividades importada. Las actividades se enlazan a la EDT por el id de cada paquete.");
			} else showAlert("No reconocí el formato: se esperaba una exportación de esta herramienta (gpi.activities/v1).");
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
		const p11 = N(f1, "Acta de constitución"), p12 = N(f1, "Plan de gestión del proyecto");
		N(f1, "Informes de seguimiento y control");
		const f2 = N(root, "Ingeniería y Diseño");
		const p21 = N(f2, "Estudio de suelos"), p22 = N(f2, "Diseño estructural");
		N(f2, "Diseño eléctrico y sanitario");
		N(f2, "Permisos y licencias municipales");
		const f3 = N(root, "Procura");
		N(f3, "Estructuras metálicas prefabricadas");
		N(f3, "Materiales de construcción");
		N(f3, "Equipos eléctricos e instalaciones");
		const f4 = N(root, "Construcción");
		const p41 = N(f4, "Movimiento de tierras"), p42 = N(f4, "Cimentaciones"), p43 = N(f4, "Estructura y cobertura");
		N(f4, "Acabados y cerramientos");
		N(f4, "Instalaciones MEP");
		const f5 = N(root, "Pruebas y Puesta en Marcha");
		const p51 = N(f5, "Pruebas de instalaciones");
		N(f5, "Capacitación al cliente");
		N(f5, "Acta de entrega y cierre");
		return {
			rootId: root,
			idCounter: k + 1,
			nodes,
			ids: {
				p11,
				p12,
				p21,
				p22,
				p41,
				p42,
				p43,
				p51
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
		by[I.p21] = [
			A("Calicatas exploratorias", "und", 8, 2),
			A("Ensayos de laboratorio de suelos", "glb", 1, .1),
			A("Informe geotécnico", "doc", 1, .25)
		];
		by[I.p22] = [A("Memoria de cálculo estructural", "doc", 1, .1), A("Planos estructurales", "lám", 24, 2)];
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
		by[I.p51] = [A("Pruebas de tableros y circuitos eléctricos", "pto", 120, 30), A("Pruebas hidráulicas de redes sanitarias", "glb", 1, .5)];
		return {
			byLeaf: by,
			idCounter: n + 1
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
	function reportShell(docTitle, moduleName, bodyHtml) {
		const el = document.getElementById("gpiReport");
		let meta = {};
		try {
			if (window.GPI && window.GPI.available() && window.GPI.meta()) meta = window.GPI.meta();
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
		let body = (mode === "sample" ? "<p class=\"rep-note\"><b>Modo ejemplo:</b> este listado usa la EDT y las actividades didácticas, no los datos del proyecto activo.</p>" : "") + "<h2>1. Resumen</h2><table class=\"rep-kv\"><tr><td>Actividades definidas</td><td><b>" + s.total + "</b></td></tr><tr><td>Cobertura de paquetes de trabajo</td><td>" + s.covered + " de " + s.leaves + " paquetes con actividades (<b>" + s.pct + "%</b>)</td></tr>" + (s.orphans ? "<tr><td>Actividades huérfanas</td><td>⚠ " + s.orphans + " (su paquete ya no existe en la EDT)</td></tr>" : "") + "</table><h2>2. Listado de actividades y metrados</h2><p class=\"rep-note\">Numeración estilo MS Project: la fila 0 es la tarea resumen del proyecto y el N.º corre consecutivo por todas las filas. Cada actividad hereda el código EDT de su paquete más un correlativo. La duración es un valor calculado: Dur = Met ÷ (#Eq × R), donde R es el rendimiento diario de un equipo y #Eq el número de equipos en paralelo, redondeada al entero superior.</p><table><tr><th style=\"width:6%\">N.º</th><th style=\"width:9%\">Código EDT</th><th>Paquete de trabajo / Actividad</th><th style=\"width:7%\">Unidad</th><th style=\"width:9%\">Metrado</th><th style=\"width:9%\">Rend. (R)</th><th style=\"width:6%\">#Eq</th><th style=\"width:8%\">Dur. (d)</th></tr>";
		const repRows = fullRows();
		if (!repRows.length) body += "<tr><td colspan=\"8\" class=\"rep-note\">— Sin EDT cargada —</td></tr>";
		repRows.forEach((r) => {
			if (r.kind === "project") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">0</td><td class=\"num rep-phase\">0</td><td class=\"rep-phase\" colspan=\"6\">" + esc(r.name) + " <span class=\"rep-note\">(tarea resumen del proyecto)</span></td></tr>";
			else if (r.kind === "phase") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-phase\">" + esc(r.code) + "</td><td class=\"rep-phase\" colspan=\"6\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") body += "<tr><td class=\"num rep-pkg\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-pkg\">" + esc(r.code) + "</td><td class=\"rep-pkg\">" + esc(r.name) + "</td><td class=\"rep-pkg\" colspan=\"5\">" + (r.count ? r.count + " actividad(es)" : "<span class=\"rep-note\">sin actividades</span>") + "</td></tr>";
			else body += "<tr><td class=\"num\" style=\"text-align:center\">" + r.n + "</td><td class=\"num\">" + esc(r.code) + "</td><td>" + (r.name ? esc(r.name) : "<span class=\"rep-note\">— sin nombre —</span>") + "</td><td>" + esc(r.unit || "—") + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.qty) + "</td><td class=\"num\" style=\"text-align:right\">" + fmtQty(r.perf) + "</td><td class=\"num\" style=\"text-align:center\">" + esc(String(Math.max(1, numVal(r.teams) || 1))) + "</td><td class=\"num\" style=\"text-align:center\"><b>" + (r.dur == null ? "—" : r.dur) + "</b></td></tr>";
		});
		body += "</table>";
		reportShell("Listado de Actividades y Metrados", "Definir las Actividades · Gestión del Cronograma", body);
	}
	function xmlEsc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
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
	function excelRowModel() {
		const out = [[
			"N.º",
			"EDT",
			"Nivel de esquema",
			"Nombre",
			"Unidad",
			"Metrado",
			"Rendimiento (R)",
			"N.º de equipos",
			"Duración (días)"
		].map((h) => ({
			v: h,
			t: "s",
			s: 1
		}))];
		fullRows().forEach((r) => {
			const ind = Math.min(9, r.level - 1);
			const nameStyle = r.kind === "project" ? 25 : r.kind === "activity" ? 5 + ind : 15 + ind;
			const qtyNum = numVal(r.qty);
			out.push([
				{
					v: r.n,
					t: "n",
					s: 2
				},
				{
					v: r.code,
					t: "s",
					s: 2
				},
				{
					v: r.level,
					t: "n",
					s: 2
				},
				{
					v: r.name || "",
					t: "s",
					s: nameStyle
				},
				{
					v: r.kind === "activity" ? r.unit || "" : "",
					t: "s",
					s: 2
				},
				r.kind === "activity" && r.qty !== "" && isFinite(qtyNum) ? {
					v: qtyNum,
					t: "n",
					s: 3
				} : null,
				r.kind === "activity" && r.perf !== "" && isFinite(numVal(r.perf)) ? {
					v: numVal(r.perf),
					t: "n",
					s: 3
				} : null,
				r.kind === "activity" ? {
					v: Math.max(1, numVal(r.teams) || 1),
					t: "n",
					s: 2
				} : null,
				r.kind === "activity" && r.dur != null ? {
					v: r.dur,
					t: "n",
					s: 2
				} : null
			]);
		});
		return out;
	}
	function excelInstructions() {
		return [
			["Cómo llevar esta tabla a MS Project", 25],
			["", 0],
			["RUTA A — Importar con jerarquía automática (recomendada)", 15],
			["1. En MS Project: Archivo > Abrir > Examinar. En el tipo de archivo elige “Libro de Excel (*.xlsx)” y abre este archivo.", 4],
			["2. En el Asistente para importación: Nueva asignación > Importar como proyecto nuevo > marca “Tareas” y “La importación incluye encabezados”.", 4],
			["3. Elige la hoja “EDT y Actividades” y asigna los campos: Nombre → Nombre · Nivel de esquema → Nivel de esquema.", 4],
			["   Muy recomendado: Duración (días) → Duración — las actividades entran ya con su duración calculada (Met ÷ (#Eq × R), redondeada al entero superior) y Project resume solo las fases.", 4],
			["   Opcional: Unidad → Texto1 · Metrado → Número1 · Rendimiento → Número2 · N.º de equipos → Número3 · EDT → Texto2 (la columna N.º puedes omitirla).", 4],
			["4. Finalizar. MS Project reconstruye toda la jerarquía usando el Nivel de esquema y el orden de las filas: el proyecto (nivel 1) queda como tarea resumen y bajo él las fases, paquetes y actividades.", 4],
			["   Nota: la numeración EDT que genera Project coincidirá con la columna EDT de este libro porque el orden es el mismo.", 4],
			["", 0],
			["RUTA B — Copiar y pegar", 15],
			["1. Copia SOLO las celdas de la columna “Nombre” (sin el encabezado).", 4],
			["2. En MS Project, haz clic en la primera celda de “Nombre de tarea” y pega (Ctrl+V).", 4],
			["3. Importante: al pegar desde Excel las tareas entran en lista PLANA (Project solo conserva el esquema al pegar desde Word). Usa la columna “Nivel de esquema” como guía y aplica sangría con Alt+Mayús+→ (nivel 2 = una sangría bajo el proyecto, nivel 3 = dos, etc.).", 4],
			["", 0],
			["Después de importar", 15],
			["• Si mapeaste “Duración (días)”, las actividades ya llegan con su duración calculada por rendimiento de cuadrillas; ajusta R y #Eq en el simulador si necesitas otra duración.", 4],
			["• Vincula las actividades (predecesoras) para construir la red del cronograma y obtener la ruta crítica.", 4],
			["• La Unidad y el Metrado (Texto1 / Número1 si los importaste) son la base para estimar duraciones y recursos de cada partida.", 4],
			["", 0],
			["Generado por el simulador GPI — módulo Definir las Actividades.", 4]
		].map((row) => [{
			v: row[0],
			t: "s",
			s: row[1] === 25 ? 25 : row[1] === 15 ? 16 : 4
		}]);
	}
	async function buildXlsxBlob() {
		const zip = new window.JSZip();
		zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
		zip.file("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
		zip.file("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"EDT y Actividades\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Instrucciones\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
		zip.file("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
		zip.file("xl/styles.xml", xlsxStylesXml());
		zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(excelRowModel(), [
			6,
			10,
			15,
			58,
			9,
			11,
			14,
			12,
			13
		], true));
		zip.file("xl/worksheets/sheet2.xml", xlsxSheetXml(excelInstructions(), [115], false));
		return zip.generateAsync({
			type: "blob",
			mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		});
	}
	function buildCsv() {
		function cell(v) {
			const s = String(v == null ? "" : v);
			return /[";\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
		}
		const lines = [[
			"N.º",
			"EDT",
			"Nivel de esquema",
			"Nombre",
			"Unidad",
			"Metrado",
			"Rendimiento (R)",
			"N.º de equipos",
			"Duración (días)"
		].join(";")];
		fullRows().forEach((r) => {
			const isAct = r.kind === "activity";
			lines.push([
				r.n,
				r.code,
				r.level,
				cell(r.name || ""),
				isAct ? cell(r.unit || "") : "",
				isAct ? isFinite(numVal(r.qty)) ? numVal(r.qty) : "" : "",
				isAct ? isFinite(numVal(r.perf)) ? numVal(r.perf) : "" : "",
				isAct ? Math.max(1, numVal(r.teams) || 1) : "",
				isAct && r.dur != null ? r.dur : ""
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
	async function exportExcel() {
		if (!fullRows().length) {
			await showAlert("No hay EDT cargada: construye la estructura en WBS Builder (o entra al modo ejemplo) antes de exportar.");
			return;
		}
		const safe = (document.getElementById("projectTitle").value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		if (window.JSZip) try {
			downloadBlob(await buildXlsxBlob(), "actividades_msproject_" + safe + ".xlsx");
			setStatus("Excel exportado. En MS Project: Archivo > Abrir > este libro (la hoja Instrucciones trae el paso a paso).");
			return;
		} catch (e) {}
		downloadBlob(new Blob(["﻿" + buildCsv()], { type: "text/csv;charset=utf-8" }), "actividades_msproject_" + safe + ".csv");
		setStatus("No se pudo cargar la librería de Excel (¿sin conexión?): exporté un CSV equivalente (separado por «;») que MS Project también importa con el mismo mapa de campos.");
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
		document.getElementById("btnExcel").addEventListener("click", exportExcel);
		document.getElementById("btnReport").addEventListener("click", buildReport);
		document.getElementById("btnPrint").addEventListener("click", () => {
			window.print();
		});
		document.getElementById("btnSample").addEventListener("click", enterSample);
		document.getElementById("btnLive").addEventListener("click", enterLive);
		document.getElementById("btnClear").addEventListener("click", async () => {
			const s = stats();
			if (!await showConfirm("Se eliminarán las " + (s.total + s.orphans) + " actividades de la lista actual" + (mode === "sample" ? " (modo ejemplo)" : "") + ". La EDT no se toca. ¿Continuar?", "Limpiar actividades")) return;
			if (mode === "sample") stateSample = {
				byLeaf: {},
				idCounter: 1
			};
			else stateLive = {
				byLeaf: {},
				idCounter: 1
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
		wireTableDelegation();
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
