(function() {
	//#region src/modules/cronograma-cpm/main.ts
	var mode = "live";
	var stateLive = {
		links: [],
		linkCounter: 1,
		import: null,
		baseline: null
	};
	var stateSample = null;
	var wbsLive = null;
	var actsLive = null;
	var pertLive = null;
	var spLive = null;
	var durMode = "det";
	function state() {
		return mode === "sample" ? stateSample : stateLive;
	}
	function wbsData() {
		return mode === "sample" ? SAMPLE.wbs : wbsLive;
	}
	function actsData() {
		return mode === "sample" ? SAMPLE.acts : actsLive || {
			byLeaf: {},
			idCounter: 1
		};
	}
	function pertData() {
		return mode === "sample" ? SAMPLE.pert : pertLive;
	}
	function calData() {
		return mode === "sample" ? SAMPLE.cal : GPI.util.projectCalendar(spLive);
	}
	function metaStart() {
		if (mode === "sample") return SAMPLE.startDate;
		try {
			const m = window.GPI && window.GPI.meta && window.GPI.meta();
			return m && m.startDate || "";
		} catch (_) {
			return "";
		}
	}
	function metaName() {
		try {
			const m = window.GPI && window.GPI.meta && window.GPI.meta();
			if (m && m.name) return m.name;
		} catch (_) {}
		return document.getElementById("projectTitle").value || "Proyecto";
	}
	var GPI = window.GPI;
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
	function nz(x) {
		return x != null && String(x).trim() !== "";
	}
	function fmt(n) {
		if (n == null || n === "") return "—";
		const r = Math.round(n * 100) / 100;
		return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : String(r);
	}
	function showModalHTML(opts) {
		return new Promise((resolve) => {
			const ov = document.getElementById("modalOverlay");
			const card = ov.querySelector(".modal-card");
			card.className = "modal-card" + (opts.wide ? " wide" : "");
			document.getElementById("modalTitle").textContent = opts.title || "";
			const msg = document.getElementById("modalMsg");
			if (opts.html !== void 0) msg.innerHTML = opts.html;
			else msg.textContent = opts.message || "";
			const ok = document.getElementById("modalOk"), cancel = document.getElementById("modalCancel");
			ok.textContent = opts.confirmText || "Aceptar";
			ok.className = "btn " + (opts.danger ? "danger" : "primary");
			ok.style.display = opts.confirmText === null ? "none" : "";
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
			}
			ok.onclick = () => {
				if (opts.collect) resolve(opts.collect());
				else done(true);
				if (opts.collect) {
					ov.classList.remove("open");
					document.removeEventListener("keydown", key);
				}
			};
			cancel.onclick = () => {
				done(false);
			};
			ov.onclick = (e) => {
				if (e.target === ov) done(false);
			};
			document.addEventListener("keydown", key);
			ov.classList.add("open");
			if (opts.afterOpen) opts.afterOpen(card);
			else ok.focus();
		});
	}
	function showConfirm(message, title) {
		return showModalHTML({
			title: title || "Confirmar acción",
			message,
			confirmText: "Continuar",
			cancelText: "Cancelar"
		});
	}
	function showAlert(message, title) {
		return showModalHTML({
			title: title || "Aviso",
			message,
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
	function pertIndex() {
		const idx = {};
		try {
			(GPI.util.pertStats(pertData(), actsData(), wbsData()).rows || []).forEach((r) => {
				idx[r.id] = {
					dur: r.dur,
					te: r.te,
					variance: r.variance,
					valid: r.valid
				};
			});
		} catch (_) {}
		return idx;
	}
	function fullRowsSnapshot() {
		const w = wbsData(), act = actsData(), idx = pertIndex(), out = [];
		if (!w || !w.nodes || !w.rootId || !w.nodes[w.rootId]) return out;
		let n = 0;
		const rootName = (w.nodes[w.rootId].name || "").trim() || metaName() || "Proyecto";
		out.push({
			netId: n++,
			kind: "project",
			code: "0",
			name: rootName,
			activityId: null
		});
		treeRows().forEach((r) => {
			if (r.kind === "phase") out.push({
				netId: n++,
				kind: "summary",
				subkind: "phase",
				code: r.code,
				name: r.name,
				depth: r.depth,
				activityId: null
			});
			else {
				out.push({
					netId: n++,
					kind: "summary",
					subkind: "package",
					code: r.code,
					name: r.name,
					depth: r.depth,
					activityId: null
				});
				((act.byLeaf || {})[r.id] || []).forEach((a, i) => {
					const info = idx[a.id] || {};
					out.push({
						netId: n++,
						kind: "activity",
						code: r.code + "." + (i + 1),
						name: a.name || "",
						activityId: a.id,
						leafId: r.id,
						det: info.dur,
						te: info.te,
						variance: info.variance,
						pertValid: info.valid
					});
				});
			}
		});
		return out;
	}
	function scheduleNodes(snapshot) {
		return snapshot.filter((r) => r.kind === "activity").map((r) => {
			const d = durMode === "pert" && r.te != null ? r.te : r.det != null ? r.det : 0;
			return {
				id: r.activityId,
				dur: d,
				det: r.det,
				te: r.te,
				hasDur: r.det != null || r.te != null
			};
		});
	}
	function netMap(snap) {
		const m = {};
		snap.forEach((r) => {
			if (r.activityId) m[r.activityId] = r.netId;
		});
		return m;
	}
	function nameOf(snap) {
		const m = {};
		snap.forEach((r) => {
			if (r.activityId) m[r.activityId] = r.name;
		});
		return m;
	}
	function codeOf(snap) {
		const m = {};
		snap.forEach((r) => {
			if (r.activityId) m[r.activityId] = r.code;
		});
		return m;
	}
	function unitTag(u) {
		return u === "d" ? "d" : u === "ed" ? "ed" : u === "h" ? "h" : u === "w" ? "sem" : "d";
	}
	function linkToken(l, nmap) {
		const net = nmap[l.from];
		if (net == null) return null;
		const t = l.type || "FS", lag = Number(l.lag) || 0;
		let s = String(net);
		if (t !== "FS" || lag !== 0) s += t;
		if (lag !== 0) s += (lag > 0 ? "+" : "-") + Math.abs(lag) + unitTag(l.lagUnit || "d");
		return s;
	}
	function incoming(id) {
		return (state().links || []).filter((l) => l.to === id);
	}
	function runCpm() {
		const snap = fullRowsSnapshot();
		const nodes = scheduleNodes(snap);
		const ids = nodes.map((n) => n.id);
		const links = (state().links || []).slice();
		const val = GPI.util.scheduleValidate(ids, links);
		const validLinks = links.filter((l) => ids.indexOf(l.from) >= 0 && ids.indexOf(l.to) >= 0 && l.from !== l.to);
		return {
			snap,
			nodes,
			ids,
			links,
			val,
			cpm: GPI.util.cpm(nodes, validLinks, calData(), { startDate: metaStart() }),
			noDur: nodes.filter((n) => !n.hasDur)
		};
	}
	function render() {
		const chip = document.getElementById("modeChip");
		chip.textContent = mode === "sample" ? "MODO EJEMPLO" : "Proyecto";
		chip.className = "mode-chip " + (mode === "sample" ? "sample" : "live");
		document.getElementById("btnSample").style.display = mode === "sample" ? "none" : "";
		document.getElementById("btnLive").style.display = mode === "sample" ? "" : "none";
		document.getElementById("btnReload").disabled = mode === "sample";
		const R = runCpm();
		renderCycleBanner(R);
		renderTable(R);
		renderSidebar(R);
		renderValidation(R);
		renderCalNote();
		renderProbability(R);
		renderNet(R);
		renderGantt(R);
		const dd = document.getElementById("durDet"), dp = document.getElementById("durPert");
		if (dd && dp) {
			dd.className = "dur-src" + (durMode === "det" ? " pert" : "");
			dp.className = "dur-src" + (durMode === "pert" ? " pert" : "");
		}
	}
	function renderCycleBanner(R) {
		const b = document.getElementById("cycleBanner");
		if (!R.cpm.ok) {
			b.innerHTML = "<b>La red tiene un ciclo</b> (dependencia circular) y no puede calcularse la ruta crítica. Actividades implicadas: " + esc(R.cpm.cycles.map((id) => codeOf(R.snap)[id] || id).join(", ")) + ". Revisa los enlaces con «＋ Enlace manual» o vuelve a pegar el cronograma.";
			b.classList.add("show");
		} else b.classList.remove("show");
	}
	function renderTable(R) {
		const body = document.getElementById("cpmBody"), empty = document.getElementById("emptyState");
		const snap = R.snap, cpm = R.cpm, nmap = netMap(snap);
		if (!snap.length || !wbsData() || !wbsData().nodes) {
			body.innerHTML = "";
			empty.style.display = "block";
			empty.innerHTML = "<b>No hay una EDT con actividades para programar.</b><br>Crea la EDT y define actividades en los módulos de Alcance y Cronograma, o entra al <b>Modo ejemplo</b> para explorar el CPM con el caso DISTRIB+.<br><button class='btn violet' onclick=\"document.getElementById('btnSample').click()\">Ver modo ejemplo</button>";
			return;
		}
		empty.style.display = "none";
		const dates = state().import && state().import.dates || {};
		let html = "";
		snap.forEach((r) => {
			if (r.kind === "project") html += "<tr class='proj-row'><td class='n-cell'>0</td><td class='code-cell'>0</td><td colspan='10'>" + esc(r.name) + " · <span style='font-family:var(--mono);font-size:10px;color:var(--ink-2)'>PROYECTO (tarea resumen)</span></td></tr>";
			else if (r.subkind === "phase") html += "<tr class='phase-row'><td class='n-cell'>" + r.netId + "</td><td colspan='11'><span class='ph-code'>" + esc(r.code) + "</span>" + esc(r.name) + "</td></tr>";
			else if (r.subkind === "package") html += "<tr class='pkg-row'><td class='n-cell'>" + r.netId + "</td><td class='code-cell'>" + esc(r.code) + "</td><td colspan='10'><span class='pk-code'>■</span> <span class='pk-name'>" + esc(r.name) + "</span></td></tr>";
			else {
				const row = cpm.ok ? cpm.rows[r.activityId] : null;
				const node = R.nodes.filter((n) => n.id === r.activityId)[0] || {};
				const dur = durMode === "pert" && r.te != null ? r.te : r.det;
				const crit = !!(row && row.critical);
				const preds = incoming(r.activityId).map((l) => linkToken(l, nmap)).filter(Boolean).join("; ");
				let au = "<span class='audit-na'>—</span>";
				const pd = dates[r.activityId];
				if (pd && row && (nz(pd.start) || nz(pd.finish))) {
					const okS = !nz(pd.start) || pd.start === row.startDate;
					const okF = !nz(pd.finish) || pd.finish === row.finishDate;
					au = okS && okF ? "<span class='audit-ok' title='Coincide con MS Project'>✓</span>" : "<span class='audit-bad' title='Calc: " + esc((row.startDate || "?") + " → " + (row.finishDate || "?")) + " · Pegado: " + esc((pd.start || "?") + " → " + (pd.finish || "?")) + " (revisa calendario o enlaces)'>✗</span>";
				}
				html += "<tr class='act-row" + (crit ? " crit" : "") + "'><td class='n-cell'>" + r.netId + "</td><td class='code-cell'>" + esc(r.code) + "</td><td class='act-name'>" + esc(r.name) + (crit ? " <span class='crit-badge'>CRÍTICA</span>" : "") + (node.hasDur ? "" : " <span style='color:var(--warn);font-size:10px' title='La actividad no tiene metrado/rendimiento ni PERT: dur=0'>⚠ sin duración</span>") + "</td><td class='num'>" + (dur != null ? fmt(dur) : "—") + "</td><td class='num'>" + (row ? fmt(row.es) : "—") + "</td><td class='num'>" + (row ? fmt(row.ef) : "—") + "</td><td class='num'>" + (row ? fmt(row.ls) : "—") + "</td><td class='num'>" + (row ? fmt(row.lf) : "—") + "</td><td class='num" + (crit ? " tf-crit" : "") + "'>" + (row ? fmt(row.tf) : "—") + "</td><td class='num'>" + (row ? fmt(row.ff) : "—") + "</td><td class='l num' style='font-size:11px'>" + esc(preds || "—") + "</td><td>" + au + "</td></tr>";
			}
		});
		body.innerHTML = html;
	}
	function renderSidebar(R) {
		const cpm = R.cpm;
		document.getElementById("kpiDur").textContent = cpm.ok ? fmt(cpm.projectDuration) : "—";
		document.getElementById("kpiCrit").textContent = cpm.ok ? String(cpm.criticalIds.length) : "—";
		document.getElementById("kpiLinks").textContent = String((state().links || []).length);
		document.getElementById("kpiFinish").textContent = cpm.ok && cpm.projectFinishDate ? cpm.projectFinishDate : "—";
	}
	function renderValidation(R) {
		const box = document.getElementById("issues");
		const out = [];
		const hasLinks = (state().links || []).length > 0;
		if (!R.cpm.ok) out.push({
			c: "err",
			ic: "✖",
			t: "<b>Ciclo en la red</b>: hay dependencias circulares. No se puede calcular el CPM."
		});
		if (R.val.dangling && R.val.dangling.length) out.push({
			c: "warn",
			ic: "⚠",
			t: R.val.dangling.length + " enlace(s) apuntan a actividades inexistentes (ignorados en el cálculo)."
		});
		if (R.val.selfLoops && R.val.selfLoops.length) out.push({
			c: "warn",
			ic: "⚠",
			t: R.val.selfLoops.length + " auto-enlace(s) (una actividad dependiendo de sí misma) — ignorados."
		});
		if (R.noDur.length) out.push({
			c: "warn",
			ic: "⚠",
			t: R.noDur.length + " actividad(es) sin duración (metrado/rendimiento o PERT); se toman como 0 días."
		});
		if (hasLinks && R.cpm.ok) {
			const os = (R.val.openStart || []).length, oe = (R.val.openEnd || []).length;
			if (os > 1) out.push({
				c: "warn",
				ic: "◁",
				t: os + " actividades sin predecesora (cuelgan del inicio). Verifica si falta algún enlace."
			});
			if (oe > 1) out.push({
				c: "warn",
				ic: "▷",
				t: oe + " actividades sin sucesora (no llegan al fin). Verifica si falta algún enlace."
			});
		}
		if (!hasLinks) out.push({
			c: "warn",
			ic: "▤",
			t: "Aún no hay enlaces. Usa <b>📋 Pegar cronograma</b> o <b>＋ Enlace manual</b> para construir la red."
		});
		else if (R.cpm.ok && !R.val.dangling.length && !R.val.selfLoops.length) out.push({
			c: "ok",
			ic: "✓",
			t: "Red válida y acíclica — CPM calculado."
		});
		box.innerHTML = out.map((i) => "<div class='issue " + i.c + "'><span class='ic'>" + i.ic + "</span><span>" + i.t + "</span></div>").join("");
	}
	function criticalPertSums(R) {
		const idx = {};
		R.snap.forEach((r) => {
			if (r.kind === "activity") idx[r.activityId] = r;
		});
		let sumTe = 0, sumVar = 0, allValid = true, count = 0;
		(R.cpm.ok ? R.cpm.criticalIds : []).forEach((id) => {
			const r = idx[id];
			count++;
			if (r && r.te != null && r.variance != null && r.pertValid !== false) {
				sumTe += r.te;
				sumVar += r.variance;
			} else allValid = false;
		});
		return {
			sumTe,
			sumVar,
			allValid: allValid && count > 0,
			count
		};
	}
	function renderProbability(R) {
		const out = document.getElementById("probOut");
		const t = parseFloat(document.getElementById("probTarget").value);
		if (!R.cpm.ok) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>red con ciclo</div>";
			return;
		}
		const s = criticalPertSums(R);
		if (!s.allValid) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>completa O/M/P en PERT para la ruta crítica</div>";
			return;
		}
		if (!isFinite(t) || t <= 0) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>ΣTE=" + fmt(s.sumTe) + " d · ingresa un plazo objetivo</div>";
			return;
		}
		const pr = GPI.util.pertProbability(s.sumTe, s.sumVar, t);
		out.innerHTML = "<div class='p'>" + Math.round(pr.prob * 1e3) / 10 + "%</div><div class='z'>P(fin ≤ " + fmt(t) + " d) · Z=" + fmt(pr.z) + " · ΣTE=" + fmt(s.sumTe) + " σ=" + fmt(pr.sigma) + "</div>";
	}
	function renderCalNote() {
		const el = document.getElementById("calNote"), cal = calData(), start = metaStart();
		const days = [
			"Dom",
			"Lun",
			"Mar",
			"Mié",
			"Jue",
			"Vie",
			"Sáb"
		];
		const wd = (cal.workDayIdx || []).map((i) => days[i]).join(", ");
		const startTxt = start ? "Inicio: <b>" + esc(start) + "</b>. " : "<b style='color:#8a5300'>Sin fecha de inicio</b> (defínela en el Panel para fechar el cronograma). ";
		if (cal.provisional) {
			el.className = "cal-note prov";
			el.innerHTML = startTxt + "Calendario <b>provisional</b> (Lun–Vie, 8 h): no hay Plan de Gestión del Cronograma. Complétalo para usar tu calendario real (días laborables y feriados).";
		} else {
			el.className = "cal-note";
			el.innerHTML = startTxt + "Días laborables: <b>" + esc(wd) + "</b> · " + fmt(cal.hoursPerDay) + " h/día · " + (cal.holidays || []).length + " feriado(s). <span style='color:var(--ink-2)'>Fuente: Plan de Gestión del Cronograma.</span>";
		}
	}
	function switchView(v) {
		[
			"tabla",
			"red",
			"gantt"
		].forEach((k) => {
			document.getElementById("view-" + k).classList.toggle("active", k === v);
		});
		document.querySelectorAll(".vtab").forEach((t) => {
			t.classList.toggle("active", t.getAttribute("data-view") === v);
		});
	}
	function renderNet(R) {
		const wrap = document.getElementById("netWrap");
		if (!R.cpm.ok) {
			wrap.innerHTML = "<div class='empty-state'>La red tiene un ciclo; corrige las dependencias para ver el diagrama.</div>";
			return;
		}
		if (!R.snap.filter((r) => r.kind === "activity").length) {
			wrap.innerHTML = "<div class='empty-state'>Sin actividades para diagramar.</div>";
			return;
		}
		const ids = R.nodes.map((n) => n.id), idset = {};
		ids.forEach((i) => {
			idset[i] = 1;
		});
		const vlinks = R.links.filter((l) => idset[l.from] && idset[l.to] && l.from !== l.to);
		const inc = {};
		ids.forEach((i) => {
			inc[i] = [];
		});
		vlinks.forEach((l) => {
			inc[l.to].push(l.from);
		});
		const rank = {};
		R.cpm.order.forEach((id) => {
			let mr = 0;
			inc[id].forEach((f) => {
				if ((rank[f] || 0) + 1 > mr) mr = (rank[f] || 0) + 1;
			});
			rank[id] = mr;
		});
		const cmap = codeOf(R.snap), nmap = nameOf(R.snap), NW = 168, NH = 78, GX = 58, MX = 22, MY = 22;
		const cols = {};
		ids.forEach((id) => {
			const k = rank[id] || 0;
			(cols[k] = cols[k] || []).push(id);
		});
		const pos = {};
		let maxRank = 0, maxRows = 0;
		Object.keys(cols).forEach((ks) => {
			const k = +ks;
			if (k > maxRank) maxRank = k;
			if (cols[k].length > maxRows) maxRows = cols[k].length;
			cols[k].forEach((id, i) => {
				pos[id] = {
					x: MX + k * 226,
					y: MY + i * 104
				};
			});
		});
		const W = 44 + (maxRank + 1) * NW + maxRank * GX, H = 44 + maxRows * 104;
		let svg = "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "' xmlns='http://www.w3.org/2000/svg' style='font-family:var(--mono)'>";
		svg += "<defs><marker id='arr' markerWidth='9' markerHeight='9' refX='8' refY='3' orient='auto'><path d='M0,0 L8,3 L0,6 Z' fill='#9aa7b5'/></marker>";
		svg += "<marker id='arrC' markerWidth='9' markerHeight='9' refX='8' refY='3' orient='auto'><path d='M0,0 L8,3 L0,6 Z' fill='#ff5470'/></marker></defs>";
		vlinks.forEach((l) => {
			const a = pos[l.from], b = pos[l.to];
			if (!a || !b) return;
			const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
			const rf = R.cpm.ok ? R.cpm.rows[l.from] : void 0, rt = R.cpm.ok ? R.cpm.rows[l.to] : void 0;
			const crit = !!(rf && rt && rf.critical && rt.critical && Math.abs(rt.es - (rf.ef + (Number(l.lag) || 0))) < 1e-6 && (l.type || "FS") === "FS");
			const dx = Math.max(26, Math.min(46, (x2 - x1) / 2));
			const col = crit ? "#ff5470" : "#9aa7b5", wdt = crit ? 2.2 : 1.4;
			let lbl = l.type && l.type !== "FS" ? l.type : "";
			if (Number(l.lag)) lbl += (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit);
			svg += "<path d='M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + (x2 - 9) + "," + y2 + "' fill='none' stroke='" + col + "' stroke-width='" + wdt + "' marker-end='url(#" + (crit ? "arrC" : "arr") + ")'/>";
			if (lbl) svg += "<text x='" + (x1 + x2) / 2 + "' y='" + ((y1 + y2) / 2 - 4) + "' font-size='9' fill='#6b7684' text-anchor='middle'>" + esc(lbl) + "</text>";
		});
		ids.forEach((id) => {
			const p = pos[id], row = R.cpm.ok ? R.cpm.rows[id] : void 0;
			if (!row) return;
			const crit = row.critical;
			const stroke = crit ? "#ff5470" : "#00b6ec", fill = crit ? "rgba(255,84,112,.06)" : "#ffffff", band = crit ? "#ff5470" : "#00b6ec";
			const nm = nmap[id] || "", nmS = nm.length > 24 ? nm.slice(0, 23) + "…" : nm;
			const dur = row.ef - row.es;
			svg += "<g>";
			svg += "<rect x='" + p.x + "' y='" + p.y + "' width='168' height='78' rx='9' fill='" + fill + "' stroke='" + stroke + "' stroke-width='" + (crit ? 2 : 1.3) + "'/>";
			svg += "<rect x='" + p.x + "' y='" + p.y + "' width='168' height='19' rx='9' fill='" + band + "'/><rect x='" + p.x + "' y='" + (p.y + 10) + "' width='168' height='9' fill='" + band + "'/>";
			svg += "<text x='" + (p.x + 14) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='700' fill='#fff'>" + fmt(row.es) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='800' fill='#fff' text-anchor='middle'>" + fmt(dur) + "d</text>";
			svg += "<text x='" + (p.x + NW - 14) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='700' fill='#fff' text-anchor='end'>" + fmt(row.ef) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 37) + "' font-size='11' font-weight='700' fill='#1a2027' text-anchor='middle' style='font-family:var(--display)'>" + esc(nmS) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 50) + "' font-size='9' fill='#6c5ce7' text-anchor='middle'>EDT " + esc(cmap[id] || "") + "</text>";
			svg += "<line x1='" + p.x + "' y1='" + (p.y + NH - 22) + "' x2='" + (p.x + NW) + "' y2='" + (p.y + NH - 22) + "' stroke='#e4eaf1'/>";
			svg += "<text x='" + (p.x + 14) + "' y='" + (p.y + NH - 8) + "' font-size='10' font-weight='700' fill='#4d5768'>" + fmt(row.ls) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + NH - 8) + "' font-size='10' font-weight='800' fill='" + (crit ? "#ff5470" : "#4d5768") + "' text-anchor='middle'>H" + fmt(row.tf) + "</text>";
			svg += "<text x='" + (p.x + NW - 14) + "' y='" + (p.y + NH - 8) + "' font-size='10' font-weight='700' fill='#4d5768' text-anchor='end'>" + fmt(row.lf) + "</text>";
			svg += "</g>";
		});
		svg += "</svg>";
		wrap.innerHTML = svg;
	}
	function renderGantt(R) {
		const wrap = document.getElementById("ganttWrap");
		if (!R.cpm.ok) {
			wrap.innerHTML = "<div class='empty-state'>La red tiene un ciclo; corrige las dependencias para ver el Gantt.</div>";
			return;
		}
		const acts = R.snap.filter((r) => r.kind === "activity");
		if (!acts.length) {
			wrap.innerHTML = "<div class='empty-state'>Sin actividades para el Gantt.</div>";
			return;
		}
		const D = Math.max(1, Math.ceil(R.cpm.projectDuration));
		const LW = 214, RH = 24, HH = 30, MB = 12;
		const dayW = Math.max(9, Math.min(34, Math.floor(760 / D)));
		const W = LW + D * dayW + 20, H = HH + acts.length * RH + MB;
		let svg = "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "' xmlns='http://www.w3.org/2000/svg' style='font-family:var(--mono)'>";
		const step = D <= 20 ? 1 : D <= 45 ? 5 : 10;
		for (let d = 0; d <= D; d += step) {
			const x = LW + d * dayW;
			svg += "<line x1='" + x + "' y1='30' x2='" + x + "' y2='" + (H - MB) + "' stroke='#eef2f7'/>";
			svg += "<text x='" + x + "' y='22' font-size='9' fill='#8992a3' text-anchor='middle'>" + d + "</text>";
		}
		svg += "<text x='214' y='14' font-size='10' font-weight='700' fill='#4d5768'>día laborable →</text>";
		acts.forEach((r, i) => {
			const row = R.cpm.ok ? R.cpm.rows[r.activityId] : void 0;
			if (!row) return;
			const y = HH + i * RH;
			const crit = row.critical, col = crit ? "#ff5470" : "#00b6ec";
			let nm = (codeOf(R.snap)[r.activityId] || "") + " " + (r.name || "");
			if (nm.length > 30) nm = nm.slice(0, 29) + "…";
			svg += "<text x='10' y='" + (y + RH / 2 + 3) + "' font-size='10.5' fill='#1a2027' style='font-family:var(--display);font-weight:600'>" + esc(nm) + "</text>";
			const bx = LW + row.es * dayW, bw = Math.max(4, (row.ef - row.es) * dayW);
			svg += "<rect x='" + bx + "' y='" + (y + 4) + "' width='" + bw + "' height='14' rx='4' fill='" + col + "' opacity='" + (crit ? 1 : .85) + "'/>";
			if (row.tf > 1e-6) {
				const sx = LW + row.ef * dayW, sw = row.tf * dayW;
				svg += "<rect x='" + sx + "' y='" + (y + RH / 2 - 1.5) + "' width='" + sw + "' height='3' fill='#c7d3de'/>";
			}
			svg += "<text x='" + (bx + bw + 5) + "' y='" + (y + RH / 2 + 3) + "' font-size='9' fill='#6b7684'>" + fmt(row.ef - row.es) + "d</text>";
		});
		svg += "</svg>";
		wrap.innerHTML = svg;
	}
	function normSchedule(o) {
		o = o || {};
		return {
			links: (Array.isArray(o.links) ? o.links : []).map((l, i) => ({
				id: l.id || "L" + (i + 1),
				from: l.from,
				to: l.to,
				type: [
					"FS",
					"SS",
					"FF",
					"SF"
				].indexOf(l.type) >= 0 ? l.type : "FS",
				lag: Number(l.lag) || 0,
				lagUnit: [
					"d",
					"ed",
					"h",
					"w"
				].indexOf(l.lagUnit) >= 0 ? l.lagUnit : "d",
				source: l.source || "manual"
			})),
			linkCounter: Number(o.linkCounter) || (Array.isArray(o.links) ? o.links.length : 0) + 1,
			import: o.import || null,
			baseline: o.baseline || null
		};
	}
	function gpiPush() {
		if (mode === "sample") return;
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		window.GPI.setModule("schedule", stateLive);
		window.GPI.patchMeta({
			name: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value
		});
	}
	function commit(statusMsg) {
		if (statusMsg) setStatus(statusMsg);
		gpiPush();
		render();
	}
	function newLinkId() {
		const st = state();
		return "L" + st.linkCounter++;
	}
	function wouldCycle(candidate) {
		const links = (state().links || []).concat([candidate]);
		const ids = fullRowsSnapshot().filter((r) => r.kind === "activity").map((r) => r.activityId);
		return !GPI.util.scheduleValidate(ids, links).ok && GPI.util.scheduleValidate(ids, links).cycles.length > 0;
	}
	function addManualLink(r) {
		if (!r || !r.from || !r.to) return false;
		if (r.from === r.to) {
			showAlert("Una actividad no puede depender de sí misma.");
			return false;
		}
		if ((state().links || []).some((l) => l.from === r.from && l.to === r.to && l.type === r.type)) {
			showAlert("Ese enlace ya existe.");
			return false;
		}
		const cand = {
			id: newLinkId(),
			from: r.from,
			to: r.to,
			type: r.type || "FS",
			lag: Number(r.lag) || 0,
			lagUnit: r.lagUnit || "d",
			source: "manual"
		};
		if (wouldCycle(cand)) {
			state().linkCounter--;
			showAlert("Ese enlace crearía un ciclo (dependencia circular) en la red. No se agregó.");
			return false;
		}
		state().links.push(cand);
		commit("Enlace agregado.");
		return true;
	}
	function removeManualLink(id) {
		const st = state();
		st.links = (st.links || []).filter((l) => l.id !== id);
		commit("Enlace eliminado.");
	}
	function openAddLink() {
		const snap = fullRowsSnapshot(), acts = snap.filter((r) => r.kind === "activity");
		if (acts.length < 2) {
			showAlert("Necesitas al menos 2 actividades definidas (módulo Definir las Actividades) para crear enlaces.");
			return;
		}
		const nm = nameOf(snap), nn = netMap(snap);
		function optsHTML() {
			return acts.map((a) => "<option value='" + a.activityId + "'>" + esc(a.netId + " · EDT " + a.code + " · " + a.name) + "</option>").join("");
		}
		function listHTML() {
			const ls = state().links || [];
			if (!ls.length) return "<div style='color:#8992a3;font-size:12px;padding:8px'>Sin enlaces todavía.</div>";
			return ls.map((l) => {
				const lg = Number(l.lag) ? (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit) : "";
				return "<div class='row'><span>" + esc((nn[l.from] != null ? nn[l.from] : "?") + " " + (nm[l.from] || "?") + "  →  " + (nn[l.to] != null ? nn[l.to] : "?") + " " + (nm[l.to] || "?")) + " <b style='color:#6c5ce7'>[" + (l.type || "FS") + lg + "]</b></span><button class='btn sm danger rm-lk' data-id='" + l.id + "'>✕</button></div>";
			}).join("");
		}
		showModalHTML({
			wide: true,
			title: "Enlaces (precedencias) manuales",
			html: "<div class='lk-form'><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Predecesora (desde)</label><select id='lkFrom' class='field' style='width:100%'>" + optsHTML() + "</select></div><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Sucesora (hacia)</label><select id='lkTo' style='width:100%'>" + optsHTML() + "</select></div><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Tipo</label><select id='lkType' style='width:100%'><option value='FS'>FS · Fin→Comienzo</option><option value='SS'>SS · Comienzo→Comienzo</option><option value='FF'>FF · Fin→Fin</option><option value='SF'>SF · Comienzo→Fin</option></select></div><div style='display:grid;grid-template-columns:1fr 1fr;gap:6px'><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Desfase</label><input id='lkLag' type='number' step='0.5' value='0' style='width:100%'></div><div><label style='font-size:11px;font-weight:700;color:#4d5768'>Unidad</label><select id='lkUnit' style='width:100%'><option value='d'>días</option><option value='ed'>días transc.</option><option value='h'>horas</option><option value='w'>semanas</option></select></div></div><div class='full' style='text-align:right'><button class='btn violet' id='lkAdd'>＋ Agregar enlace</button></div></div><h4 style='font-family:var(--display);font-size:12px;margin:14px 0 6px'>Enlaces actuales</h4><div class='prev-list' id='lkList'>" + listHTML() + "</div>",
			confirmText: null,
			cancelText: "Cerrar",
			afterOpen: (card) => {
				function refresh() {
					card.querySelector("#lkList").innerHTML = listHTML();
					wireRm();
				}
				function wireRm() {
					card.querySelectorAll(".rm-lk").forEach((b) => {
						b.onclick = () => {
							removeManualLink(b.getAttribute("data-id"));
							refresh();
						};
					});
				}
				card.querySelector("#lkAdd").onclick = () => {
					if (addManualLink({
						from: card.querySelector("#lkFrom").value,
						to: card.querySelector("#lkTo").value,
						type: card.querySelector("#lkType").value,
						lag: parseFloat(card.querySelector("#lkLag").value) || 0,
						lagUnit: card.querySelector("#lkUnit").value
					})) refresh();
				};
				wireRm();
			}
		});
	}
	function pad2(n) {
		return (n < 10 ? "0" : "") + n;
	}
	function parseDateCell(s) {
		const str = String(s || "").trim();
		if (!str) return "";
		let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str);
		if (m) return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
		m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(str);
		if (m) {
			const d = +m[1], mo = +m[2];
			let y = +m[3];
			if (y < 100) y += 2e3;
			return y + "-" + pad2(mo) + "-" + pad2(d);
		}
		return "";
	}
	function analyzePaste(text) {
		const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
		const pasted = [];
		lines.forEach((ln) => {
			const c = ln.split("	");
			const netStr = (c[0] || "").trim();
			if (!/^\d+$/.test(netStr)) return;
			const cols = c.length;
			let name = (c[1] || "").trim();
			const start = parseDateCell(cols >= 5 ? c[3] : "");
			const finish = parseDateCell(cols >= 5 ? c[4] : "");
			const predCell = cols >= 6 ? c[5] : cols === 2 ? c[1] : c[cols - 1] || "";
			if (cols === 2) name = "";
			pasted.push({
				netId: parseInt(netStr, 10),
				name,
				start,
				finish,
				predCell
			});
		});
		const snap = fullRowsSnapshot();
		const res = GPI.util.buildScheduleLinks(pasted, snap);
		res.snap = snap;
		res.pastedCount = pasted.length;
		res.canApply = res.links.length > 0 || Object.keys(res.dates).length > 0;
		return res;
	}
	var REASON = {
		"enlace-a-resumen": "Enlace a una tarea resumen (fase/paquete): enlaza las actividades detalle.",
		"enlace-a-proyecto": "Enlace al proyecto (fila 0): no admitido.",
		"colgante": "Referencia a un N.º que no existe entre las actividades.",
		"auto-enlace": "La actividad dependería de sí misma.",
		"fila-sin-correspondencia": "N.º sin correspondencia con una actividad (re-exporta la plantilla).",
		"nombre-no-coincide": "El nombre no coincide con la actividad de ese N.º — ¿editaste la EDT? Re-exporta la plantilla.",
		"predecesoras-en-resumen": "Predecesoras escritas en una fila resumen (ignoradas).",
		"predecesoras-en-proyecto": "Predecesoras escritas en la fila del proyecto (ignoradas).",
		"sin-id": "No se pudo leer el N.º de la predecesora.",
		"sintaxis": "Sintaxis de predecesora no reconocida.",
		"desfase": "Desfase (lag) sin número válido."
	};
	function previewHTML(a) {
		function sec(title, count, cls, listHtml) {
			return "<div class='prev-sec'><h4>" + title + " <span class='prev-count " + cls + "'>" + count + "</span></h4>" + (count ? "<div class='prev-list'>" + listHtml + "</div>" : "") + "</div>";
		}
		const nm = nameOf(a.snap), nn = netMap(a.snap);
		const okList = a.links.map((l) => {
			const lg = Number(l.lag) ? (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit) : "";
			return "<div class='row'><span>" + esc((nn[l.from] != null ? nn[l.from] : "?") + " " + (nm[l.from] || "") + " → " + (nn[l.to] != null ? nn[l.to] : "?") + " " + (nm[l.to] || "")) + " <b style='color:#6c5ce7'>[" + l.type + lg + "]</b></span></div>";
		}).join("");
		function errList(arr) {
			return arr.map((e) => {
				return "<div class='row'><span>" + esc(e.toName || e.name || (e.fromNet != null ? "N.º " + e.fromNet : "")) + "</span><span class='reason'>" + esc(REASON[e.reason] || e.reason) + "</span></div>";
			}).join("");
		}
		const datesN = Object.keys(a.dates).length;
		let html = "<p style='margin-bottom:10px'>Se interpretaron <b>" + a.pastedCount + "</b> fila(s). Nada se guarda hasta que confirmes.</p>";
		html += sec("✔ Enlaces a crear", a.links.length, "cnt-ok", okList);
		if (a.rejected.length) html += sec("✖ Enlaces rechazados", a.rejected.length, "cnt-bad", errList(a.rejected));
		if (a.rowErrors.length) html += sec("⚠ Filas con problema", a.rowErrors.length, "cnt-warn", errList(a.rowErrors));
		if (a.parseErrors.length) html += sec("⚠ Predecesoras no interpretables", a.parseErrors.length, "cnt-warn", a.parseErrors.map((e) => "<div class='row'><span>N.º " + e.netId + " · «" + esc(e.raw) + "»</span><span class='reason warn'>" + esc(REASON[e.reason] || e.reason) + "</span></div>").join(""));
		if (a.duplicates.length) html += sec("● Duplicados (colapsados)", a.duplicates.length, "cnt-warn", "");
		html += sec("📅 Fechas para auditoría", datesN, "cnt-ok", "");
		if (a.canApply) html += "<div class='radio-row'><label><input type='radio' name='mergeMode' value='merge' checked> Fusionar con lo existente</label><label><input type='radio' name='mergeMode' value='replace'> Reemplazar todo</label></div>";
		else html += "<div class='issue warn' style='margin-top:8px'><span class='ic'>⚠</span><span>No hay nada aplicable. Revisa que pegaste la columna <b>Predecesoras</b> con los N.º de esta plantilla.</span></div>";
		return html;
	}
	function applyPaste(a, mergeMode) {
		const st = state();
		const newLinks = a.links.map((l) => ({
			...l,
			id: newLinkId(),
			source: "paste"
		}));
		if (mergeMode === "replace") st.links = newLinks;
		else {
			const seen = {};
			(st.links || []).forEach((l) => {
				seen[l.from + "|" + l.to + "|" + l.type] = true;
			});
			newLinks.forEach((l) => {
				const k = l.from + "|" + l.to + "|" + l.type;
				if (!seen[k]) {
					st.links.push(l);
					seen[k] = true;
				}
			});
		}
		const rowMap = {};
		a.snap.forEach((r) => {
			if (r.kind === "activity") rowMap[r.netId] = r.activityId;
		});
		const dates = {};
		if (mergeMode !== "replace" && st.import && st.import.dates) Object.assign(dates, st.import.dates);
		Object.assign(dates, a.dates);
		st.import = {
			at: Date.now(),
			tool: "msproject-paste",
			rowMap,
			dates
		};
		commit("Cronograma pegado y aplicado (" + newLinks.length + " enlace[s]). Las fechas quedan como auditoría.");
	}
	function openPaste() {
		showModalHTML({
			wide: true,
			title: "Pegar cronograma (Excel / MS Project)",
			html: "<p>Pega desde Excel o MS Project las columnas de tu cronograma. La <b>llave de unión es el N.º</b> (0 = proyecto), tal como aparece en la plantilla (botón «⧉ Copiar plantilla»). Orden esperado:</p><div style='font-family:var(--mono);font-size:11px;background:var(--bg-2);border:1px solid var(--panel-border);border-radius:8px;padding:8px 10px;margin-bottom:10px'>N.º &nbsp;·&nbsp; Nombre &nbsp;·&nbsp; Dur &nbsp;·&nbsp; Comienzo &nbsp;·&nbsp; Fin &nbsp;·&nbsp; Predecesoras</div><textarea class='paste-zone' id='pasteTA' placeholder='Pega aquí (Ctrl+V)…'></textarea><div style='font-size:11px;color:#8992a3;margin-top:8px'>Sintaxis de predecesoras: <b>3</b>, <b>3FS+2d</b>, <b>7CC</b> (SS), <b>9FC-1d</b> (lead). Separadores <b>;</b> o <b>,</b>. Se pega la <b>topología</b>; el simulador recalcula las fechas — las fechas pegadas son solo auditoría.</div>",
			confirmText: "Analizar ▸",
			cancelText: "Cancelar",
			afterOpen: (card) => {
				card.querySelector("#pasteTA").focus();
			},
			collect: () => ({ text: document.getElementById("pasteTA").value })
		}).then((r) => {
			if (!r || r.text == null) return;
			const a = analyzePaste(r.text);
			showModalHTML({
				wide: true,
				title: "Previsualización — antes de guardar",
				html: previewHTML(a),
				confirmText: a.canApply ? "Confirmar ▾" : null,
				cancelText: "Cancelar",
				collect: a.canApply ? () => {
					const m = document.querySelector("input[name=mergeMode]:checked");
					return { mode: m ? m.value : "merge" };
				} : void 0
			}).then((c) => {
				if (c && c.mode) applyPaste(a, c.mode);
			});
		});
	}
	function copyTemplate() {
		const snap = fullRowsSnapshot(), nn = netMap(snap);
		const rows = [[
			"N.º",
			"Nombre",
			"Dur (d)",
			"Comienzo",
			"Fin",
			"Predecesoras"
		].join("	")];
		snap.forEach((r) => {
			let dur = "", preds = "";
			if (r.kind === "activity") {
				dur = r.det != null ? r.det : "";
				preds = incoming(r.activityId).map((l) => linkToken(l, nn)).filter(Boolean).join("; ");
			}
			rows.push([
				r.netId,
				r.name,
				dur,
				"",
				"",
				preds
			].join("	"));
		});
		const tsv = rows.join("\n");
		function ok() {
			setStatus("Plantilla copiada al portapapeles — pégala en Excel o MS Project.");
			showAlert("Plantilla copiada. Pégala en Excel o MS Project, completa Comienzo/Fin y Predecesoras usando los N.º, y vuelve a pegarla aquí con «📋 Pegar cronograma».", "Plantilla copiada");
		}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tsv).then(ok, () => {
			fallbackCopy(tsv);
			ok();
		});
		else {
			fallbackCopy(tsv);
			ok();
		}
	}
	function fallbackCopy(t) {
		const ta = document.createElement("textarea");
		ta.value = t;
		document.body.appendChild(ta);
		ta.select();
		try {
			document.execCommand("copy");
		} catch (_) {}
		ta.remove();
	}
	function exportJson() {
		const data = {
			kind: "gpi.schedule/v1",
			title: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value,
			data: state()
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		const safe = (data.title || "cronograma").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		a.href = url;
		a.download = "cronograma_" + safe + ".json";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Cronograma exportado como .json.");
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
			if (obj && obj.kind === "gpi.schedule/v1" && obj.data) {
				if (mode === "sample") stateSample = normSchedule(obj.data);
				else stateLive = normSchedule(obj.data);
				if (obj.title) document.getElementById("projectTitle").value = obj.title;
				if (obj.course) document.getElementById("courseTitle").value = obj.course;
				commit("Cronograma importado.");
			} else showAlert("No reconocí el formato: se esperaba una exportación de esta herramienta (gpi.schedule/v1).");
		};
		r.readAsText(file);
	}
	function clearLinks() {
		showConfirm("Se eliminarán todos los enlaces y las fechas de auditoría de este cronograma. Las actividades y la EDT no se tocan. ¿Continuar?", "Limpiar cronograma").then((ok) => {
			if (!ok) return;
			const st = state();
			st.links = [];
			st.linkCounter = 1;
			st.import = null;
			commit("Cronograma limpiado.");
		});
	}
	function buildReport() {
		const R = runCpm(), snap = R.snap, cpm = R.cpm, rep = document.getElementById("gpiReport");
		const cmap = codeOf(snap), nmap = nameOf(snap);
		const now = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE");
		const s = criticalPertSums(R);
		let h = "<div class='rep-head'><div><h1>Cronograma / Ruta Crítica</h1><div class='sub'>" + esc(document.getElementById("projectTitle").value) + "</div></div><div class='rep-meta'>" + esc(document.getElementById("courseTitle").value) + "<br>" + now + "<br>PMBOK · CPM</div></div>";
		h += "<table class='rep-kv'><tr><td>Duración del proyecto</td><td class='num'>" + (cpm.ok ? fmt(cpm.projectDuration) + " días laborables" : "—") + "</td></tr><tr><td>Fecha de fin</td><td class='num'>" + (cpm.ok ? cpm.projectFinishDate || "—" : "—") + "</td></tr><tr><td>Actividades críticas</td><td class='num'>" + (cpm.ok ? cpm.criticalIds.length : "—") + "</td></tr><tr><td>Enlaces</td><td class='num'>" + (state().links || []).length + "</td></tr></table>";
		if (cpm.ok) {
			const path = cpm.criticalIds.map((id) => (cmap[id] || "") + " " + (nmap[id] || ""));
			h += "<h2>Ruta crítica</h2><p class='num'>" + esc(path.join("  →  ")) + "</p>";
		}
		h += "<h2>Actividades (CPM)</h2><table><tr><th>N.º</th><th>EDT</th><th>Actividad</th><th>Dur</th><th>IC</th><th>TC</th><th>IL</th><th>TL</th><th>H.T.</th><th>Crítica</th></tr>";
		snap.filter((r) => r.kind === "activity").forEach((r) => {
			const row = cpm.ok ? cpm.rows[r.activityId] : null;
			const dur = durMode === "pert" && r.te != null ? r.te : r.det;
			h += "<tr><td class='num'>" + r.netId + "</td><td class='num'>" + esc(r.code) + "</td><td>" + esc(r.name) + "</td><td class='num'>" + fmt(dur) + "</td><td class='num'>" + (row ? fmt(row.es) : "—") + "</td><td class='num'>" + (row ? fmt(row.ef) : "—") + "</td><td class='num'>" + (row ? fmt(row.ls) : "—") + "</td><td class='num'>" + (row ? fmt(row.lf) : "—") + "</td><td class='num'>" + (row ? fmt(row.tf) : "—") + "</td><td>" + (row && row.critical ? "●" : "") + "</td></tr>";
		});
		h += "</table>";
		if (s.allValid) h += "<p class='rep-note'>Ruta crítica: ΣTE = " + fmt(s.sumTe) + " d, Σσ² = " + fmt(s.sumVar) + " (base para la probabilidad de plazo PERT).</p>";
		rep.innerHTML = h;
	}
	function printReport() {
		buildReport();
		document.body.classList.add("report-mode");
		window.print();
		setTimeout(() => {
			document.body.classList.remove("report-mode");
		}, 400);
	}
	function buildDurToggle() {
		const tabs = document.getElementById("viewTabs");
		const dt = document.createElement("span");
		dt.style.cssText = "display:inline-flex;gap:8px;align-items:center;margin-left:14px;font-size:12px;color:var(--ink-1)";
		dt.innerHTML = "<span style='font-weight:700'>Duración:</span><button class='dur-src pert' id='durDet' title='Dur = Met ÷ (#Eq × R)'>Determinística</button><button class='dur-src' id='durPert' title='Usa el Tiempo Esperado TE de PERT'>PERT (TE)</button>";
		tabs.parentNode.insertBefore(dt, tabs.nextSibling);
		document.getElementById("durDet").addEventListener("click", () => {
			durMode = "det";
			render();
		});
		document.getElementById("durPert").addEventListener("click", () => {
			durMode = "pert";
			render();
		});
	}
	function wireTabs() {
		document.getElementById("viewTabs").addEventListener("click", (e) => {
			const b = e.target.closest(".vtab");
			if (b) switchView(b.getAttribute("data-view"));
		});
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
		document.getElementById("btnTemplate").addEventListener("click", copyTemplate);
		document.getElementById("btnPaste").addEventListener("click", openPaste);
		document.getElementById("btnAddLink").addEventListener("click", openAddLink);
		document.getElementById("btnRecalc").addEventListener("click", () => {
			render();
			setStatus("Recalculado.");
		});
		document.getElementById("btnReload").addEventListener("click", () => {
			gpiPullAll();
			render();
			setStatus("Actividades y EDT recargadas del proyecto.");
		});
		document.getElementById("btnReport").addEventListener("click", printReport);
		document.getElementById("btnPrint").addEventListener("click", printReport);
		document.getElementById("btnSample").addEventListener("click", enterSample);
		document.getElementById("btnLive").addEventListener("click", enterLive);
		document.getElementById("btnClear").addEventListener("click", clearLinks);
		document.getElementById("probTarget").addEventListener("input", () => {
			renderProbability(runCpm());
		});
		document.getElementById("projectTitle").addEventListener("change", gpiPush);
		document.getElementById("courseTitle").addEventListener("change", gpiPush);
	}
	function enterSample() {
		mode = "sample";
		if (!stateSample) stateSample = normSchedule(SAMPLE.schedule);
		render();
		setStatus("Modo ejemplo (DISTRIB+): red de demostración; no escribe sobre tu proyecto.");
	}
	function enterLive() {
		mode = "live";
		render();
		setStatus("Usando las actividades y la EDT del proyecto activo.");
	}
	function gpiPullAll() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) return;
		wbsLive = window.GPI.getModule("wbs") ?? null;
		actsLive = window.GPI.getModule("activities") ?? null;
		pertLive = window.GPI.getModule("pert") ?? null;
		spLive = window.GPI.getModule("schedulePlan") ?? null;
	}
	var initialized = false;
	function init() {
		if (initialized) return;
		initialized = true;
		wireToolbar();
		wireTabs();
		buildDurToggle();
		if (typeof window.GPI === "undefined") {
			const bn0 = document.getElementById("banner");
			bn0.classList.add("show");
			bn0.innerHTML = "<b>No se pudo cargar <code>gpi-core.js</code>.</b> Abre este archivo junto al núcleo y los demás módulos desde un servidor local o GitHub Pages para calcular el cronograma.";
			return;
		}
		GPI = window.GPI;
		if (window.GPI.available() && window.GPI.active()) {
			const proj = window.GPI.active();
			if (proj && proj.meta) {
				if (proj.meta.name) document.getElementById("projectTitle").value = proj.meta.name;
				if (proj.meta.course) document.getElementById("courseTitle").value = proj.meta.course;
			}
			gpiPullAll();
			const mod = window.GPI.getModule("schedule");
			if (mod) stateLive = normSchedule(mod);
			if (!wbsLive || !wbsLive.nodes || !actsLive || !Object.keys(actsLive.byLeaf || {}).length) {
				const bn = document.getElementById("banner");
				bn.classList.add("show");
				bn.innerHTML = "<b>Aún no hay actividades para programar.</b> Define la EDT y descompón sus paquetes en actividades (módulos de Alcance y «Definir las Actividades»). Mientras tanto puedes explorar el <b>Modo ejemplo</b>.";
			}
			window.addEventListener("beforeunload", gpiPush);
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) gpiPush();
			});
			window.GPI.onChange(() => {
				if (mode === "live") {
					gpiPullAll();
					render();
				}
			});
			gpiBadge(proj ? proj.meta && proj.meta.name : "", gpiPush);
			setStatus("Proyecto cargado desde el Panel de Control.");
			render();
		} else {
			const bn2 = document.getElementById("banner");
			bn2.classList.add("show");
			bn2.innerHTML = "<b>Sin proyecto activo.</b> Abre el <a href='Panel_Control.html'>Panel de Control</a> para crear o seleccionar uno. Mientras tanto trabajas con el <b>Modo ejemplo</b>.";
			enterSample();
		}
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
	var SAMPLE = (function() {
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
		const by = {};
		by[p21] = [A("Calicatas exploratorias", "und", 8, 2), A("Informe geotécnico", "doc", 1, .25)];
		by[p22] = [A("Memoria de cálculo estructural", "doc", 1, .1), A("Planos estructurales", "lám", 24, 2)];
		by[p41] = [
			A("Corte y excavación masiva", "m³", 4800, 320, 2),
			A("Relleno y compactación", "m³", 2100, 250),
			A("Eliminación de excedentes", "m³", 2700, 300)
		];
		by[p42] = [
			A("Excavación de zanjas", "m³", 620, 60, 2),
			A("Acero de refuerzo", "kg", 38500, 2500, 2),
			A("Concreto f'c=280 en zapatas", "m³", 410, 45, 2)
		];
		by[p43] = [A("Montaje de columnas metálicas", "und", 48, 6), A("Instalación de cobertura TR-4", "m²", 5200, 350, 2)];
		return {
			wbs: {
				rootId: root,
				idCounter: k + 1,
				nodes
			},
			acts: {
				idCounter: n + 1,
				byLeaf: by
			},
			pert: {
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
						o: "5",
						m: "",
						mAuto: true,
						p: "10"
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
			},
			schedule: {
				linkCounter: 14,
				import: null,
				baseline: null,
				links: [
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
				]
			},
			cal: {
				workDayIdx: [
					1,
					2,
					3,
					4,
					5
				],
				hoursPerDay: 8,
				holidays: [],
				provisional: false
			},
			startDate: "2026-07-06"
		};
	})();
	document.addEventListener("DOMContentLoaded", init);
	//#endregion
})();
