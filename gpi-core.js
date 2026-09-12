/* ============================================================
   GPI Core — capa de datos compartida para el ecosistema de
   herramientas del curso de Gestión de Proyectos de Ingeniería.

   Un único "proyecto" vive en localStorage (clave "gpi_db") y es
   consumido por el Panel de Control y por cada módulo (WBS Builder,
   Stakeholder Studio, y los que vengan). Si localStorage no está
   disponible (p. ej. vista previa en un iframe), usa un respaldo en
   memoria para no romper la interfaz.

   ESQUEMA DEL PROYECTO
   {
     schema: "gpi.project/v1",
     meta: { id, name, code, client, location, sponsor, manager,
             startDate, endDate, currency, capex, description,
             course, createdAt, updatedAt },
     modules: {
       charter:      { identification:{preparedDate,sponsor,manager,deputy,client,approach,language,authority},
                       purpose, businessCase:{justification,investment,annualBenefit,payback,indicators,intangibles},
                       description, boundaries, objectives[], requirements[], deliverables[], milestones[],
                       budget, preAssignedResources[], risks[], assumptions[], constraints[], exclusions[],
                       stakeholders[], approvalRequirements:[{item,approver,criteria}], exitCriteria[],
                       sponsors:[{name,role}], approval } | null,   // Acta de Constitución (PMBOK: Project Charter)
       stakeholders: { stakeholders:[], powerWeights:{}, interestWeights:{}, idCounter } | null,
       wbs:          { rootId, idCounter, nodes:{} } | null,
       activities:   { byLeaf: { <wbsLeafId>: [ {id,name,unit,qty,perf,teams} ] }, idCounter } | null,
       pert:         { byActivity: { <actId>: {o,m,mAuto,p} }, inputMode: "dias"|"pct" } | null,
       obs:          { rootId, idCounter, nodes:{} } | null,   // nodos: {id,parentId,role,person,type,email,notes,children[]}
       raci:         { assignments:{ [wbsLeafId]: { [obsNodeId]: "R"|"A"|"C"|"I" } } } | null,
       schedulePlan: { ...ver "Plan de Gestión del Cronograma" (AACE RP 38R-06 / PMBOK) } | null,
       cost:         { plan, estimate, budget, changeOrders[], changeTotals } | null,  // Plan de Gestión de Costos (PMBOK 8 + AACE)
       requirements: { baseline:{frozen,version,date,approver,snapshot[]}, items:[ {id,code,text,type,priority,
                       sourceRanIds:[],stakeholderId,wbsNodeIds:[],acceptanceCriteria,verificationMethod,
                       verificationStatus,status,normativeBasis,origin,changeId,notes} ],
                       changes:[ {id,code,date,requestedBy,approver,status,summary,justification,
                       impact,affectedReqIds:[],ccrRef} ], idCounter, changeCounter } | null,  // Recopilar Requisitos (PMBOK 8, RTM)
       scopeStatement: { productScope, projectScope,
                       deliverables:[ {id,code,name,description,acceptanceCriteria,ranIds:[],reqIds:[]} ],
                       assumptions:[ {id,text} ], constraints:[ {id,text} ], exclusions:[ {id,text} ],
                       baseline:{frozen,version,date,approver,snapshot}, idCounter, delCounter } | null,  // Enunciado del Alcance (PMBOK 8, Define Scope). Puente Requisitos → EDT: la EDT descompone ENTREGABLES, no requisitos.
       schedule:     { links:[ {id,from,to,type:"FS"|"SS"|"FF"|"SF",lag,lagUnit:"d"|"ed"|"h"|"w",source:"paste"|"manual"} ],
                       linkCounter, import:{ at,tool,rowMap:{<netId>:<actId>},dates:{<actId>:{start,finish}} }|null,
                       baseline:{frozen,version,date,snapshot}|null } | null,  // Cronograma / CPM. Aristas actividad→actividad. El calendario NO vive aquí: se lee de schedulePlan.calendar. Las fechas de MS Project son SOLO auditoría; ES/EF/LS/LF y ruta crítica se recalculan, no se persisten.
       // futuros: risks, evm, montecarlo, changes (Control Integrado de Cambios), ...
     }
   }

   BASE DE DATOS (localStorage["gpi_db"])
   { version:1, activeId:<id|null>, projects:{ [id]: proyecto } }
   ============================================================ */
