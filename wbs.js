(function() {
	//#region src/modules/wbs/main.ts
	var NODE_W = 180;
	var NODE_H = 118;
	var GAP_X = 28;
	var GAP_Y = 64;
	var LEVEL_COLORS = [
		"#00b6ec",
		"#6c5ce7",
		"#00c2a8",
		"#ff9f1c",
		"#ff6b8b",
		"#2e4374"
	];
	var nodes = {};
	var gpiRaciModule = null;
	var gpiObsModule = null;
	var gpiScopeModule = null;
	var gpiActivitiesModule = null;
	var gpiPertModule = null;
	var gpiScheduleModule = null;
	var gpiSchedulePlanModule = null;
	var gpiCostEstimateModule = null;
	var scheduleLockedLeafIds = /* @__PURE__ */ new Set();
	var costEstimateLockedLeafIds = /* @__PURE__ */ new Set();
	var rootId = "root";
	var selectedId = null;
	var zoom = 1;
	var draggedId = null;
	var currentView = "tree";
	var idCounter = 1;
	function uid() {
		return "n" + idCounter++;
	}
	function newNode(parentId, name, overrides) {
		const id = uid();
		nodes[id] = Object.assign({
			id,
			parentId,
			name: name || "Nuevo paquete",
			duration: 0,
			cost: 0,
			resource: "",
			percent: 0,
			start: "",
			end: "",
			notes: "",
			children: [],
			collapsed: false,
			orientation: "spread"
		}, overrides || {});
		if (parentId && nodes[parentId]) nodes[parentId].children.push(id);
		return id;
	}
	var MONTHS_ES = [
		"ene",
		"feb",
		"mar",
		"abr",
		"may",
		"jun",
		"jul",
		"ago",
		"sep",
		"oct",
		"nov",
		"dic"
	];
	function daysBetween(startIso, endIso) {
		if (!startIso || !endIso) return null;
		const s = /* @__PURE__ */ new Date(startIso + "T00:00:00");
		const e = /* @__PURE__ */ new Date(endIso + "T00:00:00");
		if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
		const diff = Math.round((e.getTime() - s.getTime()) / 864e5);
		return diff >= 0 ? diff + 1 : null;
	}
	function formatDateShort(iso) {
		if (!iso) return "";
		const d = /* @__PURE__ */ new Date(iso + "T00:00:00");
		if (isNaN(d.getTime())) return "";
		return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
	}
	function formatDateRange(startIso, endIso) {
		if (!startIso || !endIso) return "";
		return `${formatDateShort(startIso)} – ${formatDateShort(endIso)}`;
	}
	function blankProject(title) {
		nodes = {};
		idCounter = 1;
		rootId = newNode(null, title || "Proyecto sin título");
		selectedId = rootId;
	}
	function loadSample() {
		blankProject("Proyecto DISTRIB+ S.A. — Almacén Lurín");
		const root = rootId;
		const dirProy = newNode(root, "Dirección de Proyecto", { resource: "PM" });
		newNode(dirProy, "Acta de constitución", {
			duration: 3,
			cost: 12e3,
			percent: 100,
			resource: "PM",
			start: "2026-07-06",
			end: "2026-07-08"
		});
		newNode(dirProy, "Plan de gestión del proyecto", {
			duration: 8,
			cost: 38e3,
			percent: 60,
			resource: "PM",
			start: "2026-07-09",
			end: "2026-07-20"
		});
		newNode(dirProy, "Informes de seguimiento y control", {
			duration: 60,
			cost: 145e3,
			percent: 20,
			resource: "PM",
			start: "2026-07-21",
			end: "2026-10-23"
		});
		const ing = newNode(root, "Ingeniería y Diseño", { resource: "Ing. Civil" });
		newNode(ing, "Estudio de suelos", {
			duration: 10,
			cost: 28e3,
			percent: 100,
			resource: "Geotecnia",
			start: "2026-07-06",
			end: "2026-07-17"
		});
		newNode(ing, "Diseño estructural", {
			duration: 20,
			cost: 165e3,
			percent: 80,
			resource: "Ing. Estructural",
			start: "2026-07-20",
			end: "2026-08-14"
		});
		newNode(ing, "Diseño eléctrico y sanitario", {
			duration: 15,
			cost: 98e3,
			percent: 50,
			resource: "Ing. MEP",
			start: "2026-07-27",
			end: "2026-08-14"
		});
		newNode(ing, "Permisos y licencias municipales", {
			duration: 25,
			cost: 64e3,
			percent: 30,
			resource: "Legal",
			start: "2026-07-20",
			end: "2026-08-21"
		});
		const proc = newNode(root, "Procura", { resource: "Logística" });
		newNode(proc, "Estructuras metálicas prefabricadas", {
			duration: 18,
			cost: 182e4,
			percent: 10,
			resource: "Proveedor A",
			start: "2026-07-27",
			end: "2026-08-19"
		});
		newNode(proc, "Materiales de construcción", {
			duration: 12,
			cost: 715e3,
			percent: 25,
			resource: "Proveedor B",
			start: "2026-08-03",
			end: "2026-08-17"
		});
		newNode(proc, "Equipos eléctricos e instalaciones", {
			duration: 14,
			cost: 415e3,
			percent: 0,
			resource: "Proveedor C",
			start: "2026-08-10",
			end: "2026-08-26"
		});
		const constr = newNode(root, "Construcción", { resource: "Residente de Obra" });
		newNode(constr, "Movimiento de tierras", {
			duration: 10,
			cost: 38e4,
			percent: 0,
			resource: "Cuadrilla A",
			start: "2026-08-03",
			end: "2026-08-14"
		});
		newNode(constr, "Cimentaciones", {
			duration: 15,
			cost: 735e3,
			percent: 0,
			resource: "Cuadrilla B",
			start: "2026-08-17",
			end: "2026-09-04"
		});
		newNode(constr, "Estructura y cobertura", {
			duration: 25,
			cost: 1165e3,
			percent: 0,
			resource: "Cuadrilla C",
			start: "2026-09-07",
			end: "2026-10-09"
		});
		newNode(constr, "Acabados y cerramientos", {
			duration: 18,
			cost: 55e4,
			percent: 0,
			resource: "Cuadrilla D",
			start: "2026-09-21",
			end: "2026-10-16"
		});
		newNode(constr, "Instalaciones MEP", {
			duration: 20,
			cost: 485e3,
			percent: 0,
			resource: "Subcontrata MEP",
			start: "2026-09-28",
			end: "2026-10-23"
		});
		nodes[constr].orientation = "stack";
		const com = newNode(root, "Pruebas y Puesta en Marcha", { resource: "QA/QC" });
		newNode(com, "Pruebas de instalaciones", {
			duration: 6,
			cost: 145e3,
			percent: 0,
			resource: "QA/QC",
			start: "2026-10-26",
			end: "2026-10-31"
		});
		newNode(com, "Capacitación al cliente", {
			duration: 3,
			cost: 48e3,
			percent: 0,
			resource: "PM",
			start: "2026-11-02",
			end: "2026-11-04"
		});
		newNode(com, "Acta de entrega y cierre", {
			duration: 2,
			cost: 92e3,
			percent: 0,
			resource: "PM",
			start: "2026-11-05",
			end: "2026-11-06"
		});
		selectedId = root;
	}
	function visibleChildren(id) {
		return nodes[id] && nodes[id].collapsed ? [] : nodes[id] ? nodes[id].children : [];
	}
	function countDescendants(id) {
		let count = 0;
		function walk(nid) {
			nodes[nid].children.forEach((cid) => {
				count++;
				walk(cid);
			});
		}
		walk(id);
		return count;
	}
	function isDescendant(ancestorId, candidateId) {
		if (ancestorId === candidateId) return true;
		let n = nodes[candidateId];
		while (n && n.parentId) {
			if (n.parentId === ancestorId) return true;
			n = nodes[n.parentId];
		}
		return false;
	}
	function depthOf(id) {
		let d = 0, n = nodes[id];
		while (n && n.parentId) {
			d++;
			n = nodes[n.parentId];
		}
		return d;
	}
	function deleteSubtree(id) {
		const node = nodes[id];
		if (!node) return;
		[...node.children].forEach(deleteSubtree);
		if (node.parentId && nodes[node.parentId]) {
			const arr = nodes[node.parentId].children;
			const idx = arr.indexOf(id);
			if (idx > -1) arr.splice(idx, 1);
		}
		if (draggedId === id) draggedId = null;
		delete nodes[id];
	}
	function computeCodes() {
		const codes = {};
		function walk(id, prefix) {
			codes[id] = prefix;
			nodes[id].children.forEach((cid, i) => walk(cid, prefix ? `${prefix}.${i + 1}` : `${i + 1}`));
		}
		nodes[rootId].children.forEach((cid, i) => walk(cid, `${i + 1}`));
		codes[rootId] = "0";
		return codes;
	}
	function computeRollup() {
		const rolled = {};
		function walk(id) {
			const node = nodes[id];
			const kids = node.children;
			if (kids.length === 0) {
				const dateDuration = daysBetween(node.start, node.end);
				rolled[id] = {
					cost: node.cost || 0,
					duration: dateDuration != null ? dateDuration : node.duration || 0,
					start: node.start || null,
					end: node.end || null,
					percent: node.percent || 0,
					isLeaf: true
				};
				return rolled[id];
			}
			let cost = 0, weightedPercent = 0, maxDuration = 0;
			let minStart = null, maxEnd = null;
			kids.forEach((cid) => {
				const r = walk(cid);
				cost += r.cost;
				weightedPercent += r.cost > 0 ? r.percent * r.cost : r.percent;
				if (r.duration > maxDuration) maxDuration = r.duration;
				if (r.start && (!minStart || r.start < minStart)) minStart = r.start;
				if (r.end && (!maxEnd || r.end > maxEnd)) maxEnd = r.end;
			});
			const totalForWeight = kids.reduce((s, cid) => s + (rolled[cid].cost > 0 ? rolled[cid].cost : 1), 0);
			const spanDuration = daysBetween(minStart, maxEnd);
			rolled[id] = {
				cost,
				duration: spanDuration != null ? spanDuration : maxDuration,
				start: minStart,
				end: maxEnd,
				percent: totalForWeight > 0 ? Math.round(weightedPercent / totalForWeight) : 0,
				isLeaf: false
			};
			return rolled[id];
		}
		walk(rootId);
		return rolled;
	}
	var SPREAD_SIBLING_GAP = GAP_X;
	var SPREAD_DEPTH_GAP = GAP_Y;
	var STACK_SIBLING_GAP = 30;
	var STACK_DEPTH_GAP = 34;
	var STACK_INDENT = Math.round(NODE_W * .2);
	function computeLayout() {
		const sizes = {};
		const positions = {};
		function computeSize(id) {
			const node = nodes[id];
			const kids = visibleChildren(id);
			if (kids.length === 0) {
				sizes[id] = {
					w: NODE_W,
					h: NODE_H
				};
				return sizes[id];
			}
			kids.forEach(computeSize);
			if ((node.orientation || "spread") === "stack") {
				const childrenW = Math.max(...kids.map((cid) => sizes[cid].w));
				const childrenH = kids.reduce((s, cid) => s + sizes[cid].h, 0) + STACK_SIBLING_GAP * (kids.length - 1);
				sizes[id] = {
					w: Math.max(NODE_W, STACK_INDENT + childrenW),
					h: 152 + childrenH,
					childExtent: {
						w: childrenW,
						h: childrenH
					}
				};
			} else {
				const childrenW = kids.reduce((s, cid) => s + sizes[cid].w, 0) + SPREAD_SIBLING_GAP * (kids.length - 1);
				const childrenH = Math.max(...kids.map((cid) => sizes[cid].h));
				sizes[id] = {
					w: Math.max(NODE_W, childrenW),
					h: 182 + childrenH,
					childExtent: {
						w: childrenW,
						h: childrenH
					}
				};
			}
			return sizes[id];
		}
		function assignPos(id, originX, originY) {
			const node = nodes[id];
			const kids = visibleChildren(id);
			const size = sizes[id];
			if (kids.length === 0) {
				positions[id] = {
					x: originX,
					y: originY
				};
				return;
			}
			if ((node.orientation || "spread") === "stack") {
				positions[id] = {
					x: originX,
					y: originY
				};
				const childX = originX + STACK_INDENT;
				let cy = originY + NODE_H + STACK_DEPTH_GAP;
				kids.forEach((cid) => {
					assignPos(cid, childX, cy);
					cy += sizes[cid].h + STACK_SIBLING_GAP;
				});
			} else {
				positions[id] = {
					x: originX + (size.w - NODE_W) / 2,
					y: originY
				};
				const childY = originY + NODE_H + SPREAD_DEPTH_GAP;
				let cx = originX + (size.w - size.childExtent.w) / 2;
				kids.forEach((cid) => {
					assignPos(cid, cx, childY);
					cx += sizes[cid].w + SPREAD_SIBLING_GAP;
				});
			}
		}
		computeSize(rootId);
		assignPos(rootId, 0, 0);
		return positions;
	}
	function setOrientationForBranch(targetId, o) {
		function walk(id) {
			nodes[id].orientation = o;
			nodes[id].children.forEach(walk);
		}
		walk(targetId);
		render();
		setTimeout(fitToScreen, 50);
	}
	function fmtMoney(v) {
		return "S/ " + (v || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
	}
	function render() {
		const rolled = computeRollup();
		const codes = computeCodes();
		if (currentView === "tree") renderTree(rolled, codes);
		else renderTable(rolled, codes);
		renderProps(rolled);
		renderStats(rolled);
		renderLegend();
		updateOrientationUI();
	}
	function refreshValues() {
		const rolled = computeRollup();
		const codes = computeCodes();
		renderStats(rolled);
		if (currentView === "tree") renderTree(rolled, codes);
		else renderTable(rolled, codes);
	}
	function renderTree(rolled, codes) {
		const canvas = document.getElementById("canvas");
		const svg = document.getElementById("linksSvg");
		canvas.querySelectorAll(".node").forEach((n) => n.remove());
		const positions = computeLayout();
		let maxX = 0, maxY = 0;
		Object.entries(positions).forEach(([, pos]) => {
			maxX = Math.max(maxX, pos.x + NODE_W);
			maxY = Math.max(maxY, pos.y + NODE_H);
		});
		canvas.style.width = maxX + 120 + "px";
		canvas.style.height = maxY + 120 + "px";
		svg.setAttribute("width", String(maxX + 120));
		svg.setAttribute("height", String(maxY + 120));
		let linkPaths = "";
		Object.values(nodes).forEach((node) => {
			const o = node.orientation || "spread";
			const kids = visibleChildren(node.id);
			const p = positions[node.id];
			if (!p || kids.length === 0) return;
			if (o === "stack") {
				const trunkX = p.x + 14;
				const y1 = p.y + NODE_H;
				kids.forEach((cid) => {
					const c = positions[cid];
					if (!c) return;
					const childDepth = depthOf(cid);
					const color = LEVEL_COLORS[Math.min(childDepth - 1, LEVEL_COLORS.length - 1)];
					const y2 = c.y + NODE_H / 2;
					const x2 = c.x;
					const d = `M${trunkX},${y1} L${trunkX},${y2} L${x2},${y2}`;
					linkPaths += `<path class="link" stroke="${color}" d="${d}" />`;
				});
			} else kids.forEach((cid) => {
				const c = positions[cid];
				if (!c) return;
				const childDepth = depthOf(cid);
				const color = LEVEL_COLORS[Math.min(childDepth - 1, LEVEL_COLORS.length - 1)];
				const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H;
				const x2 = c.x + NODE_W / 2, y2 = c.y;
				const midY = (y1 + y2) / 2;
				const d = `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`;
				linkPaths += `<path class="link" stroke="${color}" d="${d}" />`;
			});
		});
		svg.innerHTML = linkPaths;
		const LEVEL_TYPE_LABEL = {
			1: "Fase",
			2: "Entregable"
		};
		Object.entries(positions).forEach(([id, pos]) => {
			const node = nodes[id];
			const depth = depthOf(id);
			const r = rolled[id];
			const isRoot = id === rootId;
			const color = isRoot ? "#00b6ec" : LEVEL_COLORS[Math.min(depth - 1, LEVEL_COLORS.length - 1)];
			const hasKids = node.children.length > 0;
			const isCollapsed = !!node.collapsed;
			const nodeOrient = node.orientation || "spread";
			const typeLabel = isRoot ? "Proyecto" : LEVEL_TYPE_LABEL[depth] || "Paquete de trabajo";
			const el = document.createElement("div");
			el.className = "node" + (id === selectedId ? " selected" : "") + (isRoot ? " is-root" : "") + (nodeOrient === "stack" ? " orient-stack" : "");
			el.style.left = pos.x + "px";
			el.style.top = pos.y + "px";
			el.dataset.id = id;
			el.draggable = !isRoot;
			if (!isRoot) el.style.borderLeftColor = color;
			el.innerHTML = `
      <span class="code" style="background:${hexA(color, .18)};color:${color}">${codes[id]}</span>
      ${hasKids ? `<span class="orient-flag" title="Esta rama está en orientación ${nodeOrient === "stack" ? "vertical" : "horizontal"}">${nodeOrient === "stack" ? "↕" : "↔"}</span>` : ""}
      ${!r.isLeaf ? `<span class="rollup-flag" title="Valores acumulados de subniveles">Σ</span>` : ""}
      <span class="level-type">${typeLabel}</span>
      <div class="name">${escapeHtml(node.name)}</div>
      <div class="metrics">
        <span>${r.duration} d</span>
        <span><b>${fmtMoney(r.cost)}</b></span>
      </div>
      ${r.start && r.end ? `<div class="date-range">${formatDateRange(r.start, r.end)}</div>` : ""}
      <div class="bar-track"><div class="bar-fill" style="width:${r.percent}%; background:${r.percent >= 100 ? "var(--good)" : color}"></div></div>
      <div class="add-child-btn" title="Agregar subtarea">+</div>
      ${hasKids ? `<div class="collapse-btn${isCollapsed ? " is-collapsed" : ""}" title="${isCollapsed ? "Expandir rama (" + countDescendants(id) + " ocultos)" : "Colapsar rama"}">${isCollapsed ? "+" + countDescendants(id) : "−"}</div>` : ""}
    `;
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				selectNode(id);
			});
			el.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				selectNode(id);
				focusNameField();
			});
			el.querySelector(".add-child-btn").addEventListener("click", (e) => {
				e.stopPropagation();
				selectedId = newNode(id, "Nueva subtarea");
				render();
				focusNameField();
			});
			const collapseBtn = el.querySelector(".collapse-btn");
			if (collapseBtn) collapseBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				node.collapsed = !node.collapsed;
				render();
			});
			if (!isRoot) {
				el.addEventListener("dragstart", (e) => {
					draggedId = id;
					el.classList.add("dragging");
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", id);
				});
				el.addEventListener("dragend", () => {
					el.classList.remove("dragging");
					clearDropTargets();
					draggedId = null;
				});
			}
			el.addEventListener("dragover", (e) => {
				if (!draggedId || !nodes[draggedId] || draggedId === id) return;
				if (isDescendant(draggedId, id)) return;
				e.preventDefault();
				el.classList.add("drop-target");
			});
			el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
			el.addEventListener("drop", (e) => {
				e.preventDefault();
				el.classList.remove("drop-target");
				if (!draggedId || !nodes[draggedId] || draggedId === id || isDescendant(draggedId, id)) return;
				reparent(draggedId, id);
			});
			canvas.appendChild(el);
		});
	}
	function clearDropTargets() {
		document.querySelectorAll(".node.drop-target").forEach((n) => n.classList.remove("drop-target"));
	}
	function reparent(childId, newParentId) {
		const child = nodes[childId];
		const newParent = nodes[newParentId];
		if (!child || !newParent) return;
		const oldParent = nodes[child.parentId];
		if (oldParent) {
			const idx = oldParent.children.indexOf(childId);
			if (idx > -1) oldParent.children.splice(idx, 1);
		}
		child.parentId = newParentId;
		newParent.children.push(childId);
		selectedId = childId;
		render();
		setStatus(`"${child.name}" reasignado bajo "${newParent.name}"`);
	}
	function renderTable(rolled, codes) {
		const wrap = document.getElementById("tableView");
		const rows = [];
		function walk(id, depth) {
			if (id !== rootId) rows.push({
				id,
				depth
			});
			nodes[id].children.forEach((cid) => walk(cid, depth + 1));
		}
		walk(rootId, 0);
		let html = `<table class="wbs-table">
    <thead><tr>
      <th style="width:80px;">Código EDT</th>
      <th>Paquete de trabajo</th>
      <th style="width:70px;">Nivel</th>
      <th style="width:90px;">Duración</th>
      <th style="width:90px;">Inicio</th>
      <th style="width:90px;">Fin</th>
      <th style="width:110px;">Costo</th>
      <th style="width:120px;">Responsable</th>
      <th style="width:120px;">Avance</th>
    </tr></thead><tbody>`;
		rows.forEach(({ id, depth }) => {
			const node = nodes[id];
			const r = rolled[id];
			const color = LEVEL_COLORS[Math.min(depth - 1, LEVEL_COLORS.length - 1)];
			html += `<tr>
      <td><span class="code-chip" style="background:${hexA(color, .18)};color:${color}">${codes[id]}</span></td>
      <td><div class="indent-name" style="padding-left:${(depth - 1) * 18}px;">${r.isLeaf ? "" : "📁"} ${escapeHtml(node.name)}</div></td>
      <td>${depth}</td>
      <td>${r.duration} d</td>
      <td>${formatDateShort(r.start) || "—"}</td>
      <td>${formatDateShort(r.end) || "—"}</td>
      <td>${fmtMoney(r.cost)}</td>
      <td>${escapeHtml(node.resource || "—")}</td>
      <td>${r.percent}%</td>
    </tr>`;
		});
		html += "</tbody></table>";
		wrap.innerHTML = html;
	}
	function renderProps(rolledAll) {
		const panel = document.getElementById("propsPanel");
		if (!selectedId || !nodes[selectedId]) {
			panel.innerHTML = `<div class="empty-hint">Selecciona un nodo del diagrama para editar sus propiedades.</div>`;
			return;
		}
		const node = nodes[selectedId];
		const isRoot = selectedId === rootId;
		const rolled = rolledAll[selectedId];
		const isLeaf = rolled.isLeaf;
		const cpmLocked = cpmLocksDates(node);
		const costLocked = costEstimateLocksCost(node);
		const costEditable = isLeaf && !costLocked;
		const hasDates = isLeaf && !cpmLocked && daysBetween(node.start, node.end) != null;
		const durationEditable = isLeaf && !cpmLocked && !hasDates;
		const datesEditable = isLeaf && !cpmLocked;
		const obsOptions = gpiObsModule && window.GPI && window.GPI.util ? window.GPI.util.obsNodes(gpiObsModule) : [];
		panel.innerHTML = `
    <div class="field">
      <label>Nombre del paquete</label>
      <input id="f_name" value="${escapeAttr(node.name)}" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Fecha inicio</label>
        <input id="f_start" type="date" value="${(isLeaf ? node.start : rolled.start) || ""}" ${datesEditable ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Fecha fin</label>
        <input id="f_end" type="date" value="${(isLeaf ? node.end : rolled.end) || ""}" ${datesEditable ? "" : "disabled"} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Duración (días)</label>
        <input id="f_duration" type="number" min="0" value="${rolled.duration}" ${durationEditable ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Costo (S/)</label>
        <input id="f_cost" type="number" min="0" value="${isLeaf ? node.cost : rolled.cost}" ${costEditable ? "" : "disabled"} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>% Avance</label>
        <input id="f_percent" type="number" min="0" max="100" value="${isLeaf ? node.percent : rolled.percent}" ${isLeaf ? "" : "disabled"} />
      </div>
      <div class="field">
        <label>Responsable</label>
        ${raciLocksResource(node) ? `<input id="f_resource" value="${escapeAttr(node.resource)}" disabled title="Definido por la Matriz RACI" />` : resourceFieldHtml(node, obsOptions)}
      </div>
    </div>
    ${raciLocksResource(node) ? `<div class="empty-hint">🔗 <b>Definido en la Matriz RACI</b> a partir del "R" (Responsable) asignado a este paquete. Para cambiarlo, abre <a href="RACI_Matrix.html" style="color:var(--cyan-dark); font-weight:700;">Matriz RACI ▸</a></div>` : !obsOptions.length ? `<div class="empty-hint">⚠ <b>Aún no existe la OBS de este proyecto.</b> Créala primero en <a href="OBS_Builder.html" style="color:var(--cyan-dark); font-weight:700;">OBS Builder ▸</a> para poder asignar responsables desde una lista.</div>` : isLeaf ? `<div class="empty-hint">Sugerencia: define el responsable en la <a href="RACI_Matrix.html" style="color:var(--cyan-dark); font-weight:700;">Matriz RACI ▸</a> (rol "R") en vez de elegirlo aquí — así queda formalmente registrado en la RAM del proyecto.</div>` : ""}
    <div class="field">
      <label>Notas / Descripción</label>
      <textarea id="f_notes">${escapeHtml(node.notes || "")}</textarea>
    </div>
    ${costLocked ? `<div class="empty-hint">🔗 <b>Tomado de Estimar los Costos</b> (suma del Subtotal de todas sus actividades). Para cambiarlo, abre <a href="Estimar_Costos.html" style="color:var(--cyan-dark); font-weight:700;">Estimar los Costos ▸</a></div>` : isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Este costo se ingresa aquí (bottom-up) hasta que <a href="Estimar_Costos.html" style="color:var(--cyan-dark); font-weight:700;">Estimar los Costos ▸</a> calcule uno real para este paquete.</div>` : ""}
    ${cpmLocked ? `<div class="empty-hint">🔗 <b>Tomado del Cronograma (CPM)</b> a partir de las actividades y la ruta crítica calculadas para este paquete. Para cambiarlo, abre <a href="Cronograma_CPM.html" style="color:var(--cyan-dark); font-weight:700;">Cronograma CPM ▸</a></div>` : hasDates ? `<div class="empty-hint">📐 <b>Estimado.</b> Duración calculada automáticamente a partir de las fechas (${rolled.duration} d). Borra alguna fecha para editarla manualmente.</div>` : isLeaf ? `<div class="empty-hint">📐 <b>Estimado.</b> Cuando definas las actividades de este paquete y calcules la ruta crítica en <a href="Cronograma_CPM.html" style="color:var(--cyan-dark); font-weight:700;">Cronograma CPM ▸</a>, la fecha real se toma automáticamente de ahí.</div>` : ""}
    ${!isLeaf ? `<div class="empty-hint">Este paquete agrupa subtareas: el costo se suma (estimación bottom-up), pero <b>la duración se calcula como el tramo entre el inicio más temprano y el fin más tardío</b> de sus subtareas — no la suma, porque pueden ejecutarse en paralelo.</div>` : ""}
    ${!isRoot ? `<div class="danger-zone"><button class="btn danger" id="f_delete" style="width:100%;">🗑 Eliminar este nodo y sus subtareas</button></div>` : ""}
  `;
		const bind = (id, key, isNum) => {
			const el = document.getElementById(id);
			if (!el) return;
			el.addEventListener("input", () => {
				node[key] = isNum ? parseFloat(el.value) || 0 : el.value;
				refreshValues();
			});
		};
		bind("f_name", "name", false);
		if (costEditable) bind("f_cost", "cost", true);
		bind("f_percent", "percent", true);
		if (!raciLocksResource(node) && obsOptions.length) bind("f_resource", "resource", false);
		bind("f_notes", "notes", false);
		if (durationEditable) bind("f_duration", "duration", true);
		const bindDate = (id, key) => {
			const el = document.getElementById(id);
			if (!el || !datesEditable) return;
			el.addEventListener("change", () => {
				node[key] = el.value;
				render();
			});
		};
		bindDate("f_start", "start");
		bindDate("f_end", "end");
		const delBtn = document.getElementById("f_delete");
		if (delBtn) delBtn.addEventListener("click", async () => {
			if (await showConfirm(`¿Eliminar "${node.name}" y todas sus subtareas?`)) {
				deleteSubtree(selectedId);
				selectedId = rootId;
				render();
			}
		});
	}
	function focusNameField() {
		setTimeout(() => {
			const el = document.getElementById("f_name");
			if (el) {
				el.focus();
				el.select();
			}
		}, 30);
	}
	function renderStats(rolled) {
		const total = rolled[rootId];
		let leafCount = 0, maxDepth = 0;
		Object.keys(nodes).forEach((id) => {
			if (id !== rootId) {
				if (nodes[id].children.length === 0) leafCount++;
				maxDepth = Math.max(maxDepth, depthOf(id));
			}
		});
		const grid = document.getElementById("statGrid");
		grid.innerHTML = `
    <div class="stat"><div class="v">${fmtMoney(total.cost)}</div><div class="l">Costo total</div></div>
    <div class="stat"><div class="v">${total.duration} d</div><div class="l">Duración total</div></div>
    <div class="stat"><div class="v">${leafCount}</div><div class="l">Paquetes de trabajo</div></div>
    <div class="stat"><div class="v">${total.percent}%</div><div class="l">Avance global</div></div>
  `;
	}
	function renderLegend() {
		const box = document.getElementById("legendBox");
		let maxDepth = 0;
		Object.keys(nodes).forEach((id) => {
			maxDepth = Math.max(maxDepth, depthOf(id));
		});
		let html = `<div class="legend-item"><span class="legend-dot" style="background:#00b6ec"></span> Nivel 0 — Proyecto</div>`;
		for (let i = 1; i <= Math.max(maxDepth, 2); i++) {
			const c = LEVEL_COLORS[Math.min(i - 1, LEVEL_COLORS.length - 1)];
			html += `<div class="legend-item"><span class="legend-dot" style="background:${c}"></span> Nivel ${i}${i === 1 ? " — Fase" : i === 2 ? " — Entregable" : " — Paquete de trabajo"}</div>`;
		}
		box.innerHTML = html;
	}
	function raciLocksResource(node) {
		if (!node || node.children.length > 0) return false;
		if (!gpiRaciModule || !window.GPI || !window.GPI.util) return false;
		return window.GPI.util.raciResponsibleIds(gpiRaciModule, node.id).length > 0;
	}
	function cpmLocksDates(node) {
		if (!node || node.children.length > 0) return false;
		return scheduleLockedLeafIds.has(node.id);
	}
	function costEstimateLocksCost(node) {
		if (!node || node.children.length > 0) return false;
		return costEstimateLockedLeafIds.has(node.id);
	}
	function obsOptionLabel(o) {
		return o.person && o.person.trim() ? `${o.role} — ${o.person}` : o.role || o.person || "";
	}
	function resourceFieldHtml(node, options) {
		if (!options.length) return `<input id="f_resource" value="${escapeAttr(node.resource)}" disabled title="Crea primero la OBS del proyecto" placeholder="— Crea la OBS primero —" />`;
		const current = node.resource || "";
		const known = options.some((o) => obsOptionLabel(o) === current);
		let opts = `<option value="">— Selecciona del OBS —</option>`;
		if (current && !known) opts += `<option value="${escapeAttr(current)}" selected>⚠ (valor anterior) ${escapeHtml(current)}</option>`;
		opts += options.map((o) => {
			const label = obsOptionLabel(o);
			return `<option value="${escapeAttr(label)}"${label === current ? " selected" : ""}>${escapeHtml(label)}</option>`;
		}).join("");
		return `<select id="f_resource">${opts}</select>`;
	}
	function escapeHtml(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	function escapeAttr(s) {
		return escapeHtml(s);
	}
	function hexA(hex, alpha) {
		const h = hex.replace("#", "");
		return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${alpha})`;
	}
	function setStatus(msg) {
		document.getElementById("statusLeft").textContent = msg;
	}
	function showModal({ title, message, confirmText, cancelText, danger }) {
		return new Promise((resolve) => {
			const overlay = document.getElementById("modalOverlay");
			const confirmBtn = document.getElementById("modalConfirmBtn");
			const cancelBtn = document.getElementById("modalCancelBtn");
			document.getElementById("modalTitle").textContent = title || "Confirmar";
			document.getElementById("modalMessage").textContent = message || "";
			confirmBtn.textContent = confirmText || "Aceptar";
			confirmBtn.className = "btn" + (danger ? " danger" : " primary");
			cancelBtn.style.display = cancelText === null ? "none" : "";
			cancelBtn.textContent = cancelText || "Cancelar";
			const cleanup = (result) => {
				overlay.classList.remove("open");
				confirmBtn.onclick = null;
				cancelBtn.onclick = null;
				overlay.onclick = null;
				document.removeEventListener("keydown", onKey);
				resolve(result);
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
				const card = overlay.querySelector(".modal-card");
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
	function showAlert(message, title) {
		return showModal({
			title: title || "Aviso",
			message,
			confirmText: "Entendido",
			cancelText: null,
			danger: false
		});
	}
	function selectNode(id) {
		selectedId = id;
		render();
	}
	function applyZoom() {
		document.getElementById("canvas").style.transform = `scale(${zoom})`;
		document.getElementById("zoomReadout").textContent = Math.round(zoom * 100) + "%";
	}
	function fitToScreen() {
		const wrap = document.getElementById("canvasWrap");
		const canvas = document.getElementById("canvas");
		const cw = canvas.scrollWidth || 800, ch = canvas.scrollHeight || 600;
		const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 40;
		zoom = Math.min(availW / cw, availH / ch, 1.1);
		zoom = Math.max(zoom, .25);
		applyZoom();
	}
	function exportJson() {
		const data = {
			title: document.getElementById("projectTitle").value,
			course: document.getElementById("courseTitle").value,
			rootId,
			idCounter,
			nodes
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const safeName = (data.title || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
		a.href = url;
		a.download = `wbs_${safeName}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Proyecto exportado como JSON.");
	}
	function importJson(file) {
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const data = JSON.parse(e.target.result);
				if (!data.nodes || !data.rootId) throw new Error("Formato inválido");
				nodes = data.nodes;
				rootId = data.rootId;
				idCounter = data.idCounter || 1;
				selectedId = rootId;
				document.getElementById("projectTitle").value = data.title || "Proyecto sin título";
				document.getElementById("courseTitle").value = data.course || "Gestión de Proyectos de Ingeniería";
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Proyecto cargado correctamente.");
			} catch (err) {
				showAlert("No se pudo leer el archivo. Verifica que sea un JSON exportado por esta herramienta.");
			}
		};
		reader.readAsText(file);
	}
	function setView(v) {
		currentView = v;
		document.getElementById("canvasWrap").style.display = v === "tree" ? "block" : "none";
		document.getElementById("tableView").style.display = v === "tree" ? "none" : "block";
		document.getElementById("viewTreeBtn").classList.toggle("active", v === "tree");
		document.getElementById("viewTableBtn").classList.toggle("active", v === "tree" ? false : true);
		render();
	}
	function setOrientation(o) {
		setOrientationForBranch(selectedId || rootId, o);
	}
	function updateOrientationUI() {
		const target = nodes[selectedId] || nodes[rootId];
		if (!target) return;
		const o = target.orientation || "spread";
		const spreadBtn = document.getElementById("orientSpreadBtn");
		const stackBtn = document.getElementById("orientStackBtn");
		if (spreadBtn) spreadBtn.classList.toggle("active", o === "spread");
		if (stackBtn) stackBtn.classList.toggle("active", o === "stack");
		const label = document.getElementById("orientTargetLabel");
		if (label) label.textContent = selectedId && selectedId !== rootId ? `Rama: ${target.name}` : "Todo el proyecto";
	}
	async function seedFromScope() {
		if (typeof window.GPI === "undefined" || !window.GPI.available() || !window.GPI.active()) {
			await showAlert("La siembra de entregables necesita un proyecto activo. Abre la EDT desde el Panel de Control.", "Sembrar Entregables");
			return;
		}
		const p = window.GPI.active();
		gpiScopeModule = p && p.modules && p.modules.scopeStatement || null;
		const dels = gpiScopeModule && window.GPI.util ? window.GPI.util.scopeDeliverables(gpiScopeModule) : [];
		if (!dels.length) {
			await showAlert("Aún no hay entregables en el Enunciado del Alcance. Ábrelo, define los entregables (idealmente sugiriéndolos desde el Acta) y vuelve a sembrar. Recuerda: la EDT descompone entregables, no requisitos.", "Sembrar Entregables");
			return;
		}
		const usedDel = {};
		Object.keys(nodes).forEach((id) => {
			if (nodes[id].delId) usedDel[nodes[id].delId] = true;
		});
		const byName = {};
		(nodes[rootId].children || []).forEach((cid) => {
			if (nodes[cid]) byName[(nodes[cid].name || "").toLowerCase().trim()] = cid;
		});
		let added = 0, linked = 0;
		dels.forEach((d) => {
			if (usedDel[d.id]) return;
			const nm = (d.name || "").toLowerCase().trim();
			const existing = byName[nm];
			if (existing && !nodes[existing].delId) {
				nodes[existing].delId = d.id;
				linked++;
				return;
			}
			if (existing && nodes[existing].delId) return;
			newNode(rootId, d.name || "Entregable", { delId: d.id });
			added++;
		});
		render();
		setTimeout(fitToScreen, 50);
		if (window.GPI.active()) window.GPI.setModule("wbs", {
			rootId,
			idCounter,
			nodes
		});
		const msg = added ? "Se sembraron " + added + " entregable(s) como ramas de la EDT" + (linked ? " y se enlazaron " + linked + " existentes" : "") + ". Ahora descompón cada entregable en sus paquetes de trabajo." : linked ? "Se enlazaron " + linked + " rama(s) existentes con sus entregables." : "Todos los entregables del alcance ya están representados en la EDT.";
		setStatus(msg);
		await showAlert(msg, "Sembrar Entregables");
	}
	function init() {
		blankProject();
		render();
		setTimeout(fitToScreen, 50);
		document.getElementById("btnAddPhase").addEventListener("click", () => {
			selectedId = newNode(rootId, "Nueva fase");
			render();
			focusNameField();
		});
		document.getElementById("btnAddChild").addEventListener("click", () => {
			selectedId = newNode(selectedId || rootId, "Nueva subtarea");
			render();
			focusNameField();
		});
		document.getElementById("btnSeedScope").addEventListener("click", seedFromScope);
		document.getElementById("btnDelete").addEventListener("click", async () => {
			if (!selectedId || selectedId === rootId) {
				await showAlert("Selecciona un nodo distinto del proyecto raíz.");
				return;
			}
			if (await showConfirm(`¿Eliminar "${nodes[selectedId].name}" y sus subtareas?`)) {
				deleteSubtree(selectedId);
				selectedId = rootId;
				render();
			}
		});
		document.getElementById("zoomIn").addEventListener("click", () => {
			zoom = Math.min(zoom + .1, 2);
			applyZoom();
		});
		document.getElementById("zoomOut").addEventListener("click", () => {
			zoom = Math.max(zoom - .1, .2);
			applyZoom();
		});
		document.getElementById("zoomFit").addEventListener("click", fitToScreen);
		document.getElementById("viewTreeBtn").addEventListener("click", () => setView("tree"));
		document.getElementById("viewTableBtn").addEventListener("click", () => setView("table"));
		document.getElementById("orientSpreadBtn").addEventListener("click", () => setOrientation("spread"));
		document.getElementById("orientStackBtn").addEventListener("click", () => setOrientation("stack"));
		document.getElementById("btnCollapseAll").addEventListener("click", () => {
			Object.values(nodes).forEach((n) => {
				if (n.children.length > 0) n.collapsed = true;
			});
			render();
			setTimeout(fitToScreen, 50);
		});
		document.getElementById("btnExpandAll").addEventListener("click", () => {
			Object.values(nodes).forEach((n) => {
				n.collapsed = false;
			});
			render();
			setTimeout(fitToScreen, 50);
		});
		document.getElementById("btnExportJson").addEventListener("click", exportJson);
		document.getElementById("btnImportJson").addEventListener("click", () => document.getElementById("fileInput").click());
		document.getElementById("fileInput").addEventListener("change", (e) => {
			const files = e.target.files;
			if (files && files[0]) importJson(files[0]);
			e.target.value = "";
		});
		document.getElementById("btnPrint").addEventListener("click", () => window.print());
		document.getElementById("btnSample").addEventListener("click", async () => {
			if (await showConfirm("Esto reemplazará el proyecto actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo")) {
				loadSample();
				render();
				setTimeout(fitToScreen, 50);
			}
		});
		document.getElementById("btnReset").addEventListener("click", async () => {
			if (await showConfirm("Esto borrará el proyecto actual. ¿Continuar?", "Nuevo proyecto")) {
				blankProject();
				render();
				setTimeout(fitToScreen, 50);
			}
		});
		document.getElementById("canvasWrap").addEventListener("click", () => {
			selectedId = rootId;
			render();
		});
		window.addEventListener("keydown", async (e) => {
			if (document.getElementById("modalOverlay").classList.contains("open")) return;
			if (e.key === "Delete" && selectedId && selectedId !== rootId && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
				if (await showConfirm(`¿Eliminar "${nodes[selectedId].name}"?`)) {
					deleteSubtree(selectedId);
					selectedId = rootId;
					render();
				}
			}
		});
	}
	document.addEventListener("DOMContentLoaded", init);
	document.addEventListener("DOMContentLoaded", function gpiBridge() {
		if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
		const GPI = window.GPI;
		const proj = GPI.active();
		const titleEl = document.getElementById("projectTitle");
		const courseEl = document.getElementById("courseTitle");
		function pull() {
			const p = GPI.active();
			if (!p) return;
			if (p.meta) {
				if (p.meta.name) titleEl.value = p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			gpiRaciModule = p.modules && p.modules.raci || null;
			gpiObsModule = p.modules && p.modules.obs || null;
			gpiScopeModule = p.modules && p.modules.scopeStatement || null;
			gpiActivitiesModule = p.modules && p.modules.activities || null;
			gpiPertModule = p.modules && p.modules.pert || null;
			gpiScheduleModule = p.modules && p.modules.schedule || null;
			gpiSchedulePlanModule = p.modules && p.modules.schedulePlan || null;
			gpiCostEstimateModule = p.modules && p.modules.costEstimate || null;
			const mod = p.modules && p.modules.wbs;
			if (mod && mod.nodes && mod.rootId) {
				const modWbs = gpiRaciModule && gpiObsModule && GPI.util ? GPI.util.applyRaciToWbs(mod, gpiRaciModule, gpiObsModule) : mod;
				const schedSync = GPI.util && GPI.util.applyScheduleToWbs ? GPI.util.applyScheduleToWbs(modWbs, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta) : {
					wbs: modWbs,
					lockedLeafIds: []
				};
				const costSync = GPI.util && GPI.util.applyCostEstimateToWbs ? GPI.util.applyCostEstimateToWbs(schedSync.wbs, gpiCostEstimateModule, gpiActivitiesModule) : {
					wbs: schedSync.wbs,
					lockedLeafIds: []
				};
				nodes = costSync.wbs.nodes;
				rootId = costSync.wbs.rootId;
				idCounter = costSync.wbs.idCounter || 1;
				selectedId = rootId;
				scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
				costEstimateLockedLeafIds = new Set(costSync.lockedLeafIds);
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Proyecto cargado desde el Panel de Control.");
			} else {
				blankProject(p.meta && p.meta.name || "Proyecto sin título");
				scheduleLockedLeafIds = /* @__PURE__ */ new Set();
				costEstimateLockedLeafIds = /* @__PURE__ */ new Set();
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Proyecto sin EDT todavía. Agrega fases y paquetes, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!GPI.active()) return;
			GPI.setModule("wbs", {
				rootId,
				idCounter,
				nodes
			});
			GPI.patchMeta({
				name: titleEl.value,
				course: courseEl.value
			});
		}
		function refreshRaciSync() {
			const p = GPI.active();
			if (!p) return;
			gpiRaciModule = p.modules && p.modules.raci || null;
			gpiObsModule = p.modules && p.modules.obs || null;
			gpiScopeModule = p.modules && p.modules.scopeStatement || null;
			if (!gpiRaciModule || !gpiObsModule || !GPI.util) return;
			let changed = false;
			Object.keys(nodes).forEach((id) => {
				const n = nodes[id];
				if (!n || n.children.length > 0) return;
				const ids = GPI.util.raciResponsibleIds(gpiRaciModule, id);
				if (!ids.length) return;
				const labels = ids.map((rid) => GPI.util.obsLabel(gpiObsModule.nodes[rid])).filter(Boolean);
				if (!labels.length) return;
				const joined = labels.join(", ");
				if (n.resource !== joined) {
					n.resource = joined;
					changed = true;
				}
			});
			if (changed) {
				render();
				setStatus("Responsables actualizados desde la Matriz RACI.");
			}
		}
		function refreshScheduleSync() {
			const p = GPI.active();
			if (!p) return;
			gpiActivitiesModule = p.modules && p.modules.activities || null;
			gpiPertModule = p.modules && p.modules.pert || null;
			gpiScheduleModule = p.modules && p.modules.schedule || null;
			gpiSchedulePlanModule = p.modules && p.modules.schedulePlan || null;
			if (!GPI.util || !GPI.util.applyScheduleToWbs) return;
			const snapshot = {
				rootId,
				idCounter,
				nodes
			};
			const schedSync = GPI.util.applyScheduleToWbs(snapshot, gpiActivitiesModule, gpiPertModule, gpiScheduleModule, gpiSchedulePlanModule, p.meta);
			scheduleLockedLeafIds = new Set(schedSync.lockedLeafIds);
			let changed = false;
			schedSync.lockedLeafIds.forEach((id) => {
				const n = nodes[id], sn = schedSync.wbs.nodes[id];
				if (!n || !sn) return;
				const s = sn.start || "", e = sn.end || "";
				if (n.start !== s || n.end !== e) {
					n.start = s;
					n.end = e;
					changed = true;
				}
			});
			if (changed) {
				render();
				setStatus("Fechas actualizadas desde el Cronograma CPM.");
			}
		}
		function refreshCostEstimateSync() {
			const p = GPI.active();
			if (!p) return;
			gpiCostEstimateModule = p.modules && p.modules.costEstimate || null;
			gpiActivitiesModule = p.modules && p.modules.activities || null;
			if (!GPI.util || !GPI.util.applyCostEstimateToWbs) return;
			const snapshot = {
				rootId,
				idCounter,
				nodes
			};
			const costSync = GPI.util.applyCostEstimateToWbs(snapshot, gpiCostEstimateModule, gpiActivitiesModule);
			costEstimateLockedLeafIds = new Set(costSync.lockedLeafIds);
			let changed = false;
			costSync.lockedLeafIds.forEach((id) => {
				const n = nodes[id], sn = costSync.wbs.nodes[id];
				if (!n || !sn) return;
				const c = Number(sn.cost) || 0;
				if (Number(n.cost) !== c) {
					n.cost = c;
					changed = true;
				}
			});
			if (changed) {
				render();
				setStatus("Costo actualizado desde Estimar los Costos.");
			}
		}
		if (proj) pull();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
			else {
				refreshRaciSync();
				refreshScheduleSync();
				refreshCostEstimateSync();
			}
		});
		GPI.onChange(() => {
			if (!document.hidden) {
				refreshRaciSync();
				refreshScheduleSync();
				refreshCostEstimateSync();
			}
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	});
	function gpiBadge(name, pushFn) {
		const css = document.createElement("style");
		css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:42px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}.gpi-dot{width:8px;height:8px;border-radius:50%;background:#00c2a8;box-shadow:0 0 0 3px rgba(0,194,168,.18)}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:#0090c2;border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:#00b6ec;background:#fff}";
		document.head.appendChild(css);
		const bar = document.createElement("div");
		bar.className = "gpi-badge";
		bar.innerHTML = "<span class=\"gpi-dot\"></span><span>Panel: <b>" + String(name || "—").replace(/</g, "&lt;") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		bar.querySelector("#gpiSyncBtn").addEventListener("click", () => {
			pushFn();
			const b = bar.querySelector("#gpiSyncBtn"), t = b.textContent;
			b.textContent = "✓ Sincronizado";
			setTimeout(() => {
				b.textContent = t;
			}, 1400);
		});
	}
	function reportShell(docTitle, moduleName, bodyHtml) {
		let el = document.getElementById("gpiReport");
		if (!el) {
			el = document.createElement("div");
			el.id = "gpiReport";
			document.body.appendChild(el);
		}
		let meta = {};
		try {
			if (window.GPI && window.GPI.available() && window.GPI.meta()) meta = window.GPI.meta();
		} catch (_) {}
		const tEl = document.getElementById("projectTitle"), cEl = document.getElementById("courseTitle");
		const pName = tEl && tEl.value || meta.name || "Proyecto";
		const course = cEl && cEl.value || meta.course || "Gestión de Proyectos de Ingeniería";
		const today = (/* @__PURE__ */ new Date()).toLocaleDateString("es-PE", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
		el.innerHTML = "<div class=\"rep-head\"><div><h1>" + escapeHtml(docTitle) + "</h1><div class=\"sub\">" + escapeHtml(pName) + (meta.code ? " · " + escapeHtml(meta.code) : "") + "</div><div class=\"sub\" style=\"font-weight:500\">" + escapeHtml(course) + "</div></div><div class=\"rep-meta\">" + escapeHtml(moduleName) + "<br>Emitido: " + escapeHtml(today) + (meta.client ? "<br>Cliente: " + escapeHtml(meta.client) : "") + (meta.location ? "<br>" + escapeHtml(meta.location) : "") + "</div></div>" + bodyHtml;
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
	function repDate(s) {
		if (!s) return "—";
		const p = String(s).split("-");
		return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s;
	}
	function buildReport() {
		const CURW = {
			USD: "USD $",
			PEN: "S/",
			EUR: "€"
		};
		let curr = "USD";
		try {
			if (window.GPI && window.GPI.available() && window.GPI.meta()) curr = window.GPI.meta().currency || "USD";
		} catch (_) {}
		function m(v) {
			const n = Number(v) || 0;
			return (CURW[curr] || "$") + " " + n.toLocaleString("es-PE");
		}
		function agg(id) {
			const n = nodes[id];
			if (!n) return {
				cost: 0,
				start: "",
				end: "",
				leaves: 0
			};
			if (!n.children.length) return {
				cost: Number(n.cost) || 0,
				start: n.start || "",
				end: n.end || "",
				leaves: 1
			};
			const out = {
				cost: 0,
				start: "",
				end: "",
				leaves: 0
			};
			n.children.forEach((cid) => {
				const a = agg(cid);
				out.cost += a.cost;
				out.leaves += a.leaves;
				if (a.start && (!out.start || a.start < out.start)) out.start = a.start;
				if (a.end && (!out.end || a.end > out.end)) out.end = a.end;
			});
			return out;
		}
		let rowsHtml = "", dictHtml = "", leafCount = 0;
		(function walk(id, code, depth) {
			const n = nodes[id];
			if (!n) return;
			const isLeaf = !n.children.length;
			const a = agg(id);
			const pad = "style=\"padding-left:" + (6 + depth * 14) + "px\"";
			rowsHtml += "<tr><td class=\"num\">" + escapeHtml(code || "—") + "</td><td " + pad + ">" + (isLeaf ? escapeHtml(n.name) : "<b>" + escapeHtml(n.name) + "</b>") + "</td><td>" + escapeHtml(n.resource || "—") + "</td><td class=\"num\">" + repDate(a.start) + "</td><td class=\"num\">" + repDate(a.end) + "</td><td class=\"num\" style=\"text-align:right\">" + m(a.cost) + "</td><td class=\"num\" style=\"text-align:right\">" + (Number(n.percent) || 0) + "%</td></tr>";
			if (isLeaf) {
				leafCount++;
				const fromCpm = scheduleLockedLeafIds.has(id);
				const fromEstimate = costEstimateLockedLeafIds.has(id);
				dictHtml += "<tr><td class=\"num\">" + escapeHtml(code || "—") + "</td><td><b>" + escapeHtml(n.name) + "</b></td><td>" + escapeHtml(n.resource || "—") + "</td><td class=\"num\" style=\"text-align:center\">" + (Number(n.duration) || 0) + "</td><td class=\"num\">" + repDate(n.start) + (fromCpm ? " ¹" : "") + "</td><td class=\"num\">" + repDate(n.end) + (fromCpm ? " ¹" : "") + "</td><td class=\"num\" style=\"text-align:right\">" + m(n.cost) + (fromEstimate ? " ²" : "") + "</td><td>" + escapeHtml(n.notes || "—") + "</td></tr>";
			}
			n.children.forEach((cid, i) => {
				walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1);
			});
		})(rootId, "", 0);
		const total = agg(rootId);
		reportShell("EDT y Diccionario del Proyecto", "WBS Builder · Gestión del Alcance", "<h2>1. Estructura de Desglose del Trabajo (EDT)</h2><p class=\"rep-note\">Los costos y fechas de fases y del proyecto son consolidados (rollup) de sus paquetes de trabajo; las fechas de los niveles superiores reflejan el rango inicio más temprano → fin más tardío (ejecución en paralelo incluida).</p><table><tr><th style=\"width:8%\">Código EDT</th><th>Elemento</th><th style=\"width:15%\">Responsable</th><th style=\"width:9%\">Inicio</th><th style=\"width:9%\">Fin</th><th style=\"width:12%\">Costo</th><th style=\"width:8%\">Avance</th></tr>" + rowsHtml + "<tr><td colspan=\"5\" style=\"text-align:right\"><b>Costo total del proyecto (rollup de " + leafCount + " paquetes)</b></td><td class=\"num\" style=\"text-align:right\"><b>" + m(total.cost) + "</b></td><td></td></tr></table><h2>2. Diccionario de la EDT — paquetes de trabajo</h2><table><tr><th style=\"width:8%\">Código EDT</th><th style=\"width:17%\">Paquete de trabajo</th><th style=\"width:12%\">Responsable</th><th style=\"width:7%\">Dur. (d)</th><th style=\"width:9%\">Inicio</th><th style=\"width:9%\">Fin</th><th style=\"width:11%\">Costo</th><th>Descripción / notas</th></tr>" + (dictHtml || "<tr><td colspan=\"8\" class=\"rep-note\">— Sin paquetes de trabajo —</td></tr>") + "</table><p class=\"rep-note\">El responsable de cada paquete proviene de la Matriz RACI (rol marcado con \"R\") o, si aún no la tiene, de una selección manual dentro del OBS del proyecto — nunca de texto libre. Las fechas marcadas con ¹ provienen del Cronograma CPM (ruta crítica ya calculable para ese paquete); los costos marcados con ² provienen de Estimar los Costos (Cantidad × Precio unitario ya calculados para ese paquete); el resto de fechas y costos son una estimación manual bottom-up ingresada en esta EDT, sujeta a cambiar una vez calculados los valores reales en esos módulos.</p>");
	}
	(function() {
		const b = document.getElementById("btnReport");
		if (b) b.addEventListener("click", buildReport);
	})();
	//#endregion
})();
