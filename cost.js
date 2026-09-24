(function() {
	//#region src/shared/cost-variance.ts
	var RANK$1 = {
		green: 0,
		amber: 1,
		red: 2
	};
	var isNum$1 = (v) => typeof v === "number" && isFinite(v);
	function levelOf(value, warn, esc) {
		if (!isNum$1(value)) return null;
		return value <= esc ? "red" : value <= warn ? "amber" : "green";
	}
	function validateThresholds(t) {
		const p = [];
		if (![
			t.cpiWarn,
			t.cpiEsc,
			t.cvWarn,
			t.cvEsc
		].every(isNum$1)) {
			p.push("todos los umbrales deben ser números");
			return p;
		}
		if (t.cpiEsc > t.cpiWarn) p.push("CPI: el umbral de escalamiento (" + t.cpiEsc.toFixed(2) + ") debe ser menor o igual que el de alerta (" + t.cpiWarn.toFixed(2) + ")");
		if (t.cvEsc > t.cvWarn) p.push("CV: el umbral de escalamiento (" + t.cvEsc.toFixed(2) + ") debe ser menor o igual que el de alerta (" + t.cvWarn.toFixed(2) + ")");
		if (t.cpiWarn > 1) p.push("CPI: una alerta por encima de 1,00 se dispararía con el proyecto por debajo del costo previsto");
		if (t.cvWarn > 0) p.push("CV: una alerta por encima de 0 se dispararía con el proyecto por debajo del costo previsto");
		return p;
	}
	function classifyVariance(cpi, cv, t) {
		const lc = levelOf(cpi, t.cpiWarn, t.cpiEsc), lv = levelOf(cv, t.cvWarn, t.cvEsc);
		const ls = [lc, lv].filter((x) => x !== null);
		if (!ls.length) return {
			evaluated: false,
			level: null,
			cpi: null,
			cv: null,
			response: [],
			changeRequestNeeded: false
		};
		const level = ls.reduce((a, b) => RANK$1[b] > RANK$1[a] ? b : a);
		return {
			evaluated: true,
			level,
			cpi: lc,
			cv: lv,
			response: level === "green" ? ["Dentro de tolerancia: continuar el monitoreo con la frecuencia del plan. No hay acción ni cambio que registrar."] : level === "amber" ? [
				"Analizar la causa raíz de la variación.",
				"Actualizar el pronóstico (EAC/ETC).",
				"Aplicar acciones correctivas dentro de la autoridad del director del proyecto. La línea base no cambia."
			] : [
				"Analizar la causa raíz y actualizar el pronóstico (EAC/ETC).",
				"Escalar al sponsor / CCB con el pronóstico actualizado.",
				"Decidir la respuesta: acción correctiva o preventiva dentro del plan; uso de la contingencia si el origen es un riesgo identificado dentro del alcance; o una solicitud de cambio SOLO si la respuesta exige modificar la línea base o comprometer la reserva de gestión.",
				"Una variación fuera de umbral no obliga por sí sola a registrar una orden de cambio."
			],
			changeRequestNeeded: false
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
	var DEFAULT_ITERATIONS = 1e4;
	var DEFAULT_SEED = 20260713;
	var DEFAULT_CORRELATION = .3;
	var num$1 = (v) => Number(v);
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
		if (!finite(l.ml) || num$1(l.ml) <= 0) p.push("el costo más probable debe ser mayor que cero");
		if (!finite(l.lowPct) || num$1(l.lowPct) > 0 || num$1(l.lowPct) < -100) p.push("el mínimo debe estar entre −100 % y 0 % del más probable");
		if (!finite(l.highPct) || num$1(l.highPct) < 0) p.push("el máximo debe ser 0 % o más sobre el más probable");
		return p;
	}
	function quantile$1(sorted, p) {
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
		const a = valid.map((l) => num$1(l.ml) * (1 + num$1(l.lowPct) / 100));
		const m = valid.map((l) => num$1(l.ml));
		const b = valid.map((l) => num$1(l.ml) * (1 + num$1(l.highPct) / 100));
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
			p[q] = quantile$1(sorted, q);
		});
		const curve = [];
		for (let q = 1; q <= 99; q++) curve.push(quantile$1(sorted, q));
		const eventsEV = evs.reduce((s, e) => s + e.sign * e.prob * (e.low + e.likely + e.high) / 3, 0);
		let schedule = null;
		if (sim && durs) {
			const sd2 = Float64Array.from(durs).sort(), pd = {};
			PERCENTILES.forEach((q) => {
				pd[q] = quantile$1(sd2, q);
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
	function contingencyAt(res, percentile) {
		const raw = (res.p[percentile] !== void 0 ? res.p[percentile] : NaN) - res.ml;
		return {
			amount: Math.max(0, raw),
			raw,
			covered: raw < 0
		};
	}
	function rangeAdvisories(lines, res, baseCost, classRange) {
		const out = [], ls = lines || [];
		if (!ls.length) {
			out.push("Define las partidas del análisis para calcular la contingencia.");
			return out;
		}
		const bad = ls.filter((l) => lineProblems(l).length);
		if (bad.length) out.push(bad.length + " partida(s) con datos inválidos quedan fuera de la simulación: " + bad.slice(0, 3).map((l) => l.name || l.id).join(", ") + (bad.length > 3 ? "…" : "") + ".");
		if (!res) return out;
		if (baseCost > 0 && Math.abs(res.ml - baseCost) / baseCost > .01) out.push("Las partidas suman " + Math.round(res.ml).toLocaleString("es-PE") + " (" + (res.ml / baseCost * 100).toFixed(1) + " % del costo base " + Math.round(baseCost).toLocaleString("es-PE") + "): la contingencia solo cubre lo que las partidas cubren.");
		const noBasis = ls.filter((l) => !String(l.basis || "").trim()).length;
		if (noBasis) out.push(noBasis + " de " + ls.length + " partida(s) sin fundamento del rango: cada rango debe justificarse en el Basis of Estimate.");
		const flat = ls.filter((l) => !lineProblems(l).length && num$1(l.lowPct) === 0 && num$1(l.highPct) === 0).length;
		if (flat === res.n && res.events === 0) out.push("Ninguna partida tiene incertidumbre (mín = más probable = máx): la contingencia resulta 0.");
		else if (flat) out.push(flat + " partida(s) sin incertidumbre (rango 0 %): se tratan como costo fijo.");
		if (res.correlation === 0) out.push("Correlación 0 %: las partidas se tratan como independientes y la dispersión del total se SUBESTIMA (los errores de estimación suelen ir en la misma dirección).");
		if (classRange && res.ml > 0) {
			const simHi = (res.p[90] - res.ml) / res.ml * 100;
			if (classRange.hi > 0 && simHi < classRange.hi * .4) out.push("El P90 queda a +" + simHi.toFixed(1) + " % del estimado base, mucho más estrecho que el rango típico de la clase (+" + classRange.hi + " %): revisa si los rangos por partida o la correlación son demasiado optimistas.");
		}
		return out;
	}
	//#endregion
	//#region src/shared/reserve-policy.ts
	var AUTH_LEVELS = [
		"pm",
		"ccb",
		"sponsor"
	];
	var AUTH_LABEL = {
		pm: "Director de Proyecto",
		ccb: "CCB",
		sponsor: "Sponsor"
	};
	var RANK = {
		pm: 1,
		ccb: 2,
		sponsor: 3
	};
	var DEFAULT_RESERVES = {
		pmLimit: null,
		ccbLimit: null,
		contAlertPct: null
	};
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = typeof v === "string" ? Number(v.trim().replace(/\s/g, "")) : v;
		return typeof n === "number" && isFinite(n) ? n : null;
	};
	function normalizeReserves(o) {
		const x = o && typeof o === "object" ? o : {};
		return {
			pmLimit: numOrNull(x.pmLimit),
			ccbLimit: numOrNull(x.ccbLimit),
			contAlertPct: numOrNull(x.contAlertPct)
		};
	}
	var hasTiers = (r) => !!r && (r.pmLimit !== null || r.ccbLimit !== null);
	function requiredLevel(policy, fund, amount) {
		if (fund !== "cont") return "sponsor";
		if (!hasTiers(policy)) return null;
		const p = policy, a = Math.abs(amount) || 0;
		if (p.pmLimit !== null && a <= p.pmLimit + 1e-9) return "pm";
		if (p.ccbLimit === null || a <= p.ccbLimit + 1e-9) return "ccb";
		return "sponsor";
	}
	function authLevelOf(o) {
		if (o.authLevel === "pm" || o.authLevel === "ccb" || o.authLevel === "sponsor") return o.authLevel;
		if (o.sponsorAuth) return "sponsor";
		const t = String(o.approver || "").toLowerCase();
		if (/sponsor|patrocin/.test(t)) return "sponsor";
		if (/\bccb\b|comit/.test(t)) return "ccb";
		if (/director|gerente de proyecto|jefe de proyecto|project manager|\bpm\b/.test(t)) return "pm";
		return null;
	}
	var levelCovers = (have, need) => need === null || have !== null && RANK[have] >= RANK[need];
	function tiersText(p, fmt) {
		const parts = [];
		if (p.pmLimit !== null) parts.push("hasta " + fmt(p.pmLimit) + ": " + AUTH_LABEL.pm);
		if (p.ccbLimit !== null) parts.push("hasta " + fmt(p.ccbLimit) + ": " + AUTH_LABEL.ccb);
		else if (p.pmLimit !== null) parts.push("por encima: " + AUTH_LABEL.ccb);
		if (p.ccbLimit !== null) parts.push("por encima: " + AUTH_LABEL.sponsor);
		return parts.join(" · ");
	}
	function contingencyAlert(available, initial, policy) {
		if (!policy || policy.contAlertPct === null || !(initial > 0)) return null;
		const pct = available / initial * 100;
		return {
			alert: pct < policy.contAlertPct - 1e-9,
			pct,
			threshold: policy.contAlertPct
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
	var STATUS_LABEL$1 = {
		identificado: "Identificado",
		analizado: "Analizado",
		con_respuesta: "Con respuesta",
		monitoreo: "En monitoreo",
		materializado: "Materializado",
		cerrado: "Cerrado"
	};
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
	var str$2 = (v) => v === null || v === void 0 ? "" : String(v);
	var arrNum = (v, def) => Array.isArray(v) && v.length === def.length && v.every((x) => toNum(x) !== null) ? v.map((x) => toNum(x)) : def.slice();
	function normalizePlan(p) {
		const o = p && typeof p === "object" ? p : {};
		const cats = Array.isArray(o.categories) ? o.categories.map(str$2).map((s) => s.trim()).filter(Boolean) : [];
		return {
			probPct: arrNum(o.probPct, DEFAULT_PLAN.probPct),
			costBandsPct: arrNum(o.costBandsPct, DEFAULT_PLAN.costBandsPct),
			timeBandsDays: arrNum(o.timeBandsDays, DEFAULT_PLAN.timeBandsDays),
			scopeDescriptors: Array.isArray(o.scopeDescriptors) && o.scopeDescriptors.length === 5 ? o.scopeDescriptors.map(str$2) : DEFAULT_PLAN.scopeDescriptors.slice(),
			thresholdMedium: toNum(o.thresholdMedium) ?? DEFAULT_PLAN.thresholdMedium,
			thresholdHigh: toNum(o.thresholdHigh) ?? DEFAULT_PLAN.thresholdHigh,
			reviewDays: toNum(o.reviewDays) ?? DEFAULT_PLAN.reviewDays,
			categories: cats.length ? cats : DEFAULT_PLAN.categories.slice(),
			methodology: str$2(o.methodology),
			reservePolicy: str$2(o.reservePolicy),
			roles: str$2(o.roles),
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
		const id = str$2(x.id) || fallbackId;
		return {
			id,
			code: str$2(x.code) || id,
			title: str$2(x.title),
			cause: str$2(x.cause),
			event: str$2(x.event),
			effect: str$2(x.effect),
			type,
			category: str$2(x.category),
			wbsIds: Array.isArray(x.wbsIds) ? x.wbsIds.map(str$2).filter(Boolean) : [],
			actIds: Array.isArray(x.actIds) ? x.actIds.map(str$2).filter(Boolean) : [],
			owner: str$2(x.owner),
			proximity: PROXIMITY.indexOf(str$2(x.proximity)) >= 0 ? str$2(x.proximity) : "",
			identifiedOn: str$2(x.identifiedOn),
			reviewedOn: str$2(x.reviewedOn),
			status,
			prob: toLevel(x.prob),
			impCost: toLevel(x.impCost),
			impTime: toLevel(x.impTime),
			impScope: toLevel(x.impScope),
			probPct: toNum(x.probPct),
			costImpact: range(x.costImpact),
			timeImpact: range(x.timeImpact),
			strategy: str$2(x.strategy),
			response: str$2(x.response),
			trigger: str$2(x.trigger),
			responseOwner: str$2(x.responseOwner),
			responseCost: toNum(x.responseCost),
			secondary: str$2(x.secondary),
			resProb: toLevel(x.resProb),
			resImpCost: toLevel(x.resImpCost),
			resImpTime: toLevel(x.resImpTime),
			resImpScope: toLevel(x.resImpScope),
			resProbPct: toNum(x.resProbPct),
			resCostImpact: range(x.resCostImpact),
			resTimeImpact: range(x.resTimeImpact),
			materializedOn: str$2(x.materializedOn),
			actualCost: toNum(x.actualCost),
			actualDelay: toNum(x.actualDelay),
			notes: str$2(x.notes)
		};
	}
	var isOpen = (r) => r.status !== "materializado" && r.status !== "cerrado";
	var toRiskRef = (r) => ({
		id: r.id,
		code: r.code,
		title: r.title,
		type: r.type,
		status: r.status
	});
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
	//#endregion
	//#region src/shared/risk-sample.ts
	var SAMPLE_PLAN = normalizePlan({
		methodology: "Identificación por talleres de expertos y revisión de lecciones aprendidas; análisis cualitativo con la matriz probabilidad × impacto del plan; cuantificación del valor esperado con rangos de tres puntos para los riesgos de costo ≥ 3; respuesta por estrategia; revisión mensual en la reunión de control.",
		reservePolicy: "La contingencia cubre la incertidumbre del estimado (análisis de rangos de Costos) y la exposición residual de los riesgos abiertos. La libera la instancia que corresponde al monto de cada orden (límites de abajo) y solo contra un riesgo del registro. La reserva de gestión (fuera de la línea base) solo se usa con autorización del sponsor. Si la contingencia disponible baja del umbral de alerta, el Director de Proyecto escala al sponsor.",
		reserves: {
			pmLimit: 5e4,
			ccbLimit: 25e4,
			contAlertPct: 25
		},
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
	//#endregion
	//#region src/shared/estimate-class.ts
	var CLASS_MATURITY = {
		5: [0, 2],
		4: [1, 15],
		3: [10, 40],
		2: [30, 75],
		1: [65, 100]
	};
	var MATURITY_ITEMS = [
		{
			key: "charter",
			label: "Acta de constitución",
			weight: 15,
			hint: "objetivos, restricciones y criterios de éxito definidos"
		},
		{
			key: "scope",
			label: "Alcance descompuesto",
			weight: 15,
			hint: "los entregables del enunciado del alcance están en la EDT"
		},
		{
			key: "requirements",
			label: "Requisitos trazados y con línea base",
			weight: 10,
			hint: "cada requisito con origen, paquete y criterio de aceptación; línea base congelada"
		},
		{
			key: "wbs",
			label: "EDT con paquetes de trabajo",
			weight: 5,
			hint: "el alcance está estructurado hasta paquetes"
		},
		{
			key: "activities",
			label: "Actividades definidas",
			weight: 15,
			hint: "cada paquete descompuesto en actividades con metrado y rendimiento"
		},
		{
			key: "pricing",
			label: "Precios unitarios cargados",
			weight: 30,
			hint: "estimado por metrado × precio unitario (no un estimado global)"
		},
		{
			key: "schedule",
			label: "Cronograma integrado",
			weight: 10,
			hint: "las actividades están enlazadas en una red (base del cronograma del estimado)"
		}
	];
	var clamp01 = (v) => isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
	function definitionMaturity(inp) {
		const items = MATURITY_ITEMS.map((m) => {
			const value = clamp01(inp[m.key]);
			return {
				key: m.key,
				label: m.label,
				hint: m.hint,
				weight: m.weight,
				value,
				points: value * m.weight
			};
		});
		const pct = items.reduce((s, i) => s + i.points, 0);
		return {
			pct,
			items,
			class: classForMaturity(pct)
		};
	}
	function classForMaturity(pct) {
		return pct >= CLASS_MATURITY[1][0] ? 1 : pct >= CLASS_MATURITY[2][0] ? 2 : pct >= CLASS_MATURITY[3][0] ? 3 : pct >= CLASS_MATURITY[4][0] ? 4 : 5;
	}
	function classAdvisory(chosen, pct) {
		const inferred = classForMaturity(pct), [lo, hi] = CLASS_MATURITY[chosen], p = Math.round(pct);
		if (chosen < inferred) return {
			level: "aviso",
			text: "La clase " + chosen + " supone una madurez de definición de " + lo + "–" + hi + " %; con los datos del proyecto se estima ≈ " + p + " %, que corresponde a la clase " + inferred + ". Declarar una clase más madura estrecha el rango de exactitud sin respaldo: completa la definición (actividades, precios, cronograma) o baja la clase."
		};
		if (chosen > inferred) return {
			level: "info",
			text: "Los datos del proyecto (≈ " + p + " % de madurez) permitirían la clase " + inferred + ": si el estimado ya tiene esa definición, puedes subirla; si no, la clase " + chosen + " es prudente."
		};
		return {
			level: "ok",
			text: "La clase " + chosen + " es coherente con la madurez estimada de la definición (≈ " + p + " %, rango de la clase " + lo + "–" + hi + " %)."
		};
	}
	function accuracyRange(estimate, lowPct, highPct) {
		return {
			min: estimate * (1 + lowPct / 100),
			max: estimate * (1 + highPct / 100)
		};
	}
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
	var fmtDays = (v) => v === null ? "—" : Math.round(v * 10) / 10 + " d";
	//#endregion
	//#region src/shared/change-orders.ts
	var FUND_CONT = "Contingencia";
	var FUND_MGMT = "Reserva de gestión";
	var CO_KIND_LABEL = {
		riesgo: "Riesgo materializado",
		imprevisto: "Trabajo imprevisto dentro del alcance",
		alcance: "Cambio de alcance"
	};
	var CO_KIND_HINT = {
		riesgo: "Un riesgo ya identificado en el registro de riesgos que ocurrió. Se atiende con la contingencia (dentro de la línea base); si no alcanza, otra fuente requiere autorización del sponsor.",
		imprevisto: "Trabajo necesario que no estaba identificado ni como actividad ni como riesgo, pero pertenece al alcance ya aprobado: NO es un cambio de alcance. Contingencia si estaba cubierto; si no, reserva de gestión con autorización del sponsor.",
		alcance: "Trabajo nuevo o distinto del alcance aprobado (p. ej. una ampliación pedida por el cliente): modifica el alcance y la línea base. No se financia con contingencia; la fuente sale de evaluar el cambio: reserva de gestión (si el sponsor la autoriza) o financiamiento adicional."
	};
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
	function orderEffect(o) {
		const a = num(o.cost), f = fundOf(o);
		if (f === "cont") return {
			dBac: 0,
			dContingency: -a,
			dMgmt: 0,
			dTotal: 0
		};
		if (f === "extra") return {
			dBac: a,
			dContingency: 0,
			dMgmt: 0,
			dTotal: a
		};
		return {
			dBac: a,
			dContingency: 0,
			dMgmt: -a,
			dTotal: 0
		};
	}
	function riskLinkProblems(o, risks) {
		if (!o.riskId) return ["vincula la orden con el riesgo del Registro de Riesgos que se materializó (si el evento no estaba en el Registro de Riesgos no es un riesgo materializado: clasifícalo como trabajo imprevisto dentro del alcance)"];
		const r = risks.find((x) => x.id === o.riskId);
		if (!r) return ["el riesgo vinculado" + (o.riskCode ? " (" + o.riskCode + ")" : "") + " no existe en el Registro de Riesgos (si el evento no estaba en el Registro de Riesgos no es un riesgo materializado: clasifícalo como trabajo imprevisto dentro del alcance)"];
		if (r.type !== "amenaza") return [r.code + " es una oportunidad: no genera una orden por riesgo materializado"];
		if (r.status !== "materializado") return ["el riesgo " + r.code + " figura como «" + r.status.replace("_", " ") + "» en el Registro de Riesgos: márcalo como Materializado (con su fecha e impacto real) antes de aprobar la orden"];
		return [];
	}
	function requiredAuthority(o, policy) {
		const f = fundOf(o);
		return f === "cont" && !hasTiers(policy) ? null : requiredLevel(policy, f, num(o.cost));
	}
	function validateApproval(o, orders, budget, risks, policy) {
		const p = [], f = fundOf(o), a = num(o.cost);
		if (o.kind === "riesgo" && Array.isArray(risks)) riskLinkProblems(o, risks).forEach((x) => p.push(x));
		const an = analyzeChangeOrders((orders || []).filter((x) => x !== o), budget);
		if (o.kind !== "riesgo" && o.kind !== "imprevisto" && o.kind !== "alcance") p.push("clasifica la orden: riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance");
		if (!a) p.push("el Δ costo debe ser distinto de cero");
		if (!String(o.approver || "").trim()) p.push("registra quién aprueba (CCB, sponsor…)");
		if (o.kind === "alcance" && f === "cont") p.push("un cambio de alcance no se financia con contingencia (la contingencia cubre riesgos identificados dentro del alcance de la línea base)");
		if ((f === "mgmt" || f === "extra") && !o.sponsorAuth) p.push("usar la reserva de gestión o fondos adicionales requiere la autorización expresa del sponsor");
		if (f === "cont" && hasTiers(policy)) {
			const need = requiredAuthority(o, policy), have = authLevelOf(o);
			if (!levelCovers(have, need)) p.push("según la política de reservas del plan de riesgos, una orden de " + Math.round(a) + " con cargo a contingencia la autoriza el " + AUTH_LABEL[need] + " (" + tiersText(policy, (n) => String(Math.round(n))) + ")" + (have ? "; la aprobación registrada es del " + AUTH_LABEL[have] : "; indica el nivel de autoridad con que se aprueba"));
		}
		if (f === "cont" && a > an.contingencyAvailable + 1e-9) p.push("excede la contingencia disponible (" + Math.round(an.contingencyAvailable) + ")");
		if (f === "mgmt" && a > an.mgmtAvailable + 1e-9) p.push("excede la reserva de gestión disponible (" + Math.round(an.mgmtAvailable) + ")");
		return p;
	}
	function contingencyByRisk(orders, risks) {
		const by = {};
		(orders || []).forEach((o) => {
			if (!o || !o.riskId) return;
			const ref = (risks || []).find((r) => r.id === o.riskId);
			const d = by[o.riskId] = by[o.riskId] || {
				riskId: o.riskId,
				code: ref ? ref.code : o.riskCode || "?",
				title: ref ? ref.title : "(riesgo eliminado del registro)",
				orphan: !ref,
				contingency: 0,
				other: 0,
				pending: 0,
				orderIds: [],
				plannedMax: ref && ref.plannedMax != null ? ref.plannedMax : null,
				over: false
			};
			d.orderIds.push(String(o.id || ""));
			const a = num(o.cost);
			if (o.status === "Aprobada") {
				if (fundOf(o) === "cont") d.contingency += a;
				else d.other += a;
			} else if (o.status === "Pendiente") d.pending += a;
		});
		return Object.keys(by).map((k) => {
			const d = by[k];
			d.over = d.plannedMax !== null && d.contingency + d.other > d.plannedMax + 1e-9;
			return d;
		}).sort((a, b) => a.code.localeCompare(b.code));
	}
	function planBaselining(o, orders, budget, log, date) {
		if (o.status !== "Aprobada") return {
			ok: false,
			problem: "solo se incorpora a la línea base una orden Aprobada"
		};
		if (fundOf(o) === "cont") return {
			ok: false,
			problem: "una orden financiada con contingencia no cambia la línea base: la contingencia ya está dentro de ella"
		};
		if (o.baselined) return {
			ok: false,
			problem: "ya está incorporada a la línea base " + o.baselined
		};
		const a = num(o.cost);
		if (a <= 0) return {
			ok: false,
			problem: "el Δ costo debe ser mayor que cero para incorporarse a la línea base"
		};
		const before = analyzeChangeOrders(orders, budget).bacCurrent;
		return {
			ok: true,
			entry: {
				version: "LB-" + ((log || []).length + 1),
				date,
				orderIds: [String(o.id || "")],
				bacBefore: before,
				bacAfter: before + a,
				approver: String(o.approver || "")
			}
		};
	}
	//#endregion
	//#region src/shared/escalation.ts
	var ACCOUNT_IDS = [
		"labor",
		"material",
		"equipment",
		"subcontract"
	];
	var ACCOUNT_LABEL = {
		labor: "Mano de obra",
		material: "Materiales",
		equipment: "Equipos",
		subcontract: "Subcontratos"
	};
	var PROVISIONS = [
		"central",
		"p50",
		"p70",
		"p80",
		"p90"
	];
	var PROVISION_LABEL = {
		central: "Pronóstico central (determinístico)",
		p50: "P50 de la simulación",
		p70: "P70 de la simulación",
		p80: "P80 de la simulación",
		p90: "P90 de la simulación"
	};
	var DEFAULT_MIX = {
		labor: 35,
		material: 35,
		equipment: 15,
		subcontract: 15
	};
	var WORK_TO_CALENDAR = 7 / 5;
	var isObj$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
	var numOr = (v, d) => {
		if (v === null || v === void 0 || v === "" || typeof v === "boolean") return d;
		const n = Number(v);
		return isFinite(n) ? n : d;
	};
	var ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
	var DAY = 864e5;
	function dayNum(iso) {
		const m = ISO.exec(String(iso || ""));
		if (!m) return null;
		const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
		return isFinite(t) && new Date(t).getUTCMonth() === +m[2] - 1 ? Math.round(t / DAY) : null;
	}
	var isoOfDay = (n) => (/* @__PURE__ */ new Date(n * DAY)).toISOString().slice(0, 10);
	var cleanMix = (v) => {
		if (!isObj$1(v)) return void 0;
		const out = {};
		let any = false;
		ACCOUNT_IDS.forEach((id) => {
			const n = numOr(v[id], 0);
			if (n > 0) {
				out[id] = n;
				any = true;
			}
		});
		return any ? out : void 0;
	};
	function blankEscPlan() {
		return {
			method: "indices",
			baseDate: "",
			accounts: ACCOUNT_IDS.map((id) => ({
				id,
				rates: {},
				source: "",
				low: 0,
				high: 0
			})),
			defaultMix: { ...DEFAULT_MIX },
			packages: {},
			onContingency: true,
			provision: "central",
			correlation: .5
		};
	}
	function normalizeEscPlan(raw, baseDate = "") {
		const p = blankEscPlan();
		p.baseDate = baseDate;
		if (!isObj$1(raw)) return p;
		p.method = raw.method === "indices" ? "indices" : "simple";
		const accs = Array.isArray(raw.accounts) ? raw.accounts.filter(isObj$1) : [];
		p.accounts = ACCOUNT_IDS.map((id) => {
			const a = accs.find((x) => x.id === id) || {}, rates = {};
			if (isObj$1(a.rates)) Object.keys(a.rates).forEach((y) => {
				const n = numOr(a.rates && a.rates[y], NaN);
				if (/^\d{4}$/.test(y) && isFinite(n) && a.rates[y] !== "") rates[y] = n;
			});
			const low = Math.min(0, numOr(a.low, 0)), high = Math.max(0, numOr(a.high, 0));
			return {
				id,
				rates,
				source: String(a.source == null ? "" : a.source),
				low,
				high
			};
		});
		const dm = cleanMix(raw.defaultMix);
		if (dm) p.defaultMix = dm;
		if (isObj$1(raw.packages)) Object.keys(raw.packages).forEach((k) => {
			const o = raw.packages && raw.packages[k];
			if (!isObj$1(o)) return;
			const ov = {}, mix = cleanMix(o.mix);
			if (mix) ov.mix = mix;
			if (typeof o.lock === "string" && dayNum(o.lock) !== null) ov.lock = o.lock;
			if (ov.mix || ov.lock) p.packages[k] = ov;
		});
		p.onContingency = raw.onContingency !== false;
		p.provision = PROVISIONS.indexOf(raw.provision) >= 0 ? raw.provision : "central";
		p.correlation = Math.max(0, Math.min(1, numOr(raw.correlation, .5)));
		return p;
	}
	var simpleEscalation = (base, ratePct, years) => base * (Math.pow(1 + ratePct / 100, years) - 1);
	var fxExposure = (base, sharePct, bandPct, floating) => floating ? base * (sharePct / 100) * (bandPct / 100) : 0;
	function yearSegs(baseDay, lastDay) {
		const out = [], y0 = (/* @__PURE__ */ new Date(baseDay * DAY)).getUTCFullYear(), y1 = (/* @__PURE__ */ new Date(lastDay * DAY)).getUTCFullYear();
		for (let y = y0; y <= y1; y++) {
			const s = Date.UTC(y, 0, 1) / DAY, e = Date.UTC(y + 1, 0, 1) / DAY;
			out.push({
				y,
				start: Math.max(0, s - baseDay),
				end: e - baseDay,
				days: e - s
			});
		}
		return out;
	}
	function rateFor(rates, y) {
		const ys = Object.keys(rates).map(Number).sort((a, b) => a - b);
		if (!ys.length) return null;
		if (rates[String(y)] !== void 0) return rates[String(y)];
		let prev = null;
		ys.forEach((k) => {
			if (k < y) prev = k;
		});
		return rates[String(prev === null ? ys[0] : prev)];
	}
	var lnGrowth = (ratePct, delta) => Math.log(Math.max(.01, 1 + (ratePct + delta) / 100));
	function lnIndex(g, segs, x) {
		let s = 0;
		for (let i = 0; i < segs.length; i++) {
			const sg = segs[i];
			if (x <= sg.start) break;
			s += g[i] * (Math.min(x, sg.end) - sg.start) / sg.days;
		}
		return s;
	}
	var monthEnd = (day) => {
		const d = /* @__PURE__ */ new Date(day * DAY);
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY;
	};
	function buildKernel(plan, pkgsIn, maxShiftDays) {
		const adv = [], pkgs = pkgsIn.filter((p) => isFinite(p.cost) && p.cost > 0);
		const baseDay = dayNum(plan.baseDate);
		if (baseDay === null) {
			adv.push({
				code: "X1",
				severity: "riesgo",
				text: "Falta la fecha base de precios (pestaña 02, Basis of Estimate): sin ella no se puede calcular la escalación por índices, que mide el cambio de precio DESDE esa fecha."
			});
			return {
				k: null,
				adv
			};
		}
		const accs = plan.accounts.filter((a) => Object.keys(a.rates).length > 0);
		if (!accs.length) {
			adv.push({
				code: "X2",
				severity: "riesgo",
				text: "Ninguna cuenta de costo tiene pronóstico de índice: la escalación por índices necesita la tasa anual esperada de cada cuenta (dato de un economista o de una fuente reconocida, no una extrapolación)."
			});
			return {
				k: null,
				adv
			};
		}
		if (!pkgs.length) {
			adv.push({
				code: "X7",
				severity: "riesgo",
				text: "No hay paquetes con costo y fechas del cronograma: la escalación por índices reparte el costo en el tiempo y necesita saber cuándo se gasta."
			});
			return {
				k: null,
				adv
			};
		}
		const datedIdx = [], span = pkgs.map((p) => {
			const s = dayNum(p.start), e = dayNum(p.end);
			return s !== null && e !== null && e >= s ? {
				s,
				e
			} : null;
		});
		span.forEach((s, i) => {
			if (s) datedIdx.push(i);
		});
		if (!datedIdx.length) {
			adv.push({
				code: "X7",
				severity: "riesgo",
				text: "Ningún paquete tiene fechas en el cronograma: define las actividades y sus enlaces (Cronograma/CPM) para repartir el costo en el tiempo."
			});
			return {
				k: null,
				adv
			};
		}
		const totDated = datedIdx.reduce((s, i) => s + pkgs[i].cost, 0);
		const mid = datedIdx.reduce((s, i) => s + pkgs[i].cost * (span[i].s + span[i].e) / 2, 0) / totDated;
		const undated = pkgs.filter((_, i) => !span[i]).map((p) => p.code || p.name);
		const buckets = [];
		const lockOf = (p) => {
			const o = plan.packages[p.id], d = o && o.lock ? dayNum(o.lock) : null;
			return d === null ? Infinity : d - baseDay;
		};
		pkgs.forEach((p, i) => {
			const lock = lockOf(p), sp = span[i];
			if (!sp) {
				buckets.push({
					p: i,
					x: mid - baseDay,
					w: 1,
					lock
				});
				return;
			}
			const len = sp.e - sp.s + 1;
			for (let d0 = sp.s; d0 <= sp.e;) {
				const d1 = Math.min(sp.e + 1, monthEnd(d0));
				buckets.push({
					p: i,
					x: (d0 + d1) / 2 - baseDay - .5,
					w: (d1 - d0) / len,
					lock
				});
				d0 = d1;
			}
		});
		const xs = buckets.map((b) => b.x);
		const x0 = Math.min(...xs), x1 = Math.max(...xs);
		const segs = yearSegs(baseDay, baseDay + Math.max(0, x1) + Math.max(0, maxShiftDays) + 366);
		const mix = pkgs.map((p) => {
			const o = plan.packages[p.id], m = o && o.mix || plan.defaultMix, tot = ACCOUNT_IDS.reduce((s, id) => s + Math.max(0, m[id] || 0), 0);
			return accs.map((a) => tot > 0 ? Math.max(0, m[a.id] || 0) / tot : 1 / ACCOUNT_IDS.length);
		});
		return {
			k: {
				baseDay,
				segs,
				accs,
				buckets,
				cost: pkgs.map((p) => p.cost),
				mix,
				x0,
				x1,
				total: pkgs.reduce((s, p) => s + p.cost, 0),
				pkgs,
				undated,
				baseYear: (/* @__PURE__ */ new Date(baseDay * DAY)).getUTCFullYear()
			},
			adv
		};
	}
	function evalKernel(k, delta, delayCal, detail) {
		const A = k.accs.length, g = k.accs.map((a, ai) => k.segs.map((s) => lnGrowth(rateFor(a.rates, s.y), delta ? delta[ai] : 0)));
		const byAcc = new Array(A).fill(0), byPkg = detail ? new Array(k.pkgs.length).fill(0) : [], byYear = {};
		let total = 0, mw = 0, mc = 0;
		const span = k.x1 - k.x0;
		for (let b = 0; b < k.buckets.length; b++) {
			const bk = k.buckets[b], c = k.cost[bk.p] * bk.w;
			let xe = bk.x;
			if (delayCal !== 0) xe += delayCal * (span > 0 ? Math.min(1, Math.max(0, (bk.x - k.x0) / span)) : 1);
			if (xe > bk.lock) xe = bk.lock;
			if (xe < 0) xe = 0;
			let e = 0;
			for (let a = 0; a < A; a++) {
				const w = k.mix[bk.p][a];
				if (w > 0) {
					const v = c * w * (Math.exp(lnIndex(g[a], k.segs, xe)) - 1);
					byAcc[a] += v;
					e += v;
				}
			}
			total += e;
			if (detail) {
				byPkg[bk.p] += e;
				const yr = (/* @__PURE__ */ new Date((k.baseDay + bk.x) * DAY)).getUTCFullYear(), y = byYear[yr] || (byYear[yr] = {
					base: 0,
					esc: 0
				});
				y.base += c;
				y.esc += e;
				mw += c * bk.x;
				mc += c;
			}
		}
		return {
			total,
			byAcc,
			byPkg,
			byYear,
			midX: mc > 0 ? mw / mc : 0
		};
	}
	var emptyResult = (adv, base) => ({
		ok: false,
		base,
		esc: 0,
		factor: 0,
		advisories: adv,
		byAccount: [],
		byPackage: [],
		byYear: [],
		midDate: null,
		horizonYears: [],
		undated: []
	});
	function horizonYears(baseDate, pkgs) {
		const b = dayNum(baseDate);
		if (b === null) return [];
		const y0 = (/* @__PURE__ */ new Date(b * DAY)).getUTCFullYear();
		let y1 = y0 + 1;
		pkgs.forEach((p) => {
			const e = dayNum(p.end);
			if (e !== null) y1 = Math.max(y1, (/* @__PURE__ */ new Date(e * DAY)).getUTCFullYear());
		});
		const out = [];
		for (let y = y0; y <= y1 + 1; y++) out.push(y);
		return out;
	}
	function escalate(plan, pkgs) {
		const base = pkgs.reduce((s, p) => s + (isFinite(p.cost) && p.cost > 0 ? p.cost : 0), 0);
		const { k, adv } = buildKernel(plan, pkgs, 0);
		if (!k) return emptyResult(adv, base);
		const r = evalKernel(k, null, 0, true), advisories = adv.slice();
		const totalDated = k.total;
		const accBase = k.accs.map((_, ai) => k.pkgs.reduce((s, p, pi) => s + p.cost * k.mix[pi][ai], 0));
		const lockDay = (p) => {
			const o = plan.packages[p.id];
			return o && o.lock ? dayNum(o.lock) : null;
		};
		const byPackage = k.pkgs.map((p, i) => {
			const l = lockDay(p), e = dayNum(p.end);
			return {
				id: p.id,
				code: p.code,
				name: p.name,
				cost: p.cost,
				esc: r.byPkg[i],
				pct: p.cost > 0 ? r.byPkg[i] / p.cost * 100 : 0,
				from: p.start,
				to: p.end,
				lock: l !== null ? isoOfDay(l) : null,
				locked: l !== null && (e === null || l < e),
				undated: k.undated.indexOf(p.code || p.name) >= 0
			};
		});
		if (k.undated.length) advisories.push({
			code: "X6",
			severity: "aviso",
			text: k.undated.length + " paquete(s) sin fechas en el cronograma (" + k.undated.slice(0, 4).join(", ") + (k.undated.length > 4 ? "…" : "") + "): se ubican en la fecha media del gasto del proyecto."
		});
		const weight = (p, id) => {
			const o = plan.packages[p.id];
			return (o && o.mix || plan.defaultMix)[id] || 0;
		};
		const noRates = plan.accounts.filter((a) => !Object.keys(a.rates).length && k.pkgs.some((p) => weight(p, a.id) > 0));
		if (noRates.length) advisories.push({
			code: "X3",
			severity: "aviso",
			text: "Con peso en la composición pero sin pronóstico de índice: " + noRates.map((a) => ACCOUNT_LABEL[a.id]).join(", ") + ". Esa parte del costo NO se escala: completa el pronóstico o ajusta la composición."
		});
		const noSrc = k.accs.filter((a) => !a.source.trim());
		if (noSrc.length) advisories.push({
			code: "X5",
			severity: "aviso",
			text: "Sin fuente del pronóstico: " + noSrc.map((a) => ACCOUNT_LABEL[a.id]).join(", ") + ". 58R-10 recomienda que los índices provengan de un economista o de una fuente reconocida y que se documenten; no extrapoles tendencias pasadas."
		});
		const lastSpendYear = (/* @__PURE__ */ new Date((k.baseDay + k.x1) * DAY)).getUTCFullYear();
		const short = k.accs.filter((a) => Math.max(...Object.keys(a.rates).map(Number)) < lastSpendYear);
		if (short.length) advisories.push({
			code: "X4",
			severity: "aviso",
			text: "El pronóstico de " + short.map((a) => ACCOUNT_LABEL[a.id]).join(", ") + " no llega al último año de gasto (" + lastSpendYear + "): se mantiene su última tasa."
		});
		if (k.x0 < 0) advisories.push({
			code: "X11",
			severity: "aviso",
			text: "Hay gasto anterior a la fecha base de precios: ese tramo no se escala. La fecha base debe ser la de los precios del estimado y no posterior al primer gasto."
		});
		const lockedEarly = byPackage.filter((p) => p.lock && dayNum(p.lock) !== null && dayNum(p.lock) < k.baseDay);
		if (lockedEarly.length) advisories.push({
			code: "X15",
			severity: "info",
			text: "Precio fijado antes de la fecha base en " + lockedEarly.map((p) => p.code).join(", ") + ": no tienen escalación."
		});
		return {
			ok: true,
			base: totalDated,
			esc: r.total,
			factor: totalDated > 0 ? r.total / totalDated : 0,
			advisories,
			byAccount: k.accs.map((a, ai) => ({
				id: a.id,
				label: ACCOUNT_LABEL[a.id],
				base: accBase[ai],
				esc: r.byAcc[ai],
				pct: accBase[ai] > 0 ? r.byAcc[ai] / accBase[ai] * 100 : 0
			})),
			byPackage,
			byYear: Object.keys(r.byYear).map(Number).sort((a, b) => a - b).map((y) => ({
				year: y,
				base: r.byYear[y].base,
				esc: r.byYear[y].esc
			})),
			midDate: isoOfDay(Math.round(k.baseDay + r.midX)),
			horizonYears: horizonYears(plan.baseDate, pkgs),
			undated: k.undated
		};
	}
	function quantile(sorted, p) {
		const pos = (sorted.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
		return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
	}
	function simulateEscalation(plan, pkgs, o = {}) {
		const N = Math.max(1e3, Math.min(2e5, Math.floor(Number(o.iterations) || 1e4))), seed = typeof o.seed === "number" && isFinite(o.seed) ? o.seed : DEFAULT_SEED;
		const w2c = o.workToCalendar && o.workToCalendar > 0 ? o.workToCalendar : WORK_TO_CALENDAR;
		const dl = o.delaysWork && o.delaysWork.length === N ? o.delaysWork : null;
		let maxDelay = 0;
		if (dl) {
			for (let i = 0; i < N; i++) if (dl[i] * w2c > maxDelay) maxDelay = dl[i] * w2c;
		}
		const { k } = buildKernel(plan, pkgs, maxDelay);
		if (!k) return null;
		const det = evalKernel(k, null, 0, false).total / k.total;
		const rho = plan.correlation, sr = Math.sqrt(rho), se = Math.sqrt(1 - rho), A = k.accs.length;
		const rand = mulberry32((seed ^ 2654435769) >>> 0);
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
		const out = new Float64Array(N), delta = new Array(A).fill(0), delays = dl ? new Float64Array(N) : null;
		let sum = 0, below = 0;
		for (let i = 0; i < N; i++) {
			const zc = normal();
			for (let a = 0; a < A; a++) {
				const z = normal(), acc = k.accs[a];
				const lo = Math.min(0, acc.low), hi = Math.max(0, acc.high);
				delta[a] = hi > lo ? triInv(normCdf(sr * zc + se * z), lo, 0, hi) : 0;
			}
			const d = dl ? dl[i] * w2c : 0;
			if (delays) delays[i] = d;
			const f = evalKernel(k, delta, d, false).total / k.total;
			out[i] = f;
			sum += f;
			if (f <= det + 1e-12) below++;
		}
		const mean = sum / N;
		let ss = 0;
		for (let i = 0; i < N; i++) ss += (out[i] - mean) * (out[i] - mean);
		const sd = Math.sqrt(ss / N);
		const sorted = Float64Array.from(out).sort();
		const p = {};
		PERCENTILES.forEach((q) => {
			p[q] = quantile(sorted, q);
		});
		const curve = [];
		for (let q = 1; q <= 99; q++) curve.push(quantile(sorted, q));
		let dMean = 0, dP80 = 0;
		if (delays) {
			dMean = delays.reduce((s, x) => s + x, 0) / N;
			dP80 = quantile(Float64Array.from(delays).sort(), 80);
		}
		return {
			iterations: N,
			seed,
			correlation: rho,
			mean,
			sd,
			min: sorted[0],
			max: sorted[N - 1],
			p,
			curve,
			det,
			probAtOrBelowDet: below / N,
			withDelay: !!dl,
			delayMeanCal: dMean,
			delayP80Cal: dP80,
			uncertainAccounts: k.accs.filter((a) => Math.max(0, a.high) > Math.min(0, a.low)).length
		};
	}
	function provisionFactor(plan, res, sim) {
		if (plan.provision === "central" || !sim) return {
			factor: res.factor,
			label: plan.provision === "central" ? "pronóstico central" : "pronóstico central (sin simulación)"
		};
		const q = Number(plan.provision.slice(1));
		return {
			factor: sim.p[q],
			label: "P" + q + " de la simulación"
		};
	}
	function escalationAdvisories(plan, res, sim, ctx = {}) {
		const out = res.advisories.slice();
		if (sim) {
			if (!sim.uncertainAccounts) out.push({
				code: "X9",
				severity: "info",
				text: "Sin incertidumbre definida en los índices (mín = máx = 0): la simulación solo refleja el retraso del cronograma. 68R-11 pide que el estimador cuantifique la incertidumbre de la escalación (una distribución o un rango P10/P90)."
			});
			if (!sim.withDelay) out.push({
				code: "X10",
				severity: "info",
				text: "La simulación no incluye el retraso del cronograma (no hay eventos de riesgo con impacto en plazo ubicados en actividades): la escalación crece con el atraso, y esa variable queda fuera."
			});
		}
		if (!plan.onContingency) out.push({
			code: "X12",
			severity: "info",
			text: "La contingencia no se escala. 58R-10 trata «Escalation on Contingency» como un tema propio: la contingencia también se gasta en el futuro."
		});
		const rk = (ctx.riskTitles || []).filter((t) => /precio|inflaci|escalaci|costo de (los )?materiales|acero|combustible/i.test(t));
		if (rk.length) out.push({
			code: "X14",
			severity: "info",
			text: "Riesgo(s) del registro que podrían solaparse con la escalación (" + rk.slice(0, 2).join("; ") + "): la contingencia excluye la escalación (58R-10). Define en la BOE qué cubre cada cuenta: la tendencia general de precios va aquí; el evento específico (p. ej. un choque de suministro) solo por lo que exceda esa tendencia."
		});
		return out;
	}
	function simpleMethodAdvisory(classNum) {
		return classNum !== void 0 && classNum <= 3 ? {
			code: "X13",
			severity: "aviso",
			text: "El método simple usa UNA tasa y UN punto de gasto: solo es razonable en estimados de orden de magnitud (clases 4–5). Con un estimado de clase " + classNum + " usa la escalación por índices (58R-10)."
		} : null;
	}
	//#endregion
	//#region src/shared/escalation-sample.ts
	var SAMPLE_BASE_DATE = "2026-07-01";
	var SAMPLE_ESC_SOURCE = "Ejemplo DISTRIB+ — valores ILUSTRATIVOS (reemplazar por el pronóstico de un economista o de una fuente reconocida de índices de construcción).";
	var SAMPLE_ESC_ACCOUNTS = {
		labor: {
			rates: {
				"2026": 3,
				"2027": 3.3,
				"2028": 3
			},
			low: -1,
			high: 1.5
		},
		material: {
			rates: {
				"2026": 2,
				"2027": 2.5,
				"2028": 2
			},
			low: -1,
			high: 3
		},
		equipment: {
			rates: {
				"2026": 1.8,
				"2027": 2.2,
				"2028": 2.2
			},
			low: -.5,
			high: 1.5
		},
		subcontract: {
			rates: {
				"2026": 2.6,
				"2027": 3,
				"2028": 2.6
			},
			low: -1,
			high: 2
		}
	};
	var SAMPLE_ESC_DEFAULT_MIX = {
		labor: 35,
		material: 35,
		equipment: 15,
		subcontract: 15
	};
	var SAMPLE_ESC_MIX = {
		"1.1": { labor: 100 },
		"1.2": { labor: 100 },
		"1.3": { labor: 100 },
		"2.1": { labor: 100 },
		"2.2": { labor: 100 },
		"2.3": { labor: 100 },
		"2.4": { labor: 100 },
		"3.1": {
			material: 80,
			labor: 20
		},
		"3.2": { material: 100 },
		"3.3": { equipment: 100 },
		"4.1": {
			labor: 35,
			equipment: 45,
			subcontract: 20
		},
		"4.2": {
			material: 45,
			labor: 35,
			equipment: 10,
			subcontract: 10
		},
		"4.3": {
			labor: 30,
			equipment: 15,
			subcontract: 55
		},
		"4.4": {
			material: 40,
			labor: 40,
			subcontract: 20
		},
		"4.5": { subcontract: 100 },
		"5.1": { labor: 100 },
		"5.2": { labor: 100 },
		"5.3": { labor: 100 }
	};
	var SAMPLE_ESC_LOCKS = {
		"3.1": "2026-09-15",
		"3.3": "2026-09-28"
	};
	function buildSampleEscPlan(resolve) {
		const packages = {};
		Object.keys(SAMPLE_ESC_MIX).forEach((code) => {
			const id = resolve(code);
			if (id) packages[id] = { mix: SAMPLE_ESC_MIX[code] };
		});
		Object.keys(SAMPLE_ESC_LOCKS).forEach((code) => {
			const id = resolve(code);
			if (id) packages[id] = {
				...packages[id] || {},
				lock: SAMPLE_ESC_LOCKS[code]
			};
		});
		return normalizeEscPlan({
			method: "indices",
			accounts: ACCOUNT_IDS.map((id) => ({
				id,
				rates: SAMPLE_ESC_ACCOUNTS[id].rates,
				source: SAMPLE_ESC_SOURCE,
				low: SAMPLE_ESC_ACCOUNTS[id].low,
				high: SAMPLE_ESC_ACCOUNTS[id].high
			})),
			defaultMix: SAMPLE_ESC_DEFAULT_MIX,
			packages,
			onContingency: true,
			provision: "p70",
			correlation: .5
		}, SAMPLE_BASE_DATE);
	}
	//#endregion
	//#region src/shared/boe.ts
	var STATUS_LABEL = {
		borrador: "Borrador",
		revision: "En revisión",
		aprobada: "Aprobada"
	};
	var STATUSES = [
		"borrador",
		"revision",
		"aprobada"
	];
	var GROUPS = [
		{
			id: "g1",
			title: "3.1 Generalidades"
		},
		{
			id: "g2",
			title: "3.2 Metodología"
		},
		{
			id: "g3",
			title: "3.3 Base de diseño y 3.4 Cantidades"
		},
		{
			id: "g5",
			title: "3.5 Costos y 3.6 Planificación"
		},
		{
			id: "g7",
			title: "3.7 a 3.9 Materiales, mano de obra y demolición"
		},
		{
			id: "g8",
			title: "3.10 a 3.13 Asignaciones, supuestos, exclusiones y excepciones"
		},
		{
			id: "g9",
			title: "3.14 a 3.17 Riesgos y reservas"
		},
		{
			id: "g10",
			title: "3.18 a 3.22 Conciliación, calidad, equipo y anexos"
		}
	];
	var SECTIONS = [
		{
			id: "3.1.1",
			group: "g1",
			from: 5,
			title: "Propósito",
			en: "Purpose",
			keys: ["purpose"],
			hint: "Para qué se prepara el estimado: estudio de costos, opciones, financiamiento, autorización de presupuesto…",
			placeholder: "Ej. Sustentar el presupuesto de autorización y servir de base del control de cambios."
		},
		{
			id: "3.1.2",
			group: "g1",
			from: 4,
			title: "Objetivos del proyecto y del estimado",
			en: "Project and Estimate Objectives",
			keys: ["objectives"],
			hint: "Qué busca el proyecto y qué decisión debe soportar el estimado."
		},
		{
			id: "3.1.3",
			group: "g1",
			from: 5,
			title: "Descripción del alcance del proyecto",
			en: "Project Scope Description",
			keys: ["scope"],
			auto: "scope",
			hint: "El alcance que cubre el estimado (viene del Enunciado del Alcance). La BOE es el entregable que lo define y la base del control de cambios."
		},
		{
			id: "3.1.4",
			group: "g1",
			from: 3,
			title: "Resumen del plan de ejecución",
			en: "Project Execution Plan Summary",
			keys: ["execution"],
			auto: "execution",
			hint: "Estrategia de contratación, secuencia y fases, jornadas y turnos, hitos que condicionan el costo."
		},
		{
			id: "3.1.5",
			group: "g1",
			from: 3,
			title: "Parámetros de construcción, fabricación y operación",
			en: "Construction, Fabrication, and Operating Parameters",
			keys: ["parameters"],
			hint: "Condiciones del sitio, accesos, restricciones de horario, ubicación, clima, servicios provisionales."
		},
		{
			id: "3.1.6",
			group: "g1",
			from: 5,
			title: "Clasificación del estimado",
			en: "Estimate Classification",
			keys: ["classNote"],
			auto: "classification",
			hint: "La clase AACE (pestaña 02) y por qué corresponde a la madurez de la definición."
		},
		{
			id: "3.2.1",
			group: "g2",
			from: 4,
			title: "Herramientas de estimación",
			en: "Estimating Tools",
			keys: ["tools"],
			hint: "Programas, hojas de cálculo, bases de datos y técnicas usadas para producir el estimado."
		},
		{
			id: "3.2.2",
			group: "g2",
			from: 4,
			title: "Estructura de codificación",
			en: "Coding Structure",
			keys: ["coding"],
			auto: "coding",
			hint: "Cómo se codifican los costos (EDT y cuentas de costo)."
		},
		{
			id: "3.3.1",
			group: "g3",
			from: 3,
			title: "Unidades de medida",
			en: "Units of Measure",
			keys: ["units"],
			hint: "Sistema de unidades y unidades por tipo de trabajo; califica los rendimientos (unidades/hora o horas/unidad)."
		},
		{
			id: "3.3.2",
			group: "g3",
			from: 5,
			title: "Moneda y tipos de cambio",
			en: "Currency and Exchange Rates",
			keys: ["currencyNote"],
			auto: "currency",
			hint: "Moneda del estimado, fecha y fuente del tipo de cambio. El tipo de cambio se estima aparte de la escalación (58R-10)."
		},
		{
			id: "3.3.3",
			group: "g3",
			from: 1,
			title: "Redondeo",
			en: "Rounding",
			keys: ["rounding"],
			hint: "Criterio de redondeo de cantidades y costos."
		},
		{
			id: "3.4",
			group: "g3",
			from: 3,
			title: "Base de cantidades",
			en: "Quantity Basis",
			keys: ["quantities"],
			hint: "De dónde salen las cantidades (metrados de planos, factores, paramétricos) y su nivel de madurez."
		},
		{
			id: "3.5",
			group: "g5",
			from: 5,
			title: "Base de costos: fecha y fuente de precios",
			en: "Cost Basis",
			keys: ["date", "source"],
			all: true,
			hint: "La fecha base de los precios (de ella se mide la escalación) y su fuente: cotizaciones, bases de precios, contratos.",
			area: false
		},
		{
			id: "3.5.1",
			group: "g5",
			from: 4,
			title: "Base de costos: criterios de costeo",
			en: "Cost Basis",
			keys: ["costBasis"],
			hint: "Costos directos e indirectos, impuestos, gastos generales, utilidad, moneda de las cotizaciones."
		},
		{
			id: "3.5.2",
			group: "g5",
			from: 4,
			title: "Frontera entre escalación, contingencia, asignaciones y tipo de cambio",
			en: "Cost Basis (RP 58R-10)",
			keys: ["boundary"],
			auto: "escalation",
			when: "escalation",
			hint: "58R-10: cada organización debe definir qué es escalación (incluye la inflación), qué es asignación, contingencia y tipo de cambio, y documentarlo en la BOE. La contingencia excluye la escalación."
		},
		{
			id: "3.6",
			group: "g5",
			from: 4,
			title: "Base de planificación",
			en: "Planning Basis",
			keys: ["planning"],
			auto: "planning",
			hint: "El cronograma en que se apoya el estimado: duración, calendario, fechas de gasto y línea base."
		},
		{
			id: "3.7",
			group: "g7",
			from: 2,
			title: "Materiales a granel",
			en: "Bulk Commodity Material",
			keys: ["bulk"],
			hint: "Cómo se cuantifican y cotizan los materiales a granel (desperdicios, factores, suministro)."
		},
		{
			id: "3.8",
			group: "g7",
			from: 2,
			title: "Mano de obra",
			en: "Labor",
			keys: ["labor", "productivity"],
			hint: "Tarifas, jornada, rendimientos y factores de productividad o de ajuste."
		},
		{
			id: "3.9",
			group: "g7",
			from: 1,
			title: "Demolición",
			en: "Demolition",
			keys: ["demolition"],
			hint: "Qué demolición incluye o excluye el estimado. Si no aplica, escribe «No aplica»."
		},
		{
			id: "3.10",
			group: "g8",
			from: 3,
			title: "Asignaciones",
			en: "Allowances",
			keys: ["allowances"],
			hint: "Montos previstos para trabajo aún no definido y qué cubren (no son contingencia). Si no hay, escribe «Sin asignaciones»."
		},
		{
			id: "3.11",
			group: "g8",
			from: 5,
			title: "Supuestos",
			en: "Assumptions",
			keys: ["assumptions"],
			hint: "Lo que se da por cierto para estimar y cuyo cambio invalidaría el estimado."
		},
		{
			id: "3.12",
			group: "g8",
			from: 5,
			title: "Exclusiones",
			en: "Exclusions",
			keys: ["exclusions"],
			hint: "Lo que el lector podría esperar dentro del estimado y NO está."
		},
		{
			id: "3.13",
			group: "g8",
			from: 2,
			title: "Excepciones",
			en: "Exceptions",
			keys: ["exceptions"],
			hint: "Desviaciones de la práctica estándar de estimación de la organización. Si no hay, escribe «Ninguna»."
		},
		{
			id: "3.14",
			group: "g9",
			from: 4,
			title: "Riesgos y oportunidades",
			en: "Risks and Opportunities",
			keys: ["risksNote"],
			auto: "risks",
			hint: "Los riesgos y oportunidades de costo que el estimador conoce (viene del Registro de Riesgos) y cómo se tratan."
		},
		{
			id: "3.16",
			group: "g9",
			from: 5,
			title: "Contingencias",
			en: "Contingencies",
			keys: ["contingencyNote"],
			auto: "contingency",
			hint: "Método y monto de la contingencia; de quién es y cómo se libera."
		},
		{
			id: "3.17",
			group: "g9",
			from: 4,
			title: "Reserva de gestión",
			en: "Management Reserve",
			keys: ["mgmtNote"],
			auto: "mgmt",
			hint: "Monto de la reserva de gestión, quién la controla y cómo se autoriza su uso (fuera de la línea base)."
		},
		{
			id: "3.18",
			group: "g10",
			from: 3,
			title: "Conciliación",
			en: "Reconciliation",
			keys: ["reconciliation"],
			auto: "capex",
			hint: "Cómo se concilia el estimado con estimados anteriores y con el presupuesto autorizado o CAPEX."
		},
		{
			id: "3.19",
			group: "g10",
			from: 1,
			title: "Benchmarking",
			en: "Benchmarking",
			keys: ["benchmarking"],
			hint: "Proyectos comparables con los que se contrastó el estimado (costos por unidad, ratios)."
		},
		{
			id: "3.20",
			group: "g10",
			from: 2,
			title: "Aseguramiento de la calidad del estimado",
			en: "Estimate Quality Assurance",
			keys: ["qa"],
			hint: "Revisiones internas, chequeos y quién los hizo."
		},
		{
			id: "3.21",
			group: "g10",
			from: 3,
			title: "Equipo estimador",
			en: "Estimating Team",
			keys: [],
			list: "team",
			hint: "Quiénes prepararon el estimado y su rol."
		},
		{
			id: "3.22.A",
			group: "g10",
			from: 2,
			title: "Anexo A: entregables del estimado",
			en: "Attachment A: Estimate Deliverables Checklist",
			keys: [],
			list: "checklist",
			hint: "Lista de control de lo que se entrega con el estimado (lista propia; la de 34R-05 no se pudo verificar)."
		},
		{
			id: "3.22.B",
			group: "g10",
			from: 3,
			title: "Anexo B: documentos de referencia",
			en: "Attachment B: Reference Documents",
			keys: [],
			list: "refs",
			hint: "Documentos y proyectos usados o referenciados al preparar el estimado."
		}
	];
	var TEXT_KEYS = Array.from(new Set(SECTIONS.reduce((a, s) => a.concat(s.keys), [])));
	var CHECKLIST_ITEMS = [
		{
			id: "boe",
			label: "Basis of Estimate (este documento)"
		},
		{
			id: "summary",
			label: "Resumen del estimado por paquete de la EDT"
		},
		{
			id: "detail",
			label: "Estimado detallado (precios unitarios por actividad)"
		},
		{
			id: "quantities",
			label: "Hoja de cantidades (metrados)"
		},
		{
			id: "schedule",
			label: "Cronograma y flujo de caja"
		},
		{
			id: "risk",
			label: "Análisis de riesgo y contingencia"
		},
		{
			id: "escalation",
			label: "Cálculo de la escalación"
		},
		{
			id: "reconc",
			label: "Conciliación y comparación con proyectos similares"
		},
		{
			id: "signoff",
			label: "Revisión y aprobación del estimado"
		}
	];
	var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
	function blankBoe() {
		const text = {};
		TEXT_KEYS.forEach((k) => {
			text[k] = "";
		});
		return {
			version: "1.0",
			status: "borrador",
			preparedBy: "",
			reviewedBy: "",
			approvedBy: "",
			approvedOn: "",
			text,
			team: [],
			refs: [],
			checklist: CHECKLIST_ITEMS.map((c) => ({
				id: c.id,
				done: false
			}))
		};
	}
	function normalizeBoe(raw) {
		const b = blankBoe();
		if (!isObj(raw)) return b;
		TEXT_KEYS.forEach((k) => {
			b.text[k] = str$1(raw[k]);
		});
		b.version = str$1(raw.version) || "1.0";
		b.status = STATUSES.indexOf(raw.status) >= 0 ? raw.status : "borrador";
		b.preparedBy = str$1(raw.preparedBy);
		b.reviewedBy = str$1(raw.reviewedBy);
		b.approvedBy = str$1(raw.approvedBy);
		b.approvedOn = /^\d{4}-\d{2}-\d{2}$/.test(str$1(raw.approvedOn)) ? str$1(raw.approvedOn) : "";
		if (Array.isArray(raw.team)) b.team = raw.team.filter(isObj).map((m) => ({
			name: str$1(m.name),
			role: str$1(m.role)
		})).filter((m) => m.name.trim() || m.role.trim());
		if (Array.isArray(raw.refs)) b.refs = raw.refs.filter(isObj).map((r) => ({
			title: str$1(r.title),
			note: str$1(r.note)
		})).filter((r) => r.title.trim() || r.note.trim());
		if (Array.isArray(raw.checklist)) raw.checklist.filter(isObj).forEach((c) => {
			const it = b.checklist.find((x) => x.id === c.id);
			if (it) it.done = c.done === true;
		});
		return b;
	}
	function serializeBoe(b) {
		const out = {};
		TEXT_KEYS.forEach((k) => {
			out[k] = b.text[k] || "";
		});
		return {
			...out,
			version: b.version,
			status: b.status,
			preparedBy: b.preparedBy,
			reviewedBy: b.reviewedBy,
			approvedBy: b.approvedBy,
			approvedOn: b.approvedOn,
			team: b.team,
			refs: b.refs,
			checklist: b.checklist
		};
	}
	var filled = (s) => !!s && s.trim().length > 0;
	function sectionDone(s, b) {
		if (s.list === "team") return b.team.some((m) => filled(m.name));
		if (s.list === "refs") return b.refs.some((r) => filled(r.title));
		if (s.list === "checklist") return b.checklist.some((c) => c.done);
		return s.all ? s.keys.every((k) => filled(b.text[k])) : s.keys.some((k) => filled(b.text[k]));
	}
	function evaluateBoe(b, facts, classNum) {
		return SECTIONS.map((s) => {
			const applies = !s.when || !!facts[s.when], required = applies && classNum <= s.from;
			const own = sectionDone(s, b), backed = !own && !!s.auto && !!facts[s.auto] && s.id !== "3.5.2";
			return {
				section: s,
				applies,
				required,
				state: own ? "completa" : backed ? "respaldada" : required ? "falta" : "opcional"
			};
		});
	}
	function completeness(b, facts, classNum) {
		const evals = evaluateBoe(b, facts, classNum), req = evals.filter((e) => e.required), done = req.filter((e) => e.state === "completa" || e.state === "respaldada");
		return {
			required: req.length,
			done: done.length,
			pct: req.length ? Math.round(done.length / req.length * 100) : 100,
			evals,
			missing: req.filter((e) => e.state === "falta").map((e) => e.section),
			optionalMissing: evals.filter((e) => e.applies && !e.required && e.state === "opcional").map((e) => e.section)
		};
	}
	function boeFindings(b, facts, ctx) {
		const out = [], c = completeness(b, facts, ctx.classNum), F = (code, severity, text) => {
			out.push({
				code,
				severity,
				text
			});
		};
		const names = (l) => l.slice(0, 4).map((s) => s.id + " " + s.title).join("; ") + (l.length > 4 ? "…" : "");
		if (b.status === "aprobada" && c.missing.length) F("B1", "riesgo", "La BOE figura «Aprobada» pero le faltan " + c.missing.length + " sección(es) que se exigen para un estimado de clase " + ctx.classNum + " (" + names(c.missing) + "): no puede ser la base del control de cambios.");
		if (b.status === "aprobada" && (!filled(b.approvedBy) || !b.approvedOn)) F("B2", "riesgo", "La BOE está «Aprobada» sin registrar quién la aprueba y en qué fecha.");
		if (b.status === "revision" && !filled(b.reviewedBy)) F("B2", "aviso", "La BOE está «En revisión» sin indicar quién la revisa.");
		if (b.status === "borrador" && ctx.baselineVersion) F("B3", "aviso", "Ya hay una línea base de costos (" + ctx.baselineVersion + ") pero la BOE sigue en borrador: la BOE es la base del control de cambios y debe aprobarse con la línea base.");
		if (b.status === "aprobada" && b.approvedOn && ctx.baselineDate && b.approvedOn < ctx.baselineDate) F("B4", "aviso", "La BOE se aprobó el " + b.approvedOn + ", antes de la última línea base de costos (" + (ctx.baselineVersion || "LB") + ", " + ctx.baselineDate + "): actualízala y vuelve a aprobarla, porque los cambios de la línea base ya no están reflejados.");
		if (ctx.escalation > 0 && !filled(b.text.boundary)) F("B5", "aviso", "Hay escalación en el presupuesto pero la BOE no define qué es escalación, contingencia, asignación y tipo de cambio (sección 3.5.2): 58R-10 pide documentarlo, porque la contingencia excluye la escalación.");
		if (ctx.capex !== null && ctx.total !== null && ctx.total > ctx.capex + .5) F("B6", "aviso", "El presupuesto total (" + Math.round(ctx.total).toLocaleString("es-PE") + ") supera el CAPEX del Acta (" + Math.round(ctx.capex).toLocaleString("es-PE") + "): concíliala en la sección 3.18 o solicita la autorización que corresponda.");
		if (!filled(b.preparedBy)) F("B7", "info", "No se registró quién prepara la BOE.");
		if (c.missing.length && b.status !== "aprobada") F("B8", "info", "Faltan " + c.missing.length + " sección(es) requeridas para un estimado de clase " + ctx.classNum + ": " + names(c.missing) + ".");
		return out;
	}
	//#endregion
	//#region src/shared/boe-sample.ts
	var SAMPLE_CAPEX = 85e5;
	function buildSampleBoe() {
		return normalizeBoe({
			version: "1.0",
			status: "aprobada",
			preparedBy: "Director de Proyecto (PM)",
			reviewedBy: "Jefe de Ingeniería",
			approvedBy: "Gerencia General DISTRIB+ (Sponsor)",
			approvedOn: "2026-07-03",
			purpose: "Sustentar el presupuesto de autorización del Almacén Lurín de DISTRIB+ S.A. (línea base de costos) y servir de base del control de cambios durante la ejecución.",
			objectives: "Autorizar el financiamiento del proyecto dentro del CAPEX de referencia (USD 8,5 M) y dejar una línea base de costos, con su contingencia y su escalación, sobre la que controlar el valor ganado. Estimado de clase 3, preparado en paralelo con el Plan para la Dirección del Proyecto.",
			scope: "Almacén logístico para DISTRIB+ S.A. en Lurín (Lima): nave industrial con cobertura metálica, instalaciones eléctricas y sanitarias dimensionadas para operación logística y patio de maniobras para vehículos de carga pesada. Comprende ingeniería de detalle, permisos, procura de estructuras y materiales, obra civil y MEP, y pruebas y puesta en marcha hasta la entrega formal (ver el Enunciado del Alcance, DEL.01 a DEL.06).",
			execution: "Obra civil con cuadrillas propias A a D; suministro de estructuras metálicas, materiales y equipos eléctricos por contratos con los Proveedores A, B y C; instalaciones MEP por subcontrata. Jornada de 8 h, de lunes a viernes, sin trabajo nocturno. Los permisos municipales (licencia de edificación e ITSE) preceden al movimiento de tierras.",
			parameters: "Terreno plano en Lurín, a nivel del mar; acceso de vehículos de carga pesada sin restricción de horario; agua y energía provisionales a cargo del contratista.",
			classNote: "Clase 3 (autorización de presupuesto): definición de ingeniería en torno al 30 % de madurez, con la ingeniería de detalle en curso. El rango de exactitud de la clase se aplica al presupuesto en la pestaña 03.",
			tools: "Estimar los Costos (precio unitario × metrado por actividad), WBS Builder (EDT), Cronograma/CPM (fechas de gasto), y en Costos la estimación por rangos con simulación Monte Carlo (contingencia) y la escalación por índices.",
			coding: "Código EDT jerárquico de WBS Builder (1.1 a 5.3): cada paquete de trabajo es una cuenta de costo. Las cuentas de escalación son cuatro: mano de obra, materiales, equipos y subcontratos.",
			currencyNote: "USD, la moneda del CAPEX y de todo el caso; las cotizaciones vienen en USD. El 30 % del costo está denominado en otra moneda: el tipo de cambio se congela a la fecha base (2026-07-01) y la exposición cambiaria se cuantifica aparte de la escalación (banda de ±8 %, solo con régimen flotante).",
			units: "Sistema métrico: m, m², m³, kg, ton, und, glb; horas-hombre para la mano de obra. Los rendimientos se expresan en unidades por día por cuadrilla.",
			rounding: "Costos por paquete redondeados al dólar; los totales se suman sin redondeos intermedios.",
			quantities: "Metrados por actividad de Definir las Actividades, medidos de los planos al ~30 % de definición; los de concreto y acero de refuerzo llevan el rango de la clase (contingencia). Las cantidades de las partidas de procura son las de las cotizaciones.",
			date: SAMPLE_BASE_DATE,
			source: "Cotizaciones de los Proveedores A, B y C (vigencia de 60 días), base de rendimientos regional y precios unitarios de la última licitación de DISTRIB+.",
			costBasis: "Costo directo sin IGV. Incluye los gastos generales de obra (≈ 5,8 % del costo base, repartidos en el plazo y valorizados por día de extensión del plazo). Cotizaciones en USD.",
			boundary: "Escalación = movimiento general de precios de mercado por cuenta de costo, medido con índices desde la fecha base (2026-07-01), en el momento en que se gasta cada paquete; se financia al P70 de la simulación y se controla como una cuenta aparte. Contingencia = riesgos específicos del proyecto (Registro de Riesgos R-01 a R-10) e incertidumbre de los rangos del estimado; NO incluye escalación. Tipo de cambio = línea aparte (régimen congelado a la fecha base). Asignaciones: ninguna. R-02 (alza del precio del acero) permanece como evento de contingencia solo por el exceso sobre la tendencia general de materiales.",
			planning: "Cronograma CPM de 273 días laborables (calendario de 5 días) con inicio el 2026-07-06; las compras se ejecutan en paralelo con la ingeniería. Las fechas de gasto de la escalación salen de este cronograma (línea base LB-n cuando se fije).",
			bulk: "Concreto f'c=280 kg/cm² y acero de refuerzo: metrado de planos + 5 % de desperdicio; cemento y agregados por tonelada según la cotización del Proveedor B.",
			labor: "Cuadrillas propias A a D con rendimientos de la base regional; tarifas del convenio de construcción civil vigente. Jornada de 8 h.",
			productivity: "Rendimientos según la base regional, sin factor por altitud (Lurín está a nivel del mar); un factor de 1,05 por trabajo en obra abierta con tráfico de vehículos pesados.",
			demolition: "La demolición de la losa existente no identificada en el levantamiento queda fuera del estimado base: se gestiona como trabajo imprevisto dentro del alcance (orden de cambio OC-003, con reserva de gestión).",
			allowances: "Sin asignaciones en el estimado base: cada paquete está cotizado o valorizado por precio unitario. El hallazgo geotécnico se cubre con contingencia (R-03; OC-001).",
			assumptions: "Diseño al 30 % de madurez. Suministro nacional. Jornada de 8 h, sin trabajo nocturno. El terreno de Lurín está saneado legalmente y disponible desde el inicio. La disponibilidad de cuadrillas y subcontratistas se mantiene según el plan de recursos. El tipo de cambio y el precio del acero se mantienen dentro del rango presupuestado.",
			exclusions: "IGV, saneamiento físico-legal del terreno, costos financieros y expropiaciones; operación y mantenimiento posteriores a la entrega; equipamiento logístico interno (racks, montacargas, sistemas de gestión de almacén); obras fuera del lindero y ampliaciones futuras de la nave.",
			exceptions: "Sin excepciones a la práctica de estimación de DISTRIB+; los costos financieros se presupuestan aparte.",
			risksNote: "Los riesgos abiertos del Registro de Riesgos (R-01 licencia, R-02 acero, R-03 suelo…) se cuantifican en la contingencia con su riesgo residual; las oportunidades se registran pero no reducen el presupuesto.",
			contingencyNote: "La contingencia es del director del proyecto y está dentro de la línea base; su liberación sigue la política de reservas del plan de riesgos (director de proyecto, CCB o sponsor según el monto).",
			mgmtNote: "La reserva de gestión es el 5 % de la línea base, del sponsor y fuera de ella; su uso y el de los fondos adicionales los autoriza siempre el sponsor.",
			reconciliation: "Conciliado con el CAPEX de referencia del Acta de Constitución (USD 8,5 M): el presupuesto total, con la reserva de gestión, queda dentro de esa cifra. No existe un estimado anterior con el que conciliar.",
			benchmarking: "Contrastado con el costo por m² de los tres últimos almacenes construidos por DISTRIB+ en Lima, ajustado por fecha base y por tipo de estructura.",
			qa: "Revisión del estimado por el Jefe de Ingeniería (metrados y rendimientos) y por Control de Calidad (consistencia con la EDT y las cotizaciones) antes de la aprobación del sponsor.",
			team: [
				{
					name: "Director de Proyecto (PM)",
					role: "Estimador responsable; integra el estimado y prepara la BOE"
				},
				{
					name: "Jefe de Ingeniería",
					role: "Metrados, rendimientos y revisión técnica del estimado"
				},
				{
					name: "Jefe de Logística",
					role: "Cotizaciones de los Proveedores A, B y C"
				},
				{
					name: "Residente de Obra",
					role: "Rendimientos de cuadrillas y plazos de obra"
				},
				{
					name: "Control de Calidad (QA/QC)",
					role: "Revisión de consistencia del estimado"
				}
			],
			refs: [
				{
					title: "Acta de Constitución del Proyecto",
					note: "CAPEX de referencia y requisitos de alto nivel (RAN.01 a RAN.04)"
				},
				{
					title: "Enunciado del Alcance",
					note: "Entregables DEL.01 a DEL.06, supuestos, restricciones y exclusiones"
				},
				{
					title: "Cotizaciones de los Proveedores A, B y C",
					note: "Vigencia de 60 días desde la fecha base"
				},
				{
					title: "Base de rendimientos regional",
					note: "Rendimientos por cuadrilla"
				},
				{
					title: "Registro de Riesgos R-01 a R-10",
					note: "Riesgos cuantificados en la contingencia"
				}
			],
			checklist: [
				"boe",
				"summary",
				"detail",
				"quantities",
				"schedule",
				"risk",
				"escalation",
				"reconc",
				"signoff"
			].map((id) => ({
				id,
				done: id !== "reconc"
			}))
		});
	}
	//#endregion
	//#region src/shared/evm-sample.ts
	var EVM_SAMPLE_COSTS = {
		"1.1": 12e3,
		"1.2": 38e3,
		"1.3": 145e3,
		"2.1": 28e3,
		"2.2": 165e3,
		"2.3": 98e3,
		"2.4": 64e3,
		"3.1": 182e4,
		"3.2": 715e3,
		"3.3": 415e3,
		"4.1": 38e4,
		"4.2": 735e3,
		"4.3": 1165e3,
		"4.4": 55e4,
		"4.5": 485e3,
		"5.1": 145e3,
		"5.2": 48e3,
		"5.3": 92e3
	};
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
	//#endregion
	//#region src/modules/cost/main.ts
	var STORE_KEY = "gpi_cost_management_plan";
	var CLASSES = {
		5: {
			mat: "0% – 2%",
			use: "Screening / evaluación conceptual",
			meth: "Estocástico (paramétrico, capacidad)",
			range: "-30% / +50% (típico)",
			lo: -30,
			hi: 50,
			desc: "Estimado de orden de magnitud. Mínima definición de ingeniería; se usa para descartar alternativas."
		},
		4: {
			mat: "1% – 15%",
			use: "Estudio de factibilidad",
			meth: "Predominantemente estocástico",
			range: "-20% / +40%",
			lo: -20,
			hi: 40,
			desc: "Basado en factores y equipos mayores. Soporta decisiones de continuidad del proyecto."
		},
		3: {
			mat: "10% – 40%",
			use: "Autorización de presupuesto / control base",
			meth: "Mixto estocástico–determinístico",
			range: "-15% / +30%",
			lo: -15,
			hi: 30,
			desc: "Semidetallado. Marca el paso de estudio a ejecución; suele ser la base del control."
		},
		2: {
			mat: "30% – 75%",
			use: "Control y oferta / licitación",
			meth: "Predominantemente determinístico",
			range: "-10% / +20%",
			lo: -10,
			hi: 20,
			desc: "Detallado por partidas. Usado para control detallado y para ofertar."
		},
		1: {
			mat: "65% – 100%",
			use: "Estimado definitivo / cierre de oferta",
			meth: "Determinístico (cantidades y precios)",
			range: "-5% / +15%",
			lo: -5,
			hi: 15,
			desc: "Máxima definición. Verificación final y check estimate."
		}
	};
	var CUR = {
		PEN: "S/",
		USD: "$",
		EUR: "€"
	};
	function $(id) {
		return document.getElementById(id);
	}
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;"
		})[c]);
	}
	var SAMPLE_CO = [
		{
			id: "OC-001",
			desc: "Refuerzo de cimentación por hallazgo geotécnico",
			cause: "R-03 Suelo",
			cost: 18e4,
			fund: "Contingencia",
			status: "Aprobada",
			kind: "riesgo",
			approver: "CCB",
			authLevel: "ccb",
			sponsorAuth: false,
			approvedOn: "2026-08-03",
			riskId: "rk3",
			riskCode: "R-03"
		},
		{
			id: "OC-002",
			desc: "Ampliación de sala eléctrica solicitada por cliente",
			cause: "Cambio alcance",
			cost: 24e4,
			fund: "Financiamiento adicional",
			status: "Pendiente",
			kind: "alcance",
			approver: "",
			sponsorAuth: false
		},
		{
			id: "OC-003",
			desc: "Demolición de losa existente no identificada en el levantamiento",
			cause: "No identificado en el RBS",
			cost: 9e4,
			fund: "Reserva de gestión",
			status: "Pendiente",
			kind: "imprevisto",
			approver: "",
			sponsorAuth: false
		}
	];
	var SAMPLE_RANGES = [
		{
			id: "m-1",
			name: "1 Dirección de Proyecto",
			ml: 195e3,
			lowPct: -3,
			highPct: 10,
			basis: "Costo de personal propio a tarifas vigentes; variación por dedicación."
		},
		{
			id: "m-2",
			name: "2 Ingeniería y Diseño",
			ml: 355e3,
			lowPct: -5,
			highPct: 15,
			basis: "Diseño estructural al 80 %; incertidumbre de los metrados finales de diseño."
		},
		{
			id: "m-3",
			name: "3 Procura",
			ml: 295e4,
			lowPct: -4,
			highPct: 10,
			basis: "Cotizaciones vigentes de los Proveedores A/B/C: variación de cantidades y de precios unitarios dentro de la vigencia de la oferta (la volatilidad del acero y del tipo de cambio son eventos del registro: R-02, R-04)."
		},
		{
			id: "m-4",
			name: "4 Construcción",
			ml: 3315e3,
			lowPct: -6,
			highPct: 18,
			basis: "Metrados y precios unitarios de subcontratos aún por cerrar (los rendimientos, el suelo, el paro y los vecinos son eventos del registro: R-09, R-03, R-05, R-07)."
		},
		{
			id: "m-5",
			name: "5 Pruebas y Puesta en Marcha",
			ml: 285e3,
			lowPct: -3,
			highPct: 10,
			basis: "Alcance de las pruebas de instalaciones por confirmar con QA/QC."
		}
	];
	var SAMPLE_TIME_COST = 1500;
	var SAMPLE_TIME_BASIS = "Dirección de Proyecto y gastos generales de obra (supervisión, alquileres, seguros): ≈ 410.000, el 5,8 % del costo base, repartidos en los 273 días laborables del cronograma.";
	var state = {
		curClass: 3,
		co: [],
		baselines: [],
		ranges: [],
		legacyMethod: "",
		boe: blankBoe(),
		esc: blankEscPlan()
	};
	$("tabs").addEventListener("click", (e) => {
		const b = e.target.closest(".tab");
		if (!b) return;
		document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
		document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
		b.classList.add("active");
		$(b.dataset.p).classList.add("active");
		if (b.dataset.p === "p5") buildDoc();
		else if (b.dataset.p === "p2") refreshBoe();
	});
	$("classbar").addEventListener("click", (e) => {
		const b = e.target.closest("button");
		if (!b) return;
		userEdited = true;
		state.curClass = +b.dataset.c;
		document.querySelectorAll("#classbar button").forEach((x) => x.classList.remove("on"));
		b.classList.add("on");
		renderClass();
		recalcCont();
		save();
	});
	var CONT_MATRIX = {
		5: {
			P50: .15,
			P70: .25,
			P80: .32,
			P90: .45
		},
		4: {
			P50: .1,
			P70: .18,
			P80: .24,
			P90: .32
		},
		3: {
			P50: .07,
			P70: .12,
			P80: .16,
			P90: .22
		},
		2: {
			P50: .04,
			P70: .08,
			P80: .11,
			P90: .15
		},
		1: {
			P50: .02,
			P70: .05,
			P80: .07,
			P90: .1
		}
	};
	function contingencyRate() {
		const row = CONT_MATRIX[state.curClass] || CONT_MATRIX[3];
		const v = row[$("contPct") ? $("contPct").value : "P70"];
		return typeof v === "number" ? v : row.P70;
	}
	function renderClass() {
		const c = CLASSES[state.curClass];
		$("classDesc").innerHTML = `<b>Clase ${state.curClass}.</b> ${c.desc}`;
		$("cMat").textContent = c.mat;
		$("cUse").textContent = c.use;
		$("cMeth").textContent = c.meth;
		$("cRange").textContent = c.range;
		renderMaturity();
	}
	function maturityInputs() {
		if (!gpiOn()) return null;
		const G = GPI;
		try {
			const ch = G.getModule("charter"), sc = G.getModule("scopeStatement"), rq = G.getModule("requirements"), wbs = G.getModule("wbs"), act = G.getModule("activities"), est = G.getModule("costEstimate");
			const leaves = G.util.wbsLeaves(wbs).length, ra = rq ? G.util.requirementsAudit(rq, ch, wbs) : null;
			const rows = G.util.costEstimateRows(est, act, wbs);
			getEng();
			const acts = net ? net.nodes.filter((n) => !n.isMilestone) : [], linked = /* @__PURE__ */ new Set();
			if (net) net.links.forEach((l) => {
				linked.add(l.from);
				linked.add(l.to);
			});
			return {
				charter: ch ? G.util.charterAudit(ch).pct / 100 : 0,
				scope: sc ? G.util.scopeAudit(sc, rq, ch, wbs).decompPct / 100 : 0,
				requirements: ra && ra.total ? (ra.baselineFrozen ? .5 : 0) + ra.tracePct / 100 * .5 : 0,
				wbs: leaves ? 1 : 0,
				activities: leaves ? G.util.activitiesStats(act, wbs).pct / 100 : 0,
				pricing: rows.length ? rows.filter((r) => r.subtotal != null && r.subtotal > 0).length / rows.length : 0,
				schedule: acts.length ? acts.filter((n) => linked.has(n.id)).length / acts.length : 0
			};
		} catch (e) {
			return null;
		}
	}
	function renderMaturity() {
		const box = document.getElementById("clsMaturity");
		if (!box) return;
		const inp = maturityInputs();
		if (!inp) {
			box.innerHTML = `<div class="note">La clase de un estimado <b>resulta de la madurez de la definición del proyecto</b> (AACE 17R-97). Con un proyecto conectado se estima esa madurez con los datos de la suite (acta, alcance, requisitos, EDT, actividades, precios y cronograma) y se contrasta con la clase que elijas.</div>`;
			return;
		}
		const m = definitionMaturity(inp), adv = classAdvisory(state.curClass, m.pct);
		box.innerHTML = `<div class="eyebrow" style="margin:0 0 6px">Madurez de la definición, estimada con los datos del proyecto</div>
    <div style="overflow-x:auto"><table class="rng-res"><thead><tr><th>Elemento de la definición</th><th class="num">Avance</th><th class="num">Peso</th><th class="num">Aporta</th></tr></thead><tbody>${m.items.map((i) => `<tr><td>${esc(i.label)}<div class="muted" style="font-size:11px">${esc(i.hint)}</div></td><td class="num">${Math.round(i.value * 100)} %</td><td class="num">${i.weight}</td><td class="num">${(Math.round(i.points * 10) / 10).toFixed(1)}</td></tr>`).join("")}
      <tr class="rng-selrow"><td><b>Madurez estimada</b> → clase sugerida <b>${m.class}</b></td><td></td><td class="num">100</td><td class="num"><b>${(Math.round(m.pct * 10) / 10).toFixed(1)} %</b></td></tr></tbody></table></div>
    <div class="note" style="margin-top:8px;${adv.level === "aviso" ? "border-color:#dc3546;background:#fdecef" : ""}">${adv.level === "aviso" ? "<b>⚠</b> " : ""}${esc(adv.text)}</div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">Es una estimación <b>orientativa</b> con pesos didácticos: la clase real depende de entregables de definición (ingeniería, especificaciones, cotizaciones firmes) que la suite solo ve en parte. Sirve para avisar cuando la clase declarada no se sostiene, no para decidirla.</div>`;
	}
	function classDocRows(c) {
		const inp = maturityInputs(), b = state._budget;
		return (inp ? (() => {
			const m = definitionMaturity(inp);
			return `<tr><td>Madurez estimada de la definición</td><td>≈ ${Math.round(m.pct)} % (clase sugerida ${m.class}); ${esc(classAdvisory(state.curClass, m.pct).text)}</td></tr>`;
		})() : "") + (b && b.base > 0 ? (() => {
			const r = accuracyRange(b.base + b.cont, c.lo, c.hi);
			return `<tr><td>Rango de exactitud aplicado</td><td>Sobre el estimado con contingencia (${fmt(b.base + b.cont)}): mínimo ${fmt(r.min)} · máximo ${fmt(r.max)} (${sgn(c.lo)} % / ${sgn(c.hi)} %, típico de la clase; presupone contingencia aplicada)</td></tr>`;
		})() : "");
	}
	function renderAccuracy(base, cont, res) {
		const box = document.getElementById("accBox");
		if (!box) return;
		if (!(base > 0)) {
			box.style.display = "none";
			return;
		}
		const c = CLASSES[state.curClass], est = base + cont, r = accuracyRange(est, c.lo, c.hi);
		const sim = res ? ` El análisis por rangos simula un costo total de <b>${fmt(res.p[10])}</b> (P10) a <b>${fmt(res.p[90])}</b> (P90).` : "";
		box.style.display = "block";
		box.innerHTML = `<b>Rango de exactitud esperado — clase ${state.curClass} (${sgn(c.lo)} % / +${c.hi} %, típico).</b> Sobre el estimado con contingencia (<b>${fmt(est)}</b> = costo base + contingencia) el costo final esperado va de <b>${fmt(r.min)}</b> a <b>${fmt(r.max)}</b>.${sim} El rango es un valor típico de la clase: depende del proyecto y presupone la contingencia ya aplicada (AACE 56R-08); el análisis de riesgo lo afina.`;
	}
	var sym = () => CUR[$("cur").value] || "S/";
	function fmt(n) {
		if (n == null || !isFinite(n)) return "—";
		return sym() + " " + Math.round(n).toLocaleString("es-PE");
	}
	function fmt2(n) {
		if (n == null || !isFinite(n)) return "—";
		return sym() + " " + n.toLocaleString("es-PE", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}
	function onBaseInput(src) {
		const other = src.id === "baseCost" ? $("actCostP1") : $("baseCost");
		if (other) other.value = src.value;
		save();
		recalcCont();
	}
	var METHOD_LABEL = {
		rangos_mc: "Estimación por rangos + simulación Monte Carlo (AACE 41R-08)",
		clase_tabla: "Referencia por clase y percentil (tabla didáctica, no normativa)",
		manual: "Porcentaje manual definido por el equipo"
	};
	function contMethod() {
		const v = $("contMethod").value;
		return v === "rangos_mc" || v === "manual" ? v : "clase_tabla";
	}
	var pctNum = () => parseInt($("contPct").value.replace(/\D/g, ""), 10) || 70;
	function corrValue() {
		const v = parseFloat($("corrPct").value);
		return isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : DEFAULT_CORRELATION;
	}
	var simCache = {};
	var escCtx = null;
	var escSimCache = {};
	function riskCtx() {
		if (gpiOn()) {
			try {
				const m = GPI.getModule("risks");
				if (m && Array.isArray(m.risks)) return {
					source: "registro",
					risks: m.risks.map((o, i) => normalizeRisk(o, "rk" + (i + 1))),
					plan: normalizePlan(m.plan)
				};
			} catch (e) {}
			return {
				source: "sin registro",
				risks: [],
				plan: normalizePlan(null)
			};
		}
		return {
			source: "ejemplo",
			risks: buildSampleRisks((c) => "w-" + c),
			plan: SAMPLE_PLAN
		};
	}
	var riskRefs = (ctx) => ctx.risks.map((r) => ({
		...toRiskRef(r),
		plannedMax: r.costImpact.high !== null ? r.costImpact.high : r.costImpact.likely
	}));
	function includeRisksOn() {
		const c = document.getElementById("rngRisks");
		return !c || c.checked;
	}
	var net = null;
	var eng = null;
	var netDirty = true;
	function getEng() {
		if (!netDirty) return eng;
		netDirty = false;
		net = null;
		eng = null;
		escCtx = null;
		Object.keys(escSimCache).forEach((k) => {
			delete escSimCache[k];
		});
		Object.keys(simCache).forEach((k) => {
			delete simCache[k];
		});
		Object.keys(eventOutcomes).forEach((k) => {
			delete eventOutcomes[k];
		});
		try {
			if (typeof GPI === "undefined" || !GPI || !GPI.util || !GPI.util.cpm || !GPI.util.scheduleNetwork) return null;
			if (gpiOn()) net = GPI.util.activeScheduleNetwork();
			else {
				const m = sampleScheduleModules();
				net = GPI.util.scheduleNetwork(m.wbs, m.activities, null, m.schedule, null, SAMPLE_START_DATE);
			}
			eng = makeEngine(net, GPI.util.cpm);
		} catch (e) {
			net = null;
			eng = null;
		}
		return eng;
	}
	function timeCostPerDay() {
		const el = document.getElementById("rngTimeCost"), v = el ? parseFloat(el.value) : 0;
		return isFinite(v) && v > 0 ? v : 0;
	}
	function finishOf(days) {
		if (typeof GPI === "undefined" || !GPI || !net || !net.startDate) return "";
		try {
			return GPI.util.addWorkingDays(GPI.util.parseISO(net.startDate), Math.max(0, Math.ceil(days - 1e-9) - 1), net.calendar);
		} catch (e) {
			return "";
		}
	}
	function eventsCtx() {
		const c = riskCtx(), g = getEng();
		const e = riskEventsOf(c.risks, c.plan, { targets: (r) => g ? resolveTargets(r, g).targets.map((t) => t.id) : [] });
		const open = c.risks.filter((r) => r.status !== "materializado" && r.status !== "cerrado");
		return {
			source: c.source,
			events: e.events,
			excluded: e.excluded,
			unmapped: e.unmapped,
			ev: e.ev,
			responseCost: open.reduce((s, r) => s + (r.responseCost || 0), 0),
			open: open.length
		};
	}
	var eventOutcomes = {};
	function outcomesFor(events, g) {
		if (!events.length) return void 0;
		const key = JSON.stringify([events.map((e) => [
			e.id,
			e.prob,
			e.low,
			e.likely,
			e.high,
			e.sign,
			e.days,
			e.targets
		]), g ? g.base : null]);
		if (!(key in eventOutcomes)) {
			if (Object.keys(eventOutcomes).length > 6) Object.keys(eventOutcomes).forEach((k) => {
				delete eventOutcomes[k];
			});
			eventOutcomes[key] = simulateEvents(events, g ? {
				base: g.base,
				duration: (d) => g.duration(d)
			} : null, DEFAULT_ITERATIONS, DEFAULT_SEED);
		}
		return eventOutcomes[key];
	}
	function simulate(rho, withEvents = includeRisksOn(), withSchedule = true) {
		const events = withEvents ? eventsCtx().events : [];
		const g = withEvents ? getEng() : null, cpd = g && withSchedule ? timeCostPerDay() : 0;
		const key = JSON.stringify([
			state.ranges.map((l) => [
				l.ml,
				l.lowPct,
				l.highPct
			]),
			rho,
			events.map((e) => [
				e.id,
				e.prob,
				e.low,
				e.likely,
				e.high,
				e.sign,
				e.days,
				e.targets
			]),
			g && withSchedule ? [g.base, cpd] : null
		]);
		if (!(key in simCache)) {
			if (Object.keys(simCache).length > 24) Object.keys(simCache).forEach((k) => {
				delete simCache[k];
			});
			simCache[key] = simulateRange(state.ranges, {
				correlation: rho,
				iterations: DEFAULT_ITERATIONS,
				seed: DEFAULT_SEED,
				events,
				outcomes: outcomesFor(events, g),
				schedule: g && withSchedule ? {
					base: g.base,
					costPerDay: cpd,
					duration: (d) => g.duration(d)
				} : void 0
			});
		}
		return simCache[key];
	}
	function contingencyCalc(base) {
		const m = contMethod();
		if (m === "manual") {
			const p = Math.max(0, parseFloat($("manualPct").value) || 0);
			return {
				cont: base * p / 100,
				method: m,
				res: null,
				note: "Contingencia = <b>" + p + " %</b> del estimado base, definida por el equipo: documenta su fundamento."
			};
		}
		if (m === "rangos_mc") {
			const res = simulate(corrValue());
			if (!res) return {
				cont: 0,
				method: m,
				res: null,
				note: "Aún no hay partidas válidas: la contingencia es <b>0</b> hasta definirlas (o traerlas del estimado)."
			};
			const c = contingencyAt(res, pctNum());
			return {
				cont: c.amount,
				method: m,
				res,
				note: "Contingencia = <b>P" + pctNum() + "</b> de la simulación (" + (res.events ? "partidas + <b>" + res.events + " evento(s) de riesgo</b>" : "partidas") + ") − estimado base (Σ costo más probable)" + (c.covered ? ": el estimado base ya supera ese percentil, no hace falta reserva." : ".")
			};
		}
		const rate = contingencyRate();
		return {
			cont: base * rate,
			method: m,
			res: null,
			note: "Clase <b>" + state.curClass + "</b> · <b>" + $("contPct").value + "</b> → <b>" + (rate * 100).toFixed(1) + " %</b> del estimado base. Es una <b>referencia didáctica</b> (no proviene de una norma de AACE): a menor madurez del diseño, mayor contingencia para el mismo nivel de confianza. Para determinar la contingencia de un estimado usa la <b>estimación por rangos + simulación Monte Carlo</b>."
		};
	}
	function renderContUi(calc, base) {
		const hint = document.getElementById("contPctHint");
		if (hint) hint.innerHTML = calc.note + (calc.method === "clase_tabla" && state.legacyMethod ? "<br><b>Nota:</b> este proyecto declaraba «" + esc(state.legacyMethod) + "», pero lo que se calculaba era esta referencia por clase y percentil; ahora se rotula como lo que es." : "");
		$("rangeCard").style.display = calc.method === "rangos_mc" ? "block" : "none";
		$("manualWrap").style.display = calc.method === "manual" ? "block" : "none";
		$("contPctWrap").style.display = calc.method === "manual" ? "none" : "block";
		if (calc.method === "rangos_mc") renderRange(calc, base);
	}
	var sgn = (n) => (n > 0 ? "+" : "") + n;
	function curveSvg(res, p) {
		const W = 560, H = 240, l = 58, t = 14;
		const lo = Math.min(res.curve[0], res.ml), hi = Math.max(res.curve[98], res.ml), span = hi - lo || 1;
		const xs = (v) => l + (v - lo) / span * 486, ys = (q) => t + (100 - q) / 100 * 186;
		const path = res.curve.map((v, i) => (i ? "L" : "M") + xs(v).toFixed(1) + "," + ys(i + 1).toFixed(1)).join(" ");
		const short = (v) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + " M" : Math.round(v).toLocaleString("es-PE");
		const xt = [
			lo,
			lo + span / 2,
			hi
		].map((v, i) => `<text x="${xs(v).toFixed(1)}" y="218" text-anchor="${[
			"start",
			"middle",
			"end"
		][i]}" class="rng-tick">${esc(short(v))}</text>`).join("");
		const yt = [
			0,
			25,
			50,
			75,
			100
		].map((q) => `<line x1="${l}" x2="544" y1="${ys(q)}" y2="${ys(q)}" class="rng-grid"/><text x="52" y="${ys(q) + 3}" text-anchor="end" class="rng-tick">${q}%</text>`).join("");
		const pv = res.p[p], px = xs(pv), py = ys(p), mx = xs(res.ml);
		return `<svg id="rngSvg" viewBox="0 0 ${W} ${H}" class="rng-svg" role="img" aria-label="Curva S del costo total simulado: probabilidad acumulada de no superar cada costo. Estimado base ${esc(short(res.ml))}; P${p} ${esc(short(pv))}.">
    ${yt}${xt}
    <line x1="${mx}" x2="${mx}" y1="${t}" y2="200" class="rng-base"/><text x="${mx + 4}" y="24" class="rng-tick">Base</text>
    <path d="${path}" class="rng-line"/>
    <line x1="${px}" x2="${px}" y1="${py}" y2="200" class="rng-sel"/><line x1="${l}" x2="${px}" y1="${py}" y2="${py}" class="rng-sel"/>
    <circle cx="${px}" cy="${py}" r="5" class="rng-dot"/><text x="${Math.min(px + 9, 520)}" y="${py + 16}" class="rng-tick" font-weight="700">P${p}</text>
    <text x="301" y="236" text-anchor="middle" class="rng-cap">Costo total del estimado</text>
    <text x="14" y="107" text-anchor="middle" class="rng-cap" transform="rotate(-90 14 107)">Prob. de no superarlo</text>
    <line id="rngCross" x1="0" x2="0" y1="${t}" y2="200" class="rng-cross" style="display:none"/>
    <rect id="rngHit" x="${l}" y="${t}" width="486" height="186" fill="transparent"/>
  </svg>`;
	}
	function eventAdvisories() {
		if (!includeRisksOn()) return [];
		const ec = eventsCtx(), out = [];
		if (ec.source === "sin registro") out.push("Este proyecto no tiene Registro de Riesgos: la contingencia solo cubre la incertidumbre del estimado. Registra los riesgos para incluir los eventos discretos.");
		if (ec.events.length) out.push("Doble conteo: los rangos de las partidas deben expresar solo la incertidumbre del estimado (metrados, precios). Si ya incluyen los eventos del registro (p. ej. precio del acero, suelo, paros), esos riesgos se cuentan dos veces.");
		const g = getEng(), cpd = timeCostPerDay(), delayers = ec.events.filter((e) => e.days && e.targets && e.targets.length).length;
		if (ec.unmapped.length) out.push(!g ? "El proyecto no tiene cronograma (actividades y enlaces): el impacto en plazo de " + ec.unmapped.length + " riesgo(s) (" + ec.unmapped.slice(0, 4).join(", ") + (ec.unmapped.length > 4 ? "…" : "") + ") no se refleja, ni tampoco su costo." : ec.unmapped.length + " riesgo(s) con impacto en plazo no están ubicados en el cronograma (" + ec.unmapped.slice(0, 4).join(", ") + (ec.unmapped.length > 4 ? "…" : "") + "): su retraso, y el costo de ese retraso, no entran. Indica sus paquetes o actividades en el Registro de Riesgos.");
		if (delayers && cpd <= 0) out.push("Estos riesgos retrasan el proyecto, pero no hay un costo por día de extensión del plazo: ese retraso no se traduce a costo (AACE 40R-08). Defínelo (gastos generales, dirección, alquileres por día).");
		if (delayers && cpd > 0) out.push("Costo del plazo: el rango de costo de cada riesgo debe incluir solo costos DIRECTOS. Lo que depende del tiempo (gastos generales, dirección, alquileres) ya lo calcula la simulación (días de extensión × costo por día); si también está en el rango del riesgo, se cuenta dos veces.");
		if (g && net && net.hasElapsedLags) out.push("La red tiene desfases en días transcurridos («ed»): sin fecha de inicio real el cálculo los aproxima, así que el plazo base puede diferir del de Cronograma/CPM.");
		if (ec.excluded.length) out.push(ec.excluded.length + " riesgo(s) abierto(s) no se pueden cuantificar y no suman a la contingencia: " + ec.excluded.slice(0, 4).map((x) => x.code + " (" + x.reason + ")").join(", ") + (ec.excluded.length > 4 ? "…" : "") + ".");
		if (ec.responseCost > 0) out.push("El costo de las respuestas planificadas (" + fmt(ec.responseCost) + ") debe estar dentro del estimado base o de la línea base, no en la contingencia.");
		return out;
	}
	function renderEvents(res, p) {
		const box = $("rngEvents");
		if (!includeRisksOn()) {
			box.innerHTML = `<div class="muted small">Los eventos de riesgo NO se incluyen: la contingencia cubre solo la incertidumbre de las partidas.</div>`;
			return;
		}
		const ec = eventsCtx();
		const src = ec.source === "registro" ? "Registro de Riesgos del proyecto" : ec.source === "ejemplo" ? "caso de ejemplo DISTRIB+ (modo independiente)" : "sin Registro de Riesgos";
		if (!ec.events.length) {
			box.innerHTML = `<div class="muted small"><b>Fuente:</b> ${esc(src)}. ${ec.source === "sin registro" ? "" : "No hay riesgos abiertos con probabilidad e impacto en costo o en plazo cuantificados."}</div>`;
			return;
		}
		const g = getEng(), cpd = timeCostPerDay(), s = res ? res.schedule : null;
		const only = simulate(corrValue(), false), direct = simulate(corrValue(), true, false);
		const cA = only ? contingencyAt(only, p).amount : 0, cB = direct ? contingencyAt(direct, p).amount : 0, cC = res ? contingencyAt(res, p).amount : 0;
		const plazoDe = (e) => {
			if (!e.days || !e.targets || !e.targets.length || !g) return "—";
			const d = {};
			e.targets.forEach((id) => {
				d[id] = e.sign * e.days.likely;
			});
			const dur = g.duration(d);
			return e.days.likely + " d → " + (dur === null ? "—" : fmtDays(Math.round(Math.abs(dur - g.base) * 10) / 10));
		};
		const rows = ec.events.slice(0, 14).map((e) => `<tr><td class="mono">${esc(e.code)}</td><td>${esc(e.title)}</td><td>${e.type === "amenaza" ? "Amenaza" : "Oportunidad"}</td><td class="num">${Math.round(e.prob * 100)} %</td><td class="num">${e.low || e.likely || e.high ? fmt(e.low) + " / " + fmt(e.likely) + " / " + fmt(e.high) : "—"}</td><td class="num">${plazoDe(e)}</td><td class="muted">${esc(e.basis)}</td><td class="num">${e.sign < 0 ? "−" : ""}${fmt(e.prob * (e.low + e.likely + e.high) / 3)}</td></tr>`).join("");
		const showTime = !!s && cpd > 0;
		const sched = s && g ? `<div class="eyebrow" style="margin:14px 0 6px">Plazo con los riesgos (CPM real · reserva de plazo)</div>
    <table class="rng-res" style="max-width:520px"><thead><tr><th>Confianza</th><th class="num">Duración</th><th class="num">Reserva de plazo</th><th>Fin</th></tr></thead><tbody>
      <tr><td>Plan (sin riesgos)</td><td class="num">${fmtDays(s.base)}</td><td class="num">—</td><td>${esc(finishOf(s.base)) || "—"}</td></tr>
      ${[
			50,
			70,
			80,
			90
		].map((q) => `<tr class="${q === p ? "rng-selrow" : ""}"><td>P${q}${q === p ? " · decisión" : ""}</td><td class="num">${fmtDays(s.p[q])}</td><td class="num">${fmtDays(Math.max(0, s.p[q] - s.base))}</td><td>${esc(finishOf(s.p[q])) || "—"}</td></tr>`).join("")}</tbody></table>
    <div class="muted" style="font-size:11.5px;margin-top:6px">${s.events} evento(s) retrasan actividades del cronograma · probabilidad de terminar después de lo previsto ${Math.round(s.probDelay * 1e3) / 10} % · retraso medio ${fmtDays(Math.round((s.mean - s.base) * 10) / 10)}${cpd > 0 ? " · costo medio de la extensión " + fmt(s.timeCostMean) + " (a " + fmt(cpd) + " por día)" : ""}. Es la misma simulación del Registro de Riesgos (mismos eventos y semilla).</div>` : "";
		box.innerHTML = `<div class="muted small" style="margin-bottom:6px"><b>Fuente:</b> ${esc(src)} · ${ec.open} riesgo(s) abierto(s): <b>${ec.events.length}</b> entran a la simulación${ec.excluded.length ? ", " + ec.excluded.length + " sin cuantificar" : ""}. La contingencia cubre la exposición que <b>queda tras la respuesta</b> (residual).</div>
    <div style="overflow-x:auto"><table class="rng-res"><thead><tr><th>Cód.</th><th>Riesgo</th><th>Tipo</th><th class="num">Prob.</th><th class="num">Costo directo: mín / más prob. / máx</th><th class="num">Plazo: más prob. → fin del proyecto</th><th>Base</th><th class="num">Valor esperado (costo)</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="7">Valor esperado neto de los eventos${ec.events.length > 14 ? " (incluye los " + (ec.events.length - 14) + " no mostrados)" : ""}</td><td class="num">${fmt(ec.ev)}</td></tr></tfoot></table></div>
    <table class="rng-res" style="margin-top:10px;max-width:520px"><thead><tr><th>Contingencia P${p}</th><th class="num">Monto</th></tr></thead><tbody>
      <tr><td>Solo incertidumbre de las partidas</td><td class="num">${fmt(cA)}</td></tr>
      <tr><td>+ aporte de los eventos de riesgo (costo directo)</td><td class="num">${fmt(cB - cA)}</td></tr>
      ${showTime ? `<tr><td>+ costo de la extensión del plazo (días × costo por día)</td><td class="num">${fmt(cC - cB)}</td></tr>` : ""}
      <tr class="rng-selrow"><td>Contingencia total${showTime ? " (partidas + eventos + plazo)" : " (partidas + eventos)"}</td><td class="num">${fmt(cC)}</td></tr></tbody></table>${sched}`;
	}
	function renderRange(calc, base) {
		const res = calc.res, p = pctNum(), cls = CLASSES[state.curClass];
		const lineIn = (i, f, v, w, type = "text", extra = "") => `<input ${type === "number" ? "type=\"number\" step=\"0.1\"" : ""} class="rng-in" style="width:${w}" value="${escA(v)}" data-i="${i}" data-f="${f}" onchange="rangeEdit(this)" ${extra}>`;
		$("rngBody").innerHTML = state.ranges.length ? state.ranges.map((l, i) => {
			const pr = lineProblems(l), ml = Number(l.ml);
			const okv = !pr.length;
			return `<tr class="${okv ? "" : "rng-bad"}">
      <td>${lineIn(i, "name", l.name, "100%", "text", "aria-label=\"Nombre de la partida\"")}</td>
      <td>${lineIn(i, "ml", l.ml, "110px", "number", "aria-label=\"Costo más probable\"")}</td>
      <td>${lineIn(i, "lowPct", l.lowPct, "70px", "number", "aria-label=\"Mínimo en porcentaje\"")}</td>
      <td>${lineIn(i, "highPct", l.highPct, "70px", "number", "aria-label=\"Máximo en porcentaje\"")}</td>
      <td class="num muted">${okv ? fmt(ml * (1 + Number(l.lowPct) / 100)) : "—"}</td><td class="num muted">${okv ? fmt(ml * (1 + Number(l.highPct) / 100)) : "—"}</td>
      <td>${lineIn(i, "basis", l.basis || "", "100%", "text", "placeholder=\"Fundamento del rango\" aria-label=\"Fundamento del rango\"")}${okv ? "" : `<div class="rng-msg">⚠ ${esc(pr.join("; "))}</div>`}</td>
      <td><button class="btn ghost sm" onclick="delRange(${i})" title="Eliminar partida" aria-label="Eliminar partida">✕</button></td></tr>`;
		}).join("") : `<tr><td colspan="8" class="muted">Sin partidas: agrégalas abajo o tráelas del estimado de costos.</td></tr>`;
		const sumMl = state.ranges.reduce((s, l) => s + (lineProblems(l).length ? 0 : Number(l.ml)), 0);
		$("rngFoot").innerHTML = `<tr style="font-weight:700"><td>Σ partidas</td><td class="num">${fmt(sumMl)}</td><td colspan="6" class="muted" style="font-weight:500;font-size:11.5px">${base ? "Cubren el " + (sumMl / base * 100).toFixed(1) + " % del costo base " + fmt(base) : "Define el costo base"}</td></tr>`;
		const warn = rangeAdvisories(state.ranges, res, base, {
			lo: cls.lo,
			hi: cls.hi
		}).concat(eventAdvisories());
		renderEvents(res, p);
		$("rngWarn").innerHTML = warn.length ? "<b>Revisa:</b><ul>" + warn.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>" : "";
		$("rngWarn").style.display = warn.length ? "block" : "none";
		if (!res) {
			$("rngResults").innerHTML = "";
			return;
		}
		const row = (q) => {
			const c = contingencyAt(res, q);
			return `<tr class="${q === p ? "rng-selrow" : ""}"><td>P${q}${q === p ? " · decisión" : ""}</td><td class="num">${fmt(res.p[q])}</td><td class="num">${fmt(c.amount)}</td><td class="num">${res.ml ? (c.amount / res.ml * 100).toFixed(1) + " %" : "—"}</td></tr>`;
		};
		const sens = [
			0,
			.3,
			.6,
			1
		].map((rho) => {
			const s = simulate(rho);
			const c = s ? contingencyAt(s, p).amount : 0;
			const cur = Math.abs(rho - corrValue()) < .005;
			return `<tr class="${cur ? "rng-selrow" : ""}"><td>${Math.round(rho * 100)} %${cur ? " · actual" : ""}</td><td class="num">${fmt(c)}</td><td class="num">${res.ml ? (c / res.ml * 100).toFixed(1) + " %" : "—"}</td></tr>`;
		}).join("");
		$("rngResults").innerHTML = `<div class="rng-grid2">
      <div>
        <div class="eyebrow" style="margin:0 0 6px">Distribución del costo total</div>
        <table class="rng-res"><thead><tr><th>Percentil</th><th class="num">Costo total</th><th class="num">Contingencia (P − base)</th><th class="num">% del base</th></tr></thead>
          <tbody>${[
			10,
			50,
			70,
			80,
			90
		].map(row).join("")}</tbody></table>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Estimado base Σ más probable ${fmt(res.ml)} · media ${fmt(res.mean)} · σ ${fmt(res.sd)} · rango simulado ${fmt(res.min)} – ${fmt(res.max)} · ${res.iterations.toLocaleString("es-PE")} iteraciones · correlación ${Math.round(res.correlation * 100)} % · semilla ${res.seed}</div>
        <div class="eyebrow" style="margin:14px 0 6px">Efecto de la correlación (contingencia P${p})</div>
        <table class="rng-res"><thead><tr><th>Correlación entre partidas</th><th class="num">Contingencia</th><th class="num">% del base</th></tr></thead><tbody>${sens}</tbody></table>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Con correlación 0 % las partidas se tratan como independientes y la dispersión del total se <b>subestima</b>.</div>
      </div>
      <div>${curveSvg(res, p)}<div id="rngHover" class="muted" style="font-size:12px;min-height:18px;margin-top:4px">Pasa el cursor sobre la curva para leer el costo de cada percentil.</div></div>
    </div>`;
		const hit = document.getElementById("rngHit"), cross = document.getElementById("rngCross"), out = document.getElementById("rngHover");
		if (hit && cross && out) {
			const svg = document.getElementById("rngSvg"), W = 560, l = 58, lo = Math.min(res.curve[0], res.ml), span = Math.max(res.curve[98], res.ml) - lo || 1;
			hit.addEventListener("mousemove", (e) => {
				const rect = svg.getBoundingClientRect(), vx = (e.clientX - rect.left) / (rect.width || 1) * W;
				const cost = lo + Math.max(0, Math.min(1, (vx - l) / 486)) * span;
				let q = 1;
				while (q < 99 && res.curve[q] < cost) q++;
				cross.setAttribute("x1", String(vx));
				cross.setAttribute("x2", String(vx));
				cross.style.display = "";
				out.textContent = "P" + q + ": " + fmt(res.curve[q - 1]) + " · contingencia " + fmt(Math.max(0, res.curve[q - 1] - res.ml));
			});
			hit.addEventListener("mouseleave", () => {
				cross.style.display = "none";
			});
		}
	}
	function onContMethod() {
		userEdited = true;
		recalcCont();
		save();
	}
	function addRange() {
		userEdited = true;
		const name = $("rngName"), ml = +$("rngMl").value;
		if (!name.value.trim() || !(ml > 0)) {
			name.focus();
			name.style.borderColor = "#dc3546";
			showToast("Indica el nombre y un costo más probable mayor que cero.");
			return;
		}
		name.style.borderColor = "";
		const cls = CLASSES[state.curClass], loI = $("rngLo").value, hiI = $("rngHi").value;
		state.ranges.push({
			id: "m-" + (Date.now().toString(36) + state.ranges.length),
			name: name.value.trim(),
			ml,
			lowPct: loI === "" ? cls.lo : +loI,
			highPct: hiI === "" ? cls.hi : +hiI,
			basis: $("rngBasis").value.trim()
		});
		name.value = "";
		$("rngMl").value = "";
		$("rngLo").value = "";
		$("rngHi").value = "";
		$("rngBasis").value = "";
		recalcCont();
		save();
		flash();
	}
	function delRange(i) {
		userEdited = true;
		state.ranges.splice(i, 1);
		recalcCont();
		save();
	}
	function rangeEdit(el) {
		const l = state.ranges[+el.dataset.i];
		if (!l) return;
		userEdited = true;
		const f = el.dataset.f;
		if (f === "name") l.name = el.value;
		else if (f === "basis") l.basis = el.value;
		else l[f] = el.value === "" ? NaN : +el.value;
		recalcCont();
		save();
	}
	function mergePulled(items) {
		const cls = CLASSES[state.curClass], prev = new Map(state.ranges.map((l) => [l.id, l]));
		const pulled = items.map((it) => {
			const old = prev.get(it.id);
			return old ? {
				...old,
				name: it.name,
				ml: it.ml
			} : {
				id: it.id,
				name: it.name,
				ml: it.ml,
				lowPct: cls.lo,
				highPct: cls.hi,
				basis: ""
			};
		});
		state.ranges = pulled.concat(state.ranges.filter((l) => l.id.indexOf("r-") !== 0));
		userEdited = true;
		recalcCont();
		save();
		flash();
		showToast(pulled.length + " partida(s) traídas. Los rangos nuevos parten de la clase " + state.curClass + ": ajústalos y fundaméntalos.");
	}
	function pullRangesFromEstimate() {
		if (!gpiOn()) {
			showToast("Abre este módulo desde el Panel de Control para conectar el estimado.");
			return;
		}
		const G = GPI;
		const rows = G.util.costEstimateRows(G.getModule("costEstimate"), G.getModule("activities"), G.getModule("wbs"));
		const by = /* @__PURE__ */ new Map();
		rows.forEach((r) => {
			if (r.subtotal && r.subtotal > 0) {
				const k = by.get(r.leafId) || {
					name: (r.code + " " + r.leafName).trim(),
					ml: 0
				};
				k.ml += r.subtotal;
				by.set(r.leafId, k);
			}
		});
		if (!by.size) {
			showToast("Aún no hay actividades con Cantidad y Precio unitario cargados en Estimar los Costos.");
			return;
		}
		mergePulled(Array.from(by, ([id, v]) => ({
			id: "r-" + id,
			name: v.name,
			ml: Math.round(v.ml)
		})));
	}
	function pullRangesFromWbs() {
		if (!gpiOn()) {
			showToast("Abre este módulo desde el Panel de Control para conectar la EDT.");
			return;
		}
		const G = GPI, wbs = G.getModule("wbs");
		const items = G.util.wbsLeaves(wbs).map((lf) => ({
			id: "r-" + lf.id,
			name: (lf.code + " " + lf.name).trim(),
			ml: Math.round(Number(wbs.nodes[lf.id].cost) || 0)
		})).filter((x) => x.ml > 0);
		if (!items.length) {
			showToast("La EDT del proyecto activo aún no tiene costos cargados en WBS Builder.");
			return;
		}
		mergePulled(items);
	}
	function applyClassRange() {
		const cls = CLASSES[state.curClass];
		let n = 0;
		state.ranges.forEach((l) => {
			if (!String(l.basis || "").trim()) {
				l.lowPct = cls.lo;
				l.highPct = cls.hi;
				n++;
			}
		});
		userEdited = true;
		recalcCont();
		save();
		showToast(n ? "Rango de la clase " + state.curClass + " aplicado a " + n + " partida(s) sin fundamento." : "Todas las partidas ya tienen fundamento: no se cambió ninguna.");
	}
	function escPackages() {
		getEng();
		if (escCtx) return escCtx;
		const out = {
			pkgs: [],
			note: ""
		};
		try {
			if (typeof GPI === "undefined" || !GPI || !GPI.util || !GPI.util.cpm) {
				out.note = "No cargó gpi-core.js: sin el núcleo no se puede armar el cronograma.";
				escCtx = out;
				return out;
			}
			const connected = gpiOn(), m = connected ? null : sampleScheduleModules();
			const wbs = connected ? GPI.getModule("wbs") : m.wbs;
			const act = connected ? GPI.getModule("activities") : m.activities;
			const sched = connected ? GPI.getModule("schedule") : m.schedule;
			const leaves = GPI.util.wbsLeaves(wbs);
			const costOf = {};
			if (connected) {
				GPI.util.costEstimateRows(GPI.getModule("costEstimate"), act, wbs).forEach((r) => {
					if (r.subtotal && r.subtotal > 0) costOf[r.leafId] = (costOf[r.leafId] || 0) + r.subtotal;
				});
				leaves.forEach((l) => {
					if (!costOf[l.id]) {
						const w = wbs && wbs.nodes[l.id] ? Number(wbs.nodes[l.id].cost) : 0;
						if (w > 0) costOf[l.id] = w;
					}
				});
			} else leaves.forEach((l) => {
				if (EVM_SAMPLE_COSTS[l.code]) costOf[l.id] = EVM_SAMPLE_COSTS[l.code];
			});
			const spans = {};
			if (net && eng && net.startDate) {
				const bl = connected && sched ? normalizeBaseline(sched.baseline) : null;
				const rows = {};
				if (bl) bl.snapshot.rows.forEach((r) => {
					rows[r.id] = r;
				});
				else Object.keys(eng.rows).forEach((id) => {
					rows[id] = eng ? eng.rows[id] : {
						es: 0,
						ef: 0
					};
				});
				const cal = net.calendar, util = GPI.util, start = util.parseISO(net.startDate);
				const dateAt = (i) => util.addWorkingDays(start, Math.max(0, Math.ceil(i - 1e-9)), cal);
				const idx = {};
				net.nodes.filter((n) => !n.isMilestone && n.leafId).forEach((n) => {
					const r = rows[n.id];
					if (!r) return;
					const s = idx[n.leafId] || (idx[n.leafId] = {
						es: r.es,
						ef: r.ef
					});
					s.es = Math.min(s.es, r.es);
					s.ef = Math.max(s.ef, r.ef);
				});
				Object.keys(idx).forEach((id) => {
					spans[id] = {
						start: dateAt(idx[id].es),
						end: dateAt(idx[id].ef - 1)
					};
				});
			} else out.note = connected ? "El proyecto aún no tiene actividades y enlaces (Cronograma/CPM) ni fecha de inicio: sin ellos no se sabe cuándo se gasta cada paquete." : "No se pudo armar el cronograma del ejemplo.";
			out.pkgs = leaves.filter((l) => costOf[l.id]).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name,
				cost: costOf[l.id],
				start: spans[l.id] ? spans[l.id].start : null,
				end: spans[l.id] ? spans[l.id].end : null
			}));
			if (!out.pkgs.length && !out.note) out.note = connected ? "Ningún paquete de trabajo tiene costo: carga la estimación en Estimar los Costos o el costo de los paquetes en WBS Builder." : "El ejemplo no tiene paquetes.";
		} catch (e) {
			out.note = "No se pudo armar el contexto del proyecto.";
		}
		escCtx = out;
		return out;
	}
	var ocIds = /* @__PURE__ */ new WeakMap();
	var ocSeq = 0;
	function escDelays() {
		if (!includeRisksOn()) return null;
		const g = getEng();
		if (!g) return null;
		const ev = eventsCtx().events;
		const oc = ev.length ? outcomesFor(ev, g) : void 0;
		return oc && oc.ext ? oc.ext : null;
	}
	function escSim(plan, pkgs) {
		const d = escDelays();
		if (d && !ocIds.has(d)) ocIds.set(d, ++ocSeq);
		const key = JSON.stringify([
			plan.baseDate,
			plan.accounts.map((a) => [
				a.id,
				a.rates,
				a.low,
				a.high
			]),
			plan.defaultMix,
			plan.packages,
			plan.correlation,
			pkgs.map((p) => [
				p.id,
				p.cost,
				p.start,
				p.end
			]),
			d ? ocIds.get(d) : 0
		]);
		if (!(key in escSimCache)) {
			if (Object.keys(escSimCache).length > 12) Object.keys(escSimCache).forEach((k) => {
				delete escSimCache[k];
			});
			escSimCache[key] = simulateEscalation(plan, pkgs, {
				iterations: DEFAULT_ITERATIONS,
				seed: DEFAULT_SEED,
				delaysWork: d
			});
		}
		return escSimCache[key];
	}
	var escMethodVal = () => $("escMethod").value === "simple" ? "simple" : "indices";
	function escCalc(base, cont) {
		const method = escMethodVal(), ctx = method === "indices" ? escPackages() : {
			pkgs: [],
			note: ""
		};
		state.esc.method = method;
		if (method === "simple") {
			const esc = simpleEscalation(base, +$("inflRate").value || 0, +$("inflYears").value || 0), a = simpleMethodAdvisory(state.curClass);
			return {
				method,
				esc,
				central: esc,
				funded: base,
				scale: 1,
				onCont: 0,
				res: null,
				sim: null,
				provLabel: "escalación simple",
				provQ: null,
				adv: a ? [a] : [],
				ctx
			};
		}
		const plan = state.esc;
		plan.baseDate = $("boeDate").value || "";
		const res = escalate(plan, ctx.pkgs), sim = res.ok ? escSim(plan, ctx.pkgs) : null, prov = provisionFactor(plan, res, sim);
		const funded = base + (plan.onContingency ? cont : 0), scale = res.base > 0 ? base / res.base : 0;
		const adv = escalationAdvisories(plan, res, sim, {
			classNum: state.curClass,
			riskTitles: riskCtx().risks.map((r) => r.title || "")
		});
		if (ctx.note && !res.ok) adv.unshift({
			code: "X7",
			severity: "riesgo",
			text: ctx.note
		});
		return {
			method,
			esc: res.ok ? prov.factor * funded : 0,
			central: res.ok ? res.factor * funded : 0,
			funded,
			scale,
			onCont: plan.onContingency ? cont : 0,
			res,
			sim,
			provLabel: prov.label,
			provQ: plan.provision === "central" || !sim ? null : Number(plan.provision.slice(1)),
			adv,
			ctx
		};
	}
	var pct1 = (x) => (x * 100).toFixed(1) + " %";
	var escInputsKey = "";
	function escYears(ctx) {
		const ys = new Set(horizonYears($("boeDate").value, ctx.pkgs));
		state.esc.accounts.forEach((a) => Object.keys(a.rates).forEach((y) => ys.add(Number(y))));
		return Array.from(ys).sort((a, b) => a - b);
	}
	function renderEscInputs(ctx) {
		const p = state.esc, years = escYears(ctx), bd = $("boeDate").value;
		escInputsKey = JSON.stringify([
			years,
			ctx.pkgs.map((k) => k.id),
			bd
		]);
		const acc = p.accounts.map((a) => `<tr><td><b>${esc(ACCOUNT_LABEL[a.id])}</b></td>
      <td><input class="esc-in wide" data-e="src" data-acc="${a.id}" value="${escA(a.source)}" placeholder="¿De qué economista o fuente sale este pronóstico?" aria-label="Fuente del pronóstico de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td>
      ${years.map((y) => `<td class="num"><input class="esc-in" type="number" step="0.1" data-e="rate" data-acc="${a.id}" data-year="${y}" value="${a.rates[String(y)] === void 0 ? "" : a.rates[String(y)]}" aria-label="Tasa anual ${y} de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td>`).join("")}
      <td class="num"><input class="esc-in" type="number" step="0.1" max="0" data-e="low" data-acc="${a.id}" value="${a.low}" aria-label="Incertidumbre mínima de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td>
      <td class="num"><input class="esc-in" type="number" step="0.1" min="0" data-e="high" data-acc="${a.id}" value="${a.high}" aria-label="Incertidumbre máxima de ${escA(ACCOUNT_LABEL[a.id])}" onchange="escEdit(this)"></td></tr>`).join("");
		const mixIn = (id, m, ph, attrs) => `<input class="esc-in" style="width:56px" type="number" min="0" step="1" ${attrs} value="${m && m[id] ? m[id] : ""}" placeholder="${ph}" aria-label="Composición ${escA(ACCOUNT_LABEL[id])} (%)" onchange="escEdit(this)">`;
		const pk = ctx.pkgs.map((k) => {
			const o = p.packages[k.id] || {};
			return `<tr><td class="mono">${esc(k.code)}</td><td>${esc(k.name)}</td>
      ${ACCOUNT_IDS.map((id) => `<td class="num">${mixIn(id, o.mix, String(p.defaultMix[id] || 0), `data-e="pmix" data-pid="${escA(k.id)}" data-acc="${id}"`)}</td>`).join("")}
      <td><input class="esc-in date" type="date" data-e="lock" data-pid="${escA(k.id)}" value="${escA(o.lock || "")}" aria-label="Fecha de fijación del precio de ${escA(k.name)}" onchange="escEdit(this)"></td></tr>`;
		}).join("");
		$("escInputs").innerHTML = `
    <div class="note" style="margin:0 0 10px">Fecha base de precios: <b>${esc(bd) || "— (defínela en la pestaña 02, Basis of Estimate)"}</b>. El índice vale 1,00 en esa fecha. ${ctx.pkgs.length ? "<b>" + ctx.pkgs.length + " paquete(s)</b> con costo se reparten en el tiempo según sus fechas del cronograma." : ""}</div>
    <div class="eyebrow esc-sec">Pronóstico de índices por cuenta de costo</div>
    <div style="overflow-x:auto"><table class="esc-tbl"><thead><tr><th>Cuenta</th><th>Fuente del pronóstico</th>${years.map((y) => `<th class="num">${y} (% anual)</th>`).join("")}<th class="num" title="Cuánto puede ser MENOR la tasa que el pronóstico (puntos porcentuales, ≤ 0)">Mín (pp)</th><th class="num" title="Cuánto puede ser MAYOR la tasa que el pronóstico (puntos porcentuales, ≥ 0)">Máx (pp)</th></tr></thead><tbody>${acc}</tbody></table></div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">Tasa anual esperada de cada cuenta por año calendario (más allá del último año se mantiene la última). «Mín / Máx» es el rango de incertidumbre de la tasa para la simulación (AACE 68R-11). El pronóstico debe venir de un economista o de una fuente reconocida: <b>no extrapoles</b> la tendencia pasada.</div>
    <div style="margin-top:14px;display:grid;grid-template-columns:minmax(300px,1.6fr) minmax(200px,1fr) minmax(160px,.7fr);gap:18px;align-items:start">
      <div><div class="eyebrow" style="margin-bottom:6px">Composición por omisión del costo (%)</div><div style="display:flex;gap:8px;flex-wrap:wrap">${ACCOUNT_IDS.map((id) => `<label class="muted small" style="display:flex;flex-direction:column;gap:2px">${esc(ACCOUNT_LABEL[id])}<input class="esc-in" type="number" min="0" step="1" data-e="dmix" data-acc="${id}" value="${p.defaultMix[id] || 0}" onchange="escEdit(this)"></label>`).join("")}</div></div>
      <div><label class="f"><span>Escalación que se financia en el presupuesto</span><select class="mono" data-e="prov" onchange="escEdit(this)">${PROVISIONS.map((q) => `<option value="${q}" ${p.provision === q ? "selected" : ""}>${esc(PROVISION_LABEL[q])}</option>`).join("")}</select></label></div>
      <div><label class="f"><span>Correlación entre las cuentas (%)</span><input class="mono" type="number" min="0" max="100" step="5" data-e="corr" value="${Math.round(p.correlation * 100)}" onchange="escEdit(this)"></label></div>
    </div>
    <label class="rng-chk" style="margin-top:6px"><input type="checkbox" data-e="onCont" ${p.onContingency ? "checked" : ""} onchange="escEdit(this)"><span><b>Escalar también la contingencia</b> <span class="muted">(58R-10: «Escalation on Contingency»; la contingencia se gasta a lo largo del proyecto, como el costo base)</span></span></label>
    <details class="esc-det"><summary>Paquetes: composición del costo por cuenta y fijación del precio (${ctx.pkgs.length})</summary>
      <div class="muted" style="font-size:11.5px;margin:8px 0">Cada paquete usa la composición por omisión salvo que la cambies. Con <b>fecha de fijación del precio</b> (contrato o compra a precio fijo) el índice deja de correr desde esa fecha: la exposición a la escalación termina cuando el precio se cierra.</div>
      <div style="overflow-x:auto"><table class="esc-tbl"><thead><tr><th>Cód.</th><th>Paquete</th>${ACCOUNT_IDS.map((id) => `<th class="num">${esc(ACCOUNT_LABEL[id])} %</th>`).join("")}<th>Precio fijado el</th></tr></thead><tbody>${pk || `<tr><td colspan="7" class="muted">${esc(ctx.note || "Sin paquetes con costo.")}</td></tr>`}</tbody></table></div>
    </details>`;
	}
	function escCurveSvg(sim, funded, provQ) {
		const W = 560, H = 220, l = 58, t = 14, cv = sim.curve.map((f) => f * funded), det = sim.det * funded;
		const lo = Math.min(cv[0], det), hi = Math.max(cv[98], det), span = hi - lo || 1;
		const xs = (v) => l + (v - lo) / span * 486, ys = (q) => t + (100 - q) / 100 * 166;
		const short = (v) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + " M" : Math.round(v).toLocaleString("es-PE");
		const path = cv.map((v, i) => (i ? "L" : "M") + xs(v).toFixed(1) + "," + ys(i + 1).toFixed(1)).join(" ");
		const xt = [
			lo,
			lo + span / 2,
			hi
		].map((v, i) => `<text x="${xs(v).toFixed(1)}" y="198" text-anchor="${[
			"start",
			"middle",
			"end"
		][i]}" class="rng-tick">${esc(short(v))}</text>`).join("");
		const yt = [
			0,
			25,
			50,
			75,
			100
		].map((q) => `<line x1="${l}" x2="544" y1="${ys(q)}" y2="${ys(q)}" class="rng-grid"/><text x="52" y="${ys(q) + 3}" text-anchor="end" class="rng-tick">${q}%</text>`).join("");
		const mk = provQ ? (() => {
			const px = xs(sim.p[provQ] * funded), py = ys(provQ);
			return `<line x1="${px}" x2="${px}" y1="${py}" y2="180" class="rng-sel"/><circle cx="${px}" cy="${py}" r="5" class="rng-dot"/><text x="${Math.min(px + 9, 520)}" y="${py + 16}" class="rng-tick" font-weight="700">P${provQ}</text>`;
		})() : "";
		return `<svg viewBox="0 0 ${W} ${H}" class="rng-svg" role="img" aria-label="Curva S de la escalación simulada: probabilidad acumulada de no superar cada monto. Pronóstico central ${esc(short(det))}.">
    ${yt}${xt}<line x1="${xs(det)}" x2="${xs(det)}" y1="${t}" y2="180" class="rng-base"/><text x="${xs(det) + 4}" y="24" class="rng-tick">Central</text>
    <path d="${path}" class="rng-line"/>${mk}
    <text x="301" y="216" text-anchor="middle" class="rng-cap">Escalación (monto)</text>
  </svg>`;
	}
	function renderEscResults(c) {
		const box = $("escResults"), res = c.res, sim = c.sim;
		const adv = c.adv.length ? `<div class="eyebrow esc-sec">Revisa</div><ul class="esc-adv">${c.adv.map((a) => `<li class="${a.severity}"><b class="cd">${a.code}</b>${esc(a.text)}</li>`).join("")}</ul>` : "";
		if (!res || !res.ok) {
			box.innerHTML = `<div class="note"><b>Escalación = 0 por ahora.</b> Completa lo que falta:</div>${adv}`;
			return;
		}
		const k = c.scale;
		const kp = (lab, v, cap) => `<div class="kpi"><div class="lab">${lab}</div><div class="val neu">${v}</div><div class="cap">${cap}</div></div>`;
		const q = (n) => sim ? fmt(sim.p[n] * c.funded) : "—";
		const kpis = `<div class="kpis k5">${kp("Escalación central", fmt(c.central), pct1(res.factor) + " del costo · fecha media del gasto " + esc(res.midDate || "—"))}
    ${kp("Financiada", fmt(c.esc), esc(c.provLabel))}${kp("P50", q(50), "simulación")}${kp("P80", q(80), "simulación")}${kp("P90", q(90), "simulación")}</div>`;
		const byAcc = res.byAccount.map((a) => `<tr><td>${esc(a.label)}</td><td class="num">${fmt(a.base * k)}</td><td class="num">${fmt(a.esc * k)}</td><td class="num">${a.pct.toFixed(2)} %</td></tr>`).join("");
		const byYear = res.byYear.map((y) => `<tr><td>${y.year}</td><td class="num">${fmt(y.base * k)}</td><td class="num">${fmt(y.esc * k)}</td><td class="num">${fmt((y.base + y.esc) * k)}</td></tr>`).join("");
		const top = res.byPackage.slice().sort((a, b) => b.esc - a.esc).slice(0, 8).map((p) => `<tr><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}${p.undated ? ` <span class="muted small">(sin fechas)</span>` : ""}</td><td class="num">${fmt(p.cost * k)}</td><td class="num">${fmt(p.esc * k)}</td><td class="num">${p.pct.toFixed(2)} %</td><td class="muted small">${p.lock ? "precio fijado " + esc(p.lock) : ""}</td></tr>`).join("");
		const simTxt = sim && sim.sd < 1e-12 ? `Simulación Monte Carlo (AACE 68R-11): sin incertidumbre definida en los índices ni variable de plazo, todas las iteraciones dan el pronóstico central. Define el rango de las tasas (Mín / Máx) para medir la incertidumbre de la escalación.` : sim ? `Simulación Monte Carlo (AACE 68R-11): ${sim.iterations.toLocaleString("es-PE")} iteraciones (semilla ${sim.seed}, reproducible) · tasas de ${sim.uncertainAccounts} cuenta(s) con rango, correlación ${Math.round(sim.correlation * 100)} %${sim.withDelay ? " · con el retraso del cronograma del análisis integrado de riesgo (media " + Math.round(sim.delayMeanCal) + " d de calendario, P80 " + Math.round(sim.delayP80Cal) + " d)" : " · sin variable de plazo"}. El pronóstico central equivale al <b>P${Math.round(sim.probAtOrBelowDet * 100)}</b>: hay ${Math.round(sim.probAtOrBelowDet * 100)} % de probabilidad de que la escalación no lo supere. Media ${fmt(sim.mean * c.funded)} · σ ${fmt(sim.sd * c.funded)}.` : "";
		box.innerHTML = `${kpis}
    <div class="rng-grid2" style="margin-top:14px">
      <div>
        <div class="eyebrow esc-sec" style="margin-top:0">Por cuenta de costo</div>
        <table class="esc-tbl"><thead><tr><th>Cuenta</th><th class="num">Costo base</th><th class="num" title="Escalación del costo base (la de la contingencia se indica abajo)">Escalación</th><th class="num">% de la cuenta</th></tr></thead><tbody>${byAcc}</tbody></table>
        <div class="eyebrow esc-sec">Por año (flujo de caja)</div>
        <table class="esc-tbl"><thead><tr><th>Año</th><th class="num">Costo base</th><th class="num" title="Escalación del costo base (la de la contingencia se indica abajo)">Escalación</th><th class="num">Costo escalado</th></tr></thead><tbody>${byYear}</tbody></table>
        ${c.onCont ? `<div class="muted small" style="margin-top:8px">De la escalación financiada, <b>${fmt(c.funded > 0 ? c.esc * c.onCont / c.funded : 0)}</b> corresponde a la contingencia (${fmt(c.onCont)}), que se gasta a lo largo del proyecto como el costo base (58R-10, «Escalation on Contingency»).</div>` : ""}
      </div>
      <div>${sim ? escCurveSvg(sim, c.funded, c.provQ) : ""}</div>
    </div>
    <div class="eyebrow esc-sec">Paquetes con mayor escalación</div>
    <table class="esc-tbl"><thead><tr><th>Cód.</th><th>Paquete</th><th class="num">Costo</th><th class="num">Escalación</th><th class="num">%</th><th></th></tr></thead><tbody>${top}</tbody></table>
    ${simTxt ? `<div class="muted" style="font-size:11.5px;margin-top:10px">${simTxt}</div>` : ""}
    ${adv}
    <div class="note" style="margin-top:12px"><b>Qué cubre y qué no.</b> Escalación = cambio general de precios de mercado (incluye la inflación); <b>excluye</b> la contingencia (riesgos específicos del proyecto) y el tipo de cambio, que se estiman aparte. Se calcula por cuenta de costo con su propio índice, en el momento en que se gasta cada paquete (mensual) y hasta la fecha de fijación del precio si la hay. La simulación mide la incertidumbre de las <b>tasas</b> (rango por cuenta, correlacionadas) y el <b>retraso</b> del cronograma; no simula la incertidumbre del costo (ya está en la contingencia, que se escala) ni la forma de la curva de gasto (lineal por paquete). Las tasas y la forma de la distribución de la incertidumbre son datos del equipo: AACE recomienda que los aporte un economista.</div>`;
	}
	function renderEsc(c) {
		const on = c.method === "indices";
		$("escCard").style.display = on ? "block" : "none";
		$("escSimpleWrap").style.display = on ? "none" : "block";
		$("escMethod").value = c.method;
		$("escSummary").innerHTML = on ? c.res && c.res.ok ? `Escalación <b>${fmt(c.esc)}</b> (${c.res.base ? pct1(c.esc / (c.funded || 1)) : "—"} del costo ${c.onCont ? "base más contingencia" : "base"}) con <b>${esc(c.provLabel)}</b>${c.sim ? "; pronóstico central " + fmt(c.central) + "." : "."} Detalle, pronósticos por cuenta y simulación abajo.` : `<b>Sin escalación todavía:</b> ${c.adv.filter((a) => a.severity === "riesgo").map((a) => esc(a.text)).join(" ") || "completa el pronóstico de índices."}` : `Escalación simple <b>${fmt(c.esc)}</b>.${c.adv.length ? " " + c.adv.map((a) => esc(a.text)).join(" ") : ""}`;
		if (!on) return;
		if (escInputsKey === "" || escInputsKey !== JSON.stringify([
			escYears(c.ctx),
			c.ctx.pkgs.map((k) => k.id),
			$("boeDate").value
		])) renderEscInputs(c.ctx);
		renderEscResults(c);
	}
	function onEscMethod() {
		userEdited = true;
		state.esc.method = escMethodVal();
		escInputsKey = "";
		recalcCont();
		save();
	}
	function escEdit(el) {
		userEdited = true;
		const p = state.esc, e = el.dataset.e, acc = el.dataset.acc || "", a = p.accounts.find((x) => x.id === acc), v = el.value.trim(), n = v === "" ? NaN : Number(v);
		if (e === "src" && a) a.source = v;
		else if (e === "rate" && a) {
			const y = String(el.dataset.year);
			if (isFinite(n)) a.rates[y] = n;
			else delete a.rates[y];
		} else if (e === "low" && a) a.low = isFinite(n) ? Math.min(0, n) : 0;
		else if (e === "high" && a) a.high = isFinite(n) ? Math.max(0, n) : 0;
		else if (e === "dmix") {
			if (isFinite(n) && n > 0) p.defaultMix[acc] = n;
			else delete p.defaultMix[acc];
			if (!Object.keys(p.defaultMix).length) p.defaultMix = { ...DEFAULT_MIX };
		} else if (e === "pmix") {
			const pid = String(el.dataset.pid), o = p.packages[pid] || (p.packages[pid] = {}), m = o.mix || (o.mix = {});
			if (isFinite(n) && n > 0) m[acc] = n;
			else delete m[acc];
			if (!Object.keys(m).length) delete o.mix;
			if (!o.mix && !o.lock) delete p.packages[pid];
		} else if (e === "lock") {
			const pid = String(el.dataset.pid), o = p.packages[pid] || (p.packages[pid] = {});
			if (v) o.lock = v;
			else delete o.lock;
			if (!o.mix && !o.lock) delete p.packages[pid];
		} else if (e === "prov") p.provision = PROVISIONS.indexOf(v) >= 0 ? v : "central";
		else if (e === "corr") p.correlation = Math.max(0, Math.min(100, isFinite(n) ? n : 50)) / 100;
		else if (e === "onCont") p.onContingency = el.checked;
		recalcCont();
		save();
	}
	function recalcCont() {
		$("fxBandWrap").style.display = $("fxMode").value === "float" ? "block" : "none";
		const base = +$("baseCost").value || 0;
		const calc = contingencyCalc(base);
		const cont = calc.cont;
		const ec = escCalc(base, cont), escIdx = ec.esc;
		const fx = fxExposure(base, +$("fxShare").value || 0, +$("fxBand").value || 0, $("fxMode").value === "float");
		const escT = escIdx + fx;
		const bac = base + cont + escT;
		const mgmt = bac * ((+$("mgmtPct").value || 0) / 100);
		const total = bac + mgmt;
		renderContUi(calc, base);
		renderEsc(ec);
		$("kBase").textContent = fmt(base);
		$("kCont").textContent = fmt(cont);
		$("kContCap").textContent = calc.method === "manual" ? "manual" : $("contPct").value;
		$("kEsc").textContent = fmt(escIdx);
		$("kEscCap").textContent = ec.method === "indices" ? ec.provLabel : "escalación simple";
		$("kFx").textContent = fmt(fx);
		$("kBAC").textContent = fmt(bac);
		$("kMgmt").textContent = fmt(mgmt);
		$("kTotal").textContent = fmt(total);
		$("kContP").textContent = base ? (cont / base * 100).toFixed(1) + "%" : "—";
		$("kEscP").textContent = base ? (escIdx / base * 100).toFixed(1) + "%" : "—";
		state._budget = {
			base,
			cont,
			esc: escT,
			escIdx,
			fx,
			bac,
			mgmt,
			total
		};
		state._escCalc = ec;
		refreshBoe();
		renderAccuracy(base, cont, calc.res);
		renderCO();
	}
	function coBudget() {
		const b = state._budget;
		return b ? {
			bac: b.bac,
			cont: b.cont,
			mgmt: b.mgmt
		} : {
			bac: 0,
			cont: 0,
			mgmt: 0
		};
	}
	var todayISO = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	var escA = (s) => esc(s).replace(/"/g, "&quot;");
	var kindLabel = (k) => k && CO_KIND_LABEL[k] || "Sin clasificar";
	function effectText(r) {
		const e = orderEffect(r), sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt2(Math.abs(n)).replace(/^\S+\s/, "");
		if (r.fund === "Contingencia") return "BAC sin cambio · contingencia " + sg(e.dContingency);
		if (r.fund === "Financiamiento adicional") return "BAC " + sg(e.dBac) + " al incorporar · total " + sg(e.dTotal);
		return "BAC " + sg(e.dBac) + " al incorporar · reserva de gestión " + sg(e.dMgmt) + " · total sin cambio";
	}
	function riskOptions(ctx, selectedId, selectedCode) {
		const th = ctx.risks.filter((r) => r.type === "amenaza");
		return `<option value="">— Vincular riesgo —</option>${th.map((r) => `<option value="${escA(r.id)}" ${r.id === selectedId ? "selected" : ""}>${esc(r.code + " · " + (r.title || "sin título").slice(0, 44) + " (" + STATUS_LABEL$1[r.status] + ")")}</option>`).join("")}${selectedId && !th.some((r) => r.id === selectedId) ? `<option value="${escA(selectedId)}" selected>${esc((selectedCode || "?") + " (no está en el registro)")}</option>` : ""}`;
	}
	function authCell(r, i, pol, locked, usesReserve) {
		if (usesReserve || !hasTiers(pol)) return "";
		const need = requiredAuthority(r, pol), have = authLevelOf(r), ok = levelCovers(have, need);
		const opts = ["", ...AUTH_LEVELS].map((v) => `<option value="${v}" ${(have || "") === v ? "selected" : ""}>${v ? esc(AUTH_LABEL[v]) : "— Nivel de autoridad —"}</option>`).join("");
		return `<select class="mono" style="padding:3px 5px;max-width:150px;margin-top:5px;font-size:11px" data-i="${i}" data-f="authLevel" onchange="coEdit(this)" ${locked ? "disabled" : ""} aria-label="Nivel de autoridad con que se aprueba la orden ${escA(r.id)}">${opts}</select>
    <div class="${!locked && !ok ? "bad-txt" : "muted"}" style="font-size:11px;margin-top:3px" title="${escA(tiersText(pol, (n) => fmt2(n)))}">Política de reservas: requiere <b>${need ? esc(AUTH_LABEL[need]) : "—"}</b>${!locked && !ok ? " ⚠" : ""}</div>`;
	}
	function renderCO() {
		const tb = $("coBody");
		tb.innerHTML = "";
		const ctx = riskCtx(), refs = riskRefs(ctx);
		state.co.forEach((r, i) => {
			const locked = r.status !== "Pendiente";
			const usesReserve = r.fund !== FUND_CONT;
			const linked = r.riskId ? ctx.risks.find((x) => x.id === r.riskId) : void 0;
			const riskCell = r.kind !== "riesgo" ? "" : !locked ? `<select class="mono" style="padding:3px 5px;max-width:190px;margin-top:5px;font-size:11px" data-i="${i}" data-f="riskId" onchange="coEdit(this)" aria-label="Riesgo vinculado a la orden ${escA(r.id)}">${riskOptions(ctx, r.riskId, r.riskCode)}</select>` : `<div class="${r.riskId ? "muted" : "bad-txt"}" style="font-size:11px;margin-top:4px">${r.riskId ? "↳ " + esc(linked ? linked.code + " · " + linked.title : (r.riskCode || "?") + " (no está en el registro)") : "⚠ sin riesgo vinculado"}</div>`;
			const tr = document.createElement("tr");
			tr.innerHTML = `
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.desc)}</td>
      <td><span class="pill ${r.kind ? "ok" : "bad"}" title="${escA(r.kind ? CO_KIND_HINT[r.kind] : "Clasifica la orden antes de aprobarla")}">${esc(kindLabel(r.kind))}</span>${riskCell}</td>
      <td class="muted">${esc(r.cause)}</td>
      <td class="num">${fmt2(+r.cost)}</td>
      <td><span class="pill ${r.fund === "Contingencia" ? "ok" : "warn"}">${esc(r.fund)}</span></td>
      <td class="co-appr">
        <input class="mono" style="width:120px;padding:5px 7px" placeholder="Aprobador (CCB…)" value="${escA(r.approver || "")}" data-i="${i}" data-f="approver" onchange="coEdit(this)" ${locked ? "disabled" : ""} aria-label="Quién aprueba la orden ${escA(r.id)}">
        ${authCell(r, i, ctx.plan.reserves, locked, usesReserve)}
        ${usesReserve ? `<label style="display:block;font-size:11px;margin-top:4px"><input type="checkbox" data-i="${i}" data-f="sponsorAuth" onchange="coEdit(this)" ${r.sponsorAuth ? "checked" : ""} ${locked ? "disabled" : ""}> Sponsor autoriza</label>` : ""}
        ${r.approvedOn ? `<div class="muted" style="font-size:11px">${esc(r.approvedOn)}</div>` : ""}
      </td>
      <td><select class="mono" style="padding:5px 8px" data-i="${i}" onchange="coStatus(this)" ${r.baselined ? "disabled" : ""}>
        ${[
				"Pendiente",
				"Aprobada",
				"Rechazada"
			].map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td class="muted" style="font-size:11.5px">${esc(effectText(r))}</td>
      <td>${r.baselined ? `<span class="pill ok">${esc(r.baselined)}</span>` : r.status === "Aprobada" && usesReserve ? `<button class="btn sm" onclick="coBaseline(${i})" title="Incorpora esta orden a la línea base (crea una versión nueva)">Incorporar a la línea base</button>` : r.status === "Aprobada" ? `<span class="muted" style="font-size:11.5px">Dentro de la línea base</span>` : "—"}</td>
      <td><button class="btn ghost sm" onclick="delCO(${i})" title="Eliminar orden de cambio" aria-label="Eliminar orden de cambio">✕</button></td>`;
			tb.appendChild(tr);
		});
		const an = analyzeChangeOrders(state.co, coBudget());
		state._coTotals = an;
		$("coTotal").textContent = fmt2(an.approved);
		$("coSplit").textContent = `Contingencia ${fmt2(an.fromContingency)} · Reserva de gestión ${fmt2(an.fromMgmt)} · Financiamiento adicional ${fmt2(an.fromExtra)}`;
		const kp = (lab, val, cap) => `<div class="kpi"><div class="lab">${lab}</div><div class="val ${val < 0 ? "neg" : "neu"}">${fmt(val)}</div><div class="cap">${cap}</div></div>`;
		$("coKpis").innerHTML = kp("BAC vigente", an.bacCurrent, an.bacCurrent === an.bacInitial ? "línea base inicial" : "inicial " + fmt(an.bacInitial) + " + incorporado") + kp("Pendiente de incorporar", an.pendingBaseline, "aprobado, aún fuera de la línea base") + kp("Contingencia disponible", an.contingencyAvailable, "dentro de la línea base") + kp("Reserva de gestión disponible", an.mgmtAvailable, "fuera de la línea base · sponsor");
		$("blBody").innerHTML = state.baselines.length ? state.baselines.map((v) => `<tr><td class="mono">${esc(v.version)}</td><td>${esc(v.date)}</td><td>${esc(v.orderIds.join(", "))}</td><td class="num">${fmt2(v.bacBefore)}</td><td class="num">${fmt2(v.bacAfter)}</td><td>${esc(v.approver || "—")}</td></tr>`).join("") : `<tr><td class="muted" colspan="6">Sin cambios de línea base: el BAC vigente es el inicial.</td></tr>`;
		renderDrawdown(refs, an.contingencyAvailable);
		coPolicyHint();
		buildJSON();
	}
	function coPolicyHint() {
		const box = document.getElementById("coPolicyHint");
		if (!box) return;
		const pol = riskCtx().plan.reserves, fund = $("coFund").value, cost = +$("coCost").value || 0;
		let msg = "";
		if (fund !== "Contingencia") msg = "<b>Política de reservas:</b> " + esc(fund) + " está fuera de la línea base: la autoriza siempre el <b>Sponsor</b>, sin importar el monto.";
		else if (hasTiers(pol)) {
			const need = requiredAuthority({
				fund,
				cost
			}, pol);
			msg = "<b>Política de reservas:</b> " + (cost > 0 ? "una orden de " + fmt2(cost) + " con cargo a contingencia la autoriza el <b>" + esc(AUTH_LABEL[need]) + "</b>" : "la contingencia la libera el nivel que corresponde al monto") + " (" + esc(tiersText(pol, (n) => fmt2(n))) + ").";
		}
		box.style.display = msg ? "block" : "none";
		box.innerHTML = msg;
	}
	function renderDrawdown(refs, available) {
		const dd = contingencyByRisk(state.co, refs), ec = eventsCtx();
		const al = contingencyAlert(available, coBudget().cont, riskCtx().plan.reserves);
		const alertHtml = al ? `<div class="note" style="margin-top:10px;${al.alert ? "border-color:#dc3546;background:#fdecef" : ""}">${al.alert ? "<b>⚠ Alerta de agotamiento:</b> la contingencia disponible (" + fmt(available) + ") es el " + al.pct.toFixed(1) + " % de la inicial, por debajo del umbral de " + al.threshold + " % del plan de riesgos: escala al sponsor según la política de reservas." : "Contingencia disponible: " + al.pct.toFixed(1) + " % de la inicial (umbral de alerta " + al.threshold + " %)."}</div>` : "";
		const rows = dd.length ? dd.map((d) => `<tr><td class="mono">${esc(d.code)}</td><td>${esc(d.title)}</td><td class="num">${fmt2(d.contingency)}</td><td class="num">${fmt2(d.other)}</td><td class="num">${fmt2(d.pending)}</td><td class="num">${d.plannedMax === null ? "—" : fmt2(d.plannedMax)}</td><td>${d.orphan ? `<span class="pill bad">Riesgo eliminado</span>` : d.over ? `<span class="pill bad" title="Lo aprobado supera el impacto máximo que el análisis del riesgo había previsto">Supera lo previsto</span>` : `<span class="pill ok">Dentro de lo previsto</span>`}</td></tr>`).join("") : `<tr><td class="muted" colspan="7">Ninguna orden está vinculada a un riesgo del registro.</td></tr>`;
		const expo = ec.source === "sin registro" ? "Este proyecto no tiene Registro de Riesgos: no hay exposición residual que contrastar con la contingencia." : ec.events.length ? `La contingencia disponible (<b>${fmt(available)}</b>) ${available >= ec.ev ? "supera" : "<b>NO alcanza</b>"} el valor esperado neto de la exposición residual de los riesgos abiertos (<b>${fmt(ec.ev)}</b>, ${ec.events.length} evento(s)). Es una media (≈ P50): una contingencia a un percentil de decisión debe superarla con holgura.` : "No hay riesgos abiertos con impacto en costo cuantificado en el registro.";
		$("coDrawdown").innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Riesgo</th><th>Descripción</th><th class="num">Aprobado con contingencia</th><th class="num">Aprobado con otras fuentes</th><th class="num">Pendiente</th><th class="num">Impacto máx. previsto</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note" style="margin-top:10px">${expo}</div>${alertHtml}`;
	}
	function coKindHint() {
		const k = $("coKind").value;
		$("coKindHint").textContent = k ? CO_KIND_HINT[k] : "Clasifica el cambio: la naturaleza no decide por sí sola la fuente de fondos.";
		const wrap = $("coRiskWrap");
		wrap.style.display = k === "riesgo" ? "block" : "none";
		if (k === "riesgo") {
			const ctx = riskCtx(), n = ctx.risks.filter((r) => r.type === "amenaza").length;
			$("coRisk").innerHTML = riskOptions(ctx);
			$("coRiskHint").textContent = n ? "Un riesgo materializado es uno que ya ESTABA en el registro y ocurrió. La orden solo se aprueba cuando el registro lo marca como Materializado." : "El proyecto no tiene riesgos registrados. Si el evento no estaba en el Registro de Riesgos, no es un riesgo materializado: clasifícalo como trabajo imprevisto dentro del alcance.";
		}
	}
	function coStatus(sel) {
		const r = state.co[+sel.dataset.i];
		if (r.baselined) {
			showToast(r.id + " ya está incorporada a la línea base " + r.baselined + ": su estado no se puede cambiar.");
			renderCO();
			return;
		}
		if (sel.value === "Aprobada") {
			const ctx = riskCtx(), problems = validateApproval(r, state.co, coBudget(), riskRefs(ctx), ctx.plan.reserves);
			if (problems.length) {
				showToast("No se puede aprobar " + r.id + ": " + problems.join("; ") + ".");
				renderCO();
				return;
			}
			r.approvedOn = todayISO();
		} else delete r.approvedOn;
		userEdited = true;
		r.status = sel.value;
		renderCO();
		save();
	}
	function coEdit(el) {
		const r = state.co[+el.dataset.i];
		if (!r || r.status !== "Pendiente") return;
		userEdited = true;
		const f = el.dataset.f;
		if (f === "approver") r.approver = el.value.trim();
		else if (f === "sponsorAuth") r.sponsorAuth = el.checked;
		else if (f === "authLevel") {
			if (el.value) r.authLevel = el.value;
			else delete r.authLevel;
			renderCO();
		} else if (f === "riskId") {
			const ref = riskCtx().risks.find((x) => x.id === el.value);
			if (el.value) {
				r.riskId = el.value;
				r.riskCode = ref ? ref.code : r.riskCode;
			} else {
				delete r.riskId;
				delete r.riskCode;
			}
			renderCO();
		}
		save();
	}
	function coBaseline(i) {
		const r = state.co[i], plan = planBaselining(r, state.co, coBudget(), state.baselines, todayISO());
		if (!plan.ok) {
			showToast("No se puede incorporar " + r.id + " a la línea base: " + plan.problem + ".");
			return;
		}
		userEdited = true;
		r.baselined = plan.entry.version;
		state.baselines.push(plan.entry);
		renderCO();
		save();
		flash();
		showToast(r.id + " incorporada: " + plan.entry.version + " (BAC " + fmt(plan.entry.bacBefore) + " → " + fmt(plan.entry.bacAfter) + ").");
	}
	function addCO() {
		userEdited = true;
		const descInput = $("coDesc");
		const desc = descInput.value.trim();
		if (!desc) {
			descInput.focus();
			descInput.style.borderColor = "#dc3546";
			return;
		}
		descInput.style.borderColor = "";
		const kindSel = $("coKind");
		if (!kindSel.value) {
			kindSel.focus();
			kindSel.style.borderColor = "#dc3546";
			showToast("Clasifica el cambio: riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance.");
			return;
		}
		kindSel.style.borderColor = "";
		const n = state.co.length + 1;
		const order = {
			id: "OC-" + String(n).padStart(3, "0"),
			desc,
			cause: $("coCause").value.trim() || "—",
			cost: +$("coCost").value || 0,
			fund: $("coFund").value,
			status: "Pendiente",
			kind: kindSel.value,
			approver: "",
			sponsorAuth: false
		};
		if (kindSel.value === "riesgo") {
			const rid = $("coRisk").value, ref = riskCtx().risks.find((x) => x.id === rid);
			if (rid) {
				order.riskId = rid;
				order.riskCode = ref ? ref.code : void 0;
			} else showToast("Orden registrada sin riesgo vinculado: no podrá aprobarse hasta vincularla con un riesgo del registro.");
		}
		state.co.push(order);
		descInput.value = "";
		$("coCause").value = "";
		$("coCost").value = "";
		kindSel.value = "";
		coKindHint();
		renderCO();
		save();
		flash();
		descInput.focus();
	}
	function delCO(i) {
		const r = state.co[i];
		if (r.baselined) {
			showToast(r.id + " ya forma parte de la línea base " + r.baselined + ": no se puede eliminar.");
			return;
		}
		if (r.status === "Aprobada") {
			showToast(r.id + " está Aprobada (fondos comprometidos): devuélvela a Pendiente o Rechazada antes de eliminarla.");
			return;
		}
		userEdited = true;
		state.co.splice(i, 1);
		renderCO();
		save();
	}
	var LEGACY_ID = {
		date: "boeDate",
		source: "boeSource",
		assumptions: "boeAssum",
		exclusions: "boeExcl",
		productivity: "boeProd"
	};
	var boeId = (k) => LEGACY_ID[k] || "boe_" + k;
	var FIELD_LABEL = {
		date: "Fecha base de los precios (de ella se mide la escalación)",
		source: "Fuente de los precios",
		labor: "Tarifas, jornada y rendimientos",
		productivity: "Factores de productividad y de ajuste"
	};
	var nl2br = (s) => esc(s).replace(/\n/g, "<br>");
	function capexValue() {
		if (!gpiOn()) return SAMPLE_CAPEX;
		try {
			const m = GPI.meta(), raw = m && m.capex ? String(m.capex).trim() : "";
			if (!raw || !/^[\d.,\s]+$/.test(raw)) return null;
			const n = Number(raw.replace(/[,\s]/g, ""));
			return n > 0 ? n : null;
		} catch (e) {
			return null;
		}
	}
	function boeFacts() {
		const b = state._budget, connected = gpiOn(), g = getEng();
		let scope = false, coding = !connected;
		try {
			if (connected) {
				const sc = GPI.getModule("scopeStatement");
				scope = !!sc && !!((sc.productScope || "").trim() || (sc.projectScope || "").trim());
				coding = GPI.util.wbsLeaves(GPI.getModule("wbs")).length > 0;
			}
		} catch (e) {}
		return {
			scope,
			execution: !!g,
			classification: true,
			coding,
			currency: true,
			planning: !!g,
			risks: riskCtx().risks.length > 0,
			contingency: !!b && b.cont > 0,
			mgmt: !!b && b.mgmt > 0,
			escalation: !!b && b.esc > 0,
			capex: capexValue() !== null
		};
	}
	function boeCtx() {
		const b = state._budget, last = state.baselines.length ? state.baselines[state.baselines.length - 1] : null;
		return {
			classNum: state.curClass,
			escalation: b ? b.esc : 0,
			baselineVersion: last ? last.version : null,
			baselineDate: last ? String(last.date || "") : "",
			capex: capexValue(),
			total: b ? b.total : null
		};
	}
	function boeAutoHtml(k) {
		const b = state._budget, ec = state._escCalc, c = CLASSES[state.curClass], g = getEng(), connected = gpiOn();
		const none = (t) => `<span class="muted">${t}</span>`;
		switch (k) {
			case "scope": {
				if (!connected) return none("En modo independiente no hay un Enunciado del Alcance conectado: escribe el alcance abajo.");
				const sc = GPI.getModule("scopeStatement");
				const t = sc ? [sc.productScope, sc.projectScope].filter((x) => x && x.trim()).join(" ") : "";
				return t ? `<b>Del Enunciado del Alcance:</b> ${esc(t)}${sc && Array.isArray(sc.deliverables) ? " · " + sc.deliverables.length + " entregable(s)." : ""}` : none("El proyecto aún no tiene Enunciado del Alcance: defínelo o escribe el alcance abajo.");
			}
			case "execution":
			case "planning": {
				if (!g) return none("Sin cronograma (actividades y enlaces en Cronograma/CPM): la duración y las fechas no se pueden citar.");
				const crit = Object.keys(g.rows).filter((id) => g.rows[id].critical).length, fin = finishOf(g.base);
				return `<b>Cronograma del proyecto:</b> ${fmtDays(g.base)} laborables${net && net.startDate ? ", inicio " + esc(net.startDate) : ""}${fin ? ", fin " + esc(fin) : ""} · ${crit} actividad(es) críticas${k === "planning" && ec && ec.res && ec.res.ok ? " · fecha media del gasto " + esc(ec.res.midDate || "—") : ""}.`;
			}
			case "classification": return `<b>Clase ${state.curClass}</b> — ${esc(c.desc)} Madurez del diseño ${esc(c.mat)}; uso previsto: ${esc(c.use)}; rango de exactitud típico ${esc(c.range)}.`;
			case "coding": {
				const n = escPackages().pkgs.length;
				return `<b>EDT:</b> ${n ? n + " paquete(s) de trabajo con costo" : "sin paquetes con costo"}, con Código EDT jerárquico. Cuentas de escalación: ${ACCOUNT_IDS.map((id) => esc(ACCOUNT_LABEL[id])).join(", ")}.`;
			}
			case "currency": return `<b>Moneda del plan:</b> ${esc($("cur").value)} (${sym()}). Componente en moneda extranjera ${esc($("fxShare").value)} %, tipo de cambio ${$("fxMode").value === "frozen" ? "congelado a la fecha base" : "flotante con banda ±" + esc($("fxBand").value) + " %"}; su exposición (${fmt(b ? b.fx : 0)}) se cuantifica aparte de la escalación.`;
			case "risks": {
				const rc = riskCtx(), open = rc.risks.filter((r) => r.status !== "materializado" && r.status !== "cerrado");
				return rc.source === "sin registro" ? none("Este proyecto no tiene Registro de Riesgos.") : `<b>Registro de Riesgos (${rc.source === "registro" ? "del proyecto" : "caso de ejemplo"}):</b> ${rc.risks.length} riesgo(s), ${open.length} abierto(s)${open.length ? ": " + esc(open.slice(0, 5).map((r) => r.code + " " + (r.title || "")).join("; ")) + (open.length > 5 ? "…" : "") : ""}.`;
			}
			case "contingency": return b ? `<b>${esc(METHOD_LABEL[contMethod()])}:</b> ${fmt(b.cont)}${b.base ? " (" + (b.cont / b.base * 100).toFixed(1) + " % del costo base)" : ""}${contMethod() === "manual" ? "" : ", " + esc($("contPct").value)}.` : "";
			case "mgmt": return b ? `<b>${esc($("mgmtPct").value)} % de la línea base = ${fmt(b.mgmt)}</b>, propiedad del sponsor y fuera de la línea base.` : "";
			case "escalation": return b && ec ? `<b>Escalación:</b> ${ec.method === "indices" ? "por índices (58R-10 / 68R-11), " + esc(ec.provLabel) : "método simple"} ${fmt(b.escIdx || 0)}; <b>tipo de cambio:</b> ${fmt(b.fx || 0)}; la contingencia (${fmt(b.cont)}) excluye ambos.` : "";
			case "capex": {
				const cx = capexValue();
				return cx !== null && b ? `<b>CAPEX de referencia:</b> ${fmt(cx)} · presupuesto total ${fmt(b.total)} → ${b.total <= cx + .5 ? "dentro del CAPEX" : "SUPERA el CAPEX en " + fmt(b.total - cx)}.` : none("Sin CAPEX de referencia (Acta de Constitución).");
			}
			default: return "";
		}
	}
	var boeOpen = /* @__PURE__ */ new Set(["g1"]);
	var boeStateLabel = (e) => !e.applies ? "No aplica" : e.state === "completa" ? "Completa" : e.state === "respaldada" ? "Respaldada por el proyecto" : e.state === "falta" ? "Falta" : "Opcional";
	function renderBoe() {
		if (!document.getElementById("boeForm")) return;
		const B = state.boe;
		const meta = (id, label, val, k, type = "text") => `<label class="f"><span>${label}</span><input id="${id}" class="mono" type="${type}" value="${escA(val)}" data-b="meta" data-k="${k}" oninput="boeEdit(this)" onchange="save()"></label>`;
		$("boeHead").innerHTML = `<div class="boe-head">
      ${meta("boeVersion", "Versión de la BOE", B.version, "version")}
      <label class="f"><span>Estado</span><select id="boeStatusSel" class="mono" data-b="meta" data-k="status" onchange="boeEdit(this);save()">${STATUSES.map((s) => `<option value="${s}" ${B.status === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></label>
      ${meta("boePrepared", "Preparó", B.preparedBy, "preparedBy")}${meta("boeReviewed", "Revisó", B.reviewedBy, "reviewedBy")}${meta("boeApprover", "Aprueba", B.approvedBy, "approvedBy")}${meta("boeApprovedOn", "Fecha de aprobación", B.approvedOn, "approvedOn", "date")}
    </div><div class="muted small" style="margin-top:6px">Proceso de 34R-05: borrador → revisión → aprobación → cambios y actualizaciones. La BOE es la base del control de cambios: cuando la línea base cambia, se actualiza y se vuelve a aprobar.</div>`;
		const field = (k, s) => {
			const v = B.text[k] || "", attr = `id="${boeId(k)}" data-b="text" data-k="${k}" oninput="boeEdit(this)" onchange="save()" aria-label="${escA(s.id + " " + s.title)}"`;
			const lab = FIELD_LABEL[k] ? `<span>${esc(FIELD_LABEL[k])}</span>` : "";
			if (k === "date") return `<label class="f">${lab}<input type="date" class="mono" ${attr} value="${escA(v)}"></label>`;
			if (k === "source") return `<label class="f">${lab}<input ${attr} value="${escA(v)}" placeholder="Ej. cotizaciones vigentes, base de precios, contratos"></label>`;
			return `<label class="f">${lab}<textarea ${attr} rows="3" placeholder="${escA(s.placeholder || "")}">${esc(v)}</textarea></label>`;
		};
		const sec = (s) => `<div class="boe-sec" id="sec-${s.id}"><h5>${s.id} ${esc(s.title)} <span class="en">· ${esc(s.en)}</span><span class="boe-st" id="st-${s.id}"></span></h5>
      <div class="boe-hint">${esc(s.hint)}</div>${s.auto ? `<div class="boe-auto" id="auto-${s.id}"></div>` : ""}
      ${s.list ? `<div id="boeList-${s.list}"></div>` : s.keys.map((k) => field(k, s)).join("")}</div>`;
		$("boeForm").innerHTML = GROUPS.map((g) => `<details class="boe-grp" data-g="${g.id}" ${boeOpen.has(g.id) ? "open" : ""}><summary>${esc(g.title)}<span class="boe-gc" id="gc-${g.id}"></span></summary>${SECTIONS.filter((s) => s.group === g.id).map(sec).join("")}</details>`).join("");
		document.querySelectorAll("#boeForm details.boe-grp").forEach((d) => d.addEventListener("toggle", () => {
			const id = d.dataset.g;
			if (d.open) boeOpen.add(id);
			else boeOpen.delete(id);
		}));
		renderBoeLists();
		refreshBoe();
	}
	function renderBoeLists() {
		const B = state.boe, cell = (kind, i, f, v, ph) => `<td><input data-kind="${kind}" data-i="${i}" data-f="${f}" value="${escA(v)}" placeholder="${ph}" oninput="boeListEdit(this)" onchange="save()" aria-label="${ph}"></td>`;
		const tbl = (kind, head, f, rows) => `<table class="boe-list"><thead><tr><td class="muted small">${head[0]}</td><td class="muted small">${head[1]}</td><td></td></tr></thead><tbody>${rows.map((r, i) => `<tr>${cell(kind, i, f[0], r[f[0]], head[0])}${cell(kind, i, f[1], r[f[1]], head[1])}<td style="width:34px"><button class="btn ghost sm" onclick="boeListDel('${kind}',${i})" aria-label="Quitar">✕</button></td></tr>`).join("")}</tbody></table><button class="btn sm" style="margin-top:6px" onclick="boeListAdd('${kind}')">+ Agregar</button>`;
		const t = document.getElementById("boeList-team"), r = document.getElementById("boeList-refs"), c = document.getElementById("boeList-checklist");
		if (t) t.innerHTML = tbl("team", ["Nombre o cargo", "Rol en el estimado"], ["name", "role"], B.team);
		if (r) r.innerHTML = tbl("refs", ["Documento o proyecto", "Nota"], ["title", "note"], B.refs);
		if (c) c.innerHTML = `<div class="boe-chk">${CHECKLIST_ITEMS.map((it) => `<label><input type="checkbox" data-id="${it.id}" ${B.checklist.some((x) => x.id === it.id && x.done) ? "checked" : ""} onchange="boeCheck(this)"> ${esc(it.label)}</label>`).join("")}</div>`;
	}
	function refreshBoe() {
		if (!document.getElementById("boeStatus")) return;
		const facts = boeFacts(), ctx = boeCtx(), c = completeness(state.boe, facts, state.curClass), f = boeFindings(state.boe, facts, ctx);
		const miss = c.missing.length ? `<div class="boe-miss">${c.missing.map((s) => `<button type="button" data-goto="${s.id}">${esc(s.id + " " + s.title)}</button>`).join("")}</div>` : `<div class="muted small">Todas las secciones que se exigen para un estimado de clase ${state.curClass} están completas o respaldadas por el proyecto.</div>`;
		const fl = f.length ? `<ul class="esc-adv" style="margin-top:8px">${f.map((x) => `<li class="${x.severity}"><b class="cd">${x.code}</b>${esc(x.text)}</li>`).join("")}</ul>` : "";
		$("boeStatus").innerHTML = `<div><b>Estimado de clase ${state.curClass}</b> · se exigen <b>${c.required}</b> de ${SECTIONS.length} secciones · completas o respaldadas por el proyecto: <b>${c.done}</b> (${c.pct} %)</div>
    <div class="boe-bar"><div style="width:${c.pct}%"></div></div>${miss}${fl}
    <div style="margin-top:8px"><button type="button" class="btn sm" id="boeOpenAll">Abrir todas las secciones</button> <button type="button" class="btn sm" id="boeCloseAll">Plegar todas</button></div>
    <div class="muted" style="font-size:11.5px;margin-top:8px">Qué secciones se exigen según la clase es un <b>criterio didáctico</b> de este módulo: 34R-05 (§4) dice que el detalle de la BOE depende de la definición del proyecto, de su valor y de su tipo, pero no fija una lista por clase. La sección 3.15 del índice público («Containments») no se pudo verificar y se omite.</div>`;
		$("boeStatus").querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
			const s = SECTIONS.find((x) => x.id === b.dataset.goto);
			if (!s) return;
			const d = document.querySelector(`#boeForm details[data-g="${s.group}"]`);
			if (d) {
				d.open = true;
				boeOpen.add(s.group);
			}
			const el = document.getElementById("sec-" + s.id);
			if (el) {
				el.scrollIntoView({ block: "center" });
				const i = el.querySelector("textarea,input");
				if (i) i.focus();
			}
		}));
		const setAll = (open) => {
			document.querySelectorAll("#boeForm details.boe-grp").forEach((d) => {
				d.open = open;
				const id = d.dataset.g;
				if (open) boeOpen.add(id);
				else boeOpen.delete(id);
			});
		};
		const oa = document.getElementById("boeOpenAll"), ca = document.getElementById("boeCloseAll");
		if (oa) oa.addEventListener("click", () => setAll(true));
		if (ca) ca.addEventListener("click", () => setAll(false));
		const done = {};
		c.evals.forEach((e) => {
			const st = document.getElementById("st-" + e.section.id);
			if (st) {
				st.textContent = boeStateLabel(e);
				st.className = "boe-st " + (!e.applies ? "opcional" : e.state);
			}
			const au = document.getElementById("auto-" + e.section.id);
			if (au && e.section.auto) au.innerHTML = boeAutoHtml(e.section.auto);
			if (e.required) {
				const g = done[e.section.group] || (done[e.section.group] = [0, 0]);
				g[1]++;
				if (e.state === "completa" || e.state === "respaldada") g[0]++;
			}
		});
		GROUPS.forEach((g) => {
			const el = document.getElementById("gc-" + g.id);
			if (el) el.textContent = done[g.id] ? done[g.id][0] + "/" + done[g.id][1] + " exigidas" : "opcionales";
		});
	}
	function boeEdit(el) {
		userEdited = true;
		const kind = el.dataset.b, k = el.dataset.k || "", B = state.boe;
		if (kind === "text") B.text[k] = el.value;
		else if (kind === "meta") {
			if (k === "status") {
				B.status = STATUSES.indexOf(el.value) >= 0 ? el.value : "borrador";
				if (B.status === "aprobada" && !B.approvedOn) {
					B.approvedOn = todayISO();
					const d = document.getElementById("boeApprovedOn");
					if (d) d.value = B.approvedOn;
				}
			} else if (k === "approvedOn") B.approvedOn = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : "";
			else B[k] = el.value;
		}
		if (kind === "text" && k === "date") recalcCont();
		else refreshBoe();
	}
	function boeListAdd(kind) {
		userEdited = true;
		if (kind === "team") state.boe.team.push({
			name: "",
			role: ""
		});
		else state.boe.refs.push({
			title: "",
			note: ""
		});
		renderBoeLists();
		refreshBoe();
		save();
	}
	function boeListDel(kind, i) {
		userEdited = true;
		state.boe[kind].splice(i, 1);
		renderBoeLists();
		refreshBoe();
		save();
	}
	function boeListEdit(el) {
		userEdited = true;
		const kind = el.dataset.kind, i = Number(el.dataset.i), f = el.dataset.f, row = state.boe[kind][i];
		if (row) row[f] = el.value;
		refreshBoe();
	}
	function boeCheck(el) {
		userEdited = true;
		const it = state.boe.checklist.find((x) => x.id === el.dataset.id);
		if (it) it.done = el.checked;
		refreshBoe();
		save();
	}
	function boeDocHtml() {
		const B = state.boe, facts = boeFacts(), c = completeness(B, facts, state.curClass), f = boeFindings(B, facts, boeCtx());
		const head = `<table class="dt">
      <tr><td>Versión · estado</td><td>${esc(B.version)} · <b>${STATUS_LABEL[B.status]}</b></td></tr>
      <tr><td>Preparó · revisó</td><td>${esc(B.preparedBy) || "—"} · ${esc(B.reviewedBy) || "—"}</td></tr>
      <tr><td>Aprobó</td><td>${esc(B.approvedBy) || "—"}${B.approvedOn ? " · " + esc(B.approvedOn) : ""}</td></tr>
      <tr><td>Nivel de detalle</td><td>Estimado de clase ${state.curClass}: ${c.required} sección(es) exigidas, ${c.done} completas o respaldadas por el proyecto (${c.pct} %)${c.missing.length ? ". <b>Faltan:</b> " + esc(c.missing.map((s) => s.id + " " + s.title).join("; ")) : ""}.</td></tr></table>`;
		const listHtml = (s) => s.list === "team" ? B.team.filter((m) => m.name.trim()).map((m) => esc(m.name) + (m.role.trim() ? " — " + esc(m.role) : "")).join("<br>") : s.list === "refs" ? B.refs.filter((r) => r.title.trim()).map((r) => esc(r.title) + (r.note.trim() ? " — " + esc(r.note) : "")).join("<br>") : CHECKLIST_ITEMS.map((it) => (B.checklist.some((x) => x.id === it.id && x.done) ? "☑ " : "☐ ") + esc(it.label)).join("<br>");
		return head + GROUPS.map((g) => {
			const rows = c.evals.filter((e) => e.section.group === g.id && e.applies).map((e) => {
				const s = e.section, txt = s.list ? listHtml(s) : s.keys.map((k) => B.text[k] ? (s.keys.length > 1 && FIELD_LABEL[k] ? `<i>${esc(FIELD_LABEL[k])}:</i> ` : "") + nl2br(B.text[k]) : "").filter(Boolean).join("<br>");
				const auto = s.auto && facts[s.auto] ? boeAutoHtml(s.auto) : "";
				if (!txt && !auto && !e.required) return "";
				return `<tr><td>${s.id} ${esc(s.title)}</td><td>${auto}${auto && txt ? "<br>" : ""}${txt || (auto ? "" : `<span class="muted">— (falta)</span>`)}</td></tr>`;
			}).join("");
			return rows ? `<p style="font-size:12.5px;margin:12px 0 4px"><b>${esc(g.title)}</b></p><table class="dt">${rows}</table>` : "";
		}).join("") + (f.length ? `<p style="font-size:12.5px;margin:10px 0 0"><b>Revisar:</b> ${f.map((x) => esc(x.code + " — " + x.text)).join(" · ")}</p>` : "");
	}
	function boeCORows() {
		if (!state.co.length) return `<tr><td class="muted" colspan="7">Sin órdenes de cambio registradas</td></tr>`;
		return state.co.map((r) => `<tr>
    <td class="mono">${esc(r.id)}</td><td>${esc(r.desc)}</td><td>${esc(kindLabel(r.kind))}${r.riskCode ? " · " + esc(r.riskCode) : ""}</td><td>${esc(r.cause)}</td>
    <td style="text-align:right" class="mono">${fmt2(+r.cost)}</td><td>${esc(r.fund)}</td>
    <td>${esc(r.status)}${r.status === "Aprobada" ? " · " + esc(r.approver || "—") + (authLevelOf(r) ? " (" + esc(AUTH_LABEL[authLevelOf(r)]) + ")" : "") : ""}${r.baselined ? " · " + esc(r.baselined) : ""}</td></tr>`).join("");
	}
	function policyDocHtml() {
		const pol = riskCtx().plan.reserves, al = contingencyAlert(state._coTotals && state._coTotals.contingencyAvailable || 0, coBudget().cont, pol);
		return `<p style="font-size:12.5px;margin:8px 0 0"><b>Política de reservas (plan de riesgos):</b> ${hasTiers(pol) ? "La <b>contingencia</b> la libera la instancia que corresponde al monto de cada orden (" + esc(tiersText(pol, (n) => fmt2(n))) + ")." : "El plan de riesgos no define límites de autoridad por monto para liberar la contingencia."} La <b>reserva de gestión</b> (${esc(FUND_MGMT)}, fuera de la línea base) y el <b>financiamiento adicional</b> los autoriza siempre el sponsor.${pol.contAlertPct !== null ? " Se escala si la contingencia disponible baja del " + pol.contAlertPct + " % de la inicial" + (al ? " (hoy " + al.pct.toFixed(1) + " %)" : "") + "." : ""}</p>`;
	}
	function rangeDocHtml() {
		if (contMethod() !== "rangos_mc") return "";
		const res = simulate(corrValue()), p = pctNum();
		const lines = state.ranges.length ? state.ranges.map((l) => `<tr><td>${esc(l.name)}</td><td style="text-align:right" class="mono">${fmt(Number(l.ml))}</td><td style="text-align:right" class="mono">${sgn(Number(l.lowPct))} % / ${sgn(Number(l.highPct))} %</td><td>${esc(l.basis || "— (sin fundamento)")}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Sin partidas definidas</td></tr>`;
		const ec = includeRisksOn() ? eventsCtx() : null;
		const evTxt = ec && ec.events.length ? `Incluye <b>${ec.events.length} evento(s) de riesgo</b> del ${ec.source === "registro" ? "Registro de Riesgos del proyecto" : "caso de ejemplo"} (${esc(ec.events.slice(0, 6).map((e) => e.code).join(", "))}${ec.events.length > 6 ? "…" : ""}), con su riesgo <b>residual</b> cuando está cuantificado; valor esperado neto ${fmt(ec.ev)}.` : "No incluye eventos de riesgo discretos (ninguno cuantificado en el registro, o se excluyeron).";
		const sc = res && res.schedule, cpd = timeCostPerDay(), basisT = ($("rngTimeBasis") || { value: "" }).value.trim();
		const schedTxt = sc && sc.events ? ` <b>Plazo:</b> ${sc.events} evento(s) retrasan actividades del cronograma (CPM real, duración base ${fmtDays(sc.base)}); con P${p} el plazo es ${fmtDays(sc.p[p])} (reserva de plazo ${fmtDays(Math.max(0, sc.p[p] - sc.base))}${finishOf(sc.p[p]) ? ", fin " + esc(finishOf(sc.p[p])) : ""}).${cpd > 0 ? " La extensión del plazo se costea a " + fmt(cpd) + " por día" + (basisT ? " (" + esc(basisT) + ")" : "") + ": costo medio " + fmt(sc.timeCostMean) + ", incluido en la contingencia." : " No se definió un costo por día de extensión: el retraso no se traduce a costo."}` : "";
		return `<p style="font-size:12.5px;margin:10px 0 4px"><b>Base de la contingencia — estimación por rangos y simulación Monte Carlo (AACE RP 41R-08 y 40R-08).</b> ${res ? `Distribución triangular por partida; correlación entre partidas ${Math.round(res.correlation * 100)} %; ${res.iterations.toLocaleString("es-PE")} iteraciones (semilla ${res.seed}, reproducible). Estimado base Σ más probable ${fmt(res.ml)}; P50 ${fmt(res.p[50])}, P${p} ${fmt(res.p[p])}. Contingencia = P${p} − estimado base = <b>${fmt(contingencyAt(res, p).amount)}</b>. Cubre la incertidumbre de los rangos del estimado. ${evTxt}${schedTxt}` : "Aún no hay partidas válidas."}</p>
    <table class="dt"><thead><tr><td style="font-weight:700;color:var(--muted)">Partida</td><td style="font-weight:700;color:var(--muted);text-align:right">Más probable</td><td style="font-weight:700;color:var(--muted);text-align:right">Mín / Máx</td><td style="font-weight:700;color:var(--muted)">Fundamento del rango</td></tr></thead><tbody>${lines}</tbody></table>`;
	}
	function escDocHtml() {
		const c = state._escCalc;
		if (!c || c.method !== "indices") return "";
		const p = state.esc, bd = $("boeDate").value;
		const years = escYears(c.ctx);
		const head = `<thead><tr><td style="font-weight:700;color:var(--muted)">Cuenta</td>${years.map((y) => `<td style="font-weight:700;color:var(--muted);text-align:right">${y}</td>`).join("")}<td style="font-weight:700;color:var(--muted)">Fuente del pronóstico · rango de la tasa (pp)</td></tr></thead>`;
		const rows = p.accounts.filter((a) => Object.keys(a.rates).length).map((a) => `<tr><td>${esc(ACCOUNT_LABEL[a.id])}</td>${years.map((y) => `<td style="text-align:right" class="mono">${a.rates[String(y)] === void 0 ? "—" : a.rates[String(y)] + " %"}</td>`).join("")}<td>${esc(a.source || "— (sin fuente: documentar)")} · ${a.low} / +${a.high}</td></tr>`).join("");
		const locked = c.res ? c.res.byPackage.filter((k) => k.lock) : [];
		const res = c.res, sim = c.sim;
		return `<p style="font-size:12.5px;margin:10px 0 4px"><b>Base de la escalación — por índices (AACE RP 58R-10 y 68R-11).</b> Escalación = cambio general de precios de mercado, incluida la inflación; <b>excluye</b> la contingencia (riesgos específicos del proyecto) y el tipo de cambio, que se estiman aparte. Fórmula: costo del período × [índice en la fecha de gasto ÷ índice en la fecha base − 1], por cuenta de costo. Fecha base de precios: <b>${esc(bd) || "— (definir)"}</b>.${res && res.ok ? ` Los ${c.ctx.pkgs.length} paquetes se reparten en el tiempo (mensual, lineal) según sus fechas del cronograma; fecha media ponderada del gasto ${esc(res.midDate || "—")}.` : ""}</p>
    ${rows ? `<table class="dt">${head}<tbody>${rows}</tbody></table>` : `<p class="muted" style="font-size:12.5px">Sin pronóstico de índices definido.</p>`}
    ${res && res.ok ? `<p style="font-size:12.5px;margin:8px 0 0">Composición por omisión del costo: ${ACCOUNT_IDS.filter((id) => p.defaultMix[id]).map((id) => esc(ACCOUNT_LABEL[id]) + " " + p.defaultMix[id] + " %").join(" · ")}${Object.keys(p.packages).some((id) => p.packages[id].mix) ? "; " + Object.keys(p.packages).filter((id) => p.packages[id].mix).length + " paquete(s) con composición propia" : ""}. ${locked.length ? "<b>Precio fijado</b> por contrato: " + esc(locked.map((k) => k.code + " (" + k.lock + ")").join(", ")) + " — desde esa fecha el índice no corre." : "Ningún paquete tiene el precio fijado."}
      Escalación del pronóstico central <b>${fmt(c.central)}</b> (${pct1(res.factor)} del costo${p.onContingency ? "; incluye la escalación de la contingencia, «Escalation on Contingency»" : "; la contingencia no se escala"}). Se financia <b>${fmt(c.esc)}</b> (${esc(c.provLabel)}).${sim ? ` Simulación Monte Carlo (68R-11; ${sim.iterations.toLocaleString("es-PE")} iteraciones, semilla ${sim.seed}, correlación entre cuentas ${Math.round(sim.correlation * 100)} %${sim.withDelay ? ", con el retraso del análisis integrado de riesgo" : ", sin variable de plazo"}): P50 ${fmt(sim.p[50] * c.funded)}, P70 ${fmt(sim.p[70] * c.funded)}, P80 ${fmt(sim.p[80] * c.funded)}, P90 ${fmt(sim.p[90] * c.funded)}; el pronóstico central equivale al P${Math.round(sim.probAtOrBelowDet * 100)}.` : ""}</p>` : ""}
    ${c.adv.length ? `<p style="font-size:12.5px;margin:8px 0 0"><b>Revisar:</b> ${c.adv.map((a) => esc(a.code + " — " + a.text)).join(" · ")}</p>` : ""}
    <p class="muted" style="font-size:12px;margin:8px 0 0">Límites: no se simula la incertidumbre del costo (está en la contingencia, que se escala) ni la forma de la curva de gasto (lineal por paquete); las tasas y sus rangos son datos del equipo y deben provenir de un economista o de una fuente reconocida.</p>`;
	}
	function buildDoc() {
		recalcCont();
		const c = CLASSES[state.curClass], b = state._budget || {}, t = state._coTotals || {};
		const cpiW = (+$("cpiWarn").value).toFixed(2), cpiE = (+$("cpiEsc").value).toFixed(2);
		const cvW = fmt2(+$("cvWarn").value), cvE = fmt2(+$("cvEsc").value);
		const fxTxt = $("fxMode").value === "frozen" ? "congelado a fecha base" : "flotante con banda ±" + $("fxBand").value + "%";
		$("doc").innerHTML = `
    <div class="doc-h">Plan de Gestión Financiera &amp; Basis of Estimate</div>
    <p class="doc-meta">Generado ${(/* @__PURE__ */ new Date()).toLocaleDateString("es-PE")} · Fecha base del estimado: ${esc($("boeDate").value) || "—"} · Moneda base: ${esc($("cur").value)} (${sym()}) · Clase AACE: <b>Clase ${state.curClass}</b></p>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">01</span>Reglas normativas del plan (PMBOK)</h4>
      <div class="dgrid">
        <table class="dt">
          <tr><td>Moneda base</td><td>${esc($("cur").value)} — ${sym()}</td></tr>
          <tr><td>Método de EV por defecto</td><td>${esc($("evMethod").value)}</td></tr>
        </table>
        <table class="dt">
          <tr><td>Periodicidad de reporte</td><td>${esc($("reportFreq").value)}</td></tr>
          <tr><td>Actualización de pronósticos</td><td>${esc($("fcastFreq").value)}</td></tr>
          <tr><td>Estructuras enlazadas</td><td>WBS · CBS · OBS · RBS</td></tr>
          <tr><td>Code of Accounts</td><td class="mono" style="font-size:11px">[WBS]-[FASE]-[DISC]-[TIPO]-[SEC]</td></tr>
        </table>
      </div>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">02</span>Umbrales de control · KPI de costos</h4>
      <table class="dt">
        <tr><td>CPI — alerta / escalamiento</td><td>≤ ${cpiW}  /  ≤ ${cpiE}</td></tr>
        <tr><td>CV — alerta / escalamiento</td><td>≤ ${cvW}  /  ≤ ${cvE}</td></tr>
        <tr><td>Respuesta al superar el umbral</td><td><b>Alerta:</b> analizar la causa, actualizar el pronóstico y aplicar acciones correctivas (autoridad del director del proyecto). <b>Escalamiento:</b> decisión del sponsor / CCB con el pronóstico actualizado. Una orden de cambio solo se registra si la respuesta modifica la línea base o usa reservas.</td></tr>
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">03</span>Clase de estimado (AACE RP 17R-97)</h4>
      <table class="dt">
        <tr><td>Clase</td><td>Clase ${state.curClass} — ${esc(c.desc)}</td></tr>
        <tr><td>Madurez del diseño</td><td>${esc(c.mat)}</td></tr>
        <tr><td>Metodología</td><td>${esc(c.meth)}</td></tr>
        <tr><td>Uso previsto</td><td>${esc(c.use)}</td></tr>
        <tr><td>Rango de exactitud típico</td><td>${esc(c.range)}</td></tr>
        ${classDocRows(c)}
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">04</span>Basis of Estimate (AACE RP 34R-05)</h4>
      ${boeDocHtml()}
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">05</span>Contingencia, escalation y presupuesto</h4>
      <table class="dt">
        <tr><td>Estimación de costos de las actividades</td><td>${fmt(b.base)}</td></tr>
        <tr><td>Contingencia</td><td>${fmt(b.cont)} — ${esc(METHOD_LABEL[contMethod()])}${contMethod() === "manual" ? "" : ", " + esc($("contPct").selectedOptions[0].text.split(" ")[0])} (${b.base ? (b.cont / b.base * 100).toFixed(1) : "—"}%)</td></tr>
        ${contMethod() === "clase_tabla" ? `<tr><td></td><td class="muted">Referencia didáctica por clase y percentil: no proviene de una norma de AACE ni de un análisis de riesgo del proyecto.</td></tr>` : ""}
        ${contMethod() === "manual" ? `<tr><td>Fundamento del porcentaje</td><td>${esc($("manualBasis").value) || "— (documentar)"}</td></tr>` : ""}
        <tr><td>Escalación</td><td>${fmt(b.escIdx)} — ${escMethodVal() === "indices" ? "por índices y en el tiempo (AACE 58R-10 / 68R-11); ver la base abajo" : "método simple: inflación " + esc($("inflRate").value) + " % a " + esc($("inflYears").value) + " años (una tasa y un punto de gasto)"}</td></tr>
        <tr><td>Tipo de cambio (aparte)</td><td>${fmt(b.fx)} — componente en moneda extranjera ${esc($("fxShare").value)} %, TC ${fxTxt}</td></tr>
        <tr><td><b>BAC — línea base de costos${state.baselines.length ? " (inicial)" : ""}</b></td><td><b>${fmt(b.bac)}</b> (excluye reserva de gestión)</td></tr>
        <tr><td>Reserva de gestión</td><td>${fmt(b.mgmt)} — propiedad del sponsor</td></tr>
        <tr><td><b>Presupuesto total</b></td><td><b>${fmt(b.total)}</b></td></tr>
        ${state.baselines.length ? `<tr><td><b>BAC vigente</b></td><td><b>${fmt(t.bacCurrent)}</b> — ${esc(state.baselines[state.baselines.length - 1].version)} (${state.baselines.length} cambio(s) de línea base)</td></tr>` : ""}
      </table>
      ${rangeDocHtml()}
      ${escDocHtml()}
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">06</span>Registro de órdenes de cambio</h4>
      <table class="dt">
        <tr><td style="font-weight:700;color:var(--muted)">ID</td><td style="color:var(--muted);font-weight:700">Descripción · Naturaleza · Causa · Δ Costo · Fondeo · Estado y aprobación</td></tr>
      </table>
      <table class="dt" style="margin-top:2px">
        <thead><tr>
          <td style="width:auto;font-weight:700;color:var(--muted)">ID</td><td style="font-weight:700;color:var(--muted)">Descripción</td>
          <td style="font-weight:700;color:var(--muted)">Naturaleza</td>
          <td style="font-weight:700;color:var(--muted)">Causa</td><td style="font-weight:700;color:var(--muted);text-align:right">Δ Costo</td>
          <td style="font-weight:700;color:var(--muted)">Fondeo</td><td style="font-weight:700;color:var(--muted)">Estado y aprobación</td>
        </tr></thead>
        <tbody>${boeCORows()}</tbody>
      </table>
      <p style="font-size:12.5px;margin:8px 0 0">Total aprobado: <b>${fmt2(t.approved || 0)}</b> — contingencia ${fmt2(t.fromContingency || 0)}, reserva de gestión ${fmt2(t.fromMgmt || 0)}, financiamiento adicional ${fmt2(t.fromExtra || 0)}. Disponible: contingencia ${fmt2(t.contingencyAvailable || 0)}, reserva de gestión ${fmt2(t.mgmtAvailable || 0)}. Aprobado pendiente de incorporar a la línea base: ${fmt2(t.pendingBaseline || 0)}.</p>
      ${policyDocHtml()}
      ${state.baselines.length ? `<table class="dt" style="margin-top:6px"><tbody>${state.baselines.map((v) => `<tr><td class="mono">${esc(v.version)}</td><td>${esc(v.date)} · ${esc(v.orderIds.join(", "))} · aprobó ${esc(v.approver || "—")}</td><td style="text-align:right" class="mono">${fmt2(v.bacBefore)} → ${fmt2(v.bacAfter)}</td></tr>`).join("")}</tbody></table>` : ""}
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">07</span>Proceso de cambio y pronósticos</h4>
      <p style="font-size:12.5px;margin:0">Ante una variación que cruce los umbrales anteriores: (1) detectar y clasificar la variación contra los umbrales (una variación no es, por sí sola, una orden de cambio), (2) analizar la causa raíz y actualizar el pronóstico ETC/EAC, (3) decidir la respuesta: acción correctiva o preventiva dentro del plan, uso de la contingencia, o solicitud de cambio si exige modificar la línea base o comprometer la reserva de gestión, (4) si corresponde una orden, clasificar el cambio (riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance: no se asume la fuente de fondos), (5) registrarla con su financiación y efecto presupuestario, (6) evaluar en el CCB (el sponsor autoriza el uso de la reserva de gestión o de fondos adicionales) y, solo si se aprueba y se decide, incorporar a la línea base con una versión nueva (LB-n), (7) actualizar ETC/EAC con frecuencia ${esc($("fcastFreq").value).toLowerCase()} y comunicar en el reporte de desempeño.</p>
    </section>`;
		buildJSON();
	}
	function collect() {
		return {
			meta: {
				module: "cost_management_plan",
				version: 2,
				updated: (/* @__PURE__ */ new Date()).toISOString()
			},
			plan: {
				currency: $("cur").value,
				evMethod: $("evMethod").value,
				reportFreq: $("reportFreq").value,
				forecastFreq: $("fcastFreq").value,
				thresholds: {
					cpi: {
						warn: +$("cpiWarn").value,
						escalate: +$("cpiEsc").value
					},
					cv: {
						warn: +$("cvWarn").value,
						escalate: +$("cvEsc").value
					}
				}
			},
			estimate: {
				class: state.curClass,
				boe: serializeBoe(state.boe)
			},
			budget: {
				baseCost: +$("baseCost").value,
				contingency: {
					method: contMethod(),
					methodLabel: METHOD_LABEL[contMethod()],
					percentile: $("contPct").value,
					rate: state._budget && state._budget.base ? state._budget.cont / state._budget.base : 0,
					manualPct: +$("manualPct").value || 0,
					manualBasis: $("manualBasis").value
				},
				rangeAnalysis: {
					lines: state.ranges,
					correlation: corrValue(),
					iterations: DEFAULT_ITERATIONS,
					seed: DEFAULT_SEED,
					includeRisks: includeRisksOn(),
					timeCostPerDay: timeCostPerDay(),
					timeCostBasis: ($("rngTimeBasis") || { value: "" }).value,
					results: rangeSummary()
				},
				mgmtReservePct: +$("mgmtPct").value,
				escalation: {
					inflation: +$("inflRate").value,
					years: +$("inflYears").value,
					fxShare: +$("fxShare").value,
					fxMode: $("fxMode").value,
					fxBand: +$("fxBand").value,
					method: escMethodVal(),
					baseDate: $("boeDate").value,
					accounts: state.esc.accounts,
					defaultMix: state.esc.defaultMix,
					packages: state.esc.packages,
					onContingency: state.esc.onContingency,
					provision: state.esc.provision,
					correlation: state.esc.correlation,
					results: escSummary()
				},
				computed: state._budget || null
			},
			changeOrders: state.co,
			changeTotals: state._coTotals || null,
			baselineLog: state.baselines
		};
	}
	function escSummary() {
		const c = state._escCalc;
		if (!c || c.method !== "indices" || !c.res || !c.res.ok) return null;
		const out = {
			funded: c.funded,
			central: c.central,
			financed: c.esc,
			factor: c.res.factor,
			provision: state.esc.provision,
			midDate: c.res.midDate
		};
		if (c.sim) Object.assign(out, {
			p50: c.sim.p[50] * c.funded,
			p70: c.sim.p[70] * c.funded,
			p80: c.sim.p[80] * c.funded,
			p90: c.sim.p[90] * c.funded,
			probAtOrBelowCentral: c.sim.probAtOrBelowDet,
			withDelay: c.sim.withDelay
		});
		return out;
	}
	function rangeSummary() {
		const r = simulate(corrValue());
		if (!r) return null;
		const out = {
			ml: r.ml,
			mean: r.mean,
			sd: r.sd,
			p10: r.p[10],
			p50: r.p[50],
			p70: r.p[70],
			p80: r.p[80],
			p90: r.p[90],
			events: r.events,
			eventsEV: r.eventsEV
		};
		if (r.schedule) Object.assign(out, {
			schedBase: r.schedule.base,
			schedP50: r.schedule.p[50],
			schedP70: r.schedule.p[70],
			schedP80: r.schedule.p[80],
			schedP90: r.schedule.p[90],
			schedProbDelay: r.schedule.probDelay,
			timeCostMean: r.schedule.timeCostMean
		});
		return out;
	}
	function buildJSON() {
		$("jsonView").textContent = JSON.stringify(collect(), null, 2);
	}
	function gpiOn() {
		try {
			return typeof GPI !== "undefined" && !!GPI && GPI.available() && !!GPI.active();
		} catch (e) {
			return false;
		}
	}
	function showToast(msg) {
		let t = document.getElementById("gpiToast");
		if (!t) {
			t = document.createElement("div");
			t.id = "gpiToast";
			t.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:2000;background:#1A1A1C;color:#fff;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:520px;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none;";
			document.body.appendChild(t);
		}
		const el = t;
		el.textContent = msg;
		el.style.opacity = "1";
		clearTimeout(el._t);
		el._t = setTimeout(() => {
			el.style.opacity = "0";
		}, 3200);
	}
	function seedFromProject() {
		try {
			const meta = GPI.meta() || {};
			if (meta.currency && CUR[meta.currency]) $("cur").value = meta.currency;
			const wbs = GPI.getModule("wbs");
			const roll = GPI.util && wbs ? GPI.util.wbsRollup(wbs) : null;
			const v = roll && roll.cost > 0 ? Math.round(roll.cost) : 0;
			$("baseCost").value = String(v);
			$("actCostP1").value = String(v);
		} catch (e) {}
	}
	function pullFromWBS() {
		if (!gpiOn()) {
			showToast("Abre este módulo desde el Panel de Control para conectar la EDT.");
			return;
		}
		userEdited = true;
		const wbs = GPI.getModule("wbs");
		const roll = GPI.util && wbs ? GPI.util.wbsRollup(wbs) : null;
		if (!roll || !roll.cost) {
			showToast("La EDT del proyecto activo aún no tiene costos cargados en WBS Builder.");
			return;
		}
		const v = Math.round(roll.cost);
		$("baseCost").value = String(v);
		$("actCostP1").value = String(v);
		save();
		recalcCont();
		flash();
	}
	function pullFromCostEstimate() {
		if (!gpiOn()) {
			showToast("Abre este módulo desde el Panel de Control para conectar la EDT.");
			return;
		}
		userEdited = true;
		const wbs = GPI.getModule("wbs");
		const activities = GPI.getModule("activities");
		const estimate = GPI.getModule("costEstimate");
		const total = GPI.util && wbs ? GPI.util.costEstimateTotal(estimate, activities, wbs) : 0;
		if (!total) {
			showToast("Aún no hay actividades con Cantidad y Precio unitario cargados en Estimar los Costos.");
			return;
		}
		const v = Math.round(total);
		$("baseCost").value = String(v);
		$("actCostP1").value = String(v);
		save();
		recalcCont();
		flash();
	}
	var userEdited = false;
	["input", "change"].forEach((ev) => document.addEventListener(ev, (e) => {
		if (e.isTrusted) userEdited = true;
	}, true));
	var loadedProjectId = null;
	var projectStale = false;
	function markProjectStale() {
		if (projectStale) return;
		projectStale = true;
		const t = $("saveTxt"), d = $("saveDot");
		if (t) t.textContent = "⚠ El proyecto activo cambió en otra pestaña: no se puede guardar aquí";
		if (d) d.style.background = "#dc3546";
	}
	var session = null;
	function reportWrite(r) {
		if (r.status === "rejected" && r.reason === "project-changed") {
			markProjectStale();
			return;
		}
		$("saveTxt").textContent = GPI.describeWrite(r, "Estos datos de costos");
		$("saveDot").style.background = "#dc3546";
	}
	function thresholds() {
		const n = (id) => parseFloat($(id).value);
		return {
			cpiWarn: n("cpiWarn"),
			cpiEsc: n("cpiEsc"),
			cvWarn: n("cvWarn"),
			cvEsc: n("cvEsc")
		};
	}
	function checkThresholds() {
		const box = document.getElementById("thrMsg");
		if (!box) return;
		const p = validateThresholds(thresholds());
		box.style.display = p.length ? "block" : "none";
		box.innerHTML = p.length ? "<b>⚠ Umbrales incoherentes:</b> " + p.map(esc).join(" · ") : "";
	}
	var LEVEL_UI = {
		green: {
			pill: "ok",
			label: "Verde — dentro de tolerancia"
		},
		amber: {
			pill: "warn",
			label: "Ámbar — alerta"
		},
		red: {
			pill: "bad",
			label: "Rojo — escalamiento"
		}
	};
	function evalVariance() {
		const raw = (id) => {
			const v = $(id).value;
			return v === "" ? null : parseFloat(v);
		};
		const box = $("varOut"), r = classifyVariance(raw("varCpi"), raw("varCv"), thresholds());
		if (!r.evaluated || !r.level) {
			box.innerHTML = "Ingresa un valor para clasificar la variación.";
			return;
		}
		const sub = (name, l) => l ? `${name}: <span class="pill ${LEVEL_UI[l].pill}">${LEVEL_UI[l].label}</span> ` : "";
		box.innerHTML = `<div style="margin-bottom:8px">${sub("CPI", r.cpi)}${sub("CV", r.cv)}</div>
    <div style="margin-bottom:6px"><b>Qué corresponde hacer:</b></div>
    <ol style="margin:0 0 0 18px;padding:0">${r.response.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
	}
	function save() {
		checkThresholds();
		if (gpiOn() && !GPI.getModule("cost") && !userEdited) {
			buildJSON();
			return;
		}
		if (gpiOn() && loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
			markProjectStale();
			return;
		}
		let synced = false;
		if (gpiOn()) {
			const r = GPI.saveModule("cost", collect(), session);
			if (!session && r.status === "saved") session = GPI.openSession("cost");
			if (r.status === "saved" || r.status === "unchanged") {
				synced = true;
				$("saveTxt").textContent = "Sincronizado con el Panel";
			} else {
				reportWrite(r);
				$("fcastEcho").textContent = $("fcastFreq").value.toLowerCase();
				buildJSON();
				return;
			}
		}
		if (!synced) try {
			localStorage.setItem(STORE_KEY, JSON.stringify(collect()));
			$("saveTxt").textContent = "Guardado " + (/* @__PURE__ */ new Date()).toLocaleTimeString("es-PE", {
				hour: "2-digit",
				minute: "2-digit"
			});
		} catch (e) {
			$("saveTxt").textContent = "Sin persistencia";
			$("saveDot").style.background = "#dc3546";
		}
		$("fcastEcho").textContent = $("fcastFreq").value.toLowerCase();
		buildJSON();
	}
	function flash() {
		$("saveDot").style.background = "#00B6EC";
		setTimeout(() => $("saveDot").style.background = "#12a56a", 400);
	}
	function applyData(d) {
		if (!d) return;
		const p = d.plan || {}, b = d.budget || {}, e = d.estimate || {};
		if (p.currency) $("cur").value = p.currency;
		if (p.evMethod) $("evMethod").value = p.evMethod;
		if (p.reportFreq) $("reportFreq").value = p.reportFreq;
		if (p.forecastFreq) $("fcastFreq").value = p.forecastFreq;
		if (p.thresholds) {
			const th = p.thresholds;
			if (th.cpi) {
				$("cpiWarn").value = th.cpi.warn;
				$("cpiEsc").value = th.cpi.escalate;
			}
			if (th.cv) {
				$("cvWarn").value = th.cv.warn;
				$("cvEsc").value = th.cv.escalate;
			}
		}
		if (e.class) state.curClass = e.class;
		if (e.boe) {
			state.boe = normalizeBoe(e.boe);
			renderBoe();
		}
		if (b.baseCost) {
			$("baseCost").value = b.baseCost;
			$("actCostP1").value = b.baseCost;
		}
		if (b.contingency) {
			const m = b.contingency.method;
			if (m === "rangos_mc" || m === "clase_tabla" || m === "manual") $("contMethod").value = m;
			else if (m) {
				$("contMethod").value = "clase_tabla";
				state.legacyMethod = String(m);
			}
			if (b.contingency.manualPct != null) $("manualPct").value = b.contingency.manualPct;
			if (b.contingency.manualBasis) $("manualBasis").value = b.contingency.manualBasis;
			let pc = b.contingency.percentile;
			if (typeof pc === "number" || /^0?\./.test(String(pc))) pc = {
				"0.06": "P50",
				"0.1": "P70",
				"0.10": "P70",
				"0.15": "P80",
				"0.2": "P90",
				"0.20": "P90"
			}[String(pc)] || "P70";
			if (pc) $("contPct").value = pc;
		}
		if (b.mgmtReservePct != null) $("mgmtPct").value = b.mgmtReservePct;
		if (b.escalation) {
			const x = b.escalation;
			$("inflRate").value = x.inflation;
			$("inflYears").value = x.years;
			$("fxShare").value = x.fxShare;
			$("fxMode").value = x.fxMode;
			$("fxBand").value = x.fxBand;
			state.esc = normalizeEscPlan(x);
			$("escMethod").value = state.esc.method;
			escInputsKey = "";
		}
		if (b.rangeAnalysis) {
			const ra = b.rangeAnalysis;
			if (Array.isArray(ra.lines)) state.ranges = ra.lines.map((l, i) => ({
				id: String(l.id || "m-" + i),
				name: String(l.name || ""),
				ml: Number(l.ml),
				lowPct: Number(l.lowPct),
				highPct: Number(l.highPct),
				basis: String(l.basis || "")
			}));
			if (ra.correlation != null && isFinite(Number(ra.correlation))) $("corrPct").value = String(Math.round(Number(ra.correlation) * 100));
			if (ra.includeRisks === false) $("rngRisks").checked = false;
			if (ra.timeCostPerDay != null && isFinite(Number(ra.timeCostPerDay))) $("rngTimeCost").value = String(ra.timeCostPerDay > 0 ? ra.timeCostPerDay : "");
			if (ra.timeCostBasis != null) $("rngTimeBasis").value = String(ra.timeCostBasis);
		}
		if (d.changeOrders) state.co = d.changeOrders;
		if (Array.isArray(d.baselineLog)) state.baselines = d.baselineLog;
	}
	function load() {
		if (gpiOn()) {
			const d = GPI.getModule("cost");
			if (d) applyData(d);
			else seedFromProject();
			return;
		}
		let d;
		try {
			d = JSON.parse(localStorage.getItem(STORE_KEY));
		} catch (e) {}
		if (d) applyData(d);
		else {
			state.co = JSON.parse(JSON.stringify(SAMPLE_CO));
			state.ranges = JSON.parse(JSON.stringify(SAMPLE_RANGES));
			$("rngTimeCost").value = String(SAMPLE_TIME_COST);
			$("rngTimeBasis").value = SAMPLE_TIME_BASIS;
			state.esc = buildSampleEscPlan((c) => "w-" + c);
			$("escMethod").value = "indices";
			escInputsKey = "";
			state.boe = buildSampleBoe();
			renderBoe();
		}
	}
	function gpiBadge() {
		if (document.getElementById("gpiBadge")) return;
		const name = gpiOn() && GPI.meta() && GPI.meta().name || "—";
		const css = document.createElement("style");
		css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:18px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-bdot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
		document.head.appendChild(css);
		const bar = document.createElement("div");
		bar.className = "gpi-badge";
		bar.id = "gpiBadge";
		bar.innerHTML = "<span class=\"gpi-bdot\"></span><span>Panel: <b>" + String(name).replace(/</g, "&lt;") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		bar.querySelector("#gpiSyncBtn").addEventListener("click", function() {
			save();
			const b = bar.querySelector("#gpiSyncBtn"), t = b.textContent;
			b.textContent = "✓ Sincronizado";
			setTimeout(function() {
				b.textContent = t;
			}, 1400);
		});
	}
	function init(reload) {
		session = gpiOn() ? GPI.openSession("cost") : null;
		renderBoe();
		load();
		const connected = gpiOn();
		if (connected) loadedProjectId = GPI.activeId();
		const pw1 = document.getElementById("pullWbs1"), pw3 = document.getElementById("pullWbs3");
		if (pw1) pw1.style.display = connected ? "inline-flex" : "none";
		if (pw3) pw3.style.display = connected ? "inline-flex" : "none";
		const pe1 = document.getElementById("pullEst1"), pe3 = document.getElementById("pullEst3");
		if (pe1) pe1.style.display = connected ? "inline-flex" : "none";
		if (pe3) pe3.style.display = connected ? "inline-flex" : "none";
		["pullRngEst", "pullRngWbs"].forEach((id) => {
			const b = document.getElementById(id);
			if (b) b.style.display = connected ? "inline-flex" : "none";
		});
		document.querySelectorAll("#classbar button").forEach((x) => x.classList.toggle("on", +x.dataset.c === state.curClass));
		renderClass();
		renderCO();
		recalcCont();
		buildDoc();
		checkThresholds();
		if (!connected || GPI.getModule("cost")) save();
		else {
			$("saveTxt").textContent = "Sin guardar aún: se sincronizará con tu primer cambio";
			buildJSON();
		}
		if (connected) {
			gpiBadge();
			window.addEventListener("beforeunload", save);
			document.addEventListener("visibilitychange", function() {
				if (document.hidden) save();
				else {
					netDirty = true;
					recalcCont();
				}
			});
			if (GPI.onChange) GPI.onChange(function() {
				netDirty = true;
				if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
					markProjectStale();
					return;
				}
				try {
					const el = document.querySelector("#gpiBadge b");
					const m = GPI.meta();
					if (el && m && m.name) el.textContent = m.name;
				} catch (e) {}
				const ae = document.activeElement;
				if (!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) recalcCont();
			});
		}
		if (reload) document.querySelector("[data-p=\"p1\"]").click();
	}
	init(false);
	Object.assign(window, {
		coPolicyHint,
		save,
		recalcCont,
		onBaseInput,
		pullFromWBS,
		pullFromCostEstimate,
		addCO,
		coStatus,
		delCO,
		buildDoc,
		coEdit,
		coBaseline,
		coKindHint,
		evalVariance,
		onContMethod,
		addRange,
		delRange,
		rangeEdit,
		pullRangesFromEstimate,
		pullRangesFromWbs,
		applyClassRange,
		onEscMethod,
		escEdit,
		boeEdit,
		boeListAdd,
		boeListDel,
		boeListEdit,
		boeCheck
	});
	//#endregion
})();
