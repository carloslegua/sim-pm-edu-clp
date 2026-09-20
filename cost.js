(function() {
	//#region src/shared/cost-variance.ts
	var RANK = {
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
		const level = ls.reduce((a, b) => RANK[b] > RANK[a] ? b : a);
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
	function quantile(sorted, p) {
		const pos = (sorted.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
		return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
	}
	function simulateRange(lines, opts) {
		const o = opts || {};
		const iterations = Math.max(1e3, Math.min(2e5, Math.floor(o.iterations || 1e4)));
		const seed = Number.isFinite(o.seed) ? o.seed : DEFAULT_SEED;
		const rho = Math.max(0, Math.min(1, o.correlation === void 0 || !isFinite(o.correlation) ? DEFAULT_CORRELATION : o.correlation));
		const valid = (lines || []).filter((l) => l && lineProblems(l).length === 0);
		const evs = (o.events || []).filter((e) => e && isFinite(e.prob) && e.prob > 0 && e.prob <= 1 && isFinite(e.low) && isFinite(e.likely) && isFinite(e.high) && e.low >= 0 && e.low <= e.likely && e.likely <= e.high && (e.sign === 1 || e.sign === -1));
		if (!valid.length && !evs.length) return null;
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
		const totals = new Float64Array(iterations);
		let sum = 0, sumSq = 0;
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
			for (let j = 0; j < evs.length; j++) {
				const occurs = rand() < evs[j].prob, u = rand();
				if (occurs) t += evs[j].sign * triInv(u, evs[j].low, evs[j].likely, evs[j].high);
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
			curve
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
	var toRiskRef = (r) => ({
		id: r.id,
		code: r.code,
		title: r.title,
		type: r.type,
		status: r.status
	});
	function riskEventsOf(risks, p) {
		const events = [], excluded = [];
		risks.filter(isOpen).forEach((r) => {
			const why = (reason) => excluded.push({
				code: r.code,
				title: r.title,
				reason
			});
			let pr, range, basis;
			const resProb = probEffective(r.resProbPct, r.resProb, p), resQuant = residualOf(r, p).assessed && resProb !== null && impactMean(r.resCostImpact) !== null;
			if (r.strategy && r.strategy !== "aceptar" && resQuant) {
				pr = resProb;
				range = r.resCostImpact;
				basis = "residual";
			} else {
				pr = probEffective(r.probPct, r.prob, p);
				range = r.costImpact;
				basis = r.strategy && r.strategy !== "aceptar" ? "inherente (residual sin cuantificar)" : "inherente";
			}
			if (pr === null || pr <= 0) return why("sin probabilidad");
			if (rangeProblems(range, "").length) return why("rango de costo incoherente");
			if (range.likely === null) return why("sin impacto en costo cuantificado");
			const low = range.low === null ? range.likely : range.low, high = range.high === null ? range.likely : range.high;
			events.push({
				id: r.id,
				name: r.code + " " + r.title,
				code: r.code,
				title: r.title,
				type: r.type,
				prob: Math.min(1, pr),
				low,
				likely: range.likely,
				high,
				sign: r.type === "amenaza" ? 1 : -1,
				basis
			});
		});
		return {
			events,
			excluded,
			ev: events.reduce((s, e) => s + e.sign * e.prob * (e.low + e.likely + e.high) / 3, 0)
		};
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
			effect: "se detiene la ejecución y aumentan los costos indirectos",
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
	//#region src/shared/change-orders.ts
	var FUND_CONT = "Contingencia";
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
	function validateApproval(o, orders, budget, risks) {
		const p = [], f = fundOf(o), a = num(o.cost);
		if (o.kind === "riesgo" && Array.isArray(risks)) riskLinkProblems(o, risks).forEach((x) => p.push(x));
		const an = analyzeChangeOrders((orders || []).filter((x) => x !== o), budget);
		if (o.kind !== "riesgo" && o.kind !== "imprevisto" && o.kind !== "alcance") p.push("clasifica la orden: riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance");
		if (!a) p.push("el Δ costo debe ser distinto de cero");
		if (!String(o.approver || "").trim()) p.push("registra quién aprueba (CCB, sponsor…)");
		if (o.kind === "alcance" && f === "cont") p.push("un cambio de alcance no se financia con contingencia (la contingencia cubre riesgos identificados dentro del alcance de la línea base)");
		if ((f === "mgmt" || f === "extra") && !o.sponsorAuth) p.push("usar la reserva de gestión o fondos adicionales requiere la autorización expresa del sponsor");
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
	var state = {
		curClass: 3,
		co: [],
		baselines: [],
		ranges: [],
		legacyMethod: ""
	};
	$("tabs").addEventListener("click", (e) => {
		const b = e.target.closest(".tab");
		if (!b) return;
		document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
		document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
		b.classList.add("active");
		$(b.dataset.p).classList.add("active");
		if (b.dataset.p === "p5") buildDoc();
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
	function eventsCtx() {
		const c = riskCtx(), e = riskEventsOf(c.risks, c.plan);
		const open = c.risks.filter((r) => r.status !== "materializado" && r.status !== "cerrado");
		return {
			source: c.source,
			events: e.events,
			excluded: e.excluded,
			ev: e.ev,
			responseCost: open.reduce((s, r) => s + (r.responseCost || 0), 0),
			open: open.length
		};
	}
	function simulate(rho, withEvents = includeRisksOn()) {
		const events = withEvents ? eventsCtx().events : [];
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
				e.sign
			])
		]);
		if (!(key in simCache)) {
			if (Object.keys(simCache).length > 24) Object.keys(simCache).forEach((k) => {
				delete simCache[k];
			});
			simCache[key] = simulateRange(state.ranges, {
				correlation: rho,
				iterations: DEFAULT_ITERATIONS,
				seed: DEFAULT_SEED,
				events
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
			box.innerHTML = `<div class="muted small"><b>Fuente:</b> ${esc(src)}. ${ec.source === "sin registro" ? "" : "No hay riesgos abiertos con probabilidad e impacto en costo cuantificados."}</div>`;
			return;
		}
		const only = simulate(corrValue(), false), cA = only ? contingencyAt(only, p).amount : 0, cB = res ? contingencyAt(res, p).amount : 0;
		const rows = ec.events.slice(0, 14).map((e) => `<tr><td class="mono">${esc(e.code)}</td><td>${esc(e.title)}</td><td>${e.type === "amenaza" ? "Amenaza" : "Oportunidad"}</td><td class="num">${Math.round(e.prob * 100)} %</td><td class="num">${fmt(e.low)} / ${fmt(e.likely)} / ${fmt(e.high)}</td><td class="muted">${esc(e.basis)}</td><td class="num">${e.sign < 0 ? "−" : ""}${fmt(e.prob * (e.low + e.likely + e.high) / 3)}</td></tr>`).join("");
		box.innerHTML = `<div class="muted small" style="margin-bottom:6px"><b>Fuente:</b> ${esc(src)} · ${ec.open} riesgo(s) abierto(s): <b>${ec.events.length}</b> entran a la simulación${ec.excluded.length ? ", " + ec.excluded.length + " sin cuantificar" : ""}. La contingencia cubre la exposición que <b>queda tras la respuesta</b> (residual).</div>
    <div style="overflow-x:auto"><table class="rng-res"><thead><tr><th>Cód.</th><th>Riesgo</th><th>Tipo</th><th class="num">Prob.</th><th class="num">Mín / Más prob. / Máx</th><th>Base</th><th class="num">Valor esperado</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="6">Valor esperado neto de los eventos${ec.events.length > 14 ? " (incluye los " + (ec.events.length - 14) + " no mostrados)" : ""}</td><td class="num">${fmt(ec.ev)}</td></tr></tfoot></table></div>
    <table class="rng-res" style="margin-top:10px;max-width:520px"><thead><tr><th>Contingencia P${p}</th><th class="num">Monto</th></tr></thead><tbody>
      <tr><td>Solo incertidumbre de las partidas</td><td class="num">${fmt(cA)}</td></tr>
      <tr><td>+ aporte de los eventos de riesgo</td><td class="num">${fmt(cB - cA)}</td></tr>
      <tr class="rng-selrow"><td>Contingencia total (partidas + eventos)</td><td class="num">${fmt(cB)}</td></tr></tbody></table>`;
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
	function recalcCont() {
		$("fxBandWrap").style.display = $("fxMode").value === "float" ? "block" : "none";
		const base = +$("baseCost").value || 0;
		const calc = contingencyCalc(base);
		const cont = calc.cont;
		const i = (+$("inflRate").value || 0) / 100, n = +$("inflYears").value || 0;
		const escInfl = base * (Math.pow(1 + i, n) - 1);
		let escFx = 0;
		if ($("fxMode").value === "float") escFx = base * ((+$("fxShare").value || 0) / 100) * ((+$("fxBand").value || 0) / 100);
		const escT = escInfl + escFx;
		const bac = base + cont + escT;
		const mgmt = bac * ((+$("mgmtPct").value || 0) / 100);
		const total = bac + mgmt;
		renderContUi(calc, base);
		$("kBase").textContent = fmt(base);
		$("kCont").textContent = fmt(cont);
		$("kContCap").textContent = calc.method === "manual" ? "manual" : $("contPct").value;
		$("kEsc").textContent = fmt(escT);
		$("kBAC").textContent = fmt(bac);
		$("kMgmt").textContent = fmt(mgmt);
		$("kTotal").textContent = fmt(total);
		$("kContP").textContent = base ? (cont / base * 100).toFixed(1) + "%" : "—";
		$("kEscP").textContent = base ? (escT / base * 100).toFixed(1) + "%" : "—";
		state._budget = {
			base,
			cont,
			esc: escT,
			bac,
			mgmt,
			total
		};
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
		return `<option value="">— Vincular riesgo —</option>${th.map((r) => `<option value="${escA(r.id)}" ${r.id === selectedId ? "selected" : ""}>${esc(r.code + " · " + (r.title || "sin título").slice(0, 44) + " (" + STATUS_LABEL[r.status] + ")")}</option>`).join("")}${selectedId && !th.some((r) => r.id === selectedId) ? `<option value="${escA(selectedId)}" selected>${esc((selectedCode || "?") + " (no está en el registro)")}</option>` : ""}`;
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
		buildJSON();
	}
	function renderDrawdown(refs, available) {
		const dd = contingencyByRisk(state.co, refs), ec = eventsCtx();
		const rows = dd.length ? dd.map((d) => `<tr><td class="mono">${esc(d.code)}</td><td>${esc(d.title)}</td><td class="num">${fmt2(d.contingency)}</td><td class="num">${fmt2(d.other)}</td><td class="num">${fmt2(d.pending)}</td><td class="num">${d.plannedMax === null ? "—" : fmt2(d.plannedMax)}</td><td>${d.orphan ? `<span class="pill bad">Riesgo eliminado</span>` : d.over ? `<span class="pill bad" title="Lo aprobado supera el impacto máximo que el análisis del riesgo había previsto">Supera lo previsto</span>` : `<span class="pill ok">Dentro de lo previsto</span>`}</td></tr>`).join("") : `<tr><td class="muted" colspan="7">Ninguna orden está vinculada a un riesgo del registro.</td></tr>`;
		const expo = ec.source === "sin registro" ? "Este proyecto no tiene Registro de Riesgos: no hay exposición residual que contrastar con la contingencia." : ec.events.length ? `La contingencia disponible (<b>${fmt(available)}</b>) ${available >= ec.ev ? "supera" : "<b>NO alcanza</b>"} el valor esperado neto de la exposición residual de los riesgos abiertos (<b>${fmt(ec.ev)}</b>, ${ec.events.length} evento(s)). Es una media (≈ P50): una contingencia a un percentil de decisión debe superarla con holgura.` : "No hay riesgos abiertos con impacto en costo cuantificado en el registro.";
		$("coDrawdown").innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Riesgo</th><th>Descripción</th><th class="num">Aprobado con contingencia</th><th class="num">Aprobado con otras fuentes</th><th class="num">Pendiente</th><th class="num">Impacto máx. previsto</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note" style="margin-top:10px">${expo}</div>`;
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
			const problems = validateApproval(r, state.co, coBudget(), riskRefs(riskCtx()));
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
		else if (f === "riskId") {
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
	function boeCORows() {
		if (!state.co.length) return `<tr><td class="muted" colspan="7">Sin órdenes de cambio registradas</td></tr>`;
		return state.co.map((r) => `<tr>
    <td class="mono">${esc(r.id)}</td><td>${esc(r.desc)}</td><td>${esc(kindLabel(r.kind))}${r.riskCode ? " · " + esc(r.riskCode) : ""}</td><td>${esc(r.cause)}</td>
    <td style="text-align:right" class="mono">${fmt2(+r.cost)}</td><td>${esc(r.fund)}</td>
    <td>${esc(r.status)}${r.status === "Aprobada" ? " · " + esc(r.approver || "—") + (r.sponsorAuth ? " (sponsor)" : "") : ""}${r.baselined ? " · " + esc(r.baselined) : ""}</td></tr>`).join("");
	}
	function rangeDocHtml() {
		if (contMethod() !== "rangos_mc") return "";
		const res = simulate(corrValue()), p = pctNum();
		const lines = state.ranges.length ? state.ranges.map((l) => `<tr><td>${esc(l.name)}</td><td style="text-align:right" class="mono">${fmt(Number(l.ml))}</td><td style="text-align:right" class="mono">${sgn(Number(l.lowPct))} % / ${sgn(Number(l.highPct))} %</td><td>${esc(l.basis || "— (sin fundamento)")}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Sin partidas definidas</td></tr>`;
		const ec = includeRisksOn() ? eventsCtx() : null;
		const evTxt = ec && ec.events.length ? `Incluye <b>${ec.events.length} evento(s) de riesgo</b> del ${ec.source === "registro" ? "Registro de Riesgos del proyecto" : "caso de ejemplo"} (${esc(ec.events.slice(0, 6).map((e) => e.code).join(", "))}${ec.events.length > 6 ? "…" : ""}), con su riesgo <b>residual</b> cuando está cuantificado; valor esperado neto ${fmt(ec.ev)}.` : "No incluye eventos de riesgo discretos (ninguno cuantificado en el registro, o se excluyeron).";
		return `<p style="font-size:12.5px;margin:10px 0 4px"><b>Base de la contingencia — estimación por rangos y simulación Monte Carlo (AACE RP 41R-08 y 40R-08).</b> ${res ? `Distribución triangular por partida; correlación entre partidas ${Math.round(res.correlation * 100)} %; ${res.iterations.toLocaleString("es-PE")} iteraciones (semilla ${res.seed}, reproducible). Estimado base Σ más probable ${fmt(res.ml)}; P50 ${fmt(res.p[50])}, P${p} ${fmt(res.p[p])}. Contingencia = P${p} − estimado base = <b>${fmt(contingencyAt(res, p).amount)}</b>. Cubre la incertidumbre de los rangos del estimado. ${evTxt}` : "Aún no hay partidas válidas."}</p>
    <table class="dt"><thead><tr><td style="font-weight:700;color:var(--muted)">Partida</td><td style="font-weight:700;color:var(--muted);text-align:right">Más probable</td><td style="font-weight:700;color:var(--muted);text-align:right">Mín / Máx</td><td style="font-weight:700;color:var(--muted)">Fundamento del rango</td></tr></thead><tbody>${lines}</tbody></table>`;
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
      <h4 class="dsec-t"><span class="dn">01</span>Reglas normativas del plan (PMBOK 8)</h4>
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
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">04</span>Bases del estimado (AACE RP 34R-05)</h4>
      <table class="dt">
        <tr><td>Fecha base</td><td>${esc($("boeDate").value) || "—"}</td></tr>
        <tr><td>Fuente de precios</td><td>${esc($("boeSource").value) || "—"}</td></tr>
        <tr><td>Supuestos</td><td>${esc($("boeAssum").value) || "—"}</td></tr>
        <tr><td>Exclusiones</td><td>${esc($("boeExcl").value) || "—"}</td></tr>
        <tr><td>Factores de productividad</td><td>${esc($("boeProd").value) || "—"}</td></tr>
      </table>
    </section>

    <section class="dsec">
      <h4 class="dsec-t"><span class="dn">05</span>Contingencia, escalation y presupuesto</h4>
      <table class="dt">
        <tr><td>Estimación de costos de las actividades</td><td>${fmt(b.base)}</td></tr>
        <tr><td>Contingencia</td><td>${fmt(b.cont)} — ${esc(METHOD_LABEL[contMethod()])}${contMethod() === "manual" ? "" : ", " + esc($("contPct").selectedOptions[0].text.split(" ")[0])} (${b.base ? (b.cont / b.base * 100).toFixed(1) : "—"}%)</td></tr>
        ${contMethod() === "clase_tabla" ? `<tr><td></td><td class="muted">Referencia didáctica por clase y percentil: no proviene de una norma de AACE ni de un análisis de riesgo del proyecto.</td></tr>` : ""}
        ${contMethod() === "manual" ? `<tr><td>Fundamento del porcentaje</td><td>${esc($("manualBasis").value) || "— (documentar)"}</td></tr>` : ""}
        <tr><td>Escalation / FX</td><td>${fmt(b.esc)} — inflación ${esc($("inflRate").value)}% a ${esc($("inflYears").value)} años; componente FX ${esc($("fxShare").value)}%, TC ${fxTxt}</td></tr>
        <tr><td><b>BAC — línea base de costos${state.baselines.length ? " (inicial)" : ""}</b></td><td><b>${fmt(b.bac)}</b> (excluye reserva de gestión)</td></tr>
        <tr><td>Reserva de gestión</td><td>${fmt(b.mgmt)} — propiedad del sponsor</td></tr>
        <tr><td><b>Presupuesto total</b></td><td><b>${fmt(b.total)}</b></td></tr>
        ${state.baselines.length ? `<tr><td><b>BAC vigente</b></td><td><b>${fmt(t.bacCurrent)}</b> — ${esc(state.baselines[state.baselines.length - 1].version)} (${state.baselines.length} cambio(s) de línea base)</td></tr>` : ""}
      </table>
      ${rangeDocHtml()}
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
				boe: {
					date: $("boeDate").value,
					source: $("boeSource").value,
					assumptions: $("boeAssum").value,
					exclusions: $("boeExcl").value,
					productivity: $("boeProd").value
				}
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
					results: rangeSummary()
				},
				mgmtReservePct: +$("mgmtPct").value,
				escalation: {
					inflation: +$("inflRate").value,
					years: +$("inflYears").value,
					fxShare: +$("fxShare").value,
					fxMode: $("fxMode").value,
					fxBand: +$("fxBand").value
				},
				computed: state._budget || null
			},
			changeOrders: state.co,
			changeTotals: state._coTotals || null,
			baselineLog: state.baselines
		};
	}
	function rangeSummary() {
		const r = simulate(corrValue());
		return r ? {
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
		} : null;
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
			$("boeDate").value = e.boe.date || "";
			$("boeSource").value = e.boe.source || "";
			$("boeAssum").value = e.boe.assumptions || "";
			$("boeExcl").value = e.boe.exclusions || "";
			$("boeProd").value = e.boe.productivity || "";
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
			});
			if (GPI.onChange) GPI.onChange(function() {
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
		applyClassRange
	});
	//#endregion
})();
