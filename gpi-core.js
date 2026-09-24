var GPI = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/shared/reserve-policy.ts
	var DEFAULT_RESERVES = {
		pmLimit: null,
		ccbLimit: null,
		contAlertPct: null
	};
	var numOrNull$1 = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return typeof n === "number" && isFinite(n) ? n : null;
	};
	function normalizeReserves(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			pmLimit: numOrNull$1(x.pmLimit),
			ccbLimit: numOrNull$1(x.ccbLimit),
			contAlertPct: numOrNull$1(x.contAlertPct)
		};
	}
	var num = (v) => Number(v) || 0;
	function fundOf(o) {
		return o.fund === "Contingencia" ? "cont" : o.fund === "Financiamiento adicional" ? "extra" : "mgmt";
	}
	function analyzeChangeOrders(orders, budget) {
		const b = budget || {};
		let approved = 0, fromCont = 0, fromMgmt = 0, fromExtra = 0, pending = 0, incorporated = 0, pendingBase = 0;
		(orders || []).forEach((o) => {
			if (!o) return;
			if (o.status === "Pendiente") pending++;
			if (o.status !== "Aprobada") return;
			const a = num(o.cost), f = fundOf(o);
			approved += a;
			if (f === "cont") fromCont += a;
			else {
				if (f === "extra") fromExtra += a;
				else fromMgmt += a;
				if (o.baselined) incorporated += a;
				else pendingBase += a;
			}
		});
		const bacInitial = num(b.bac), bacCurrent = bacInitial + incorporated, mgmtAvailable = num(b.mgmt) - fromMgmt;
		return {
			approved,
			fromContingency: fromCont,
			fromMgmt,
			fromExtra,
			pending,
			bacInitial,
			bacCurrent,
			pendingBaseline: pendingBase,
			contingencyAvailable: num(b.cont) - fromCont,
			mgmtAvailable,
			totalBudget: bacCurrent + pendingBase + mgmtAvailable
		};
	}
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
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
				id: str$1(q.id),
				code: str$1(q.code),
				name: str$1(q.name),
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
				version: str$1(q.version),
				date: str$1(q.date),
				reason: str$1(q.reason),
				approver: str$1(q.approver),
				sponsorAuth: !!q.sponsorAuth,
				projectDuration: fin(q.projectDuration),
				finishDate: str$1(q.finishDate),
				deviationPct: q.deviationPct === null || q.deviationPct === void 0 ? null : fin(q.deviationPct)
			};
		});
		return {
			frozen: x.frozen !== false,
			version: str$1(x.version) || "LB-1",
			date: str$1(x.date),
			snapshot: {
				projectDuration: fin(s.projectDuration),
				startDate: str$1(s.startDate),
				finishDate: str$1(s.finishDate),
				nearCriticalDays: fin(s.nearCriticalDays, 10),
				rows,
				evm: normalizeEvmReference(s.evm)
			},
			log
		};
	}
	var optNum = (v) => v === null || v === void 0 || v === "" || !isFinite(Number(v)) ? null : Number(v);
	function normalizeEvmReference(o) {
		if (!o || typeof o !== "object") return null;
		const x = o, cal = x.calendar && typeof x.calendar === "object" ? x.calendar : {};
		if (!Array.isArray(x.packages)) return null;
		const packages = x.packages.filter((p) => p && typeof p === "object").map((p) => {
			const q = p;
			return {
				id: str$1(q.id),
				code: str$1(q.code),
				name: str$1(q.name),
				bac: fin(q.bac),
				source: str$1(q.source),
				es: optNum(q.es),
				ef: optNum(q.ef)
			};
		}).filter((p) => p.id);
		return {
			calendar: {
				workDayIdx: (Array.isArray(cal.workDayIdx) ? cal.workDayIdx : [
					1,
					2,
					3,
					4,
					5
				]).map((d) => Number(d)).filter((d) => isFinite(d)),
				holidays: (Array.isArray(cal.holidays) ? cal.holidays : []).map(str$1)
			},
			packages,
			total: fin(x.total, packages.reduce((s, p) => s + p.bac, 0))
		};
	}
	function deviationPct(base, projectDuration) {
		return base.projectDuration > 0 ? (projectDuration - base.projectDuration) / base.projectDuration * 100 : null;
	}
	//#endregion
	//#region src/shared/risk-analysis.ts
	var RISK_STATUSES = [
		"identificado",
		"analizado",
		"con_respuesta",
		"monitoreo",
		"materializado",
		"cerrado"
	];
	var PROXIMITY = [
		"inmediata",
		"corta",
		"media",
		"larga"
	];
	var DEFAULT_PLAN = {
		probPct: [
			10,
			30,
			50,
			70,
			90
		],
		costBandsPct: [
			1,
			3,
			5,
			10
		],
		timeBandsDays: [
			5,
			15,
			30,
			60
		],
		scopeDescriptors: [
			"Cambio apenas perceptible",
			"Áreas menores del alcance afectadas",
			"Áreas importantes del alcance afectadas",
			"Reducción inaceptable para el patrocinador",
			"El entregable final es inservible"
		],
		thresholdMedium: 6,
		thresholdHigh: 15,
		reviewDays: 30,
		categories: [
			"Técnico",
			"Externo",
			"Organizacional",
			"Gestión del proyecto"
		],
		methodology: "",
		reservePolicy: "",
		roles: "",
		reserves: DEFAULT_RESERVES
	};
	var isNum = (v) => typeof v === "number" && isFinite(v);
	function toNum(v) {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return isNum(n) ? n : null;
	}
	function toLevel(v) {
		const n = toNum(v);
		return n !== null && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
	}
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var arrNum = (v, def) => Array.isArray(v) && v.length === def.length && v.every((x) => toNum(x) !== null) ? v.map((x) => toNum(x)) : def.slice();
	function normalizePlan(p) {
		const o = p && typeof p === "object" ? p : {};
		const cats = Array.isArray(o.categories) ? o.categories.map(str).map((s) => s.trim()).filter(Boolean) : [];
		return {
			probPct: arrNum(o.probPct, DEFAULT_PLAN.probPct),
			costBandsPct: arrNum(o.costBandsPct, DEFAULT_PLAN.costBandsPct),
			timeBandsDays: arrNum(o.timeBandsDays, DEFAULT_PLAN.timeBandsDays),
			scopeDescriptors: Array.isArray(o.scopeDescriptors) && o.scopeDescriptors.length === 5 ? o.scopeDescriptors.map(str) : DEFAULT_PLAN.scopeDescriptors.slice(),
			thresholdMedium: toNum(o.thresholdMedium) ?? DEFAULT_PLAN.thresholdMedium,
			thresholdHigh: toNum(o.thresholdHigh) ?? DEFAULT_PLAN.thresholdHigh,
			reviewDays: toNum(o.reviewDays) ?? DEFAULT_PLAN.reviewDays,
			categories: cats.length ? cats : DEFAULT_PLAN.categories.slice(),
			methodology: str(o.methodology),
			reservePolicy: str(o.reservePolicy),
			roles: str(o.roles),
			reserves: normalizeReserves(o.reserves)
		};
	}
	function maxImpact(c, t, s) {
		const v = [
			c,
			t,
			s
		].filter((x) => x !== null);
		return v.length ? Math.max(...v) : null;
	}
	function riskScore(prob, c, t, s) {
		const i = maxImpact(c, t, s);
		return prob !== null && i !== null ? prob * i : null;
	}
	function levelOf(score, p) {
		if (score === null) return null;
		return score >= p.thresholdHigh ? "alto" : score >= p.thresholdMedium ? "medio" : "bajo";
	}
	var inherentScore = (r) => riskScore(r.prob, r.impCost, r.impTime, r.impScope);
	function rangeProblems(rg, label) {
		const out = [];
		if ([
			rg.low,
			rg.likely,
			rg.high
		].some((x) => x !== null && x < 0)) out.push(label + ": los valores no pueden ser negativos (se registra la magnitud)");
		if (rg.low !== null && rg.likely !== null && rg.low > rg.likely) out.push(label + ": el mínimo supera al más probable");
		if (rg.likely !== null && rg.high !== null && rg.likely > rg.high) out.push(label + ": el más probable supera al máximo");
		if (rg.low !== null && rg.high !== null && rg.low > rg.high) out.push(label + ": el mínimo supera al máximo");
		return out;
	}
	function impactMean(rg) {
		if (rangeProblems(rg, "").length) return null;
		if (rg.low !== null && rg.likely !== null && rg.high !== null) return (rg.low + rg.likely + rg.high) / 3;
		return rg.likely;
	}
	function probEffective(pct, level, p) {
		if (pct !== null && pct >= 0 && pct <= 100) return pct / 100;
		return level !== null ? p.probPct[level - 1] / 100 : null;
	}
	function ev(pct, level, cost, time, p) {
		const pr = probEffective(pct, level, p), c = impactMean(cost), t = impactMean(time);
		return {
			cost: pr !== null && c !== null ? pr * c : null,
			time: pr !== null && t !== null ? pr * t : null
		};
	}
	var inherentEV = (r, p) => ev(r.probPct, r.prob, r.costImpact, r.timeImpact, p);
	function residualOf(r, p) {
		if (r.strategy === "aceptar") return {
			assessed: r.prob !== null,
			derived: true,
			prob: r.prob,
			impCost: r.impCost,
			impTime: r.impTime,
			impScope: r.impScope,
			ev: inherentEV(r, p),
			score: inherentScore(r)
		};
		const has = r.resProb !== null || r.resImpCost !== null || r.resImpTime !== null || r.resImpScope !== null;
		const prob = r.resProb;
		return {
			assessed: has && prob !== null,
			derived: false,
			prob,
			impCost: r.resImpCost,
			impTime: r.resImpTime,
			impScope: r.resImpScope,
			ev: ev(r.resProbPct, r.resProb, r.resCostImpact, r.resTimeImpact, p),
			score: riskScore(prob, r.resImpCost, r.resImpTime, r.resImpScope)
		};
	}
	function range(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			low: toNum(x.low),
			likely: toNum(x.likely),
			high: toNum(x.high)
		};
	}
	function normalizeRisk(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {};
		const type = x.type === "oportunidad" ? "oportunidad" : "amenaza";
		const status = RISK_STATUSES.indexOf(x.status) >= 0 ? x.status : "identificado";
		const id = str(x.id) || fallbackId;
		return {
			id,
			code: str(x.code) || id,
			title: str(x.title),
			cause: str(x.cause),
			event: str(x.event),
			effect: str(x.effect),
			type,
			category: str(x.category),
			wbsIds: Array.isArray(x.wbsIds) ? x.wbsIds.map(str).filter(Boolean) : [],
			actIds: Array.isArray(x.actIds) ? x.actIds.map(str).filter(Boolean) : [],
			owner: str(x.owner),
			proximity: PROXIMITY.indexOf(str(x.proximity)) >= 0 ? str(x.proximity) : "",
			identifiedOn: str(x.identifiedOn),
			reviewedOn: str(x.reviewedOn),
			status,
			prob: toLevel(x.prob),
			impCost: toLevel(x.impCost),
			impTime: toLevel(x.impTime),
			impScope: toLevel(x.impScope),
			probPct: toNum(x.probPct),
			costImpact: range(x.costImpact),
			timeImpact: range(x.timeImpact),
			strategy: str(x.strategy),
			response: str(x.response),
			trigger: str(x.trigger),
			responseOwner: str(x.responseOwner),
			responseCost: toNum(x.responseCost),
			secondary: str(x.secondary),
			resProb: toLevel(x.resProb),
			resImpCost: toLevel(x.resImpCost),
			resImpTime: toLevel(x.resImpTime),
			resImpScope: toLevel(x.resImpScope),
			resProbPct: toNum(x.resProbPct),
			resCostImpact: range(x.resCostImpact),
			resTimeImpact: range(x.resTimeImpact),
			materializedOn: str(x.materializedOn),
			actualCost: toNum(x.actualCost),
			actualDelay: toNum(x.actualDelay),
			notes: str(x.notes)
		};
	}
	var isOpen = (r) => r.status !== "materializado" && r.status !== "cerrado";
	function portfolio(risks, p) {
		const pf = {
			total: risks.length,
			open: 0,
			threats: 0,
			opportunities: 0,
			materialized: 0,
			closed: 0,
			byLevel: {
				alto: 0,
				medio: 0,
				bajo: 0,
				sin: 0
			},
			residualByLevel: {
				alto: 0,
				medio: 0,
				bajo: 0,
				sin: 0
			},
			byCategory: [],
			evThreatCost: 0,
			evOpportunityCost: 0,
			netEvCost: 0,
			resEvThreatCost: 0,
			resEvOpportunityCost: 0,
			netResEvCost: 0,
			evThreatDays: 0,
			actualCost: 0,
			coverage: {
				withOwner: 0,
				withResponse: 0,
				withWbs: 0,
				analyzed: 0,
				quantified: 0,
				openCount: 0
			}
		};
		const cat = {};
		risks.forEach((r) => {
			if (r.status === "materializado") {
				pf.materialized++;
				pf.actualCost += r.actualCost || 0;
			}
			if (r.status === "cerrado") pf.closed++;
			if (r.type === "amenaza") pf.threats++;
			else pf.opportunities++;
			if (!isOpen(r)) return;
			pf.open++;
			pf.coverage.openCount++;
			const lv = levelOf(inherentScore(r), p);
			pf.byLevel[lv || "sin"]++;
			const res = residualOf(r, p);
			pf.residualByLevel[res.assessed ? levelOf(res.score, p) || "sin" : "sin"]++;
			if (r.owner.trim()) pf.coverage.withOwner++;
			if (r.strategy) pf.coverage.withResponse++;
			if (r.wbsIds.length) pf.coverage.withWbs++;
			if (lv) pf.coverage.analyzed++;
			const e = inherentEV(r, p);
			if (e.cost !== null) pf.coverage.quantified++;
			const k = r.category.trim() || "Sin categoría";
			cat[k] = cat[k] || {
				count: 0,
				evCost: 0
			};
			cat[k].count++;
			if (e.cost !== null) cat[k].evCost += r.type === "amenaza" ? e.cost : -e.cost;
			if (r.type === "amenaza") {
				pf.evThreatCost += e.cost || 0;
				pf.evThreatDays += e.time || 0;
				pf.resEvThreatCost += res.assessed ? res.ev.cost || 0 : 0;
			} else {
				pf.evOpportunityCost += e.cost || 0;
				pf.resEvOpportunityCost += res.assessed ? res.ev.cost || 0 : 0;
			}
		});
		pf.netEvCost = pf.evThreatCost - pf.evOpportunityCost;
		pf.netResEvCost = pf.resEvThreatCost - pf.resEvOpportunityCost;
		pf.byCategory = Object.keys(cat).map((k) => ({
			category: k,
			count: cat[k].count,
			evCost: cat[k].evCost
		})).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
		return pf;
	}
	//#endregion
	//#region src/core/gpi-core.ts
	var KEY = "gpi_db";
	var SCHEMA = "gpi.project/v1";
	var mem = null;
	var pendingUnsaved = null;
	var pendingBase = null;
	function canWrite() {
		try {
			const k = "__gpi_t";
			localStorage.setItem(k, "1");
			localStorage.removeItem(k);
			return true;
		} catch (e) {
			return false;
		}
	}
	function readable() {
		try {
			localStorage.getItem(KEY);
			return true;
		} catch (e) {
			return false;
		}
	}
	function storageStatus() {
		return {
			readable: readable(),
			writable: canWrite()
		};
	}
	function memoryMode() {
		return !canWrite() && !readable();
	}
	function fresh() {
		return {
			version: 1,
			activeId: null,
			projects: {}
		};
	}
	function db() {
		if (pendingUnsaved) return pendingUnsaved;
		if (memoryMode()) return mem || (mem = fresh());
		try {
			return JSON.parse(localStorage.getItem("gpi_db")) || fresh();
		} catch (e) {
			return fresh();
		}
	}
	function hasUnsavedChanges() {
		return pendingUnsaved !== null;
	}
	function sameJson(a, b) {
		return JSON.stringify(a === void 0 ? null : a) === JSON.stringify(b === void 0 ? null : b);
	}
	function mergeProject(id, ours, theirs, base, conflicts) {
		if (!base) return (ours.meta.updatedAt || 0) >= (theirs.meta.updatedAt || 0) ? ours : theirs;
		const om = ours.meta, tm = theirs.meta, bm = base.meta;
		const meta = {};
		(/* @__PURE__ */ new Set([
			...Object.keys(om),
			...Object.keys(tm),
			...Object.keys(bm)
		])).forEach((k) => {
			if (k === "updatedAt") return;
			const oursCh = !sameJson(om[k], bm[k]), theirsCh = !sameJson(tm[k], bm[k]);
			if (oursCh && theirsCh && !sameJson(om[k], tm[k])) conflicts.push(id + "/meta." + k);
			const v = oursCh ? om[k] : tm[k];
			if (v !== void 0) meta[k] = v;
		});
		meta.updatedAt = Math.max(Number(om.updatedAt) || 0, Number(tm.updatedAt) || 0);
		const oMods = ours.modules || {}, tMods = theirs.modules || {}, bMods = base.modules || {};
		const mods = {}, revs = {};
		(/* @__PURE__ */ new Set([
			...Object.keys(oMods),
			...Object.keys(tMods),
			...Object.keys(bMods)
		])).forEach((mk) => {
			const oursCh = !sameJson(oMods[mk], bMods[mk]), theirsCh = !sameJson(tMods[mk], bMods[mk]);
			const both = oursCh && theirsCh && !sameJson(oMods[mk], tMods[mk]);
			if (both) conflicts.push(id + "/" + mk);
			const v = oursCh ? oMods[mk] : tMods[mk];
			if (v !== void 0) mods[mk] = v;
			const or = revOf(ours, mk), tr = revOf(theirs, mk);
			revs[mk] = both ? Math.max(or, tr) + 1 : Math.max(or, tr);
		});
		return {
			schema: ours.schema,
			meta,
			modules: mods,
			revs
		};
	}
	function reconcileWithDisk(d) {
		let diskRaw = null;
		try {
			diskRaw = localStorage.getItem(KEY);
		} catch (_) {}
		if (!diskRaw) return null;
		let disk;
		try {
			disk = JSON.parse(diskRaw);
		} catch (_) {
			return null;
		}
		if (!disk || !isPlainObject(disk.projects)) return null;
		const base = pendingBase || fresh(), conflicts = [];
		const projects = {};
		(/* @__PURE__ */ new Set([
			...Object.keys(d.projects),
			...Object.keys(disk.projects),
			...Object.keys(base.projects)
		])).forEach((id) => {
			const o = d.projects[id], t = disk.projects[id], b = base.projects[id];
			if (o && t) {
				projects[id] = mergeProject(id, o, t, b, conflicts);
				return;
			}
			if (o && !t) {
				if (!b) {
					projects[id] = o;
					return;
				}
				if (sameJson(o, b)) return;
				conflicts.push(id + " (eliminado en otra pestaña, modificado aquí: se conserva)");
				projects[id] = o;
				return;
			}
			if (!o && t) {
				if (!b) {
					projects[id] = t;
					return;
				}
				if (sameJson(t, b)) return;
				conflicts.push(id + " (eliminado aquí, modificado en otra pestaña: se conserva)");
				projects[id] = t;
			}
		});
		const pick = !sameJson(d.activeId, base.activeId) ? d.activeId : disk.activeId;
		const activeId = pick && projects[pick] ? pick : disk.activeId && projects[disk.activeId] ? disk.activeId : d.activeId && projects[d.activeId] ? d.activeId : Object.keys(projects)[0] || null;
		return {
			merged: {
				version: d.version,
				activeId,
				projects
			},
			conflicts
		};
	}
	var lastReconcileConflicts = [];
	function lastReconcile() {
		return lastReconcileConflicts.slice();
	}
	function save(d) {
		if (!pendingUnsaved && memoryMode()) {
			mem = d;
			return true;
		}
		try {
			const rec = d === pendingUnsaved ? reconcileWithDisk(d) : null;
			localStorage.setItem(KEY, JSON.stringify(rec ? rec.merged : d));
			if (rec) lastReconcileConflicts = rec.conflicts;
			pendingUnsaved = null;
			pendingBase = null;
			hideQuotaNotice();
			if (rec && rec.conflicts.length) showRecoverNotice(rec.conflicts);
			return true;
		} catch (e) {
			if (pendingUnsaved == null) try {
				pendingBase = JSON.parse(localStorage.getItem(KEY));
			} catch (_) {
				pendingBase = null;
			}
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
	function showRecoverNotice(conflicts) {
		try {
			if (typeof document === "undefined" || !document.body) return;
			const el = document.createElement("div");
			el.id = "gpiRecoverNotice";
			el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2500;background:#7a5a00;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:560px;text-align:center;cursor:pointer;";
			el.textContent = "⚠ Se recuperó el guardado, pero otra pestaña había cambiado lo mismo: " + conflicts.join("; ") + ". Se conservó lo de esta pestaña (clic para cerrar).";
			el.onclick = () => {
				if (el.parentNode) el.parentNode.removeChild(el);
			};
			document.body.appendChild(el);
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
	function isPlainObject(v) {
		return !!v && typeof v === "object" && !Array.isArray(v);
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
		return p && p.modules ? p.modules[name] || null : null;
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
	function revOf(p, module) {
		const r = p.revs && p.revs[module];
		return typeof r === "number" ? r : 0;
	}
	function bumpRev(p, module) {
		if (!isPlainObject(p.revs)) p.revs = {};
		const n = revOf(p, module) + 1;
		p.revs[module] = n;
		return n;
	}
	function jsonOf(v) {
		return JSON.stringify(v === void 0 ? null : v);
	}
	function writeModule(name, data, opts) {
		const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
		if (!p) return {
			status: "rejected",
			rev: null,
			reason: "no-active"
		};
		if (opts && opts.projectId != null && d.activeId !== opts.projectId) return {
			status: "rejected",
			rev: null,
			reason: "project-changed"
		};
		p.modules = isPlainObject(p.modules) ? p.modules : {};
		p.modules[name] = data;
		const rev = opts && opts.derived ? revOf(p, name) : bumpRev(p, name);
		p.meta.updatedAt = Date.now();
		return {
			status: save(d) ? "saved" : "pending",
			rev
		};
	}
	function setModule(name, data, expectedProjectId) {
		return writeModule(name, data, { projectId: expectedProjectId }).status === "saved";
	}
	function openSession(module) {
		const d = db(), p = d.activeId ? d.projects[d.activeId] : null;
		if (!p) return null;
		const m = isPlainObject(p.modules) ? p.modules[module] : void 0;
		return {
			projectId: d.activeId,
			module,
			rev: revOf(p, module),
			snapshot: jsonOf(m),
			meta: JSON.parse(JSON.stringify(p.meta))
		};
	}
	function rebaseSession(session, data) {
		if (session) session.snapshot = jsonOf(data);
	}
	function flushPending() {
		return pendingUnsaved ? save(pendingUnsaved) : true;
	}
	function confirmPending(s) {
		const p = db().projects[s.projectId];
		if (s.pending && s.pending.module) {
			s.rev = p ? revOf(p, s.module) : s.pending.module.rev;
			s.snapshot = s.pending.module.json;
		}
		if (s.pending && s.pending.meta) Object.assign(s.meta, s.pending.meta);
		delete s.pending;
	}
	function commitState(session, hasData, data, patch) {
		const name = session.module;
		const gate = () => {
			const g = db();
			if (!g.projects[session.projectId]) return {
				status: "rejected",
				rev: null,
				reason: "no-active"
			};
			if (g.activeId !== session.projectId) return {
				status: "rejected",
				rev: null,
				reason: "project-changed"
			};
			return null;
		};
		const closed = gate();
		if (closed) return closed;
		let settled = false;
		if (session.pending && (!pendingUnsaved || flushPending())) {
			confirmPending(session);
			settled = true;
		}
		const pend = session.pending;
		const stale = gate();
		if (stale) return stale;
		const d = db(), p = d.projects[session.projectId];
		const mods = isPlainObject(p.modules) ? p.modules : {};
		const conflicts = [];
		let writeMod = false, json = "";
		const baseRev = pend && pend.module ? pend.module.rev : session.rev;
		if (hasData) {
			json = jsonOf(data);
			const baseJson = pend && pend.module ? pend.module.json : session.snapshot;
			if (json !== baseJson) {
				const diskRev = revOf(p, name);
				if (json === jsonOf(mods[name]) && !pendingUnsaved) {
					session.rev = diskRev;
					session.snapshot = json;
				} else if (diskRev !== baseRev) conflicts.push(name);
				else writeMod = true;
			}
		}
		const cur = p.meta;
		const base = Object.assign({}, session.meta, pend && pend.meta ? pend.meta : {});
		const apply = {};
		if (patch) Object.keys(patch).forEach((k) => {
			const v = patch[k];
			if (jsonOf(v) === jsonOf(base[k])) return;
			if (jsonOf(cur[k]) === jsonOf(v) && !pendingUnsaved) {
				session.meta[k] = v;
				return;
			}
			if (jsonOf(cur[k]) !== jsonOf(base[k])) {
				conflicts.push("meta." + k);
				return;
			}
			apply[k] = v;
		});
		if (conflicts.length) return {
			status: "conflict",
			rev: revOf(p, name),
			conflicts
		};
		if (!writeMod && !Object.keys(apply).length) return pend ? {
			status: "pending",
			rev: pend.module ? pend.module.rev : null
		} : {
			status: settled ? "saved" : "unchanged",
			rev: session.rev
		};
		let rev = null;
		if (writeMod) {
			p.modules = isPlainObject(p.modules) ? p.modules : {};
			p.modules[name] = data;
			rev = bumpRev(p, name);
		}
		if (Object.keys(apply).length) Object.assign(p.meta, apply);
		p.meta.updatedAt = Date.now();
		if (save(d)) {
			if (session.pending) confirmPending(session);
			if (writeMod && rev != null) {
				session.rev = rev;
				session.snapshot = json;
			}
			Object.assign(session.meta, apply);
			return {
				status: "saved",
				rev: writeMod ? rev : session.rev
			};
		}
		session.pending = {
			module: writeMod && rev != null ? {
				json,
				rev
			} : pend ? pend.module : void 0,
			meta: Object.assign({}, pend && pend.meta ? pend.meta : {}, apply)
		};
		return {
			status: "pending",
			rev
		};
	}
	function saveState(name, data, patch, session) {
		if (!session || session.module !== name) {
			const r = writeModule(name, data);
			if (patch && r.status !== "rejected") {
				patchMeta(patch);
				if (r.status === "saved" && pendingUnsaved) return {
					status: "pending",
					rev: r.rev
				};
			}
			return r;
		}
		return commitState(session, true, data, patch);
	}
	function saveModule(name, data, session) {
		return saveState(name, data, null, session);
	}
	function saveMeta(partial, session) {
		const d = db();
		if (!(d.activeId ? d.projects[d.activeId] : null)) return {
			status: "rejected",
			rev: null,
			reason: "no-active"
		};
		if (!session) return {
			status: patchMeta(partial) ? pendingUnsaved ? "pending" : "saved" : "rejected",
			rev: null
		};
		return commitState(session, false, void 0, partial);
	}
	function describeWrite(r, label) {
		const what = label || "Estos datos";
		if (r.status === "saved" || r.status === "unchanged") return "";
		if (r.status === "pending") return "⚠ Cambios SIN guardar: el almacenamiento del navegador está lleno. Exporta el proyecto desde el Panel de Control para no perderlos.";
		if (r.status === "conflict") return "⚠ " + what + " cambió en otra pestaña después de abrir esta" + (r.conflicts && r.conflicts.length ? " (" + r.conflicts.join(", ") + ")" : "") + ": no se sobrescribió. Recarga esta pestaña para ver la versión actual.";
		return r.reason === "no-active" ? "⚠ No hay proyecto activo: no se guardó." : "⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.";
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
	function sanitizeTree(rootId, nodes) {
		if (typeof rootId !== "string" || !isPlainObject(nodes)) return;
		const map = nodes;
		const visited = /* @__PURE__ */ new Set();
		(function walk(id, parentId) {
			const n = map[id];
			if (!n || visited.has(id)) return;
			visited.add(id);
			n.parentId = parentId;
			const kids = Array.isArray(n.children) ? n.children : [];
			const clean = [];
			kids.forEach((cid) => {
				if (typeof cid !== "string" || !map[cid] || visited.has(cid) || cid === id) return;
				clean.push(cid);
				walk(cid, id);
			});
			n.children = clean;
		})(rootId, null);
	}
	function detectTool(obj) {
		if (!obj || typeof obj !== "object") return null;
		if (obj.kind === "gpi.obs/v1" && obj.nodes && obj.rootId) {
			if (!isPlainObject(obj.nodes)) obj.nodes = {};
			sanitizeTree(obj.rootId, obj.nodes);
			return {
				module: "obs",
				data: {
					rootId: obj.rootId,
					idCounter: obj.idCounter || 1,
					nodes: obj.nodes
				}
			};
		}
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
				idCounter: obj.data.idCounter || 1,
				milestones: Array.isArray(obj.data.milestones) ? obj.data.milestones : []
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
		if (obj.nodes && obj.rootId) {
			if (!isPlainObject(obj.nodes)) obj.nodes = {};
			sanitizeTree(obj.rootId, obj.nodes);
			return {
				module: "wbs",
				data: {
					rootId: obj.rootId,
					idCounter: obj.idCounter || 1,
					nodes: obj.nodes
				}
			};
		}
		return null;
	}
	function normalizeToProject(obj) {
		if (obj && obj.schema === SCHEMA && obj.meta) {
			const proj = obj;
			if (!isPlainObject(proj.modules)) proj.modules = {};
			const wbsMod = proj.modules.wbs;
			if (wbsMod && wbsMod.nodes) {
				if (!isPlainObject(wbsMod.nodes)) wbsMod.nodes = {};
				sanitizeTree(wbsMod.rootId, wbsMod.nodes);
			}
			const obsMod = proj.modules.obs;
			if (obsMod && obsMod.nodes) {
				if (!isPlainObject(obsMod.nodes)) obsMod.nodes = {};
				sanitizeTree(obsMod.rootId, obsMod.nodes);
			}
			return proj;
		}
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
		p.modules = isPlainObject(p.modules) ? p.modules : {};
		p.modules[det.module] = det.data;
		bumpRev(p, det.module);
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
			const seen = /* @__PURE__ */ new Set();
			while (n && n.parentId && !seen.has(n.id)) {
				seen.add(n.id);
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
		const an = analyzeChangeOrders(co, {
			bac,
			cont: Number(comp.cont) || 0,
			mgmt: Number(comp.mgmt) || Math.max(0, total - bac)
		});
		return {
			baseCost: base,
			bac,
			total,
			contingencyPct: contPct,
			estimateClass: cost && cost.estimate && cost.estimate.class || null,
			changeOrders: co.length,
			pending: an.pending,
			approvedAmount: an.approved,
			fromContingency: an.fromContingency,
			fromMgmt: an.fromMgmt,
			fromExtra: an.fromExtra,
			bacCurrent: an.bacCurrent,
			pendingBaseline: an.pendingBaseline,
			contingencyAvailable: an.contingencyAvailable,
			mgmtAvailable: an.mgmtAvailable,
			hasData: !!(cost && (base || co.length))
		};
	}
	function riskPortfolio(mod) {
		const plan = normalizePlan(mod && mod.plan);
		return portfolio((mod && Array.isArray(mod.risks) ? mod.risks : []).map((o, i) => normalizeRisk(o, "rk" + (i + 1))), plan);
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
	function makeRealTimeAxis(start, calendar) {
		const DAY = 864e5, EPS = 1e-9;
		const work = {};
		(calendar.workDayIdx && calendar.workDayIdx.length ? calendar.workDayIdx : [
			1,
			2,
			3,
			4,
			5
		]).forEach((d) => {
			work[d] = true;
		});
		const hol = {};
		(calendar.holidays || []).forEach((h) => {
			hol[String(h).slice(0, 10)] = true;
		});
		const isWork = (s) => !!work[((s + 4) % 7 + 7) % 7] && !hol[(/* @__PURE__ */ new Date(s * DAY)).toISOString().slice(0, 10)];
		const nextWork = (s) => {
			while (!isWork(s)) s++;
			return s;
		};
		const prevWork = (s) => {
			while (!isWork(s)) s--;
			return s;
		};
		const s0 = nextWork(Math.floor(start.getTime() / DAY));
		const fwd = [s0], bwd = [], idx = /* @__PURE__ */ new Map([[s0, 0]]);
		function D(n) {
			if (n >= 0) {
				while (fwd.length <= n) {
					const s = nextWork(fwd[fwd.length - 1] + 1);
					idx.set(s, fwd.length);
					fwd.push(s);
				}
				return fwd[n];
			}
			const k = -n - 1;
			while (bwd.length <= k) {
				const s = prevWork((bwd.length ? bwd[bwd.length - 1] : s0) - 1);
				idx.set(s, -(bwd.length + 1));
				bwd.push(s);
			}
			return bwd[k];
		}
		function idxOf(s) {
			if (!idx.has(s)) {
				if (s > s0) while (fwd[fwd.length - 1] < s) D(fwd.length);
				else while (!bwd.length || bwd[bwd.length - 1] > s) D(-(bwd.length + 1));
			}
			return idx.get(s);
		}
		const split = (t) => {
			const d = Math.floor(t + EPS), g = t - d;
			return [d, g < EPS ? 0 : g];
		};
		return {
			realStart(x) {
				const [n, f] = split(x);
				return D(n) + f;
			},
			realEnd(x) {
				const [n, f] = split(x);
				return f > 0 ? D(n) + f : n === 0 ? D(0) : D(n - 1) + 1;
			},
			ceilWork(t) {
				const [d, g] = split(t);
				return isWork(d) ? idxOf(d) + g : idxOf(nextWork(d));
			},
			floorEnd(t) {
				const [d, g] = split(t);
				return g > 0 && isWork(d) ? idxOf(d) + g : idxOf(prevWork(d - 1)) + 1;
			},
			floorStart(t) {
				const [d, g] = split(t);
				return isWork(d) ? idxOf(d) + g : idxOf(prevWork(d)) + 1;
			}
		};
	}
	function lagToWorkDays(l, calendar) {
		const cal = calendar || {
			workDayIdx: [
				1,
				2,
				3,
				4,
				5
			],
			hoursPerDay: 8
		};
		const wpw = cal.workDayIdx && cal.workDayIdx.length ? cal.workDayIdx.length : 5;
		const hpd = Number(cal.hoursPerDay) > 0 ? Number(cal.hoursPerDay) : 8;
		const v = Number(l.lag) || 0, u = l.lagUnit || "d";
		if (u === "h") return v / hpd;
		if (u === "w") return v * wpw;
		if (u === "ed") return v * (wpw / 7);
		return v;
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
		const start = o.startDate ? parseISO(o.startDate) : null;
		const rt = start ? makeRealTimeAxis(start, cal) : null;
		const isEd = (l) => !!rt && (l.lagUnit || "d") === "ed";
		const edLag = (l) => Number(l.lag) || 0;
		const edMax = (l, y) => {
			const t = rt.realStart(y) - edLag(l);
			return l.type === "SS" || l.type === "SF" ? rt.floorStart(t) : rt.floorEnd(t);
		};
		function lagWD(l) {
			return lagToWorkDays(l, cal);
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
				let lb;
				if (isEd(l)) {
					const R = rt, v = edLag(l);
					if (l.type === "SS") lb = R.ceilWork(R.realStart(ES[l.from]) + v);
					else if (l.type === "FF") lb = R.ceilWork(R.realEnd(EF[l.from]) + v) - dur[id];
					else if (l.type === "SF") lb = R.ceilWork(R.realStart(ES[l.from]) + v) - dur[id];
					else lb = R.ceilWork(R.realEnd(EF[l.from]) + v);
				} else {
					const g = lagWD(l);
					if (l.type === "SS") lb = ES[l.from] + g;
					else if (l.type === "FF") lb = EF[l.from] + g - dur[id];
					else if (l.type === "SF") lb = ES[l.from] + g - dur[id];
					else lb = EF[l.from] + g;
				}
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
					let ub;
					if (isEd(l)) {
						if (l.type === "SS") ub = edMax(l, LF[l.to] - dur[l.to]) + dur[id];
						else if (l.type === "FF") ub = edMax(l, LF[l.to]);
						else if (l.type === "SF") ub = edMax(l, LF[l.to]) + dur[id];
						else ub = edMax(l, LF[l.to] - dur[l.to]);
					} else {
						const g = lagWD(l);
						if (l.type === "SS") ub = LF[l.to] - dur[l.to] - g + dur[id];
						else if (l.type === "FF") ub = LF[l.to] - g;
						else if (l.type === "SF") ub = LF[l.to] - g + dur[id];
						else ub = LF[l.to] - dur[l.to] - g;
					}
					if (ub < LF[id]) LF[id] = ub;
				});
			}
			LS[id] = LF[id] - dur[id];
		}
		const EPS = 1e-6;
		const rows = {};
		const criticalIds = [];
		ids.forEach((id) => {
			const tf = LS[id] - ES[id];
			let ff = Infinity;
			if (outdeg[id] === 0) ff = tf;
			else out[id].forEach((l) => {
				let s;
				if (isEd(l)) {
					if (l.type === "SS") s = edMax(l, ES[l.to]) - ES[id];
					else if (l.type === "FF") s = edMax(l, EF[l.to]) - EF[id];
					else if (l.type === "SF") s = edMax(l, EF[l.to]) - ES[id];
					else s = edMax(l, ES[l.to]) - EF[id];
				} else {
					const g = lagWD(l);
					if (l.type === "SS") s = ES[l.to] - ES[id] - g;
					else if (l.type === "FF") s = EF[l.to] - EF[id] - g;
					else if (l.type === "SF") s = EF[l.to] - ES[id] - g;
					else s = ES[l.to] - EF[id] - g;
				}
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
		const hasEd = lk.some((l) => inSet[l.from] && inSet[l.to] && l.from !== l.to && (l.lagUnit || "d") === "ed" && Number(l.lag) !== 0);
		return {
			ok: true,
			rows,
			order,
			criticalIds,
			projectDuration: projDur,
			projectStart: start ? addWorkingDays(start, 0, cal) : "",
			projectFinishDate: start ? addWorkingDays(start, Math.max(0, Math.round(projDur) - 1), cal) : "",
			elapsedReal: !!rt,
			elapsedApprox: !rt && hasEd
		};
	}
	function pertCriticalChain(res, links, calendar, variances) {
		if (!res || !res.ok || !res.criticalIds.length) return {
			ok: false,
			reason: "empty"
		};
		const EPS = 1e-6, rows = res.rows, crit = {};
		res.criticalIds.forEach((id) => {
			crit[id] = true;
		});
		const inE = {}, outN = {};
		res.criticalIds.forEach((id) => {
			inE[id] = [];
			outN[id] = 0;
		});
		let elapsedOnPath = false;
		(links || []).forEach((l) => {
			if (l.from === l.to || !crit[l.from] || !crit[l.to]) return;
			if (res.elapsedReal && (l.lagUnit || "d") === "ed" && Number(l.lag) !== 0) {
				elapsedOnPath = true;
				return;
			}
			const a = rows[l.from], b = rows[l.to], g = lagToWorkDays(l, calendar);
			const lhs = l.type === "FF" || l.type === "SF" ? b.ef : b.es;
			const rhs = l.type === "SS" || l.type === "SF" ? a.es + g : a.ef + g;
			if (Math.abs(lhs - rhs) > EPS) return;
			inE[l.to].push({
				l,
				g
			});
			outN[l.from]++;
		});
		if (elapsedOnPath) return {
			ok: false,
			reason: "elapsed"
		};
		const sources = res.criticalIds.filter((id) => !inE[id].length);
		if (sources.length !== 1 || res.criticalIds.some((id) => inE[id].length > 1 || outN[id] > 1)) return {
			ok: false,
			reason: "parallel"
		};
		const next = {};
		res.criticalIds.forEach((id) => {
			inE[id].forEach((e) => {
				next[e.l.from] = {
					to: id,
					l: e.l,
					g: e.g
				};
			});
		});
		const plus = (a, k, id, s) => {
			const c = Object.assign({}, a.c);
			if (id) c[id] = (c[id] || 0) + (s || 0);
			return {
				k: a.k + k,
				c
			};
		};
		const minusDur = (a, id) => plus(a, 0, id, -1);
		const ids = [];
		let cur = sources[0], ES = {
			k: 0,
			c: {}
		}, EF = plus(ES, 0, cur, 1);
		ids.push(cur);
		while (next[cur]) {
			const { to, l, g } = next[cur];
			if (ids.indexOf(to) >= 0) return {
				ok: false,
				reason: "inconsistent"
			};
			let nES, nEF;
			if (l.type === "SS") {
				nES = plus(ES, g);
				nEF = plus(nES, 0, to, 1);
			} else if (l.type === "FF") {
				nEF = plus(EF, g);
				nES = minusDur(nEF, to);
			} else if (l.type === "SF") {
				nEF = plus(ES, g);
				nES = minusDur(nEF, to);
			} else {
				nES = plus(EF, g);
				nEF = plus(nES, 0, to, 1);
			}
			ES = nES;
			EF = nEF;
			cur = to;
			ids.push(cur);
		}
		if (ids.length !== res.criticalIds.length) return {
			ok: false,
			reason: "parallel"
		};
		let t = EF.k;
		Object.keys(EF.c).forEach((id) => {
			t += EF.c[id] * (rows[id].ef - rows[id].es);
		});
		if (Math.abs(t - res.projectDuration) > 1e-4) return {
			ok: false,
			reason: "inconsistent"
		};
		const weights = {};
		let variance = 0;
		Object.keys(EF.c).forEach((id) => {
			if (Math.abs(EF.c[id]) <= EPS) return;
			weights[id] = EF.c[id];
			variance += EF.c[id] * EF.c[id] * (Number(variances[id]) || 0);
		});
		return {
			ok: true,
			ids,
			mean: res.projectDuration,
			variance,
			weights
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
		let sched = null, m = null, net = null;
		try {
			sched = getModule("schedule");
		} catch (e) {}
		const links = sched && Array.isArray(sched.links) ? sched.links : [];
		try {
			m = meta();
		} catch (e3) {}
		try {
			net = scheduleNetwork(getModule("wbs"), getModule("activities"), getModule("pert"), sched, getModule("schedulePlan"), m ? m.startDate : "");
		} catch (e2) {}
		const nodes = net ? net.nodes.map((n) => ({
			id: n.id,
			dur: n.dur
		})) : [];
		const bl = normalizeBaseline(sched ? sched.baseline : null);
		const result = cpm(nodes, net ? net.links : [], net ? net.calendar : projectCalendar(), { startDate: m ? m.startDate : void 0 });
		return {
			hasSlice: !!sched,
			links: links.length,
			activities: net ? net.nodes.filter((n) => !n.isMilestone).length : 0,
			ok: result.ok,
			projectDuration: result.ok ? result.projectDuration : null,
			criticalCount: result.ok ? result.criticalIds.length : 0,
			finishDate: result.ok ? result.projectFinishDate : "",
			baselineVersion: bl ? bl.version : null,
			baselineDeviationDays: bl && result.ok ? result.projectDuration - bl.snapshot.projectDuration : null,
			baselineDeviationPct: bl && result.ok ? deviationPct(bl.snapshot, result.projectDuration) : null
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
	function scheduleNetwork(wbs, act, pert, sched, sp, startDate) {
		const a = act || {}, byLeaf = a.byLeaf || {}, milestones = a.milestones || [];
		const dur = {};
		try {
			pertStats(pert, act, wbs).rows.forEach((r) => {
				dur[r.id] = r.dur;
			});
		} catch (e) {}
		const nodes = [];
		const leaves = wbsLeaves(wbs);
		const known = {};
		leaves.forEach((l) => {
			known[l.id] = true;
		});
		const loose = milestones.filter((m) => !m.leafId), start = [], orphan = [], after = {};
		loose.forEach((m) => {
			if (!m.afterLeafId) start.push(m);
			else if (known[m.afterLeafId]) (after[m.afterLeafId] = after[m.afterLeafId] || []).push(m);
			else orphan.push(m);
		});
		const pushMs = (m, leafId) => {
			nodes.push({
				id: m.id,
				code: m.code,
				name: m.name,
				leafId,
				dur: 0,
				hasDur: true,
				isMilestone: true
			});
		};
		start.forEach((m) => pushMs(m, null));
		leaves.forEach((l) => {
			(byLeaf[l.id] || []).forEach((av, i) => {
				const d = dur[av.id];
				nodes.push({
					id: av.id,
					code: l.code + "." + (i + 1),
					name: av.name || "",
					leafId: l.id,
					dur: d == null ? 0 : d,
					hasDur: d != null,
					isMilestone: false
				});
			});
			milestones.filter((m) => m.leafId === l.id).forEach((m) => pushMs(m, l.id));
			(after[l.id] || []).forEach((m) => pushMs(m, null));
		});
		orphan.forEach((m) => pushMs(m, null));
		const inNet = {};
		nodes.forEach((n) => {
			inNet[n.id] = true;
		});
		const links = (sched && Array.isArray(sched.links) ? sched.links : []).filter((l) => inNet[l.from] && inNet[l.to] && l.from !== l.to);
		return {
			nodes,
			links,
			calendar: projectCalendar(sp),
			startDate: startDate || "",
			hasElapsedLags: links.some((l) => (l.lagUnit || "d") === "ed" && Number(l.lag) !== 0)
		};
	}
	function activeScheduleNetwork() {
		try {
			if (!readable() || !active()) return null;
			const m = meta();
			const net = scheduleNetwork(getModule("wbs"), getModule("activities"), getModule("pert"), getModule("schedule"), getModule("schedulePlan"), m ? m.startDate : "");
			return net.nodes.some((n) => !n.isMilestone) ? net : null;
		} catch (e) {
			return null;
		}
	}
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
		pertCriticalChain,
		charterAudit,
		schedulePlanAudit,
		raciCoverage,
		raciAudit,
		costSummary,
		riskPortfolio,
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
		scheduleStats,
		scheduleNetwork,
		activeScheduleNetwork
	};
	var schema = SCHEMA;
	var NOTICE_ID = "gpi-storage-notice";
	function checkStorageNotice(probe = true) {
		if (typeof document === "undefined" || !document.body) return false;
		const shown = !!document.getElementById(NOTICE_ID);
		const full = readable() && (hasUnsavedChanges() || (probe || shown) && !canWrite());
		let el = document.getElementById(NOTICE_ID);
		if (!full) {
			if (el) el.remove();
			return false;
		}
		if (el) return true;
		el = document.createElement("div");
		el.id = NOTICE_ID;
		el.setAttribute("role", "alert");
		el.style.cssText = "position:sticky;top:0;z-index:2147483000;background:#fff3d6;color:#6b4a00;border-bottom:2px solid #ff9f1c;padding:9px 16px;font:600 12.5px/1.5 Manrope,Inter,sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
		const enPanel = /Panel_Control/i.test(String(typeof location !== "undefined" && location.pathname || ""));
		el.innerHTML = "<span>⚠ <b>El almacenamiento del navegador está lleno.</b> Puedes seguir viendo tu proyecto, pero <b>los cambios no se están guardando</b>. " + (enPanel ? "Exporta tu proyecto ahora (botón Exportar) " : "Exporta tu proyecto ahora desde el Panel de Control ") + "y libera espacio (elimina los proyectos que ya no uses) antes de seguir trabajando.</span>" + (enPanel ? "" : "<a href=\"Panel_Control.html\" style=\"color:#6b4a00;text-decoration:underline\">Ir al Panel para exportar</a>");
		document.body.insertBefore(el, document.body.firstChild);
		return true;
	}
	function installStorageNotice() {
		if (typeof document === "undefined" || typeof window === "undefined") return;
		const w = window;
		if (w.__gpiNotice) return;
		w.__gpiNotice = true;
		const run = (probe) => () => {
			try {
				checkStorageNotice(probe);
			} catch (e) {}
		};
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run(true));
		else run(true)();
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) run(true)();
		});
		setInterval(run(false), 2e4);
	}
	installStorageNotice();
	//#endregion
	exports.GPI = {
		KEY,
		schema,
		checkStorageNotice,
		available: readable,
		canWrite,
		storageStatus,
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
		writeModule,
		openSession,
		rebaseSession,
		saveModule,
		saveMeta,
		saveState,
		describeWrite,
		lastReconcile,
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
	exports.activeScheduleNetwork = activeScheduleNetwork;
	exports.activitiesStats = activitiesStats;
	exports.addWorkingDays = addWorkingDays;
	exports.applyCostEstimateToWbs = applyCostEstimateToWbs;
	exports.applyRaciToWbs = applyRaciToWbs;
	exports.applyScheduleToWbs = applyScheduleToWbs;
	exports.available = readable;
	exports.buildScheduleLinks = buildScheduleLinks;
	exports.canWrite = canWrite;
	exports.charterAudit = charterAudit;
	exports.charterRans = charterRans;
	exports.checkStorageNotice = checkStorageNotice;
	exports.costEstimateRows = costEstimateRows;
	exports.costEstimateTotal = costEstimateTotal;
	exports.costSummary = costSummary;
	exports.cpm = cpm;
	exports.createProject = createProject;
	exports.defaultMeta = defaultMeta;
	exports.deleteProject = deleteProject;
	exports.describeWrite = describeWrite;
	exports.duplicateProject = duplicateProject;
	exports.esc = esc;
	exports.exportActive = exportActive;
	exports.getModule = getModule;
	exports.hasUnsavedChanges = hasUnsavedChanges;
	exports.importProject = importProject;
	exports.ingestToolExport = ingestToolExport;
	exports.installStorageNotice = installStorageNotice;
	exports.kpi = kpi;
	exports.lastReconcile = lastReconcile;
	exports.listProjects = listProjects;
	exports.meta = meta;
	exports.obsLabel = obsLabel;
	exports.obsNodes = obsNodes;
	exports.onChange = onChange;
	exports.openSession = openSession;
	exports.parseISO = parseISO;
	exports.parsePredecessorCell = parsePredecessorCell;
	exports.patchMeta = patchMeta;
	exports.pertCriticalChain = pertCriticalChain;
	exports.pertProbability = pertProbability;
	exports.pertStats = pertStats;
	exports.projectCalendar = projectCalendar;
	exports.raciAudit = raciAudit;
	exports.raciCoverage = raciCoverage;
	exports.raciResponsibleIds = raciResponsibleIds;
	exports.raw = db;
	exports.rebaseSession = rebaseSession;
	exports.renameProject = renameProject;
	exports.reqByWbsLeaf = reqByWbsLeaf;
	exports.requirementsAudit = requirementsAudit;
	exports.riskPortfolio = riskPortfolio;
	exports.saveMeta = saveMeta;
	exports.saveModule = saveModule;
	exports.saveState = saveState;
	exports.scheduleNetwork = scheduleNetwork;
	exports.schedulePlanAudit = schedulePlanAudit;
	exports.scheduleStats = scheduleStats;
	exports.scheduleValidate = scheduleValidate;
	exports.schema = schema;
	exports.scopeAudit = scopeAudit;
	exports.scopeDeliverables = scopeDeliverables;
	exports.setActive = setActive;
	exports.setModule = setModule;
	exports.storageStatus = storageStatus;
	exports.traceMatrix = traceMatrix;
	exports.ui = ui;
	exports.util = util;
	exports.wbsCodes = wbsCodes;
	exports.wbsDelIds = wbsDelIds;
	exports.wbsLeaves = wbsLeaves;
	exports.wbsPhases = wbsPhases;
	exports.wbsResources = wbsResources;
	exports.wbsRollup = wbsRollup;
	exports.writeModule = writeModule;
	return exports;
})({});
