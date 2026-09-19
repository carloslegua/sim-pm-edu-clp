var GPI = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/core/gpi-core.ts
	var KEY = "gpi_db";
	var SCHEMA = "gpi.project/v1";
	var mem = null;
	var pendingUnsaved = null;
	function avail() {
		try {
			const k = "__gpi_t";
			localStorage.setItem(k, "1");
			localStorage.removeItem(k);
			return true;
		} catch (e) {
			return false;
		}
	}
	function fresh() {
		return {
			version: 1,
			activeId: null,
			projects: {}
		};
	}
	function db() {
		if (!avail()) return mem || (mem = fresh());
		if (pendingUnsaved) return pendingUnsaved;
		try {
			return JSON.parse(localStorage.getItem("gpi_db")) || fresh();
		} catch (e) {
			return fresh();
		}
	}
	function hasUnsavedChanges() {
		return pendingUnsaved !== null;
	}
	function save(d) {
		if (!avail()) {
			mem = d;
			return true;
		}
		try {
			localStorage.setItem(KEY, JSON.stringify(d));
			pendingUnsaved = null;
			hideQuotaNotice();
			return true;
		} catch (e) {
			pendingUnsaved = d;
			showQuotaNotice();
			return false;
		}
	}
	var quotaEl = null;
	function showQuotaNotice() {
		try {
			if (typeof document === "undefined" || !document.body) return;
			if (quotaEl && document.body.contains(quotaEl)) return;
			quotaEl = document.createElement("div");
			quotaEl.id = "gpiQuotaNotice";
			quotaEl.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2500;background:#7a1f2b;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:560px;text-align:center;";
			quotaEl.innerHTML = "⚠ <b>El almacenamiento del navegador está lleno: los últimos cambios NO se están guardando.</b><br>Exporta este proyecto a .json (botón ⭳ Guardar) para no perder tu trabajo y elimina proyectos antiguos desde el Panel de Control.";
			document.body.appendChild(quotaEl);
		} catch (_) {}
	}
	function hideQuotaNotice() {
		try {
			if (quotaEl && quotaEl.parentNode) {
				quotaEl.parentNode.removeChild(quotaEl);
				quotaEl = null;
			}
		} catch (_) {}
	}
	function uid() {
		return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
	}
	function defaultMeta() {
		return {
			id: null,
			name: "Proyecto sin título",
			code: "",
			client: "",
			location: "",
			sponsor: "",
			manager: "",
			startDate: "",
			endDate: "",
			currency: "USD",
			capex: "",
			description: "",
			course: "Gestión de Proyectos de Ingeniería",
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
	}
	function listProjects() {
		const d = db();
		return Object.keys(d.projects).map((id) => {
			const m = d.projects[id].meta;
			return {
				id,
				name: m.name,
				updatedAt: m.updatedAt,
				code: m.code
			};
		}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
	}
	function activeId() {
		return db().activeId;
	}
	function active() {
		const d = db();
		return d.activeId && d.projects[d.activeId] || null;
	}
	function meta() {
		const p = active();
		return p ? p.meta : null;
	}
	function getModule(name) {
		const p = active();
		return p ? p.modules[name] || null : null;
	}
	function setActive(id) {
		const d = db();
		if (d.projects[id]) {
			d.activeId = id;
			save(d);
		}
		return active();
	}
	function patchMeta(partial, expectedProjectId) {
		const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
		if (!p) return null;
		if (expectedProjectId != null && d.activeId !== expectedProjectId) return null;
		Object.assign(p.meta, partial || {});
		p.meta.updatedAt = Date.now();
		save(d);
		return p.meta;
	}
	function setModule(name, data, expectedProjectId) {
		const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
		if (!p) return false;
		if (expectedProjectId != null && d.activeId !== expectedProjectId) return false;
		p.modules = p.modules || {};
		p.modules[name] = data;
		p.meta.updatedAt = Date.now();
		return save(d);
	}
	function createProject(metaOverrides, modules) {
		const d = db(), id = uid();
		const projMeta = Object.assign(defaultMeta(), metaOverrides || {});
		projMeta.id = id;
		projMeta.createdAt = Date.now();
		projMeta.updatedAt = Date.now();
		d.projects[id] = {
			schema: SCHEMA,
			meta: projMeta,
			modules: modules || {}
		};
		d.activeId = id;
		save(d);
		return id;
	}
	function renameProject(id, name) {
		const d = db();
		if (d.projects[id]) {
			d.projects[id].meta.name = name;
			d.projects[id].meta.updatedAt = Date.now();
			save(d);
		}
	}
	function duplicateProject(id, newName) {
		const d = db(), src = d.projects[id];
		if (!src) return null;
		const nid = uid(), copy = JSON.parse(JSON.stringify(src));
		copy.meta.id = nid;
		copy.meta.name = newName || src.meta.name + " (copia)";
		copy.meta.createdAt = Date.now();
		copy.meta.updatedAt = Date.now();
		d.projects[nid] = copy;
		d.activeId = nid;
		save(d);
		return nid;
	}
	function deleteProject(id) {
		const d = db();
		delete d.projects[id];
		if (d.activeId === id) d.activeId = Object.keys(d.projects)[0] || null;
		save(d);
	}
	function exportActive() {
		return active();
	}
	function detectTool(obj) {
		if (!obj || typeof obj !== "object") return null;
		if (obj.kind === "gpi.obs/v1" && obj.nodes && obj.rootId) return {
			module: "obs",
			data: {
				rootId: obj.rootId,
				idCounter: obj.idCounter || 1,
				nodes: obj.nodes
			}
		};
		if (obj.kind === "gpi.raci/v1") return {
			module: "raci",
			data: { assignments: obj.assignments || {} }
		};
		if (obj.kind === "gpi.schedulePlan/v1" && obj.data) return {
			module: "schedulePlan",
			data: obj.data
		};
		if (obj.kind === "gpi.cost/v1" && obj.data) return {
			module: "cost",
			data: obj.data
		};
		if (obj.kind === "gpi.charter/v1" && obj.data) return {
			module: "charter",
			data: obj.data
		};
		if (obj.kind === "gpi.scopeStatement/v1" && obj.data) return {
			module: "scopeStatement",
			data: obj.data
		};
		if (obj.kind === "gpi.activities/v1" && obj.data) return {
			module: "activities",
			data: {
				byLeaf: obj.data.byLeaf || {},
				idCounter: obj.data.idCounter || 1
			}
		};
		if (obj.kind === "gpi.requirements/v1" && obj.data) return {
			module: "requirements",
			data: obj.data
		};
		if (obj.kind === "gpi.costEstimate/v1" && obj.data) return {
			module: "costEstimate",
			data: { byActivity: obj.data.byActivity || {} }
		};
		if (obj.kind === "gpi.pert/v1" && obj.data) return {
			module: "pert",
			data: {
				byActivity: obj.data.byActivity || {},
				inputMode: obj.data.inputMode === "pct" ? "pct" : "dias"
			}
		};
		if (obj.kind === "gpi.schedule/v1" && obj.data) return {
			module: "schedule",
			data: {
				links: Array.isArray(obj.data.links) ? obj.data.links : [],
				linkCounter: obj.data.linkCounter || 1,
				import: obj.data["import"] || null,
				baseline: obj.data.baseline || null
			}
		};
		if (Array.isArray(obj.stakeholders)) return {
			module: "stakeholders",
			data: {
				stakeholders: obj.stakeholders,
				powerWeights: obj.powerWeights || null,
				interestWeights: obj.interestWeights || null,
				idCounter: obj.idCounter || obj.stakeholders.length + 1
			}
		};
		if (obj.nodes && obj.rootId) return {
			module: "wbs",
			data: {
				rootId: obj.rootId,
				idCounter: obj.idCounter || 1,
				nodes: obj.nodes
			}
		};
		return null;
	}
	function normalizeToProject(obj) {
		if (obj && obj.schema === SCHEMA && obj.meta) return obj;
		const projMeta = Object.assign(defaultMeta(), {
			name: obj && obj.title || "Proyecto importado",
			course: obj && obj.course || void 0
		});
		const modules = {};
		const det = detectTool(obj);
		if (det) modules[det.module] = det.data;
		return {
			schema: SCHEMA,
			meta: projMeta,
			modules
		};
	}
	function importProject(obj, activate) {
		const d = db();
		const proj = normalizeToProject(obj);
		const id = proj.meta.id && !d.projects[proj.meta.id] ? proj.meta.id : uid();
		proj.meta.id = id;
		proj.meta.updatedAt = Date.now();
		d.projects[id] = proj;
		if (activate !== false) d.activeId = id;
		save(d);
		return id;
	}
	function ingestToolExport(obj) {
		const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
		if (!p) return {
			ok: false,
			reason: "no-active"
		};
		const det = detectTool(obj);
		if (!det) return {
			ok: false,
			reason: "unknown-format"
		};
		p.modules = p.modules || {};
		p.modules[det.module] = det.data;
		if (obj.title && (!p.meta.name || p.meta.name === "Proyecto sin título")) p.meta.name = obj.title;
		if (obj.course && !p.meta.course) p.meta.course = obj.course;
		p.meta.updatedAt = Date.now();
		save(d);
		return {
			ok: true,
			module: det.module
		};
	}
	function onChange(cb) {
		window.addEventListener("storage", (e) => {
			if (e.key === "gpi_db") cb();
		});
	}
	function wbsRollup(wbs) {
		if (!wbs || !wbs.nodes || !wbs.rootId) return {
			cost: 0,
			count: 0,
			leafCount: 0,
			minStart: "",
			maxEnd: ""
		};
		const nodes = wbs.nodes;
		let cost = 0, count = 0, leafCount = 0, minStart = "", maxEnd = "";
		Object.keys(nodes).forEach((id) => {
			if (id === wbs.rootId) return;
			const n = nodes[id];
			count++;
			if (!n.children || n.children.length === 0) {
				cost += Number(n.cost) || 0;
				leafCount++;
			}
			if (n.start && (!minStart || n.start < minStart)) minStart = n.start;
			if (n.end && (!maxEnd || n.end > maxEnd)) maxEnd = n.end;
		});
		return {
			cost,
			count,
			leafCount,
			minStart,
			maxEnd
		};
	}
	function wbsResources(wbs) {
		if (!wbs || !wbs.nodes) return [];
		const set = {};
		Object.keys(wbs.nodes).forEach((id) => {
			const r = (wbs.nodes[id].resource || "").trim();
			if (r) set[r] = true;
		});
		return Object.keys(set);
	}
	function wbsCodes(wbs) {
		const codes = {};
		if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return codes;
		const nodes = wbs.nodes;
		function walk(id, prefix) {
			codes[id] = prefix;
			(nodes[id].children || []).forEach((cid, i) => {
				if (nodes[cid]) walk(cid, prefix ? prefix + "." + (i + 1) : String(i + 1));
			});
		}
		(nodes[wbs.rootId].children || []).forEach((cid, i) => {
			if (nodes[cid]) walk(cid, String(i + 1));
		});
		codes[wbs.rootId] = "0";
		return codes;
	}
	function wbsLeaves(wbs) {
		if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return [];
		const nodes = wbs.nodes, codes = wbsCodes(wbs), out = [], rootId = wbs.rootId;
		function walk(id) {
			const n = nodes[id];
			if (!n) return;
			const kids = n.children || [];
			if (id !== rootId && kids.length === 0) out.push({
				id,
				code: codes[id] || "",
				name: n.name || "",
				resource: n.resource || "",
				notes: n.notes || ""
			});
			kids.forEach(walk);
		}
		walk(wbs.rootId);
		return out;
	}
	function obsNodes(obs) {
		if (!obs || !obs.nodes || !obs.rootId || !obs.nodes[obs.rootId]) return [];
		const nodes = obs.nodes, out = [], rootId = obs.rootId;
		function code(id) {
			const parts = [];
			let n = nodes[id];
			while (n && n.parentId) {
				const siblings = (nodes[n.parentId] || {}).children || [];
				parts.unshift(siblings.indexOf(n.id) + 1);
				n = nodes[n.parentId];
			}
			return parts.join(".");
		}
		function walk(id) {
			const n = nodes[id];
			if (!n) return;
			if (id !== rootId) out.push({
				id,
				code: code(id),
				role: n.role || "",
				person: n.person || "",
				type: n.type || "",
				email: n.email || "",
				parentId: n.parentId
			});
			(n.children || []).forEach(walk);
		}
		walk(obs.rootId);
		return out;
	}
	function obsLabel(obsNode) {
		if (!obsNode) return "";
		return obsNode.person && obsNode.person.trim() || obsNode.role && obsNode.role.trim() || "";
	}
	function raciResponsibleIds(raci, leafId) {
		const cell = raci && raci.assignments && raci.assignments[leafId];
		if (!cell) return [];
		return Object.keys(cell).filter((roleId) => cell[roleId] === "R");
	}
	function applyRaciToWbs(wbs, raci, obs) {
		if (!wbs || !wbs.nodes) return wbs;
		const out = JSON.parse(JSON.stringify(wbs));
		if (!raci || !raci.assignments || !obs || !obs.nodes) return out;
		const obsById = obs.nodes;
		Object.keys(out.nodes).forEach((leafId) => {
			const ids = raciResponsibleIds(raci, leafId);
			if (!ids.length) return;
			const labels = ids.map((rid) => obsLabel(obsById[rid])).filter(Boolean);
			if (labels.length) out.nodes[leafId].resource = labels.join(", ");
		});
		return out;
	}
	function applyScheduleToWbs(wbs, activities, pert, schedule, schedulePlan, meta) {
		const out = wbs ? JSON.parse(JSON.stringify(wbs)) : wbs;
		if (!wbs || !wbs.nodes || !meta || !meta.startDate) return {
			wbs: out,
			lockedLeafIds: []
		};
		const byLeaf = activities && activities.byLeaf || {};
		const nodes = pertStats(pert || null, activities || null, wbs).rows.map((r) => ({
			id: r.id,
			dur: r.dur || 0
		}));
		if (!nodes.length) return {
			wbs: out,
			lockedLeafIds: []
		};
		const result = cpm(nodes, schedule && Array.isArray(schedule.links) ? schedule.links : [], projectCalendar(schedulePlan), { startDate: meta.startDate });
		if (!result.ok) return {
			wbs: out,
			lockedLeafIds: []
		};
		const lockedLeafIds = [];
		Object.keys(byLeaf).forEach((leafId) => {
			const acts = byLeaf[leafId];
			if (!acts || !acts.length || !out.nodes[leafId]) return;
			let start = null, end = null;
			acts.forEach((a) => {
				const row = result.rows[a.id];
				if (!row || !row.startDate || !row.finishDate) return;
				if (!start || row.startDate < start) start = row.startDate;
				if (!end || row.finishDate > end) end = row.finishDate;
			});
			if (start && end) {
				out.nodes[leafId].start = start;
				out.nodes[leafId].end = end;
				lockedLeafIds.push(leafId);
			}
		});
		return {
			wbs: out,
			lockedLeafIds
		};
	}
	function numOrNull(v) {
		if (v === "" || v == null) return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	}
	function costEstimateRows(estimate, activities, wbs) {
		const byLeaf = activities && activities.byLeaf || {};
		const byActivity = estimate && estimate.byActivity || {};
		const out = [];
		wbsLeaves(wbs).forEach((l) => {
			(byLeaf[l.id] || []).forEach((a) => {
				const qty = numOrNull(a.qty);
				const unitPrice = numOrNull(byActivity[a.id]);
				const subtotal = qty != null && unitPrice != null ? qty * unitPrice : null;
				out.push({
					activityId: a.id,
					leafId: l.id,
					code: l.code,
					leafName: l.name,
					name: a.name || "",
					unit: a.unit || "",
					qty,
					unitPrice,
					subtotal
				});
			});
		});
		return out;
	}
	function costEstimateTotal(estimate, activities, wbs) {
		return costEstimateRows(estimate, activities, wbs).reduce((s, r) => s + (r.subtotal || 0), 0);
	}
	function applyCostEstimateToWbs(wbs, estimate, activities) {
		const out = wbs ? JSON.parse(JSON.stringify(wbs)) : wbs;
		if (!wbs || !wbs.nodes || !activities || !activities.byLeaf) return {
			wbs: out,
			lockedLeafIds: []
		};
		const rows = costEstimateRows(estimate, activities, wbs);
		const byLeaf = {};
		rows.forEach((r) => {
			(byLeaf[r.leafId] || (byLeaf[r.leafId] = [])).push(r);
		});
		const lockedLeafIds = [];
		Object.keys(byLeaf).forEach((leafId) => {
			const leafRows = byLeaf[leafId];
			if (!leafRows.length || !out.nodes[leafId]) return;
			if (!leafRows.every((r) => r.subtotal != null && r.subtotal > 0)) return;
			out.nodes[leafId].cost = leafRows.reduce((s, r) => s + (r.subtotal || 0), 0);
			lockedLeafIds.push(leafId);
		});
		return {
			wbs: out,
			lockedLeafIds
		};
	}
	function wbsPhases(wbs) {
		if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return [];
		const nodes = wbs.nodes;
		function subtreeRollup(id) {
			let cost = 0, minStart = "", maxEnd = "";
			function walk(nid) {
				const n = nodes[nid];
				if (!n) return;
				const kids = n.children || [];
				if (kids.length === 0) cost += Number(n.cost) || 0;
				if (n.start && (!minStart || n.start < minStart)) minStart = n.start;
				if (n.end && (!maxEnd || n.end > maxEnd)) maxEnd = n.end;
				kids.forEach(walk);
			}
			walk(id);
			return {
				cost,
				start: minStart,
				end: maxEnd
			};
		}
		return (nodes[wbs.rootId].children || []).map((id) => {
			const n = nodes[id];
			if (!n) return null;
			const r = subtreeRollup(id);
			return {
				id,
				name: n.name || "",
				start: r.start,
				end: r.end,
				cost: r.cost
			};
		}).filter((x) => x !== null);
	}
	function activitiesStats(act, wbs) {
		const byLeaf = (act || {}).byLeaf || {};
		const leaves = [];
		if (wbs && wbs.nodes && wbs.rootId && wbs.nodes[wbs.rootId]) (function walk(id, code) {
			const n = wbs.nodes[id];
			if (!n) return;
			const kids = n.children || [];
			if (id !== wbs.rootId && !kids.length) leaves.push({
				id,
				name: n.name || "",
				code
			});
			kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
		})(wbs.rootId, "");
		const leafIds = {};
		leaves.forEach((l) => {
			leafIds[l.id] = true;
		});
		let total = 0, orphans = 0, covered = 0;
		const uncovered = [];
		Object.keys(byLeaf).forEach((k) => {
			const arr = byLeaf[k] || [];
			if (leafIds[k]) total += arr.length;
			else orphans += arr.length;
		});
		leaves.forEach((l) => {
			if ((byLeaf[l.id] || []).length) covered++;
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
	function tolNum(v) {
		if (v === "" || v == null) return NaN;
		let s = String(v).trim().replace(/[\s ]/g, "");
		const hasDot = s.indexOf(".") !== -1, hasComma = s.indexOf(",") !== -1;
		if (hasDot && hasComma) s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(/,/g, ".");
		else if (hasComma) {
			const p = s.split(",");
			s = p.length >= 2 && p.slice(1).every((x) => x.length === 3 && /^\d+$/.test(x)) ? p.join("") : p.join(".");
		}
		const n = Number(s);
		return isFinite(n) ? n : NaN;
	}
	function pertStats(pert, act, wbs) {
		const pe0 = pert || {};
		const a = act || {};
		const by = pe0.byActivity || {}, mode = pe0.inputMode === "pct" ? "pct" : "dias";
		const byLeaf = a.byLeaf || {};
		function durOf(av) {
			const met = tolNum(av.qty), r = tolNum(av.perf);
			let eq = tolNum(av.teams);
			if (!isFinite(met) || met <= 0 || !isFinite(r) || r <= 0) return null;
			if (!isFinite(eq) || eq < 1) eq = 1;
			return Math.ceil(met / (eq * r));
		}
		const list = [];
		if (wbs && wbs.nodes && wbs.rootId && wbs.nodes[wbs.rootId]) (function walk(id, code) {
			const n = wbs.nodes[id];
			if (!n) return;
			const kids = n.children || [];
			if (id !== wbs.rootId && !kids.length) (byLeaf[id] || []).forEach((av, i) => {
				list.push({
					id: av.id,
					code: code + "." + (i + 1),
					name: av.name || "",
					act: av
				});
			});
			kids.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1)));
		})(wbs.rootId, "");
		let complete = 0, invalid = 0, sumTe = 0, sumVar = 0, orphans = 0;
		const known = {};
		const rows = list.map((it) => {
			known[it.id] = true;
			const pe = by[it.id] || {};
			const dur = durOf(it.act);
			const m = pe.mAuto === false && isFinite(tolNum(pe.m)) ? tolNum(pe.m) : dur;
			const oRaw = tolNum(pe.o), pRaw = tolNum(pe.p);
			let o = null, p = null;
			if (isFinite(oRaw)) o = mode === "pct" ? m != null ? oRaw / 100 * m : null : oRaw;
			if (isFinite(pRaw)) p = mode === "pct" ? m != null ? pRaw / 100 * m : null : pRaw;
			const ok = o != null && m != null && p != null && o > 0;
			const valid = ok && o <= m && m <= p;
			let te = null, sd = null, va = null;
			if (ok) {
				te = (o + 4 * m + p) / 6;
				sd = (p - o) / 6;
				va = sd * sd;
			}
			if (ok) {
				complete++;
				if (!valid) invalid++;
				else {
					sumTe += te;
					sumVar += va;
				}
			}
			return {
				id: it.id,
				code: it.code,
				name: it.name,
				dur,
				mAuto: pe.mAuto !== false,
				o,
				m,
				p,
				te,
				sd,
				variance: va,
				complete: ok,
				valid: !!valid
			};
		});
		Object.keys(by).forEach((k) => {
			if (!known[k]) orphans++;
		});
		return {
			rows,
			total: rows.length,
			complete,
			invalid,
			orphans,
			sumTe,
			sumVar,
			pct: rows.length ? Math.round(complete / rows.length * 100) : 0
		};
	}
	function pertProbability(sumTe, sumVar, targetDays) {
		const te = Number(sumTe), va = Number(sumVar), t = Number(targetDays);
		if (!isFinite(te) || !isFinite(va) || va <= 0 || !isFinite(t)) return null;
		const sigma = Math.sqrt(va);
		const z = (t - te) / sigma;
		const x = Math.abs(z), k = 1 / (1 + .2316419 * x);
		const poly = k * (.31938153 + k * (-.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
		const phi = 1 - Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * poly;
		return {
			te,
			variance: va,
			sigma,
			z,
			prob: z >= 0 ? phi : 1 - phi
		};
	}
	function pad2(n) {
		n = Number(n) || 0;
		return (n < 10 ? "0" : "") + n;
	}
	function buildAuditResult(items) {
		const okCount = items.filter((i) => i.ok).length;
		const total = items.length;
		const pct = total ? Math.round(okCount / total * 100) : 0;
		const state = pct >= 80 ? "verde" : pct >= 50 ? "ambar" : "rojo";
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
			state,
			categories: cats
		};
	}
	function nz(s) {
		return !!(s && String(s).trim());
	}
	function charterAudit(ch) {
		const c = ch || {};
		const id = c.identification || {}, bud = c.budget || {}, ap = c.approval || {}, bc = c.businessCase || {};
		const objs = c.objectives || [], reqs = c.requirements || [], dels = c.deliverables || [], mil = c.milestones || [], risks = c.risks || [], asum = c.assumptions || [], cons = c.constraints || [], excl = c.exclusions || [], sh = c.stakeholders || [], pre = c.preAssignedResources || [], areq = c.approvalRequirements || [], exitc = c.exitCriteria || [], spon = c.sponsors || [];
		function hasObj(dim) {
			return objs.some((o) => o && o.dim === dim && nz(o.objective) && nz(o.criteria));
		}
		return buildAuditResult([
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
			}
		]);
	}
	function schedulePlanAudit(sp) {
		const s = sp || {};
		const m = s.methodology || {}, cod = s.codification || {}, cal = s.calendar || {}, dur = s.durationEstimating || {}, cp = s.criticalPath || {}, pm = s.performanceMeasurement || {}, res = s.scheduleReserve || {}, cc = s.changeControl || {}, ap = s.approval || {};
		const thr = s.controlThresholds || [], mil = s.milestones || [], roles = s.roles || [], rep = s.reportingFormats || [], asum = s.assumptions || [], excl = s.exclusions || [];
		return buildAuditResult([
			{
				id: "enfoque",
				cat: "Metodología y EDT",
				label: "Enfoque de programación y herramienta declarados",
				ok: nz(m.approach) && nz(m.tool)
			},
			{
				id: "detalle",
				cat: "Metodología y EDT",
				label: "Unidad de medida, y Nivel + Clase de cronograma (RP 27R-03)",
				ok: nz(m.unit) && (nz(m.scheduleLevel) && nz(m.scheduleClass) || nz(m.levelOfDetail))
			},
			{
				id: "codificacion",
				cat: "Metodología y EDT",
				label: "Regla de codificación de actividades vinculada a la EDT",
				ok: nz(cod.rule)
			},
			{
				id: "calendario",
				cat: "Calendario y duraciones",
				label: "Calendario del proyecto (días laborables y horas/día)",
				ok: Array.isArray(cal.workDays) && cal.workDays.length > 0 && Number(cal.hoursPerDay) > 0
			},
			{
				id: "feriados",
				cat: "Calendario y duraciones",
				label: "Excepciones de calendario registradas (feriados/paradas)",
				ok: Array.isArray(cal.holidays) && cal.holidays.length > 0
			},
			{
				id: "duraciones",
				cat: "Calendario y duraciones",
				label: "Método de estimación de duraciones declarado",
				ok: nz(dur.method)
			},
			{
				id: "umbrales",
				cat: "Control y desempeño",
				label: "Umbrales de control (SV/SPI u otros) definidos",
				ok: thr.length > 0
			},
			{
				id: "medicion",
				cat: "Control y desempeño",
				label: "Regla de medición del desempeño (EVM) declarada",
				ok: nz(pm.method)
			},
			{
				id: "frecuencia",
				cat: "Control y desempeño",
				label: "Frecuencia de actualización del cronograma definida",
				ok: nz(pm.updateFrequency)
			},
			{
				id: "rutacritica",
				cat: "Control y desempeño",
				label: "Metodología de ruta crítica y umbral de ruta casi crítica",
				ok: nz(cp.methodology) && Number(cp.nearCriticalThresholdDays) > 0
			},
			{
				id: "hitos",
				cat: "Hitos y reserva",
				label: "Al menos un hito clave registrado",
				ok: mil.length > 0
			},
			{
				id: "reserva",
				cat: "Hitos y reserva",
				label: "Reserva de contingencia de cronograma cuantificada y justificada",
				ok: Number(res.pct) > 0 && nz(res.basisText)
			},
			{
				id: "supuestos",
				cat: "Hitos y reserva",
				label: "Supuestos del cronograma registrados",
				ok: asum.length > 0
			},
			{
				id: "exclusiones",
				cat: "Hitos y reserva",
				label: "Exclusiones del cronograma registradas",
				ok: excl.length > 0
			},
			{
				id: "roles",
				cat: "Gobernanza",
				label: "Roles y responsabilidades de la programación definidos",
				ok: roles.length > 0
			},
			{
				id: "reportes",
				cat: "Gobernanza",
				label: "Formatos y frecuencia de reporte definidos",
				ok: rep.length > 0
			},
			{
				id: "cambios",
				cat: "Gobernanza",
				label: "Proceso y umbral de control de cambios/rebaselinado",
				ok: nz(cc.process) && Number(cc.baselineChangeThresholdPct) > 0
			},
			{
				id: "aprobacion",
				cat: "Gobernanza",
				label: "Plan con elaborador y aprobador identificados",
				ok: nz(ap.preparedBy) && nz(ap.approvedBy)
			}
		]);
	}
	function raciCoverage(raci, wbs) {
		const leaves = wbsLeaves(wbs);
		const assignments = raci && raci.assignments || {};
		const total = leaves.length;
		let withR = 0;
		const withoutR = [], withoutA = [], multiA = [];
		leaves.forEach((leaf) => {
			const cell = assignments[leaf.id] || {};
			let rCount = 0, aCount = 0;
			Object.keys(cell).forEach((rid) => {
				if (cell[rid] === "R") rCount++;
				if (cell[rid] === "A") aCount++;
			});
			if (rCount > 0) withR++;
			else withoutR.push(leaf);
			if (aCount === 0) withoutA.push(leaf);
			if (aCount > 1) multiA.push(leaf);
		});
		return {
			total,
			withR,
			withoutR,
			withoutA,
			multiA
		};
	}
	function raciAudit(leaves, cols, assignments) {
		const lv = leaves || [], cl = cols || [], asg = assignments || {};
		const hard = {
			HR01: [],
			HR02: [],
			HR03: [],
			HR04: []
		};
		lv.forEach((leaf) => {
			const cell = asg[leaf.id] || {};
			const keys = Object.keys(cell).filter((k) => cell[k]);
			let rCount = 0, aCount = 0;
			keys.forEach((k) => {
				if (cell[k] === "R") rCount++;
				if (cell[k] === "A") aCount++;
			});
			if (keys.length === 0) hard.HR01.push(leaf);
			if (aCount === 0) hard.HR02.push(leaf);
			if (aCount > 1) hard.HR03.push(leaf);
			if (rCount === 0) hard.HR04.push(leaf);
		});
		const hardCount = hard.HR01.length + hard.HR02.length + hard.HR03.length + hard.HR04.length;
		const soft = {
			SR01: [],
			SR02: [],
			SR03: []
		};
		lv.forEach((leaf) => {
			const cell = asg[leaf.id] || {};
			let rCount = 0, cCount = 0;
			Object.keys(cell).forEach((k) => {
				if (cell[k] === "R") rCount++;
				if (cell[k] === "C") cCount++;
			});
			if (rCount > 1 && !(leaf.notes && leaf.notes.trim())) soft.SR01.push(leaf);
			if (cCount > 3) soft.SR02.push(leaf);
		});
		cl.forEach((col) => {
			if (!lv.some((leaf) => {
				const v = (asg[leaf.id] || {})[col.id];
				return v === "R" || v === "A";
			})) soft.SR03.push(col);
		});
		const softCount = soft.SR01.length + soft.SR02.length + soft.SR03.length;
		const totalChecks = lv.length * 2 + cl.length;
		const srCompliance = totalChecks > 0 ? Math.max(0, Math.min(100, (totalChecks - softCount) / totalChecks * 100)) : 100;
		let score, state;
		if (!lv.length) {
			score = null;
			state = "vacio";
		} else if (hardCount > 0) {
			score = 0;
			state = "rojo";
		} else if (srCompliance < 75) {
			score = Math.min(94, Math.round(85 + srCompliance / 75 * 10));
			state = "ambar";
		} else {
			score = Math.max(95, Math.round(95 + (srCompliance - 75) / 25 * 5));
			state = "verde";
		}
		return {
			hard,
			hardCount,
			soft,
			softCount,
			totalChecks,
			srCompliance: Math.round(srCompliance),
			score,
			state,
			leavesTotal: lv.length,
			colsTotal: cl.length
		};
	}
	function costSummary(cost) {
		const b = cost && cost.budget || {};
		const comp = b.computed || {};
		const base = Number(b.baseCost) || Number(comp.base) || 0;
		const bac = Number(comp.bac) || 0;
		const total = Number(comp.total) || 0;
		const contPct = base ? Math.round((Number(comp.cont) || 0) / base * 100) : 0;
		const co = cost && cost.changeOrders || [];
		let approved = 0, coFromCont = 0, coFromMgmt = 0, pending = 0;
		co.forEach((r) => {
			if (r && r.status === "Aprobada") {
				approved += Number(r.cost) || 0;
				if (r.fund === "Contingencia") coFromCont += Number(r.cost) || 0;
				else coFromMgmt += Number(r.cost) || 0;
			} else if (r && r.status === "Pendiente") pending++;
		});
		return {
			baseCost: base,
			bac,
			total,
			contingencyPct: contPct,
			estimateClass: cost && cost.estimate && cost.estimate.class || null,
			changeOrders: co.length,
			pending,
			approvedAmount: approved,
			fromContingency: coFromCont,
			fromMgmt: coFromMgmt,
			hasData: !!(cost && (base || co.length))
		};
	}
	function charterRans(charter) {
		const reqs = charter && charter.requirements || [];
		const out = [];
		reqs.forEach((r, i) => {
			const text = r && typeof r === "object" ? r.text || "" : String(r || "");
			if (!text || !text.trim()) return;
			const rObj = r && typeof r === "object" ? r : null;
			out.push({
				id: rObj && rObj.id ? rObj.id : "ran" + (i + 1),
				code: rObj && rObj.code ? rObj.code : "RAN." + pad2(i + 1),
				text
			});
		});
		return out;
	}
	function requirementsAudit(req, charter, wbs) {
		const r = req || {};
		const items = r.items || [];
		const rans = charterRans(charter);
		const ranById = {};
		rans.forEach((rn) => {
			ranById[rn.id] = rn;
		});
		const validNodes = {};
		if (wbs && wbs.nodes) Object.keys(wbs.nodes).forEach((id) => {
			validNodes[id] = true;
		});
		const leaves = wbsLeaves(wbs || void 0);
		const ranHit = {};
		rans.forEach((rn) => {
			ranHit[rn.id] = 0;
		});
		let reqsWithoutRan = 0, reqsWithoutWbs = 0, reqsBrokenWbs = 0, reqsWithoutStk = 0, reqsWithoutAccept = 0, reqsWithoutMethod = 0, verified = 0, baselineCount = 0, changeCount = 0, traced = 0;
		const leavesWithReq = {};
		items.forEach((it) => {
			const validSrcs = (it.sourceRanIds || []).filter((id) => ranById[id]);
			if (validSrcs.length === 0) reqsWithoutRan++;
			validSrcs.forEach((id) => {
				ranHit[id] = (ranHit[id] || 0) + 1;
			});
			const nodes = it.wbsNodeIds || [];
			const validW = nodes.filter((id) => validNodes[id]);
			const brokenW = nodes.filter((id) => !validNodes[id]);
			if (nodes.length === 0) reqsWithoutWbs++;
			else if (validW.length > 0) traced++;
			if (brokenW.length) reqsBrokenWbs++;
			validW.forEach((id) => {
				leavesWithReq[id] = true;
			});
			if (!it.stakeholderId) reqsWithoutStk++;
			if (!(it.acceptanceCriteria && String(it.acceptanceCriteria).trim())) reqsWithoutAccept++;
			if (!it.verificationMethod) reqsWithoutMethod++;
			if (it.verificationStatus === "verificado") verified++;
			if (it.origin === "change") changeCount++;
			else baselineCount++;
		});
		const ransUncovered = rans.filter((rn) => !ranHit[rn.id]);
		const leavesWithoutReq = leaves.filter((l) => !leavesWithReq[l.id]);
		const total = items.length;
		const tracePct = total ? Math.round(traced / total * 100) : 0;
		const ranPct = rans.length ? Math.round((rans.length - ransUncovered.length) / rans.length * 100) : 100;
		let state;
		if (!total && !rans.length) state = "vacio";
		else if (ransUncovered.length === 0 && tracePct >= 80 && reqsBrokenWbs === 0) state = "verde";
		else if (tracePct >= 50 || ranPct >= 50) state = "ambar";
		else state = "rojo";
		return {
			total,
			rans: rans.length,
			ranHit,
			ransUncovered,
			ranPct,
			reqsWithoutRan,
			traced,
			tracePct,
			reqsWithoutWbs,
			reqsBrokenWbs,
			reqsWithoutStk,
			reqsWithoutAccept,
			reqsWithoutMethod,
			verified,
			baselineCount,
			changeCount,
			leavesWithoutReq,
			leavesTotal: leaves.length,
			baselineFrozen: !!(r.baseline && r.baseline.frozen),
			baselineVersion: r.baseline && r.baseline.version || null,
			changes: (r.changes || []).length,
			state
		};
	}
	function reqByWbsLeaf(req, leafId) {
		return (req && req.items || []).filter((it) => (it.wbsNodeIds || []).indexOf(leafId) !== -1).map((it) => ({
			id: it.id,
			code: it.code,
			text: it.text
		}));
	}
	function scopeDeliverables(scope) {
		return (scope && scope.deliverables || []).map((d, i) => ({
			id: d && d.id ? d.id : "del" + (i + 1),
			code: d && d.code ? d.code : "DEL." + pad2(i + 1),
			name: d && d.name || "",
			description: d && d.description || "",
			acceptanceCriteria: d && d.acceptanceCriteria || "",
			ranIds: (d && d.ranIds || []).slice(),
			reqIds: (d && d.reqIds || []).slice()
		}));
	}
	function wbsDelIds(wbs) {
		const out = {};
		if (wbs && wbs.nodes) Object.keys(wbs.nodes).forEach((id) => {
			const d = wbs.nodes[id] && wbs.nodes[id].delId;
			if (d) out[d] = true;
		});
		return out;
	}
	function scopeAudit(scope, req, charter, wbs) {
		const sc = scope || {};
		const dels = scopeDeliverables(sc);
		const reqItems = req && req.items || [];
		const reqById = {};
		reqItems.forEach((it) => {
			reqById[it.id] = it;
		});
		const rans = charterRans(charter);
		const ranById = {};
		rans.forEach((rn) => {
			ranById[rn.id] = rn;
		});
		const decomposed = wbsDelIds(wbs || void 0);
		const delsWithoutReq = [], delsWithoutAccept = [], delsNotDecomposed = [];
		let delsBrokenReq = 0;
		const reqCoveredByDel = {}, ranCoveredByDel = {};
		dels.forEach((d) => {
			const validReqs = (d.reqIds || []).filter((id) => reqById[id]);
			const brokenReqs = (d.reqIds || []).filter((id) => !reqById[id]);
			if (validReqs.length === 0) delsWithoutReq.push(d);
			if (brokenReqs.length) delsBrokenReq++;
			validReqs.forEach((id) => {
				reqCoveredByDel[id] = true;
			});
			(d.ranIds || []).forEach((id) => {
				if (ranById[id]) ranCoveredByDel[id] = true;
			});
			if (!(d.acceptanceCriteria && String(d.acceptanceCriteria).trim())) delsWithoutAccept.push(d);
			if (!decomposed[d.id]) delsNotDecomposed.push(d);
		});
		const reqsWithoutDel = reqItems.filter((it) => !reqCoveredByDel[it.id]);
		const ransWithoutDel = rans.filter((r) => !ranCoveredByDel[r.id]);
		const total = dels.length;
		const decomposedCount = dels.filter((d) => decomposed[d.id]).length;
		const reqCovPct = reqItems.length ? Math.round((reqItems.length - reqsWithoutDel.length) / reqItems.length * 100) : total ? 100 : 0;
		const decompPct = total ? Math.round(decomposedCount / total * 100) : 0;
		let state;
		if (!total && !reqItems.length) state = "vacio";
		else if (total && delsWithoutReq.length === 0 && reqsWithoutDel.length === 0 && delsBrokenReq === 0 && delsNotDecomposed.length === 0) state = "verde";
		else if (reqCovPct >= 50 || decompPct >= 50) state = "ambar";
		else state = "rojo";
		return {
			total,
			deliverables: dels,
			delsWithoutReq,
			delsWithoutAccept,
			delsNotDecomposed,
			delsBrokenReq,
			decomposedCount,
			decompPct,
			reqsWithoutDel,
			reqCovPct,
			reqTotal: reqItems.length,
			ransWithoutDel,
			ranTotal: rans.length,
			assumptions: (sc.assumptions || []).length,
			constraints: (sc.constraints || []).length,
			exclusions: (sc.exclusions || []).length,
			baselineFrozen: !!(sc.baseline && sc.baseline.frozen),
			baselineVersion: sc.baseline && sc.baseline.version || null,
			state
		};
	}
	function traceMatrix(req, charter, scope, wbs) {
		const reqItems = req && req.items || [];
		const rans = charterRans(charter);
		const ranById = {};
		rans.forEach((r) => {
			ranById[r.id] = r;
		});
		const dels = scopeDeliverables(scope);
		const delById = {};
		dels.forEach((d) => {
			delById[d.id] = d;
		});
		const nodes = wbs && wbs.nodes || {};
		const codes = wbsCodes(wbs || void 0);
		const parentOf = {};
		Object.keys(nodes).forEach((pid) => {
			(nodes[pid].children || []).forEach((cid) => {
				parentOf[cid] = pid;
			});
		});
		function delOfNode(id) {
			let guard = 0, n = id;
			while (n && guard++ < 999) {
				if (nodes[n] && nodes[n].delId) return nodes[n].delId;
				n = parentOf[n];
			}
			return null;
		}
		const hostDelsByReq = {};
		dels.forEach((d) => {
			(d.reqIds || []).forEach((rid) => {
				(hostDelsByReq[rid] = hostDelsByReq[rid] || {})[d.id] = true;
			});
		});
		const rows = [];
		const kpi = {
			reqTotal: reqItems.length,
			verde: 0,
			noDel: 0,
			noWp: 0,
			delWpMismatch: 0,
			emergent: 0,
			wpNoDel: 0,
			fullChainPct: 0
		};
		reqItems.forEach((it) => {
			const reqRans = (it.sourceRanIds || []).filter((id) => ranById[id]).map((id) => ranById[id]);
			const hostDelIds = Object.keys(hostDelsByReq[it.id] || {});
			const hostDels = hostDelIds.map((id) => delById[id]).filter(Boolean);
			const wpIds = (it.wbsNodeIds || []).filter((id) => nodes[id]);
			const wps = wpIds.map((id) => ({
				id,
				code: codes[id] || "",
				name: nodes[id].name || ""
			}));
			const wpDelSet = {};
			wpIds.forEach((id) => {
				const dd = delOfNode(id);
				if (dd) wpDelSet[dd] = true;
			});
			const wpDelIds = Object.keys(wpDelSet);
			const emergent = reqRans.length === 0;
			const noDel = hostDels.length === 0;
			const noWp = wps.length === 0;
			const wpNoDel = wps.length > 0 && wpDelIds.length === 0;
			const overlap = hostDelIds.some((id) => wpDelSet[id]);
			const delWpMismatch = hostDelIds.length > 0 && wpDelIds.length > 0 && !overlap;
			let st;
			if (noDel || noWp) st = "rojo";
			else if (emergent || wpNoDel || delWpMismatch) st = "ambar";
			else st = "verde";
			if (st === "verde") kpi.verde++;
			if (noDel) kpi.noDel++;
			if (noWp) kpi.noWp++;
			if (delWpMismatch) kpi.delWpMismatch++;
			if (emergent) kpi.emergent++;
			if (wpNoDel) kpi.wpNoDel++;
			rows.push({
				req: {
					id: it.id,
					code: it.code,
					text: it.text || ""
				},
				rans: reqRans.map((r) => ({
					id: r.id,
					code: r.code
				})),
				dels: hostDels.map((d) => ({
					id: d.id,
					code: d.code,
					name: d.name
				})),
				wps,
				wpDelIds,
				coherent: overlap,
				flags: {
					emergent,
					noDel,
					noWp,
					wpNoDel,
					delWpMismatch
				},
				state: st
			});
		});
		const delsWithoutReq = dels.filter((d) => !(d.reqIds || []).some((rid) => reqItems.some((it) => it.id === rid)));
		const leaves = wbsLeaves(wbs || void 0);
		const reqOfLeaf = {};
		reqItems.forEach((it) => {
			(it.wbsNodeIds || []).forEach((nid) => {
				reqOfLeaf[nid] = true;
			});
		});
		const wpsOrphan = leaves.filter((l) => !reqOfLeaf[l.id] && !delOfNode(l.id));
		const wpsNoReq = leaves.filter((l) => !reqOfLeaf[l.id] && delOfNode(l.id));
		const reqRanSet = {};
		reqItems.forEach((it) => {
			(it.sourceRanIds || []).forEach((id) => {
				reqRanSet[id] = true;
			});
		});
		const ransWithoutReq = rans.filter((r) => !reqRanSet[r.id]);
		const emergentReqs = reqItems.filter((it) => (it.sourceRanIds || []).filter((id) => ranById[id]).length === 0);
		kpi.fullChainPct = reqItems.length ? Math.round(kpi.verde / reqItems.length * 100) : 0;
		return {
			rows,
			kpi,
			state: !reqItems.length ? "vacio" : kpi.noDel === 0 && kpi.noWp === 0 && kpi.delWpMismatch === 0 && kpi.emergent === 0 && kpi.wpNoDel === 0 ? "verde" : kpi.noDel || kpi.noWp ? "rojo" : "ambar",
			orphans: {
				delsWithoutReq,
				wpsOrphan,
				wpsNoReq,
				ransWithoutReq,
				emergentReqs
			},
			counts: {
				req: reqItems.length,
				ran: rans.length,
				del: dels.length,
				wp: leaves.length
			}
		};
	}
	function parsePredecessorCell(cell) {
		const s = String(cell == null ? "" : cell).trim();
		const preds = [], errors = [];
		if (!s) return {
			preds,
			errors
		};
		const TYPE = {
			FS: "FS",
			SS: "SS",
			FF: "FF",
			SF: "SF",
			FC: "FS",
			CC: "SS",
			CF: "SF"
		};
		const LET = /[A-Za-zÁÉÍÓÚÜáéíóúü]/;
		let i = 0;
		const n = s.length;
		function ws() {
			while (i < n && /\s/.test(s.charAt(i))) i++;
		}
		while (i < n) {
			ws();
			if (i >= n) break;
			if (s.charAt(i) === ";" || s.charAt(i) === ",") {
				i++;
				continue;
			}
			const tokStart = i;
			const a = i;
			while (i < n && /[0-9]/.test(s.charAt(i))) i++;
			if (i === a) {
				while (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") i++;
				errors.push({
					raw: s.slice(tokStart, i).trim(),
					reason: "sin-id"
				});
				continue;
			}
			const netId = parseInt(s.slice(a, i), 10);
			ws();
			let type = "FS", buf = "";
			const b = i;
			while (i < n && LET.test(s.charAt(i)) && buf.length < 2) {
				buf += s.charAt(i);
				i++;
			}
			if (buf && TYPE[buf.toUpperCase()]) type = TYPE[buf.toUpperCase()];
			else i = b;
			let lag = 0, lagUnit = "d", hadLag = false, lagErr = false;
			ws();
			if (i < n && (s.charAt(i) === "+" || s.charAt(i) === "-")) {
				hadLag = true;
				const sign = s.charAt(i) === "-" ? -1 : 1;
				i++;
				ws();
				const c = i;
				while (i < n && /[0-9]/.test(s.charAt(i))) i++;
				if (i < n && (s.charAt(i) === "." || s.charAt(i) === ",") && i + 1 < n && /[0-9]/.test(s.charAt(i + 1))) {
					i++;
					while (i < n && /[0-9]/.test(s.charAt(i))) i++;
				}
				const num = s.slice(c, i).replace(",", ".");
				if (num === "") lagErr = true;
				else lag = sign * parseFloat(num);
				ws();
				const d0 = i;
				while (i < n && LET.test(s.charAt(i))) i++;
				const u = s.slice(d0, i).toLowerCase().normalize ? s.slice(d0, i).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : s.slice(d0, i).toLowerCase();
				if (u === "" || u === "d" || u === "dia" || u === "dias" || u === "day" || u === "days") lagUnit = "d";
				else if (u === "h" || u === "hr" || u === "hrs" || u === "hora" || u === "horas") lagUnit = "h";
				else if (u === "w" || u === "sem" || u === "semana" || u === "semanas" || u === "week" || u === "weeks") lagUnit = "w";
				else if (u === "ed" || u === "dt") lagUnit = "ed";
				else lagErr = true;
			}
			ws();
			if (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") {
				while (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") i++;
				errors.push({
					raw: s.slice(tokStart, i).trim(),
					reason: "sintaxis"
				});
				continue;
			}
			if (lagErr) {
				errors.push({
					raw: s.slice(tokStart, i).trim(),
					reason: "desfase"
				});
				continue;
			}
			preds.push({
				netId,
				type,
				lag: hadLag ? lag : 0,
				lagUnit: hadLag ? lagUnit : "d"
			});
		}
		return {
			preds,
			errors
		};
	}
	function buildScheduleLinks(pasted, snapshot) {
		const P = pasted || [], S = snapshot || [];
		const byNet = {};
		S.forEach((r) => {
			byNet[String(r.netId)] = r;
		});
		function norm(x) {
			const s = String(x == null ? "" : x).trim().toLowerCase();
			return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
		}
		const links = [], rejected = [], rowErrors = [], parseErrors = [], dates = {}, duplicates = [];
		const seen = {};
		P.forEach((R) => {
			const tgt = byNet[String(R.netId)];
			if (!tgt) {
				rowErrors.push({
					netId: R.netId,
					name: R.name || "",
					reason: "fila-sin-correspondencia"
				});
				return;
			}
			if (tgt.kind !== "activity") {
				const pk = parsePredecessorCell(R.predCell);
				if (pk.preds && pk.preds.length || pk.errors && pk.errors.length) rowErrors.push({
					netId: R.netId,
					name: R.name || "",
					reason: tgt.kind === "project" ? "predecesoras-en-proyecto" : "predecesoras-en-resumen"
				});
				return;
			}
			if (R.name != null && String(R.name).trim() !== "" && norm(R.name) !== norm(tgt.name)) {
				rowErrors.push({
					netId: R.netId,
					name: R.name || "",
					expected: tgt.name,
					reason: "nombre-no-coincide"
				});
				return;
			}
			if (R.start && String(R.start).trim() || R.finish && String(R.finish).trim()) dates[tgt.activityId] = {
				start: String(R.start || "").trim(),
				finish: String(R.finish || "").trim()
			};
			const parsed = parsePredecessorCell(R.predCell);
			parsed.errors.forEach((e) => {
				parseErrors.push({
					netId: R.netId,
					name: R.name || "",
					raw: e.raw,
					reason: e.reason
				});
			});
			parsed.preds.forEach((Pr) => {
				const src = byNet[String(Pr.netId)];
				if (Pr.netId === 0 || src && src.kind === "project") {
					rejected.push({
						fromNet: Pr.netId,
						toNet: R.netId,
						toName: R.name || "",
						reason: "enlace-a-proyecto"
					});
					return;
				}
				if (!src) {
					rejected.push({
						fromNet: Pr.netId,
						toNet: R.netId,
						toName: R.name || "",
						reason: "colgante"
					});
					return;
				}
				if (src.kind === "summary") {
					rejected.push({
						fromNet: Pr.netId,
						toNet: R.netId,
						toName: R.name || "",
						reason: "enlace-a-resumen"
					});
					return;
				}
				if (src.activityId === tgt.activityId) {
					rejected.push({
						fromNet: Pr.netId,
						toNet: R.netId,
						toName: R.name || "",
						reason: "auto-enlace"
					});
					return;
				}
				const key = src.activityId + "" + tgt.activityId + "" + Pr.type;
				if (seen[key]) {
					duplicates.push({
						from: src.activityId,
						to: tgt.activityId,
						type: Pr.type
					});
					return;
				}
				seen[key] = true;
				links.push({
					from: src.activityId,
					to: tgt.activityId,
					type: Pr.type,
					lag: Pr.lag,
					lagUnit: Pr.lagUnit
				});
			});
		});
		return {
			links,
			rejected,
			rowErrors,
			parseErrors,
			dates,
			duplicates
		};
	}
	function scheduleValidate(activityIds, links) {
		const ids = activityIds || [], lk = links || [];
		const inSet = {};
		ids.forEach((id) => {
			inSet[id] = true;
		});
		const dangling = [], selfLoops = [], duplicates = [], seen = {};
		const adj = {}, indeg = {}, outdeg = {};
		ids.forEach((id) => {
			adj[id] = [];
			indeg[id] = 0;
			outdeg[id] = 0;
		});
		lk.forEach((l) => {
			if (!inSet[l.from] || !inSet[l.to]) {
				dangling.push(l);
				return;
			}
			if (l.from === l.to) {
				selfLoops.push(l);
				return;
			}
			const k = l.from + "" + l.to + "" + l.type;
			if (seen[k]) {
				duplicates.push(l);
				return;
			}
			seen[k] = true;
			adj[l.from].push(l.to);
			outdeg[l.from]++;
			indeg[l.to]++;
		});
		const q = [];
		const order = [];
		const deg = {};
		ids.forEach((id) => {
			deg[id] = indeg[id];
			if (indeg[id] === 0) q.push(id);
		});
		while (q.length) {
			const u = q.shift();
			order.push(u);
			adj[u].forEach((v) => {
				if (--deg[v] === 0) q.push(v);
			});
		}
		const cycleNodes = ids.filter((id) => deg[id] > 0);
		const openStart = ids.filter((id) => indeg[id] === 0);
		const openEnd = ids.filter((id) => outdeg[id] === 0);
		return {
			ok: cycleNodes.length === 0 && dangling.length === 0 && selfLoops.length === 0,
			dangling,
			selfLoops,
			duplicates,
			cycles: cycleNodes,
			openStart,
			openEnd,
			order
		};
	}
	function projectCalendar(sp) {
		const DAY = {
			dom: 0,
			lun: 1,
			mar: 2,
			mie: 3,
			jue: 4,
			vie: 5,
			sab: 6
		};
		let s = sp;
		try {
			if (s === void 0) s = getModule("schedulePlan") || void 0;
		} catch (e) {
			s = s || void 0;
		}
		const cal = s && s.calendar ? s.calendar : null;
		if (!cal || !Array.isArray(cal.workDays) || !cal.workDays.length || !(Number(cal.hoursPerDay) > 0)) return {
			workDayIdx: [
				1,
				2,
				3,
				4,
				5
			],
			hoursPerDay: 8,
			holidays: [],
			provisional: true
		};
		const idx = {};
		cal.workDays.forEach((d) => {
			const raw = String(d).toLowerCase();
			const key = raw.normalize ? raw.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3) : raw.slice(0, 3);
			if (DAY[key] !== void 0) idx[DAY[key]] = true;
		});
		const days = Object.keys(idx).map(Number).sort((a, b) => a - b);
		return {
			workDayIdx: days.length ? days : [
				1,
				2,
				3,
				4,
				5
			],
			hoursPerDay: Number(cal.hoursPerDay) || 8,
			holidays: Array.isArray(cal.holidays) ? cal.holidays.slice() : [],
			provisional: false
		};
	}
	function cpm(nodes, links, calendar, opts) {
		const nd = nodes || [], lk = links || [];
		const o = opts || {};
		const cal = calendar || {
			workDayIdx: [
				1,
				2,
				3,
				4,
				5
			],
			hoursPerDay: 8,
			holidays: [],
			provisional: true
		};
		const wpw = cal.workDayIdx && cal.workDayIdx.length ? cal.workDayIdx.length : 5;
		const hpd = Number(cal.hoursPerDay) > 0 ? Number(cal.hoursPerDay) : 8;
		function lagWD(l) {
			const v = Number(l.lag) || 0, u = l.lagUnit || "d";
			if (u === "h") return v / hpd;
			if (u === "w") return v * wpw;
			if (u === "ed") return v * (wpw / 7);
			return v;
		}
		const dur = {}, ids = [];
		nd.forEach((n) => {
			dur[n.id] = Number(n.dur) || 0;
			ids.push(n.id);
		});
		const inSet = {};
		ids.forEach((id) => {
			inSet[id] = true;
		});
		const out = {}, inc = {}, indeg = {}, outdeg = {};
		ids.forEach((id) => {
			out[id] = [];
			inc[id] = [];
			indeg[id] = 0;
			outdeg[id] = 0;
		});
		lk.forEach((l) => {
			if (!inSet[l.from] || !inSet[l.to] || l.from === l.to) return;
			out[l.from].push(l);
			inc[l.to].push(l);
			indeg[l.to]++;
			outdeg[l.from]++;
		});
		const q = [];
		const order = [];
		const deg = {};
		ids.forEach((id) => {
			deg[id] = indeg[id];
			if (!indeg[id]) q.push(id);
		});
		while (q.length) {
			const u = q.shift();
			order.push(u);
			out[u].forEach((l) => {
				if (--deg[l.to] === 0) q.push(l.to);
			});
		}
		if (order.length !== ids.length) return {
			ok: false,
			cycles: ids.filter((id) => deg[id] > 0)
		};
		const ES = {}, EF = {};
		ids.forEach((id) => {
			ES[id] = 0;
		});
		order.forEach((id) => {
			inc[id].forEach((l) => {
				const g = lagWD(l);
				let lb;
				if (l.type === "SS") lb = ES[l.from] + g;
				else if (l.type === "FF") lb = EF[l.from] + g - dur[id];
				else if (l.type === "SF") lb = ES[l.from] + g - dur[id];
				else lb = EF[l.from] + g;
				if (lb > ES[id]) ES[id] = lb;
			});
			if (ES[id] < 0) ES[id] = 0;
			EF[id] = ES[id] + dur[id];
		});
		let projDur = 0;
		ids.forEach((id) => {
			if (EF[id] > projDur) projDur = EF[id];
		});
		const LF = {}, LS = {};
		ids.forEach((id) => {
			LF[id] = projDur;
		});
		for (let i = order.length - 1; i >= 0; i--) {
			const id = order[i];
			if (outdeg[id] > 0) {
				LF[id] = Infinity;
				out[id].forEach((l) => {
					const g = lagWD(l);
					let ub;
					if (l.type === "SS") ub = LF[l.to] - dur[l.to] - g + dur[id];
					else if (l.type === "FF") ub = LF[l.to] - g;
					else if (l.type === "SF") ub = LF[l.to] - g + dur[id];
					else ub = LF[l.to] - dur[l.to] - g;
					if (ub < LF[id]) LF[id] = ub;
				});
			}
			LS[id] = LF[id] - dur[id];
		}
		const EPS = 1e-6;
		const rows = {};
		const criticalIds = [];
		const start = o.startDate ? parseISO(o.startDate) : null;
		ids.forEach((id) => {
			const tf = LS[id] - ES[id];
			let ff = Infinity;
			if (outdeg[id] === 0) ff = tf;
			else out[id].forEach((l) => {
				const g = lagWD(l);
				let s;
				if (l.type === "SS") s = ES[l.to] - ES[id] - g;
				else if (l.type === "FF") s = EF[l.to] - EF[id] - g;
				else if (l.type === "SF") s = EF[l.to] - ES[id] - g;
				else s = ES[l.to] - EF[id] - g;
				if (s < ff) ff = s;
			});
			const crit = tf <= EPS;
			if (crit) criticalIds.push(id);
			rows[id] = {
				es: ES[id],
				ef: EF[id],
				ls: LS[id],
				lf: LF[id],
				tf: Math.round(tf * 1e3) / 1e3,
				ff: ff === Infinity ? 0 : Math.round(ff * 1e3) / 1e3,
				critical: crit,
				startDate: start ? addWorkingDays(start, Math.round(ES[id]), cal) : "",
				finishDate: start ? addWorkingDays(start, Math.max(Math.round(ES[id]), Math.round(EF[id]) - (dur[id] > 0 ? 1 : 0)), cal) : ""
			};
		});
		return {
			ok: true,
			rows,
			order,
			criticalIds,
			projectDuration: projDur,
			projectStart: start ? addWorkingDays(start, 0, cal) : "",
			projectFinishDate: start ? addWorkingDays(start, Math.max(0, Math.round(projDur) - 1), cal) : ""
		};
	}
	function parseISO(s) {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
		if (!m) return null;
		return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
	}
	function addWorkingDays(date, n, calendar) {
		if (!date) return "";
		const cal = calendar || {
			workDayIdx: [
				1,
				2,
				3,
				4,
				5
			],
			holidays: []
		};
		const work = {};
		(cal.workDayIdx || [
			1,
			2,
			3,
			4,
			5
		]).forEach((d) => {
			work[d] = true;
		});
		const hol = {};
		(cal.holidays || []).forEach((h) => {
			hol[String(h).slice(0, 10)] = true;
		});
		function iso(d) {
			return d.toISOString().slice(0, 10);
		}
		function isWork(d) {
			return !!work[d.getUTCDay()] && !hol[iso(d)];
		}
		const d = new Date(date.getTime());
		while (!isWork(d)) d.setUTCDate(d.getUTCDate() + 1);
		let count = 0;
		while (count < n) {
			d.setUTCDate(d.getUTCDate() + 1);
			if (isWork(d)) count++;
		}
		return iso(d);
	}
	function scheduleStats() {
		let sched = null, m = null, nodes = [];
		try {
			sched = getModule("schedule");
		} catch (e) {}
		const links = sched && Array.isArray(sched.links) ? sched.links : [];
		try {
			nodes = (pertStats(getModule("pert"), getModule("activities"), getModule("wbs")).rows || []).map((r) => ({
				id: r.id,
				dur: r.dur || 0
			}));
		} catch (e2) {}
		try {
			m = meta();
		} catch (e3) {}
		const result = cpm(nodes, links, projectCalendar(), { startDate: m ? m.startDate : void 0 });
		return {
			hasSlice: !!sched,
			links: links.length,
			activities: nodes.length,
			ok: result.ok,
			projectDuration: result.ok ? result.projectDuration : null,
			criticalCount: result.ok ? result.criticalIds.length : 0,
			finishDate: result.ok ? result.projectFinishDate : ""
		};
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
	function kpi(v, u, l) {
		return "<div class=\"kpi\"><span class=\"v\">" + esc(String(v)) + "</span>" + (u ? "<span class=\"u\">" + esc(u) + "</span>" : "") + "<span class=\"l\">" + esc(l) + "</span></div>";
	}
	var ui = {
		esc,
		kpi
	};
	var util = {
		wbsRollup,
		wbsResources,
		wbsCodes,
		wbsLeaves,
		obsNodes,
		obsLabel,
		raciResponsibleIds,
		applyRaciToWbs,
		applyScheduleToWbs,
		costEstimateRows,
		costEstimateTotal,
		applyCostEstimateToWbs,
		wbsPhases,
		activitiesStats,
		pertStats,
		pertProbability,
		charterAudit,
		schedulePlanAudit,
		raciCoverage,
		raciAudit,
		costSummary,
		pad2,
		charterRans,
		requirementsAudit,
		reqByWbsLeaf,
		scopeDeliverables,
		wbsDelIds,
		scopeAudit,
		traceMatrix,
		parsePredecessorCell,
		buildScheduleLinks,
		scheduleValidate,
		projectCalendar,
		cpm,
		parseISO,
		addWorkingDays,
		scheduleStats
	};
	var schema = SCHEMA;
	//#endregion
	exports.GPI = {
		KEY,
		schema,
		available: avail,
		defaultMeta,
		raw: db,
		listProjects,
		activeId,
		active,
		meta,
		getModule,
		setActive,
		patchMeta,
		setModule,
		createProject,
		renameProject,
		duplicateProject,
		deleteProject,
		exportActive,
		hasUnsavedChanges,
		importProject,
		ingestToolExport,
		onChange,
		util,
		ui
	};
	exports.KEY = KEY;
	exports.active = active;
	exports.activeId = activeId;
	exports.activitiesStats = activitiesStats;
	exports.addWorkingDays = addWorkingDays;
	exports.applyCostEstimateToWbs = applyCostEstimateToWbs;
	exports.applyRaciToWbs = applyRaciToWbs;
	exports.applyScheduleToWbs = applyScheduleToWbs;
	exports.available = avail;
	exports.buildScheduleLinks = buildScheduleLinks;
	exports.charterAudit = charterAudit;
	exports.charterRans = charterRans;
	exports.costEstimateRows = costEstimateRows;
	exports.costEstimateTotal = costEstimateTotal;
	exports.costSummary = costSummary;
	exports.cpm = cpm;
	exports.createProject = createProject;
	exports.defaultMeta = defaultMeta;
	exports.deleteProject = deleteProject;
	exports.duplicateProject = duplicateProject;
	exports.esc = esc;
	exports.exportActive = exportActive;
	exports.getModule = getModule;
	exports.hasUnsavedChanges = hasUnsavedChanges;
	exports.importProject = importProject;
	exports.ingestToolExport = ingestToolExport;
	exports.kpi = kpi;
	exports.listProjects = listProjects;
	exports.meta = meta;
	exports.obsLabel = obsLabel;
	exports.obsNodes = obsNodes;
	exports.onChange = onChange;
	exports.parseISO = parseISO;
	exports.parsePredecessorCell = parsePredecessorCell;
	exports.patchMeta = patchMeta;
	exports.pertProbability = pertProbability;
	exports.pertStats = pertStats;
	exports.projectCalendar = projectCalendar;
	exports.raciAudit = raciAudit;
	exports.raciCoverage = raciCoverage;
	exports.raciResponsibleIds = raciResponsibleIds;
	exports.raw = db;
	exports.renameProject = renameProject;
	exports.reqByWbsLeaf = reqByWbsLeaf;
	exports.requirementsAudit = requirementsAudit;
	exports.schedulePlanAudit = schedulePlanAudit;
	exports.scheduleStats = scheduleStats;
	exports.scheduleValidate = scheduleValidate;
	exports.schema = schema;
	exports.scopeAudit = scopeAudit;
	exports.scopeDeliverables = scopeDeliverables;
	exports.setActive = setActive;
	exports.setModule = setModule;
	exports.traceMatrix = traceMatrix;
	exports.ui = ui;
	exports.util = util;
	exports.wbsCodes = wbsCodes;
	exports.wbsDelIds = wbsDelIds;
	exports.wbsLeaves = wbsLeaves;
	exports.wbsPhases = wbsPhases;
	exports.wbsResources = wbsResources;
	exports.wbsRollup = wbsRollup;
	return exports;
})({});