(function (g) {
  "use strict";
  var KEY = "gpi_db";
  var mem = null; // respaldo en memoria si no hay localStorage

  function avail() {
    try { var k = "__gpi_t"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  }
  function fresh() { return { version: 1, activeId: null, projects: {} }; }
  function db() {
    if (!avail()) return mem || (mem = fresh());
    try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); }
    catch (e) { return fresh(); }
  }
  function save(d) {
    if (!avail()) { mem = d; return; }
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
      hideQuotaNotice(); // volvió a guardar bien: retirar el aviso si estaba
    } catch (e) {
      // localStorage lleno (QuotaExceededError) u otro fallo de escritura:
      // antes esto fallaba EN SILENCIO y el alumno perdía cambios sin saberlo.
      showQuotaNotice();
    }
  }

  // ----- aviso visible de almacenamiento lleno -----
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
    try { if (quotaEl && quotaEl.parentNode) { quotaEl.parentNode.removeChild(quotaEl); quotaEl = null; } } catch (_) {}
  }
  function uid() { return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36); }

  function defaultMeta() {
    return {
      id: null, name: "Proyecto sin título", code: "", client: "", location: "",
      sponsor: "", manager: "", startDate: "", endDate: "", currency: "USD",
      capex: "", description: "", course: "Gestión de Proyectos de Ingeniería",
      createdAt: Date.now(), updatedAt: Date.now()
    };
  }

  var GPI = {
    KEY: KEY,
    schema: "gpi.project/v1",

    available: avail,
    defaultMeta: defaultMeta,

    // ----- lectura -----
    raw: db,
    listProjects: function () {
      var d = db();
      return Object.keys(d.projects).map(function (id) {
        var m = d.projects[id].meta;
        return { id: id, name: m.name, updatedAt: m.updatedAt, code: m.code };
      }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    },
    activeId: function () { return db().activeId; },
    active: function () { var d = db(); return d.projects[d.activeId] || null; },
    meta: function () { var p = this.active(); return p ? p.meta : null; },
    getModule: function (name) { var p = this.active(); return p ? (p.modules[name] || null) : null; },

    // ----- escritura -----
    setActive: function (id) { var d = db(); if (d.projects[id]) { d.activeId = id; save(d); } return this.active(); },
    patchMeta: function (partial) {
      var d = db(), p = d.projects[d.activeId]; if (!p) return null;
      Object.assign(p.meta, partial || {}); p.meta.updatedAt = Date.now(); save(d); return p.meta;
    },
    setModule: function (name, data) {
      var d = db(), p = d.projects[d.activeId]; if (!p) return false;
      p.modules = p.modules || {}; p.modules[name] = data; p.meta.updatedAt = Date.now(); save(d); return true;
    },

    // ----- gestión de proyectos -----
    createProject: function (metaOverrides, modules) {
      var d = db(), id = uid();
      var meta = Object.assign(defaultMeta(), metaOverrides || {});
      meta.id = id; meta.createdAt = Date.now(); meta.updatedAt = Date.now();
      d.projects[id] = { schema: this.schema, meta: meta, modules: modules || {} };
      d.activeId = id; save(d); return id;
    },
    renameProject: function (id, name) { var d = db(); if (d.projects[id]) { d.projects[id].meta.name = name; d.projects[id].meta.updatedAt = Date.now(); save(d); } },
    duplicateProject: function (id, newName) {
      var d = db(), src = d.projects[id]; if (!src) return null;
      var nid = uid(), copy = JSON.parse(JSON.stringify(src));
      copy.meta.id = nid; copy.meta.name = newName || (src.meta.name + " (copia)");
      copy.meta.createdAt = Date.now(); copy.meta.updatedAt = Date.now();
      d.projects[nid] = copy; d.activeId = nid; save(d); return nid;
    },
    deleteProject: function (id) {
      var d = db(); delete d.projects[id];
      if (d.activeId === id) d.activeId = Object.keys(d.projects)[0] || null;
      save(d);
    },

    // ----- import / export -----
    exportActive: function () { return this.active(); },
    importProject: function (obj, activate) {
      // Acepta: (a) un proyecto completo {schema,meta,modules}
      //         (b) una exportación nativa de una herramienta (se detecta y envuelve)
      var d = db();
      var proj = normalizeToProject(obj);
      var id = proj.meta.id && !d.projects[proj.meta.id] ? proj.meta.id : uid();
      proj.meta.id = id; proj.meta.updatedAt = Date.now();
      d.projects[id] = proj;
      if (activate !== false) d.activeId = id;
      save(d); return id;
    },
    // Fusiona una exportación de herramienta en el módulo correspondiente del proyecto activo
    ingestToolExport: function (obj) {
      var d = db(), p = d.projects[d.activeId]; if (!p) return { ok: false, reason: "no-active" };
      var det = detectTool(obj); if (!det) return { ok: false, reason: "unknown-format" };
      p.modules = p.modules || {};
      p.modules[det.module] = det.data;
      // completar metadatos si vienen y están vacíos
      if (obj.title && (!p.meta.name || p.meta.name === "Proyecto sin título")) p.meta.name = obj.title;
      if (obj.course && !p.meta.course) p.meta.course = obj.course;
      p.meta.updatedAt = Date.now(); save(d);
      return { ok: true, module: det.module };
    },

    onChange: function (cb) {
      window.addEventListener("storage", function (e) { if (e.key === KEY) cb(); });
    }
  };

  function detectTool(obj) {
    if (!obj || typeof obj !== "object") return null;
    // OBS y RACI se marcan explícitamente con "kind" porque su forma (nodes+rootId,
    // u objeto de asignaciones) podría confundirse con la de otras herramientas.
    if (obj.kind === "gpi.obs/v1" && obj.nodes && obj.rootId) {
      return { module: "obs", data: { rootId: obj.rootId, idCounter: obj.idCounter || 1, nodes: obj.nodes } };
    }
    if (obj.kind === "gpi.raci/v1") {
      return { module: "raci", data: { assignments: obj.assignments || {} } };
    }
    if (obj.kind === "gpi.schedulePlan/v1" && obj.data) {
      return { module: "schedulePlan", data: obj.data };
    }
    if (obj.kind === "gpi.cost/v1" && obj.data) {
      return { module: "cost", data: obj.data };
    }
    if (obj.kind === "gpi.charter/v1" && obj.data) {
      return { module: "charter", data: obj.data };
    }
    if (obj.kind === "gpi.scopeStatement/v1" && obj.data) {
      return { module: "scopeStatement", data: obj.data };
    }
    if (obj.kind === "gpi.activities/v1" && obj.data) {
      return { module: "activities", data: { byLeaf: obj.data.byLeaf || {}, idCounter: obj.data.idCounter || 1 } };
    }
    if (obj.kind === "gpi.pert/v1" && obj.data) {
      return { module: "pert", data: { byActivity: obj.data.byActivity || {}, inputMode: obj.data.inputMode === "pct" ? "pct" : "dias" } };
    }
    if (obj.kind === "gpi.schedule/v1" && obj.data) {
      return { module: "schedule", data: {
        links: Array.isArray(obj.data.links) ? obj.data.links : [],
        linkCounter: obj.data.linkCounter || 1,
        import: obj.data["import"] || null,
        baseline: obj.data.baseline || null
      } };
    }
    if (Array.isArray(obj.stakeholders)) {
      return { module: "stakeholders", data: {
        stakeholders: obj.stakeholders,
        powerWeights: obj.powerWeights || null,
        interestWeights: obj.interestWeights || null,
        idCounter: obj.idCounter || (obj.stakeholders.length + 1)
      } };
    }
    if (obj.nodes && obj.rootId) {
      return { module: "wbs", data: { rootId: obj.rootId, idCounter: obj.idCounter || 1, nodes: obj.nodes } };
    }
    return null;
  }
  function normalizeToProject(obj) {
    if (obj && obj.schema === "gpi.project/v1" && obj.meta) return obj; // ya es proyecto
    // envolver exportación de herramienta
    var meta = Object.assign(defaultMeta(), { name: (obj && obj.title) || "Proyecto importado", course: (obj && obj.course) || undefined });
    var modules = {};
    var det = detectTool(obj);
    if (det) modules[det.module] = det.data;
    return { schema: "gpi.project/v1", meta: meta, modules: modules };
  }

  // ----- utilidades de dominio compartidas (para tableros) -----
  GPI.util = {
    // Rollup de costo/duración de un WBS a partir de {nodes, rootId}
    wbsRollup: function (wbs) {
      if (!wbs || !wbs.nodes || !wbs.rootId) return { cost: 0, count: 0, leafCount: 0, minStart: "", maxEnd: "" };
      var nodes = wbs.nodes, cost = 0, count = 0, leafCount = 0, minStart = "", maxEnd = "";
      Object.keys(nodes).forEach(function (id) {
        if (id === wbs.rootId) return;
        var n = nodes[id]; count++;
        var isLeaf = !n.children || n.children.length === 0;
        if (isLeaf) { cost += Number(n.cost) || 0; leafCount++; }
        if (n.start && (!minStart || n.start < minStart)) minStart = n.start;
        if (n.end && (!maxEnd || n.end > maxEnd)) maxEnd = n.end;
      });
      return { cost: cost, count: count, leafCount: leafCount, minStart: minStart, maxEnd: maxEnd };
    },
    // Nombres de responsables usados en el WBS
    wbsResources: function (wbs) {
      if (!wbs || !wbs.nodes) return [];
      var set = {};
      Object.keys(wbs.nodes).forEach(function (id) {
        var r = (wbs.nodes[id].resource || "").trim(); if (r) set[r] = true;
      });
      return Object.keys(set);
    },

    // Códigos jerárquicos "1.2.3" por nodo, en el mismo orden que usa WBS Builder.
    wbsCodes: function (wbs) {
      var codes = {};
      if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return codes;
      var nodes = wbs.nodes;
      function walk(id, prefix) {
        codes[id] = prefix;
        (nodes[id].children || []).forEach(function (cid, i) {
          if (nodes[cid]) walk(cid, prefix ? prefix + "." + (i + 1) : String(i + 1));
        });
      }
      (nodes[wbs.rootId].children || []).forEach(function (cid, i) { if (nodes[cid]) walk(cid, String(i + 1)); });
      codes[wbs.rootId] = "0";
      return codes;
    },

    // Paquetes de trabajo (nodos hoja) del WBS, en orden de árbol, con su código.
    // Estos son los que se usan como FILAS de la matriz RACI.
    wbsLeaves: function (wbs) {
      if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return [];
      var nodes = wbs.nodes, codes = GPI.util.wbsCodes(wbs), out = [];
      function walk(id) {
        var n = nodes[id]; if (!n) return;
        var kids = n.children || [];
        if (id !== wbs.rootId && kids.length === 0) {
          out.push({ id: id, code: codes[id] || "", name: n.name || "", resource: n.resource || "", notes: n.notes || "" });
        }
        kids.forEach(walk);
      }
      walk(wbs.rootId);
      return out;
    },

    // Nodos del OBS (excluyendo la raíz), en orden de árbol, con su código jerárquico.
    // Estos son los que se usan como COLUMNAS de la matriz RACI.
    obsNodes: function (obs) {
      if (!obs || !obs.nodes || !obs.rootId || !obs.nodes[obs.rootId]) return [];
      var nodes = obs.nodes, out = [];
      function code(id) {
        var parts = [], n = nodes[id];
        while (n && n.parentId) {
          var siblings = (nodes[n.parentId] || {}).children || [];
          parts.unshift(siblings.indexOf(n.id) + 1);
          n = nodes[n.parentId];
        }
        return parts.join(".");
      }
      function walk(id) {
        var n = nodes[id]; if (!n) return;
        if (id !== obs.rootId) {
          out.push({ id: id, code: code(id), role: n.role || "", person: n.person || "", type: n.type || "", email: n.email || "", parentId: n.parentId });
        }
        (n.children || []).forEach(walk);
      }
      walk(obs.rootId);
      return out;
    },

    // Etiqueta a mostrar para un nodo OBS: prioriza la persona asignada, si no hay, el rol.
    obsLabel: function (obsNode) {
      if (!obsNode) return "";
      return (obsNode.person && obsNode.person.trim()) || (obsNode.role && obsNode.role.trim()) || "";
    },

    // Devuelve, para un paquete de trabajo (id de hoja del WBS), los ids de nodos OBS
    // marcados como "R" (Responsable) en la matriz RACI.
    raciResponsibleIds: function (raci, leafId) {
      var cell = raci && raci.assignments && raci.assignments[leafId]; if (!cell) return [];
      return Object.keys(cell).filter(function (roleId) { return cell[roleId] === "R"; });
    },

    // Núcleo de la integración RACI → WBS: devuelve un WBS clonado donde el campo
    // "resource" de cada paquete de trabajo (hoja) que tiene al menos un "R" en la
    // matriz RACI queda fijado a la(s) persona(s)/rol(es) responsables según el OBS.
    // Los paquetes SIN asignación "R" en RACI conservan su valor de "resource" actual
    // (permite seguir usando el WBS de forma independiente antes de completar la RACI).
    applyRaciToWbs: function (wbs, raci, obs) {
      if (!wbs || !wbs.nodes) return wbs;
      var out = JSON.parse(JSON.stringify(wbs));
      if (!raci || !raci.assignments || !obs || !obs.nodes) return out;
      var obsById = obs.nodes;
      Object.keys(out.nodes).forEach(function (leafId) {
        var ids = GPI.util.raciResponsibleIds(raci, leafId);
        if (!ids.length) return; // sin "R" asignado: no se toca el valor existente
        var labels = ids.map(function (rid) { return GPI.util.obsLabel(obsById[rid]); }).filter(Boolean);
        if (labels.length) out.nodes[leafId].resource = labels.join(", ");
      });
      return out;
    },

    // Rollup por FASE (hijos directos de la raíz del WBS): a diferencia de wbsRollup
    // (que resume todo el árbol), esta función recorre cada rama de forma independiente
    // para obtener el costo y el rango de fechas propio de cada fase. La usa el Plan de
    // Gestión del Cronograma para sugerir hitos ("fin de fase") a partir de la EDT real.
    wbsPhases: function (wbs) {
      if (!wbs || !wbs.nodes || !wbs.rootId || !wbs.nodes[wbs.rootId]) return [];
      var nodes = wbs.nodes;
      function subtreeRollup(id) {
        var cost = 0, minStart = "", maxEnd = "";
        function walk(nid) {
          var n = nodes[nid]; if (!n) return;
          var kids = n.children || [];
          if (kids.length === 0) cost += Number(n.cost) || 0;
          if (n.start && (!minStart || n.start < minStart)) minStart = n.start;
          if (n.end && (!maxEnd || n.end > maxEnd)) maxEnd = n.end;
          kids.forEach(walk);
        }
        walk(id);
        return { cost: cost, start: minStart, end: maxEnd };
      }
      var root = nodes[wbs.rootId];
      return (root.children || []).map(function (id) {
        var n = nodes[id]; if (!n) return null;
        var r = subtreeRollup(id);
        return { id: id, name: n.name || "", start: r.start, end: r.end, cost: r.cost };
      }).filter(Boolean);
    },

    // ---------------------------------------------------------------
    // Estadísticas del módulo "Definir las Actividades" contra la EDT.
    //   act -> módulo "activities" ({byLeaf, idCounter})
    //   wbs -> módulo "wbs" ({nodes, rootId})
    // Devuelve el total de actividades, la cobertura de paquetes de
    // trabajo (hojas de la EDT con al menos una actividad) y las
    // huérfanas: actividades cuyo paquete ya no existe o dejó de ser hoja.
    // ---------------------------------------------------------------
    activitiesStats: function (act, wbs) {
      act = act || {};
      var byLeaf = act.byLeaf || {};
      var leaves = []; // {id, name, code} en orden de la EDT
      if (wbs && wbs.nodes && wbs.rootId && wbs.nodes[wbs.rootId]) {
        (function walk(id, code) {
          var n = wbs.nodes[id]; if (!n) return;
          var kids = n.children || [];
          if (id !== wbs.rootId && !kids.length) leaves.push({ id: id, name: n.name || "", code: code });
          kids.forEach(function (cid, i) { walk(cid, code ? code + "." + (i + 1) : String(i + 1)); });
        })(wbs.rootId, "");
      }
      var leafIds = {};
      leaves.forEach(function (l) { leafIds[l.id] = true; });
      var total = 0, orphans = 0, covered = 0, uncovered = [];
      Object.keys(byLeaf).forEach(function (k) {
        var arr = byLeaf[k] || [];
        if (leafIds[k]) total += arr.length; else orphans += arr.length;
      });
      leaves.forEach(function (l) {
        if ((byLeaf[l.id] || []).length) covered++; else uncovered.push(l);
      });
      return {
        total: total, leaves: leaves.length, covered: covered,
        uncovered: uncovered, orphans: orphans,
        pct: leaves.length ? Math.round((covered / leaves.length) * 100) : 0
      };
    },

    // ---------------------------------------------------------------
    // Análisis PERT por actividad, contra el módulo "activities".
    //   pert -> módulo "pert" ({byActivity, inputMode})
    //   act  -> módulo "activities" · wbs -> módulo "wbs" (orden y códigos)
    // La duración base replica la fórmula del módulo Definir las Actividades:
    // Dur = Met/(#Eq×R) redondeada al entero superior; la M en modo automático
    // sigue a esa Dur. O y P se interpretan según inputMode ("dias" o "pct",
    // porcentaje de M). Devuelve la lista por actividad con TE, σ y σ², más
    // los totales simples y contadores para el Panel.
    // ---------------------------------------------------------------
    pertStats: function (pert, act, wbs) {
      pert = pert || {}; act = act || {};
      var by = pert.byActivity || {}, mode = pert.inputMode === "pct" ? "pct" : "dias";
      var byLeaf = act.byLeaf || {};
      function tolNum(v) { // acepta coma decimal y separadores de miles, como Excel
        if (v === "" || v == null) return NaN;
        var s = String(v).trim().replace(/[\s\u00a0]/g, "");
        var hasDot = s.indexOf(".") !== -1, hasComma = s.indexOf(",") !== -1;
        if (hasDot && hasComma) { s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(/,/g, "."); }
        else if (hasComma) {
          var p = s.split(",");
          var mil = p.length >= 2 && p.slice(1).every(function (x) { return x.length === 3 && /^\d+$/.test(x); });
          s = mil ? p.join("") : p.join(".");
        }
        var n = Number(s); return isFinite(n) ? n : NaN;
      }
      function durOf(a) {
        var met = tolNum(a.qty), r = tolNum(a.perf), eq = tolNum(a.teams);
        if (!isFinite(met) || met <= 0 || !isFinite(r) || r <= 0) return null;
        if (!isFinite(eq) || eq < 1) eq = 1;
        return Math.ceil(met / (eq * r));
      }
      // actividades en el orden de la EDT
      var list = [];
      if (wbs && wbs.nodes && wbs.rootId && wbs.nodes[wbs.rootId]) {
        (function walk(id, code) {
          var n = wbs.nodes[id]; if (!n) return;
          var kids = n.children || [];
          if (id !== wbs.rootId && !kids.length) {
            (byLeaf[id] || []).forEach(function (a, i) {
              list.push({ id: a.id, code: code + "." + (i + 1), name: a.name || "", act: a });
            });
          }
          kids.forEach(function (cid, i) { walk(cid, code ? code + "." + (i + 1) : String(i + 1)); });
        })(wbs.rootId, "");
      }
      var complete = 0, invalid = 0, sumTe = 0, sumVar = 0, orphans = 0;
      var known = {};
      var rows = list.map(function (it) {
        known[it.id] = true;
        var pe = by[it.id] || {};
        var dur = durOf(it.act);
        var m = (pe.mAuto === false && isFinite(tolNum(pe.m))) ? tolNum(pe.m) : dur; // M automática sigue a la Dur
        var oRaw = tolNum(pe.o), pRaw = tolNum(pe.p);
        var o = null, p = null;
        if (isFinite(oRaw)) o = mode === "pct" ? (m != null ? oRaw / 100 * m : null) : oRaw;
        if (isFinite(pRaw)) p = mode === "pct" ? (m != null ? pRaw / 100 * m : null) : pRaw;
        var ok = o != null && m != null && p != null && o > 0;
        var valid = ok && o <= m && m <= p;
        var te = null, sd = null, va = null;
        if (ok) { te = (o + 4 * m + p) / 6; sd = (p - o) / 6; va = sd * sd; }
        if (ok) { complete++; if (!valid) invalid++; else { sumTe += te; sumVar += va; } }
        return { id: it.id, code: it.code, name: it.name, dur: dur, mAuto: pe.mAuto !== false, o: o, m: m, p: p, te: te, sd: sd, variance: va, complete: ok, valid: valid };
      });
      Object.keys(by).forEach(function (k) { if (!known[k]) orphans++; });
      return { rows: rows, total: rows.length, complete: complete, invalid: invalid, orphans: orphans, sumTe: sumTe, sumVar: sumVar,
               pct: rows.length ? Math.round(complete / rows.length * 100) : 0 };
    },

    // ---------------------------------------------------------------
    // Probabilidad PERT de cumplir un plazo — LISTA para el módulo
    // Cronograma/CPM: cuando exista la ruta crítica, se le pasa el TE total
    // y la varianza total de las actividades de esa ruta y el plazo objetivo.
    //   Z = (objetivo − ΣTE) / √(Σσ²)  ·  prob = Φ(Z) (CDF normal estándar)
    // Aproximación de Abramowitz & Stegun 26.2.17 (error < 7.5e−8).
    // ---------------------------------------------------------------
    pertProbability: function (sumTe, sumVar, targetDays) {
      var te = Number(sumTe), va = Number(sumVar), t = Number(targetDays);
      if (!isFinite(te) || !isFinite(va) || va <= 0 || !isFinite(t)) return null;
      var sigma = Math.sqrt(va);
      var z = (t - te) / sigma;
      var x = Math.abs(z), k = 1 / (1 + 0.2316419 * x);
      var poly = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
      var phi = 1 - (Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)) * poly;
      var prob = z >= 0 ? phi : 1 - phi;
      return { te: te, variance: va, sigma: sigma, z: z, prob: prob };
    },

    // ---------------------------------------------------------------
    // Auditoría de completitud del Acta de Constitución del Proyecto.
    // Igual que schedulePlanAudit, es un checklist lineal (no un sistema de
    // restricciones duras): cada elemento presente suma, y el estado se
    // deriva del porcentaje (>=80 verde, >=50 ámbar, si no rojo).
    //   ch -> el objeto del módulo "charter" (puede venir incompleto o null)
    // ---------------------------------------------------------------
    charterAudit: function (ch) {
      ch = ch || {};
      var id = ch.identification || {}, bud = ch.budget || {}, ap = ch.approval || {}, bc = ch.businessCase || {};
      var objs = ch.objectives || [], reqs = ch.requirements || [], dels = ch.deliverables || [],
          mil = ch.milestones || [], risks = ch.risks || [], asum = ch.assumptions || [],
          cons = ch.constraints || [], excl = ch.exclusions || [], sh = ch.stakeholders || [],
          pre = ch.preAssignedResources || [], areq = ch.approvalRequirements || [],
          exitc = ch.exitCriteria || [], spon = ch.sponsors || [];
      function nz(s) { return !!(s && String(s).trim()); }
      function hasObj(dim) {
        return objs.some(function (o) { return o && o.dim === dim && nz(o.objective) && nz(o.criteria); });
      }

      var items = [
        { id: "roles", cat: "Identificación", label: "Patrocinador y Director de Proyecto declarados", ok: nz(id.sponsor) && nz(id.manager) },
        { id: "contexto", cat: "Identificación", label: "Cliente y fecha de preparación registrados", ok: nz(id.client) && nz(id.preparedDate) },
        { id: "autoridad", cat: "Identificación", label: "Nivel de autoridad del Director de Proyecto definido", ok: nz(id.authority) },
        { id: "enfoque", cat: "Identificación", label: "Enfoque de desarrollo declarado (predictivo / ágil / híbrido)", ok: nz(id.approach) },

        { id: "proposito", cat: "Justificación y alcance", label: "Propósito o justificación del proyecto", ok: nz(ch.purpose) },
        { id: "casonegocio", cat: "Justificación y alcance", label: "Caso de negocio: justificación económica e inversión estimada", ok: nz(bc.justification) && nz(bc.investment) },
        { id: "descripcion", cat: "Justificación y alcance", label: "Descripción de alto nivel del proyecto", ok: nz(ch.description) },
        { id: "limites", cat: "Justificación y alcance", label: "Límites del proyecto declarados", ok: nz(ch.boundaries) },
        { id: "requisitos", cat: "Justificación y alcance", label: "Requisitos de alto nivel registrados", ok: reqs.length > 0 },
        { id: "entregables", cat: "Justificación y alcance", label: "Entregables clave registrados", ok: dels.length > 0 },

        { id: "objetivos", cat: "Objetivos e hitos", label: "Objetivos con criterio de éxito en alcance, cronograma y costo", ok: hasObj("Alcance") && hasObj("Cronograma") && hasObj("Costo") },
        { id: "hitos", cat: "Objetivos e hitos", label: "Al menos un hito del resumen con fecha", ok: mil.some(function (m) { return m && nz(m.name) && nz(m.date); }) },
        { id: "presupuesto", cat: "Objetivos e hitos", label: "Presupuesto preasignado mayor que cero", ok: Number(bud.amount) > 0 },

        { id: "riesgos", cat: "Riesgos, supuestos y restricciones", label: "Riesgo general del proyecto (alto nivel) registrado", ok: risks.length > 0 },
        { id: "supuestos", cat: "Riesgos, supuestos y restricciones", label: "Supuestos del proyecto registrados", ok: asum.length > 0 },
        { id: "restricciones", cat: "Riesgos, supuestos y restricciones", label: "Restricciones del proyecto registradas", ok: cons.length > 0 },
        { id: "exclusiones", cat: "Riesgos, supuestos y restricciones", label: "Exclusiones (fuera del alcance) registradas", ok: excl.length > 0 },

        { id: "interesados", cat: "Interesados y autorización", label: "Interesados clave identificados en el acta", ok: sh.length > 0 },
        { id: "patrocinadores", cat: "Interesados y autorización", label: "Patrocinadores que autorizan el proyecto registrados", ok: spon.some(function (s) { return s && nz(s.name); }) },
        { id: "aprobacion", cat: "Interesados y autorización", label: "Acta con firmas de Patrocinador y Director de Proyecto", ok: nz(ap.sponsorName) && nz(ap.managerName) },

        { id: "recursospre", cat: "Recursos y aprobación", label: "Recursos preasignados al proyecto declarados", ok: pre.length > 0 },
        { id: "reqaprob", cat: "Recursos y aprobación", label: "Requisitos de aprobación con responsable definido", ok: areq.some(function (r) { return r && nz(r.item) && nz(r.approver); }) },
        { id: "criteriossalida", cat: "Recursos y aprobación", label: "Criterios de salida / cierre del proyecto registrados", ok: exitc.length > 0 }
      ];

      var okCount = items.filter(function (i) { return i.ok; }).length;
      var total = items.length;
      var pct = total ? Math.round((okCount / total) * 100) : 0;
      var state = pct >= 80 ? "verde" : (pct >= 50 ? "ambar" : "rojo");

      var cats = {};
      items.forEach(function (i) {
        cats[i.cat] = cats[i.cat] || { total: 0, ok: 0 };
        cats[i.cat].total++; if (i.ok) cats[i.cat].ok++;
      });

      return { items: items, okCount: okCount, total: total, pct: pct, state: state, categories: cats };
    },

    // ---------------------------------------------------------------
    // Auditoría de completitud del Plan de Gestión del Cronograma.
    // Opera como el checklist del Apéndice de la RP 38R-06 de AACE International
    // ("Documenting the Schedule Basis"): una lista de elementos que deberían estar
    // presentes en la base del cronograma, agrupados por tema. No es un sistema de
    // restricciones duras como raciAudit — aquí cada elemento faltante resta puntaje
    // de forma lineal, porque se trata de la completitud de un documento de
    // planificación, no de una validación estructural de una matriz.
    //   sp -> el objeto del módulo "schedulePlan" (puede venir incompleto o null)
    // ---------------------------------------------------------------
    schedulePlanAudit: function (sp) {
      sp = sp || {};
      var m = sp.methodology || {}, cod = sp.codification || {}, cal = sp.calendar || {},
          dur = sp.durationEstimating || {}, cp = sp.criticalPath || {}, pm = sp.performanceMeasurement || {},
          res = sp.scheduleReserve || {}, cc = sp.changeControl || {}, ap = sp.approval || {};
      var thr = sp.controlThresholds || [], mil = sp.milestones || [], roles = sp.roles || [],
          rep = sp.reportingFormats || [], asum = sp.assumptions || [], excl = sp.exclusions || [];
      function nz(s) { return !!(s && String(s).trim()); }

      var items = [
        { id: "enfoque", cat: "Metodología y EDT", label: "Enfoque de programación y herramienta declarados", ok: nz(m.approach) && nz(m.tool) },
        { id: "detalle", cat: "Metodología y EDT", label: "Unidad de medida, y Nivel + Clase de cronograma (RP 27R-03)", ok: nz(m.unit) && (nz(m.scheduleLevel) && nz(m.scheduleClass) || nz(m.levelOfDetail)) },
        { id: "codificacion", cat: "Metodología y EDT", label: "Regla de codificación de actividades vinculada a la EDT", ok: nz(cod.rule) },

        { id: "calendario", cat: "Calendario y duraciones", label: "Calendario del proyecto (días laborables y horas/día)", ok: Array.isArray(cal.workDays) && cal.workDays.length > 0 && Number(cal.hoursPerDay) > 0 },
        { id: "feriados", cat: "Calendario y duraciones", label: "Excepciones de calendario registradas (feriados/paradas)", ok: Array.isArray(cal.holidays) && cal.holidays.length > 0 },
        { id: "duraciones", cat: "Calendario y duraciones", label: "Método de estimación de duraciones declarado", ok: nz(dur.method) },

        { id: "umbrales", cat: "Control y desempeño", label: "Umbrales de control (SV/SPI u otros) definidos", ok: thr.length > 0 },
        { id: "medicion", cat: "Control y desempeño", label: "Regla de medición del desempeño (EVM) declarada", ok: nz(pm.method) },
        { id: "frecuencia", cat: "Control y desempeño", label: "Frecuencia de actualización del cronograma definida", ok: nz(pm.updateFrequency) },
        { id: "rutacritica", cat: "Control y desempeño", label: "Metodología de ruta crítica y umbral de ruta casi crítica", ok: nz(cp.methodology) && Number(cp.nearCriticalThresholdDays) > 0 },

        { id: "hitos", cat: "Hitos y reserva", label: "Al menos un hito clave registrado", ok: mil.length > 0 },
        { id: "reserva", cat: "Hitos y reserva", label: "Reserva de contingencia de cronograma cuantificada y justificada", ok: Number(res.pct) > 0 && nz(res.basisText) },
        { id: "supuestos", cat: "Hitos y reserva", label: "Supuestos del cronograma registrados", ok: asum.length > 0 },
        { id: "exclusiones", cat: "Hitos y reserva", label: "Exclusiones del cronograma registradas", ok: excl.length > 0 },

        { id: "roles", cat: "Gobernanza", label: "Roles y responsabilidades de la programación definidos", ok: roles.length > 0 },
        { id: "reportes", cat: "Gobernanza", label: "Formatos y frecuencia de reporte definidos", ok: rep.length > 0 },
        { id: "cambios", cat: "Gobernanza", label: "Proceso y umbral de control de cambios/rebaselinado", ok: nz(cc.process) && Number(cc.baselineChangeThresholdPct) > 0 },
        { id: "aprobacion", cat: "Gobernanza", label: "Plan con elaborador y aprobador identificados", ok: nz(ap.preparedBy) && nz(ap.approvedBy) }
      ];

      var okCount = items.filter(function (i) { return i.ok; }).length;
      var total = items.length;
      var pct = total ? Math.round((okCount / total) * 100) : 0;
      var state = pct >= 80 ? "verde" : (pct >= 50 ? "ambar" : "rojo");

      var cats = {};
      items.forEach(function (i) {
        cats[i.cat] = cats[i.cat] || { total: 0, ok: 0 };
        cats[i.cat].total++; if (i.ok) cats[i.cat].ok++;
      });

      return { items: items, okCount: okCount, total: total, pct: pct, state: state, categories: cats };
    },

    // Resumen de cobertura RACI contra los paquetes de trabajo del WBS activo:
    // usado por el Panel de Control y por la propia herramienta RACI para validar
    // buenas prácticas (exactamente un "A" y al menos un "R" por fila).
    raciCoverage: function (raci, wbs) {
      var leaves = GPI.util.wbsLeaves(wbs);
      var assignments = (raci && raci.assignments) || {};
      var total = leaves.length, withR = 0, withoutR = [], withoutA = [], multiA = [];
      leaves.forEach(function (leaf) {
        var cell = assignments[leaf.id] || {};
        var rCount = 0, aCount = 0;
        Object.keys(cell).forEach(function (rid) { if (cell[rid] === "R") rCount++; if (cell[rid] === "A") aCount++; });
        if (rCount > 0) withR++; else withoutR.push(leaf);
        if (aCount === 0) withoutA.push(leaf);
        if (aCount > 1) multiA.push(leaf);
      });
      return { total: total, withR: withR, withoutR: withoutR, withoutA: withoutA, multiA: multiA };
    },

    // ---------------------------------------------------------------
    // Auditoría de gobernanza RACI — sistema de Restricciones Hard/Soft.
    // No promedia: una sola Restricción Crítica (Hard) incumplida bloquea
    // toda la matriz (Rojo / 0%), sin importar qué tan bien puntúe el resto.
    // Si las 4 Hard Restrictions se cumplen, el puntaje (85-100) depende del
    // % de cumplimiento de las Soft Restrictions (umbral 75% = Ámbar/Verde).
    //
    //   leaves      -> array como el que devuelve wbsLeaves()  {id,code,name,notes}
    //   cols        -> array como el que devuelve obsNodes()   {id,code,role,person}
    //   assignments -> { leafId: { colId: "R"|"A"|"C"|"I" } }  (el módulo raci)
    //
    // Reglas implementadas:
    //   HR-01 Actividad sin ninguna asignación (fila completamente vacía)
    //   HR-02 Sin Accountable (A = 0)
    //   HR-03 Doble/múltiple Accountable (A > 1)
    //   HR-04 Sin Responsable (R = 0)
    //   SR-01 Más de un Responsable (R > 1) sin justificación en las notas del WBS
    //   SR-02 Más de 3 Consultados (C > 3) — riesgo de cuello de botella
    //   SR-03 Rol sin ninguna R ni A en toda la matriz ("rol fantasma")
    // ---------------------------------------------------------------
    raciAudit: function (leaves, cols, assignments) {
      leaves = leaves || []; cols = cols || []; assignments = assignments || {};

      var hard = { HR01: [], HR02: [], HR03: [], HR04: [] };
      leaves.forEach(function (leaf) {
        var cell = assignments[leaf.id] || {};
        var keys = Object.keys(cell).filter(function (k) { return cell[k]; });
        var rCount = 0, aCount = 0;
        keys.forEach(function (k) { if (cell[k] === "R") rCount++; if (cell[k] === "A") aCount++; });
        if (keys.length === 0) hard.HR01.push(leaf);
        if (aCount === 0) hard.HR02.push(leaf);
        if (aCount > 1) hard.HR03.push(leaf);
        if (rCount === 0) hard.HR04.push(leaf);
      });
      var hardCount = hard.HR01.length + hard.HR02.length + hard.HR03.length + hard.HR04.length;

      var soft = { SR01: [], SR02: [], SR03: [] };
      leaves.forEach(function (leaf) {
        var cell = assignments[leaf.id] || {};
        var rCount = 0, cCount = 0;
        Object.keys(cell).forEach(function (k) { if (cell[k] === "R") rCount++; if (cell[k] === "C") cCount++; });
        if (rCount > 1 && !(leaf.notes && leaf.notes.trim())) soft.SR01.push(leaf);
        if (cCount > 3) soft.SR02.push(leaf);
      });
      cols.forEach(function (col) {
        var used = leaves.some(function (leaf) {
          var v = (assignments[leaf.id] || {})[col.id];
          return v === "R" || v === "A";
        });
        if (!used) soft.SR03.push(col);
      });
      var softCount = soft.SR01.length + soft.SR02.length + soft.SR03.length;
      var totalChecks = leaves.length * 2 + cols.length;
      var srCompliance = totalChecks > 0 ? Math.max(0, Math.min(100, ((totalChecks - softCount) / totalChecks) * 100)) : 100;

      var score, state;
      if (!leaves.length) {
        score = null; state = "vacio";
      } else if (hardCount > 0) {
        score = 0; state = "rojo";
      } else if (srCompliance < 75) {
        score = Math.min(94, Math.round(85 + (srCompliance / 75) * 10));
        state = "ambar";
      } else {
        score = Math.max(95, Math.round(95 + ((srCompliance - 75) / 25) * 5));
        state = "verde";
      }

      return {
        hard: hard, hardCount: hardCount,
        soft: soft, softCount: softCount, totalChecks: totalChecks,
        srCompliance: Math.round(srCompliance),
        score: score, state: state,
        leavesTotal: leaves.length, colsTotal: cols.length
      };
    },

    // Resumen del Plan de Gestión de Costos para tableros. Recibe el objeto del
    // módulo "cost" (puede venir incompleto o null) y devuelve cifras derivadas:
    // estimación de las actividades, BAC (línea base), presupuesto total y el
    // conteo/monto de órdenes de cambio aprobadas por fuente de fondeo.
    costSummary: function (cost) {
      var b = (cost && cost.budget) || {};
      var comp = b.computed || {};
      var base = Number(b.baseCost) || Number(comp.base) || 0;
      var bac = Number(comp.bac) || 0;
      var total = Number(comp.total) || 0;
      var contPct = base ? Math.round(((Number(comp.cont) || 0) / base) * 100) : 0;
      var co = (cost && cost.changeOrders) || [];
      var approved = 0, coFromCont = 0, coFromMgmt = 0, pending = 0;
      co.forEach(function (r) {
        if (r && r.status === "Aprobada") {
          approved += Number(r.cost) || 0;
          if (r.fund === "Contingencia") coFromCont += Number(r.cost) || 0; else coFromMgmt += Number(r.cost) || 0;
        } else if (r && r.status === "Pendiente") { pending++; }
      });
      var estClass = (cost && cost.estimate && cost.estimate.class) || null;
      return {
        baseCost: base, bac: bac, total: total, contingencyPct: contPct,
        estimateClass: estClass,
        changeOrders: co.length, pending: pending,
        approvedAmount: approved, fromContingency: coFromCont, fromMgmt: coFromMgmt,
        hasData: !!(cost && (base || co.length))
      };
    },

    // ---------------------------------------------------------------
    // Requisitos de alto nivel del Acta, normalizados y CODIFICADOS como RAN.0X
    // (RAN = Requisito de Alto Nivel). Tolera el esquema antiguo (arreglo de
    // cadenas) y el nuevo (arreglo de objetos {id,code,text}). Es el puente
    // entre el Acta de Constitución y el módulo Recopilar Requisitos: cada RAN
    // debería ser desarrollado por al menos un REQ.00X.
    // ---------------------------------------------------------------
    pad2: function (n) { n = Number(n) || 0; return (n < 10 ? "0" : "") + n; },
    charterRans: function (charter) {
      var reqs = (charter && charter.requirements) || [];
      var out = [];
      reqs.forEach(function (r, i) {
        var text = (r && typeof r === "object") ? (r.text || "") : String(r || "");
        if (!text || !text.trim()) return;
        out.push({
          id: (r && typeof r === "object" && r.id) ? r.id : ("ran" + (i + 1)),
          code: (r && typeof r === "object" && r.code) ? r.code : ("RAN." + GPI.util.pad2(i + 1)),
          text: text
        });
      });
      return out;
    },

    // ---------------------------------------------------------------
    // Auditoría de trazabilidad del módulo Recopilar Requisitos, cruzado contra
    // el Acta (RAN) y la EDT (paquetes de trabajo). Checklist lineal, como los
    // demás audits del ecosistema. Devuelve cobertura RAN→REQ, trazabilidad
    // REQ→EDT, huecos de verificación, y el posible sobre-alcance (paquetes de
    // la EDT sin ningún requisito que los justifique).
    //   req     -> módulo "requirements"
    //   charter -> módulo "charter" (para los RAN)
    //   wbs     -> módulo "wbs" (para validar los paquetes enlazados)
    // ---------------------------------------------------------------
    requirementsAudit: function (req, charter, wbs) {
      req = req || {};
      var items = req.items || [];
      var rans = GPI.util.charterRans(charter);
      var ranById = {}; rans.forEach(function (r) { ranById[r.id] = r; });
      var validNodes = {};
      if (wbs && wbs.nodes) Object.keys(wbs.nodes).forEach(function (id) { validNodes[id] = true; });
      var leaves = GPI.util.wbsLeaves(wbs || {});

      var ranHit = {}; rans.forEach(function (r) { ranHit[r.id] = 0; });
      var reqsWithoutRan = 0, reqsWithoutWbs = 0, reqsBrokenWbs = 0, reqsWithoutStk = 0,
          reqsWithoutAccept = 0, reqsWithoutMethod = 0, verified = 0,
          baselineCount = 0, changeCount = 0, traced = 0;
      var leavesWithReq = {};

      items.forEach(function (it) {
        var validSrcs = (it.sourceRanIds || []).filter(function (id) { return ranById[id]; });
        if (validSrcs.length === 0) reqsWithoutRan++;
        validSrcs.forEach(function (id) { ranHit[id] = (ranHit[id] || 0) + 1; });

        var nodes = it.wbsNodeIds || [];
        var validW = nodes.filter(function (id) { return validNodes[id]; });
        var brokenW = nodes.filter(function (id) { return !validNodes[id]; });
        if (nodes.length === 0) reqsWithoutWbs++; else if (validW.length > 0) traced++;
        if (brokenW.length) reqsBrokenWbs++;
        validW.forEach(function (id) { leavesWithReq[id] = true; });

        if (!it.stakeholderId) reqsWithoutStk++;
        if (!(it.acceptanceCriteria && String(it.acceptanceCriteria).trim())) reqsWithoutAccept++;
        if (!it.verificationMethod) reqsWithoutMethod++;
        if (it.verificationStatus === "verificado") verified++;
        if (it.origin === "change") changeCount++; else baselineCount++;
      });

      var ransUncovered = rans.filter(function (r) { return !ranHit[r.id]; });
      var leavesWithoutReq = leaves.filter(function (l) { return !leavesWithReq[l.id]; });
      var total = items.length;
      var tracePct = total ? Math.round(traced / total * 100) : 0;
      var ranPct = rans.length ? Math.round((rans.length - ransUncovered.length) / rans.length * 100) : 100;

      var state;
      if (!total && !rans.length) state = "vacio";
      else if (ransUncovered.length === 0 && tracePct >= 80 && reqsBrokenWbs === 0) state = "verde";
      else if (tracePct >= 50 || ranPct >= 50) state = "ambar";
      else state = "rojo";

      return {
        total: total, rans: rans.length, ranHit: ranHit,
        ransUncovered: ransUncovered, ranPct: ranPct, reqsWithoutRan: reqsWithoutRan,
        traced: traced, tracePct: tracePct,
        reqsWithoutWbs: reqsWithoutWbs, reqsBrokenWbs: reqsBrokenWbs, reqsWithoutStk: reqsWithoutStk,
        reqsWithoutAccept: reqsWithoutAccept, reqsWithoutMethod: reqsWithoutMethod,
        verified: verified, baselineCount: baselineCount, changeCount: changeCount,
        leavesWithoutReq: leavesWithoutReq, leavesTotal: leaves.length,
        baselineFrozen: !!(req.baseline && req.baseline.frozen),
        baselineVersion: (req.baseline && req.baseline.version) || null,
        changes: (req.changes || []).length, state: state
      };
    },

    // Requisitos (REQ.00X) enlazados a un paquete de trabajo de la EDT. Lo usa
    // el Panel / WBS para mostrar el contador "N requisitos" por paquete.
    reqByWbsLeaf: function (req, leafId) {
      var items = (req && req.items) || [];
      return items.filter(function (it) { return (it.wbsNodeIds || []).indexOf(leafId) !== -1; })
        .map(function (it) { return { id: it.id, code: it.code, text: it.text }; });
    },

    // ---------------------------------------------------------------
    // Entregables del Enunciado del Alcance (DEL.0X), normalizados y CODIFICADOS.
    // Son la BISAGRA del flujo Requisitos → Alcance → EDT: un entregable puede
    // trazar hacia atrás a los RAN del Acta y a los REQ que lo justifican, y
    // hacia adelante a la EDT (que descompone el ENTREGABLE, nunca el requisito).
    //   scope -> módulo "scopeStatement"
    // ---------------------------------------------------------------
    scopeDeliverables: function (scope) {
      var dels = (scope && scope.deliverables) || [];
      return dels.map(function (d, i) {
        return {
          id: (d && d.id) ? d.id : ("del" + (i + 1)),
          code: (d && d.code) ? d.code : ("DEL." + GPI.util.pad2(i + 1)),
          name: (d && d.name) || "",
          description: (d && d.description) || "",
          acceptanceCriteria: (d && d.acceptanceCriteria) || "",
          ranIds: (d && d.ranIds || []).slice(),
          reqIds: (d && d.reqIds || []).slice()
        };
      });
    },

    // Conjunto de ids de entregable (delId) presentes en algún nodo de la EDT.
    // Es la señal de que un entregable YA fue descompuesto en la EDT: la usa
    // scopeAudit y la siembra "↧ Sembrar Entregables" del WBS Builder.
    wbsDelIds: function (wbs) {
      var out = {};
      if (wbs && wbs.nodes) Object.keys(wbs.nodes).forEach(function (id) {
        var d = wbs.nodes[id] && wbs.nodes[id].delId;
        if (d) out[d] = true;
      });
      return out;
    },

    // ---------------------------------------------------------------
    // Auditoría de coherencia del Enunciado del Alcance (Define Scope). Checklist
    // lineal, como los demás audits del ecosistema. Es la "puerta de coherencia"
    // del flujo: cruza los entregables contra los REQ (Recopilar Requisitos), los
    // RAN (Acta) y la EDT (paquetes que descomponen cada entregable). Detecta:
    //   · entregables sin ningún REQ que los justifique (posible sobre-alcance);
    //   · REQ sin entregable que los acoja (alcance faltante / hueco de cobertura);
    //   · entregables aún NO descompuestos en la EDT;
    //   · entregables sin criterio de aceptación; enlaces REQ rotos.
    //   scope   -> módulo "scopeStatement"
    //   req     -> módulo "requirements"  ·  charter -> "charter"  ·  wbs -> "wbs"
    // ---------------------------------------------------------------
    scopeAudit: function (scope, req, charter, wbs) {
      scope = scope || {};
      var dels = GPI.util.scopeDeliverables(scope);
      var reqItems = (req && req.items) || [];
      var reqById = {}; reqItems.forEach(function (it) { reqById[it.id] = it; });
      var rans = GPI.util.charterRans(charter);
      var ranById = {}; rans.forEach(function (r) { ranById[r.id] = r; });
      var decomposed = GPI.util.wbsDelIds(wbs || {});

      var delsWithoutReq = [], delsWithoutAccept = [], delsNotDecomposed = [], delsBrokenReq = 0;
      var reqCoveredByDel = {}, ranCoveredByDel = {};

      dels.forEach(function (d) {
        var validReqs = (d.reqIds || []).filter(function (id) { return reqById[id]; });
        var brokenReqs = (d.reqIds || []).filter(function (id) { return !reqById[id]; });
        if (validReqs.length === 0) delsWithoutReq.push(d);
        if (brokenReqs.length) delsBrokenReq++;
        validReqs.forEach(function (id) { reqCoveredByDel[id] = true; });
        (d.ranIds || []).forEach(function (id) { if (ranById[id]) ranCoveredByDel[id] = true; });
        if (!(d.acceptanceCriteria && String(d.acceptanceCriteria).trim())) delsWithoutAccept.push(d);
        if (!decomposed[d.id]) delsNotDecomposed.push(d);
      });

      var reqsWithoutDel = reqItems.filter(function (it) { return !reqCoveredByDel[it.id]; });
      var ransWithoutDel = rans.filter(function (r) { return !ranCoveredByDel[r.id]; });

      var total = dels.length;
      var decomposedCount = dels.filter(function (d) { return decomposed[d.id]; }).length;
      var reqCovPct = reqItems.length ? Math.round((reqItems.length - reqsWithoutDel.length) / reqItems.length * 100) : (total ? 100 : 0);
      var decompPct = total ? Math.round(decomposedCount / total * 100) : 0;

      var state;
      if (!total && !reqItems.length) state = "vacio";
      else if (total && delsWithoutReq.length === 0 && reqsWithoutDel.length === 0 && delsBrokenReq === 0 && delsNotDecomposed.length === 0) state = "verde";
      else if (reqCovPct >= 50 || decompPct >= 50) state = "ambar";
      else state = "rojo";

      return {
        total: total, deliverables: dels,
        delsWithoutReq: delsWithoutReq, delsWithoutAccept: delsWithoutAccept,
        delsNotDecomposed: delsNotDecomposed, delsBrokenReq: delsBrokenReq,
        decomposedCount: decomposedCount, decompPct: decompPct,
        reqsWithoutDel: reqsWithoutDel, reqCovPct: reqCovPct, reqTotal: reqItems.length,
        ransWithoutDel: ransWithoutDel, ranTotal: rans.length,
        assumptions: (scope.assumptions || []).length,
        constraints: (scope.constraints || []).length,
        exclusions: (scope.exclusions || []).length,
        baselineFrozen: !!(scope.baseline && scope.baseline.frozen),
        baselineVersion: (scope.baseline && scope.baseline.version) || null,
        state: state
      };
    },

    // ---------------------------------------------------------------
    // Matriz de consistencia / integración vertical  RAN → REQ → DEL → WP.
    // Una FILA POR REQUISITO (la unidad que no debe caerse). Encadena las cuatro
    // puertas de trazabilidad y detecta el cruce fino que ninguna auditoría por
    // separado ve: si el/los entregable(s) que ACOGEN un REQ
    // (scope.deliverables[].reqIds) coinciden con el/los entregable(s) a los que
    // PERTENECEN sus paquetes de trabajo — subiendo por el árbol de la EDT hasta
    // el primer ancestro con delId.
    //   req -> "requirements" · charter -> "charter" · scope -> "scopeStatement" · wbs -> "wbs"
    // Colores: ROJO = REQ sin entregable (alcance faltante) o sin paquete (sin
    //   ejecución); ÁMBAR = REQ emergente (sin RAN), paquete que no cuelga de
    //   ningún entregable, o incoherencia DEL↔WP; VERDE = cadena completa y
    //   coherente. Solo lectura: deriva de lo ya existente.
    // ---------------------------------------------------------------
    traceMatrix: function (req, charter, scope, wbs) {
      var reqItems = (req && req.items) || [];
      var rans = GPI.util.charterRans(charter);
      var ranById = {}; rans.forEach(function (r) { ranById[r.id] = r; });
      var dels = GPI.util.scopeDeliverables(scope);
      var delById = {}; dels.forEach(function (d) { delById[d.id] = d; });
      var nodes = (wbs && wbs.nodes) || {};
      var codes = GPI.util.wbsCodes(wbs || {});

      // hijo -> padre (vía children, fuente fiable) para subir por el árbol
      var parentOf = {};
      Object.keys(nodes).forEach(function (pid) {
        (nodes[pid].children || []).forEach(function (cid) { parentOf[cid] = pid; });
      });
      // entregable (delId) al que pertenece un nodo, subiendo hasta el 1er ancestro con delId
      function delOfNode(id) {
        var guard = 0, n = id;
        while (n && guard++ < 999) {
          if (nodes[n] && nodes[n].delId) return nodes[n].delId;
          n = parentOf[n];
        }
        return null;
      }

      // DEL que ACOGEN cada REQ (invertido desde del.reqIds)
      var hostDelsByReq = {};
      dels.forEach(function (d) {
        (d.reqIds || []).forEach(function (rid) { (hostDelsByReq[rid] = hostDelsByReq[rid] || {})[d.id] = true; });
      });

      var rows = [];
      var kpi = { reqTotal: reqItems.length, verde: 0, noDel: 0, noWp: 0, delWpMismatch: 0, emergent: 0, wpNoDel: 0 };

      reqItems.forEach(function (it) {
        var reqRans = (it.sourceRanIds || []).filter(function (id) { return ranById[id]; }).map(function (id) { return ranById[id]; });
        var hostDelIds = Object.keys(hostDelsByReq[it.id] || {});
        var hostDels = hostDelIds.map(function (id) { return delById[id]; }).filter(Boolean);
        var wpIds = (it.wbsNodeIds || []).filter(function (id) { return nodes[id]; });
        var wps = wpIds.map(function (id) { return { id: id, code: codes[id] || "", name: (nodes[id].name || "") }; });
        var wpDelSet = {}; wpIds.forEach(function (id) { var dd = delOfNode(id); if (dd) wpDelSet[dd] = true; });
        var wpDelIds = Object.keys(wpDelSet);

        var emergent = reqRans.length === 0;
        var noDel = hostDels.length === 0;
        var noWp = wps.length === 0;
        var wpNoDel = wps.length > 0 && wpDelIds.length === 0;
        var overlap = hostDelIds.some(function (id) { return wpDelSet[id]; });
        var delWpMismatch = hostDelIds.length > 0 && wpDelIds.length > 0 && !overlap;

        var st;
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
          req: { id: it.id, code: it.code, text: it.text || "" },
          rans: reqRans.map(function (r) { return { id: r.id, code: r.code }; }),
          dels: hostDels.map(function (d) { return { id: d.id, code: d.code, name: d.name }; }),
          wps: wps, wpDelIds: wpDelIds, coherent: overlap,
          flags: { emergent: emergent, noDel: noDel, noWp: noWp, wpNoDel: wpNoDel, delWpMismatch: delWpMismatch },
          state: st
        });
      });

      // Huérfanos / sobre-alcance que la espina por REQ no revela por sí sola
      var delsWithoutReq = dels.filter(function (d) {
        return !(d.reqIds || []).some(function (rid) { return reqItems.some(function (it) { return it.id === rid; }); });
      });
      var leaves = GPI.util.wbsLeaves(wbs || {});
      var reqOfLeaf = {}; reqItems.forEach(function (it) { (it.wbsNodeIds || []).forEach(function (nid) { reqOfLeaf[nid] = true; }); });
      var wpsOrphan = leaves.filter(function (l) { return !reqOfLeaf[l.id] && !delOfNode(l.id); });
      var wpsNoReq = leaves.filter(function (l) { return !reqOfLeaf[l.id] && delOfNode(l.id); });
      var reqRanSet = {}; reqItems.forEach(function (it) { (it.sourceRanIds || []).forEach(function (id) { reqRanSet[id] = true; }); });
      var ransWithoutReq = rans.filter(function (r) { return !reqRanSet[r.id]; });
      var emergentReqs = reqItems.filter(function (it) { return (it.sourceRanIds || []).filter(function (id) { return ranById[id]; }).length === 0; });

      kpi.fullChainPct = reqItems.length ? Math.round(kpi.verde / reqItems.length * 100) : 0;
      var mstate = !reqItems.length ? "vacio"
        : (kpi.noDel === 0 && kpi.noWp === 0 && kpi.delWpMismatch === 0 && kpi.emergent === 0 && kpi.wpNoDel === 0) ? "verde"
        : (kpi.noDel || kpi.noWp) ? "rojo" : "ambar";

      return {
        rows: rows, kpi: kpi, state: mstate,
        orphans: { delsWithoutReq: delsWithoutReq, wpsOrphan: wpsOrphan, wpsNoReq: wpsNoReq, ransWithoutReq: ransWithoutReq, emergentReqs: emergentReqs },
        counts: { req: reqItems.length, ran: rans.length, del: dels.length, wp: leaves.length }
      };
    },

    // ===============================================================
    // CRONOGRAMA / CPM — parser de precedencias (sintaxis MS Project),
    // resolución de aristas y validación de la red. Capa de DATOS: no
    // calcula fechas ni ruta crítica (eso lo hace el módulo Cronograma
    // consumiendo estas funciones). Los enlaces son actividad→actividad;
    // "from" precede a "to".
    // ---------------------------------------------------------------

    // Convierte una celda de predecesoras (p. ej. "4;5CC+2d", "9FC-1d",
    // "3FF+1 sem") en referencias {netId,type,lag,lagUnit}. Tokeniza de
    // izquierda a derecha, por lo que resuelve solo el separador de lista
    // (";" o ",") frente a la coma decimal del desfase: la coma solo es
    // decimal cuando está dentro del número del lag (tras + o −); entre
    // dos enteros es separador. Canonicaliza FC/CC/CF (español) a FS/SS/SF.
    parsePredecessorCell: function (cell) {
      var s = String(cell == null ? "" : cell).trim();
      var preds = [], errors = [];
      if (!s) return { preds: preds, errors: errors };
      var TYPE = { FS: "FS", SS: "SS", FF: "FF", SF: "SF", FC: "FS", CC: "SS", CF: "SF" };
      var LET = /[A-Za-zÁÉÍÓÚÜáéíóúü]/;
      var i = 0, n = s.length;
      function ws() { while (i < n && /\s/.test(s.charAt(i))) i++; }
      while (i < n) {
        ws(); if (i >= n) break;
        if (s.charAt(i) === ";" || s.charAt(i) === ",") { i++; continue; } // separador suelto
        var tokStart = i;
        // 1) netId (entero)
        var a = i; while (i < n && /[0-9]/.test(s.charAt(i))) i++;
        if (i === a) { // sin id: basura hasta el próximo separador
          while (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") i++;
          errors.push({ raw: s.slice(tokStart, i).trim(), reason: "sin-id" }); continue;
        }
        var netId = parseInt(s.slice(a, i), 10);
        // 2) tipo (hasta 2 letras) — opcional
        ws(); var type = "FS", b = i, buf = "";
        while (i < n && LET.test(s.charAt(i)) && buf.length < 2) { buf += s.charAt(i); i++; }
        if (buf && TYPE[buf.toUpperCase()]) type = TYPE[buf.toUpperCase()];
        else i = b; // no era un tipo válido: retroceder
        // 3) desfase (lag) — opcional: signo, número (una coma/punto decimal), unidad
        var lag = 0, lagUnit = "d", hadLag = false, lagErr = false;
        ws();
        if (i < n && (s.charAt(i) === "+" || s.charAt(i) === "-")) {
          hadLag = true; var sign = s.charAt(i) === "-" ? -1 : 1; i++; ws();
          var c = i; while (i < n && /[0-9]/.test(s.charAt(i))) i++;
          if (i < n && (s.charAt(i) === "." || s.charAt(i) === ",") && i + 1 < n && /[0-9]/.test(s.charAt(i + 1))) {
            i++; while (i < n && /[0-9]/.test(s.charAt(i))) i++;
          }
          var num = s.slice(c, i).replace(",", ".");
          if (num === "") lagErr = true; else lag = sign * parseFloat(num);
          ws(); var d0 = i; while (i < n && LET.test(s.charAt(i))) i++;
          var u = s.slice(d0, i).toLowerCase().replace(/[áàä]/g, "a").replace(/[íì]/g, "i").replace(/[éè]/g, "e");
          if (u === "" || u === "d" || u === "dia" || u === "dias" || u === "day" || u === "days") lagUnit = "d";
          else if (u === "h" || u === "hr" || u === "hrs" || u === "hora" || u === "horas") lagUnit = "h";
          else if (u === "w" || u === "sem" || u === "semana" || u === "semanas" || u === "week" || u === "weeks") lagUnit = "w";
          else if (u === "ed" || u === "dt") lagUnit = "ed";
          else lagErr = true;
        }
        // 4) tras un token completo debemos estar en separador o fin
        ws();
        if (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") {
          while (i < n && s.charAt(i) !== ";" && s.charAt(i) !== ",") i++;
          errors.push({ raw: s.slice(tokStart, i).trim(), reason: "sintaxis" }); continue;
        }
        if (lagErr) { errors.push({ raw: s.slice(tokStart, i).trim(), reason: "desfase" }); continue; }
        preds.push({ netId: netId, type: type, lag: hadLag ? lag : 0, lagUnit: hadLag ? lagUnit : "d" });
      }
      return { preds: preds, errors: errors };
    },

    // Resuelve las filas pegadas contra una instantánea de fullRows() (la
    // numeración estilo MS Project: 0=proyecto, luego fases/paquetes/
    // actividades). `snapshot` = [{netId, kind:"project"|"summary"|"activity",
    // name, activityId}] (activityId solo en actividades). `pasted` =
    // [{netId, name, start, finish, predCell}]. Devuelve enlaces candidatos
    // (sin id; el módulo asigna Lx al confirmar), rechazos con motivo,
    // errores de fila y de sintaxis, y la tabla de fechas para auditoría.
    buildScheduleLinks: function (pasted, snapshot) {
      pasted = pasted || []; snapshot = snapshot || [];
      var byNet = {};
      snapshot.forEach(function (r) { byNet[String(r.netId)] = r; });
      function norm(x) { return String(x == null ? "" : x).trim().toLowerCase()
        .normalize ? String(x == null ? "" : x).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        : String(x == null ? "" : x).trim().toLowerCase(); }
      var links = [], rejected = [], rowErrors = [], parseErrors = [], dates = {}, duplicates = [];
      var seen = {};
      pasted.forEach(function (R) {
        var tgt = byNet[String(R.netId)];
        if (!tgt) { rowErrors.push({ netId: R.netId, name: R.name || "", reason: "fila-sin-correspondencia" }); return; }
        if (tgt.kind !== "activity") {
          // fila resumen/proyecto: no es nodo de la red. Si trae predecesoras, se avisa.
          var pk = this.parsePredecessorCell(R.predCell);
          if ((pk.preds && pk.preds.length) || (pk.errors && pk.errors.length))
            rowErrors.push({ netId: R.netId, name: R.name || "", reason: tgt.kind === "project" ? "predecesoras-en-proyecto" : "predecesoras-en-resumen" });
          return;
        }
        // cruce por nombre (detecta desfase de N.º tras editar la EDT)
        if (R.name != null && String(R.name).trim() !== "" && norm(R.name) !== norm(tgt.name)) {
          rowErrors.push({ netId: R.netId, name: R.name || "", expected: tgt.name, reason: "nombre-no-coincide" }); return;
        }
        // fechas → auditoría
        if ((R.start && String(R.start).trim()) || (R.finish && String(R.finish).trim()))
          dates[tgt.activityId] = { start: String(R.start || "").trim(), finish: String(R.finish || "").trim() };
        // predecesoras → aristas
        var parsed = this.parsePredecessorCell(R.predCell);
        parsed.errors.forEach(function (e) { parseErrors.push({ netId: R.netId, name: R.name || "", raw: e.raw, reason: e.reason }); });
        parsed.preds.forEach(function (P) {
          var src = byNet[String(P.netId)];
          if (P.netId === 0 || (src && src.kind === "project"))
            { rejected.push({ fromNet: P.netId, toNet: R.netId, toName: R.name || "", reason: "enlace-a-proyecto" }); return; }
          if (!src) { rejected.push({ fromNet: P.netId, toNet: R.netId, toName: R.name || "", reason: "colgante" }); return; }
          if (src.kind === "summary") { rejected.push({ fromNet: P.netId, toNet: R.netId, toName: R.name || "", reason: "enlace-a-resumen" }); return; }
          if (src.activityId === tgt.activityId) { rejected.push({ fromNet: P.netId, toNet: R.netId, toName: R.name || "", reason: "auto-enlace" }); return; }
          var key = src.activityId + "\u0001" + tgt.activityId + "\u0001" + P.type;
          if (seen[key]) { duplicates.push({ from: src.activityId, to: tgt.activityId, type: P.type }); return; }
          seen[key] = true;
          links.push({ from: src.activityId, to: tgt.activityId, type: P.type, lag: P.lag, lagUnit: P.lagUnit });
        });
      }, this);
      return { links: links, rejected: rejected, rowErrors: rowErrors, parseErrors: parseErrors, dates: dates, duplicates: duplicates };
    },

    // Valida la red: referencias colgantes, auto-enlaces, duplicados,
    // ciclos (orden topológico de Kahn) y extremos abiertos (sin
    // predecesora / sin sucesora). `ok` = red apta para el CPM (sin ciclos,
    // sin colgantes, sin auto-enlaces). Duplicados y extremos abiertos son
    // avisos, no bloqueantes.
    scheduleValidate: function (activityIds, links) {
      activityIds = activityIds || []; links = links || [];
      var inSet = {}; activityIds.forEach(function (id) { inSet[id] = true; });
      var dangling = [], selfLoops = [], duplicates = [], seen = {};
      var adj = {}, indeg = {}, outdeg = {};
      activityIds.forEach(function (id) { adj[id] = []; indeg[id] = 0; outdeg[id] = 0; });
      links.forEach(function (l) {
        if (!inSet[l.from] || !inSet[l.to]) { dangling.push(l); return; }
        if (l.from === l.to) { selfLoops.push(l); return; }
        var k = l.from + "\u0001" + l.to + "\u0001" + l.type;
        if (seen[k]) { duplicates.push(l); return; }
        seen[k] = true;
        adj[l.from].push(l.to); outdeg[l.from]++; indeg[l.to]++;
      });
      // Kahn
      var q = [], order = [], deg = {};
      activityIds.forEach(function (id) { deg[id] = indeg[id]; if (indeg[id] === 0) q.push(id); });
      while (q.length) {
        var u = q.shift(); order.push(u);
        adj[u].forEach(function (v) { if (--deg[v] === 0) q.push(v); });
      }
      var cycleNodes = activityIds.filter(function (id) { return deg[id] > 0; });
      var openStart = activityIds.filter(function (id) { return indeg[id] === 0; });
      var openEnd = activityIds.filter(function (id) { return outdeg[id] === 0; });
      return {
        ok: cycleNodes.length === 0 && dangling.length === 0 && selfLoops.length === 0,
        dangling: dangling, selfLoops: selfLoops, duplicates: duplicates,
        cycles: cycleNodes, openStart: openStart, openEnd: openEnd,
        order: order
      };
    },

    // Calendario del proyecto para el CPM. Se lee del Plan de Gestión del
    // Cronograma (schedulePlan.calendar): NUNCA se guarda en el módulo de
    // cronograma. Devuelve días laborables como índices (Dom=0..Sáb=6),
    // horas/día y feriados. Si no hay Plan, cae a un default (Lun–Vie, 8 h)
    // marcado provisional para que el módulo avise.
    projectCalendar: function (sp) {
      var DAY = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
      try { if (sp === undefined && typeof GPI.getModule === "function") sp = GPI.getModule("schedulePlan"); } catch (e) { sp = sp || null; }
      var cal = sp && sp.calendar ? sp.calendar : null;
      if (!cal || !Array.isArray(cal.workDays) || !cal.workDays.length || !(Number(cal.hoursPerDay) > 0)) {
        return { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [], provisional: true };
      }
      var idx = {};
      cal.workDays.forEach(function (d) {
        var key = String(d).toLowerCase().normalize ? String(d).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3) : String(d).toLowerCase().slice(0, 3);
        if (DAY[key] !== undefined) idx[DAY[key]] = true;
      });
      var days = Object.keys(idx).map(Number).sort(function (a, b) { return a - b; });
      return {
        workDayIdx: days.length ? days : [1, 2, 3, 4, 5],
        hoursPerDay: Number(cal.hoursPerDay) || 8,
        holidays: Array.isArray(cal.holidays) ? cal.holidays.slice() : [],
        provisional: false
      };
    },

    // Método de la Ruta Crítica (CPM). Nodos = actividades hoja
    // {id, dur} (dur en días laborables); links = aristas tipadas
    // {from,to,type,lag,lagUnit}. Calcula ES/EF/LS/LF, holgura total y
    // libre, ruta crítica y —si se pasa opts.startDate y un calendario—
    // las fechas de calendario de cada actividad (para el contraste con las
    // fechas pegadas de MS Project). Trabaja en offsets de días laborables;
    // el calendario solo interviene al mapear offsets → fechas.
    //   FS: ES(j) ≥ EF(i)+lag   SS: ES(j) ≥ ES(i)+lag
    //   FF: EF(j) ≥ EF(i)+lag   SF: EF(j) ≥ ES(i)+lag
    cpm: function (nodes, links, calendar, opts) {
      nodes = nodes || []; links = links || []; opts = opts || {};
      calendar = calendar || { workDayIdx: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] };
      var wpw = (calendar.workDayIdx && calendar.workDayIdx.length) ? calendar.workDayIdx.length : 5;
      var hpd = Number(calendar.hoursPerDay) > 0 ? Number(calendar.hoursPerDay) : 8;
      function lagWD(l) {
        var v = Number(l.lag) || 0, u = l.lagUnit || "d";
        if (u === "h") return v / hpd;
        if (u === "w") return v * wpw;
        if (u === "ed") return v * (wpw / 7);
        return v; // "d"
      }
      var dur = {}, ids = [];
      nodes.forEach(function (n) { dur[n.id] = Number(n.dur) || 0; ids.push(n.id); });
      var inSet = {}; ids.forEach(function (id) { inSet[id] = true; });
      var out = {}, inc = {}, indeg = {}, outdeg = {};
      ids.forEach(function (id) { out[id] = []; inc[id] = []; indeg[id] = 0; outdeg[id] = 0; });
      links.forEach(function (l) {
        if (!inSet[l.from] || !inSet[l.to] || l.from === l.to) return;
        out[l.from].push(l); inc[l.to].push(l); indeg[l.to]++; outdeg[l.from]++;
      });
      // orden topológico (Kahn)
      var q = [], order = [], deg = {};
      ids.forEach(function (id) { deg[id] = indeg[id]; if (!indeg[id]) q.push(id); });
      while (q.length) { var u = q.shift(); order.push(u); out[u].forEach(function (l) { if (--deg[l.to] === 0) q.push(l.to); }); }
      if (order.length !== ids.length) {
        return { ok: false, cycles: ids.filter(function (id) { return deg[id] > 0; }) };
      }
      // forward pass
      var ES = {}, EF = {};
      ids.forEach(function (id) { ES[id] = 0; });
      order.forEach(function (id) {
        inc[id].forEach(function (l) {
          var g = lagWD(l), lb;
          if (l.type === "SS") lb = ES[l.from] + g;
          else if (l.type === "FF") lb = EF[l.from] + g - dur[id];
          else if (l.type === "SF") lb = ES[l.from] + g - dur[id];
          else lb = EF[l.from] + g; // FS
          if (lb > ES[id]) ES[id] = lb;
        });
        if (ES[id] < 0) ES[id] = 0;
        EF[id] = ES[id] + dur[id];
      });
      var projDur = 0; ids.forEach(function (id) { if (EF[id] > projDur) projDur = EF[id]; });
      // backward pass
      var LF = {}, LS = {};
      ids.forEach(function (id) { LF[id] = projDur; });
      for (var i = order.length - 1; i >= 0; i--) {
        var id = order[i];
        if (outdeg[id] > 0) {
          LF[id] = Infinity;
          out[id].forEach(function (l) {
            var g = lagWD(l), ub;
            if (l.type === "SS") ub = (LF[l.to] - dur[l.to]) - g + dur[id];
            else if (l.type === "FF") ub = LF[l.to] - g;
            else if (l.type === "SF") ub = LF[l.to] - g + dur[id];
            else ub = (LF[l.to] - dur[l.to]) - g; // FS: LS(to)-lag
            if (ub < LF[id]) LF[id] = ub;
          });
        }
        LS[id] = LF[id] - dur[id];
      }
      // holguras, ruta crítica, fechas
      var EPS = 1e-6, rows = {}, criticalIds = [];
      var start = opts.startDate ? GPI.util.parseISO(opts.startDate) : null;
      ids.forEach(function (id) {
        var tf = LS[id] - ES[id];
        var ff = Infinity;
        if (outdeg[id] === 0) ff = tf;
        else out[id].forEach(function (l) {
          var g = lagWD(l), s;
          if (l.type === "SS") s = ES[l.to] - ES[id] - g;
          else if (l.type === "FF") s = EF[l.to] - EF[id] - g;
          else if (l.type === "SF") s = EF[l.to] - ES[id] - g;
          else s = ES[l.to] - EF[id] - g; // FS
          if (s < ff) ff = s;
        });
        var crit = tf <= EPS;
        if (crit) criticalIds.push(id);
        rows[id] = {
          es: ES[id], ef: EF[id], ls: LS[id], lf: LF[id],
          tf: Math.round(tf * 1000) / 1000, ff: (ff === Infinity ? 0 : Math.round(ff * 1000) / 1000),
          critical: crit,
          startDate: start ? GPI.util.addWorkingDays(start, Math.round(ES[id]), calendar) : "",
          finishDate: start ? GPI.util.addWorkingDays(start, Math.max(Math.round(ES[id]), Math.round(EF[id]) - (dur[id] > 0 ? 1 : 0)), calendar) : ""
        };
      });
      return {
        ok: true, rows: rows, order: order, criticalIds: criticalIds,
        projectDuration: projDur,
        projectStart: start ? GPI.util.addWorkingDays(start, 0, calendar) : "",
        projectFinishDate: start ? GPI.util.addWorkingDays(start, Math.max(0, Math.round(projDur) - 1), calendar) : ""
      };
    },

    // Fecha ISO "YYYY-MM-DD" → Date (mediodía UTC para evitar saltos de huso).
    parseISO: function (s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!m) return null;
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
    },
    // Suma n días LABORABLES a una fecha, saltando días no laborables y
    // feriados del calendario. n≥0 cuenta hacia adelante desde el primer día
    // laborable ≥ fecha (offset 0 = ese primer día laborable). Devuelve ISO.
    addWorkingDays: function (date, n, calendar) {
      if (!date) return "";
      calendar = calendar || { workDayIdx: [1, 2, 3, 4, 5], holidays: [] };
      var work = {}; (calendar.workDayIdx || [1, 2, 3, 4, 5]).forEach(function (d) { work[d] = true; });
      var hol = {}; (calendar.holidays || []).forEach(function (h) { hol[String(h).slice(0, 10)] = true; });
      function iso(d) { return d.toISOString().slice(0, 10); }
      function isWork(d) { return work[d.getUTCDay()] && !hol[iso(d)]; }
      var d = new Date(date.getTime());
      while (!isWork(d)) d.setUTCDate(d.getUTCDate() + 1); // alinear al primer día laborable
      var count = 0;
      while (count < n) { d.setUTCDate(d.getUTCDate() + 1); if (isWork(d)) count++; }
      return iso(d);
    },

    // Resumen del cronograma del proyecto activo para tableros (Panel):
    // duración, n.º de actividades críticas y de enlaces. Usa la duración
    // determinística (Met/Rend) vía pertStats, igual que el módulo por defecto.
    scheduleStats: function () {
      var sched = null, meta = null, nodes = [];
      try { sched = GPI.getModule("schedule"); } catch (e) {}
      var links = (sched && Array.isArray(sched.links)) ? sched.links : [];
      try {
        var ps = GPI.util.pertStats(GPI.getModule("pert"), GPI.getModule("activities"), GPI.getModule("wbs"));
        nodes = (ps.rows || []).map(function (r) { return { id: r.id, dur: r.dur }; });
      } catch (e2) {}
      try { meta = GPI.meta(); } catch (e3) {}
      var cpm = GPI.util.cpm(nodes, links, GPI.util.projectCalendar(), { startDate: meta && meta.startDate });
      return {
        hasSlice: !!sched, links: links.length, activities: nodes.length, ok: cpm.ok,
        projectDuration: cpm.ok ? cpm.projectDuration : null,
        criticalCount: cpm.ok ? cpm.criticalIds.length : 0,
        finishDate: cpm.projectFinishDate || ""
      };
    }
  };

  g.GPI = GPI;
})(window);
