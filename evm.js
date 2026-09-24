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
				id: str(q.id),
				code: str(q.code),
				name: str(q.name),
				bac: fin(q.bac),
				source: str(q.source),
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
				holidays: (Array.isArray(cal.holidays) ? cal.holidays : []).map(str)
			},
			packages,
			total: fin(x.total, packages.reduce((s, p) => s + p.bac, 0))
		};
	}
	//#endregion
	//#region src/shared/evm-reference.ts
	function packageBudgets(i) {
		const out = {};
		i.estimateRows.forEach((r) => {
			if (r.subtotal && r.subtotal > 0) {
				const k = out[r.leafId] || (out[r.leafId] = {
					bac: 0,
					source: "Estimar los Costos"
				});
				k.bac += r.subtotal;
			}
		});
		i.leaves.forEach((l) => {
			if (!out[l.id]) {
				const w = i.wbsCost[l.id] || 0;
				if (w > 0) out[l.id] = {
					bac: w,
					source: "EDT (WBS Builder)"
				};
			}
		});
		return out;
	}
	function referenceDrift(frozen, frozenStart, liveStart, live) {
		const out = [];
		const bacOf = (r) => {
			const m = {};
			r.packages.forEach((p) => {
				m[p.id] = p.bac;
			});
			return m;
		};
		const f = bacOf(frozen), v = bacOf(live);
		const changed = Array.from(new Set(Object.keys(f).concat(Object.keys(v)))).filter((id) => Math.abs((f[id] || 0) - (v[id] || 0)) > .5);
		if (changed.length) out.push("el presupuesto por paquete (" + changed.length + " paquete(s); total vigente " + Math.round(live.total).toLocaleString("es-PE") + " frente a " + Math.round(frozen.total).toLocaleString("es-PE") + " en la línea base)");
		if (liveStart && frozenStart && liveStart !== frozenStart) out.push("la fecha de inicio (" + liveStart + " frente a " + frozenStart + " en la línea base)");
		if (JSON.stringify(live.calendar) !== JSON.stringify(frozen.calendar)) out.push("el calendario laboral (días laborables o feriados)");
		return out;
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
	//#region src/shared/evm-sample.ts
	var EVM_SAMPLE_STATUS_DATE = "2026-10-30";
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
	var EVM_SAMPLE_PERCENT = {
		"1.1": 100,
		"1.2": 100,
		"1.3": 100,
		"2.1": 100,
		"2.2": 100,
		"2.3": 100,
		"2.4": 90,
		"3.1": 90,
		"3.2": 90,
		"3.3": 100
	};
	var EVM_SAMPLE_AC = {
		"1.1": 12e3,
		"1.2": 38500,
		"1.3": 15e4,
		"2.1": 3e4,
		"2.2": 172e3,
		"2.3": 101e3,
		"2.4": 4e4,
		"3.1": 166e4,
		"3.2": 64e4,
		"3.3": 41e4
	};
	var EVM_SAMPLE_TECHNIQUES = {
		"1.3": "loe",
		"2.4": "cero_cien"
	};
	var EVM_SAMPLE_REPORTS = [
		{
			date: "2026-08-14",
			offset: 30,
			pv: 145563,
			ev: 141e3,
			ac: 144e3,
			cpi: .979,
			spi: .969
		},
		{
			date: "2026-08-31",
			offset: 41,
			pv: 238e3,
			ev: 231e3,
			ac: 236500,
			cpi: .977,
			spi: .971
		},
		{
			date: "2026-09-18",
			offset: 55,
			pv: 410375,
			ev: 398e3,
			ac: 407e3,
			cpi: .978,
			spi: .97
		}
	];
	//#endregion
	//#region src/shared/evm.ts
	var TECHNIQUE_LABEL = {
		cero_cien: "0/100 (al completar)",
		cincuenta: "50/50 (inicio/fin)",
		fisico: "% físico avanzado",
		loe: "LOE (nivel de esfuerzo)"
	};
	var TECHNIQUES = [
		"cero_cien",
		"cincuenta",
		"fisico",
		"loe"
	];
	function techniqueFromPlan(label) {
		const t = String(label || "").toLowerCase();
		if (/0\/100/.test(t)) return {
			technique: "cero_cien",
			approximated: false
		};
		if (/50\/50/.test(t)) return {
			technique: "cincuenta",
			approximated: false
		};
		if (/loe|nivel de esfuerzo/.test(t)) return {
			technique: "loe",
			approximated: false
		};
		if (/hitos|apportion/.test(t)) return {
			technique: "fisico",
			approximated: true
		};
		return {
			technique: "fisico",
			approximated: false
		};
	}
	var num = (v) => {
		const n = Number(v);
		return isFinite(n) ? n : 0;
	};
	var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
	var div = (a, b) => b > 1e-9 || b < -1e-9 ? a / b : null;
	function plannedFraction(p, t) {
		if (p.es === null || p.ef === null) return 0;
		if (p.ef - p.es <= 1e-9) return t >= p.es - 1e-9 ? 1 : 0;
		return clamp((t - p.es) / (p.ef - p.es), 0, 1);
	}
	var pvAt = (pkgs, t) => pkgs.reduce((s, p) => s + p.bac * plannedFraction(p, t), 0);
	function pvCurve(pkgs, duration) {
		const D = Math.max(1, Math.ceil(duration - 1e-9)), out = [];
		for (let t = 0; t <= D; t++) out.push(pvAt(pkgs, t));
		return out;
	}
	function earnedSchedule(curve, ev) {
		const D = curve.length - 1;
		if (!(ev > 1e-9)) return 0;
		if (ev >= curve[D] - 1e-9) return D;
		let c = 0;
		while (c < D && curve[c + 1] <= ev + 1e-12) c++;
		const d = curve[c + 1] - curve[c];
		return c + (d > 1e-12 ? (ev - curve[c]) / d : 0);
	}
	function creditFor(technique, percent, plannedFrac) {
		const p = clamp(percent, 0, 100);
		if (technique === "cero_cien") return p >= 100 ? 1 : 0;
		if (technique === "cincuenta") return p >= 100 ? 1 : p > 0 ? .5 : 0;
		if (technique === "loe") return plannedFrac;
		return p / 100;
	}
	function evmCompute(inp) {
		const scheduled = inp.packages.filter((p) => p.es !== null && p.ef !== null && p.bac > 0), unscheduled = inp.packages.filter((p) => (p.es === null || p.ef === null) && p.bac > 0);
		const t = Math.max(0, inp.statusOffset);
		const rows = scheduled.map((p) => {
			const frac = plannedFraction(p, t), tech = inp.techniques[p.id] || inp.defaultTechnique;
			const pctRaw = inp.percent[p.id], reported = pctRaw !== null && pctRaw !== void 0 && pctRaw !== "";
			const percent = reported ? clamp(num(pctRaw), 0, 100) : null, ac = Math.max(0, num(inp.ac[p.id]));
			const pv = p.bac * frac, ev = p.bac * creditFor(tech, percent === null ? 0 : percent, frac);
			return {
				id: p.id,
				code: p.code,
				name: p.name,
				bac: p.bac,
				technique: tech,
				plannedPct: frac * 100,
				percent,
				pv,
				ev,
				ac,
				cv: ev - ac,
				sv: ev - pv,
				cpi: div(ev, ac),
				spi: div(ev, pv),
				reported
			};
		});
		const bac = rows.reduce((s, r) => s + r.bac, 0), pv = rows.reduce((s, r) => s + r.pv, 0), ev = rows.reduce((s, r) => s + r.ev, 0), ac = rows.reduce((s, r) => s + r.ac, 0);
		const cpi = div(ev, ac), spi = div(ev, pv), cv = ev - ac, sv = ev - pv;
		const eacTyp = cpi !== null && cpi > 0 ? bac / cpi : null, eacAty = ac + (bac - ev);
		const both = cpi !== null && spi !== null && cpi * spi > 0 ? cpi * spi : null, eacCom = both !== null ? ac + (bac - ev) / both : null;
		const fc = (x) => x;
		const eac = {
			typical: fc(eacTyp),
			atypical: eacAty,
			combined: fc(eacCom)
		};
		const etc = {
			typical: eacTyp === null ? null : eacTyp - ac,
			atypical: eacAty - ac,
			combined: eacCom === null ? null : eacCom - ac
		};
		const vac = {
			typical: eacTyp === null ? null : bac - eacTyp,
			atypical: bac - eacAty,
			combined: eacCom === null ? null : bac - eacCom
		};
		const tcpiBac = div(bac - ev, bac - ac), tcpiEac = eacTyp === null ? null : div(bac - ev, eacTyp - ac);
		const curve = pvCurve(scheduled, Math.max(inp.projectDuration, ...scheduled.map((p) => p.ef), 1));
		const es = earnedSchedule(curve, ev), spiT = t > 1e-9 ? es / t : null;
		const ieacT = spiT !== null && spiT > 0 ? inp.projectDuration / spiT : null;
		const loeBac = rows.filter((r) => r.technique === "loe").reduce((s, r) => s + r.bac, 0);
		return {
			bac,
			pv,
			ev,
			ac,
			cv,
			sv,
			cpi,
			spi,
			svPct: div(sv, pv) === null ? null : sv / pv * 100,
			eac,
			etc,
			vac,
			tcpiBac,
			tcpiEac,
			percentPlanned: bac > 0 ? pv / bac * 100 : 0,
			percentComplete: bac > 0 ? ev / bac * 100 : 0,
			percentSpent: bac > 0 ? ac / bac * 100 : 0,
			at: t,
			es,
			svT: es - t,
			spiT,
			ieacT,
			loeShare: bac > 0 ? loeBac / bac * 100 : 0,
			rows,
			unscheduled,
			unreported: rows.filter((r) => !r.reported && r.ev === 0 && r.pv > 0).length,
			curve
		};
	}
	var DEFAULT_THRESHOLDS = {
		cpiWarn: .95,
		cpiEsc: .9,
		cvWarn: -5e4,
		cvEsc: -1e5,
		spiGreen: .95,
		spiRed: .9,
		svGreenPct: -5,
		svRedPct: -10
	};
	var costLevel = (v, warn, esc) => v === null ? null : v <= esc ? "rojo" : v <= warn ? "ambar" : "verde";
	var scheduleLevel = (v, green, red) => v === null ? null : v >= green ? "verde" : v < red ? "rojo" : "ambar";
	var RANK = {
		verde: 0,
		ambar: 1,
		rojo: 2
	};
	var worst = (ls) => ls.filter((x) => x !== null).reduce((a, b) => a === null || RANK[b] > RANK[a] ? b : a, null);
	function evmStatus(r, t) {
		const cpi = costLevel(r.cpi, t.cpiWarn, t.cpiEsc), cv = r.ac > 0 ? costLevel(r.cv, t.cvWarn, t.cvEsc) : null;
		const spi = scheduleLevel(r.spi, t.spiGreen, t.spiRed), sv = scheduleLevel(r.svPct, t.svGreenPct, t.svRedPct);
		return {
			cpi,
			cv,
			spi,
			sv,
			cost: worst([cpi, cv]),
			schedule: worst([spi, sv])
		};
	}
	var isoOf = (d) => d.toISOString().slice(0, 10);
	var parse = (s) => {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
		return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null;
	};
	function workingDaysThrough(startISO, dateISO, cal) {
		const s = parse(startISO), e = parse(dateISO);
		if (!s || !e || e.getTime() < s.getTime()) return 0;
		const work = {};
		(cal && cal.workDayIdx && cal.workDayIdx.length ? cal.workDayIdx : [
			1,
			2,
			3,
			4,
			5
		]).forEach((d) => {
			work[d] = true;
		});
		const hol = {};
		(cal && cal.holidays || []).forEach((h) => {
			hol[String(h).slice(0, 10)] = true;
		});
		let n = 0;
		const d = new Date(s.getTime()), guard = 2e4;
		for (let i = 0; i < guard && d.getTime() <= e.getTime(); i++) {
			if (work[d.getUTCDay()] && !hol[isoOf(d)]) n++;
			d.setUTCDate(d.getUTCDate() + 1);
		}
		return n;
	}
	function normalizeReports(v) {
		if (!Array.isArray(v)) return [];
		return v.filter((x) => x && typeof x === "object").map((x) => {
			const q = x, o = (k) => q[k] === null || q[k] === void 0 || q[k] === "" ? null : isFinite(Number(q[k])) ? Number(q[k]) : null;
			return {
				date: String(q.date || ""),
				offset: num(q.offset),
				pv: num(q.pv),
				ev: num(q.ev),
				ac: num(q.ac),
				cpi: o("cpi"),
				spi: o("spi")
			};
		}).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
	}
	//#endregion
	//#region src/modules/evm/main.ts
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
	var rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var numOr = (v, d) => {
		const n = Number(v);
		return v === "" || v === null || v === void 0 || !isFinite(n) ? d : n;
	};
	var blankData = () => ({
		statusDate: todayISO(),
		percent: {},
		ac: {},
		techniques: {},
		reports: []
	});
	function normalizeData(o) {
		const x = rec(o), d = blankData();
		if (typeof x.statusDate === "string" && x.statusDate) d.statusDate = x.statusDate;
		const nums = (v) => {
			const out = {};
			Object.keys(rec(v)).forEach((k) => {
				const raw = rec(v)[k];
				out[k] = raw === null || raw === "" || raw === void 0 || !isFinite(Number(raw)) ? null : Number(raw);
			});
			return out;
		};
		d.percent = nums(x.percent);
		d.ac = nums(x.ac);
		Object.keys(rec(x.techniques)).forEach((k) => {
			const t = rec(x.techniques)[k];
			if (TECHNIQUES.indexOf(t) >= 0) d.techniques[k] = t;
		});
		d.reports = normalizeReports(x.reports);
		return d;
	}
	var data = blankData();
	var CUR = {
		USD: "$",
		PEN: "S/",
		EUR: "€"
	};
	function emptyCtx(connected) {
		return {
			connected,
			sym: "$",
			pkgs: [],
			startDate: "",
			calendar: {
				workDayIdx: [
					1,
					2,
					3,
					4,
					5
				],
				holidays: []
			},
			duration: 0,
			baseline: null,
			newSinceBaseline: 0,
			thresholds: { ...DEFAULT_THRESHOLDS },
			defaultTech: "fisico",
			techLabel: "% físico avanzado",
			techApprox: false,
			cont: null,
			contAvail: null,
			bacBudget: null,
			issues: [],
			frozen: false,
			notes: []
		};
	}
	var ctx = emptyCtx(false);
	var ctxDirty = true;
	function getCtx() {
		if (ctxDirty) {
			ctx = buildCtx();
			ctxDirty = false;
		}
		return ctx;
	}
	function buildCtx() {
		const G = window.GPI, connected = !!(G && G.available() && G.active()), c = emptyCtx(connected);
		if (!G || !G.util || !G.util.cpm || !G.util.scheduleNetwork) {
			c.issues.push("No cargó gpi-core.js: sin el núcleo no se puede calcular el cronograma.");
			return c;
		}
		try {
			const wbs = connected ? G.getModule("wbs") : sampleScheduleModules().wbs;
			const m = connected ? null : sampleScheduleModules();
			const act = connected ? G.getModule("activities") : m.activities;
			const sched = connected ? G.getModule("schedule") : m.schedule;
			const net = connected ? G.util.activeScheduleNetwork() : G.util.scheduleNetwork(wbs, act, null, sched, null, SAMPLE_START_DATE);
			if (connected) {
				const meta = G.meta();
				c.sym = CUR[meta && meta.currency || ""] || "$";
			}
			if (!net) {
				c.issues.push(connected ? "El proyecto aún no tiene actividades: define la EDT, las actividades y sus enlaces (Cronograma/CPM) para distribuir el costo en el tiempo." : "No se pudo armar el cronograma del ejemplo.");
				return c;
			}
			c.startDate = net.startDate || (connected ? "" : "2026-07-06");
			c.calendar = {
				workDayIdx: net.calendar.workDayIdx,
				holidays: net.calendar.holidays
			};
			const res = G.util.cpm(net.nodes.map((n) => ({
				id: n.id,
				dur: n.dur
			})), net.links, net.calendar, {});
			if (!res.ok) {
				c.issues.push("La red del cronograma tiene un ciclo: corrígela en Cronograma/CPM.");
				return c;
			}
			const bl = connected && sched ? normalizeBaseline(sched.baseline) : null;
			const rows = {};
			if (bl) bl.snapshot.rows.forEach((r) => {
				rows[r.id] = r;
			});
			else Object.keys(res.rows).forEach((id) => {
				rows[id] = res.rows[id];
			});
			c.baseline = bl ? {
				version: bl.version,
				date: bl.date
			} : null;
			c.duration = bl ? bl.snapshot.projectDuration : res.projectDuration;
			const spans = {};
			net.nodes.filter((n) => !n.isMilestone && n.leafId).forEach((n) => {
				const r = rows[n.id];
				if (!r) {
					if (bl) c.newSinceBaseline++;
					return;
				}
				const s = spans[n.leafId] || (spans[n.leafId] = {
					es: r.es,
					ef: r.ef
				});
				s.es = Math.min(s.es, r.es);
				s.ef = Math.max(s.ef, r.ef);
			});
			let costOf = {};
			const leaves = G.util.wbsLeaves(wbs);
			if (connected) {
				const wbsCost = {};
				leaves.forEach((l) => {
					wbsCost[l.id] = wbs && wbs.nodes[l.id] ? Number(wbs.nodes[l.id].cost) || 0 : 0;
				});
				costOf = packageBudgets({
					leaves,
					wbsCost,
					estimateRows: G.util.costEstimateRows(G.getModule("costEstimate"), act, wbs).map((r) => ({
						leafId: r.leafId,
						subtotal: r.subtotal
					}))
				});
			} else leaves.forEach((l) => {
				if (EVM_SAMPLE_COSTS[l.code]) costOf[l.id] = {
					bac: EVM_SAMPLE_COSTS[l.code],
					source: "Ejemplo DISTRIB+"
				};
			});
			c.pkgs = leaves.filter((l) => costOf[l.id]).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name,
				bac: costOf[l.id].bac,
				es: spans[l.id] ? spans[l.id].es : null,
				ef: spans[l.id] ? spans[l.id].ef : null,
				source: costOf[l.id].source
			}));
			const ev = bl ? bl.snapshot.evm : null;
			if (bl && ev) {
				const live = {
					calendar: {
						workDayIdx: net.calendar.workDayIdx.slice(),
						holidays: net.calendar.holidays.slice()
					},
					packages: c.pkgs.map((p) => ({
						id: p.id,
						code: p.code,
						name: p.name,
						bac: p.bac,
						source: p.source,
						es: null,
						ef: null
					})),
					total: c.pkgs.reduce((s, p) => s + p.bac, 0)
				};
				const drift = referenceDrift(ev, bl.snapshot.startDate, net.startDate || "", live);
				if (drift.length) c.notes.push("Después de fijar la línea base " + bl.version + " cambió(aron): " + drift.join("; ") + ". El valor ganado sigue usando lo aprobado en " + bl.version + "; para incorporar esos cambios fija una nueva versión de la línea base (con motivo y aprobación) en Cronograma/CPM.");
				c.frozen = true;
				c.startDate = bl.snapshot.startDate || c.startDate;
				c.calendar = {
					workDayIdx: ev.calendar.workDayIdx.slice(),
					holidays: ev.calendar.holidays.slice()
				};
				c.pkgs = ev.packages.map((p) => ({
					id: p.id,
					code: p.code,
					name: p.name,
					bac: p.bac,
					es: p.es,
					ef: p.ef,
					source: "Línea base " + bl.version
				}));
			} else if (bl) c.notes.push("La línea base " + bl.version + " se fijó antes de que el presupuesto por paquete, la fecha de inicio y el calendario se congelaran con ella: esos datos se leen de lo editable hoy y cambiarán si alguien edita la estimación o la fecha de inicio (los índices cambian sin que exista otra línea base). Fija una nueva versión de la línea base (con motivo y aprobación) en Cronograma/CPM para congelarlos.");
			if (!c.pkgs.length) c.issues.push(connected ? "Ningún paquete de trabajo tiene costo: carga la estimación en Estimar los Costos o el costo de los paquetes en WBS Builder." : "El ejemplo no tiene paquetes.");
			if (connected) {
				const cost = rec(G.getModule("cost")), plan = rec(cost.plan), th = rec(plan.thresholds);
				const t = techniqueFromPlan(plan.evMethod);
				c.defaultTech = t.technique;
				c.techApprox = t.approximated;
				c.techLabel = String(plan.evMethod || TECHNIQUE_LABEL.fisico);
				c.thresholds.cpiWarn = numOr(rec(th.cpi).warn, DEFAULT_THRESHOLDS.cpiWarn);
				c.thresholds.cpiEsc = numOr(rec(th.cpi).escalate, DEFAULT_THRESHOLDS.cpiEsc);
				c.thresholds.cvWarn = numOr(rec(th.cv).warn, DEFAULT_THRESHOLDS.cvWarn);
				c.thresholds.cvEsc = numOr(rec(th.cv).escalate, DEFAULT_THRESHOLDS.cvEsc);
				const comp = rec(rec(cost.budget).computed), tot = rec(cost.changeTotals);
				c.cont = comp.cont == null ? null : Number(comp.cont);
				c.bacBudget = comp.bac == null ? null : Number(comp.bac);
				c.contAvail = tot.contingencyAvailable == null ? null : Number(tot.contingencyAvailable);
				const sp = rec(G.getModule("schedulePlan")), thr = Array.isArray(sp.controlThresholds) ? sp.controlThresholds.map(rec) : [];
				const spi = thr.filter((x) => x.key === "SPI")[0], sv = thr.filter((x) => x.key === "SV")[0];
				if (spi) {
					c.thresholds.spiGreen = numOr(spi.greenValue, DEFAULT_THRESHOLDS.spiGreen);
					c.thresholds.spiRed = numOr(spi.redValue, DEFAULT_THRESHOLDS.spiRed);
				}
				if (sv) {
					c.thresholds.svGreenPct = numOr(sv.greenValue, DEFAULT_THRESHOLDS.svGreenPct);
					c.thresholds.svRedPct = numOr(sv.redValue, DEFAULT_THRESHOLDS.svRedPct);
				}
			}
		} catch (e) {
			c.issues.push("No se pudo armar el contexto del proyecto.");
		}
		return c;
	}
	function compute() {
		const C = getCtx();
		return evmCompute({
			packages: C.pkgs,
			percent: data.percent,
			ac: data.ac,
			techniques: data.techniques,
			defaultTechnique: C.defaultTech,
			statusOffset: workingDaysThrough(C.startDate, data.statusDate, C.calendar),
			projectDuration: C.duration
		});
	}
	function dateOf(off) {
		const G = window.GPI, C = getCtx();
		if (!G || !C.startDate) return "";
		try {
			return G.util.addWorkingDays(G.util.parseISO(C.startDate), Math.max(0, Math.ceil(off - 1e-9) - 1), C.calendar);
		} catch (e) {
			return "";
		}
	}
	var money = (n) => n == null || !isFinite(n) ? "—" : getCtx().sym + " " + Math.round(n).toLocaleString("es-PE");
	var idx = (v, d = 2) => v === null || !isFinite(v) ? "—" : v.toFixed(d);
	var days = (v) => v === null || !isFinite(v) ? "—" : Math.round(v * 10) / 10 + " d";
	var signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v)).replace(/^\S+ /, getCtx().sym + " ");
	var lvlPill = (l) => l ? `<span class="pill ${l}">${l === "ambar" ? "ÁMBAR" : l.toUpperCase()}</span>` : "";
	var cls = (v) => v < -1e-9 ? "neg" : v > 1e-9 ? "pos" : "";
	function head() {
		return `<div class="view-head"><h2>Seguimiento del valor ganado</h2>
    <p>Cruza la <b>línea base</b> (el costo de cada paquete de trabajo, distribuido en el tiempo según el cronograma) con lo que el equipo <b>reporta en cada corte</b> (avance físico y costo real) para saber si el proyecto va bien en <b>costo</b> y en <b>plazo</b>, qué costo final se pronostica y cuándo terminaría. Los umbrales de alerta son los de los planes de Costos y del Cronograma.</p></div>`;
	}
	function render() {
		const C = getCtx(), main = $("mainArea");
		$("statusDate").value = data.statusDate;
		if (!C.pkgs.length) {
			main.innerHTML = head() + `<div class="empty-hint">${C.issues.length ? "<b>No hay nada que medir todavía.</b><br>" + C.issues.map(esc).join("<br>") : "Aún no hay paquetes de trabajo con costo."}<br><br>Usa <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</div>`;
			return;
		}
		main.innerHTML = head() + `<div id="evTop"></div>` + tableCard(C) + `<div id="evHist">${histCard()}</div>` + notesCard(C);
		wireMain();
		refresh();
	}
	function tableCard(C) {
		const rows = C.pkgs.map((p) => `<tr class="evrow" data-id="${esc(p.id)}"><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}<div class="muted small">${esc(p.source)}${p.es === null ? " · <span class=\"neg\">sin actividades: no se distribuye en el tiempo</span>" : ""}</div></td>
    <td class="num">${money(p.bac)}</td>
    <td><select class="in" data-id="${esc(p.id)}" data-f="technique" aria-label="Técnica de valor ganado de ${esc(p.code)}">${TECHNIQUES.map((t) => `<option value="${t}" ${(data.techniques[p.id] || C.defaultTech) === t ? "selected" : ""}>${esc(TECHNIQUE_LABEL[t])}</option>`).join("")}</select></td>
    <td class="num" data-k="plannedPct"></td>
    <td class="num"><input class="in" type="number" min="0" max="100" step="any" data-id="${esc(p.id)}" data-f="percent" value="${data.percent[p.id] == null ? "" : esc(data.percent[p.id])}" aria-label="Avance físico de ${esc(p.code)} (%)"></td>
    <td class="num" data-k="pv"></td><td class="num" data-k="ev"></td>
    <td class="num"><input class="in" type="number" min="0" step="any" data-id="${esc(p.id)}" data-f="ac" value="${data.ac[p.id] == null ? "" : esc(data.ac[p.id])}" aria-label="Costo real de ${esc(p.code)}"></td>
    <td class="num" data-k="cv"></td><td class="num" data-k="sv"></td><td class="num" data-k="cpi"></td><td class="num" data-k="spi"></td></tr>`).join("");
		return `<div class="card"><h3>Por paquete de trabajo</h3><div class="muted small" style="margin-bottom:6px">Reporta el <b>% de avance físico</b> y el <b>costo real acumulado</b> de cada paquete a la fecha de corte. Elige la <b>técnica</b> con que se mide su valor ganado (por omisión, la del Plan de Costos: ${esc(C.techLabel)}).</div>
    <table class="an"><thead><tr><th class="l">Cód.</th><th class="l">Paquete</th><th>BAC</th><th class="l">Técnica</th><th>% plan</th><th>% avance</th><th>PV</th><th>EV</th><th>AC</th><th>CV</th><th>SV</th><th>CPI</th><th>SPI</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr class="tot" id="evTot"><td></td><td>Total</td><td class="num" data-t="bac"></td><td></td><td class="num" data-t="plannedPct"></td><td class="num" data-t="pct"></td><td class="num" data-t="pv"></td><td class="num" data-t="ev"></td><td class="num" data-t="ac"></td><td class="num" data-t="cv"></td><td class="num" data-t="sv"></td><td class="num" data-t="cpi"></td><td class="num" data-t="spi"></td></tr></tfoot></table></div>`;
	}
	function histCard() {
		return `<div class="card"><h3>Historial de cortes</h3><table class="an"><thead><tr><th class="l">Fecha</th><th>Día</th><th>PV</th><th>EV</th><th>AC</th><th>CPI</th><th>SPI</th><th></th></tr></thead><tbody>${data.reports.length ? data.reports.slice().reverse().map((r) => `<tr><td class="mono">${esc(r.date)}</td><td class="num">${days(r.offset)}</td><td class="num">${money(r.pv)}</td><td class="num">${money(r.ev)}</td><td class="num">${money(r.ac)}</td><td class="num">${idx(r.cpi)}</td><td class="num">${idx(r.spi)}</td><td><button class="btn" data-del="${esc(r.date)}" title="Quitar este corte" aria-label="Quitar el corte del ${esc(r.date)}">✕</button></td></tr>`).join("") : `<tr><td colspan="8" class="muted">Aún no hay cortes registrados. Usa <b>Registrar corte</b> en cada periodo del plan (Costos: frecuencia de reporte) para dibujar la curva S y ver la tendencia.</td></tr>`}</tbody></table></div>`;
	}
	function notesCard(C) {
		return `<div class="card"><h3>Cómo se calcula (y sus límites)</h3><ul class="small" style="margin:0 0 0 18px;line-height:1.6;color:var(--ink-1)">
    <li><b>BAC</b> = el costo del <b>trabajo</b> por paquete (Estimar los Costos o EDT). No incluye contingencia ni reserva de gestión: esas se comparan con el sobrecosto pronosticado (VAC).</li>
    <li><b>PV</b>: el costo de cada paquete se reparte <b>linealmente</b> entre el inicio más temprano y el fin más tardío de sus actividades en ${C.baseline ? "la <b>línea base " + esc(C.baseline.version) + "</b> del cronograma" + (C.frozen ? " (con el presupuesto por paquete, la fecha de inicio y el calendario <b>congelados</b> en ella)" : "") : "el cronograma vigente (fija la línea base en Cronograma/CPM para congelarlo)"}.</li>
    <li><b>EV</b> según la técnica de cada paquete: 0/100, 50/50, % físico o LOE (se gana con el tiempo: no mide desempeño). «Hitos ponderados» y «Apportioned effort» del plan se aplican como % físico.</li>
    <li><b>Cronograma ganado</b> (Earned Schedule): el SPI en dinero tiende a 1 al final aunque el proyecto termine tarde; ES/AT y la duración pronosticada lo evitan.</li>
    <li>Sin datos de recursos ni de compromisos: el costo real es el que reportas. El seguimiento por paquete no reemplaza el análisis de causa raíz.</li></ul></div>`;
	}
	function topHtml(C, R) {
		const st = evmStatus(R, C.thresholds), kp = (l, v, s, lv = null, extra = "") => `<div class="kpi ${lv || ""}"><div class="l">${l}</div><div class="v ${extra}">${v}</div><div class="s">${s}</div></div>`;
		const T = C.thresholds;
		const kpis = `<div class="kpis">
    ${kp("BAC (trabajo)", money(R.bac), "presupuesto del trabajo")}
    ${kp("PV — planificado", money(R.pv), R.percentPlanned.toFixed(1) + " % del BAC")}
    ${kp("EV — ganado", money(R.ev), R.percentComplete.toFixed(1) + " % del BAC")}
    ${kp("AC — costo real", money(R.ac), R.percentSpent.toFixed(1) + " % del BAC")}
    ${kp("CPI", idx(R.cpi), `umbral ≤ ${T.cpiWarn.toFixed(2)} alerta · ≤ ${T.cpiEsc.toFixed(2)} escala`, st.cpi)}
    ${kp("CV", R.ac > 0 ? signed(R.cv) : "—", `alerta ≤ ${signed(T.cvWarn)} · escala ≤ ${signed(T.cvEsc)}`, st.cv, cls(R.cv))}
    ${kp("SPI", idx(R.spi), `verde ≥ ${T.spiGreen.toFixed(2)} · rojo < ${T.spiRed.toFixed(2)}`, st.spi)}
    ${kp("SV", signed(R.sv), R.svPct === null ? "—" : (R.svPct > 0 ? "+" : "") + R.svPct.toFixed(1) + " % del PV · verde ≥ " + T.svGreenPct + " %", st.sv, cls(R.sv))}</div>`;
		const banner = st.cost || st.schedule ? `<div class="${st.cost === "rojo" || st.schedule === "rojo" ? "warn-box" : "note-box"}" style="margin:0 0 14px"><b>Estado:</b> costo ${lvlPill(st.cost)} · plazo ${lvlPill(st.schedule)}. ${st.cost === "verde" && st.schedule === "verde" ? "Dentro de tolerancia: continuar el monitoreo con la frecuencia del plan." : "Una variación fuera de umbral dispara el análisis de la causa, la actualización del pronóstico y una decisión de respuesta (acción correctiva, uso de la contingencia o solicitud de cambio): no obliga por sí sola a un cambio de línea base."}</div>` : "";
		const f = (x) => money(x);
		const contNote = C.contAvail !== null && R.vac.typical !== null && R.vac.typical < 0 ? `El sobrecosto pronosticado (típico) es <b>${money(-R.vac.typical)}</b>; la contingencia disponible es <b>${money(C.contAvail)}</b>: ${-R.vac.typical <= C.contAvail ? "la <b>cubre</b>" : "<b>NO alcanza</b>: hay que escalar (reserva de gestión o cambio de línea base)"}.` : C.contAvail !== null ? `Contingencia disponible: ${money(C.contAvail)}.` : "";
		const forecast = `<div class="card"><h3>Pronóstico de costo</h3><table class="an"><thead><tr><th class="l">Supuesto</th><th>EAC</th><th>ETC</th><th>VAC</th></tr></thead><tbody>
    <tr><td>Típico: la variación actual se repite (BAC / CPI)</td><td class="num">${f(R.eac.typical)}</td><td class="num">${f(R.etc.typical)}</td><td class="num ${R.vac.typical === null ? "" : cls(R.vac.typical)}">${R.vac.typical === null ? "—" : signed(R.vac.typical)}</td></tr>
    <tr><td>Atípico: fue un hecho aislado (AC + BAC − EV)</td><td class="num">${f(R.eac.atypical)}</td><td class="num">${f(R.etc.atypical)}</td><td class="num ${cls(R.vac.atypical)}">${signed(R.vac.atypical)}</td></tr>
    <tr><td>Combinado: costo y plazo (AC + (BAC − EV) / (CPI × SPI))</td><td class="num">${f(R.eac.combined)}</td><td class="num">${f(R.etc.combined)}</td><td class="num ${R.vac.combined === null ? "" : cls(R.vac.combined)}">${R.vac.combined === null ? "—" : signed(R.vac.combined)}</td></tr></tbody></table>
    <div class="muted small" style="margin-top:6px">TCPI para cerrar en el BAC: <b>${idx(R.tcpiBac)}</b> · para cerrar en el EAC típico: <b>${idx(R.tcpiEac)}</b> (un TCPI mayor que el CPI actual exige un desempeño que el proyecto no ha mostrado).</div>
    ${contNote ? `<div class="note-box">${contNote}${C.bacBudget !== null ? ` BAC de la línea base de costos (con contingencia y escalación): ${money(C.bacBudget)}.` : ""}</div>` : ""}</div>`;
		const finPlan = dateOf(C.duration), finFc = R.ieacT === null ? "" : dateOf(R.ieacT);
		const sched = `<div class="card"><h3>Cronograma ganado (Earned Schedule)</h3><table class="an"><tbody>
    <tr><td>Tiempo real transcurrido (AT)</td><td class="num">${days(R.at)}</td></tr>
    <tr><td>Cronograma ganado (ES): el día en que el PV igualaba al EV de hoy</td><td class="num">${days(R.es)}</td></tr>
    <tr><td>SV(t) = ES − AT</td><td class="num ${cls(R.svT)}">${R.svT > 0 ? "+" : ""}${days(R.svT)}</td></tr>
    <tr><td>SPI(t) = ES / AT</td><td class="num">${idx(R.spiT)}</td></tr>
    <tr><td>Duración planificada → pronosticada (PD / SPI(t))</td><td class="num">${days(C.duration)} → <b>${days(R.ieacT)}</b></td></tr>
    <tr><td>Fin planificado → pronosticado</td><td class="num">${esc(finPlan) || "—"} → <b>${esc(finFc) || "—"}</b></td></tr></tbody></table>
    <div class="muted small" style="margin-top:6px">El SV y el SPI en dinero engañan al final del proyecto (tienden a 0 y 1 aunque termine tarde); estos, en tiempo, no.</div></div>`;
		const warns = [];
		C.notes.forEach((n) => warns.push(n));
		if (!C.baseline) warns.push("No hay línea base del cronograma: el PV se calcula con el cronograma vigente y cambiará cuando este cambie. Fíjala en Cronograma/CPM → Salud y línea base.");
		if (C.newSinceBaseline) warns.push(C.newSinceBaseline + " actividad(es) se agregaron después de la línea base: no tienen fechas base y no se distribuyen en el PV.");
		if (R.unscheduled.length) warns.push(R.unscheduled.length + " paquete(s) con costo no tienen actividades en el cronograma y quedan fuera de los totales (" + R.unscheduled.slice(0, 4).map((p) => p.code).join(", ") + (R.unscheduled.length > 4 ? "…" : "") + ").");
		if (R.unreported) warns.push(R.unreported + " paquete(s) que ya debían estar en marcha no tienen avance reportado: se cuentan como 0 %.");
		if (R.loeShare > 10) warns.push("El " + R.loeShare.toFixed(0) + " % del BAC se mide por LOE (nivel de esfuerzo): su EV es igual a su PV y no mide desempeño; los índices se ven mejor de lo que son.");
		if (C.techApprox) warns.push("El plan de costos declara «" + C.techLabel + "»: este módulo no captura sus datos (pesos por hito o trabajo de referencia) y lo aplica como % físico.");
		if (R.spi !== null && R.pv > 0 && R.spi > 1.5) warns.push("El valor ganado supera con holgura al planificado (SPI " + R.spi.toFixed(2) + "): revisa que el avance reportado corresponda a esta fecha de corte y no a otra; los pronósticos no son confiables así.");
		if (R.ev > R.bac * 1.0001) warns.push("El valor ganado supera el BAC: el avance de algún paquete es mayor que 100 % o el costo del paquete cambió.");
		if (R.at <= 0) warns.push("La fecha de corte es anterior al inicio del proyecto (" + (C.startDate || "sin fecha de inicio") + "): no hay nada planificado todavía.");
		if (!C.startDate) warns.push("El proyecto no tiene fecha de inicio: sin ella no se puede ubicar la fecha de corte en el cronograma.");
		const wbox = warns.length ? `<div class="warn-box"><b>Revisa:</b><ul style="margin:4px 0 0 18px">${warns.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
		return kpis + banner + `<div class="grid2">${forecast}${sched}</div><div class="card"><h3>Curva S: planificado, ganado y costo real</h3>${curveSvg(C, R)}</div>` + wbox;
	}
	function curveSvg(C, R) {
		const W = 720, H = 280, l = 66, t = 16, D = Math.max(1, R.curve.length - 1);
		const reports = data.reports, maxY = Math.max(R.bac, R.ac, R.ev, ...reports.map((x) => Math.max(x.ac, x.ev, x.pv)), 1) * 1.05;
		const X = (d) => l + d / D * 636, Y = (v) => t + (1 - v / maxY) * 222;
		const pvPath = R.curve.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
		const series = (key, color) => {
			const pts = reports.map((x) => [x.offset, x[key]]).concat([[R.at, key === "ev" ? R.ev : R.ac]]).filter((p) => p[0] >= 0).sort((a, c) => a[0] - c[0]);
			return `<path d="${pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ")}" fill="none" stroke="${color}" stroke-width="2.2"/>` + pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.2" fill="${color}"/>`).join("");
		};
		const short = (v) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + " M" : Math.round(v / 1e3) + " k";
		const yt = [
			0,
			.25,
			.5,
			.75,
			1
		].map((q) => `<line x1="${l}" x2="702" y1="${Y(q * maxY).toFixed(1)}" y2="${Y(q * maxY).toFixed(1)}" stroke="#eef2f7"/><text x="60" y="${(Y(q * maxY) + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8992a3">${esc(short(q * maxY))}</text>`).join("");
		const step = D <= 30 ? 5 : D <= 120 ? 20 : 50, xt = [];
		for (let d = 0; d <= D; d += step) xt.push(`<text x="${X(d).toFixed(1)}" y="256" text-anchor="middle" font-size="9.5" fill="#8992a3">${d}</text>`);
		const cut = `<line x1="${X(Math.min(R.at, D)).toFixed(1)}" x2="${X(Math.min(R.at, D)).toFixed(1)}" y1="${t}" y2="238" stroke="#6c5ce7" stroke-dasharray="4 3"/><text x="${(X(Math.min(R.at, D)) + 4).toFixed(1)}" y="26" font-size="9.5" fill="#6c5ce7">corte</text>`;
		const bacLine = `<line x1="${l}" x2="702" y1="${Y(R.bac).toFixed(1)}" y2="${Y(R.bac).toFixed(1)}" stroke="#b6bfc9" stroke-dasharray="2 3"/><text x="702" y="${(Y(R.bac) - 4).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8992a3">BAC</text>`;
		return `<svg class="scurve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva S: valor planificado, valor ganado y costo real por día laborable" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--mono)">${yt}${xt.join("")}${bacLine}<path d="${pvPath}" fill="none" stroke="#00b6ec" stroke-width="2.4"/>${series("ev", "#00a88f")}${series("ac", "#ff5470")}${cut}<text x="384" y="274" text-anchor="middle" font-size="10" fill="#4d5768">día laborable →</text></svg>
    <div class="lg"><span><i style="background:#00b6ec"></i>PV planificado (${C.baseline ? "línea base " + esc(C.baseline.version) + (C.frozen ? " congelada" : " · presupuesto sin congelar") : "cronograma vigente"})</span><span><i style="background:#00a88f"></i>EV ganado</span><span><i style="background:#ff5470"></i>AC costo real</span></div>`;
	}
	function refresh() {
		const C = getCtx(), R = compute(), top = document.getElementById("evTop");
		if (top) top.innerHTML = topHtml(C, R);
		const st = evmStatus(R, C.thresholds);
		const rowEl = (id) => Array.from(document.querySelectorAll("tr.evrow")).find((e) => e.dataset.id === id);
		R.rows.forEach((r) => {
			const tr = rowEl(r.id);
			if (!tr) return;
			const set = (k, v, c = "") => {
				const td = tr.querySelector(`[data-k="${k}"]`);
				if (td) {
					td.textContent = v;
					td.className = "num " + c;
				}
			};
			set("plannedPct", r.plannedPct.toFixed(0) + " %");
			set("pv", money(r.pv));
			set("ev", money(r.ev));
			set("cv", r.ac > 0 ? signed(r.cv) : "—", r.ac > 0 ? cls(r.cv) : "");
			set("sv", r.pv > 0 || r.ev > 0 ? signed(r.sv) : "—", cls(r.sv));
			set("cpi", idx(r.cpi));
			set("spi", idx(r.spi));
		});
		const tot = document.getElementById("evTot");
		if (tot) {
			const setT = (k, v) => {
				const td = tot.querySelector(`[data-t="${k}"]`);
				if (td) td.textContent = v;
			};
			setT("bac", money(R.bac));
			setT("plannedPct", R.percentPlanned.toFixed(1) + " %");
			setT("pct", R.percentComplete.toFixed(1) + " %");
			setT("pv", money(R.pv));
			setT("ev", money(R.ev));
			setT("ac", money(R.ac));
			setT("cv", R.ac > 0 ? signed(R.cv) : "—");
			setT("sv", signed(R.sv));
			setT("cpi", idx(R.cpi) + (st.cpi && st.cpi !== "verde" ? " ⚠" : ""));
			setT("spi", idx(R.spi) + (st.spi && st.spi !== "verde" ? " ⚠" : ""));
		}
	}
	function onEdit(el) {
		const id = el.dataset.id, f = el.dataset.f;
		if (f === "technique") data.techniques[id] = el.value;
		else {
			const raw = el.value.trim(), v = raw === "" ? null : Number(raw), ok = v !== null && isFinite(v) ? v : null;
			(f === "percent" ? data.percent : data.ac)[id] = ok;
		}
		refresh();
		save();
	}
	function wireMain() {
		document.querySelectorAll("#mainArea [data-f]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => onEdit(el)));
		wireHist();
	}
	function wireHist() {
		document.querySelectorAll("#evHist [data-del]").forEach((b) => b.addEventListener("click", () => {
			data.reports = data.reports.filter((r) => r.date !== b.dataset.del);
			const h = document.getElementById("evHist");
			if (h) {
				h.innerHTML = histCard();
				wireHist();
			}
			refresh();
			save();
			setStatus("Corte quitado del historial.");
		}));
	}
	function registerCut() {
		const R = compute();
		if (!data.statusDate) {
			setStatus("Indica la fecha de corte.");
			return;
		}
		if (!(R.ev > 0) && !(R.ac > 0)) {
			setStatus("No hay avance ni costo real que registrar: reporta los paquetes antes de registrar el corte.");
			return;
		}
		const rep = {
			date: data.statusDate,
			offset: R.at,
			pv: R.pv,
			ev: R.ev,
			ac: R.ac,
			cpi: R.cpi,
			spi: R.spi
		};
		data.reports = data.reports.filter((r) => r.date !== rep.date).concat([rep]).sort((a, b) => a.date.localeCompare(b.date));
		const h = document.getElementById("evHist");
		if (h) {
			h.innerHTML = histCard();
			wireHist();
		}
		refresh();
		save();
		setStatus("Corte del " + rep.date + " registrado (CPI " + idx(R.cpi) + " · SPI " + idx(R.spi) + ").");
	}
	function pullFromWbs() {
		const G = window.GPI, C = getCtx();
		if (!C.connected || !G) {
			setStatus("Abre este módulo desde el Panel de Control para traer el avance de la EDT.");
			return;
		}
		const wbs = G.getModule("wbs");
		let n = 0;
		C.pkgs.forEach((p) => {
			const node = wbs && wbs.nodes[p.id], pc = node ? Number(node.percent) : NaN;
			if (isFinite(pc) && node && node.percent !== "" && node.percent !== void 0) {
				data.percent[p.id] = Math.max(0, Math.min(100, pc));
				n++;
			}
		});
		render();
		save();
		setStatus(n ? "Avance traído de la EDT para " + n + " paquete(s). Revisa el costo real y la técnica de cada uno." : "La EDT no tiene avance cargado en los paquetes de trabajo.");
	}
	function loadSample() {
		const C = getCtx();
		data = blankData();
		data.statusDate = EVM_SAMPLE_STATUS_DATE;
		C.pkgs.forEach((p) => {
			if (EVM_SAMPLE_PERCENT[p.code] !== void 0) data.percent[p.id] = EVM_SAMPLE_PERCENT[p.code];
			if (EVM_SAMPLE_AC[p.code] !== void 0) data.ac[p.id] = EVM_SAMPLE_AC[p.code];
			if (EVM_SAMPLE_TECHNIQUES[p.code]) data.techniques[p.id] = EVM_SAMPLE_TECHNIQUES[p.code];
		});
		data.reports = normalizeReports(EVM_SAMPLE_REPORTS);
	}
	function exportCsv() {
		getCtx();
		const R = compute(), q = (v) => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`;
		const lines = [[
			"Codigo",
			"Paquete",
			"BAC",
			"Tecnica",
			"Pct_plan",
			"Pct_avance",
			"PV",
			"EV",
			"AC",
			"CV",
			"SV",
			"CPI",
			"SPI"
		].join(",")];
		R.rows.forEach((r) => lines.push([
			r.code,
			r.name,
			Math.round(r.bac),
			TECHNIQUE_LABEL[r.technique],
			r.plannedPct.toFixed(1),
			r.percent === null ? "" : r.percent,
			Math.round(r.pv),
			Math.round(r.ev),
			Math.round(r.ac),
			Math.round(r.cv),
			Math.round(r.sv),
			r.cpi === null ? "" : r.cpi.toFixed(3),
			r.spi === null ? "" : r.spi.toFixed(3)
		].map(q).join(",")));
		lines.push([
			"",
			"TOTAL corte " + data.statusDate,
			Math.round(R.bac),
			"",
			R.percentPlanned.toFixed(1),
			R.percentComplete.toFixed(1),
			Math.round(R.pv),
			Math.round(R.ev),
			Math.round(R.ac),
			Math.round(R.cv),
			Math.round(R.sv),
			R.cpi === null ? "" : R.cpi.toFixed(3),
			R.spi === null ? "" : R.spi.toFixed(3)
		].map(q).join(","));
		lines.push([
			"",
			"EAC tipico / ETC / VAC",
			R.eac.typical === null ? "" : Math.round(R.eac.typical),
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			R.vac.typical === null ? "" : Math.round(R.vac.typical),
			"",
			""
		].map(q).join(","));
		const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "valor_ganado_" + data.statusDate + ".csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Seguimiento exportado como CSV.");
	}
	function showConfirm(message, title) {
		return new Promise((resolve) => {
			const overlay = $("modalOverlay"), ok = $("modalConfirmBtn"), cancel = $("modalCancelBtn");
			$("modalTitle").textContent = title;
			$("modalMessage").textContent = message;
			const done = (r) => {
				overlay.classList.remove("open");
				ok.onclick = null;
				cancel.onclick = null;
				overlay.onclick = null;
				document.removeEventListener("keydown", key);
				resolve(r);
			};
			const key = (e) => {
				if (e.key === "Escape") done(false);
				else if (e.key === "Enter") done(true);
			};
			ok.onclick = () => done(true);
			cancel.onclick = () => done(false);
			overlay.onclick = (e) => {
				if (e.target === overlay) done(false);
			};
			document.addEventListener("keydown", key);
			overlay.classList.add("open");
			ok.focus();
		});
	}
	function wireToolbar() {
		$("statusDate").addEventListener("change", () => {
			data.statusDate = $("statusDate").value;
			refresh();
			save();
		});
		$("btnRegister").addEventListener("click", registerCut);
		$("btnPull").addEventListener("click", pullFromWbs);
		$("btnExportCsv").addEventListener("click", exportCsv);
		$("btnPrint").addEventListener("click", () => window.print());
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará el seguimiento actual con el caso de ejemplo DISTRIB+ S.A. (avance y costo real al 2026-10-30). ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (!ok) return;
				ctxDirty = true;
				loadSample();
				render();
				save();
				setStatus("Caso de ejemplo cargado.");
			});
		});
		$("btnReset").addEventListener("click", () => {
			showConfirm("Esto borrará el avance, los costos reales y el historial de cortes. ¿Continuar?", "Nuevo seguimiento").then((ok) => {
				if (ok) {
					data = blankData();
					render();
					save();
					setStatus("Seguimiento nuevo iniciado.");
				}
			});
		});
	}
	var saveFn = () => false;
	function save() {
		saveFn();
	}
	(function gpiBridge() {
		if (typeof window.GPI === "undefined" || !window.GPI.available()) return;
		const proj = window.GPI.active();
		const titleEl = $("projectTitle"), courseEl = $("courseTitle");
		let loadedProjectId = null, session = null, projectStale = false, timer;
		function markProjectStale() {
			if (projectStale) return;
			projectStale = true;
			setStatus("⚠ El proyecto activo cambió en otra pestaña: esta pestaña ya no puede guardar aquí.");
			const b = document.getElementById("banner");
			if (b) {
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar el seguimiento aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			statusDate: data.statusDate,
			percent: data.percent,
			ac: data.ac,
			techniques: data.techniques,
			reports: data.reports
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("evm");
			if (p.meta) {
				if (p.meta.name) titleEl.value = p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			ctxDirty = true;
			const mod = p.modules && p.modules.evm;
			if (mod) {
				data = normalizeData(mod);
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				data = blankData();
				render();
				setStatus("Proyecto sin seguimiento todavía. Reporta el avance y el costo real de los paquetes, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "evm", "El seguimiento de valor ganado", payload(), {
				name: titleEl.value,
				course: courseEl.value
			}, session, {
				setStatus,
				onStale: markProjectStale
			});
			session = r.session;
			return r.ok;
		}
		saveFn = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(push, 800);
			return true;
		};
		if (proj) pull();
		window.addEventListener("beforeunload", push);
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) push();
			else {
				ctxDirty = true;
				render();
			}
		});
		window.GPI.onChange(() => {
			ctxDirty = true;
			const p = window.GPI.active();
			if (!p || !p.meta) return;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
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
		bar.innerHTML = "<span class=\"gpi-dot\"></span><span>Panel: <b>" + esc(name || "—") + "</b></span><button class=\"gpi-btn\" id=\"gpiSyncBtn\">☁ Sincronizar</button><a class=\"gpi-btn\" href=\"Panel_Control.html\">⌂ Panel</a>";
		document.body.appendChild(bar);
		bar.querySelector("#gpiSyncBtn").addEventListener("click", () => {
			const ok = pushFn(), b = bar.querySelector("#gpiSyncBtn"), t = b.textContent;
			b.textContent = ok ? "✓ Sincronizado" : "⚠ Sin sincronizar";
			setTimeout(() => {
				b.textContent = t;
			}, 1400);
		});
	}
	wireToolbar();
	if (!(window.GPI && window.GPI.available() && window.GPI.active())) {
		ctxDirty = true;
		loadSample();
		render();
	} else render();
	//#endregion
})();
