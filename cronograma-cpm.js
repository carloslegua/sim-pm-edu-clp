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
	function planOf(sp) {
		const p = sp && typeof sp === "object" ? sp : {};
		const rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
		const n = (v) => {
			const x = Number(v);
			return isFinite(x) ? x : 0;
		};
		const near = n(rec(p.criticalPath).nearCriticalThresholdDays);
		const th = (Array.isArray(p.controlThresholds) ? p.controlThresholds : []).map(rec).filter((t) => t.key === "HOLGURA")[0];
		const g = th ? n(th.greenValue) : 0, r = th ? n(th.redValue) : 0;
		return {
			nearCriticalDays: near > 0 ? near : 10,
			nearCriticalDefined: near > 0,
			reservePct: Math.max(0, n(rec(p.scheduleReserve).pct)),
			rebaselinePct: Math.max(0, n(rec(p.changeControl).baselineChangeThresholdPct)),
			floatGreen: g > 0 ? g : 40,
			floatRed: r > g && r > 0 ? r : 70
		};
	}
	var lagOf = (l) => Number(l.lag) || 0;
	var pct = (a, b) => b > 0 ? a / b * 100 : 0;
	var names = (ns, k = 4) => ns.slice(0, k).map((n) => n.code + " " + n.name).concat(ns.length > k ? ["… y " + (ns.length - k) + " más"] : []);
	function scheduleHealth(nodes, links, rows, plan) {
		const acts = nodes.filter((n) => !n.isMilestone), by = {};
		nodes.forEach((n) => {
			by[n.id] = n;
		});
		const valid = links.filter((l) => by[l.from] && by[l.to] && l.from !== l.to);
		const hasPred = {}, hasSucc = {};
		valid.forEach((l) => {
			hasSucc[l.from] = true;
			hasPred[l.to] = true;
		});
		const checks = [], add = (c) => {
			checks.push(c);
		};
		const pickFree = (list, prefer) => list.length ? list.slice().sort(prefer)[0] : null;
		const noPred = nodes.filter((n) => !hasPred[n.id]), noSucc = nodes.filter((n) => !hasSucc[n.id]);
		const rowEs = (n) => rows[n.id] ? rows[n.id].es : 0, rowEf = (n) => rows[n.id] ? rows[n.id].ef : 0;
		const freeStart = pickFree(noPred, (a, b) => Number(b.isMilestone) - Number(a.isMilestone) || rowEs(a) - rowEs(b));
		const freeEnd = pickFree(noSucc, (a, b) => Number(b.isMilestone) - Number(a.isMilestone) || rowEf(b) - rowEf(a));
		const missing = nodes.filter((n) => !hasPred[n.id] && n !== freeStart || !hasSucc[n.id] && n !== freeEnd);
		add({
			key: "logic",
			label: "Lógica faltante (sin predecesora o sin sucesora)",
			count: missing.length,
			total: nodes.length,
			pct: pct(missing.length, nodes.length),
			limit: "≤ 5 % de las actividades",
			pass: pct(missing.length, nodes.length) <= 5,
			detail: "Actividades e hitos sin predecesora o sin sucesora, salvo el inicio y el fin del proyecto (los extremos abiertos hacen la holgura poco confiable).",
			items: names(missing)
		});
		const leads = valid.filter((l) => lagOf(l) < 0), lags = valid.filter((l) => lagOf(l) > 0);
		const linkTxt = (l) => by[l.from].code + " → " + by[l.to].code + " " + l.type + (lagOf(l) > 0 ? "+" : "") + lagOf(l) + (l.lagUnit || "d");
		add({
			key: "leads",
			label: "Adelantos (desfase negativo)",
			count: leads.length,
			total: valid.length,
			pct: pct(leads.length, valid.length),
			limit: "0",
			pass: leads.length === 0,
			detail: "Un adelanto superpone actividades y distorsiona la holgura y la ruta crítica; se evita (mejor dividir la actividad).",
			items: leads.slice(0, 4).map(linkTxt)
		});
		add({
			key: "lags",
			label: "Desfases positivos",
			count: lags.length,
			total: valid.length,
			pct: pct(lags.length, valid.length),
			limit: "≤ 5 % de los enlaces",
			pass: pct(lags.length, valid.length) <= 5,
			detail: "Un desfase oculta trabajo o espera que debería ser una actividad propia (con nombre, duración y responsable).",
			items: lags.slice(0, 4).map(linkTxt)
		});
		const fs = valid.filter((l) => l.type === "FS");
		add({
			key: "fs",
			label: "Relaciones fin-a-inicio (FS)",
			count: fs.length,
			total: valid.length,
			pct: pct(fs.length, valid.length),
			limit: "≥ 90 % de los enlaces",
			pass: valid.length === 0 ? null : pct(fs.length, valid.length) >= 90,
			detail: "Las relaciones SS, FF y SF hacen la red más difícil de leer y de mantener; FS debe ser la norma.",
			items: []
		});
		const withRow = acts.filter((n) => rows[n.id]);
		const hiFloat = withRow.filter((n) => rows[n.id].tf > 44.000000001), negFloat = withRow.filter((n) => rows[n.id].tf < -1e-9);
		add({
			key: "highFloat",
			label: "Holgura alta (> 44 días)",
			count: hiFloat.length,
			total: withRow.length,
			pct: pct(hiFloat.length, withRow.length),
			limit: "≤ 5 % de las actividades",
			pass: pct(hiFloat.length, withRow.length) <= 5,
			detail: "Una holgura enorme suele indicar un enlace faltante a una sucesora: la actividad «flota» y nadie la controla.",
			items: names(hiFloat)
		});
		add({
			key: "negFloat",
			label: "Holgura negativa",
			count: negFloat.length,
			total: withRow.length,
			pct: pct(negFloat.length, withRow.length),
			limit: "0",
			pass: negFloat.length === 0,
			detail: "Holgura negativa = el plan no cumple una fecha impuesta.",
			items: names(negFloat)
		});
		const hiDur = acts.filter((n) => n.dur > 44.000000001);
		add({
			key: "highDur",
			label: "Duración alta (> 44 días)",
			count: hiDur.length,
			total: acts.length,
			pct: pct(hiDur.length, acts.length),
			limit: "≤ 5 % de las actividades",
			pass: pct(hiDur.length, acts.length) <= 5,
			detail: "Las actividades muy largas se controlan mal: conviene descomponerlas para poder medir el avance.",
			items: names(hiDur)
		});
		const noDur = acts.filter((n) => !n.hasDur);
		add({
			key: "noDur",
			label: "Actividades sin duración",
			count: noDur.length,
			total: acts.length,
			pct: pct(noDur.length, acts.length),
			limit: "0",
			pass: noDur.length === 0,
			detail: "Sin metrado y rendimiento (o PERT) la actividad cuenta como 0 días y no aporta a la ruta crítica.",
			items: names(noDur)
		});
		const near = withRow.filter((n) => rows[n.id].tf > 1e-9 && rows[n.id].tf <= plan.nearCriticalDays + 1e-9);
		add({
			key: "near",
			label: "Ruta casi crítica (holgura ≤ " + plan.nearCriticalDays + " d)",
			count: near.length,
			total: withRow.length,
			pct: pct(near.length, withRow.length),
			limit: plan.nearCriticalDefined ? "umbral del Plan del Cronograma" : "umbral por omisión: el Plan no lo define",
			pass: null,
			detail: "Actividades con holgura pequeña: un retraso leve las vuelve críticas. Se vigilan igual que la ruta crítica.",
			items: names(near)
		});
		const crit = withRow.filter((n) => rows[n.id].critical || rows[n.id].tf <= 1e-9);
		add({
			key: "critShare",
			label: "Peso de la ruta crítica",
			count: crit.length,
			total: withRow.length,
			pct: pct(crit.length, withRow.length),
			limit: "referencia (sin umbral)",
			pass: null,
			detail: "Si casi todo es crítico, la red no tiene holgura para absorber imprevistos: cualquier retraso mueve el fin.",
			items: []
		});
		const graded = checks.filter((c) => c.pass !== null);
		return {
			checks,
			evaluated: graded.length,
			passed: graded.filter((c) => c.pass).length,
			nearCritical: near.length,
			activities: acts.length
		};
	}
	function makeSnapshot(nodes, rows, projectDuration, startDate, finishDate, nearCriticalDays) {
		return {
			projectDuration,
			startDate,
			finishDate,
			nearCriticalDays,
			rows: nodes.filter((n) => rows[n.id]).map((n) => ({
				id: n.id,
				code: n.code,
				name: n.name,
				isMilestone: n.isMilestone,
				dur: n.dur,
				es: rows[n.id].es,
				ef: rows[n.id].ef,
				tf: rows[n.id].tf,
				critical: rows[n.id].critical
			}))
		};
	}
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var fin = (v, d = 0) => {
		const x = Number(v);
		return isFinite(x) ? x : d;
	};
	function normalizeBaseline(o) {
		if (!o || typeof o !== "object") return null;
		const x = o, s = x.snapshot;
		if (!s || typeof s !== "object" || !Array.isArray(s.rows) || !isFinite(Number(s.projectDuration))) return null;
		const rows = s.rows.filter((r) => r && typeof r === "object").map((r) => {
			const q = r;
			return {
				id: str(q.id),
				code: str(q.code),
				name: str(q.name),
				isMilestone: !!q.isMilestone,
				dur: fin(q.dur),
				es: fin(q.es),
				ef: fin(q.ef),
				tf: fin(q.tf),
				critical: !!q.critical
			};
		}).filter((r) => r.id);
		const log = (Array.isArray(x.log) ? x.log : []).filter((e) => e && typeof e === "object").map((e) => {
			const q = e;
			return {
				version: str(q.version),
				date: str(q.date),
				reason: str(q.reason),
				approver: str(q.approver),
				sponsorAuth: !!q.sponsorAuth,
				projectDuration: fin(q.projectDuration),
				finishDate: str(q.finishDate),
				deviationPct: q.deviationPct === null || q.deviationPct === void 0 ? null : fin(q.deviationPct)
			};
		});
		return {
			frozen: x.frozen !== false,
			version: str(x.version) || "LB-1",
			date: str(x.date),
			snapshot: {
				projectDuration: fin(s.projectDuration),
				startDate: str(s.startDate),
				finishDate: str(s.finishDate),
				nearCriticalDays: fin(s.nearCriticalDays, 10),
				rows
			},
			log
		};
	}
	var nextVersion = (b) => "LB-" + ((b && b.log.length || 0) + 1);
	function deviationPct(base, projectDuration) {
		return base.projectDuration > 0 ? (projectDuration - base.projectDuration) / base.projectDuration * 100 : null;
	}
	function needsSponsor(base, projectDuration, plan) {
		if (!base || !(plan.rebaselinePct > 0)) return false;
		const d = deviationPct(base, projectDuration);
		return d !== null && Math.abs(d) > plan.rebaselinePct + 1e-9;
	}
	function compareBaseline(base, nodes, rows, projectDuration, plan) {
		const bmap = {};
		base.rows.forEach((r) => {
			bmap[r.id] = r;
		});
		const cur = {};
		nodes.forEach((n) => {
			cur[n.id] = n;
		});
		const durationDelta = projectDuration - base.projectDuration, reserveDays = base.projectDuration * plan.reservePct / 100;
		const changed = [];
		nodes.forEach((n) => {
			const b = bmap[n.id], r = rows[n.id];
			if (!b || !r) return;
			const efDelta = r.ef - b.ef, durDelta = n.dur - b.dur;
			if (Math.abs(efDelta) > 1e-6 || Math.abs(durDelta) > 1e-6) changed.push({
				id: n.id,
				code: n.code,
				name: n.name,
				efDelta,
				durDelta,
				tfBase: b.tf,
				tfNow: r.tf
			});
		});
		changed.sort((a, b) => Math.abs(b.efDelta) - Math.abs(a.efDelta) || a.code.localeCompare(b.code));
		const items = [], newCritical = [];
		base.rows.forEach((b) => {
			const r = rows[b.id], n = cur[b.id];
			if (!r || !n || b.isMilestone) return;
			if (b.tf > 1e-9 && b.tf <= base.nearCriticalDays + 1e-9) {
				items.push({
					id: b.id,
					code: b.code,
					name: b.name,
					tfBase: b.tf,
					tfNow: r.tf,
					consumedPct: Math.max(0, (b.tf - r.tf) / b.tf * 100)
				});
				if (r.tf <= 1e-9) newCritical.push(b.code + " " + b.name);
			}
		});
		const meanPct = items.length ? items.reduce((s, i) => s + i.consumedPct, 0) / items.length : 0, maxPct = items.reduce((m, i) => Math.max(m, i.consumedPct), 0);
		const level = !items.length ? null : meanPct >= plan.floatRed - 1e-9 ? "rojo" : meanPct <= plan.floatGreen + 1e-9 ? "verde" : "ambar";
		return {
			durationDelta,
			durationDeltaPct: deviationPct(base, projectDuration),
			reserveDays,
			reserveConsumedPct: reserveDays > 0 ? Math.max(0, durationDelta) / reserveDays * 100 : null,
			changed,
			added: nodes.filter((n) => !bmap[n.id]).map((n) => n.code + " " + n.name),
			removed: base.rows.filter((r) => !cur[r.id]).map((r) => r.code + " " + r.name),
			near: {
				items: items.sort((a, b) => b.consumedPct - a.consumedPct),
				meanPct,
				maxPct,
				level,
				newCritical
			}
		};
	}
	//#endregion
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
	var loadedProjectId = null;
	var session = null;
	var projectStale = false;
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
				if (e.key === "Escape") {
					done(false);
					return;
				}
				if (e.key !== "Tab") return;
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
		const tree = treeRows();
		const milestones = act.milestones || [];
		const knownLeafIds = {};
		tree.forEach((r) => {
			if (r.kind === "package") knownLeafIds[r.id] = true;
		});
		const loose = placeLooseMilestones(milestones, knownLeafIds);
		function pushMilestone(m, leafId) {
			out.push({
				netId: n++,
				kind: "activity",
				code: m.code,
				name: m.name,
				activityId: m.id,
				leafId,
				det: 0,
				te: null,
				variance: null,
				pertValid: void 0,
				isMilestone: true
			});
		}
		loose.start.forEach((m) => pushMilestone(m));
		tree.forEach((r) => {
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
				milestones.filter((m) => m.leafId === r.id).forEach((m) => pushMilestone(m, r.id));
				(loose.afterLeaf[r.id] || []).forEach((m) => pushMilestone(m));
			}
		});
		loose.orphan.forEach((m) => pushMilestone(m));
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
	function isMilestoneOf(snap) {
		const m = {};
		snap.forEach((r) => {
			if (r.activityId && r.isMilestone) m[r.activityId] = true;
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
		renderControl(R);
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
				html += "<tr class='act-row" + (crit ? " crit" : "") + (r.isMilestone ? " milestone-row" : "") + "'><td class='n-cell'>" + r.netId + "</td><td class='code-cell" + (r.isMilestone ? " milestone-code" : "") + "'>" + (r.isMilestone ? "◆ " : "") + esc(r.code) + "</td><td class='act-name'>" + esc(r.name) + (crit ? " <span class='crit-badge'>CRÍTICA</span>" : "") + (r.isMilestone ? " <span class='milestone-tag'>Hito</span>" : node.hasDur ? "" : " <span style='color:var(--warn);font-size:10px' title='La actividad no tiene metrado/rendimiento ni PERT: dur=0'>⚠ sin duración</span>") + "</td><td class='num'" + (r.isMilestone ? " title='Los hitos tienen duración cero por definición'" : "") + ">" + (dur != null ? fmt(dur) : "—") + "</td><td class='num'>" + (row ? fmt(row.es) : "—") + "</td><td class='num'>" + (row ? fmt(row.ef) : "—") + "</td><td class='num'>" + (row ? fmt(row.ls) : "—") + "</td><td class='num'>" + (row ? fmt(row.lf) : "—") + "</td><td class='num" + (crit ? " tf-crit" : "") + "'>" + (row ? fmt(row.tf) : "—") + "</td><td class='num'>" + (row ? fmt(row.ff) : "—") + "</td><td class='l num' style='font-size:11px'>" + esc(preds || "—") + "</td><td>" + au + "</td></tr>";
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
		if (R.cpm.ok && R.cpm.elapsedApprox) out.push({
			c: "warn",
			ic: "⚠",
			t: "Hay desfases en <b>días transcurridos</b> y el proyecto no tiene fecha de inicio: se convierten con una proporción semanal <b>aproximada</b>. Define la fecha de inicio en el Panel para calcularlos sobre fechas reales (fines de semana y feriados)."
		});
		if (!hasLinks) out.push({
			c: "warn",
			ic: "▤",
			t: "Aún no hay enlaces. Usa <b>⇧ Importar desde Excel</b> o <b>＋ Enlace manual</b> para construir la red."
		});
		else if (R.cpm.ok && !R.val.dangling.length && !R.val.selfLoops.length) out.push({
			c: "ok",
			ic: "✓",
			t: "Red válida y acíclica — CPM calculado."
		});
		box.innerHTML = out.map((i) => "<div class='issue " + i.c + "'><span class='ic'>" + i.ic + "</span><span>" + i.t + "</span></div>").join("");
	}
	function criticalPertSums(R) {
		if (!R.cpm.ok) return {
			mean: 0,
			sumVar: 0,
			allValid: false,
			count: 0,
			reason: "empty"
		};
		const idx = {};
		R.snap.forEach((r) => {
			if (r.kind === "activity") idx[r.activityId] = r;
		});
		const usable = (r) => !!r && r.te != null && r.variance != null && r.pertValid !== false;
		const ids = R.nodes.map((n) => n.id), seen = {};
		ids.forEach((i) => {
			seen[i] = true;
		});
		const nodes = R.nodes.map((n) => ({
			id: n.id,
			dur: usable(idx[n.id]) ? idx[n.id].te : n.det != null ? n.det : 0
		}));
		const links = R.links.filter((l) => seen[l.from] && seen[l.to] && l.from !== l.to);
		const res = GPI.util.cpm(nodes, links, calData(), {});
		const vars = {};
		ids.forEach((i) => {
			if (usable(idx[i])) vars[i] = idx[i].variance;
		});
		const ch = GPI.util.pertCriticalChain(res, links, calData(), vars);
		if (!ch.ok) return {
			mean: 0,
			sumVar: 0,
			allValid: false,
			count: res.ok ? res.criticalIds.length : 0,
			reason: ch.reason
		};
		const allValid = Object.keys(ch.weights).every((id) => {
			const r = idx[id];
			return !!r && (r.isMilestone || usable(r));
		});
		return {
			mean: ch.mean,
			sumVar: ch.variance,
			allValid,
			count: ch.ids.length
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
		if (s.reason === "parallel") {
			out.innerHTML = "<div class='p'>—</div><div class='z'>no aplicable: hay <b>" + s.count + "</b> actividades críticas en ramas paralelas o convergentes. PERT de una sola ruta no vale ahí (subestima el riesgo: el fin depende de que TODAS las ramas terminen a tiempo) — requiere simular la red completa</div>";
			return;
		}
		if (s.reason === "elapsed") {
			out.innerHTML = "<div class='p'>—</div><div class='z'>no aplicable: la ruta crítica tiene desfases en <b>días transcurridos</b>, que se calculan sobre fechas reales (fines de semana y feriados) y no son un tiempo fijo que sumar a la media PERT. Exprésalos en días laborables para obtener la probabilidad</div>";
			return;
		}
		if (s.reason) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>no aplicable: no se pudo aislar una ruta crítica única</div>";
			return;
		}
		if (!s.allValid) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>completa O/M/P en PERT para la ruta crítica</div>";
			return;
		}
		if (!isFinite(t) || t <= 0) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>E[T]=" + fmt(s.mean) + " d · ingresa un plazo objetivo</div>";
			return;
		}
		const pr = GPI.util.pertProbability(s.mean, s.sumVar, t);
		if (!pr) {
			out.innerHTML = "<div class='p'>—</div><div class='z'>E[T]=" + fmt(s.mean) + " d · sin varianza en la ruta crítica (σ=0): no hay incertidumbre que evaluar</div>";
			return;
		}
		out.innerHTML = "<div class='p'>" + Math.round(pr.prob * 1e3) / 10 + "%</div><div class='z'>P(fin ≤ " + fmt(t) + " d) · Z=" + fmt(pr.z) + " · E[T]=" + fmt(s.mean) + " σ=" + fmt(pr.sigma) + "</div>";
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
			"gantt",
			"control"
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
		const cmap = codeOf(R.snap), nmap = nameOf(R.snap), msmap = isMilestoneOf(R.snap), NW = 168, NH = 78, GX = 58, MX = 22, MY = 22;
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
			const nm = (msmap[id] ? "◆ " : "") + (nmap[id] || ""), nmS = nm.length > 24 ? nm.slice(0, 23) + "…" : nm;
			const dur = row.ef - row.es;
			svg += "<g>";
			svg += "<rect x='" + p.x + "' y='" + p.y + "' width='168' height='78' rx='9' fill='" + fill + "' stroke='" + stroke + "' stroke-width='" + (crit ? 2 : 1.3) + "'/>";
			svg += "<rect x='" + p.x + "' y='" + p.y + "' width='168' height='19' rx='9' fill='" + band + "'/><rect x='" + p.x + "' y='" + (p.y + 10) + "' width='168' height='9' fill='" + band + "'/>";
			svg += "<text x='" + (p.x + 14) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='700' fill='#fff'>" + fmt(row.es) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='800' fill='#fff' text-anchor='middle'>" + fmt(dur) + "d</text>";
			svg += "<text x='" + (p.x + NW - 14) + "' y='" + (p.y + 13.5) + "' font-size='10.5' font-weight='700' fill='#fff' text-anchor='end'>" + fmt(row.ef) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 37) + "' font-size='11' font-weight='700' fill='#1a2027' text-anchor='middle' style='font-family:var(--display)'>" + esc(nmS) + "</text>";
			svg += "<text x='" + (p.x + NW / 2) + "' y='" + (p.y + 50) + "' font-size='9' fill='#6c5ce7' text-anchor='middle'>" + (msmap[id] ? "Hito " : "EDT ") + esc(cmap[id] || "") + "</text>";
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
		const baseSnap = normalizeBaseline(state().baseline), bmap = {};
		if (baseSnap) baseSnap.snapshot.rows.forEach((r) => {
			bmap[r.id] = r;
		});
		const D = Math.max(1, Math.ceil(Math.max(R.cpm.projectDuration, baseSnap ? baseSnap.snapshot.projectDuration : 0)));
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
			let nm = (r.isMilestone ? "◆ " : "") + (codeOf(R.snap)[r.activityId] || "") + " " + (r.name || "");
			if (nm.length > 30) nm = nm.slice(0, 29) + "…";
			svg += "<text x='10' y='" + (y + RH / 2 + 3) + "' font-size='10.5' fill='#1a2027' style='font-family:var(--display);font-weight:600'>" + esc(nm) + "</text>";
			const bx = LW + row.es * dayW, bw = Math.max(4, (row.ef - row.es) * dayW);
			svg += "<rect x='" + bx + "' y='" + (y + 4) + "' width='" + bw + "' height='14' rx='4' fill='" + col + "' opacity='" + (crit ? 1 : .85) + "'/>";
			if (row.tf > 1e-6) {
				const sx = LW + row.ef * dayW, sw = row.tf * dayW;
				svg += "<rect x='" + sx + "' y='" + (y + RH / 2 - 1.5) + "' width='" + sw + "' height='3' fill='#c7d3de'/>";
			}
			svg += "<text x='" + (bx + bw + 5) + "' y='" + (y + RH / 2 + 3) + "' font-size='9' fill='#6b7684'>" + fmt(row.ef - row.es) + "d</text>";
			const bb = bmap[r.activityId];
			if (bb) svg += "<rect x='" + (LW + bb.es * dayW) + "' y='" + (y + RH - 6) + "' width='" + Math.max(3, (bb.ef - bb.es) * dayW) + "' height='3' rx='1.5' fill='#5b6472'><title>Línea base " + esc(baseSnap.version) + "</title></rect>";
		});
		if (baseSnap) svg += "<text x='" + (W - 8) + "' y='14' font-size='10' font-weight='700' fill='#5b6472' text-anchor='end'>▬ línea base " + esc(baseSnap.version) + "</text>";
		svg += "</svg>";
		wrap.innerHTML = svg;
	}
	function controlNodes(R) {
		const cm = codeOf(R.snap), nm = nameOf(R.snap), ms = isMilestoneOf(R.snap);
		return R.nodes.map((n) => ({
			id: n.id,
			code: cm[n.id] || n.id,
			name: nm[n.id] || "",
			isMilestone: !!ms[n.id],
			hasDur: n.hasDur,
			dur: n.dur
		}));
	}
	function controlPlan() {
		return planOf(mode === "sample" ? null : spLive);
	}
	var d1 = (v) => String(Math.round(v * 10) / 10);
	var sg = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + d1(Math.abs(v));
	function renderControl(R) {
		const box = document.getElementById("ctlWrap");
		if (!R.cpm.ok) {
			box.innerHTML = "<div class='empty-state'>La red tiene un ciclo: corrígela para evaluar su salud y fijar una línea base.</div>";
			return;
		}
		if (!R.nodes.length) {
			box.innerHTML = "<div class='empty-state'>Aún no hay actividades en la red.</div>";
			return;
		}
		const nodes = controlNodes(R), plan = controlPlan(), rows = R.cpm.rows;
		const health = scheduleHealth(nodes, R.links, rows, plan);
		const base = normalizeBaseline(state().baseline);
		const pill = (p) => p === null ? "<span class='ctl-pill info'>info</span>" : p ? "<span class='ctl-pill ok'>✓ cumple</span>" : "<span class='ctl-pill bad'>✗ no cumple</span>";
		const hrows = health.checks.map((c) => "<tr><td><b>" + esc(c.label) + "</b><div class='ctl-items'>" + esc(c.detail) + (c.items.length ? "<br>" + c.items.map(esc).join(" · ") : "") + "</div></td><td class='num'>" + c.count + " / " + c.total + " (" + d1(c.pct) + " %)</td><td>" + esc(c.limit) + "</td><td>" + pill(c.pass) + "</td></tr>").join("");
		const healthHtml = "<div class='ctl-card'><h3>Salud de la red</h3><p class='sub'>Antes de fiarte de la ruta crítica, revisa la calidad de la red. Verificaciones tipo <b>DCMA 14-Point Assessment</b> (valores de <b>referencia</b> de la industria: orientan, no bloquean). <b>" + health.passed + " de " + health.evaluated + "</b> verificaciones cumplen.</p><table class='ctl'><thead><tr><th>Verificación</th><th class='num'>Resultado</th><th>Umbral de referencia</th><th>Estado</th></tr></thead><tbody>" + hrows + "</tbody></table><div class='ctl-note'>No se evalúan las restricciones duras de fecha, los recursos ni el avance real: la suite no los modela. La ruta casi crítica usa el umbral del Plan de Gestión del Cronograma (" + plan.nearCriticalDays + " d" + (plan.nearCriticalDefined ? "" : ", valor por omisión: el plan no lo define") + ").</div></div>";
		let baseHtml;
		if (!base) baseHtml = "<div class='ctl-card'><h3>Línea base del cronograma</h3><p class='sub'>Todavía no hay una línea base. Es la <b>versión aprobada</b> del cronograma contra la que se mide la variación: sin ella el pronóstico solo se compara consigo mismo. Fíjala cuando el cronograma esté aprobado; después solo cambia por control de cambios (nueva versión LB-n, con motivo y aprobador).</p><button class='btn violet' id='btnBaseline'>✚ Fijar la línea base (LB-1)</button></div>";
		else {
			const cmp = compareBaseline(base.snapshot, nodes, rows, R.cpm.projectDuration, plan), bs = base.snapshot;
			const lvl = cmp.near.level ? "<span class='ctl-pill " + cmp.near.level + "'>" + cmp.near.level.toUpperCase() + "</span>" : "<span class='ctl-pill info'>sin ruta casi crítica</span>";
			const kp = (v, k) => "<div class='ctl-kpi'><div class='v'>" + v + "</div><div class='k'>" + k + "</div></div>";
			const kpis = "<div class='ctl-kpis'>" + kp(d1(bs.projectDuration) + " → " + d1(R.cpm.projectDuration) + " d", "duración: línea base → pronóstico") + kp(sg(cmp.durationDelta) + " d" + (cmp.durationDeltaPct !== null ? " (" + sg(cmp.durationDeltaPct) + " %)" : ""), "desplazamiento del fin del proyecto") + kp(cmp.reserveConsumedPct === null ? "—" : d1(cmp.reserveConsumedPct) + " %", plan.reservePct > 0 ? "reserva de cronograma consumida (" + d1(cmp.reserveDays) + " d = " + plan.reservePct + " %)" : "reserva de cronograma: el plan no la define") + kp(cmp.near.items.length ? d1(cmp.near.meanPct) + " %" : "—", "consumo medio de holgura, ruta casi crítica") + "</div>";
			const nearRows = cmp.near.items.slice(0, 8).map((i) => "<tr><td class='mono'>" + esc(i.code) + "</td><td>" + esc(i.name) + "</td><td class='num'>" + d1(i.tfBase) + " → " + d1(i.tfNow) + " d</td><td class='num'>" + d1(i.consumedPct) + " %</td></tr>").join("");
			const chRows = cmp.changed.slice(0, 12).map((c) => "<tr><td class='mono'>" + esc(c.code) + "</td><td>" + esc(c.name) + "</td><td class='num'>" + sg(c.durDelta) + " d</td><td class='num'>" + sg(c.efDelta) + " d</td><td class='num'>" + d1(c.tfBase) + " → " + d1(c.tfNow) + "</td></tr>").join("");
			const logRows = base.log.slice().reverse().map((e) => "<tr><td class='mono'>" + esc(e.version) + "</td><td>" + esc(e.date) + "</td><td>" + esc(e.reason) + "</td><td>" + esc(e.approver) + (e.sponsorAuth ? " (sponsor autorizó)" : "") + "</td><td class='num'>" + d1(e.projectDuration) + " d</td><td class='num'>" + (e.deviationPct === null ? "—" : sg(e.deviationPct) + " %") + "</td></tr>").join("");
			baseHtml = "<div class='ctl-card'><h3>Línea base del cronograma · " + esc(base.version) + "</h3><p class='sub'>Fijada el <b>" + esc(base.date) + "</b> · fin " + esc(bs.finishDate || "—") + ". El pronóstico es el CPM actual (con los cambios de duración y de enlaces desde entonces). El Gantt muestra la línea base como una marca gris bajo cada barra.</p>" + kpis + "<div class='ctl-note' style='margin:0 0 12px'><b>Consumo de holgura de la ruta casi crítica: " + lvl + "</b> — umbral del plan: verde ≤ " + plan.floatGreen + " %, rojo ≥ " + plan.floatRed + " %. " + (cmp.near.newCritical.length ? "Pasaron a ser críticas: " + esc(cmp.near.newCritical.slice(0, 4).join(", ")) + ". " : "") + (cmp.added.length || cmp.removed.length ? "Actividades nuevas: " + cmp.added.length + " · quitadas: " + cmp.removed.length + " desde la línea base." : "") + "</div>" + (nearRows ? "<h4 style='font-size:12px;margin:8px 0 4px'>Ruta casi crítica (holgura ≤ " + bs.nearCriticalDays + " d en la línea base)</h4><table class='ctl'><thead><tr><th>Cód.</th><th>Actividad</th><th class='num'>Holgura</th><th class='num'>Consumida</th></tr></thead><tbody>" + nearRows + "</tbody></table>" : "") + (chRows ? "<h4 style='font-size:12px;margin:12px 0 4px'>Actividades que cambiaron (mayor desplazamiento primero)</h4><table class='ctl'><thead><tr><th>Cód.</th><th>Actividad</th><th class='num'>Δ duración</th><th class='num'>Δ fin</th><th class='num'>Holgura</th></tr></thead><tbody>" + chRows + "</tbody></table>" + (cmp.changed.length > 12 ? "<div class='ctl-items'>… y " + (cmp.changed.length - 12) + " más.</div>" : "") : "<div class='ctl-items' style='margin-top:8px'>Ninguna actividad cambió de duración ni de fin desde la línea base.</div>") + "<h4 style='font-size:12px;margin:12px 0 4px'>Versiones de la línea base</h4><table class='ctl'><thead><tr><th>Versión</th><th>Fecha</th><th>Motivo</th><th>Aprobó</th><th class='num'>Duración</th><th class='num'>Desviación</th></tr></thead><tbody>" + logRows + "</tbody></table><div style='margin-top:12px'><button class='btn violet' id='btnBaseline'>✚ Nueva versión de la línea base (" + esc(nextVersion(base)) + ")…</button></div></div>";
		}
		const planHtml = "<div class='ctl-card'><h3>Umbrales del Plan de Gestión del Cronograma que se aplican aquí</h3><table class='ctl'><tbody><tr><td>Ruta casi crítica (holgura ≤)</td><td class='num'>" + plan.nearCriticalDays + " d</td><td>" + (plan.nearCriticalDefined ? "del plan" : "por omisión (el plan no lo define)") + "</td></tr><tr><td>Reserva de cronograma</td><td class='num'>" + plan.reservePct + " %</td><td>" + (plan.reservePct > 0 ? "del plan" : "el plan no la define") + "</td></tr><tr><td>Umbral de rebaselinado (desviación de la duración)</td><td class='num'>" + plan.rebaselinePct + " %</td><td>" + (plan.rebaselinePct > 0 ? "del plan: por encima, autoriza el sponsor" : "el plan no lo define: no se exige al sponsor") + "</td></tr><tr><td>Consumo de holgura de la ruta casi crítica</td><td class='num'>verde ≤ " + plan.floatGreen + " % · rojo ≥ " + plan.floatRed + " %</td><td>del plan (o 40 / 70 por omisión)</td></tr></tbody></table>" + (mode === "sample" ? "<div class='ctl-note'>Modo ejemplo: sin proyecto, se usan los valores por omisión.</div>" : "") + "</div>";
		box.innerHTML = baseHtml + healthHtml + planHtml;
		const b = document.getElementById("btnBaseline");
		if (b) b.addEventListener("click", () => openBaselineDialog(runCpm()));
	}
	function openBaselineDialog(R) {
		if (!R.cpm.ok) {
			showAlert("La red tiene un ciclo: corrígela antes de fijar la línea base.");
			return;
		}
		const plan = controlPlan(), base = normalizeBaseline(state().baseline), version = nextVersion(base), first = !base;
		const dev = base ? deviationPct(base.snapshot, R.cpm.projectDuration) : null, sponsor = needsSponsor(base ? base.snapshot : null, R.cpm.projectDuration, plan);
		const html = "<div class='ctl-form'><p style='font-size:12.5px;margin:0'>" + (first ? "Se guarda una <b>instantánea</b> del cronograma actual (" + d1(R.cpm.projectDuration) + " d laborables" + (R.cpm.projectFinishDate ? ", fin " + esc(R.cpm.projectFinishDate) : "") + ") como la versión aprobada contra la que se medirá la variación." : "Se reemplaza la línea base " + esc(base.version) + " (" + d1(base.snapshot.projectDuration) + " d) por el cronograma actual (" + d1(R.cpm.projectDuration) + " d): desviación " + (dev === null ? "—" : sg(dev) + " %") + ". El historial conserva la versión anterior.") + "</p><label>Motivo</label><input type='text' id='blReason' value='" + (first ? "Línea base inicial aprobada" : "") + "' placeholder='" + (first ? "" : "Ej. Orden de cambio OC-002: ampliación de sala eléctrica") + "'><label>Quién aprueba (Sponsor, CCB…)</label><input type='text' id='blApprover' placeholder='Sponsor / CCB'>" + (sponsor ? "<label style='display:flex;gap:8px;align-items:flex-start;font-weight:600'><input type='checkbox' id='blSponsor' style='margin-top:2px'><span>El <b>sponsor autorizó</b> esta nueva versión: la desviación de la duración (" + sg(dev) + " %) supera el umbral de rebaselinado del plan (" + plan.rebaselinePct + " %).</span></label>" : "") + "<div class='msg' id='blMsg'></div><div style='text-align:right;margin-top:10px'><button class='btn violet' id='blOk'>" + (first ? "Fijar la línea base" : "Fijar " + esc(version)) + "</button></div></div>";
		showModalHTML({
			title: first ? "Fijar la línea base del cronograma" : "Nueva versión de la línea base (" + version + ")",
			html,
			confirmText: null,
			cancelText: "Cancelar",
			afterOpen: (card) => {
				const g = (id) => card.querySelector("#" + id);
				g("blOk").onclick = () => {
					const reason = g("blReason").value.trim(), approver = g("blApprover").value.trim(), sp = sponsor ? g("blSponsor").checked : false;
					const msg = !reason ? "Indica el motivo." : !approver ? "Registra quién aprueba la línea base." : sponsor && !sp ? "Esta desviación supera el umbral del plan: confirma la autorización del sponsor." : "";
					if (msg) {
						card.querySelector("#blMsg").textContent = msg;
						return;
					}
					const nodes = controlNodes(R), today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
					const snapshot = makeSnapshot(nodes, R.cpm.ok ? R.cpm.rows : {}, R.cpm.ok ? R.cpm.projectDuration : 0, R.cpm.ok ? R.cpm.projectStart : "", R.cpm.ok ? R.cpm.projectFinishDate : "", plan.nearCriticalDays);
					const entry = {
						version,
						date: today,
						reason,
						approver,
						sponsorAuth: sp,
						projectDuration: snapshot.projectDuration,
						finishDate: snapshot.finishDate,
						deviationPct: dev
					};
					state().baseline = {
						frozen: true,
						version,
						date: today,
						snapshot,
						log: (base ? base.log : []).concat([entry])
					};
					document.getElementById("modalCancel").click();
					commit("Línea base " + version + " fijada (" + d1(snapshot.projectDuration) + " d).");
				};
			}
		});
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
	function markProjectStale() {
		if (projectStale) return;
		projectStale = true;
		setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
		const banner = document.getElementById("banner");
		if (banner) {
			banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el cronograma aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
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
		const r = pushWithSession(window.GPI, "schedule", "El cronograma", stateLive, {
			name: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value
		}, session, {
			setStatus,
			onStale: markProjectStale
		});
		session = r.session;
		return r.ok;
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
			return acts.map((a) => "<option value='" + a.activityId + "'>" + esc(a.netId + " · " + (a.isMilestone ? "Hito " : "EDT ") + a.code + " · " + a.name) + "</option>").join("");
		}
		function listHTML() {
			const ls = state().links || [];
			if (!ls.length) return "<div style='color:#8992a3;font-size:12px;padding:8px'>Sin enlaces todavía.</div>";
			return ls.map((l) => {
				const lg = Number(l.lag) ? (l.lag > 0 ? "+" : "") + l.lag + unitTag(l.lagUnit) : "";
				return "<div class='row'><span>" + esc((nn[l.from] != null ? nn[l.from] : "?") + " " + (nm[l.from] || "?") + "  →  " + (nn[l.to] != null ? nn[l.to] : "?") + " " + (nm[l.to] || "?")) + " <b style='color:#6c5ce7'>[" + (l.type || "FS") + lg + "]</b></span><button class='btn sm danger rm-lk' data-id='" + l.id + "' title='Eliminar enlace' aria-label='Eliminar enlace'>✕</button></div>";
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
		m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(str);
		if (m) {
			const d = +m[1], mo = +m[2];
			let y = +m[3];
			if (y < 100) y += 2e3;
			return y + "-" + pad2(mo) + "-" + pad2(d);
		}
		return "";
	}
	function excelSerialToISODate(serial) {
		const d = new Date(Date.UTC(1899, 11, 30) + serial * 864e5);
		return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
	}
	function cellToDate(raw) {
		const s = String(raw == null ? "" : raw).trim();
		if (!s) return "";
		if (/^\d+(\.\d+)?$/.test(s)) {
			const n = Number(s);
			if (n > 0 && n < 6e4) return excelSerialToISODate(n);
		}
		return parseDateCell(s);
	}
	function buildImportResult(pasted) {
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
		"colgante": "Referencia a un Id. que no existe entre las actividades.",
		"auto-enlace": "La actividad dependería de sí misma.",
		"fila-sin-correspondencia": "Id. sin correspondencia con una actividad (re-exporta la plantilla).",
		"nombre-no-coincide": "El nombre no coincide con la actividad de ese Id. — ¿editaste la EDT? Re-exporta la plantilla.",
		"predecesoras-en-resumen": "Predecesoras escritas en una fila resumen (ignoradas).",
		"predecesoras-en-proyecto": "Predecesoras escritas en la fila del proyecto (ignoradas).",
		"sin-id": "No se pudo leer el Id. de la predecesora.",
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
				return "<div class='row'><span>" + esc(e.toName || e.name || (e.fromNet != null ? "Id. " + e.fromNet : "")) + "</span><span class='reason'>" + esc(REASON[e.reason] || e.reason) + "</span></div>";
			}).join("");
		}
		const datesN = Object.keys(a.dates).length;
		let html = "<p style='margin-bottom:10px'>Se interpretaron <b>" + a.pastedCount + "</b> fila(s) del archivo. Nada se guarda hasta que confirmes.</p>";
		html += sec("✔ Enlaces a crear", a.links.length, "cnt-ok", okList);
		if (a.rejected.length) html += sec("✖ Enlaces rechazados", a.rejected.length, "cnt-bad", errList(a.rejected));
		if (a.rowErrors.length) html += sec("⚠ Filas con problema", a.rowErrors.length, "cnt-warn", errList(a.rowErrors));
		if (a.parseErrors.length) html += sec("⚠ Predecesoras no interpretables", a.parseErrors.length, "cnt-warn", a.parseErrors.map((e) => "<div class='row'><span>Id. " + e.netId + " · «" + esc(e.raw) + "»</span><span class='reason warn'>" + esc(REASON[e.reason] || e.reason) + "</span></div>").join(""));
		if (a.duplicates.length) html += sec("● Duplicados (colapsados)", a.duplicates.length, "cnt-warn", "");
		html += sec("📅 Fechas para auditoría", datesN, "cnt-ok", "");
		if (a.canApply) html += "<div class='radio-row'><label><input type='radio' name='mergeMode' value='merge' checked> Fusionar con lo existente</label><label><input type='radio' name='mergeMode' value='replace'> Reemplazar todo</label></div>";
		else html += "<div class='issue warn' style='margin-top:8px'><span class='ic'>⚠</span><span>No hay nada aplicable. Revisa que completaste la columna <b>Predecesoras</b> con los Id. de esta plantilla.</span></div>";
		return html;
	}
	function applyImport(a, mergeMode) {
		const st = state();
		const newLinks = a.links.map((l) => ({
			...l,
			id: newLinkId(),
			source: "import"
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
			tool: "xlsx-import",
			rowMap,
			dates
		};
		commit("Cronograma importado y aplicado (" + newLinks.length + " enlace[s]). Las fechas quedan como auditoría.");
	}
	function xmlEsc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	var DATA_SHEET_NAME = "Cronograma";
	var TEMPLATE_HEADERS = [
		"Id.",
		"Nombre",
		"Duración (d)",
		"Comienzo",
		"Fin",
		"Predecesoras"
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
	function templateRowModel() {
		const out = [TEMPLATE_HEADERS.map((h) => ({
			v: h,
			t: "s",
			s: 1
		}))];
		const snap = fullRowsSnapshot(), nn = netMap(snap);
		snap.forEach((r) => {
			const isAct = r.kind === "activity";
			const dur = isAct && r.det != null ? {
				v: r.det,
				t: "n"
			} : null;
			const preds = isAct ? incoming(r.activityId).map((l) => linkToken(l, nn)).filter(Boolean).join("; ") : "";
			out.push([
				{
					v: r.netId,
					t: "n",
					s: 2
				},
				{
					v: r.name || "",
					t: "s",
					s: 0
				},
				dur,
				null,
				null,
				preds ? {
					v: preds,
					t: "s",
					s: 0
				} : null
			]);
		});
		return out;
	}
	function templateInstructions() {
		return [
			["Cómo completar esta plantilla", 25],
			["", 0],
			["0. Si guardas todo el proyecto en un solo libro de Excel (varias hojas para varios módulos), esta hoja debe llamarse exactamente “Cronograma” y sus encabezados deben coincidir EXACTAMENTE con los de esta plantilla (se puede reordenar columnas, pero no renombrarlas ni abreviarlas): al importar se verifican ambas cosas y se rechaza el archivo si no calzan.", 4],
			["1. Las columnas “Id.” y “Nombre” son de referencia — no las edites ni las borres: son la clave con la que este simulador reconoce cada fila al importar el archivo de vuelta (el mismo Id. correlativo que ya se ve en pantalla, y en Definir las Actividades/Estimar los Costos). Si el nombre de esa fila ya no coincide, en el proyecto actual, con lo que había cuando exportaste este archivo (por ejemplo, se editaron las actividades después), esa fila se rechaza al importar — vuelve a exportar la plantilla actualizada.", 4],
			["2. “Duración” es de referencia — se recalcula sola en pantalla a partir del metrado/rendimiento de cada actividad, no hace falta completarla ni se relee al importar.", 4],
			["3. “Comienzo” y “Fin” son OPCIONALES: solo sirven para auditoría, si ya tienes un cronograma real calculado en MS Project y quieres comparar sus fechas contra las que calcula este simulador (columna “Auditoría” en pantalla) — el simulador siempre recalcula las fechas solo a partir de “Predecesoras”, nunca a partir de estas dos columnas.", 4],
			["4. “Predecesoras”: escribe el/los Id. de las filas de las que depende cada actividad u hito. Sintaxis: “3” (depende del fin de la fila 3, fin-a-inicio), “3FS+2d” (fin-a-inicio con 2 días de adelanto), “7CC” (comienzo-a-comienzo), “9FC-1d” (fin-a-comienzo con 1 día de atraso). Varias predecesoras se separan con “;” o “,”.", 4],
			["5. Puedes trabajar este archivo indistintamente en Excel o en MS Project (Archivo > Abrir > Examinar > tipo “Libro de Excel”) — es el mismo .xlsx.", 4],
			["6. Guarda el archivo y vuelve a “Cronograma / CPM” > botón “⇧ Importar desde Excel” para subirlo.", 4],
			["", 0],
			["Generado por el simulador GPI — módulo Cronograma / CPM.", 4]
		].map((row) => [{
			v: row[0],
			t: "s",
			s: row[1] === 25 ? 25 : 4
		}]);
	}
	async function buildTemplateXlsxBlob() {
		const zip = new window.JSZip();
		zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>");
		zip.file("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
		zip.file("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"" + xmlEsc(DATA_SHEET_NAME) + "\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Instrucciones\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
		zip.file("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>");
		zip.file("xl/styles.xml", xlsxStylesXml());
		zip.file("xl/worksheets/sheet1.xml", xlsxSheetXml(templateRowModel(), [
			6,
			30,
			12,
			11,
			11,
			22
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
		const snap = fullRowsSnapshot(), nn = netMap(snap);
		snap.forEach((r) => {
			const isAct = r.kind === "activity";
			const dur = isAct && r.det != null ? r.det : "";
			const preds = isAct ? incoming(r.activityId).map((l) => linkToken(l, nn)).filter(Boolean).join("; ") : "";
			lines.push([
				cell(r.netId),
				cell(r.name || ""),
				cell(dur),
				"",
				"",
				cell(preds)
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
		const safe = (document.getElementById("projectTitle").value || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		if (window.JSZip) try {
			downloadBlob(await buildTemplateXlsxBlob(), "plantilla_cronograma_" + safe + ".xlsx");
			setStatus("Plantilla descargada. Completa Predecesoras (y Comienzo/Fin si quieres auditar) y vuelve a subirla con «⇧ Importar desde Excel».");
			return;
		} catch (_) {}
		downloadBlob(new Blob(["﻿" + buildTemplateCsv()], { type: "text/csv;charset=utf-8" }), "plantilla_cronograma_" + safe + ".csv");
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
		const wanted = normName(expectedName);
		const sheetEl = sheets.find((s) => normName(s.getAttribute("name") || "") === wanted);
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
	async function parseScheduleXlsx(file) {
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
		"id",
		"name",
		null,
		"start",
		"finish",
		"predecessors"
	];
	var HEADER_FIELD_BY_TEXT = {};
	TEMPLATE_HEADERS.forEach((h, i) => {
		const field = TEMPLATE_HEADER_FIELDS[i];
		if (field) HEADER_FIELD_BY_TEXT[normName(h)] = field;
	});
	function mapHeaderColumns(headerRow) {
		const map = {};
		headerRow.forEach((h, idx) => {
			const field = HEADER_FIELD_BY_TEXT[normName(h)];
			if (field) map[field] = idx;
		});
		if (map.id == null) return null;
		return map;
	}
	function rowsToPasted(rows, colMap) {
		const out = [];
		rows.forEach((row) => {
			const idStr = String(row[colMap.id] || "").trim();
			if (!/^\d+$/.test(idStr)) return;
			const name = colMap.name != null ? String(row[colMap.name] || "").trim() : "";
			const start = colMap.start != null ? cellToDate(row[colMap.start]) : "";
			const finish = colMap.finish != null ? cellToDate(row[colMap.finish]) : "";
			const predCell = colMap.predecessors != null ? String(row[colMap.predecessors] || "") : "";
			out.push({
				netId: parseInt(idStr, 10),
				name,
				start,
				finish,
				predCell
			});
		});
		return out;
	}
	async function importScheduleExcel(file) {
		if (!window.JSZip) {
			await showAlert("No se pudo cargar la librería para leer archivos .xlsx (JSZip). Recargá la página e intentá de nuevo; este archivo no llegó a leerse, no es que el .xlsx esté mal.");
			return;
		}
		let parsed;
		try {
			parsed = await parseScheduleXlsx(file);
		} catch (_) {
			await showAlert("El archivo no parece ser un .xlsx válido (¿se guardó bien o se cambió la extensión?).");
			return;
		}
		if (parsed.kind === "sheet-not-found") {
			const otras = parsed.sheetNames.filter((n) => normName(n) !== normName(DATA_SHEET_NAME));
			await showAlert("No encontré una hoja llamada «Cronograma» en este archivo" + (otras.length ? " (tiene: " + otras.join(", ") + ")" : "") + ". Si tu Excel junta varios módulos en un solo libro, la hoja con los datos a importar aquí debe llamarse exactamente «Cronograma» (como la que genera «⇩ Exportar a Excel») para que el simulador sepa cuál copiar y no la confunda con la de otro módulo.", "Hoja no reconocida");
			return;
		}
		if (parsed.kind === "empty") {
			await showAlert("El archivo no contiene datos reconocibles.");
			return;
		}
		const colMap = mapHeaderColumns(parsed.headers);
		if (!colMap) {
			await showAlert("No reconocí las columnas del archivo: los encabezados deben coincidir EXACTAMENTE con los de la plantilla (¿renombraste o abreviaste alguna, p. ej. «Id» en vez de «Id.»?). Se espera al menos la columna «Id.» escrita tal cual.");
			return;
		}
		const a = buildImportResult(rowsToPasted(parsed.rows, colMap));
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
			if (c && c.mode) applyImport(a, c.mode);
		});
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
		const cmap = codeOf(snap), nmap = nameOf(snap), nn = netMap(snap), msmap = isMilestoneOf(snap);
		const dates = state().import && state().import.dates || {};
		const now = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE");
		const s = criticalPertSums(R);
		let h = "<div class='rep-head'><div><h1>Cronograma / Ruta Crítica</h1><div class='sub'>" + esc(document.getElementById("projectTitle").value) + "</div></div><div class='rep-meta'>" + esc(document.getElementById("courseTitle").value) + "<br>" + now + "<br>PMBOK · CPM</div></div>";
		h += "<table class='rep-kv'><tr><td>Duración del proyecto</td><td class='num'>" + (cpm.ok ? fmt(cpm.projectDuration) + " días laborables" : "—") + "</td></tr><tr><td>Fecha de fin</td><td class='num'>" + (cpm.ok ? cpm.projectFinishDate || "—" : "—") + "</td></tr><tr><td>Actividades críticas</td><td class='num'>" + (cpm.ok ? cpm.criticalIds.length : "—") + "</td></tr><tr><td>Enlaces</td><td class='num'>" + (state().links || []).length + "</td></tr></table>";
		if (cpm.ok) {
			const path = cpm.criticalIds.map((id) => (msmap[id] ? "◆ " : "") + (cmap[id] || "") + " " + (nmap[id] || ""));
			h += "<h2>Ruta crítica</h2><p class='num'>" + esc(path.join("  →  ")) + "</p>";
		}
		h += "<h2>Actividades (CPM)</h2><table><tr><th>Id.</th><th>Código EDT</th><th>Actividad</th><th>Duración</th><th>ES</th><th>EF</th><th>LS</th><th>LF</th><th>Holgura Total</th><th>Predecesoras</th><th>Auditoría</th><th>Crítica</th></tr>";
		snap.filter((r) => r.kind === "activity").forEach((r) => {
			const row = cpm.ok ? cpm.rows[r.activityId] : null;
			const dur = durMode === "pert" && r.te != null ? r.te : r.det;
			const preds = incoming(r.activityId).map((l) => linkToken(l, nn)).filter(Boolean).join("; ");
			let au = "—";
			const pd = dates[r.activityId];
			if (pd && row && (nz(pd.start) || nz(pd.finish))) {
				const okS = !nz(pd.start) || pd.start === row.startDate;
				const okF = !nz(pd.finish) || pd.finish === row.finishDate;
				au = okS && okF ? "✓" : "✗";
			}
			h += "<tr><td class='num'>" + r.netId + "</td><td class='num'>" + esc(r.code) + "</td><td>" + (r.isMilestone ? "◆ " : "") + esc(r.name) + "</td><td class='num'>" + fmt(dur) + "</td><td class='num'>" + (row ? fmt(row.es) : "—") + "</td><td class='num'>" + (row ? fmt(row.ef) : "—") + "</td><td class='num'>" + (row ? fmt(row.ls) : "—") + "</td><td class='num'>" + (row ? fmt(row.lf) : "—") + "</td><td class='num'>" + (row ? fmt(row.tf) : "—") + "</td><td>" + esc(preds || "—") + "</td><td class='num'>" + au + "</td><td>" + (row && row.critical ? "●" : "") + "</td></tr>";
		});
		h += "</table>";
		h += "<p class='rep-note'>ES = Inicio Temprano (Early Start) · EF = Fin Temprano (Early Finish) · LS = Inicio Tardío (Late Start) · LF = Fin Tardío (Late Finish). Holgura Total = LS − ES; 0 = actividad crítica.</p>";
		h += "<p class='rep-note'>Predecesoras: Id. de red de la actividad de la que depende, con el tipo de relación si no es FS (fin-a-inicio) y el adelanto/atraso en días si lo hay — p. ej. “3SS+2d” significa “depende del inicio de la actividad Id. 3, con 2 días de adelanto”.</p>";
		h += "<p class='rep-note'>Auditoría: compara la fecha que calculó el simulador contra la fecha de MS Project que hayas importado con «⇧ Importar desde Excel» (columnas Comienzo/Fin, opcionales) — ✓ coinciden, ✗ difieren (revisa calendario o enlaces). Si todavía no importaste esas fechas, queda en “—”: no hay nada que auditar por ahora.</p>";
		if (s.reason === "parallel") h += "<p class='rep-note'>Probabilidad de plazo PERT: no aplicable — la ruta crítica tiene ramas paralelas o convergentes (PERT de una sola ruta subestimaría el riesgo; haría falta simular la red completa).</p>";
		else if (s.allValid) h += "<p class='rep-note'>Ruta crítica: duración esperada = " + fmt(s.mean) + " d (incluye desfases), σ² = " + fmt(s.sumVar) + " (base para la probabilidad de plazo PERT).</p>";
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
		document.getElementById("btnExportExcel").addEventListener("click", downloadTemplate);
		document.getElementById("btnImportExcel").addEventListener("click", () => {
			document.getElementById("xlsxFileInput").click();
		});
		document.getElementById("xlsxFileInput").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) importScheduleExcel(files[0]);
			e.target.value = "";
		});
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
		document.getElementById("btnLoadSampleLive").addEventListener("click", loadSampleIntoProject);
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
	function normName(s) {
		return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	}
	function findRealActivityId(code, name) {
		const target = normName(name);
		const pkg = treeRows().filter((r) => r.kind === "package" && r.code === code)[0];
		if (pkg) {
			const hit = ((actsData().byLeaf || {})[pkg.id] || []).filter((a) => normName(a.name || "") === target)[0];
			if (hit) return hit.id;
		}
		const ms = (actsData().milestones || []).filter((m) => m.code === code && normName(m.name) === target)[0];
		return ms ? ms.id : null;
	}
	async function loadSampleIntoProject() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
			await showAlert("Esto solo aplica con un proyecto activo conectado al Panel de Control. Usa \"Modo ejemplo\" para explorar el caso DISTRIB+ sin conexión.");
			return;
		}
		gpiPullAll();
		const prevMode = mode;
		mode = "live";
		const pkgs = treeRows().filter((r) => r.kind === "package");
		if (!pkgs.length) {
			mode = prevMode;
			await showAlert("La EDT del proyecto activo está vacía. Carga primero el ejemplo en WBS Builder (\"Cargar ejemplo\") y vuelve aquí.");
			return;
		}
		if (!pkgs.some((p) => ((actsData().byLeaf || {})[p.id] || []).length > 0)) {
			mode = prevMode;
			await showAlert("El proyecto activo todavía no tiene actividades. Carga primero el ejemplo en Definir las Actividades (\"⇩ Cargar ejemplo en el proyecto\") y vuelve aquí.");
			return;
		}
		const resolved = [];
		const unresolved = [];
		SAMPLE_LINK_PLAN.forEach((e) => {
			const from = findRealActivityId(e.fc, e.fn), to = findRealActivityId(e.tc, e.tn);
			if (from && to && from !== to) resolved.push({
				from,
				to,
				type: e.type,
				lag: e.lag || 0,
				lagUnit: e.lagUnit || "d"
			});
			else unresolved.push(e.fc + " \"" + e.fn + "\" → " + e.tc + " \"" + e.tn + "\"");
		});
		if (!resolved.length) {
			mode = prevMode;
			await showAlert("Ningún enlace del ejemplo coincide con las actividades reales del proyecto (Código EDT + nombre). Revisa que hayas cargado el mismo ejemplo en Definir las Actividades.");
			return;
		}
		let msg = "Se reemplazarán los enlaces del PROYECTO ACTIVO (no el modo ejemplo) por los " + resolved.length + " enlace(s) del ejemplo DISTRIB+ que coinciden con sus actividades reales.";
		if (unresolved.length) msg += " " + unresolved.length + " enlace(s) del ejemplo no se pudieron ubicar (¿cargaste el mismo ejemplo en Definir las Actividades?): " + unresolved.slice(0, 8).join("; ") + (unresolved.length > 8 ? "…" : "") + ".";
		if (!await showConfirm(msg, "Cargar ejemplo en el proyecto")) {
			mode = prevMode;
			render();
			return;
		}
		const st = state();
		st.links = resolved.map((r, i) => ({
			id: "L" + (i + 1),
			from: r.from,
			to: r.to,
			type: r.type,
			lag: r.lag,
			lagUnit: r.lagUnit,
			source: "import"
		}));
		st.linkCounter = st.links.length + 1;
		st.import = null;
		st.baseline = null;
		commit("Ejemplo DISTRIB+ cargado en el proyecto activo (" + resolved.length + " enlace(s)).");
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
			loadedProjectId = window.GPI.activeId();
			if (proj && proj.meta) {
				if (proj.meta.name) document.getElementById("projectTitle").value = proj.meta.name;
				if (proj.meta.course) document.getElementById("courseTitle").value = proj.meta.course;
			}
			gpiPullAll();
			session = window.GPI.openSession("schedule");
			const mod = window.GPI.getModule("schedule");
			if (mod) {
				stateLive = normSchedule(mod);
				window.GPI.rebaseSession(session, stateLive);
			}
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
				if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
					markProjectStale();
					return;
				}
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
			const ok = pushFn();
			const t = sb.textContent;
			sb.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
			setTimeout(() => {
				sb.textContent = t;
			}, 1400);
		});
	}
	var SAMPLE_LINK_PLAN = [
		{
			fc: "1.2",
			fn: "Plan para la dirección del proyecto (líneas base)",
			tc: "1.2",
			tn: "Planes subsidiarios de gestión",
			type: "FS"
		},
		{
			fc: "1.3",
			fn: "Elaboración de informes mensuales de avance",
			tc: "1.3",
			tn: "Reuniones de control y seguimiento del proyecto",
			type: "FS"
		},
		{
			fc: "2.1",
			fn: "Calicatas exploratorias",
			tc: "2.1",
			tn: "Ensayos de laboratorio de suelos",
			type: "FS"
		},
		{
			fc: "2.1",
			fn: "Ensayos de laboratorio de suelos",
			tc: "2.1",
			tn: "Informe geotécnico",
			type: "FS"
		},
		{
			fc: "2.2",
			fn: "Memoria de cálculo estructural",
			tc: "2.2",
			tn: "Planos estructurales",
			type: "FS"
		},
		{
			fc: "2.3",
			fn: "Memoria de cálculo eléctrico y sanitario",
			tc: "2.3",
			tn: "Planos eléctricos y sanitarios",
			type: "FS"
		},
		{
			fc: "2.4",
			fn: "Trámite de licencia de edificación municipal",
			tc: "2.4",
			tn: "Trámite de certificado ITSE",
			type: "FS"
		},
		{
			fc: "3.1",
			fn: "Fabricación de estructuras metálicas",
			tc: "3.1",
			tn: "Transporte y entrega de estructuras a obra",
			type: "FS"
		},
		{
			fc: "3.2",
			fn: "Adquisición y suministro de cemento y agregados",
			tc: "3.2",
			tn: "Adquisición y suministro de materiales varios de construcción",
			type: "FS"
		},
		{
			fc: "3.3",
			fn: "Adquisición de tableros y equipos eléctricos",
			tc: "3.3",
			tn: "Adquisición de equipos de instalaciones sanitarias",
			type: "FS"
		},
		{
			fc: "4.1",
			fn: "Corte y excavación masiva",
			tc: "4.1",
			tn: "Relleno y compactación con material propio",
			type: "FS"
		},
		{
			fc: "4.1",
			fn: "Relleno y compactación con material propio",
			tc: "4.1",
			tn: "Eliminación de material excedente",
			type: "FS"
		},
		{
			fc: "4.1",
			fn: "Eliminación de material excedente",
			tc: "4.1",
			tn: "Nivelación y perfilado de plataforma",
			type: "FS"
		},
		{
			fc: "4.2",
			fn: "Excavación de zanjas para zapatas",
			tc: "4.2",
			tn: "Solado de concreto e=10 cm",
			type: "FS"
		},
		{
			fc: "4.2",
			fn: "Solado de concreto e=10 cm",
			tc: "4.2",
			tn: "Acero de refuerzo fy=4200 kg/cm²",
			type: "FS"
		},
		{
			fc: "4.2",
			fn: "Acero de refuerzo fy=4200 kg/cm²",
			tc: "4.2",
			tn: "Concreto f'c=280 kg/cm² en zapatas",
			type: "FS"
		},
		{
			fc: "4.2",
			fn: "Concreto f'c=280 kg/cm² en zapatas",
			tc: "4.2",
			tn: "Encofrado y desencofrado de cimentaciones",
			type: "FS"
		},
		{
			fc: "4.3",
			fn: "Montaje de columnas metálicas",
			tc: "4.3",
			tn: "Montaje de vigas y tijerales",
			type: "FS"
		},
		{
			fc: "4.3",
			fn: "Montaje de vigas y tijerales",
			tc: "4.3",
			tn: "Instalación de cobertura TR-4",
			type: "FS"
		},
		{
			fc: "4.4",
			fn: "Tarrajeo de muros y cielorrasos",
			tc: "4.4",
			tn: "Pintura general de interiores y exteriores",
			type: "FS"
		},
		{
			fc: "4.4",
			fn: "Pintura general de interiores y exteriores",
			tc: "4.4",
			tn: "Cerramiento perimétrico",
			type: "FS"
		},
		{
			fc: "4.5",
			fn: "Instalación de tableros y circuitos eléctricos",
			tc: "4.5",
			tn: "Instalación de redes sanitarias",
			type: "FS"
		},
		{
			fc: "5.1",
			fn: "Pruebas de tableros y circuitos eléctricos",
			tc: "5.1",
			tn: "Pruebas hidráulicas de redes sanitarias",
			type: "FS"
		},
		{
			fc: "5.2",
			fn: "Capacitación operativa al personal del cliente",
			tc: "5.2",
			tn: "Elaboración de manuales de operación y mantenimiento",
			type: "FS"
		},
		{
			fc: "5.3",
			fn: "Elaboración de dossier de calidad y planos as-built",
			tc: "5.3",
			tn: "Acta de entrega y cierre del proyecto",
			type: "FS"
		},
		{
			fc: "H1",
			fn: "Inicio del Proyecto",
			tc: "1.1",
			tn: "Elaboración y aprobación del acta de constitución",
			type: "FS"
		},
		{
			fc: "5.3",
			fn: "Acta de entrega y cierre del proyecto",
			tc: "H3",
			tn: "Cierre del Proyecto",
			type: "FS"
		},
		{
			fc: "1.1",
			fn: "Elaboración y aprobación del acta de constitución",
			tc: "1.2",
			tn: "Plan para la dirección del proyecto (líneas base)",
			type: "FS"
		},
		{
			fc: "1.2",
			fn: "Planes subsidiarios de gestión",
			tc: "1.3",
			tn: "Elaboración de informes mensuales de avance",
			type: "FS"
		},
		{
			fc: "1.2",
			fn: "Planes subsidiarios de gestión",
			tc: "2.1",
			tn: "Calicatas exploratorias",
			type: "FS"
		},
		{
			fc: "2.1",
			fn: "Informe geotécnico",
			tc: "2.2",
			tn: "Memoria de cálculo estructural",
			type: "FS"
		},
		{
			fc: "2.2",
			fn: "Memoria de cálculo estructural",
			tc: "2.3",
			tn: "Memoria de cálculo eléctrico y sanitario",
			type: "SS",
			lag: 5,
			lagUnit: "d"
		},
		{
			fc: "2.2",
			fn: "Planos estructurales",
			tc: "2.4",
			tn: "Trámite de licencia de edificación municipal",
			type: "FS"
		},
		{
			fc: "2.3",
			fn: "Planos eléctricos y sanitarios",
			tc: "2.4",
			tn: "Trámite de licencia de edificación municipal",
			type: "FS"
		},
		{
			fc: "2.2",
			fn: "Planos estructurales",
			tc: "3.1",
			tn: "Fabricación de estructuras metálicas",
			type: "FS"
		},
		{
			fc: "2.4",
			fn: "Trámite de licencia de edificación municipal",
			tc: "3.2",
			tn: "Adquisición y suministro de cemento y agregados",
			type: "SS",
			lag: 10,
			lagUnit: "d"
		},
		{
			fc: "2.3",
			fn: "Planos eléctricos y sanitarios",
			tc: "3.3",
			tn: "Adquisición de tableros y equipos eléctricos",
			type: "FS"
		},
		{
			fc: "2.4",
			fn: "Trámite de certificado ITSE",
			tc: "4.1",
			tn: "Corte y excavación masiva",
			type: "FS"
		},
		{
			fc: "4.1",
			fn: "Nivelación y perfilado de plataforma",
			tc: "4.2",
			tn: "Excavación de zanjas para zapatas",
			type: "FS"
		},
		{
			fc: "3.2",
			fn: "Adquisición y suministro de materiales varios de construcción",
			tc: "4.2",
			tn: "Acero de refuerzo fy=4200 kg/cm²",
			type: "FS"
		},
		{
			fc: "4.2",
			fn: "Encofrado y desencofrado de cimentaciones",
			tc: "H2",
			tn: "Fin de Cimentaciones",
			type: "FS"
		},
		{
			fc: "H2",
			fn: "Fin de Cimentaciones",
			tc: "4.3",
			tn: "Montaje de columnas metálicas",
			type: "FS"
		},
		{
			fc: "3.1",
			fn: "Transporte y entrega de estructuras a obra",
			tc: "4.3",
			tn: "Montaje de columnas metálicas",
			type: "FS"
		},
		{
			fc: "4.3",
			fn: "Instalación de cobertura TR-4",
			tc: "4.4",
			tn: "Tarrajeo de muros y cielorrasos",
			type: "FS"
		},
		{
			fc: "4.3",
			fn: "Montaje de vigas y tijerales",
			tc: "4.5",
			tn: "Instalación de tableros y circuitos eléctricos",
			type: "SS",
			lag: 8,
			lagUnit: "d"
		},
		{
			fc: "3.3",
			fn: "Adquisición de equipos de instalaciones sanitarias",
			tc: "4.5",
			tn: "Instalación de redes sanitarias",
			type: "FS"
		},
		{
			fc: "4.4",
			fn: "Cerramiento perimétrico",
			tc: "5.1",
			tn: "Pruebas de tableros y circuitos eléctricos",
			type: "SS",
			lag: 3,
			lagUnit: "d"
		},
		{
			fc: "4.5",
			fn: "Instalación de redes sanitarias",
			tc: "5.1",
			tn: "Pruebas hidráulicas de redes sanitarias",
			type: "FS"
		},
		{
			fc: "5.1",
			fn: "Pruebas hidráulicas de redes sanitarias",
			tc: "5.2",
			tn: "Capacitación operativa al personal del cliente",
			type: "FS"
		},
		{
			fc: "5.1",
			fn: "Pruebas hidráulicas de redes sanitarias",
			tc: "5.3",
			tn: "Elaboración de dossier de calidad y planos as-built",
			type: "FS"
		},
		{
			fc: "5.2",
			fn: "Elaboración de manuales de operación y mantenimiento",
			tc: "5.3",
			tn: "Elaboración de dossier de calidad y planos as-built",
			type: "FS"
		}
	];
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
						source: "import"
					},
					{
						id: "L2",
						from: "a2",
						to: "a3",
						type: "FS",
						lag: 0,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L3",
						from: "a3",
						to: "a4",
						type: "SS",
						lag: 4,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L4",
						from: "a2",
						to: "a5",
						type: "FS",
						lag: 0,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L5",
						from: "a5",
						to: "a6",
						type: "SS",
						lag: 3,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L6",
						from: "a5",
						to: "a7",
						type: "SS",
						lag: 2,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L7",
						from: "a6",
						to: "a8",
						type: "FS",
						lag: 0,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L8",
						from: "a7",
						to: "a8",
						type: "FS",
						lag: 0,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L9",
						from: "a4",
						to: "a8",
						type: "FS",
						lag: 0,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L10",
						from: "a8",
						to: "a9",
						type: "FS",
						lag: 0,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L11",
						from: "a9",
						to: "a10",
						type: "SS",
						lag: 2,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L12",
						from: "a10",
						to: "a11",
						type: "FS",
						lag: 3,
						lagUnit: "d",
						source: "import"
					},
					{
						id: "L13",
						from: "a11",
						to: "a12",
						type: "SS",
						lag: 5,
						lagUnit: "d",
						source: "import"
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
