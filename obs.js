(function() {
	//#region src/shared/html.ts
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
	}
	//#endregion
	//#region src/shared/gpi-badge.ts
	function installGpiBadge(o) {
		if (typeof document === "undefined") return null;
		if (o.id && document.getElementById(o.id)) return document.getElementById(o.id);
		const accent = o.accent || "#0090c2", hover = o.hover || "#00b6ec", dot = o.dot || "#00c2a8", shadow = o.dotShadow || "rgba(0,194,168,.18)", dc = o.dotClass || "gpi-dot";
		const css = document.createElement("style");
		css.textContent = ".gpi-badge{position:fixed;right:16px;bottom:" + (o.bottom === void 0 ? 42 : o.bottom) + "px;z-index:900;background:#fff;border:1px solid #e0e8f0;border-radius:30px;box-shadow:0 6px 20px rgba(20,30,60,.15);padding:7px 8px 7px 14px;display:flex;align-items:center;gap:9px;font-family:'Manrope',sans-serif;font-size:12px;color:#4d5768}.gpi-badge b{color:#1a2027}." + dc + "{width:8px;height:8px;border-radius:50%;background:" + dot + ";box-shadow:0 0 0 3px " + shadow + "}.gpi-badge .gpi-btn{font-family:'Manrope',sans-serif;font-size:11.5px;font-weight:600;border:1px solid #e0e8f0;background:#f3f8fc;color:" + accent + ";border-radius:20px;padding:5px 11px;cursor:pointer;text-decoration:none}.gpi-badge .gpi-btn:hover{border-color:" + hover + ";background:#fff}";
		document.head.appendChild(css);
		const bar = document.createElement("div");
		bar.className = "gpi-badge";
		if (o.id) bar.id = o.id;
		bar.innerHTML = "<span class=\"" + dc + "\"></span><span>Panel: <b>" + esc(o.name || "—") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		const btn = bar.querySelector("#gpiSyncBtn");
		btn.addEventListener("click", () => {
			const r = o.onSync();
			if (r === null) return;
			const t = btn.textContent;
			btn.textContent = r === false ? "⚠ Sin sincronizar" : typeof r === "string" ? r : "✓ Sincronizado";
			setTimeout(() => {
				btn.textContent = t;
			}, o.restoreMs || 1400);
		});
		return bar;
	}
	//#endregion
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
	//#region src/modules/obs/main.ts
	var NODE_W = 190;
	var NODE_H = 100;
	var GAP_X = 26;
	var GAP_Y = 60;
	var OBS_TYPES = [
		{
			key: "patrocinio",
			label: "Patrocinio / Gobernanza",
			color: "var(--t-patrocinio)",
			hex: "#2e4374"
		},
		{
			key: "direccion",
			label: "Dirección de Proyecto",
			color: "var(--t-direccion)",
			hex: "#00b6ec"
		},
		{
			key: "core",
			label: "Equipo Core",
			color: "var(--t-core)",
			hex: "#6c5ce7"
		},
		{
			key: "funcional",
			label: "Área Funcional",
			color: "var(--t-funcional)",
			hex: "#00c2a8"
		},
		{
			key: "externo",
			label: "Externo / Proveedor",
			color: "var(--t-externo)",
			hex: "#ff9f1c"
		}
	];
	function typeOf(key) {
		return OBS_TYPES.find((t) => t.key === key) || OBS_TYPES[2];
	}
	var nodes = {};
	var rootId = "root";
	var selectedId = null;
	var zoom = 1;
	var draggedId = null;
	var currentView = "tree";
	var idCounter = 1;
	function uid() {
		return "o" + idCounter++;
	}
	function newNode(parentId, role, overrides) {
		const id = uid();
		nodes[id] = Object.assign({
			id,
			parentId,
			role: role || "Nuevo puesto",
			person: "",
			type: "funcional",
			email: "",
			notes: "",
			children: [],
			collapsed: false,
			orientation: "spread"
		}, overrides || {});
		if (parentId && nodes[parentId]) nodes[parentId].children.push(id);
		return id;
	}
	function blankProject(title) {
		nodes = {};
		idCounter = 1;
		rootId = newNode(null, title || "Organización del Proyecto", { type: "root" });
		selectedId = rootId;
	}
	function loadSample() {
		blankProject("Organización del Proyecto — DISTRIB+ S.A.");
		const root = rootId;
		newNode(root, "Comité Directivo / Sponsor", {
			person: "Gerencia General DISTRIB+",
			type: "patrocinio",
			email: "gerencia@distribmas.pe"
		});
		const pm = newNode(root, "Director de Proyecto", {
			person: "PM",
			type: "direccion",
			email: "pm@distribmas.pe"
		});
		const ing = newNode(pm, "Jefe de Ingeniería", {
			person: "Ing. Civil",
			type: "core"
		});
		newNode(ing, "Especialista en Geotecnia", {
			person: "Geotecnia",
			type: "funcional"
		});
		newNode(ing, "Ingeniero Estructural", {
			person: "Ing. Estructural",
			type: "funcional"
		});
		newNode(ing, "Ingeniero MEP", {
			person: "Ing. MEP",
			type: "funcional"
		});
		const log = newNode(pm, "Jefe de Logística", {
			person: "Logística",
			type: "core"
		});
		newNode(log, "Proveedor — Estructuras metálicas", {
			person: "Proveedor A",
			type: "externo"
		});
		newNode(log, "Proveedor — Materiales de construcción", {
			person: "Proveedor B",
			type: "externo"
		});
		newNode(log, "Proveedor — Equipos eléctricos", {
			person: "Proveedor C",
			type: "externo"
		});
		const obra = newNode(pm, "Residente de Obra", {
			person: "Residente de Obra",
			type: "core"
		});
		newNode(obra, "Cuadrilla A — Movimiento de tierras", {
			person: "Cuadrilla A",
			type: "funcional"
		});
		newNode(obra, "Cuadrilla B — Cimentaciones", {
			person: "Cuadrilla B",
			type: "funcional"
		});
		newNode(obra, "Cuadrilla C — Estructura y cobertura", {
			person: "Cuadrilla C",
			type: "funcional"
		});
		newNode(obra, "Cuadrilla D — Acabados y cerramientos", {
			person: "Cuadrilla D",
			type: "funcional"
		});
		newNode(obra, "Subcontrata MEP", {
			person: "Subcontrata MEP",
			type: "externo"
		});
		nodes[obra].orientation = "stack";
		newNode(pm, "Control de Calidad", {
			person: "QA/QC",
			type: "funcional"
		});
		newNode(root, "Asesoría Legal", {
			person: "Legal",
			type: "externo"
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
		let curId = candidateId, n = nodes[candidateId];
		const seen = /* @__PURE__ */ new Set();
		while (n && n.parentId && !seen.has(curId)) {
			seen.add(curId);
			if (n.parentId === ancestorId) return true;
			curId = n.parentId;
			n = nodes[n.parentId];
		}
		return false;
	}
	function depthOf(id) {
		let d = 0, curId = id, n = nodes[id];
		const seen = /* @__PURE__ */ new Set();
		while (n && n.parentId && !seen.has(curId)) {
			seen.add(curId);
			d++;
			curId = n.parentId;
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
	var SPREAD_SIBLING_GAP = GAP_X;
	var SPREAD_DEPTH_GAP = GAP_Y;
	var STACK_SIBLING_GAP = 26;
	var STACK_DEPTH_GAP = 32;
	var STACK_INDENT = Math.round(NODE_W * .2);
	function computeLayout() {
		const sizes = {}, positions = {};
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
					h: 132 + childrenH,
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
					h: 160 + childrenH,
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
	function render() {
		const codes = computeCodes();
		if (currentView === "tree") renderTree(codes);
		else renderTable(codes);
		renderProps();
		renderStats();
		renderLegend();
		updateOrientationUI();
	}
	function refreshValues() {
		renderStats();
		const codes = computeCodes();
		if (currentView === "tree") renderTree(codes);
		else renderTable(codes);
	}
	function renderTree(codes) {
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
			const color = node.id === rootId ? "#2e4374" : typeOf(node.type).hex;
			if (o === "stack") {
				const trunkX = p.x + 14, y1 = p.y + NODE_H;
				kids.forEach((cid) => {
					const c = positions[cid];
					if (!c) return;
					const y2 = c.y + NODE_H / 2, x2 = c.x;
					linkPaths += `<path class="link" stroke="${color}" d="M${trunkX},${y1} L${trunkX},${y2} L${x2},${y2}" />`;
				});
			} else kids.forEach((cid) => {
				const c = positions[cid];
				if (!c) return;
				const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H, x2 = c.x + NODE_W / 2, y2 = c.y;
				const midY = (y1 + y2) / 2;
				linkPaths += `<path class="link" stroke="${color}" d="M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}" />`;
			});
		});
		svg.innerHTML = linkPaths;
		Object.entries(positions).forEach(([id, pos]) => {
			const node = nodes[id];
			const isRoot = id === rootId;
			const t = typeOf(node.type);
			const color = isRoot ? "#2e4374" : t.hex;
			const hasKids = node.children.length > 0;
			const isCollapsed = !!node.collapsed;
			const nodeOrient = node.orientation || "spread";
			const el = document.createElement("div");
			el.className = "node" + (id === selectedId ? " selected" : "") + (isRoot ? " is-root" : "") + (nodeOrient === "stack" ? " orient-stack" : "");
			el.style.left = pos.x + "px";
			el.style.top = pos.y + "px";
			el.dataset.id = id;
			el.draggable = !isRoot;
			if (!isRoot) el.style.borderLeftColor = color;
			const personHtml = isRoot ? "" : node.person ? `<div class="person">👤 ${escapeHtml(node.person)}</div>` : `<div class="person empty">Sin persona asignada</div>`;
			el.innerHTML = `
      <span class="code" style="background:${hexA(color, .18)};color:${color}">${codes[id]}</span>
      ${hasKids ? `<span class="orient-flag" title="Esta rama está en orientación ${nodeOrient === "stack" ? "vertical" : "horizontal"}">${nodeOrient === "stack" ? "↕" : "↔"}</span>` : ""}
      <span class="type-label">${isRoot ? "Organización" : t.label}</span>
      <div class="role">${escapeHtml(node.role)}</div>
      ${personHtml}
      ${!isRoot && node.email ? `<div class="email">${escapeHtml(node.email)}</div>` : ""}
      <div class="add-child-btn" title="Agregar subordinado">+</div>
      ${hasKids ? `<div class="collapse-btn${isCollapsed ? " is-collapsed" : ""}" title="${isCollapsed ? "Expandir rama (" + countDescendants(id) + " ocultos)" : "Colapsar rama"}">${isCollapsed ? "+" + countDescendants(id) : "−"}</div>` : ""}
    `;
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				selectNode(id);
			});
			el.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				selectNode(id);
				focusRoleField();
			});
			el.querySelector(".add-child-btn").addEventListener("click", (e) => {
				e.stopPropagation();
				selectedId = newNode(id, "Nuevo puesto");
				render();
				focusRoleField();
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
		const child = nodes[childId], newParent = nodes[newParentId];
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
		setStatus(`"${child.role}" reasignado bajo "${newParent.role}"`);
	}
	function renderTable(codes) {
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
		let html = `<table class="obs-table">
    <thead><tr>
      <th style="width:80px;">Código</th>
      <th>Rol / Puesto</th>
      <th style="width:170px;">Persona asignada</th>
      <th style="width:160px;">Tipo</th>
      <th style="width:170px;">Correo</th>
      <th style="width:170px;">Reporta a</th>
    </tr></thead><tbody>`;
		rows.forEach(({ id, depth }) => {
			const node = nodes[id];
			const t = typeOf(node.type);
			const parent = nodes[node.parentId];
			const reportsTo = parent ? escapeHtml(parent.role) : "—";
			html += `<tr>
      <td><span class="code-chip" style="background:${hexA(t.hex, .18)};color:${t.hex}">${codes[id]}</span></td>
      <td><div class="indent-name" style="padding-left:${(depth - 1) * 18}px;">${node.children.length ? "👥" : "●"} ${escapeHtml(node.role)}</div></td>
      <td>${node.person ? escapeHtml(node.person) : "<span class=\"muted\">— sin asignar —</span>"}</td>
      <td><span class="type-chip" style="background:${hexA(t.hex, .16)};color:${t.hex}">${t.label}</span></td>
      <td class="muted">${node.email ? escapeHtml(node.email) : "—"}</td>
      <td class="muted">${reportsTo}</td>
    </tr>`;
		});
		html += "</tbody></table>";
		wrap.innerHTML = html;
	}
	function renderProps() {
		const panel = document.getElementById("propsPanel");
		if (!selectedId || !nodes[selectedId]) {
			panel.innerHTML = `<div class="empty-hint">Selecciona un puesto del organigrama para editarlo.</div>`;
			return;
		}
		const node = nodes[selectedId];
		if (selectedId === rootId) {
			panel.innerHTML = `
      <div class="field"><label>Nombre de la organización / proyecto</label><input id="f_role" value="${escapeAttr(node.role)}" /></div>
      <div class="field"><label>Notas</label><textarea id="f_notes">${escapeHtml(node.notes || "")}</textarea></div>
      <div class="empty-hint">Este nodo raíz representa a toda la organización del proyecto. Cuelga de él los puestos de primer nivel (patrocinio, dirección, áreas).</div>
    `;
			bind("f_role", "role", false);
			bind("f_notes", "notes", false);
			return;
		}
		panel.innerHTML = `
    <div class="field"><label>Rol / Puesto</label><input id="f_role" value="${escapeAttr(node.role)}" /></div>
    <div class="field"><label>Persona asignada</label><input id="f_person" list="gpi-stakeholders" value="${escapeAttr(node.person)}" placeholder="Nombre de la persona" /></div>
    <div class="field-row">
      <div class="field">
        <label>Tipo de rol</label>
        <select id="f_type">${OBS_TYPES.map((t) => `<option value="${t.key}" ${t.key === node.type ? "selected" : ""}>${t.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Correo</label><input id="f_email" type="email" value="${escapeAttr(node.email)}" placeholder="opcional" /></div>
    </div>
    <div class="field"><label>Notas</label><textarea id="f_notes">${escapeHtml(node.notes || "")}</textarea></div>
    <div class="danger-zone"><button class="btn danger" id="f_delete" style="width:100%;">🗑 Eliminar este puesto y sus subordinados</button></div>
  `;
		bind("f_role", "role", false);
		bind("f_person", "person", false);
		bind("f_email", "email", false);
		bind("f_notes", "notes", false);
		const typeEl = document.getElementById("f_type");
		if (typeEl) typeEl.addEventListener("change", () => {
			node.type = typeEl.value;
			render();
		});
		const delBtn = document.getElementById("f_delete");
		if (delBtn) delBtn.addEventListener("click", async () => {
			if (await showConfirm(`¿Eliminar "${node.role}" y todos sus subordinados?`)) {
				deleteSubtree(selectedId);
				selectedId = rootId;
				render();
			}
		});
		function bind(id, key, isNum) {
			const el = document.getElementById(id);
			if (!el) return;
			el.addEventListener("input", () => {
				node[key] = isNum ? parseFloat(el.value) || 0 : el.value;
				refreshValues();
			});
		}
	}
	function focusRoleField() {
		setTimeout(() => {
			const el = document.getElementById("f_role");
			if (el) {
				el.focus();
				el.select();
			}
		}, 30);
	}
	function renderStats() {
		let total = 0, withPerson = 0, withoutPerson = 0, maxDepth = 0;
		Object.keys(nodes).forEach((id) => {
			if (id !== rootId) {
				total++;
				if ((nodes[id].person || "").trim()) withPerson++;
				else withoutPerson++;
				maxDepth = Math.max(maxDepth, depthOf(id));
			}
		});
		document.getElementById("statGrid").innerHTML = `
    <div class="stat"><div class="v">${total}</div><div class="l">Puestos totales</div></div>
    <div class="stat"><div class="v">${withPerson}</div><div class="l">Con persona asignada</div></div>
    <div class="stat"><div class="v">${maxDepth}</div><div class="l">Niveles jerárquicos</div></div>
    <div class="stat"><div class="v">${withoutPerson}</div><div class="l">Puestos sin cubrir</div></div>
  `;
	}
	function renderLegend() {
		const counts = {};
		OBS_TYPES.forEach((t) => {
			counts[t.key] = 0;
		});
		Object.keys(nodes).forEach((id) => {
			if (id !== rootId) {
				const k = nodes[id].type;
				if (counts[k] !== void 0) counts[k]++;
			}
		});
		document.getElementById("legendBox").innerHTML = OBS_TYPES.map((t) => `<div class="legend-item"><span class="lname"><span class="legend-dot" style="background:${t.hex}"></span>${t.label}</span><span class="lcount">${counts[t.key]}</span></div>`).join("");
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
		const wrap = document.getElementById("canvasWrap"), canvas = document.getElementById("canvas");
		const cw = canvas.scrollWidth || 800, ch = canvas.scrollHeight || 600;
		const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 40;
		zoom = Math.min(availW / cw, availH / ch, 1.1);
		zoom = Math.max(zoom, .25);
		applyZoom();
	}
	function exportCsv() {
		const codes = computeCodes();
		const rows = [[
			"Código",
			"Rol/Puesto",
			"Persona",
			"Tipo",
			"Correo",
			"ReportaA"
		]];
		function walk(id) {
			if (id !== rootId) {
				const n = nodes[id], parent = nodes[n.parentId];
				rows.push([
					codes[id],
					n.role,
					n.person,
					typeOf(n.type).label,
					n.email,
					parent ? parent.role : ""
				]);
			}
			nodes[id].children.forEach(walk);
		}
		walk(rootId);
		const csv = rows.map((r) => r.map((v) => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
		const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "obs_directorio.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Directorio exportado como CSV.");
	}
	function setView(v) {
		currentView = v;
		document.getElementById("canvasWrap").style.display = v === "tree" ? "block" : "none";
		document.getElementById("tableView").style.display = v === "tree" ? "none" : "block";
		document.getElementById("viewTreeBtn").classList.toggle("active", v === "tree");
		document.getElementById("viewTableBtn").classList.toggle("active", v !== "tree");
		render();
	}
	function setOrientation(o) {
		setOrientationForBranch(selectedId || rootId, o);
	}
	function updateOrientationUI() {
		const target = nodes[selectedId] || nodes[rootId];
		if (!target) return;
		const o = target.orientation || "spread";
		document.getElementById("orientSpreadBtn").classList.toggle("active", o === "spread");
		document.getElementById("orientStackBtn").classList.toggle("active", o === "stack");
		const label = document.getElementById("orientTargetLabel");
		if (label) label.textContent = selectedId && selectedId !== rootId ? `Rama: ${target.role}` : "Toda la organización";
	}
	function init() {
		blankProject();
		render();
		setTimeout(fitToScreen, 50);
		document.getElementById("btnAddTop").addEventListener("click", () => {
			selectedId = newNode(rootId, "Nuevo puesto");
			render();
			focusRoleField();
		});
		document.getElementById("btnAddChild").addEventListener("click", () => {
			selectedId = newNode(selectedId || rootId, "Nuevo subordinado");
			render();
			focusRoleField();
		});
		document.getElementById("btnDelete").addEventListener("click", async () => {
			if (!selectedId || selectedId === rootId) {
				await showAlert("Selecciona un puesto distinto de la organización raíz.");
				return;
			}
			if (await showConfirm(`¿Eliminar "${nodes[selectedId].role}" y sus subordinados?`)) {
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
		document.getElementById("btnExportCsv").addEventListener("click", exportCsv);
		document.getElementById("btnPrint").addEventListener("click", () => window.print());
		document.getElementById("btnSample").addEventListener("click", async () => {
			if (await showConfirm("Esto reemplazará la organización actual por el ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo")) {
				loadSample();
				render();
				setTimeout(fitToScreen, 50);
			}
		});
		document.getElementById("btnReset").addEventListener("click", async () => {
			if (await showConfirm("Esto borrará la organización actual. ¿Continuar?", "Nueva organización")) {
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
				if (await showConfirm(`¿Eliminar "${nodes[selectedId].role}"?`)) {
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
		const loadedProjectId = proj ? GPI.activeId() : null;
		let session = null;
		let projectStale = false;
		function markProjectStale() {
			if (projectStale) return;
			projectStale = true;
			setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
			const banner = document.getElementById("banner");
			if (banner) {
				banner.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el organigrama aquí -- recárgala para seguir trabajando sobre el proyecto activo, o vuelve a activar el proyecto original desde el Panel de Control.";
				banner.classList.add("show");
			}
		}
		const titleEl = document.getElementById("projectTitle");
		const courseEl = document.getElementById("courseTitle");
		function refreshStakeholderList() {
			const mod = GPI.getModule ? GPI.getModule("stakeholders") : null;
			const names = (mod && mod.stakeholders || []).map((s) => s.name).filter(Boolean);
			let dl = document.getElementById("gpi-stakeholders");
			if (!dl) {
				dl = document.createElement("datalist");
				dl.id = "gpi-stakeholders";
				document.body.appendChild(dl);
			}
			dl.innerHTML = names.map((n) => "<option value=\"" + String(n).replace(/"/g, "&quot;") + "\">").join("");
		}
		function pull() {
			const p = GPI.active();
			if (!p) return;
			session = GPI.openSession("obs");
			if (p.meta) {
				if (p.meta.name) titleEl.value = "Organización del Proyecto — " + p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			const mod = p.modules && p.modules.obs;
			if (mod && mod.nodes && mod.rootId) {
				nodes = mod.nodes;
				rootId = mod.rootId;
				idCounter = mod.idCounter || 1;
				selectedId = rootId;
				GPI.rebaseSession(session, {
					rootId,
					idCounter,
					nodes
				});
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Organigrama cargado desde el Panel de Control.");
			} else {
				blankProject(p.meta && p.meta.name || "Proyecto sin título");
				render();
				setTimeout(fitToScreen, 50);
				setStatus("Proyecto sin organigrama todavía. Agrega puestos, o usa ⌘ Cargar ejemplo para explorar el caso DISTRIB+.");
			}
			refreshStakeholderList();
		}
		function push() {
			if (!GPI.active()) return false;
			if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(GPI, "obs", "El organigrama", {
				rootId,
				idCounter,
				nodes
			}, { course: courseEl.value }, session, {
				setStatus,
				onStale: markProjectStale
			});
			session = r.session;
			return r.ok;
		}
		if (proj) pull();
		else refreshStakeholderList();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
		});
		if (GPI.onChange) GPI.onChange(() => {
			if (loadedProjectId != null && GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return;
			}
			if (!document.hidden) refreshStakeholderList();
		});
		gpiBadge(proj ? proj.meta && proj.meta.name : "", push);
	});
	function gpiBadge(name, pushFn) {
		installGpiBadge({
			name,
			onSync: pushFn
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
	function buildReport() {
		let rowsHtml = "", total = 0, withPerson = 0;
		const counts = {};
		OBS_TYPES.forEach((t) => {
			counts[t.key] = 0;
		});
		(function walk(id, code, depth) {
			const n = nodes[id];
			if (!n) return;
			total++;
			if ((n.person || "").trim()) withPerson++;
			if (counts[n.type] != null) counts[n.type]++;
			const t = typeOf(n.type);
			const pad = "style=\"padding-left:" + (6 + depth * 14) + "px\"";
			rowsHtml += "<tr><td class=\"num\">" + escapeHtml(code || "—") + "</td><td " + pad + "><b>" + escapeHtml(n.role) + "</b></td><td>" + escapeHtml(n.person || "—") + "</td><td>" + escapeHtml(t.label) + "</td><td>" + escapeHtml(n.email || "—") + "</td><td>" + escapeHtml(n.notes || "—") + "</td></tr>";
			n.children.forEach((cid, i) => walk(cid, code ? code + "." + (i + 1) : String(i + 1), depth + 1));
		})(rootId, "", 0);
		reportShell("Equipo del Proyecto (OBS)", "OBS Builder · Organización del Proyecto", "<h2>1. Resumen del equipo</h2><table class=\"rep-kv\"><tr><td>Puestos en la estructura</td><td><b>" + total + "</b> (" + withPerson + " con persona asignada)</td></tr><tr><td>Por tipo de puesto</td><td>" + OBS_TYPES.map((t) => escapeHtml(t.label) + ": <b>" + counts[t.key] + "</b>").join(" · ") + "</td></tr></table><h2>2. Estructura de Desglose de la Organización (OBS)</h2><table><tr><th style=\"width:7%\">Código</th><th style=\"width:22%\">Rol / puesto</th><th style=\"width:16%\">Persona asignada</th><th style=\"width:15%\">Tipo</th><th style=\"width:16%\">Contacto</th><th>Notas</th></tr>" + (rowsHtml || "<tr><td colspan=\"6\" class=\"rep-note\">— Estructura vacía —</td></tr>") + "</table><p class=\"rep-note\">Las asignaciones de responsabilidad por paquete de trabajo (R/A/C/I) se documentan en la Matriz RACI, que cruza esta OBS con la EDT del proyecto.</p>");
	}
	(function() {
		const b = document.getElementById("btnReport");
		if (b) b.addEventListener("click", buildReport);
	})();
	//#endregion
})();
