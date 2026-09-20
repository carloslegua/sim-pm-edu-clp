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
	var STATUS_LABEL = {
		identificado: "Identificado",
		analizado: "Analizado",
		con_respuesta: "Con respuesta",
		monitoreo: "En monitoreo",
		materializado: "Materializado",
		cerrado: "Cerrado"
	};
	var THREAT_STRATEGIES = [
		"escalar",
		"evitar",
		"transferir",
		"mitigar",
		"aceptar"
	];
	var OPPORTUNITY_STRATEGIES = [
		"escalar",
		"explotar",
		"compartir",
		"mejorar",
		"aceptar"
	];
	var STRATEGY_HINT = {
		escalar: "Fuera de la autoridad del proyecto: se lleva al nivel que corresponde (sponsor, programa, organización).",
		evitar: "Eliminar la amenaza o su causa (cambiar el plan, el alcance o la secuencia).",
		transferir: "Trasladar el impacto a un tercero (seguro, garantía, contrato a precio fijo); no elimina el riesgo.",
		mitigar: "Reducir la probabilidad o el impacto antes de que ocurra.",
		aceptar: "No se actúa de forma proactiva; la aceptación ACTIVA prevé contingencia y un plan si ocurre.",
		explotar: "Asegurar que la oportunidad ocurra (probabilidad 100 %).",
		compartir: "Asociarse con un tercero mejor situado para capturarla.",
		mejorar: "Aumentar la probabilidad o el impacto positivo."
	};
	var PROXIMITY = [
		"inmediata",
		"corta",
		"media",
		"larga"
	];
	var PROXIMITY_LABEL = {
		inmediata: "Inmediata (< 1 mes)",
		corta: "Corta (1–3 meses)",
		media: "Media (3–6 meses)",
		larga: "Larga (> 6 meses)"
	};
	var PROB_LABELS = [
		"Muy baja",
		"Baja",
		"Media",
		"Alta",
		"Muy alta"
	];
	var IMPACT_LABELS = [
		"Muy bajo",
		"Bajo",
		"Medio",
		"Alto",
		"Muy alto"
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
		roles: ""
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
			roles: str(o.roles)
		};
	}
	function validatePlan(p) {
		const out = [];
		const inc = (a, strict = true) => a.every((x, i) => i === 0 || (strict ? x > a[i - 1] : x >= a[i - 1]));
		if (!p.probPct.every((x) => x >= 0 && x <= 100) || !inc(p.probPct)) out.push("las probabilidades por nivel deben estar entre 0 y 100 y crecer de un nivel al siguiente");
		if (!p.costBandsPct.every((x) => x > 0) || !inc(p.costBandsPct)) out.push("las cotas de impacto en costo (% del costo base) deben ser positivas y crecientes");
		if (!p.timeBandsDays.every((x) => x > 0) || !inc(p.timeBandsDays)) out.push("las cotas de impacto en plazo (días) deben ser positivas y crecientes");
		if (!(p.thresholdMedium >= 1) || !(p.thresholdHigh <= 25) || !(p.thresholdMedium < p.thresholdHigh)) out.push("los umbrales de puntaje deben cumplir 1 ≤ medio < alto ≤ 25");
		if (!(p.reviewDays >= 1)) out.push("la frecuencia de revisión debe ser de al menos 1 día");
		if (new Set(p.categories.map((c) => c.toLowerCase())).size !== p.categories.length) out.push("las categorías de la RBS no pueden repetirse");
		return out;
	}
	function bandLevel(v, bands) {
		let l = 1;
		for (const b of bands) if (v > b) l++;
		else break;
		return l;
	}
	function costLevel(amount, costBase, p) {
		if (amount === null || !(costBase > 0)) return null;
		return bandLevel(Math.abs(amount) / costBase * 100, p.costBandsPct);
	}
	function timeLevel(days, p) {
		return days === null ? null : bandLevel(Math.abs(days), p.timeBandsDays);
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
	function blankRisk(id, code, type = "amenaza") {
		return normalizeRisk({
			id,
			code,
			type
		}, id);
	}
	var strategiesFor = (t) => t === "oportunidad" ? OPPORTUNITY_STRATEGIES : THREAT_STRATEGIES;
	var isOpen = (r) => r.status !== "materializado" && r.status !== "cerrado";
	function daysBetween(a, b) {
		const x = Date.parse(a + "T12:00:00Z"), y = Date.parse(b + "T12:00:00Z");
		return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : null;
	}
	function riskFindings(r, p, o) {
		const out = [], opts = o || {}, F = (code, severity, text) => out.push({
			code,
			severity,
			text
		});
		const sc = inherentScore(r), lv = levelOf(sc, p), open = isOpen(r);
		if (!r.title.trim()) F("R0", "aviso", "Falta un título corto que identifique el riesgo.");
		if (!r.cause.trim() || !r.event.trim() || !r.effect.trim()) F("R1", "aviso", "El enunciado está incompleto: un riesgo se describe como causa → evento → efecto (Debido a…, puede ocurrir…, lo que causaría…).");
		if (!r.owner.trim()) F("R2", lv === "alto" ? "riesgo" : "aviso", "No tiene propietario del riesgo asignado.");
		if (RISK_STATUSES.indexOf(r.status) < 0) return out;
		if (r.strategy && strategiesFor(r.type).indexOf(r.strategy) < 0) F("R6", "riesgo", "La estrategia «" + r.strategy + "» no corresponde a " + (r.type === "amenaza" ? "una amenaza" : "una oportunidad") + ".");
		if (sc === null) {
			if (open) F("R3", "info", "Sin analizar: falta la probabilidad o el impacto.");
		} else {
			if (open && (lv === "alto" || lv === "medio") && !r.strategy) F("R4", lv === "alto" ? "riesgo" : "aviso", "Riesgo " + lv + " sin estrategia de respuesta.");
			if (open && r.type === "amenaza" && lv === "alto" && r.strategy === "aceptar") F("R5", "aviso", "Aceptar una amenaza alta requiere aceptación ACTIVA: justificarla, prever contingencia y un plan si ocurre.");
			if (open && r.strategy && r.strategy !== "aceptar") {
				const res = residualOf(r, p);
				if (!res.assessed) F("R8", "info", "Hay una respuesta pero no se evaluó el riesgo residual (cuánto queda después de aplicarla).");
				else if (r.type === "amenaza" && res.score !== null && res.score > sc) F("R7", "aviso", "El riesgo residual (" + res.score + ") supera al inherente (" + sc + "): una respuesta no debería empeorarlo (¿riesgo secundario?).");
				if (!r.responseOwner.trim() && lv !== "bajo") F("R14", "aviso", "La respuesta no tiene un responsable de ejecutarla.");
			}
			if (open && r.impCost !== null && r.impCost >= 3 && impactMean(r.costImpact) === null) F("R10", "aviso", "Impacto en costo " + r.impCost + " sin cuantificar: sin un rango de costo no hay valor esperado ni base para la contingencia.");
			if (r.impCost !== null && opts.costBase && impactMean(r.costImpact) !== null) {
				const impl = costLevel(r.costImpact.likely, opts.costBase, p);
				if (impl !== null && Math.abs(impl - r.impCost) >= 2) F("R11", "aviso", "El nivel de impacto en costo (" + r.impCost + ") no concuerda con el valor cuantificado, que según las escalas del plan equivale al nivel " + impl + ".");
			}
			if (r.impTime !== null && impactMean(r.timeImpact) !== null) {
				const impl = timeLevel(r.timeImpact.likely, p);
				if (impl !== null && Math.abs(impl - r.impTime) >= 2) F("R11", "aviso", "El nivel de impacto en plazo (" + r.impTime + ") no concuerda con el valor cuantificado, que según las escalas del plan equivale al nivel " + impl + ".");
			}
			if (r.probPct !== null && r.prob !== null) {
				const rep = p.probPct[r.prob - 1], half = (p.probPct[Math.min(4, r.prob)] - p.probPct[Math.max(0, r.prob - 2)]) / 2 || 20;
				if (Math.abs(r.probPct - rep) > half + 1e-9) F("R16", "aviso", "La probabilidad cuantificada (" + r.probPct + " %) no corresponde al nivel " + r.prob + " del plan (≈ " + rep + " %).");
			}
		}
		rangeProblems(r.costImpact, "Impacto en costo").concat(rangeProblems(r.timeImpact, "Impacto en plazo")).concat(rangeProblems(r.resCostImpact, "Costo residual")).concat(rangeProblems(r.resTimeImpact, "Plazo residual")).forEach((t) => F("R15", "riesgo", t));
		if (open && !r.wbsIds.length) F("R9", "info", "No indica los paquetes de la EDT que afectaría.");
		if (opts.leafIds && r.wbsIds.some((id) => opts.leafIds.indexOf(id) < 0)) F("R9", "info", "Referencia paquetes que ya no existen en la EDT.");
		if (open && opts.today && r.reviewedOn) {
			const n = daysBetween(r.reviewedOn, opts.today);
			if (n !== null && n > p.reviewDays) F("R12", "info", "Sin revisar hace " + n + " días (el plan pide revisarlo cada " + p.reviewDays + ").");
		}
		const sf = opts.schedule, likelyDays = impactMean(r.timeImpact) !== null ? r.timeImpact.likely : null;
		if (open && sf && sf.network && likelyDays !== null && likelyDays > 0) {
			const d1 = (v) => v === null ? "—" : String(Math.round(v * 10) / 10);
			if (!sf.mapped) F("R19", "info", "Tiene impacto en plazo cuantificado pero no se puede ubicar en el cronograma (" + sf.reason + "): sin las actividades que afecta no se sabe cuánto retrasaría el fin del proyecto ni entra al análisis de plazo.");
			else if (r.type === "amenaza" && sf.delayLikely !== null) {
				const impl = timeLevel(sf.delayLikely, p);
				if (r.impTime !== null && impl !== null && Math.abs(impl - r.impTime) >= 2) F("R21", "aviso", "El nivel de impacto en plazo (" + r.impTime + ") no concuerda con el efecto real sobre el fin del proyecto: con el impacto más probable (" + d1(likelyDays) + " d) el fin se mueve " + d1(sf.delayLikely) + " d" + (sf.minFloat !== null && sf.minFloat > 0 ? " (la holgura de las actividades afectadas es " + d1(sf.minFloat) + " d)" : "") + ", que según las escalas del plan equivale al nivel " + impl + ".");
				else if (Math.abs(sf.delayLikely) < 1e-6) F("R20", "info", "La holgura de las actividades afectadas (" + d1(sf.minFloat) + " d) absorbe el impacto más probable (" + d1(likelyDays) + " d): no movería el fin del proyecto" + (sf.delayHigh !== null && sf.delayHigh > 0 ? ", pero con el máximo sí lo retrasaría " + d1(sf.delayHigh) + " d." : "."));
			}
		}
		if (r.status === "materializado" && r.actualCost === null && r.actualDelay === null) F("R13", "aviso", "Materializado sin registrar su impacto real (costo o plazo): es lo que alimenta el consumo de contingencia y las lecciones aprendidas.");
		if (r.status === "materializado" && opts.linked) {
			if (opts.linked.count > 0 && opts.linked.approved > 0 && r.actualCost !== null && Math.abs(r.actualCost - opts.linked.approved) > .5) F("R17", "aviso", "El costo real registrado (" + Math.round(r.actualCost) + ") no coincide con lo aprobado en las órdenes de cambio vinculadas en Costos (" + Math.round(opts.linked.approved) + ").");
			if (opts.linked.count === 0 && r.actualCost !== null && r.actualCost > 0) F("R18", "info", "No hay una orden de cambio vinculada en Costos: si este impacto consumió contingencia o reserva, regístralo allí y vincúlalo a este riesgo.");
		}
		return out;
	}
	function riskEventsOf(risks, p, opts) {
		const events = [], excluded = [], unmapped = [];
		const NONE = {
			low: null,
			likely: null,
			high: null
		};
		risks.filter(isOpen).forEach((r) => {
			const why = (reason) => excluded.push({
				code: r.code,
				title: r.title,
				reason
			});
			const resProb = probEffective(r.resProbPct, r.resProb, p), res = residualOf(r, p);
			const resHasCost = impactMean(r.resCostImpact) !== null, resHasTime = impactMean(r.resTimeImpact) !== null;
			const useRes = !!r.strategy && r.strategy !== "aceptar" && res.assessed && resProb !== null && (resHasCost || r.costImpact.likely === null && resHasTime);
			let pr, cost, time, basis;
			if (useRes) {
				pr = resProb;
				cost = resHasCost ? r.resCostImpact : NONE;
				time = resHasTime ? r.resTimeImpact : r.timeImpact;
				basis = "residual";
			} else {
				pr = probEffective(r.probPct, r.prob, p);
				cost = r.costImpact;
				time = r.timeImpact;
				basis = r.strategy && r.strategy !== "aceptar" ? "inherente (residual sin cuantificar)" : "inherente";
			}
			if (pr === null || pr <= 0) return why("sin probabilidad");
			const costBad = rangeProblems(cost, "").length > 0, timeBad = rangeProblems(time, "").length > 0;
			if (costBad) return why("rango de costo incoherente");
			const hasCost = cost.likely !== null, hasTime = time.likely !== null && !timeBad;
			if (!hasCost && !hasTime) return why(timeBad ? "rango de plazo incoherente" : "sin impacto en costo ni en plazo cuantificado");
			const c = hasCost ? cost : {
				low: 0,
				likely: 0,
				high: 0
			};
			const low = c.low === null ? c.likely : c.low, high = c.high === null ? c.likely : c.high, likely = c.likely;
			const ev = {
				id: r.id,
				name: r.code + " " + r.title,
				code: r.code,
				title: r.title,
				type: r.type,
				prob: Math.min(1, pr),
				low,
				likely,
				high,
				sign: r.type === "amenaza" ? 1 : -1,
				basis
			};
			if (hasTime && time.likely > 0) {
				const tl = time.likely;
				const ids = opts && opts.targets ? opts.targets(r) : [];
				if (ids.length) {
					ev.days = {
						low: time.low === null ? tl : time.low,
						likely: tl,
						high: time.high === null ? tl : time.high
					};
					ev.targets = ids;
				} else unmapped.push(r.code);
			}
			events.push(ev);
		});
		return {
			events,
			excluded,
			unmapped,
			ev: events.reduce((s, e) => s + e.sign * e.prob * (e.low + e.likely + e.high) / 3, 0)
		};
	}
	function buildMatrix(risks, type, which, p) {
		const grid = [];
		for (let pr = 5; pr >= 1; pr--) {
			const row = [];
			for (let im = 1; im <= 5; im++) {
				const s = pr * im;
				row.push({
					prob: pr,
					imp: im,
					score: s,
					level: levelOf(s, p),
					ids: []
				});
			}
			grid.push(row);
		}
		risks.filter((r) => r.type === type && isOpen(r)).forEach((r) => {
			let prob, imp;
			if (which === "inherent") {
				prob = r.prob;
				imp = maxImpact(r.impCost, r.impTime, r.impScope);
			} else {
				const s = residualOf(r, p);
				if (!s.assessed) return;
				prob = s.prob;
				imp = maxImpact(s.impCost, s.impTime, s.impScope);
			}
			if (prob === null || imp === null) return;
			grid[5 - prob][imp - 1].ids.push(r.id);
		});
		return grid;
	}
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
	function rankRisks(risks, _plan) {
		const prox = (r) => {
			const i = PROXIMITY.indexOf(r.proximity);
			return i < 0 ? 9 : i;
		};
		return risks.filter(isOpen).filter((r) => inherentScore(r) !== null).sort((a, b) => inherentScore(b) - inherentScore(a) || prox(a) - prox(b) || a.code.localeCompare(b.code));
	}
	function nextCode(risks) {
		let max = 0;
		risks.forEach((r) => {
			const m = /(\d+)\s*$/.exec(r.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "R-" + String(max + 1).padStart(2, "0");
	}
	//#endregion
	//#region src/shared/risk-sample.ts
	var SAMPLE_PLAN = normalizePlan({
		methodology: "Identificación por talleres de expertos y revisión de lecciones aprendidas; análisis cualitativo con la matriz probabilidad × impacto del plan; cuantificación del valor esperado con rangos de tres puntos para los riesgos de costo ≥ 3; respuesta por estrategia; revisión mensual en la reunión de control.",
		reservePolicy: "La contingencia cubre la incertidumbre del estimado (análisis de rangos de Costos) y la exposición residual de los riesgos abiertos. La reserva de gestión (fuera de la línea base) solo se usa con autorización del sponsor.",
		roles: "Director de Proyecto: dueño del proceso y del registro. Propietario del riesgo: vigila el disparador y ejecuta la respuesta. Sponsor: autoriza el uso de la reserva de gestión. CCB: aprueba los cambios a la línea base."
	});
	var SAMPLE_RISKS = [
		{
			code: "R-01",
			title: "Retraso en la licencia municipal",
			type: "amenaza",
			category: "Externo",
			owner: "Asesoría Legal",
			proximity: "corta",
			status: "con_respuesta",
			wbs: ["2.4"],
			cause: "la Municipalidad de Lurín observa el expediente de licencia de edificación",
			event: "se retrasa la emisión de la licencia",
			effect: "se posterga el inicio de obra y se extiende el cronograma",
			prob: 4,
			impCost: 2,
			impTime: 4,
			impScope: 1,
			costImpact: {
				low: 2e4,
				likely: 45e3,
				high: 8e4
			},
			timeImpact: {
				low: 10,
				likely: 20,
				high: 35
			},
			strategy: "mitigar",
			response: "Reuniones técnicas previas al ingreso del expediente y seguimiento semanal del trámite (ver compromiso de la Municipalidad en Stakeholder Studio).",
			trigger: "Observaciones al expediente en la primera revisión",
			responseOwner: "Asesoría Legal",
			responseCost: 6e3,
			resProb: 2,
			resImpCost: 2,
			resImpTime: 3,
			resImpScope: 1,
			resCostImpact: {
				low: 2e4,
				likely: 45e3,
				high: 8e4
			},
			resTimeImpact: {
				low: 10,
				likely: 20,
				high: 35
			}
		},
		{
			code: "R-02",
			title: "Alza del precio del acero estructural",
			type: "amenaza",
			category: "Externo",
			owner: "Jefe de Logística",
			proximity: "media",
			status: "con_respuesta",
			wbs: ["3.1"],
			cause: "la volatilidad del precio internacional del acero",
			event: "el Proveedor A revisa al alza el precio antes de cerrar el contrato",
			effect: "aumenta el costo de procura de las estructuras metálicas",
			prob: 3,
			impCost: 4,
			impTime: 1,
			impScope: 1,
			costImpact: {
				low: 1e5,
				likely: 25e4,
				high: 5e5
			},
			strategy: "transferir",
			response: "Contrato a precio fijo con vigencia de la oferta de 60 días.",
			trigger: "Oferta del Proveedor A próxima a vencer sin contrato firmado",
			responseOwner: "Jefe de Logística",
			resProb: 1,
			resImpCost: 4,
			resImpTime: 1,
			resImpScope: 1,
			resCostImpact: {
				low: 1e5,
				likely: 25e4,
				high: 5e5
			}
		},
		{
			code: "R-03",
			title: "Suelo con menor capacidad portante que la esperada",
			type: "amenaza",
			category: "Técnico",
			owner: "Jefe de Ingeniería",
			proximity: "inmediata",
			status: "materializado",
			wbs: ["2.1", "4.2"],
			cause: "el estudio de suelos detecta estratos de baja capacidad portante",
			event: "se debe reforzar la cimentación",
			effect: "aumenta el costo y se extiende la ejecución de cimentaciones",
			prob: 3,
			impCost: 3,
			impTime: 3,
			impScope: 1,
			costImpact: {
				low: 9e4,
				likely: 18e4,
				high: 35e4
			},
			timeImpact: {
				low: 5,
				likely: 10,
				high: 20
			},
			strategy: "mitigar",
			response: "Estudio de suelos ampliado y refuerzo de cimentación (orden de cambio OC-001, financiada con contingencia).",
			trigger: "Resultados del estudio de suelos (2.1)",
			responseOwner: "Jefe de Ingeniería",
			materializedOn: "2026-08-03",
			actualCost: 18e4,
			actualDelay: 8
		},
		{
			code: "R-04",
			title: "Fluctuación del tipo de cambio",
			type: "amenaza",
			category: "Externo",
			owner: "Director de Proyecto",
			proximity: "media",
			status: "monitoreo",
			wbs: ["3.1", "3.3"],
			cause: "el 30 % del costo está denominado en moneda extranjera (estructuras y equipos importados)",
			event: "el tipo de cambio sube por encima de la banda prevista",
			effect: "aumenta el costo en moneda local de la procura",
			prob: 3,
			impCost: 3,
			impTime: 1,
			impScope: 1,
			costImpact: {
				low: 15e4,
				likely: 3e5,
				high: 6e5
			},
			strategy: "mitigar",
			response: "Cobertura cambiaria (forward) para el 30 % en moneda extranjera al cerrar los contratos de procura.",
			trigger: "Variación del tipo de cambio mayor al 3 % respecto de la fecha base",
			responseOwner: "Director de Proyecto",
			responseCost: 12e3,
			resProb: 2,
			resImpCost: 2,
			resImpTime: 1,
			resImpScope: 1,
			resCostImpact: {
				low: 6e4,
				likely: 12e4,
				high: 24e4
			}
		},
		{
			code: "R-05",
			title: "Paro del sindicato de construcción civil",
			type: "amenaza",
			category: "Externo",
			owner: "Asesoría Legal",
			proximity: "media",
			status: "con_respuesta",
			wbs: [
				"4.1",
				"4.2",
				"4.3"
			],
			cause: "no se acuerdan las condiciones laborales con el sindicato",
			event: "el sindicato paraliza la obra",
			effect: "se detiene la ejecución y hay costos de desmovilización y removilización de cuadrillas",
			prob: 2,
			impCost: 3,
			impTime: 4,
			impScope: 1,
			costImpact: {
				low: 1e5,
				likely: 2e5,
				high: 4e5
			},
			timeImpact: {
				low: 15,
				likely: 30,
				high: 60
			},
			strategy: "evitar",
			response: "Acuerdo laboral previo al inicio de obra: jornadas, seguridad y contratación local.",
			trigger: "Rechazo del sindicato a la propuesta de acuerdo",
			responseOwner: "Asesoría Legal",
			resProb: 1,
			resImpCost: 3,
			resImpTime: 4,
			resImpScope: 1,
			resCostImpact: {
				low: 1e5,
				likely: 2e5,
				high: 4e5
			},
			resTimeImpact: {
				low: 15,
				likely: 30,
				high: 60
			}
		},
		{
			code: "R-06",
			title: "Accidente grave en obra",
			type: "amenaza",
			category: "Técnico",
			owner: "Residente de Obra",
			proximity: "larga",
			status: "con_respuesta",
			wbs: ["4.1", "4.3"],
			cause: "trabajos en altura y con maquinaria pesada en simultáneo",
			event: "ocurre un accidente grave",
			effect: "se paraliza el frente de trabajo y hay sanciones de SUNAFIL",
			prob: 2,
			impCost: 3,
			impTime: 4,
			impScope: 3,
			costImpact: {
				low: 8e4,
				likely: 15e4,
				high: 4e5
			},
			timeImpact: {
				low: 10,
				likely: 25,
				high: 60
			},
			strategy: "mitigar",
			response: "Plan de SST, inducción obligatoria y supervisión diaria; auditoría previa de cumplimiento.",
			trigger: "Incidente sin lesión (casi accidente) reportado",
			responseOwner: "Residente de Obra",
			resProb: 1,
			resImpCost: 3,
			resImpTime: 4,
			resImpScope: 3,
			resCostImpact: {
				low: 8e4,
				likely: 15e4,
				high: 4e5
			},
			resTimeImpact: {
				low: 10,
				likely: 25,
				high: 60
			}
		},
		{
			code: "R-07",
			title: "Oposición vecinal y restricciones de tráfico",
			type: "amenaza",
			category: "Externo",
			owner: "Residente de Obra",
			proximity: "corta",
			status: "con_respuesta",
			wbs: ["4.1"],
			cause: "la Junta de vecinos de Lurín percibe impactos de ruido y tránsito de camiones",
			event: "los vecinos reclaman y las autoridades restringen los horarios de trabajo",
			effect: "se reducen las horas productivas del movimiento de tierras",
			prob: 3,
			impCost: 2,
			impTime: 3,
			impScope: 1,
			costImpact: {
				low: 2e4,
				likely: 5e4,
				high: 12e4
			},
			timeImpact: {
				low: 5,
				likely: 10,
				high: 25
			},
			strategy: "mitigar",
			response: "Mesas de diálogo mensuales, canal de reclamos y plan de manejo de tráfico comunicado antes del inicio.",
			trigger: "Primer reclamo formal de los vecinos",
			responseOwner: "Residente de Obra",
			resProb: 2,
			resImpCost: 2,
			resImpTime: 2,
			resImpScope: 1,
			resCostImpact: {
				low: 1e4,
				likely: 25e3,
				high: 6e4
			},
			resTimeImpact: {
				low: 2,
				likely: 5,
				high: 12
			}
		},
		{
			code: "R-08",
			title: "Retraso en la fabricación de estructuras metálicas",
			type: "amenaza",
			category: "Externo",
			owner: "Jefe de Logística",
			proximity: "media",
			status: "con_respuesta",
			wbs: ["3.1", "4.3"],
			cause: "la fábrica del Proveedor A acumula pedidos",
			event: "las estructuras se entregan tarde",
			effect: "se retrasa el montaje de la estructura y cobertura",
			prob: 3,
			impCost: 2,
			impTime: 4,
			impScope: 1,
			costImpact: {
				low: 3e4,
				likely: 6e4,
				high: 15e4
			},
			timeImpact: {
				low: 15,
				likely: 25,
				high: 45
			},
			strategy: "mitigar",
			response: "Inspección en fábrica cada dos semanas e hitos de fabricación pagados contra avance.",
			trigger: "Avance de fabricación menor al 90 % del programado",
			responseOwner: "Jefe de Logística",
			resProb: 2,
			resImpCost: 2,
			resImpTime: 3,
			resImpScope: 1,
			resCostImpact: {
				low: 3e4,
				likely: 6e4,
				high: 15e4
			},
			resTimeImpact: {
				low: 10,
				likely: 15,
				high: 30
			}
		},
		{
			code: "R-09",
			title: "Rendimientos de cuadrilla menores a los estimados",
			type: "amenaza",
			category: "Gestión del proyecto",
			owner: "Residente de Obra",
			proximity: "media",
			status: "monitoreo",
			wbs: ["4.3", "4.4"],
			cause: "las duraciones se estimaron con rendimientos teóricos de cuadrilla",
			event: "el rendimiento real resulta menor",
			effect: "aumentan la duración y el costo de mano de obra",
			prob: 4,
			impCost: 3,
			impTime: 3,
			impScope: 1,
			costImpact: {
				low: 1e5,
				likely: 22e4,
				high: 45e4
			},
			timeImpact: {
				low: 10,
				likely: 20,
				high: 30
			},
			strategy: "aceptar",
			response: "Aceptación activa: se cubre con la contingencia del estimado y se mide el rendimiento real cada semana.",
			trigger: "Rendimiento real menor al 85 % del estimado durante dos semanas seguidas",
			responseOwner: "Residente de Obra"
		},
		{
			code: "R-10",
			title: "Descuento por volumen al consolidar compras",
			type: "oportunidad",
			category: "Gestión del proyecto",
			owner: "Jefe de Logística",
			proximity: "corta",
			status: "con_respuesta",
			wbs: ["3.2", "3.3"],
			cause: "las compras de materiales y de equipos eléctricos se concentran en el mismo periodo",
			event: "se consolida el pedido con un mismo proveedor",
			effect: "se obtiene un descuento por volumen",
			prob: 3,
			impCost: 3,
			impTime: 1,
			impScope: 1,
			costImpact: {
				low: 4e4,
				likely: 9e4,
				high: 15e4
			},
			strategy: "mejorar",
			response: "Solicitar cotización consolidada a los Proveedores B y C.",
			trigger: "Cotizaciones recibidas para 3.2 y 3.3",
			responseOwner: "Jefe de Logística",
			resProb: 4,
			resImpCost: 3,
			resImpTime: 1,
			resImpScope: 1,
			resCostImpact: {
				low: 4e4,
				likely: 9e4,
				high: 15e4
			}
		}
	];
	function buildSampleRisks(resolveWbs) {
		return SAMPLE_RISKS.map((s, i) => normalizeRisk({
			...s,
			id: "rk" + (i + 1),
			identifiedOn: "2026-07-06",
			wbsIds: s.wbs.map(resolveWbs).filter(Boolean)
		}, "rk" + (i + 1)));
	}
	var SAMPLE_LINKED_ORDERS = [{
		id: "OC-001",
		riskId: "rk3",
		riskCode: "R-03",
		cost: 18e4,
		status: "Aprobada",
		fund: "Contingencia"
	}];
	//#endregion
	//#region src/shared/schedule-sample.ts
	var SAMPLE_START_DATE = "2026-07-06";
	var PHASES = [
		{
			name: "Dirección de Proyecto",
			packages: [
				{
					name: "Acta de constitución",
					acts: [[
						"Elaboración y aprobación del acta de constitución",
						"doc",
						1,
						.25
					]]
				},
				{
					name: "Plan de gestión del proyecto",
					acts: [[
						"Plan para la dirección del proyecto (líneas base)",
						"doc",
						1,
						.2
					], [
						"Planes subsidiarios de gestión",
						"doc",
						6,
						.5
					]]
				},
				{
					name: "Informes de seguimiento y control",
					acts: [[
						"Elaboración de informes mensuales de avance",
						"doc",
						4,
						.5
					], [
						"Reuniones de control y seguimiento del proyecto",
						"reunión",
						16,
						2
					]]
				}
			]
		},
		{
			name: "Ingeniería y Diseño",
			packages: [
				{
					name: "Estudio de suelos",
					acts: [
						[
							"Calicatas exploratorias",
							"und",
							8,
							2
						],
						[
							"Ensayos de laboratorio de suelos",
							"glb",
							1,
							.1
						],
						[
							"Informe geotécnico",
							"doc",
							1,
							.25
						]
					]
				},
				{
					name: "Diseño estructural",
					acts: [[
						"Memoria de cálculo estructural",
						"doc",
						1,
						.1
					], [
						"Planos estructurales",
						"lám",
						24,
						2
					]]
				},
				{
					name: "Diseño eléctrico y sanitario",
					acts: [[
						"Memoria de cálculo eléctrico y sanitario",
						"doc",
						1,
						.15
					], [
						"Planos eléctricos y sanitarios",
						"lám",
						18,
						2
					]]
				},
				{
					name: "Permisos y licencias municipales",
					acts: [[
						"Trámite de licencia de edificación municipal",
						"trámite",
						1,
						.05
					], [
						"Trámite de certificado ITSE",
						"trámite",
						1,
						.1
					]]
				}
			]
		},
		{
			name: "Procura",
			packages: [
				{
					name: "Estructuras metálicas prefabricadas",
					acts: [[
						"Fabricación de estructuras metálicas",
						"ton",
						260,
						15,
						2
					], [
						"Transporte y entrega de estructuras a obra",
						"viaje",
						12,
						3
					]]
				},
				{
					name: "Materiales de construcción",
					acts: [[
						"Adquisición y suministro de cemento y agregados",
						"ton",
						800,
						100
					], [
						"Adquisición y suministro de materiales varios de construcción",
						"glb",
						1,
						.15
					]]
				},
				{
					name: "Equipos eléctricos e instalaciones",
					acts: [[
						"Adquisición de tableros y equipos eléctricos",
						"und",
						15,
						3
					], [
						"Adquisición de equipos de instalaciones sanitarias",
						"und",
						10,
						2
					]]
				}
			]
		},
		{
			name: "Construcción",
			packages: [
				{
					name: "Movimiento de tierras",
					acts: [
						[
							"Corte y excavación masiva",
							"m³",
							4800,
							320,
							2
						],
						[
							"Relleno y compactación con material propio",
							"m³",
							2100,
							250
						],
						[
							"Eliminación de material excedente",
							"m³",
							2700,
							300
						],
						[
							"Nivelación y perfilado de plataforma",
							"m²",
							6500,
							1200
						]
					]
				},
				{
					name: "Cimentaciones",
					acts: [
						[
							"Excavación de zanjas para zapatas",
							"m³",
							620,
							60,
							2
						],
						[
							"Solado de concreto e=10 cm",
							"m²",
							480,
							120
						],
						[
							"Acero de refuerzo fy=4200 kg/cm²",
							"kg",
							38500,
							2500,
							2
						],
						[
							"Concreto f'c=280 kg/cm² en zapatas",
							"m³",
							410,
							45,
							2
						],
						[
							"Encofrado y desencofrado de cimentaciones",
							"m²",
							950,
							90,
							2
						]
					]
				},
				{
					name: "Estructura y cobertura",
					acts: [
						[
							"Montaje de columnas metálicas",
							"und",
							48,
							6
						],
						[
							"Montaje de vigas y tijerales",
							"ton",
							96,
							8
						],
						[
							"Instalación de cobertura TR-4",
							"m²",
							5200,
							350,
							2
						]
					]
				},
				{
					name: "Acabados y cerramientos",
					acts: [
						[
							"Tarrajeo de muros y cielorrasos",
							"m²",
							3200,
							40,
							2
						],
						[
							"Pintura general de interiores y exteriores",
							"m²",
							3200,
							80,
							2
						],
						[
							"Cerramiento perimétrico",
							"m",
							320,
							20
						]
					]
				},
				{
					name: "Instalaciones MEP",
					acts: [[
						"Instalación de tableros y circuitos eléctricos",
						"pto",
						980,
						25,
						2
					], [
						"Instalación de redes sanitarias",
						"m",
						450,
						30
					]]
				}
			]
		},
		{
			name: "Pruebas y Puesta en Marcha",
			packages: [
				{
					name: "Pruebas de instalaciones",
					acts: [[
						"Pruebas de tableros y circuitos eléctricos",
						"pto",
						120,
						30
					], [
						"Pruebas hidráulicas de redes sanitarias",
						"glb",
						1,
						.5
					]]
				},
				{
					name: "Capacitación al cliente",
					acts: [[
						"Capacitación operativa al personal del cliente",
						"hora",
						40,
						5
					], [
						"Elaboración de manuales de operación y mantenimiento",
						"doc",
						2,
						.5
					]]
				},
				{
					name: "Acta de entrega y cierre",
					acts: [[
						"Elaboración de dossier de calidad y planos as-built",
						"doc",
						1,
						.1
					], [
						"Acta de entrega y cierre del proyecto",
						"doc",
						1,
						.5
					]]
				}
			]
		}
	];
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
	function sampleScheduleModules() {
		const nodes = {};
		const rootId = "w-0";
		nodes[rootId] = {
			id: rootId,
			name: "Proyecto DISTRIB+ S.A. — Almacén Lurín",
			children: []
		};
		const byLeaf = {}, idByCode = {};
		let n = 0;
		PHASES.forEach((ph, i) => {
			const pid = "w-" + (i + 1);
			nodes[pid] = {
				id: pid,
				name: ph.name,
				children: []
			};
			nodes[rootId].children.push(pid);
			ph.packages.forEach((pk, j) => {
				const code = i + 1 + "." + (j + 1), lid = "w-" + code;
				nodes[lid] = {
					id: lid,
					name: pk.name,
					children: []
				};
				nodes[pid].children.push(lid);
				idByCode[code] = {};
				byLeaf[lid] = pk.acts.map(([name, unit, qty, perf, teams]) => {
					const id = "a" + ++n;
					idByCode[code][name] = id;
					return {
						id,
						name,
						unit,
						qty,
						perf,
						teams: teams == null ? 1 : teams
					};
				});
			});
		});
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
				leafId: "w-4.2"
			},
			{
				id: "m3",
				code: "H3",
				name: "Cierre del Proyecto",
				leafId: null,
				afterLeafId: "w-5.3"
			}
		];
		milestones.forEach((m) => {
			idByCode[m.code] = { [m.name]: m.id };
		});
		const links = [];
		SAMPLE_LINK_PLAN.forEach((e, k) => {
			const from = (idByCode[e.fc] || {})[e.fn], to = (idByCode[e.tc] || {})[e.tn];
			if (from && to) links.push({
				id: "L" + (k + 1),
				from,
				to,
				type: e.type,
				lag: e.lag || 0,
				lagUnit: e.lagUnit || "d",
				source: "import"
			});
		});
		return {
			wbs: {
				rootId,
				idCounter: 100,
				nodes
			},
			activities: {
				byLeaf,
				idCounter: n + 1,
				milestones
			},
			schedule: { links }
		};
	}
	//#endregion
	//#region src/shared/range-estimating.ts
	var PERCENTILES = [
		5,
		10,
		20,
		30,
		40,
		50,
		60,
		70,
		80,
		90,
		95
	];
	var DEFAULT_SEED = 20260713;
	var DEFAULT_CORRELATION = .3;
	var num = (v) => Number(v);
	var finite = (v) => typeof v === "number" ? isFinite(v) : typeof v === "string" && v.trim() !== "" && isFinite(Number(v));
	function mulberry32(seed) {
		let a = seed >>> 0;
		return () => {
			a = a + 1831565813 >>> 0;
			let t = a;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}
	function normCdf(x) {
		const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + .3275911 * z);
		return .5 * (1 + s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z)));
	}
	function triInv(u, a, m, b) {
		if (b <= a) return m;
		return u < (m - a) / (b - a) ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
	}
	function lineProblems(l) {
		const p = [];
		if (!finite(l.ml) || num(l.ml) <= 0) p.push("el costo más probable debe ser mayor que cero");
		if (!finite(l.lowPct) || num(l.lowPct) > 0 || num(l.lowPct) < -100) p.push("el mínimo debe estar entre −100 % y 0 % del más probable");
		if (!finite(l.highPct) || num(l.highPct) < 0) p.push("el máximo debe ser 0 % o más sobre el más probable");
		return p;
	}
	function quantile(sorted, p) {
		const pos = (sorted.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
		return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
	}
	var daysOk = (d) => !!d && isFinite(d.low) && isFinite(d.likely) && isFinite(d.high) && d.low >= 0 && d.low <= d.likely && d.likely <= d.high;
	function validEvents(events) {
		return (events || []).filter((e) => e && isFinite(e.prob) && e.prob > 0 && e.prob <= 1 && isFinite(e.low) && isFinite(e.likely) && isFinite(e.high) && e.low >= 0 && e.low <= e.likely && e.likely <= e.high && (e.sign === 1 || e.sign === -1));
	}
	var normIterations = (v) => Math.max(1e3, Math.min(2e5, Math.floor(Number(v) || 1e4)));
	var normSeed = (v) => typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_SEED;
	function simulateEvents(events, schedule, iterations, seed) {
		const evs = validEvents(events), N = normIterations(iterations), S = normSeed(seed);
		const sim = schedule && isFinite(schedule.base) ? schedule : null;
		const direct = new Float64Array(N), ext = sim ? new Float64Array(N) : null, randE = mulberry32((S ^ 1540483477) >>> 0);
		for (let i = 0; i < N; i++) {
			let t = 0, delta = null;
			for (let j = 0; j < evs.length; j++) {
				const e = evs[j], occurs = randE() < e.prob, u = randE(), uT = randE();
				if (!occurs) continue;
				t += e.sign * triInv(u, e.low, e.likely, e.high);
				if (sim && daysOk(e.days) && e.targets && e.targets.length) {
					const d = e.sign * triInv(uT, e.days.low, e.days.likely, e.days.high);
					delta = delta || {};
					for (const id of e.targets) delta[id] = (delta[id] || 0) + d;
				}
			}
			direct[i] = t;
			if (sim && ext) {
				let dur = sim.base;
				if (delta) {
					const r = sim.duration(delta);
					if (r !== null) dur = r;
				}
				ext[i] = dur - sim.base;
			}
		}
		return {
			iterations: N,
			seed: S,
			n: evs.length,
			direct,
			ext,
			base: sim ? sim.base : 0,
			delayers: sim ? evs.filter((e) => daysOk(e.days) && e.targets && e.targets.length).length : 0
		};
	}
	function simulateRange(lines, opts) {
		const o = opts || {};
		const iterations = normIterations(o.iterations), seed = normSeed(o.seed);
		const rho = Math.max(0, Math.min(1, o.correlation === void 0 || !isFinite(o.correlation) ? DEFAULT_CORRELATION : o.correlation));
		const valid = (lines || []).filter((l) => l && lineProblems(l).length === 0);
		const evs = validEvents(o.events);
		if (!valid.length && !evs.length) return null;
		const sim = o.schedule && isFinite(o.schedule.base) ? o.schedule : null;
		const costPerDay = sim ? Math.max(0, Number(sim.costPerDay) || 0) : 0;
		const oc = o.outcomes, reuse = !!oc && oc.iterations === iterations && oc.seed === seed && oc.n === evs.length && (!sim || !!oc.ext);
		const eo = evs.length ? reuse ? oc : simulateEvents(evs, sim, iterations, seed) : null;
		const dir = eo ? eo.direct : null, ext = sim && eo ? eo.ext : null;
		const a = valid.map((l) => num(l.ml) * (1 + num(l.lowPct) / 100));
		const m = valid.map((l) => num(l.ml));
		const b = valid.map((l) => num(l.ml) * (1 + num(l.highPct) / 100));
		const ml = m.reduce((s, x) => s + x, 0);
		const rand = mulberry32(seed);
		let spare = null;
		const normal = () => {
			if (spare !== null) {
				const s = spare;
				spare = null;
				return s;
			}
			let u = 0;
			while (u === 0) u = rand();
			const v = rand(), r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
			spare = r * Math.sin(th);
			return r * Math.cos(th);
		};
		const sr = Math.sqrt(rho), se = Math.sqrt(1 - rho);
		const totals = new Float64Array(iterations), durs = sim ? new Float64Array(iterations) : null;
		let sum = 0, sumSq = 0, sumDur = 0, nDelayed = 0, timeCostSum = 0;
		for (let i = 0; i < iterations; i++) {
			const zc = normal();
			let t = 0;
			for (let j = 0; j < valid.length; j++) {
				if (b[j] <= a[j]) {
					t += m[j];
					continue;
				}
				t += triInv(normCdf(sr * zc + se * normal()), a[j], m[j], b[j]);
			}
			if (dir) t += dir[i];
			if (sim && durs) {
				const x = ext ? ext[i] : 0, dur = sim.base + x;
				durs[i] = dur;
				sumDur += dur;
				if (x > 1e-9) nDelayed++;
				const cost = x * costPerDay;
				t += cost;
				timeCostSum += cost;
			}
			totals[i] = t;
			sum += t;
			sumSq += t * t;
		}
		const mean = sum / iterations, sd = Math.sqrt(Math.max(0, sumSq / iterations - mean * mean));
		const sorted = Float64Array.from(totals).sort();
		const p = {};
		PERCENTILES.forEach((q) => {
			p[q] = quantile(sorted, q);
		});
		const curve = [];
		for (let q = 1; q <= 99; q++) curve.push(quantile(sorted, q));
		const eventsEV = evs.reduce((s, e) => s + e.sign * e.prob * (e.low + e.likely + e.high) / 3, 0);
		let schedule = null;
		if (sim && durs) {
			const sd2 = Float64Array.from(durs).sort(), pd = {};
			PERCENTILES.forEach((q) => {
				pd[q] = quantile(sd2, q);
			});
			schedule = {
				base: sim.base,
				costPerDay,
				p: pd,
				mean: sumDur / iterations,
				probDelay: nDelayed / iterations,
				timeCostMean: timeCostSum / iterations,
				events: eo ? eo.delayers : 0
			};
		}
		return {
			n: valid.length,
			excluded: (lines || []).length - valid.length,
			events: evs.length,
			eventsEV,
			iterations,
			seed,
			correlation: rho,
			ml,
			mean,
			sd,
			min: sorted[0],
			max: sorted[iterations - 1],
			p,
			curve,
			schedule
		};
	}
	//#endregion
	//#region src/shared/schedule-risk.ts
	function makeEngine(net, cpm) {
		if (!net || !net.nodes.some((n) => !n.isMilestone)) return null;
		const nodes = net.nodes.map((n) => ({
			id: n.id,
			dur: n.dur
		})), idx = {};
		net.nodes.forEach((n, i) => {
			idx[n.id] = i;
		});
		const run = () => cpm(nodes, net.links, net.calendar, {});
		const r0 = run();
		if (!r0.ok) return null;
		const byId = {};
		net.nodes.forEach((n) => {
			byId[n.id] = n;
		});
		const cache = /* @__PURE__ */ new Map();
		return {
			net,
			base: r0.projectDuration,
			rows: r0.rows,
			byId,
			duration(delta) {
				const ids = Object.keys(delta).filter((id) => idx[id] !== void 0 && delta[id] !== 0);
				if (!ids.length) return r0.projectDuration;
				const key = ids.sort().map((id) => id + ":" + Math.round(delta[id] * 1e3)).join("|");
				if (cache.has(key)) return cache.get(key);
				ids.forEach((id) => {
					nodes[idx[id]].dur = Math.max(0, net.nodes[idx[id]].dur + delta[id]);
				});
				const r = run();
				ids.forEach((id) => {
					nodes[idx[id]].dur = net.nodes[idx[id]].dur;
				});
				const out = r.ok ? r.projectDuration : null;
				if (cache.size < 5e3) cache.set(key, out);
				return out;
			}
		};
	}
	var TF_EPS = 1e-6;
	function resolveTargets(r, eng) {
		const mk = (n) => {
			const row = eng.rows[n.id];
			return {
				id: n.id,
				code: n.code,
				name: n.name,
				tf: row ? row.tf : 0,
				critical: !!row && row.tf <= TF_EPS
			};
		};
		const acts = eng.net.nodes.filter((n) => !n.isMilestone);
		if (r.actIds.length) {
			const chosen = acts.filter((n) => r.actIds.indexOf(n.id) >= 0), have = new Set(chosen.map((n) => n.id));
			const missing = r.actIds.filter((id) => !have.has(id));
			if (chosen.length) return {
				mode: "actividades",
				targets: chosen.map(mk),
				missing,
				reason: ""
			};
			return {
				...fromPackages(r, acts, eng, mk),
				missing
			};
		}
		return fromPackages(r, acts, eng, mk);
	}
	function fromPackages(r, acts, eng, mk) {
		if (!r.wbsIds.length) return {
			mode: "ninguno",
			targets: [],
			missing: [],
			reason: "no indica paquetes de la EDT ni actividades"
		};
		const cand = acts.filter((n) => n.leafId !== null && r.wbsIds.indexOf(n.leafId) >= 0);
		if (!cand.length) return {
			mode: "ninguno",
			targets: [],
			missing: [],
			reason: "sus paquetes de la EDT no tienen actividades en el cronograma"
		};
		let best = cand[0];
		cand.forEach((n) => {
			if ((eng.rows[n.id] ? eng.rows[n.id].tf : 0) < (eng.rows[best.id] ? eng.rows[best.id].tf : 0) - TF_EPS) best = n;
		});
		return {
			mode: "paquete",
			targets: [mk(best)],
			missing: [],
			reason: ""
		};
	}
	var QUANTILES = 15;
	function scheduleImpactOf(eng, res, range, prob, sign) {
		const out = {
			mode: res.mode,
			targets: res.targets,
			missing: res.missing,
			reason: res.reason,
			mapped: res.targets.length > 0,
			base: eng.base,
			delay: {
				low: null,
				likely: null,
				high: null
			},
			minFloat: null,
			evDays: null
		};
		if (!res.targets.length) return out;
		out.minFloat = Math.min(...res.targets.map((t) => t.tf));
		const delayFor = (days) => {
			const d = {};
			res.targets.forEach((t) => {
				d[t.id] = sign * days;
			});
			const dur = eng.duration(d);
			return dur === null ? null : dur - eng.base;
		};
		const pt = (v) => v === null ? null : delayFor(v);
		out.delay = {
			low: pt(range.low),
			likely: pt(range.likely),
			high: pt(range.high)
		};
		if (prob !== null && range.likely !== null) {
			const lo = range.low === null ? range.likely : range.low, hi = range.high === null ? range.likely : range.high;
			let s = 0, n = 0;
			for (let i = 0; i < QUANTILES; i++) {
				const v = delayFor(triInv((i + .5) / QUANTILES, lo, range.likely, hi));
				if (v !== null) {
					s += v;
					n++;
				}
			}
			if (n) out.evDays = prob * (s / n);
		}
		return out;
	}
	function delayPhrase(im) {
		const d = im.delay.likely;
		if (!im.mapped) return "no se puede ubicar en el cronograma (" + im.reason + ")";
		if (d === null) return "sin impacto en plazo cuantificado";
		const days = Math.round(Math.abs(d) * 10) / 10;
		if (Math.abs(d) < 1e-6) return "la holgura de las actividades afectadas (" + fmtDays(im.minFloat) + ") absorbe el impacto más probable";
		return (d > 0 ? "retrasa el fin del proyecto " : "adelanta el fin del proyecto ") + days + " d" + (im.targets.some((t) => t.critical) ? " (actividad crítica)" : "");
	}
	var fmtDays = (v) => v === null ? "—" : Math.round(v * 10) / 10 + " d";
	//#endregion
	//#region src/modules/risks/main.ts
	var $ = (id) => document.getElementById(id);
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	var todayISO = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	function setStatus(msg) {
		$("statusLeft").textContent = msg;
	}
	var CUR = {
		USD: "$",
		PEN: "S/",
		EUR: "€"
	};
	var connected = false;
	var currency = "USD";
	var costBase = 0;
	var leaves = [];
	var roles = [];
	var sym = () => CUR[currency] || "$";
	var money = (n) => n == null || !isFinite(n) ? "—" : sym() + " " + Math.round(n).toLocaleString("es-PE");
	var SAMPLE_LEAVES = [
		["1.1", "Acta de constitución"],
		["1.2", "Plan de gestión del proyecto"],
		["1.3", "Informes de seguimiento y control"],
		["2.1", "Estudio de suelos"],
		["2.2", "Diseño estructural"],
		["2.3", "Diseño eléctrico y sanitario"],
		["2.4", "Permisos y licencias municipales"],
		["3.1", "Estructuras metálicas prefabricadas"],
		["3.2", "Materiales de construcción"],
		["3.3", "Equipos eléctricos e instalaciones"],
		["4.1", "Movimiento de tierras"],
		["4.2", "Cimentaciones"],
		["4.3", "Estructura y cobertura"],
		["4.4", "Acabados y cerramientos"],
		["4.5", "Instalaciones MEP"],
		["5.1", "Pruebas de instalaciones"],
		["5.2", "Capacitación al cliente"],
		["5.3", "Acta de entrega y cierre"]
	].map(([code, name]) => ({
		id: "w-" + code,
		code,
		name
	}));
	var SAMPLE_ROLES = [
		"Sponsor (Gerencia General)",
		"Director de Proyecto",
		"Jefe de Ingeniería",
		"Jefe de Logística",
		"Residente de Obra",
		"Control de Calidad / QA-QC",
		"Asesoría Legal"
	];
	var SAMPLE_COST_BASE = 71e5;
	function refreshContext() {
		const G = window.GPI;
		connected = !!(G && G.available() && G.active());
		if (connected && G) try {
			const wbs = G.getModule("wbs");
			leaves = G.util.wbsLeaves(wbs).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name
			}));
			const obs = G.getModule("obs");
			roles = Array.from(new Set(G.util.obsNodes(obs).map((n) => (n.role || G.util.obsLabel(n) || "").trim()).filter(Boolean)));
			const cost = G.getModule("cost");
			costBase = Number(cost && cost.budget && (cost.budget.baseCost || cost.budget.computed && cost.budget.computed.base)) || 0;
			const m = G.meta();
			currency = m && m.currency || "USD";
		} catch (e) {}
		else {
			leaves = SAMPLE_LEAVES;
			roles = SAMPLE_ROLES;
			costBase = SAMPLE_COST_BASE;
			currency = "USD";
		}
		netDirty = true;
	}
	var net = null;
	var eng = null;
	var netDirty = true;
	var schedCache = /* @__PURE__ */ new Map();
	var simCache = null;
	function getEng() {
		if (!netDirty) return eng;
		netDirty = false;
		net = null;
		eng = null;
		schedCache.clear();
		simCache = null;
		const G = window.GPI;
		if (!G || !G.util || !G.util.cpm || !G.util.scheduleNetwork) return null;
		try {
			if (connected) net = G.util.activeScheduleNetwork();
			else {
				const m = sampleScheduleModules();
				net = G.util.scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE);
			}
			eng = makeEngine(net, G.util.cpm);
		} catch (e) {
			net = null;
			eng = null;
		}
		return eng;
	}
	var plan = normalizePlan(null);
	var risks = [];
	var idCounter = 1;
	var selectedId = null;
	var view = "registro";
	var matrixWhich = "inherent";
	var sortByScore = false;
	var expanded = /* @__PURE__ */ new Set();
	var newId = () => "rk" + idCounter++;
	var byId = (id) => risks.find((r) => r.id === id);
	var leafCode = (id) => {
		const l = leaves.find((x) => x.id === id);
		return l ? l.code : id;
	};
	function sampleRisks() {
		return buildSampleRisks((c) => {
			const l = leaves.find((x) => x.code === c);
			return l ? l.id : "";
		});
	}
	function loadSample() {
		plan = SAMPLE_PLAN;
		risks = sampleRisks();
		idCounter = risks.length + 1;
		selectedId = risks[0] ? risks[0].id : null;
		expanded = /* @__PURE__ */ new Set();
	}
	function blankAnalysis() {
		plan = normalizePlan(null);
		risks = [];
		idCounter = 1;
		selectedId = null;
		expanded = /* @__PURE__ */ new Set();
	}
	var LV = {
		alto: "ALTO",
		medio: "MEDIO",
		bajo: "BAJO"
	};
	function levelPill(score, opp = false) {
		const lv = levelOf(score, plan);
		return lv ? `<span class="lv lv-${lv}${opp ? " opp" : ""}" title="Puntaje ${score}">${LV[lv]} · ${score}</span>` : `<span class="lv lv-none">Sin analizar</span>`;
	}
	var sevText = {
		riesgo: "RIESGO",
		aviso: "AVISO",
		info: "NOTA"
	};
	function findingsHtml(fs) {
		return fs.length ? `<ul class="rk-finds">${fs.map((f) => `<li><span class="sv ${f.severity}">${sevText[f.severity]}</span>${esc(f.text)}</li>`).join("")}</ul>` : `<div class="muted small">Sin hallazgos de coherencia.</div>`;
	}
	function linkedOrders(r) {
		let all = [];
		if (connected && window.GPI) try {
			const c = window.GPI.getModule("cost");
			all = c && Array.isArray(c.changeOrders) ? c.changeOrders : [];
		} catch (e) {}
		else all = SAMPLE_LINKED_ORDERS;
		return all.filter((o) => o && o.riskId === r.id).map((o) => ({
			id: String(o.id || ""),
			cost: Number(o.cost) || 0,
			status: String(o.status || ""),
			fund: String(o.fund || "")
		}));
	}
	var linkedSummary = (r) => {
		const l = linkedOrders(r);
		return {
			approved: l.filter((o) => o.status === "Aprobada").reduce((s, o) => s + o.cost, 0),
			count: l.length
		};
	};
	function impactFor(r, which) {
		const e = getEng();
		if (!e) return null;
		const res = residualOf(r, plan), resOk = which === "residual" && !!r.strategy && r.strategy !== "aceptar" && res.assessed && impactMean(r.resTimeImpact) !== null;
		if (which === "residual" && !resOk) return null;
		const range = which === "residual" ? r.resTimeImpact : r.timeImpact;
		const prob = which === "residual" ? probEffective(r.resProbPct, r.resProb, plan) : probEffective(r.probPct, r.prob, plan);
		const key = r.id + "|" + which + "|" + JSON.stringify([
			r.type,
			r.wbsIds,
			r.actIds,
			range,
			prob
		]);
		let im = schedCache.get(key);
		if (!im) {
			im = scheduleImpactOf(e, resolveTargets(r, e), range, prob, r.type === "amenaza" ? 1 : -1);
			if (schedCache.size > 2e3) schedCache.clear();
			schedCache.set(key, im);
		}
		return im;
	}
	function scheduleFacts(r) {
		if (!getEng() || impactMean(r.timeImpact) === null || !((r.timeImpact.likely || 0) > 0)) return void 0;
		const im = impactFor(r, "inherent");
		if (!im) return void 0;
		return {
			network: true,
			mapped: im.mapped,
			reason: im.reason,
			minFloat: im.minFloat,
			delayLikely: im.delay.likely,
			delayHigh: im.delay.high
		};
	}
	var findingsOf = (r) => riskFindings(r, plan, {
		today: todayISO(),
		costBase,
		leafIds: leaves.map((l) => l.id),
		linked: r.status === "materializado" ? linkedSummary(r) : void 0,
		schedule: scheduleFacts(r)
	});
	var statement = (r) => r.cause.trim() || r.event.trim() || r.effect.trim() ? "Debido a " + (r.cause.trim() || "…") + ", puede ocurrir que " + (r.event.trim() || "…") + ", lo que " + (r.type === "amenaza" ? "causaría " : "generaría ") + (r.effect.trim() || "…") + "." : "";
	function render() {
		document.querySelectorAll("#viewGroup .btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
		const main = $("mainArea"), prev = main.scrollTop;
		main.innerHTML = view === "registro" ? renderRegister() : view === "matriz" ? renderMatrix() : view === "analisis" ? renderAnalysis() : renderPlan();
		wireMain();
		renderSidebar();
		main.scrollTop = prev;
		$("btnDelete").disabled = !selectedId;
	}
	function rowHtml(r) {
		const sc = inherentScore(r), res = residualOf(r, plan), open = isOpen(r), fs = findingsOf(r);
		const worst = fs.some((f) => f.severity === "riesgo") ? "riesgo" : fs.some((f) => f.severity === "aviso") ? "aviso" : "";
		const imp = maxImpact(r.impCost, r.impTime, r.impScope);
		const resTxt = res.assessed && res.score !== null && r.strategy !== "aceptar" ? levelPill(res.score, r.type === "oportunidad") : `<span class="muted small">${r.strategy === "aceptar" ? "= inherente" : "—"}</span>`;
		return `<td class="mono">${esc(r.code)}</td>
    <td><div class="rk-title">${esc(r.title || "(sin título)")}</div>
      <div class="rk-sub"><span class="typ typ-${r.type}">${r.type === "amenaza" ? "AMENAZA" : "OPORTUNIDAD"}</span> ${esc(r.category || "sin categoría")}${r.wbsIds.length ? " · EDT " + esc(r.wbsIds.map(leafCode).join(", ")) : ""}</div></td>
    <td>${esc(r.owner || "—")}</td>
    <td class="c">${r.prob === null ? "—" : r.prob}</td><td class="c">${imp === null ? "—" : imp}</td>
    <td>${open || r.status === "materializado" ? levelPill(sc, r.type === "oportunidad") : `<span class="muted small">—</span>`}</td>
    <td>${resTxt}</td>
    <td>${esc(r.strategy || "—")}</td>
    <td><span class="st st-${r.status}">${esc(STATUS_LABEL[r.status])}</span></td>
    <td class="c">${worst ? `<span class="fbadge ${worst}" title="${fs.length} hallazgo(s)">${fs.length}</span>` : ""}</td>`;
	}
	function renderRegister() {
		const head = `<div class="view-head"><h2>Registro de riesgos</h2>
    <p>La base del proceso: cada riesgo se describe como <b>causa → evento → efecto</b>, se ubica en la <b>RBS</b>, se analiza (probabilidad e impacto en costo, plazo y alcance/calidad), se cuantifica cuando pesa, recibe una <b>estrategia</b> y un <b>propietario</b>, y se revisa periódicamente. Los <b>eventos discretos</b> se gestionan aquí; la <b>incertidumbre del estimado</b> se trata con el análisis de rangos de Costos. <b>Haz clic en un riesgo</b> para editarlo.</p></div>`;
		if (!risks.length) return head + `<div class="empty-hint">Aún no hay riesgos. Usa <b>+ Amenaza</b> o <b>+ Oportunidad</b> para empezar, o <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</div>`;
		const rows = (sortByScore ? risks.slice().sort((a, b) => (inherentScore(b) ?? -1) - (inherentScore(a) ?? -1) || a.code.localeCompare(b.code)) : risks).map((r) => {
			const open = expanded.has(r.id);
			return `<tr class="rk-row${open ? " open" : ""}${r.id === selectedId ? " sel" : ""}" data-id="${esc(r.id)}" tabindex="0" role="button" aria-expanded="${open}">${rowHtml(r)}</tr>
      <tr class="rk-det" data-id="${esc(r.id)}" style="display:${open ? "table-row" : "none"}"><td colspan="10"><div class="det-box" id="det-${esc(r.id)}">${open ? detailHtml(r) : ""}</div></td></tr>`;
		}).join("");
		return head + `<div class="reg-toolbar"><button class="btn" id="btnSort">${sortByScore ? "☰ Orden del registro" : "⇅ Ordenar por puntaje"}</button>
      <button class="btn" id="btnExpandAll">⊞ Expandir todo</button><button class="btn" id="btnCollapseAll">⊟ Colapsar todo</button></div>
    <div class="rk-wrap"><table class="rk"><thead><tr><th>Código</th><th class="l">Riesgo</th><th class="l">Propietario</th><th>P</th><th>I máx.</th><th class="l">Puntaje</th><th class="l">Residual</th><th class="l">Estrategia</th><th class="l">Estado</th><th>Hallazgos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
	}
	function fld(label, control, wide = false, hint = "") {
		return `<div class="fd${wide ? " wide" : ""}"><label>${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
	}
	function inp(r, f, v, type = "text", extra = "", k = "", t = "") {
		return `<input ${type === "number" ? "type=\"number\" step=\"any\"" : type === "date" ? "type=\"date\"" : "type=\"text\""} class="ri" data-id="${esc(r.id)}" data-f="${f}"${k ? ` data-k="${k}"` : ""}${t ? ` data-t="${t}"` : ""} value="${esc(v === null || v === void 0 ? "" : v)}" ${extra}>`;
	}
	function txt(r, f, v, rows = 2, ph = "") {
		return `<textarea class="ri" rows="${rows}" data-id="${esc(r.id)}" data-f="${f}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
	}
	function sel(r, f, opts, cur, t = "") {
		return `<select class="ri" data-id="${esc(r.id)}" data-f="${f}"${t ? ` data-t="${t}"` : ""}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur === null ? "" : cur) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
	}
	var levelOpts = (labels, desc) => [["", "Sin evaluar"], ...labels.map((l, i) => [String(i + 1), i + 1 + " · " + l + (desc ? " — " + desc[i] : "")])];
	function detailHtml(r) {
		const opp = r.type === "oportunidad";
		const probOpts = levelOpts(PROB_LABELS, plan.probPct.map((p) => "≈ " + p + " %"));
		const impC = levelOpts(IMPACT_LABELS, plan.costBandsPct.map((b, i) => (i === 0 ? "≤ " : "hasta ") + b + " % del costo base").concat(["más del " + plan.costBandsPct[3] + " %"]));
		const impT = levelOpts(IMPACT_LABELS, plan.timeBandsDays.map((b, i) => (i === 0 ? "≤ " : "hasta ") + b + " d").concat(["más de " + plan.timeBandsDays[3] + " d"]));
		const impS = levelOpts(IMPACT_LABELS, plan.scopeDescriptors);
		const strat = strategiesFor(r.type), leafSel = `<select class="ri" multiple size="6" data-id="${esc(r.id)}" data-f="wbsIds">${leaves.map((l) => `<option value="${esc(l.id)}" ${r.wbsIds.indexOf(l.id) >= 0 ? "selected" : ""}>${esc(l.code + " " + l.name)}</option>`).join("")}</select>`;
		const range3 = (f, unit, label) => fld(label + " (" + unit + ")", `<div class="r3">${[
			"low",
			"likely",
			"high"
		].map((k) => `<label><span>${k === "low" ? "Mín" : k === "likely" ? "Más prob." : "Máx"}</span>${inp(r, f, r[f][k], "number", "min=\"0\"", k, "num")}</label>`).join("")}</div>`, true);
		return `<div class="det-grid">
    <div class="sec">1 · Identificación</div>
    ${fld("Código", `<input class="ri" data-id="${esc(r.id)}" data-f="code" value="${esc(r.code)}">`)}
    ${fld("Título", inp(r, "title", r.title), true)}
    ${fld("Tipo", sel(r, "type", [["amenaza", "Amenaza (efecto negativo)"], ["oportunidad", "Oportunidad (efecto positivo)"]], r.type))}
    ${fld("Categoría (RBS)", sel(r, "category", [
			["", "Sin categoría"],
			...plan.categories.map((c) => [c, c]),
			...r.category && plan.categories.indexOf(r.category) < 0 ? [[r.category, r.category + " (ya no está en el plan)"]] : []
		], r.category))}
    ${fld("Propietario del riesgo", `<input class="ri" list="dlRoles" data-id="${esc(r.id)}" data-f="owner" value="${esc(r.owner)}" placeholder="Rol o persona">`)}
    ${fld("Estado", sel(r, "status", RISK_STATUSES.map((s) => [s, STATUS_LABEL[s]]), r.status))}
    ${fld("Proximidad", sel(r, "proximity", [["", "Sin definir"], ...PROXIMITY.map((p) => [p, PROXIMITY_LABEL[p]])], r.proximity), false, "Qué tan pronto podría ocurrir: ordena la atención a igual puntaje.")}
    ${fld("Identificado el", inp(r, "identifiedOn", r.identifiedOn, "date"))}
    ${fld("Última revisión", `<div class="rv">${inp(r, "reviewedOn", r.reviewedOn, "date")}<button class="btn sm" data-act="reviewed" data-id="${esc(r.id)}" type="button">Revisado hoy</button></div>`, false, "El plan pide revisar cada " + plan.reviewDays + " días.")}
    ${fld("Paquetes de la EDT afectados", leafSel, true, leaves.length ? "Ctrl/⌘ + clic para elegir varios." : "Crea la EDT en WBS Builder para vincular paquetes.")}
    ${actSelField(r)}
    ${fld("Causa", txt(r, "cause", r.cause, 2, "¿Qué condición o hecho origina el riesgo?"))}
    ${fld("Evento", txt(r, "event", r.event, 2, "¿Qué podría ocurrir?"))}
    ${fld("Efecto", txt(r, "effect", r.effect, 2, "¿Qué consecuencia tendría en los objetivos?"))}
    <div class="fd wide"><div class="stmt" id="stmt-${esc(r.id)}">${esc(statement(r)) || "<span class=\"muted\">Completa causa, evento y efecto para ver el enunciado del riesgo.</span>"}</div></div>

    <div class="sec">2 · Análisis cualitativo (antes de la respuesta)</div>
    ${fld("Probabilidad", sel(r, "prob", probOpts, r.prob, "level"))}
    ${fld("Impacto en costo", sel(r, "impCost", impC, r.impCost, "level"))}
    ${fld("Impacto en plazo", sel(r, "impTime", impT, r.impTime, "level"))}
    ${fld("Impacto en alcance / calidad", sel(r, "impScope", impS, r.impScope, "level"))}

    <div class="sec">3 · Análisis cuantitativo — valor esperado (AACE 44R-08)</div>
    ${fld("Probabilidad cuantificada (%)", inp(r, "probPct", r.probPct, "number", "min=\"0\" max=\"100\"", "", "num"), false, "Opcional: si se deja vacía se usa la del nivel del plan.")}
    <div class="fd"></div>
    ${range3("costImpact", sym(), opp ? "Ahorro si ocurre" : "Sobrecosto si ocurre")}
    ${range3("timeImpact", "días laborables", opp ? "Adelanto si ocurre" : "Retraso si ocurre")}

    <div class="sec">4 · Respuesta</div>
    ${fld("Estrategia", sel(r, "strategy", [["", "Sin estrategia"], ...strat.map((s) => [s, s.charAt(0).toUpperCase() + s.slice(1)])], r.strategy), false, esc(STRATEGY_HINT[r.strategy] || "Elige una estrategia propia de " + (opp ? "las oportunidades" : "las amenazas") + "."))}
    ${fld("Responsable de la respuesta", `<input class="ri" list="dlRoles" data-id="${esc(r.id)}" data-f="responseOwner" value="${esc(r.responseOwner)}">`)}
    ${fld("Acciones de respuesta", txt(r, "response", r.response, 2, "¿Qué se hará y cuándo?"), true)}
    ${fld("Disparador (respuesta contingente)", inp(r, "trigger", r.trigger), false, "La señal que activa el plan si el riesgo se acerca.")}
    ${fld("Costo de la respuesta (" + sym() + ")", inp(r, "responseCost", r.responseCost, "number", "min=\"0\"", "", "num"), false, "Se planifica dentro de la línea base, no en la contingencia.")}
    ${fld("Riesgos secundarios", inp(r, "secondary", r.secondary), true, "Los que surgen como consecuencia de aplicar la respuesta.")}

    ${r.strategy && r.strategy !== "aceptar" ? `<div class="sec">5 · Riesgo residual (después de la respuesta)</div>
    ${fld("Probabilidad residual", sel(r, "resProb", probOpts, r.resProb, "level"))}
    ${fld("Impacto residual en costo", sel(r, "resImpCost", impC, r.resImpCost, "level"))}
    ${fld("Impacto residual en plazo", sel(r, "resImpTime", impT, r.resImpTime, "level"))}
    ${fld("Impacto residual en alcance / calidad", sel(r, "resImpScope", impS, r.resImpScope, "level"))}
    ${fld("Probabilidad residual cuantificada (%)", inp(r, "resProbPct", r.resProbPct, "number", "min=\"0\" max=\"100\"", "", "num"))}
    <div class="fd"></div>
    ${range3("resCostImpact", sym(), "Impacto residual en costo")}
    ${range3("resTimeImpact", "días laborables", "Impacto residual en plazo")}` : `<div class="sec">5 · Riesgo residual</div><div class="fd wide muted">${r.strategy === "aceptar" ? "Con la estrategia <b>aceptar</b> no hay una respuesta que reduzca el riesgo: el residual es el inherente." : "Elige una estrategia para evaluar el riesgo residual."}</div>`}

    ${r.status === "materializado" ? `<div class="sec">6 · Materialización</div>
    ${fld("Ocurrió el", inp(r, "materializedOn", r.materializedOn, "date"))}
    ${fld("Costo real (" + sym() + ")", inp(r, "actualCost", r.actualCost, "number", "min=\"0\"", "", "num"))}
    ${fld("Retraso real (días)", inp(r, "actualDelay", r.actualDelay, "number", "min=\"0\"", "", "num"))}` : ""}

    <div class="sec">Notas</div>
    ${fld("Notas", txt(r, "notes", r.notes, 2), true)}
    <div class="fd wide"><div class="calc" id="calc-${esc(r.id)}">${calcHtml(r)}</div></div>
  </div>`;
	}
	function actSelField(r) {
		const e = getEng();
		if (!e) return "";
		const opts = e.net.nodes.filter((n) => !n.isMilestone && (!r.wbsIds.length || n.leafId !== null && r.wbsIds.indexOf(n.leafId) >= 0)).map((n) => {
			const row = e.rows[n.id], tf = row ? row.tf : 0;
			return `<option value="${esc(n.id)}" ${r.actIds.indexOf(n.id) >= 0 ? "selected" : ""}>${esc(n.code + " " + n.name)} · ${tf <= 1e-6 ? "crítica" : "holgura " + fmtDays(tf)}</option>`;
		}).join("");
		return fld("Actividades del cronograma afectadas (opcional)", `<select class="ri" multiple size="6" data-id="${esc(r.id)}" data-f="actIds">${opts}</select>`, true, "Sin elegir ninguna, el retraso se aplica UNA vez a la actividad de menor holgura de los paquetes elegidos. Si eliges actividades, se aplica a CADA una. Ctrl/⌘ + clic para elegir varias.");
	}
	function scheduleBlock(r) {
		if (!(impactMean(r.timeImpact) !== null && (r.timeImpact.likely || 0) > 0)) return "";
		const head = `<div class="cl" style="margin-top:10px">Efecto en el cronograma (CPM)</div>`;
		const e = getEng(), im = impactFor(r, "inherent");
		if (!e || !im) return head + `<div class="muted small">El proyecto aún no tiene actividades enlazadas: define la EDT, las actividades y sus enlaces (Cronograma/CPM) para ver cuánto retrasaría este riesgo el fin del proyecto.</div>`;
		const opp = r.type === "oportunidad";
		if (!im.mapped) return head + `<div class="muted small">No se puede ubicar en el cronograma: ${esc(im.reason)}. Elige los paquetes de la EDT (y, si quieres, las actividades) que afecta.</div>`;
		const tg = im.targets.map((t) => `<b class="mono">${esc(t.code)}</b> ${esc(t.name)} — ${t.critical ? "<b>crítica</b> (holgura 0)" : "holgura " + fmtDays(t.tf)}`).join("<br>");
		const how = im.mode === "actividades" ? "El retraso se aplica a <b>cada</b> actividad elegida:" : "Se aplica <b>una vez</b>, a la actividad de menor holgura de sus paquetes:";
		const row = (lbl, days, eff) => `<tr><td>${lbl}</td><td class="num">${days === null ? "—" : fmtDays(days)}</td><td class="num"><b>${eff === null ? "—" : (opp && eff !== 0 ? "−" : "") + fmtDays(Math.abs(eff))}</b></td></tr>`;
		const rg = r.timeImpact;
		return head + `<div class="muted small">${how}<br>${tg}${im.missing.length ? `<br><span class="warn">${im.missing.length} actividad(es) elegida(s) ya no existen en el cronograma.</span>` : ""}</div>
    <table class="an" style="margin-top:6px"><thead><tr><th class="l">Si ocurre con…</th><th>${opp ? "Adelanto del riesgo" : "Retraso del riesgo"}</th><th>${opp ? "Adelanta el fin del proyecto" : "Retrasa el fin del proyecto"}</th></tr></thead><tbody>${row("Mínimo", rg.low, im.delay.low)}${row("Más probable", rg.likely, im.delay.likely)}${row("Máximo", rg.high, im.delay.high)}</tbody></table>
    <div class="muted small" style="margin-top:4px">${esc(delayPhrase(im).replace(/^./, (c) => c.toUpperCase()))}.${im.evDays !== null ? " Valor esperado sobre el fin del proyecto: <b>≈ " + Math.round(Math.abs(im.evDays) * 10) / 10 + " d</b>" + (opp ? " de adelanto" : "") + " (probabilidad × media del efecto)." : ""}</div>`;
	}
	function calcHtml(r) {
		const sc = inherentScore(r), ev = inherentEV(r, plan), res = residualOf(r, plan), pr = probEffective(r.probPct, r.prob, plan);
		const sg = r.type === "oportunidad" ? "ahorro" : "sobrecosto";
		const implC = r.costImpact.likely !== null ? costLevel(r.costImpact.likely, costBase, plan) : null, implT = r.timeImpact.likely !== null ? timeLevel(r.timeImpact.likely, plan) : null;
		return `<div class="calc-grid">
    <div><div class="cl">Puntaje inherente</div><div class="cv">${levelPill(sc, r.type === "oportunidad")}</div><div class="muted small">P${r.prob ?? "—"} × impacto ${maxImpact(r.impCost, r.impTime, r.impScope) ?? "—"}${pr !== null ? " · prob. efectiva " + Math.round(pr * 100) + " %" : ""}</div></div>
    <div><div class="cl">Valor esperado (${sg})</div><div class="cv mono">${money(ev.cost)}</div><div class="muted small">${ev.time !== null ? "≈ " + Math.round(ev.time * 10) / 10 + " días · " : ""}P × media de la triangular (mín + más prob. + máx) / 3</div></div>
    <div><div class="cl">Riesgo residual</div><div class="cv">${res.assessed && res.score !== null ? levelPill(res.score, r.type === "oportunidad") : `<span class="muted small">${r.strategy ? "Sin evaluar" : "—"}</span>`}</div><div class="muted small">${res.assessed && res.ev.cost !== null ? "EV residual " + money(res.ev.cost) : res.derived ? "= inherente (aceptar)" : ""}</div></div>
    <div><div class="cl">Niveles según valores cuantificados</div><div class="cv small">${implC !== null ? "Costo: nivel " + implC : "Costo: —"} · ${implT !== null ? "Plazo: nivel " + implT : "Plazo: —"}</div><div class="muted small">Contraste con lo declarado en el análisis cualitativo</div></div>
  </div>${scheduleBlock(r)}${r.status === "materializado" ? linkedBlock(r) : ""}<div class="cl" style="margin-top:8px">Hallazgos de coherencia</div>${findingsHtml(findingsOf(r))}`;
	}
	function linkedBlock(r) {
		const l = linkedOrders(r);
		return `<div class="cl" style="margin-top:10px">Órdenes de cambio vinculadas (Costos)</div><table class="an"><thead><tr><th class="l">Orden</th><th class="l">Estado</th><th class="l">Fondeo</th><th>Monto</th></tr></thead><tbody>${l.length ? l.map((o) => `<tr><td class="mono">${esc(o.id)}</td><td>${esc(o.status)}</td><td>${esc(o.fund)}</td><td class="num">${money(o.cost)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Sin órdenes de cambio vinculadas en Costos.</td></tr>`}</tbody></table>`;
	}
	var rowEl = (id) => Array.from(document.querySelectorAll("tr.rk-row")).find((el) => el.dataset.id === id) || null;
	function refreshRisk(r) {
		const tr = rowEl(r.id);
		if (tr) tr.innerHTML = rowHtml(r);
		const calc = document.getElementById("calc-" + r.id);
		if (calc) calc.innerHTML = calcHtml(r);
		const st = document.getElementById("stmt-" + r.id);
		if (st) st.innerHTML = esc(statement(r)) || "<span class=\"muted\">Completa causa, evento y efecto para ver el enunciado del riesgo.</span>";
		renderSidebar();
	}
	function redrawDetail(r) {
		const box = document.getElementById("det-" + r.id);
		if (box) {
			box.innerHTML = detailHtml(r);
			bindDetail(box);
		}
		refreshRisk(r);
	}
	function onField(el) {
		const r = byId(el.dataset.id);
		if (!r) return;
		const f = el.dataset.f, k = el.dataset.k, t = el.dataset.t;
		const rec = r;
		let v = el.value;
		if (t === "num") v = toNum(el.value);
		else if (t === "level") v = toLevel(el.value);
		if (f === "wbsIds" || f === "actIds") v = Array.from(el.selectedOptions).map((o) => o.value);
		if (k) rec[f][k] = v;
		else rec[f] = v;
		if (f === "wbsIds") {
			const e = getEng();
			if (e && r.wbsIds.length) r.actIds = r.actIds.filter((id) => {
				const n = e.byId[id];
				return !n || n.leafId !== null && r.wbsIds.indexOf(n.leafId) >= 0;
			});
			redrawDetail(r);
			return;
		}
		if (f === "type") {
			if (strategiesFor(r.type).indexOf(r.strategy) < 0) r.strategy = "";
			redrawDetail(r);
			return;
		}
		if (f === "status") {
			if (v === "materializado" && !r.materializedOn) r.materializedOn = todayISO();
			redrawDetail(r);
			return;
		}
		if (f === "strategy") {
			redrawDetail(r);
			return;
		}
		refreshRisk(r);
	}
	function bindDetail(root) {
		root.querySelectorAll(".ri").forEach((el) => {
			el.addEventListener(el.tagName === "SELECT" || el.type === "date" ? "change" : "input", () => onField(el));
		});
		root.querySelectorAll("[data-act=\"reviewed\"]").forEach((b) => b.addEventListener("click", () => {
			const r = byId(b.dataset.id);
			if (r) {
				r.reviewedOn = todayISO();
				redrawDetail(r);
			}
		}));
	}
	function matrixHtml(type) {
		const g = buildMatrix(risks, type, matrixWhich, plan), opp = type === "oportunidad";
		return `<table class="mx"><thead>${`<tr><th class="corner">Probabilidad ↓ · Impacto →</th>${IMPACT_LABELS.map((l, i) => `<th scope="col">${i + 1} · ${l}</th>`).join("")}</tr>`}</thead><tbody>${g.map((row, i) => `<tr><th scope="row">${5 - i} · ${PROB_LABELS[4 - i]}<span>≈ ${plan.probPct[4 - i]} %</span></th>${row.map((c) => `<td class="mx-c lv-${c.level}${opp ? " opp" : ""}"><span class="mx-s">${c.score}</span>${c.ids.map((id) => {
			const r = byId(id);
			return `<button class="mx-chip" data-id="${esc(id)}" title="${esc(r.code + " — " + r.title)}">${esc(r.code)}</button>`;
		}).join("")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
	}
	function renderMatrix() {
		const miss = risks.filter(isOpen).filter((r) => matrixWhich === "inherent" ? inherentScore(r) === null : !residualOf(r, plan).assessed).length;
		return `<div class="view-head"><h2>Matriz probabilidad × impacto</h2>
    <p>Cada riesgo <b>abierto</b> se ubica por su probabilidad y por su <b>mayor impacto</b> entre costo, plazo y alcance/calidad. El color depende de los <b>umbrales del plan</b> (medio desde ${plan.thresholdMedium}, alto desde ${plan.thresholdHigh}); el puntaje de cada celda es probabilidad × impacto. Las amenazas y las oportunidades tienen matrices separadas. Haz clic en un código para abrir el riesgo.</p></div>
    <div class="mx-toggle"><div class="toggle-group" id="mxGroup"><button class="btn${matrixWhich === "inherent" ? " active" : ""}" data-w="inherent">Antes de la respuesta</button><button class="btn${matrixWhich === "residual" ? " active" : ""}" data-w="residual">Después de la respuesta (residual)</button></div>
      <span class="muted small">${miss ? miss + " riesgo(s) abierto(s) sin " + (matrixWhich === "inherent" ? "analizar" : "residual evaluado") + " no aparecen." : "Todos los riesgos abiertos están ubicados."}</span></div>
    <div class="mx-pair"><div><h3 class="mxh">Amenazas</h3>${matrixHtml("amenaza")}</div><div><h3 class="mxh">Oportunidades</h3>${matrixHtml("oportunidad")}</div></div>
    <div class="mx-legend"><span class="lv lv-alto">ALTO ≥ ${plan.thresholdHigh}</span><span class="lv lv-medio">MEDIO ≥ ${plan.thresholdMedium}</span><span class="lv lv-bajo">BAJO &lt; ${plan.thresholdMedium}</span><span class="muted small">Materializados y cerrados no aparecen: dejaron de ser incertidumbre.</span></div>`;
	}
	function scheduleSim() {
		const e = getEng();
		if (!e) return null;
		const ctx = riskEventsOf(risks, plan, { targets: (r) => resolveTargets(r, e).targets.map((t) => t.id) });
		const key = JSON.stringify(ctx.events.map((x) => [
			x.id,
			x.prob,
			x.sign,
			x.low,
			x.likely,
			x.high,
			x.days,
			x.targets
		])) + "|" + e.base;
		if (simCache && simCache.key === key) return simCache;
		const used = ctx.events.filter((x) => x.days && x.targets && x.targets.length).length;
		const out = used ? simulateRange([], {
			events: ctx.events,
			schedule: {
				base: e.base,
				costPerDay: 0,
				duration: (d) => e.duration(d)
			}
		}) : null;
		simCache = {
			key,
			res: out ? out.schedule : null,
			unmapped: ctx.unmapped,
			used
		};
		return simCache;
	}
	function finishOf(days) {
		const G = window.GPI;
		if (!G || !net || !net.startDate) return "";
		try {
			return G.util.addWorkingDays(G.util.parseISO(net.startDate), Math.max(0, Math.ceil(days - 1e-9) - 1), net.calendar);
		} catch (e) {
			return "";
		}
	}
	function scheduleAnalysisHtml() {
		const head = `<h3 class="mxh">Riesgo de plazo — efecto en el fin del proyecto (CPM)</h3>`;
		const e = getEng();
		if (!e) return `<div class="card" style="margin-top:14px">${head}<div class="muted small">El proyecto aún no tiene actividades enlazadas en el cronograma. Cuando las tenga, aquí verás cuánto retrasa cada riesgo el fin del proyecto y la reserva de plazo que requiere la cartera (AACE 40R-08 / 65R-11).</div></div>`;
		const rows = risks.filter((r) => isOpen(r) && impactMean(r.timeImpact) !== null && (r.timeImpact.likely || 0) > 0).map((r) => ({
			r,
			a: impactFor(r, "inherent"),
			b: impactFor(r, "residual")
		}));
		rows.sort((x, y) => Math.abs(y.a.evDays || 0) - Math.abs(x.a.evDays || 0) || x.r.code.localeCompare(y.r.code));
		const dd = (v) => v === null ? "—" : fmtDays(v);
		const body = rows.length ? rows.map(({ r, a, b }) => {
			const tg = a.mapped ? a.targets.map((t) => esc(t.code)).join(", ") + (a.mode === "paquete" ? " <span class=\"muted\">(menor holgura)</span>" : "") : `<span class="muted">sin ubicar</span>`;
			const sg = r.type === "oportunidad" ? -1 : 1;
			return `<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.title)}</td><td>${tg}</td><td class="num">${a.mapped ? a.minFloat !== null && a.minFloat <= 1e-6 ? "crítica" : dd(a.minFloat) : "—"}</td><td class="num">${dd(r.timeImpact.likely)}</td><td class="num">${a.mapped ? dd(a.delay.likely === null ? null : sg * Math.abs(a.delay.likely)) + " / " + dd(a.delay.high === null ? null : sg * Math.abs(a.delay.high)) : "—"}</td><td class="num">${a.evDays === null ? "—" : dd(Math.round(a.evDays * 10) / 10)}</td><td class="num">${b && b.evDays !== null ? dd(Math.round(b.evDays * 10) / 10) : "—"}</td></tr>`;
		}).join("") : `<tr><td colspan="8" class="muted">Ningún riesgo abierto tiene un impacto en plazo cuantificado (rango de días).</td></tr>`;
		const totA = rows.reduce((s, x) => s + (x.a.evDays || 0), 0), totB = rows.reduce((s, x) => s + (x.b && x.b.evDays !== null ? x.b.evDays : x.a.evDays || 0), 0);
		const sim = scheduleSim();
		const base = e.base, fin0 = finishOf(base);
		let simHtml;
		if (sim && sim.res) {
			const s = sim.res;
			simHtml = `<table class="an"><thead><tr><th class="l">Confianza</th><th>Duración</th><th>Reserva de plazo</th><th class="l">Fin</th></tr></thead><tbody>
      <tr><td>Plan (sin riesgos)</td><td class="num">${fmtDays(base)}</td><td class="num">—</td><td>${esc(fin0) || "—"}</td></tr>
      ${[
				50,
				70,
				80,
				90
			].map((q) => `<tr${q === 80 ? " class=\"tot\"" : ""}><td>P${q}</td><td class="num">${fmtDays(s.p[q])}</td><td class="num">${fmtDays(Math.max(0, s.p[q] - base))}</td><td>${esc(finishOf(s.p[q])) || "—"}</td></tr>`).join("")}</tbody></table>
      <div class="muted small" style="margin-top:6px">${s.events} evento(s) simulados sobre la red · 10.000 iteraciones · semilla fija (reproducible) · probabilidad de terminar después de lo previsto: <b>${Math.round(s.probDelay * 1e3) / 10} %</b> · retraso medio ≈ ${fmtDays(Math.round((s.mean - base) * 10) / 10)}. La reserva de plazo es <b>P − plan</b>, nunca negativa.</div>`;
		} else simHtml = `<div class="muted small">Sin eventos con impacto en plazo ubicado en el cronograma: no hay nada que simular.</div>`;
		const warn = sim && sim.unmapped.length ? `<div class="msg" style="display:block;margin-top:8px"><b>⚠ Sin ubicar en el cronograma:</b> ${sim.unmapped.map(esc).join(", ")} tienen impacto en plazo pero no indican qué actividades afectan; su retraso no entra a la simulación. Elige sus paquetes o actividades.</div>` : "";
		const hasEd = net && net.hasElapsedLags ? `<div class="note-box"><b>Desfases en días transcurridos:</b> la red tiene enlaces con desfase en días calendario («ed»); sin fecha de inicio real el cálculo los aproxima, así que el plazo base puede diferir del de Cronograma/CPM.</div>` : "";
		return `<div class="card" style="margin-top:14px">${head}
    <p class="muted small" style="margin:0 0 8px">Un retraso solo mueve el fin del proyecto si consume más que la <b>holgura</b> de la actividad afectada; una actividad de la ruta crítica lo traslada íntegro. Por eso el efecto no son «los días del riesgo»: se calcula volviendo a correr el CPM con la duración afectada (base ${fmtDays(base)}${fin0 ? ", fin " + esc(fin0) : ""}).</p>
    <div class="an-grid"><div><table class="an"><thead><tr><th class="l">Cód.</th><th class="l">Riesgo</th><th class="l">Actividad</th><th>Holgura</th><th>Riesgo</th><th>Fin del proyecto (más prob. / máx.)</th><th>VE antes</th><th>VE residual</th></tr></thead><tbody>${body}
      ${rows.length ? `<tr class="tot"><td colspan="6">Suma indicativa del valor esperado (amenazas − oportunidades)</td><td class="num">${dd(Math.round(totA * 10) / 10)}</td><td class="num">${dd(Math.round(totB * 10) / 10)}</td></tr>` : ""}</tbody></table>
      <div class="muted small" style="margin-top:6px">VE = valor esperado en días sobre el fin del proyecto (probabilidad × media del efecto). La suma es indicativa: no es el retraso esperado del proyecto, que lo da la simulación.</div></div>
      <div><h3 class="mxh" style="margin-top:0">Simulación de plazo (riesgo residual)</h3>${simHtml}${warn}</div></div>
    <div class="note-box"><b>Qué cubre y qué no.</b> Solo eventos de riesgo abiertos (con la respuesta ya aplicada), sobre las duraciones determinísticas del cronograma: no incluye la incertidumbre de las duraciones (PERT). El <b>costo</b> de la extensión del plazo (gastos generales, dirección, alquileres) se calcula en <b>Costos</b>, con esta misma simulación. Por eso el rango de costo de un riesgo <b>no debe incluir</b> costos que dependen del tiempo: se contarían dos veces.</div>${hasEd}</div>`;
	}
	function renderAnalysis() {
		const pf = portfolio(risks, plan), rk = rankRisks(risks, plan).slice(0, 8);
		const all = [];
		risks.forEach((r) => findingsOf(r).forEach((f) => all.push({
			r,
			f
		})));
		const order = {
			riesgo: 0,
			aviso: 1,
			info: 2
		};
		all.sort((a, b) => order[a.f.severity] - order[b.f.severity] || a.r.code.localeCompare(b.r.code));
		const cov = (n, d) => d ? Math.round(n / d * 100) + " % (" + n + "/" + d + ")" : "—";
		const lvCard = (lv, label, n, res) => `<div class="kp ${lv}"><div class="kv">${n}</div><div class="kl">${label}</div><div class="ks">residual: ${res}</div></div>`;
		const top = rk.length ? rk.map((r, i) => {
			const ev = inherentEV(r, plan);
			return `<tr><td class="c">${i + 1}</td><td class="mono">${esc(r.code)}</td><td>${esc(r.title)}</td><td>${levelPill(inherentScore(r), r.type === "oportunidad")}</td><td>${esc(r.proximity ? PROXIMITY_LABEL[r.proximity] : "—")}</td><td>${esc(r.strategy || "—")}</td><td class="num">${money(ev.cost)}</td></tr>`;
		}).join("") : `<tr><td colspan="7" class="muted">Aún no hay riesgos analizados.</td></tr>`;
		const cats = pf.byCategory.length ? pf.byCategory.map((c) => `<tr><td>${esc(c.category)}</td><td class="c">${c.count}</td><td class="num">${money(c.evCost)}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">—</td></tr>`;
		const fl = all.slice(0, 40).map(({ r, f }) => `<li><span class="sv ${f.severity}">${sevText[f.severity]}</span><button class="lk" data-id="${esc(r.id)}">${esc(r.code)}</button> ${esc(f.text)}</li>`).join("");
		return `<div class="view-head"><h2>Análisis de la cartera de riesgos</h2>
    <p>Lectura de conjunto para decidir dónde poner la atención. Los <b>valores esperados</b> siguen el método de la RP 44R-08 de AACE: probabilidad × impacto esperado, con el impacto dado por un rango de tres puntos. La exposición que interesa para la contingencia es la que <b>queda tras la respuesta</b> (residual).</p></div>
    <div class="kp-row">${lvCard("alto", "Riesgos altos", pf.byLevel.alto, pf.residualByLevel.alto)}${lvCard("medio", "Riesgos medios", pf.byLevel.medio, pf.residualByLevel.medio)}${lvCard("bajo", "Riesgos bajos", pf.byLevel.bajo, pf.residualByLevel.bajo)}${lvCard("sin", "Sin analizar", pf.byLevel.sin, pf.residualByLevel.sin)}</div>
    <div class="an-grid">
      <div class="card"><h3 class="mxh">Prioridad de atención</h3><table class="an"><thead><tr><th>#</th><th>Cód.</th><th class="l">Riesgo</th><th class="l">Puntaje</th><th class="l">Proximidad</th><th class="l">Estrategia</th><th>EV costo</th></tr></thead><tbody>${top}</tbody></table>
        <div class="muted small" style="margin-top:6px">Orden: mayor puntaje primero y, a igual puntaje, la proximidad más cercana. Solo riesgos abiertos y analizados.</div></div>
      <div class="card"><h3 class="mxh">Exposición esperada en costo (abiertos)</h3>
        <table class="an"><tbody>
          <tr><td>Amenazas — valor esperado</td><td class="num">${money(pf.evThreatCost)}</td></tr>
          <tr><td>Oportunidades — valor esperado</td><td class="num">−${money(pf.evOpportunityCost)}</td></tr>
          <tr class="tot"><td>Exposición neta (antes de la respuesta)</td><td class="num">${money(pf.netEvCost)}</td></tr>
          <tr><td>Amenazas residuales (después de la respuesta)</td><td class="num">${money(pf.resEvThreatCost)}</td></tr>
          <tr><td>Oportunidades residuales</td><td class="num">−${money(pf.resEvOpportunityCost)}</td></tr>
          <tr class="tot"><td>Exposición neta residual</td><td class="num">${money(pf.netResEvCost)}</td></tr>
          <tr><td>Retraso esperado por amenazas</td><td class="num">≈ ${Math.round(pf.evThreatDays * 10) / 10} d</td></tr>
          <tr><td>Impacto real de riesgos materializados</td><td class="num">${money(pf.actualCost)}</td></tr>
        </tbody></table>
        <div class="note-box"><b>Cómo leerlo (AACE).</b> Un valor esperado es una <b>media</b> (≈ P50): no es una contingencia por sí sola. La contingencia se determina sobre la exposición residual y a un nivel de confianza (percentil) elegido, y se suma a la incertidumbre del estimado: <b>Costos</b> ya toma estos riesgos como eventos de su simulación. Los riesgos sin cuantificar no suman: cuantifica primero los de impacto en costo ≥ 3.</div></div>
      <div class="card"><h3 class="mxh">Por categoría (RBS)</h3><table class="an"><thead><tr><th class="l">Categoría</th><th>Riesgos abiertos</th><th>EV neto</th></tr></thead><tbody>${cats}</tbody></table></div>
      <div class="card"><h3 class="mxh">Cobertura del registro (abiertos)</h3><table class="an"><tbody>
        <tr><td>Analizados (probabilidad e impacto)</td><td class="num">${cov(pf.coverage.analyzed, pf.coverage.openCount)}</td></tr>
        <tr><td>Con propietario</td><td class="num">${cov(pf.coverage.withOwner, pf.coverage.openCount)}</td></tr>
        <tr><td>Con estrategia de respuesta</td><td class="num">${cov(pf.coverage.withResponse, pf.coverage.openCount)}</td></tr>
        <tr><td>Con paquetes de la EDT</td><td class="num">${cov(pf.coverage.withWbs, pf.coverage.openCount)}</td></tr>
        <tr><td>Cuantificados en costo</td><td class="num">${cov(pf.coverage.quantified, pf.coverage.openCount)}</td></tr></tbody></table></div>
    </div>
    ${scheduleAnalysisHtml()}
    <div class="card" style="margin-top:14px"><h3 class="mxh">Hallazgos de coherencia (${all.length})</h3>${all.length ? `<ul class="rk-finds all">${fl}</ul>${all.length > 40 ? `<div class="muted small">… y ${all.length - 40} más.</div>` : ""}` : `<div class="muted small">El registro no tiene hallazgos.</div>`}</div>`;
	}
	function planBandsHtml() {
		const cost = plan.costBandsPct.concat([NaN]).map((b, i) => {
			const lo = i === 0 ? 0 : plan.costBandsPct[i - 1];
			return `<tr><td>${i + 1} · ${IMPACT_LABELS[i]}</td><td>${i === 4 ? "más de " + plan.costBandsPct[3] + " %" : (i === 0 ? "hasta " : lo + " % a ") + b + " %"}</td><td class="num">${costBase > 0 ? i === 4 ? "más de " + money(costBase * plan.costBandsPct[3] / 100) : (i === 0 ? "hasta " : money(costBase * lo / 100) + " a ") + money(costBase * b / 100) : "—"}</td></tr>`;
		}).join("");
		return `<table class="an"><thead><tr><th class="l">Nivel</th><th class="l">% del costo base</th><th>En ${esc(currency)}${costBase > 0 ? " (base " + money(costBase) + ")" : ""}</th></tr></thead><tbody>${cost}</tbody></table>`;
	}
	function renderPlan() {
		const pi = (name, i, v, extra = "") => `<input class="pi" type="number" step="any" data-p="${name}" data-i="${i}" value="${esc(v)}" ${extra}>`;
		const probRows = PROB_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td>${pi("probPct", i, plan.probPct[i], "min=\"0\" max=\"100\"")} %</td></tr>`).join("");
		const timeRows = IMPACT_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td>${i < 4 ? "hasta " + pi("timeBandsDays", i, plan.timeBandsDays[i], "min=\"0\"") + " días" : "más de " + plan.timeBandsDays[3] + " días"}</td></tr>`).join("");
		const costRows = IMPACT_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td>${i < 4 ? "hasta " + pi("costBandsPct", i, plan.costBandsPct[i], "min=\"0\"") + " % del costo base" : "más de " + plan.costBandsPct[3] + " %"}</td></tr>`).join("");
		const scopeRows = IMPACT_LABELS.map((l, i) => `<tr><td>${i + 1} · ${l}</td><td><input class="pi wide" type="text" data-p="scopeDescriptors" data-i="${i}" value="${esc(plan.scopeDescriptors[i])}"></td></tr>`).join("");
		const problems = validatePlan(plan);
		return `<div class="view-head"><h2>Plan de gestión de los riesgos</h2>
    <p>Define <b>cómo</b> se gestionan los riesgos de este proyecto: las escalas de probabilidad e impacto, los umbrales que separan riesgos bajos, medios y altos, la RBS, la frecuencia de revisión y la política de reservas. Estas definiciones <b>son del proyecto</b> (no hay una escala universal) y gobiernan toda la matriz y el registro.</p></div>
    <div class="msg" id="planMsg" style="display:${problems.length ? "block" : "none"}">${problems.length ? "<b>⚠ El plan tiene problemas:</b> " + problems.map(esc).join(" · ") : ""}</div>
    <div class="an-grid">
      <div class="card"><h3 class="mxh">Escala de probabilidad</h3><table class="an"><tbody>${probRows}</tbody></table></div>
      <div class="card"><h3 class="mxh">Escala de impacto en costo</h3><table class="an"><tbody>${costRows}</tbody></table><div id="planBands" style="margin-top:8px">${planBandsHtml()}</div></div>
      <div class="card"><h3 class="mxh">Escala de impacto en plazo</h3><table class="an"><tbody>${timeRows}</tbody></table></div>
      <div class="card"><h3 class="mxh">Impacto en alcance / calidad</h3><table class="an"><tbody>${scopeRows}</tbody></table></div>
      <div class="card"><h3 class="mxh">Umbrales (apetito de riesgo)</h3>
        <div class="fd"><label>Puntaje desde el que un riesgo es MEDIO</label>${pi("thresholdMedium", -1, plan.thresholdMedium, "min=\"1\" max=\"24\"")}</div>
        <div class="fd"><label>Puntaje desde el que un riesgo es ALTO</label>${pi("thresholdHigh", -1, plan.thresholdHigh, "min=\"2\" max=\"25\"")}</div>
        <div class="fd"><label>Revisión de cada riesgo abierto (días)</label>${pi("reviewDays", -1, plan.reviewDays, "min=\"1\"")}</div>
        <div class="muted small">El puntaje es probabilidad (1–5) × impacto (1–5): va de 1 a 25.</div></div>
      <div class="card"><h3 class="mxh">Categorías de la RBS</h3><textarea class="pi wide" rows="6" data-p="categories" data-i="-1" aria-label="Categorías, una por línea">${esc(plan.categories.join("\n"))}</textarea><div class="muted small">Una por línea. Los riesgos ya registrados conservan su categoría aunque se quite del plan.</div></div>
    </div>
    <div class="an-grid" style="margin-top:14px">
      <div class="card"><h3 class="mxh">Metodología</h3><textarea class="pi wide" rows="5" data-p="methodology" data-i="-1" placeholder="Cómo se identifican, analizan y responden los riesgos; herramientas y fuentes de información.">${esc(plan.methodology)}</textarea></div>
      <div class="card"><h3 class="mxh">Roles y responsabilidades</h3><textarea class="pi wide" rows="5" data-p="roles" data-i="-1" placeholder="Quién es dueño del proceso, de cada riesgo, quién autoriza reservas…">${esc(plan.roles)}</textarea></div>
      <div class="card"><h3 class="mxh">Política de reservas</h3><textarea class="pi wide" rows="5" data-p="reservePolicy" data-i="-1" placeholder="Qué cubre la contingencia y qué la reserva de gestión; quién autoriza su uso.">${esc(plan.reservePolicy)}</textarea></div>
    </div>`;
	}
	function onPlanField(el) {
		const key = el.dataset.p, i = Number(el.dataset.i);
		const rec = plan;
		if (key === "categories") plan.categories = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
		else if (key === "scopeDescriptors") plan.scopeDescriptors[i] = el.value;
		else if ([
			"probPct",
			"costBandsPct",
			"timeBandsDays"
		].indexOf(key) >= 0) {
			const v = toNum(el.value);
			rec[key][i] = v === null ? NaN : v;
		} else if ([
			"thresholdMedium",
			"thresholdHigh",
			"reviewDays"
		].indexOf(key) >= 0) {
			const v = toNum(el.value);
			rec[key] = v === null ? NaN : v;
		} else rec[key] = el.value;
		const problems = validatePlan(plan), box = $("planMsg");
		box.style.display = problems.length ? "block" : "none";
		box.innerHTML = problems.length ? "<b>⚠ El plan tiene problemas:</b> " + problems.map(esc).join(" · ") : "";
		const b = document.getElementById("planBands");
		if (b) b.innerHTML = planBandsHtml();
		renderSidebar();
	}
	function statsBlock() {
		const open = risks.filter(isOpen), high = open.filter((r) => levelOf(inherentScore(r), plan) === "alto").length;
		const withF = risks.filter((r) => findingsOf(r).some((f) => f.severity !== "info")).length;
		return `<h3>Resumen</h3><div class="stat-grid"><div class="stat"><div class="v">${open.length}</div><div class="l">Abiertos</div></div><div class="stat"><div class="v">${high}</div><div class="l">Altos</div></div><div class="stat"><div class="v">${withF}</div><div class="l">Con hallazgos</div></div><div class="stat"><div class="v">${risks.length}</div><div class="l">Total</div></div></div>`;
	}
	function guideBlock() {
		if (view === "matriz") return `<div class="tip-box"><b>Umbrales del plan:</b> medio desde ${plan.thresholdMedium}, alto desde ${plan.thresholdHigh}. Cambiarlos en la vista <b>Plan</b> recolorea la matriz.</div><div class="tip-box"><b>Antes / después:</b> comparar ambas matrices muestra cuánto reducen las respuestas la exposición.</div>`;
		if (view === "analisis") return `<div class="tip-box"><b>Incertidumbre vs. riesgo (AACE):</b> la variabilidad del estimado se trata con el análisis de <b>rangos</b> de Costos; aquí se gestionan los <b>eventos discretos</b>. La contingencia reúne ambos.</div>`;
		if (view === "plan") return `<div class="tip-box"><b>Sin escala universal:</b> el plan fija qué significa «impacto alto» para <i>este</i> proyecto. Ajusta las cotas al tamaño del presupuesto y del cronograma.</div>`;
		const s = (t) => strategiesFor(t).map((k) => `<div class="strat-box"><div class="st">${k.charAt(0).toUpperCase() + k.slice(1)}</div>${esc(STRATEGY_HINT[k])}</div>`).join("");
		return `<div class="tip-box"><b>Enunciado (PMBOK):</b> «Debido a <i>causa</i>, puede ocurrir <i>evento</i>, lo que causaría <i>efecto</i>».</div><h3 class="mt">Estrategias — amenazas</h3>${s("amenaza")}<h3 class="mt">Estrategias — oportunidades</h3>${s("oportunidad")}`;
	}
	function renderSidebar() {
		$("sidebar").innerHTML = statsBlock() + guideBlock();
	}
	function openRisk(id) {
		selectedId = id;
		expanded.add(id);
		view = "registro";
		render();
		const row = rowEl(id);
		if (row) row.scrollIntoView({ block: "center" });
	}
	function wireMain() {
		document.querySelectorAll("tr.rk-row").forEach((tr) => {
			const toggle = () => {
				const id = tr.dataset.id;
				if (expanded.has(id)) expanded.delete(id);
				else {
					expanded.add(id);
					selectedId = id;
				}
				render();
			};
			tr.addEventListener("click", toggle);
			tr.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggle();
				}
			});
		});
		document.querySelectorAll(".det-box").forEach((box) => {
			if (box.innerHTML.trim()) bindDetail(box);
		});
		const on = (id, fn) => {
			const b = document.getElementById(id);
			if (b) b.addEventListener("click", fn);
		};
		on("btnSort", () => {
			sortByScore = !sortByScore;
			render();
		});
		on("btnExpandAll", () => {
			risks.forEach((r) => expanded.add(r.id));
			render();
		});
		on("btnCollapseAll", () => {
			expanded.clear();
			render();
		});
		document.querySelectorAll("#mxGroup .btn").forEach((b) => b.addEventListener("click", () => {
			matrixWhich = b.dataset.w;
			render();
		}));
		document.querySelectorAll(".mx-chip, .lk").forEach((b) => b.addEventListener("click", () => openRisk(b.dataset.id)));
		document.querySelectorAll(".pi").forEach((el) => el.addEventListener("input", () => onPlanField(el)));
	}
	function addRisk(type) {
		const r = blankRisk(newId(), nextCode(risks), type);
		r.identifiedOn = todayISO();
		risks.push(r);
		selectedId = r.id;
		expanded.add(r.id);
		view = "registro";
		render();
		const row = rowEl(r.id);
		if (row) row.scrollIntoView({
			behavior: "smooth",
			block: "center"
		});
		setStatus((type === "amenaza" ? "Amenaza" : "Oportunidad") + " " + r.code + " agregada: completa su enunciado causa → evento → efecto.");
	}
	function deleteSelected() {
		const r = byId(selectedId || void 0);
		if (!r) return;
		showConfirm(`¿Eliminar el riesgo ${r.code} «${r.title || "sin título"}»? Esta acción no se puede deshacer.`).then((ok) => {
			if (!ok) return;
			const idx = risks.findIndex((x) => x.id === r.id);
			if (idx > -1) {
				expanded.delete(r.id);
				risks.splice(idx, 1);
			}
			selectedId = risks.length ? risks[Math.max(0, idx - 1)].id : null;
			render();
			setStatus("Riesgo eliminado.");
		});
	}
	function showModal({ title, message, confirmText, cancelText, danger }) {
		return new Promise((resolve) => {
			const overlay = $("modalOverlay"), confirmBtn = $("modalConfirmBtn"), cancelBtn = $("modalCancelBtn");
			$("modalTitle").textContent = title || "Confirmar";
			$("modalMessage").textContent = message || "";
			confirmBtn.textContent = confirmText || "Aceptar";
			confirmBtn.className = "btn" + (danger ? " danger" : " primary");
			cancelBtn.style.display = cancelText === null ? "none" : "";
			cancelBtn.textContent = cancelText || "Cancelar";
			const cleanup = (r) => {
				overlay.classList.remove("open");
				confirmBtn.onclick = null;
				cancelBtn.onclick = null;
				overlay.onclick = null;
				document.removeEventListener("keydown", onKey);
				resolve(r);
			};
			const onKey = (e) => {
				if (e.key === "Escape") {
					cleanup(false);
					return;
				}
				if (e.key === "Enter") {
					cleanup(true);
					return;
				}
				if (e.key !== "Tab") return;
				const f = Array.from(overlay.querySelectorAll("button")).filter((el) => el.offsetParent !== null);
				if (!f.length) return;
				const first = f[0], last = f[f.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			};
			confirmBtn.onclick = () => cleanup(true);
			cancelBtn.onclick = () => cleanup(false);
			overlay.onclick = (e) => {
				if (e.target === overlay) cleanup(false);
			};
			document.addEventListener("keydown", onKey);
			overlay.classList.add("open");
			confirmBtn.focus();
		});
	}
	function showConfirm(message, title) {
		return showModal({
			title: title || "Confirmar acción",
			message,
			confirmText: "Eliminar",
			cancelText: "Cancelar",
			danger: true
		});
	}
	function exportCsv() {
		const head = [
			"Codigo",
			"Titulo",
			"Tipo",
			"Categoria",
			"Propietario",
			"Estado",
			"Proximidad",
			"Probabilidad",
			"Impacto_Costo",
			"Impacto_Plazo",
			"Impacto_Alcance",
			"Puntaje",
			"Nivel",
			"Prob_efectiva_pct",
			"EV_Costo",
			"EV_Dias",
			"Actividades_Cronograma",
			"Efecto_Fin_Proyecto_Dias",
			"Estrategia",
			"Respuesta",
			"Disparador",
			"Resp_Respuesta",
			"Puntaje_Residual",
			"Nivel_Residual",
			"EV_Costo_Residual",
			"Paquetes_EDT",
			"Causa",
			"Evento",
			"Efecto",
			"Costo_Real",
			"Retraso_Real_Dias"
		];
		const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`;
		const lines = [head.join(",")];
		risks.forEach((r) => {
			const sc = inherentScore(r), ev = inherentEV(r, plan), res = residualOf(r, plan), pr = probEffective(r.probPct, r.prob, plan);
			const im = impactMean(r.timeImpact) !== null ? impactFor(r, "inherent") : null;
			lines.push([
				r.code,
				r.title,
				r.type,
				r.category,
				r.owner,
				STATUS_LABEL[r.status],
				r.proximity,
				r.prob,
				r.impCost,
				r.impTime,
				r.impScope,
				sc,
				levelOf(sc, plan),
				pr === null ? "" : Math.round(pr * 100),
				ev.cost === null ? "" : Math.round(ev.cost),
				ev.time === null ? "" : Math.round(ev.time * 10) / 10,
				im && im.mapped ? im.targets.map((t) => t.code).join(" ") : "",
				im && im.mapped && im.delay.likely !== null ? Math.round(im.delay.likely * 10) / 10 : "",
				r.strategy,
				r.response,
				r.trigger,
				r.responseOwner,
				res.assessed ? res.score : "",
				res.assessed ? levelOf(res.score, plan) : "",
				res.assessed && res.ev.cost !== null ? Math.round(res.ev.cost) : "",
				r.wbsIds.map(leafCode).join(" "),
				r.cause,
				r.event,
				r.effect,
				r.actualCost,
				r.actualDelay
			].map(q).join(","));
		});
		const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "registro_de_riesgos.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Registro exportado como CSV.");
	}
	function reportShell(docTitle, bodyHtml) {
		let el = document.getElementById("gpiReport");
		if (!el) {
			el = document.createElement("div");
			el.id = "gpiReport";
			document.body.appendChild(el);
		}
		let meta = {};
		try {
			const m = window.GPI && window.GPI.available() ? window.GPI.meta() : null;
			if (m) meta = m;
		} catch (_) {}
		const tEl = document.getElementById("projectTitle"), cEl = document.getElementById("courseTitle");
		const pName = tEl && tEl.value || meta.name || "Proyecto", course = cEl && cEl.value || meta.course || "Gestión de Proyectos de Ingeniería";
		const today = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
		el.innerHTML = "<div class=\"rep-head\"><div><h1>" + esc(docTitle) + "</h1><div class=\"sub\">" + esc(pName) + (meta.code ? " · " + esc(meta.code) : "") + "</div><div class=\"sub\" style=\"font-weight:500\">" + esc(course) + "</div></div><div class=\"rep-meta\">Registro de Riesgos<br>Emitido: " + esc(today) + "</div></div>" + bodyHtml;
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
		const pf = portfolio(risks, plan), rk = rankRisks(risks, plan);
		reportShell("Registro de Riesgos", "<h2>1. Resumen</h2><table class=\"rep-kv\"><tr><td>Riesgos registrados</td><td><b>" + pf.total + "</b> (" + pf.threats + " amenazas · " + pf.opportunities + " oportunidades)</td></tr><tr><td>Abiertos por nivel</td><td>Altos <b>" + pf.byLevel.alto + "</b> · Medios <b>" + pf.byLevel.medio + "</b> · Bajos <b>" + pf.byLevel.bajo + "</b> · Sin analizar <b>" + pf.byLevel.sin + "</b></td></tr><tr><td>Exposición esperada en costo (VE, AACE 44R-08)</td><td>Amenazas " + money(pf.evThreatCost) + " · oportunidades −" + money(pf.evOpportunityCost) + " · <b>neta " + money(pf.netEvCost) + "</b> · residual <b>" + money(pf.netResEvCost) + "</b></td></tr><tr><td>Materializados</td><td><b>" + pf.materialized + "</b> · impacto real " + money(pf.actualCost) + "</td></tr></table><h2>2. Registro de riesgos</h2><p class=\"rep-note\">Umbrales del plan: medio desde " + plan.thresholdMedium + " · alto desde " + plan.thresholdHigh + ". Puntaje = probabilidad × mayor impacto (1–5).</p><table><tr><th style=\"width:6%\">Cód.</th><th>Riesgo (causa → evento → efecto)</th><th style=\"width:9%\">Tipo</th><th style=\"width:11%\">Propietario</th><th style=\"width:8%\">Puntaje</th><th style=\"width:10%\">Estado</th></tr>" + (risks.map((r) => {
			const sc = inherentScore(r), lv = levelOf(sc, plan);
			return "<tr><td>" + esc(r.code) + "</td><td><b>" + esc(r.title) + "</b><br>" + esc(statement(r)) + "</td><td>" + (r.type === "amenaza" ? "Amenaza" : "Oportunidad") + "</td><td>" + esc(r.owner || "—") + "</td><td>" + (lv ? LV[lv] + " · " + sc : "—") + "</td><td>" + esc(STATUS_LABEL[r.status]) + "</td></tr>";
		}).join("") || "<tr><td colspan=\"6\" class=\"rep-note\">— Sin riesgos registrados —</td></tr>") + "</table><h2>3. Respuestas</h2><table><tr><th style=\"width:6%\">Cód.</th><th style=\"width:11%\">Estrategia</th><th>Acciones</th><th style=\"width:20%\">Disparador</th><th style=\"width:12%\">Responsable</th><th style=\"width:9%\">Residual</th></tr>" + (risks.filter((r) => r.strategy).map((r) => {
			const s = residualOf(r, plan);
			return "<tr><td>" + esc(r.code) + "</td><td>" + esc(r.strategy) + "</td><td>" + esc(r.response || "—") + "</td><td>" + esc(r.trigger || "—") + "</td><td>" + esc(r.responseOwner || r.owner || "—") + "</td><td>" + (s.assessed && s.score !== null ? (levelOf(s.score, plan) ? LV[levelOf(s.score, plan)] : "") + " · " + s.score : "—") + "</td></tr>";
		}).join("") || "<tr><td colspan=\"6\" class=\"rep-note\">— Sin respuestas definidas —</td></tr>") + "</table><h2>4. Prioridad de atención</h2><table><tr><th style=\"width:5%\">#</th><th style=\"width:7%\">Cód.</th><th>Riesgo</th><th style=\"width:12%\">Puntaje</th><th style=\"width:18%\">Proximidad</th></tr>" + (rk.slice(0, 10).map((r, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(r.code) + "</td><td>" + esc(r.title) + "</td><td>" + inherentScore(r) + "</td><td>" + esc(r.proximity ? PROXIMITY_LABEL[r.proximity] : "—") + "</td></tr>").join("") || "<tr><td colspan=\"5\" class=\"rep-note\">— Sin riesgos analizados —</td></tr>") + "</table>");
	}
	function wireToolbar() {
		$("btnAddThreat").addEventListener("click", () => addRisk("amenaza"));
		$("btnAddOpp").addEventListener("click", () => addRisk("oportunidad"));
		$("btnDelete").addEventListener("click", deleteSelected);
		document.querySelectorAll("#viewGroup .btn").forEach((b) => b.addEventListener("click", () => {
			view = b.dataset.view;
			render();
			$("mainArea").scrollTop = 0;
		}));
		$("btnExportCsv").addEventListener("click", exportCsv);
		$("btnReport").addEventListener("click", buildReport);
		$("btnPrint").addEventListener("click", () => window.print());
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el registro actual con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				refreshContext();
				loadSample();
				render();
				setStatus("Caso de ejemplo cargado.");
			});
		});
		$("btnReset").addEventListener("click", () => {
			showConfirm("Esto borrará todos los riesgos y el plan, y empezará un registro nuevo. ¿Continuar?", "Nuevo registro").then((ok) => {
				if (ok) {
					blankAnalysis();
					view = "registro";
					render();
					setStatus("Registro nuevo iniciado.");
				}
			});
		});
	}
	function refreshRoles() {
		const dl = $("dlRoles");
		dl.innerHTML = roles.map((r) => `<option value="${esc(r)}"></option>`).join("");
	}
	refreshContext();
	loadSample();
	wireToolbar();
	refreshRoles();
	render();
	(function gpiBridge() {
		if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
		const proj = window.GPI.active();
		const titleEl = $("projectTitle"), courseEl = $("courseTitle");
		let loadedProjectId = null, session = null, projectStale = false;
		function markProjectStale() {
			if (projectStale) return;
			projectStale = true;
			setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
			const b = document.getElementById("banner");
			if (b) {
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar los riesgos aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const data = () => ({
			plan,
			risks,
			idCounter
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("risks");
			if (p.meta) {
				if (p.meta.name) titleEl.value = p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			refreshContext();
			refreshRoles();
			const mod = p.modules && p.modules.risks;
			if (mod && (Array.isArray(mod.risks) && mod.risks.length || mod.plan)) {
				plan = normalizePlan(mod.plan);
				risks = (Array.isArray(mod.risks) ? mod.risks : []).map((o, i) => normalizeRisk(o, "rk" + (i + 1)));
				idCounter = Number(mod.idCounter) || risks.length + 1;
				selectedId = risks.length ? risks[0].id : null;
				expanded = /* @__PURE__ */ new Set();
				window.GPI.rebaseSession(session, data());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				blankAnalysis();
				render();
				setStatus("Proyecto sin riesgos todavía. Regístralos aquí, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "risks", "El registro de riesgos", data(), {
				name: titleEl.value,
				course: courseEl.value
			}, session, {
				setStatus,
				onStale: markProjectStale
			});
			session = r.session;
			return r.ok;
		}
		if (proj) pull();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
		});
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) {
				netDirty = true;
				render();
			}
		});
		window.GPI.onChange(() => {
			netDirty = true;
			const p = window.GPI.active();
			if (!p || !p.meta) return;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				if (document.hidden) {
					pull();
					return;
				}
				markProjectStale();
				return;
			}
			if (p.meta.name && document.activeElement !== titleEl) titleEl.value = p.meta.name;
			if (p.meta.course && document.activeElement !== courseEl) courseEl.value = p.meta.course;
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	})();
	function gpiBadge(name, pushFn) {
		const css = document.createElement("style");
		css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
		document.head.appendChild(css);
		const bar = document.createElement("div");
		bar.className = "gpi-badge";
		bar.innerHTML = "<span class=\"gpi-dot\"></span><span>Panel: <b>" + String(name || "—").replace(/</g, "&lt;") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		bar.querySelector("#gpiSyncBtn").addEventListener("click", () => {
			const ok = pushFn(), b = bar.querySelector("#gpiSyncBtn"), t = b.textContent;
			b.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
			setTimeout(() => {
				b.textContent = t;
			}, 1400);
		});
	}
	//#endregion
})();
