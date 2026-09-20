(function() {
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
	function validateApproval(o, orders, budget) {
		const p = [], f = fundOf(o), a = num(o.cost);
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
			desc: "Estimado de orden de magnitud. Mínima definición de ingeniería; se usa para descartar alternativas."
		},
		4: {
			mat: "1% – 15%",
			use: "Estudio de factibilidad",
			meth: "Predominantemente estocástico",
			range: "-20% / +40%",
			desc: "Basado en factores y equipos mayores. Soporta decisiones de continuidad del proyecto."
		},
		3: {
			mat: "10% – 40%",
			use: "Autorización de presupuesto / control base",
			meth: "Mixto estocástico–determinístico",
			range: "-15% / +30%",
			desc: "Semidetallado. Marca el paso de estudio a ejecución; suele ser la base del control."
		},
		2: {
			mat: "30% – 75%",
			use: "Control y oferta / licitación",
			meth: "Predominantemente determinístico",
			range: "-10% / +20%",
			desc: "Detallado por partidas. Usado para control detallado y para ofertar."
		},
		1: {
			mat: "65% – 100%",
			use: "Estimado definitivo / cierre de oferta",
			meth: "Determinístico (cantidades y precios)",
			range: "-5% / +15%",
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
			approvedOn: "2026-08-03"
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
	var state = {
		curClass: 3,
		co: [],
		baselines: []
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
	function recalcCont() {
		$("fxBandWrap").style.display = $("fxMode").value === "float" ? "block" : "none";
		const base = +$("baseCost").value || 0;
		const contRate = contingencyRate();
		const cont = base * contRate;
		const i = (+$("inflRate").value || 0) / 100, n = +$("inflYears").value || 0;
		const escInfl = base * (Math.pow(1 + i, n) - 1);
		let escFx = 0;
		if ($("fxMode").value === "float") escFx = base * ((+$("fxShare").value || 0) / 100) * ((+$("fxBand").value || 0) / 100);
		const escT = escInfl + escFx;
		const bac = base + cont + escT;
		const mgmt = bac * ((+$("mgmtPct").value || 0) / 100);
		const total = bac + mgmt;
		const hint = document.getElementById("contPctHint");
		if (hint) hint.innerHTML = "Clase <b>" + state.curClass + "</b> · <b>" + $("contPct").value + "</b> → contingencia <b>" + (contRate * 100).toFixed(1) + "%</b> del estimado base (AACE 18R-97: a menor madurez del diseño, mayor contingencia para el mismo nivel de confianza).";
		$("kBase").textContent = fmt(base);
		$("kCont").textContent = fmt(cont);
		$("kContCap").textContent = $("contPct").value;
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
	function renderCO() {
		const tb = $("coBody");
		tb.innerHTML = "";
		state.co.forEach((r, i) => {
			const locked = r.status !== "Pendiente";
			const usesReserve = r.fund !== FUND_CONT;
			const tr = document.createElement("tr");
			tr.innerHTML = `
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.desc)}</td>
      <td><span class="pill ${r.kind ? "ok" : "bad"}" title="${escA(r.kind ? CO_KIND_HINT[r.kind] : "Clasifica la orden antes de aprobarla")}">${esc(kindLabel(r.kind))}</span></td>
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
		buildJSON();
	}
	function coKindHint() {
		const k = $("coKind").value;
		$("coKindHint").textContent = k ? CO_KIND_HINT[k] : "Clasifica el cambio: la naturaleza no decide por sí sola la fuente de fondos.";
	}
	function coStatus(sel) {
		const r = state.co[+sel.dataset.i];
		if (r.baselined) {
			showToast(r.id + " ya está incorporada a la línea base " + r.baselined + ": su estado no se puede cambiar.");
			renderCO();
			return;
		}
		if (sel.value === "Aprobada") {
			const problems = validateApproval(r, state.co, coBudget());
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
		if (el.dataset.f === "approver") r.approver = el.value.trim();
		else if (el.dataset.f === "sponsorAuth") r.sponsorAuth = el.checked;
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
		state.co.push({
			id: "OC-" + String(n).padStart(3, "0"),
			desc,
			cause: $("coCause").value.trim() || "—",
			cost: +$("coCost").value || 0,
			fund: $("coFund").value,
			status: "Pendiente",
			kind: kindSel.value,
			approver: "",
			sponsorAuth: false
		});
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
    <td class="mono">${esc(r.id)}</td><td>${esc(r.desc)}</td><td>${esc(kindLabel(r.kind))}</td><td>${esc(r.cause)}</td>
    <td style="text-align:right" class="mono">${fmt2(+r.cost)}</td><td>${esc(r.fund)}</td>
    <td>${esc(r.status)}${r.status === "Aprobada" ? " · " + esc(r.approver || "—") + (r.sponsorAuth ? " (sponsor)" : "") : ""}${r.baselined ? " · " + esc(r.baselined) : ""}</td></tr>`).join("");
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
        <tr><td>Contingencia</td><td>${fmt(b.cont)} — ${esc($("contMethod").value)}, ${esc($("contPct").selectedOptions[0].text.split(" ")[0])} (${b.base ? (b.cont / b.base * 100).toFixed(1) : "—"}%)</td></tr>
        <tr><td>Escalation / FX</td><td>${fmt(b.esc)} — inflación ${esc($("inflRate").value)}% a ${esc($("inflYears").value)} años; componente FX ${esc($("fxShare").value)}%, TC ${fxTxt}</td></tr>
        <tr><td><b>BAC — línea base de costos${state.baselines.length ? " (inicial)" : ""}</b></td><td><b>${fmt(b.bac)}</b> (excluye reserva de gestión)</td></tr>
        <tr><td>Reserva de gestión</td><td>${fmt(b.mgmt)} — propiedad del sponsor</td></tr>
        <tr><td><b>Presupuesto total</b></td><td><b>${fmt(b.total)}</b></td></tr>
        ${state.baselines.length ? `<tr><td><b>BAC vigente</b></td><td><b>${fmt(t.bacCurrent)}</b> — ${esc(state.baselines[state.baselines.length - 1].version)} (${state.baselines.length} cambio(s) de línea base)</td></tr>` : ""}
      </table>
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
      <p style="font-size:12.5px;margin:0">Ante una variación que cruce los umbrales anteriores: (1) detectar, (2) analizar la causa raíz y clasificar el cambio (riesgo materializado, trabajo imprevisto dentro del alcance o cambio de alcance: no se asume la fuente de fondos), (3) registrar la solicitud con su financiación y efecto presupuestario, (4) evaluar en el CCB (el sponsor autoriza el uso de la reserva de gestión o de fondos adicionales) y, solo si se aprueba y se decide, incorporar a la línea base con una versión nueva (LB-n), (5) actualizar ETC/EAC con frecuencia ${esc($("fcastFreq").value).toLowerCase()} y comunicar en el reporte de desempeño.</p>
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
					method: $("contMethod").value,
					percentile: $("contPct").value,
					rate: contingencyRate()
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
	function save() {
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
			if (b.contingency.method) $("contMethod").value = b.contingency.method;
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
		else state.co = JSON.parse(JSON.stringify(SAMPLE_CO));
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
		document.querySelectorAll("#classbar button").forEach((x) => x.classList.toggle("on", +x.dataset.c === state.curClass));
		renderClass();
		renderCO();
		recalcCont();
		buildDoc();
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
		coKindHint
	});
	//#endregion
})();
