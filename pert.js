(function() {
	//#region src/modules/pert/main.ts
	var mode = "live";
	var stateLive = {
		byActivity: {},
		inputMode: "dias"
	};
	var stateSample = null;
	var wbsLive = null;
	var actsLive = null;
	function state() {
		return mode === "sample" ? stateSample : stateLive;
	}
	function wbsData() {
		return mode === "sample" ? SAMPLE_WBS : wbsLive;
	}
	function actsData() {
		return mode === "sample" ? SAMPLE_ACTS : actsLive;
	}
	function pe(actId) {
		const st = state();
		if (!st.byActivity[actId]) st.byActivity[actId] = {
			o: "",
			m: "",
			mAuto: true,
			p: ""
		};
		return st.byActivity[actId];
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
			const e = src[k] || {};
			by[k] = {
				o: e.o == null ? "" : e.o,
				m: e.m == null ? "" : e.m,
				mAuto: e.mAuto !== false,
				p: e.p == null ? "" : e.p
			};
		});
		return {
			byActivity: by,
			inputMode: obj.inputMode === "pct" ? "pct" : "dias"
		};
	}
	function fmt(v, dec) {
		return v == null || !isFinite(v) ? "—" : Number(v).toLocaleString("es-PE", {
			minimumFractionDigits: 0,
			maximumFractionDigits: dec
		});
	}
	function round2(v) {
		return Math.round(v * 100) / 100;
	}
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
	function showConfirm(m, t) {
		return showModal({
			title: t || "Confirmar acción",
			message: m,
			confirmText: "Continuar",
			cancelText: "Cancelar"
		});
	}
	function showAlert(m, t) {
		return showModal({
			title: t || "Aviso",
			message: m,
			confirmText: "Entendido",
			cancelText: null
		});
	}
	function treeRows() {
		const w = wbsData(), out = [];
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
	function calc(a) {
		const e = state().byActivity[a.id] || {
			o: "",
			m: "",
			mAuto: true,
			p: ""
		};
		const dur = durActivity(a);
		const m = e.mAuto !== false && dur != null ? dur : isFinite(numVal(e.m)) ? numVal(e.m) : null;
		const mAuto = e.mAuto !== false;
		const oRaw = numVal(e.o), pRaw = numVal(e.p);
		const pct = state().inputMode === "pct";
		const o = isFinite(oRaw) ? pct ? m != null ? oRaw / 100 * m : null : oRaw : null;
		const p = isFinite(pRaw) ? pct ? m != null ? pRaw / 100 * m : null : pRaw : null;
		const complete = o != null && m != null && p != null && o > 0;
		const valid = complete && o <= m && m <= p;
		let te = null, sd = null, va = null;
		if (complete) {
			te = (o + 4 * m + p) / 6;
			sd = (p - o) / 6;
			va = sd * sd;
		}
		return {
			entry: e,
			dur,
			m,
			mAuto,
			oDays: o,
			pDays: p,
			te,
			sd,
			va,
			complete,
			valid
		};
	}
	function fullRows() {
		const acts = actsData(), out = [];
		const w = wbsData();
		if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
		const byLeaf = acts && acts.byLeaf || {};
		let n = 0;
		const rootName = (w.nodes[w.rootId].name || "").trim() || document.getElementById("projectTitle").value || "Proyecto";
		out.push({
			kind: "project",
			n: n++,
			code: "0",
			name: rootName
		});
		treeRows().forEach((r) => {
			if (r.kind === "phase") {
				out.push({
					kind: "phase",
					n: n++,
					code: r.code,
					name: r.name,
					depth: r.depth
				});
				return;
			}
			const list = byLeaf[r.id] || [];
			out.push({
				kind: "package",
				n: n++,
				code: r.code,
				name: r.name,
				depth: r.depth,
				count: list.length
			});
			list.forEach((a, i) => {
				out.push({
					kind: "activity",
					n: n++,
					code: r.code + "." + (i + 1),
					a,
					c: calc(a)
				});
			});
		});
		return out;
	}
	var actsCache = [];
	var selAnchor = null;
	var selEnd = null;
	var PASTE_FIELDS = [
		"o",
		"m",
		"p"
	];
	function render() {
		const chip = document.getElementById("modeChip");
		chip.textContent = mode === "sample" ? "MODO EJEMPLO" : "Actividades del proyecto";
		chip.className = "mode-chip " + (mode === "sample" ? "sample" : "live");
		document.getElementById("btnSample").style.display = mode === "sample" ? "none" : "";
		document.getElementById("btnLive").style.display = mode === "sample" ? "" : "none";
		document.getElementById("btnReload").disabled = mode === "sample";
		document.getElementById("inputModeSel").value = state().inputMode;
		const pctMode = state().inputMode === "pct";
		document.getElementById("thO").textContent = pctMode ? "O (% M)" : "O (días)";
		document.getElementById("thP").textContent = pctMode ? "P (% M)" : "P (días)";
		document.getElementById("thO").title = pctMode ? "Optimista como porcentaje de M (85 = 85% de M)" : "Duración optimista, en días";
		document.getElementById("thP").title = pctMode ? "Pesimista como porcentaje de M (140 = 140% de M)" : "Duración pesimista, en días";
		renderTable();
		renderSidebar();
		renderProbability();
		renderOrphans();
	}
	function renderTable() {
		const tbody = document.getElementById("actsBody");
		const empty = document.getElementById("emptyState");
		const rows = fullRows();
		actsCache = rows.filter((r) => r.kind === "activity");
		selAnchor = null;
		selEnd = null;
		const hasActs = actsCache.length > 0;
		if (!rows.length || !hasActs) {
			tbody.innerHTML = "";
			empty.style.display = "";
			empty.innerHTML = mode === "live" ? "<b>El proyecto aún no tiene actividades.</b><br>El análisis PERT trabaja sobre las actividades definidas (con sus metrados y rendimientos) en Definir las Actividades.<br><a class=\"btn\" href=\"Activity_Definition.html\">☰ Abrir Definir las Actividades</a><button class=\"btn primary\" id=\"btnSampleInner\">Explorar con el modo ejemplo</button>" : "<b>Sin actividades de ejemplo.</b>";
			const bi = document.getElementById("btnSampleInner");
			if (bi) bi.addEventListener("click", enterSample);
			return;
		}
		empty.style.display = "none";
		const pct = state().inputMode === "pct";
		let html = "";
		rows.forEach((r) => {
			if (r.kind === "project") html += "<tr class=\"proj-row\"><td class=\"n-cell\">0</td><td class=\"code-cell\" style=\"color:var(--ink-1)\">0</td><td colspan=\"7\">" + esc(r.name) + "</td><td style=\"text-align:center\"><span class=\"proj-hint\">Fila 0</span></td></tr>";
			else if (r.kind === "phase") html += "<tr class=\"phase-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"code-cell\">" + esc(r.code) + "</td><td colspan=\"8\" style=\"padding-left:" + (10 + Math.max(0, r.depth - 1) * 16) + "px\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") html += "<tr class=\"pkg-row\"><td class=\"n-cell\">" + r.n + "</td><td class=\"pk-code\">" + esc(r.code) + "</td><td colspan=\"8\" style=\"padding-left:" + (8 + Math.max(0, r.depth - 1) * 16) + "px\"><span class=\"pk-name\">" + esc(r.name) + "</span><span class=\"pk-count\">" + r.count + " act.</span></td></tr>";
			else {
				const a = r.a, c = r.c, e = c.entry;
				const mShown = c.mAuto ? c.dur == null ? "" : c.dur : e.m;
				html += "<tr class=\"act-row" + (c.complete && !c.valid ? " row-invalid\" title=\"Terna inválida: debe cumplirse O ≤ M ≤ P (en días). Corrige los valores.\"" : "\"") + " data-act=\"" + esc(a.id) + "\"><td class=\"n-cell\">" + r.n + "</td><td class=\"act-code\">" + esc(r.code) + "</td><td><span class=\"act-name\">" + esc(a.name || "— sin nombre —") + "</span><span class=\"act-unit\">" + esc(a.unit || "") + (a.qty ? " · " + esc(a.qty) : "") + "</span></td><td class=\"durbase\" title=\"Met ÷ (#Eq × R) del módulo Definir las Actividades\">" + (c.dur == null ? "—" : c.dur) + "</td><td class=\"in-cell\"><input data-act=\"" + esc(a.id) + "\" data-f=\"o\" value=\"" + esc(e.o) + "\" inputmode=\"decimal\" placeholder=\"" + (pct ? "% M" : "días") + "\"></td><td class=\"in-cell\"><input data-act=\"" + esc(a.id) + "\" data-f=\"m\" class=\"" + (c.mAuto ? "m-auto" : "") + "\" value=\"" + esc(mShown) + "\" inputmode=\"decimal\" title=\"" + (c.mAuto ? "M automática: sigue a la Dur base. Escribe para fijarla; bórrala para volver al automático." : "M fijada a mano. Borra el valor para que vuelva a seguir a la Dur base.") + "\"></td><td class=\"in-cell\"><input data-act=\"" + esc(a.id) + "\" data-f=\"p\" value=\"" + esc(e.p) + "\" inputmode=\"decimal\" placeholder=\"" + (pct ? "% M" : "días") + "\"></td><td class=\"der-cell" + (c.te == null ? " empty" : "") + "\" data-der=\"te\">" + fmt(c.te, 1) + "</td><td class=\"der-cell" + (c.sd == null ? " empty" : "") + "\" data-der=\"sd\">" + fmt(c.sd, 2) + "</td><td class=\"der-cell" + (c.va == null ? " empty" : "") + "\" data-der=\"va\">" + fmt(c.va, 2) + "</td></tr>";
			}
		});
		tbody.innerHTML = html;
	}
	function refreshRow(actId) {
		const row = document.querySelector("#actsBody tr[data-act=\"" + actId + "\"]");
		if (!row) return;
		let a = null;
		for (let i = 0; i < actsCache.length; i++) if (actsCache[i].a.id === actId) {
			a = actsCache[i].a;
			actsCache[i].c = calc(a);
			break;
		}
		if (!a) return;
		const c = calc(a);
		const set = (key, val, dec) => {
			const td = row.querySelector("[data-der=\"" + key + "\"]");
			if (td) {
				td.textContent = fmt(val, dec);
				td.className = "der-cell" + (val == null ? " empty" : "");
			}
		};
		set("te", c.te, 1);
		set("sd", c.sd, 2);
		set("va", c.va, 2);
		row.classList.toggle("row-invalid", !!(c.complete && !c.valid));
		row.title = c.complete && !c.valid ? "Terna inválida: debe cumplirse O ≤ M ≤ P (en días). Corrige los valores." : "";
		const mInp = row.querySelector("input[data-f=\"m\"]");
		if (mInp) {
			mInp.classList.toggle("m-auto", c.mAuto);
			if (c.mAuto && document.activeElement !== mInp) mInp.value = c.dur == null ? "" : String(c.dur);
		}
	}
	function stats() {
		let complete = 0, invalid = 0, sumTe = 0, sumVar = 0, sumDur = 0;
		actsCache.forEach((r) => {
			const c = calc(r.a);
			if (c.dur != null) sumDur += c.dur;
			if (c.complete) {
				complete++;
				if (!c.valid) invalid++;
				else {
					sumTe += c.te;
					sumVar += c.va;
				}
			}
		});
		return {
			total: actsCache.length,
			complete,
			invalid,
			sumTe,
			sumVar,
			sumDur
		};
	}
	function renderSidebar() {
		const s = stats();
		document.getElementById("sbTotal").textContent = String(s.complete);
		document.getElementById("sbCov").textContent = s.complete + "/" + s.total + " actividades";
		const pctv = s.total ? Math.round(s.complete / s.total * 100) : 0;
		document.getElementById("sbPct").textContent = pctv + "%";
		const bar = document.getElementById("sbBar");
		bar.style.width = pctv + "%";
		bar.style.background = s.invalid ? "var(--danger)" : pctv >= 100 ? "var(--good)" : pctv >= 50 ? "var(--warn)" : "var(--pe-a)";
		const inv = document.getElementById("sbInvalid");
		if (s.invalid) {
			inv.style.display = "";
			inv.textContent = "⚠ " + s.invalid + " terna(s) inválida(s): revisa que O ≤ M ≤ P (filas en rojo).";
		} else inv.style.display = "none";
		document.getElementById("sbSumDur").textContent = s.sumDur ? fmt(s.sumDur, 0) + " d" : "—";
		document.getElementById("sbSumTe").textContent = s.complete - s.invalid > 0 ? fmt(s.sumTe, 1) + " d" : "—";
		document.getElementById("sbSumVar").textContent = s.complete - s.invalid > 0 ? fmt(s.sumVar, 2) : "—";
	}
	function scheduleLinks() {
		if (mode === "sample") return SAMPLE_LINKS;
		try {
			const sc = window.GPI && window.GPI.getModule ? window.GPI.getModule("schedule") : null;
			return sc && Array.isArray(sc.links) ? sc.links : [];
		} catch (e) {
			return [];
		}
	}
	function criticalPathStats() {
		if (!window.GPI || !window.GPI.util || !window.GPI.util.cpm) return null;
		const links = scheduleLinks();
		if (!links.length) return { reason: "no-links" };
		const byId = {};
		const nodes = [];
		let anyInvalid = 0, missing = 0, teCount = 0;
		actsCache.forEach((r) => {
			const c = r.c, useTe = c.complete && c.valid;
			if (c.complete && !c.valid) anyInvalid++;
			if (!c.complete) missing++;
			const d = useTe ? c.te : c.dur != null ? c.dur : c.m != null ? c.m : 0;
			byId[r.a.id] = {
				te: d,
				va: useTe ? c.va : 0,
				est: useTe
			};
			if (useTe) teCount++;
			nodes.push({
				id: r.a.id,
				dur: d
			});
		});
		if (!teCount) return { reason: "no-te" };
		let cal = null;
		try {
			cal = window.GPI.util.projectCalendar();
		} catch (e) {}
		const res = window.GPI.util.cpm(nodes, links, cal, {});
		if (!res || !res.ok) return { reason: "cycle" };
		const ids = res.criticalIds || [];
		if (!ids.length) return { reason: "no-path" };
		let te = 0, va = 0, cpNoTe = 0;
		const names = [];
		ids.forEach((id) => {
			const c = byId[id];
			if (!c) return;
			te += c.te;
			va += c.va;
			if (!c.est) cpNoTe++;
			const row = actsCache.filter((r) => r.a.id === id)[0];
			names.push((row ? row.a.name || id : id) + (c.est ? "" : " *"));
		});
		return {
			ids,
			names,
			te,
			va,
			duration: res.projectDuration,
			anyInvalid,
			missing,
			cpNoTe
		};
	}
	var targetTouched = false;
	function renderProbability() {
		const elTe = document.getElementById("sbCpTe"), elSd = document.getElementById("sbCpSd"), elZ = document.getElementById("sbCpZ"), elP = document.getElementById("sbCpProb"), elPath = document.getElementById("sbCpPath"), elT = document.getElementById("sbTarget");
		if (!elTe) return;
		function clear(msg) {
			elTe.textContent = elSd.textContent = elZ.textContent = elP.textContent = "—";
			elPath.innerHTML = msg;
		}
		const cp = criticalPathStats();
		if (!cp) {
			clear("Requiere <code>gpi-core.js</code>.");
			return;
		}
		if ("reason" in cp) {
			if (cp.reason === "no-links") {
				clear("Sin red de precedencias. Abre <b>Cronograma / CPM</b> y define las relaciones entre actividades para obtener la ruta crítica.");
				return;
			}
			if (cp.reason === "no-te") {
				clear("Ninguna actividad tiene una terna O–M–P válida todavía.");
				return;
			}
			if (cp.reason === "cycle") {
				clear("La red tiene un <b>ciclo</b>: el CPM no puede resolverse. Corrígelo en Cronograma / CPM.");
				return;
			}
			if (cp.reason === "no-path") {
				clear("No se pudo determinar la ruta crítica.");
				return;
			}
			return;
		}
		if (!targetTouched && (!elT.value || +elT.value <= 0)) elT.value = String(Math.ceil(cp.te) + 3);
		const target = +elT.value || Math.ceil(cp.te);
		const r = window.GPI.util.pertProbability(cp.te, cp.va, target);
		elTe.textContent = fmt(cp.te, 1) + " d";
		if (!r) {
			elSd.textContent = "0.0 d";
			elZ.textContent = "—";
			elP.textContent = "—";
		} else {
			elSd.textContent = fmt(r.sigma, 2) + " d";
			elZ.textContent = fmt(r.z, 2);
			const pc = r.prob * 100;
			elP.textContent = pc.toFixed(1) + "%";
			elP.style.color = pc >= 80 ? "var(--good)" : pc >= 50 ? "var(--warn)" : "var(--danger)";
		}
		let warn = "";
		if (cp.anyInvalid) warn += "<br>⚠ " + cp.anyInvalid + " terna(s) inválida(s) (debe cumplirse O ≤ M ≤ P).";
		if (cp.missing) warn += "<br>⚠ " + cp.missing + " actividad(es) sin terna completa.";
		if (cp.cpNoTe) warn += "<br>⚠ " + cp.cpNoTe + " actividad(es) de la ruta crítica (marcadas con *) entraron con su duración base y aportan σ² = 0: la probabilidad está <b>sobrestimada</b> hasta que completes su terna.";
		elPath.innerHTML = "<b>Ruta crítica (" + cp.ids.length + " act.):</b> " + cp.names.map(esc).join(" → ") + warn;
	}
	function renderOrphans() {
		const st = state(), ids = {};
		actsCache.forEach((r) => {
			ids[r.a.id] = true;
		});
		const orphan = Object.keys(st.byActivity).filter((k) => {
			const e = st.byActivity[k];
			return (e.o !== "" || e.p !== "" || e.mAuto === false) && !ids[k];
		});
		const bn = document.getElementById("orphanBanner");
		if (!orphan.length) {
			bn.classList.remove("show");
			bn.innerHTML = "";
			return;
		}
		bn.classList.add("show");
		bn.innerHTML = "<b>⚠ " + orphan.length + " terna(s) huérfana(s):</b> su actividad ya no existe en Definir las Actividades. <button class=\"btn sm danger\" id=\"btnOrphans\">Eliminar huérfanas</button>";
		document.getElementById("btnOrphans").addEventListener("click", async () => {
			if (!await showConfirm("Se eliminarán las " + orphan.length + " ternas huérfanas.", "Eliminar ternas huérfanas")) return;
			orphan.forEach((k) => {
				delete st.byActivity[k];
			});
			onDirty(true);
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
	async function switchInputMode(newMode) {
		const st = state();
		if (newMode === st.inputMode) return;
		if (!await showConfirm("Los valores de O y P ya ingresados se CONVERTIRÁN a " + (newMode === "pct" ? "porcentaje de M" : "días") + " usando la M de cada actividad, de modo que el análisis no cambia. En modo % de M, O y P escalan solos cuando la M automática cambia con los metrados. ¿Continuar?", "Cambiar el modo de ingreso")) {
			document.getElementById("inputModeSel").value = st.inputMode;
			return;
		}
		actsCache.forEach((r) => {
			const e = st.byActivity[r.a.id];
			if (!e) return;
			const c = calc(r.a);
			if (c.m == null || c.m <= 0) return;
			["o", "p"].forEach((f) => {
				const v = numVal(e[f]);
				if (!isFinite(v)) return;
				e[f] = String(newMode === "pct" ? round2(v / c.m * 100) : round2(v * c.m / 100));
			});
		});
		st.inputMode = newMode;
		onDirty(true);
		setStatus("Modo de ingreso: " + (newMode === "pct" ? "O y P como % de M (escalan con la M automática)." : "O y P en días."));
	}
	function cellCoord(el) {
		const f = PASTE_FIELDS.indexOf(el.dataset.f);
		if (f === -1) return null;
		for (let r = 0; r < actsCache.length; r++) if (actsCache[r].a.id === el.dataset.act) return {
			r,
			f
		};
		return null;
	}
	function cellInput(r, f) {
		const it = actsCache[r];
		if (!it || !PASTE_FIELDS[f]) return null;
		return document.querySelector("input[data-act=\"" + it.a.id + "\"][data-f=\"" + PASTE_FIELDS[f] + "\"]");
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
			const it = actsCache[r], c = calc(it.a), e = state().byActivity[it.a.id] || {
				o: "",
				m: "",
				p: "",
				mAuto: true
			};
			const cells = [];
			for (let f = f1; f <= f2; f++) {
				const fd = PASTE_FIELDS[f];
				const v = fd === "m" ? c.mAuto ? c.dur == null ? "" : c.dur : e.m : e[fd];
				cells.push(v == null ? "" : String(v));
			}
			lines.push(cells.join("	"));
		}
		return lines.join("\n");
	}
	function moveTo(r, f) {
		const inp = cellInput(r, f);
		if (!inp) return false;
		inp.focus();
		try {
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
	function setField(actId, f, rawVal) {
		const e = pe(actId);
		if (f === "m") {
			if (String(rawVal).trim() === "") {
				e.m = "";
				e.mAuto = true;
			} else {
				e.m = rawVal;
				e.mAuto = false;
			}
		} else e[f] = rawVal;
	}
	function wireGrid() {
		const tbody = document.getElementById("actsBody");
		tbody.addEventListener("input", (ev) => {
			const el = ev.target.closest ? ev.target.closest("input[data-act]") : null;
			if (!el) return;
			setField(el.dataset.act, el.dataset.f, el.value);
			refreshRow(el.dataset.act);
			onDirty(false);
		});
		tbody.addEventListener("keydown", (ev) => {
			const el = ev.target.closest ? ev.target.closest("input[data-act]") : null;
			if (!el) return;
			const c = cellCoord(el);
			if (!c) return;
			const e = ev;
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
		});
		tbody.addEventListener("mousedown", (ev) => {
			const el = ev.target.closest ? ev.target.closest("input[data-act]") : null;
			if (!el) return;
			if (ev.shiftKey && selAnchor) {
				ev.preventDefault();
				const c = cellCoord(el);
				if (c) {
					selEnd = c;
					paintSelection();
				}
			}
		});
		tbody.addEventListener("focusin", (ev) => {
			const el = ev.target.closest ? ev.target.closest("input[data-act]") : null;
			if (!el) return;
			const c = cellCoord(el);
			if (c) {
				selAnchor = c;
				clearSelection();
			}
		});
		tbody.addEventListener("copy", (ev) => {
			const tsv = selectionTsv();
			if (tsv == null || !ev.clipboardData) return;
			ev.clipboardData.setData("text/plain", tsv);
			ev.preventDefault();
			setStatus("Rango copiado — pégalo en Excel o en otra parte de la tabla.");
		});
		tbody.addEventListener("paste", (ev) => {
			const el = ev.target.closest ? ev.target.closest("input[data-act]") : null;
			if (!el || !ev.clipboardData) return;
			const text = ev.clipboardData.getData("text/plain") || "";
			if (text.indexOf("	") === -1 && !/\r?\n./.test(text)) return;
			ev.preventDefault();
			applyGrid(text, el);
		});
		tbody.addEventListener("contextmenu", onContextMenu);
	}
	function applyGrid(text, anchorEl) {
		const grid = text.replace(/\r/g, "").split("\n");
		while (grid.length && grid[grid.length - 1] === "") grid.pop();
		if (!grid.length) return;
		const start = cellCoord(anchorEl);
		if (!start) return;
		let applied = 0, skipped = 0;
		grid.forEach((line, ri) => {
			const target = actsCache[start.r + ri];
			if (!target) {
				skipped++;
				return;
			}
			line.split("	").forEach((raw, ci) => {
				const f = PASTE_FIELDS[start.f + ci];
				if (!f) return;
				const val = parseExcelNum(raw);
				if (val === null) {
					if (String(raw).trim()) skipped++;
					return;
				}
				if (val === "") return;
				setField(target.a.id, f, val);
				applied++;
			});
		});
		onDirty(true);
		setStatus("Pegado desde Excel: " + applied + " valor(es)" + (skipped ? " · " + skipped + " celda(s) omitida(s)" : "") + ".");
	}
	function onContextMenu(ev) {
		const el = ev.target.closest ? ev.target.closest("input[data-act]") : null;
		if (!el) return;
		ev.preventDefault();
		el.focus();
		const actId = el.dataset.act;
		const e = state().byActivity[actId];
		const menu = document.getElementById("ctxMenu");
		const canRead = !!(navigator.clipboard && navigator.clipboard.readText);
		menu.innerHTML = "<div class=\"ctx-item" + (canRead ? "" : " disabled") + "\" data-cmd=\"paste\">📋 Pegar desde Excel aquí" + (canRead ? "" : " <span style=\"font-weight:500\">(usa Ctrl+V)</span>") + "</div><div class=\"ctx-item" + (!!(selAnchor && selEnd) ? "" : " disabled") + "\" data-cmd=\"copyRange\">⧉ Copiar rango seleccionado</div><div class=\"ctx-item\" data-cmd=\"copyTable\">⧉ Copiar toda la tabla</div><div class=\"ctx-sep\"></div><div class=\"ctx-item" + (e && e.mAuto === false ? "" : " disabled") + "\" data-cmd=\"mAuto\">↺ M automática (volver a seguir la Dur)</div><div class=\"ctx-item\" data-cmd=\"clearRow\">✕ Limpiar O/M/P de esta actividad</div>";
		menu.classList.add("open");
		const x = Math.min(ev.clientX, window.innerWidth - menu.offsetWidth - 8);
		const y = Math.min(ev.clientY, window.innerHeight - menu.offsetHeight - 8);
		menu.style.left = x + "px";
		menu.style.top = y + "px";
		menu.onclick = async (me) => {
			const item = me.target.closest(".ctx-item");
			if (!item || item.classList.contains("disabled")) return;
			hideCtx();
			const cmd = item.dataset.cmd;
			if (cmd === "paste") try {
				const text = await navigator.clipboard.readText();
				if (!text || text.indexOf("	") === -1 && !/\r?\n./.test(text)) {
					const v = parseExcelNum(text);
					if (v !== null && v !== "") {
						setField(actId, el.dataset.f, v);
						onDirty(true);
						setStatus("Valor pegado.");
					} else await showAlert("El portapapeles no contiene datos de celdas. Copia un bloque en Excel y vuelve a intentar (o usa Ctrl+V).");
					return;
				}
				applyGrid(text, el);
			} catch (_) {
				await showAlert("El navegador no permitió leer el portapapeles desde el menú. Usa Ctrl+V directamente sobre la celda: funciona igual.");
			}
			else if (cmd === "copyRange") copyText(selectionTsv(), "Rango copiado al portapapeles.");
			else if (cmd === "copyTable") copyWholeTable();
			else if (cmd === "mAuto") {
				setField(actId, "m", "");
				onDirty(true);
				setStatus("M vuelve al modo automático: seguirá a la Dur base cuando cambien metrados o rendimientos.");
			} else if (cmd === "clearRow") {
				delete state().byActivity[actId];
				onDirty(true);
				setStatus("Terna O/M/P limpiada — M queda en automático.");
			}
		};
	}
	function hideCtx() {
		const m = document.getElementById("ctxMenu");
		m.classList.remove("open");
		m.onclick = null;
	}
	document.addEventListener("click", (e) => {
		if (!e.target.closest || !e.target.closest("#ctxMenu")) hideCtx();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") hideCtx();
	});
	window.addEventListener("scroll", hideCtx, true);
	function copyText(text, okMsg) {
		if (text == null) return;
		function done() {
			setStatus(okMsg);
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
	function copyWholeTable() {
		const rows = fullRows();
		if (!rows.length) {
			setStatus("No hay tabla que copiar.");
			return;
		}
		const pct = state().inputMode === "pct";
		const lines = ["Id.	EDT	Actividad	Dur base	O" + (pct ? " (%M)" : " (días)") + "	M (días)	P" + (pct ? " (%M)" : " (días)") + "	TE	σ	σ²"];
		rows.forEach((r) => {
			if (r.kind === "activity") {
				const c = r.c, e = c.entry;
				lines.push([
					r.n,
					r.code,
					r.a.name || "",
					c.dur == null ? "" : c.dur,
					e.o,
					c.mAuto ? c.dur == null ? "" : c.dur : e.m,
					e.p,
					c.te == null ? "" : round2(c.te),
					c.sd == null ? "" : round2(c.sd),
					c.va == null ? "" : round2(c.va)
				].join("	"));
			} else lines.push([
				r.n,
				r.code,
				r.name,
				"",
				"",
				"",
				"",
				"",
				"",
				""
			].join("	"));
		});
		copyText(lines.join("\n"), "Tabla copiada al portapapeles (" + rows.length + " filas + encabezado): pégala en Excel con Ctrl+V.");
	}
	function exportJson() {
		const data = {
			kind: "gpi.pert/v1",
			title: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value,
			data: state()
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		const safe = (data.title || "pert").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		a.href = url;
		a.download = "pert_" + safe + ".json";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Análisis PERT exportado como .json.");
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
			if (obj && obj.kind === "gpi.pert/v1" && obj.data) {
				if (mode === "sample") stateSample = normalizeState(obj.data);
				else stateLive = normalizeState(obj.data);
				if (obj.title) document.getElementById("projectTitle").value = obj.title;
				if (obj.course) document.getElementById("courseTitle").value = obj.course;
				render();
				gpiPush();
				setStatus("Análisis PERT importado (las ternas se enlazan por el id de cada actividad).");
			} else showAlert("No reconocí el formato: se esperaba una exportación de esta herramienta (gpi.pert/v1).");
		};
		r.readAsText(file);
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
		const pct = state().inputMode === "pct";
		let body = (mode === "sample" ? "<p class=\"rep-note\"><b>Modo ejemplo:</b> este análisis usa las actividades didácticas, no los datos del proyecto activo.</p>" : "") + "<h2>1. Resumen del análisis</h2><table class=\"rep-kv\"><tr><td>Actividades con terna O–M–P</td><td><b>" + s.complete + "</b> de " + s.total + (s.invalid ? " · <b style=\"color:#c0273f\">" + s.invalid + " inválida(s) (O ≤ M ≤ P roto)</b>" : "") + "</td></tr><tr><td>Modo de ingreso de O y P</td><td>" + (pct ? "Porcentaje de M (escalan con la M automática)" : "Días") + "</td></tr><tr><td>Σ Dur base (determinística)</td><td>" + fmt(s.sumDur, 0) + " días</td></tr><tr><td>Σ TE (esperada PERT)</td><td><b>" + fmt(s.sumTe, 1) + " días</b> — suma simple de todas las actividades válidas</td></tr><tr><td>Σ σ² (varianza)</td><td>" + fmt(s.sumVar, 2) + "</td></tr><tr><td>Probabilidad de cumplimiento</td><td>Pendiente de la ruta crítica: se activa con el módulo Cronograma/CPM (Z = (plazo − ΣTE) / √Σσ² sobre la ruta).</td></tr></table><h2>2. Análisis por actividad</h2><p class=\"rep-note\">TE = (O + 4M + P) / 6 · σ = (P − O) / 6 · σ² = σ². La M automática sigue a la duración determinística Dur = Met ÷ (#Eq × R) del módulo Definir las Actividades; las M fijadas a mano se marcan con *. Valores de O/M/P mostrados en días. El Id de cada fila coincide con el de Cronograma/CPM siempre, y con el de Definir las Actividades/Estimar los Costos hasta el primer hito del proyecto (este análisis no incluye hitos).</p><table><tr><th style=\"width:5%\">Id.</th><th style=\"width:9%\">EDT</th><th>Actividad</th><th style=\"width:7%\">Dur</th><th style=\"width:7%\">O</th><th style=\"width:7%\">M</th><th style=\"width:7%\">P</th><th style=\"width:7%\">TE</th><th style=\"width:7%\">σ</th><th style=\"width:7%\">σ²</th></tr>";
		fullRows().forEach((r) => {
			if (r.kind === "project") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">0</td><td class=\"num rep-phase\">0</td><td class=\"rep-phase\" colspan=\"8\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "phase") body += "<tr><td class=\"num rep-phase\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-phase\">" + esc(r.code) + "</td><td class=\"rep-phase\" colspan=\"8\">" + esc(r.name) + "</td></tr>";
			else if (r.kind === "package") body += "<tr><td class=\"num rep-pkg\" style=\"text-align:center\">" + r.n + "</td><td class=\"num rep-pkg\">" + esc(r.code) + "</td><td class=\"rep-pkg\" colspan=\"8\">" + esc(r.name) + "</td></tr>";
			else {
				const c = r.c, a = r.a;
				const bad = c.complete && !c.valid;
				const cls = bad ? " class=\"rep-bad\"" : "";
				body += "<tr><td" + cls + " style=\"text-align:center\" class=\"num" + (bad ? " rep-bad" : "") + "\">" + r.n + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\">" + esc(r.code) + "</td><td" + cls + ">" + esc(a.name || "—") + (bad ? " <b>⚠ O ≤ M ≤ P</b>" : "") + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\">" + (c.dur == null ? "—" : c.dur) + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\">" + fmt(c.oDays, 1) + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\">" + fmt(c.m, 1) + (c.mAuto ? "" : "*") + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\">" + fmt(c.pDays, 1) + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\"><b>" + fmt(c.te, 1) + "</b></td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\">" + fmt(c.sd, 2) + "</td><td class=\"num" + (bad ? " rep-bad" : "") + "\" style=\"text-align:center\">" + fmt(c.va, 2) + "</td></tr>";
			}
		});
		body += "</table>";
		reportShell("Análisis PERT de Duraciones", "PERT · Gestión del Cronograma", body);
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
		const f2 = N(root, "Ingeniería y Diseño");
		const p21 = N(f2, "Estudio de suelos"), p22 = N(f2, "Diseño estructural");
		const f4 = N(root, "Construcción");
		const p41 = N(f4, "Movimiento de tierras"), p42 = N(f4, "Cimentaciones"), p43 = N(f4, "Estructura y cobertura");
		return {
			rootId: root,
			idCounter: k + 1,
			nodes,
			ids: {
				p21,
				p22,
				p41,
				p42,
				p43
			}
		};
	})();
	var SAMPLE_ACTS = (function() {
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
		by[I.p21] = [A("Calicatas exploratorias", "und", 8, 2), A("Informe geotécnico", "doc", 1, .25)];
		by[I.p22] = [A("Memoria de cálculo estructural", "doc", 1, .1), A("Planos estructurales", "lám", 24, 2)];
		by[I.p41] = [
			A("Corte y excavación masiva", "m³", 4800, 320, 2),
			A("Relleno y compactación", "m³", 2100, 250),
			A("Eliminación de excedentes", "m³", 2700, 300)
		];
		by[I.p42] = [
			A("Excavación de zanjas", "m³", 620, 60, 2),
			A("Acero de refuerzo", "kg", 38500, 2500, 2),
			A("Concreto f'c=280 en zapatas", "m³", 410, 45, 2)
		];
		by[I.p43] = [A("Montaje de columnas metálicas", "und", 48, 6), A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)];
		return {
			byLeaf: by,
			idCounter: n + 1
		};
	})();
	var SAMPLE_LINKS = [
		{
			id: "L1",
			from: "a1",
			to: "a2",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L2",
			from: "a2",
			to: "a3",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L3",
			from: "a3",
			to: "a4",
			type: "SS",
			lag: 4,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L4",
			from: "a2",
			to: "a5",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L5",
			from: "a5",
			to: "a6",
			type: "SS",
			lag: 3,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L6",
			from: "a5",
			to: "a7",
			type: "SS",
			lag: 2,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L7",
			from: "a6",
			to: "a8",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L8",
			from: "a7",
			to: "a8",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L9",
			from: "a4",
			to: "a8",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L10",
			from: "a8",
			to: "a9",
			type: "FS",
			lag: 0,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L11",
			from: "a9",
			to: "a10",
			type: "SS",
			lag: 2,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L12",
			from: "a10",
			to: "a11",
			type: "FS",
			lag: 3,
			lagUnit: "d",
			source: "paste"
		},
		{
			id: "L13",
			from: "a11",
			to: "a12",
			type: "SS",
			lag: 5,
			lagUnit: "d",
			source: "paste"
		}
	];
	function samplePert() {
		return {
			inputMode: "dias",
			byActivity: {
				a1: {
					o: "3",
					m: "",
					mAuto: true,
					p: "7"
				},
				a2: {
					o: "3",
					m: "",
					mAuto: true,
					p: "6"
				},
				a3: {
					o: "8",
					m: "",
					mAuto: true,
					p: "18"
				},
				a4: {
					o: "10",
					m: "",
					mAuto: true,
					p: "20"
				},
				a5: {
					o: "6",
					m: "",
					mAuto: true,
					p: "14"
				},
				a6: {
					o: "8",
					m: "10",
					mAuto: false,
					p: "13"
				},
				a7: {
					o: "7",
					m: "",
					mAuto: true,
					p: "14"
				},
				a8: {
					o: "9",
					m: "",
					mAuto: true,
					p: "5"
				},
				a9: {
					o: "6",
					m: "",
					mAuto: true,
					p: "12"
				},
				a10: {
					o: "4",
					m: "",
					mAuto: true,
					p: "9"
				},
				a11: {
					o: "6",
					m: "",
					mAuto: true,
					p: "11"
				},
				a12: {
					o: "7",
					m: "",
					mAuto: true,
					p: "13"
				}
			}
		};
	}
	function enterSample() {
		mode = "sample";
		if (!stateSample) stateSample = samplePert();
		render();
		setStatus("Modo ejemplo: actividades y ternas didácticas (hay una terna inválida a propósito — encuéntrala).");
	}
	function enterLive() {
		mode = "live";
		render();
		setStatus("De vuelta a las actividades del proyecto.");
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
		document.getElementById("inputModeSel").addEventListener("change", (e) => {
			switchInputMode(e.target.value);
		});
		document.getElementById("btnCopyTable").addEventListener("click", copyWholeTable);
		document.getElementById("btnReport").addEventListener("click", buildReport);
		document.getElementById("btnPrint").addEventListener("click", () => {
			window.print();
		});
		document.getElementById("btnReload").addEventListener("click", () => {
			gpiPull();
			render();
			setStatus("Actividades recargadas desde el proyecto.");
		});
		document.getElementById("btnSample").addEventListener("click", enterSample);
		document.getElementById("btnLive").addEventListener("click", enterLive);
		document.getElementById("btnClear").addEventListener("click", async () => {
			if (!await showConfirm("Se eliminarán todas las ternas O/M/P del análisis actual" + (mode === "sample" ? " (modo ejemplo)" : "") + ". Las actividades no se tocan. ¿Continuar?", "Limpiar análisis")) return;
			if (mode === "sample") stateSample = {
				byActivity: {},
				inputMode: state().inputMode
			};
			else stateLive = {
				byActivity: {},
				inputMode: state().inputMode
			};
			onDirty(true);
			setStatus("Análisis PERT vacío — todas las M vuelven al modo automático.");
		});
	}
	function gpiPull() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		wbsLive = window.GPI.getModule("wbs") ?? null;
		actsLive = window.GPI.getModule("activities") ?? null;
	}
	function gpiPush() {
		if (mode === "sample") return;
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		window.GPI.setModule("pert", stateLive);
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
		wireGrid();
		if (typeof window.GPI !== "undefined" && window.GPI.available()) {
			const proj = window.GPI.active();
			if (proj) {
				if (proj.meta) {
					if (proj.meta.name) document.getElementById("projectTitle").value = proj.meta.name;
					if (proj.meta.course) document.getElementById("courseTitle").value = proj.meta.course;
				}
				gpiPull();
				const modData = window.GPI.getModule("pert");
				if (modData) stateLive = normalizeState(modData);
				setStatus("Proyecto cargado desde el Panel de Control.");
			}
			window.addEventListener("beforeunload", gpiPush);
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) gpiPush();
			});
			window.GPI.onChange(() => {
				if (mode === "live") {
					gpiPull();
					render();
				}
			});
			gpiBadge(proj ? proj.meta && proj.meta.name : "", gpiPush);
		} else {
			const bn = document.getElementById("banner");
			bn.classList.add("show");
			bn.innerHTML = "<b>Vista previa sin almacenamiento persistente.</b> Abre este archivo junto a <code>gpi-core.js</code> y los demás módulos para analizar las actividades reales del proyecto. Mientras tanto trabajas con el modo ejemplo.";
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
	document.addEventListener("input", (e) => {
		if (e.target && e.target.id === "sbTarget") {
			targetTouched = true;
			renderProbability();
		}
	});
	document.addEventListener("DOMContentLoaded", init);
	//#endregion
})();
