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
	//#region src/shared/local-date.ts
	function todayLocalISO(d = /* @__PURE__ */ new Date()) {
		const p = (n) => (n < 10 ? "0" : "") + n;
		return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
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
	var str$2 = (v) => v === null || v === void 0 ? "" : String(v);
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
				id: str$2(q.id),
				code: str$2(q.code),
				name: str$2(q.name),
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
				version: str$2(q.version),
				date: str$2(q.date),
				reason: str$2(q.reason),
				approver: str$2(q.approver),
				sponsorAuth: !!q.sponsorAuth,
				projectDuration: fin(q.projectDuration),
				finishDate: str$2(q.finishDate),
				deviationPct: q.deviationPct === null || q.deviationPct === void 0 ? null : fin(q.deviationPct)
			};
		});
		return {
			frozen: x.frozen !== false,
			version: str$2(x.version) || "LB-1",
			date: str$2(x.date),
			snapshot: {
				projectDuration: fin(s.projectDuration),
				startDate: str$2(s.startDate),
				finishDate: str$2(s.finishDate),
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
				id: str$2(q.id),
				code: str$2(q.code),
				name: str$2(q.name),
				bac: fin(q.bac),
				source: str$2(q.source),
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
				holidays: (Array.isArray(cal.holidays) ? cal.holidays : []).map(str$2)
			},
			packages,
			total: fin(x.total, packages.reduce((s, p) => s + p.bac, 0))
		};
	}
	//#endregion
	//#region src/shared/schedule-sample.ts
	var SAMPLE_START_DATE = "2026-07-06";
	var SAMPLE_CALENDAR = {
		workDays: [
			"Lun",
			"Mar",
			"Mié",
			"Jue",
			"Vie"
		],
		hoursPerDay: 8,
		holidays: [
			{
				date: "2026-07-28",
				name: "Fiestas Patrias"
			},
			{
				date: "2026-07-29",
				name: "Fiestas Patrias"
			},
			{
				date: "2026-08-30",
				name: "Santa Rosa de Lima"
			}
		]
	};
	function sampleSchedulePlan() {
		return { calendar: {
			workDays: SAMPLE_CALENDAR.workDays.slice(),
			hoursPerDay: SAMPLE_CALENDAR.hoursPerDay,
			holidays: SAMPLE_CALENDAR.holidays.map((h) => ({ ...h }))
		} };
	}
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
	var str$1 = (v) => v === null || v === void 0 ? "" : String(v);
	var arrNum = (v, def) => Array.isArray(v) && v.length === def.length && v.every((x) => toNum(x) !== null) ? v.map((x) => toNum(x)) : def.slice();
	function normalizePlan(p) {
		const o = p && typeof p === "object" ? p : {};
		const cats = Array.isArray(o.categories) ? o.categories.map(str$1).map((s) => s.trim()).filter(Boolean) : [];
		return {
			probPct: arrNum(o.probPct, DEFAULT_PLAN.probPct),
			costBandsPct: arrNum(o.costBandsPct, DEFAULT_PLAN.costBandsPct),
			timeBandsDays: arrNum(o.timeBandsDays, DEFAULT_PLAN.timeBandsDays),
			scopeDescriptors: Array.isArray(o.scopeDescriptors) && o.scopeDescriptors.length === 5 ? o.scopeDescriptors.map(str$1) : DEFAULT_PLAN.scopeDescriptors.slice(),
			thresholdMedium: toNum(o.thresholdMedium) ?? DEFAULT_PLAN.thresholdMedium,
			thresholdHigh: toNum(o.thresholdHigh) ?? DEFAULT_PLAN.thresholdHigh,
			reviewDays: toNum(o.reviewDays) ?? DEFAULT_PLAN.reviewDays,
			categories: cats.length ? cats : DEFAULT_PLAN.categories.slice(),
			methodology: str$1(o.methodology),
			reservePolicy: str$1(o.reservePolicy),
			roles: str$1(o.roles),
			reserves: normalizeReserves(o.reserves)
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
		const id = str$1(x.id) || fallbackId;
		return {
			id,
			code: str$1(x.code) || id,
			title: str$1(x.title),
			cause: str$1(x.cause),
			event: str$1(x.event),
			effect: str$1(x.effect),
			type,
			category: str$1(x.category),
			wbsIds: Array.isArray(x.wbsIds) ? x.wbsIds.map(str$1).filter(Boolean) : [],
			actIds: Array.isArray(x.actIds) ? x.actIds.map(str$1).filter(Boolean) : [],
			owner: str$1(x.owner),
			proximity: PROXIMITY.indexOf(str$1(x.proximity)) >= 0 ? str$1(x.proximity) : "",
			identifiedOn: str$1(x.identifiedOn),
			reviewedOn: str$1(x.reviewedOn),
			status,
			prob: toLevel(x.prob),
			impCost: toLevel(x.impCost),
			impTime: toLevel(x.impTime),
			impScope: toLevel(x.impScope),
			probPct: toNum(x.probPct),
			costImpact: range(x.costImpact),
			timeImpact: range(x.timeImpact),
			strategy: str$1(x.strategy),
			response: str$1(x.response),
			trigger: str$1(x.trigger),
			responseOwner: str$1(x.responseOwner),
			responseCost: toNum(x.responseCost),
			secondary: str$1(x.secondary),
			resProb: toLevel(x.resProb),
			resImpCost: toLevel(x.resImpCost),
			resImpTime: toLevel(x.resImpTime),
			resImpScope: toLevel(x.resImpScope),
			resProbPct: toNum(x.resProbPct),
			resCostImpact: range(x.resCostImpact),
			resTimeImpact: range(x.resTimeImpact),
			materializedOn: str$1(x.materializedOn),
			actualCost: toNum(x.actualCost),
			actualDelay: toNum(x.actualDelay),
			notes: str$1(x.notes)
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
			materializedOn: "2026-08-31",
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
	//#region src/shared/change-control.ts
	var AREAS = [
		"scope",
		"schedule",
		"cost",
		"risk",
		"quality",
		"resources"
	];
	var AREA_LABEL = {
		scope: "Alcance",
		schedule: "Cronograma",
		cost: "Costo",
		risk: "Riesgo",
		quality: "Calidad",
		resources: "Recursos"
	};
	var AREA_STATE_LABEL = {
		sin_evaluar: "Sin evaluar",
		sin_impacto: "Sin impacto",
		con_impacto: "Con impacto"
	};
	var CR_STATUSES = [
		"Pendiente",
		"Aprobada",
		"Rechazada",
		"Diferida",
		"Implementada"
	];
	var ORIGINS = [
		"Solicitud del cliente",
		"Riesgo materializado",
		"Variación de desempeño (EVM)",
		"Requisito nuevo o modificado",
		"Trabajo imprevisto dentro del alcance",
		"Defecto o no conformidad",
		"Normativa o regulación",
		"Otro"
	];
	var CR_TYPES = [
		"Acción correctiva",
		"Acción preventiva",
		"Reparación de defecto",
		"Actualización de la línea base o del plan"
	];
	var FUNDS = [
		"Contingencia",
		"Reserva de gestión",
		"Financiamiento adicional"
	];
	var str = (v) => v === null || v === void 0 ? "" : String(v);
	var numOrNull = (v) => {
		if (v === null || v === void 0 || v === "") return null;
		const n = Number(v);
		return isFinite(n) ? n : null;
	};
	var strs = (v) => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
	function normalizeCr(o, fallbackId) {
		const x = o && typeof o === "object" ? o : {}, im = x.impact && typeof x.impact === "object" ? x.impact : {};
		const impact = {};
		AREAS.forEach((a) => {
			const q = im[a] && typeof im[a] === "object" ? im[a] : {};
			impact[a] = {
				state: ["sin_impacto", "con_impacto"].indexOf(str(q.state)) >= 0 ? q.state : "sin_evaluar",
				note: str(q.note)
			};
		});
		const id = str(x.id) || fallbackId;
		return {
			id,
			code: str(x.code) || id,
			title: str(x.title),
			description: str(x.description),
			requester: str(x.requester),
			requestedOn: str(x.requestedOn),
			origin: str(x.origin),
			type: str(x.type),
			impact,
			wbsIds: strs(x.wbsIds),
			actIds: strs(x.actIds),
			daysDelta: numOrNull(x.daysDelta),
			costDelta: numOrNull(x.costDelta),
			fund: str(x.fund),
			orderIds: strs(x.orderIds),
			modIds: strs(x.modIds),
			riskIds: strs(x.riskIds),
			scheduleBaseline: str(x.scheduleBaseline),
			status: CR_STATUSES.indexOf(x.status) >= 0 ? x.status : "Pendiente",
			decidedOn: str(x.decidedOn),
			approver: str(x.approver),
			authLevel: str(x.authLevel),
			sponsorAuth: !!x.sponsorAuth,
			rationale: str(x.rationale),
			implementedOn: str(x.implementedOn),
			notes: str(x.notes)
		};
	}
	var blankCr = (id, code) => normalizeCr({
		id,
		code
	}, id);
	function nextCode(crs) {
		let max = 0;
		crs.forEach((c) => {
			const m = /(\d+)\s*$/.exec(c.code);
			if (m) max = Math.max(max, Number(m[1]));
		});
		return "CR-" + String(max + 1).padStart(3, "0");
	}
	var MOD_STATUS_LABEL = {
		propuesto: "Propuesta",
		enEvaluacion: "En evaluación",
		aprobado: "Aprobada",
		rechazado: "Rechazada",
		implementado: "Implementada"
	};
	var sigOf = (o) => JSON.stringify([
		o.text,
		o.type,
		o.priority,
		o.status,
		o.acceptanceCriteria,
		o.verificationMethod,
		o.normativeBasis,
		Array.isArray(o.wbsNodeIds) ? o.wbsNodeIds.map(String).sort() : [],
		Array.isArray(o.sourceRanIds) ? o.sourceRanIds.map(String).sort() : []
	]);
	function modFacts(req) {
		const r = req && typeof req === "object" ? req : {}, items = (Array.isArray(r.items) ? r.items : []).filter((x) => x && typeof x === "object");
		const bl = r.baseline && typeof r.baseline === "object" ? r.baseline : {}, snap = /* @__PURE__ */ new Map();
		(Array.isArray(bl.snapshot) ? bl.snapshot : []).forEach((s) => {
			if (s && typeof s === "object") {
				const o = s;
				snap.set(String(o.id), sigOf(o));
			}
		});
		return (Array.isArray(r.changes) ? r.changes : []).filter((x) => x && typeof x === "object").map((x) => {
			const m = x, id = String(m.id || ""), aff = items.filter((it) => String(it.changeId || "") === id);
			return {
				id,
				code: String(m.code || m.id || ""),
				title: String(m.summary || m.title || ""),
				status: String(m.status || "propuesto"),
				approver: String(m.approver || ""),
				ccrRef: String(m.ccrRef || ""),
				evidence: {
					baselineFrozen: !!bl.frozen,
					baselineVersion: String(bl.version || ""),
					baselineDate: String(bl.date || ""),
					affected: aff.length,
					incorporated: aff.filter((it) => snap.get(String(it.id)) === sigOf(it)).length
				}
			};
		});
	}
	var isCont = (fund) => fund === "Contingencia";
	var EPS = 1e-6;
	function summarize(cr, f) {
		const delay = f.projectDelay ? f.projectDelay(cr) : null, reasons = [];
		const scope = cr.impact.scope.state === "con_impacto";
		const schedule = delay !== null && Math.abs(delay) > .05;
		const cost = cr.impact.cost.state === "con_impacto" && !!cr.costDelta && Math.abs(cr.costDelta) > EPS && !isCont(cr.fund);
		if (scope) reasons.push("cambia el alcance: se registra como modificación de alcance (MOD) en Recopilar Requisitos");
		if (schedule) reasons.push("mueve el fin del proyecto " + (delay > 0 ? "+" : "") + Math.round(delay * 10) / 10 + " d: exige una nueva versión de la línea base del cronograma");
		if (cost) reasons.push("se financia con " + cr.fund.toLowerCase() + ": la orden debe incorporarse a la línea base de costos");
		else if (cr.impact.cost.state === "con_impacto" && cr.costDelta && isCont(cr.fund)) reasons.push("se financia con contingencia: dentro de la línea base de costos, sin cambiarla (pero sí consume contingencia)");
		return {
			projectDelay: delay,
			baselines: {
				scope,
				schedule,
				cost
			},
			reasons
		};
	}
	function assessmentGaps(cr) {
		const out = [];
		AREAS.forEach((a) => {
			const im = cr.impact[a];
			if (im.state === "sin_evaluar") out.push("falta evaluar el impacto en " + AREA_LABEL[a].toLowerCase());
			else if (im.state === "con_impacto" && !im.note.trim() && a !== "cost" && a !== "schedule" && a !== "risk") out.push("describe el impacto en " + AREA_LABEL[a].toLowerCase());
		});
		if (cr.impact.cost.state === "con_impacto" && (!cr.costDelta || Math.abs(cr.costDelta) < EPS)) out.push("cuantifica el Δ costo (monto distinto de cero)");
		if (cr.impact.cost.state === "con_impacto" && cr.costDelta && !cr.fund) out.push("indica la fuente de fondos del Δ costo");
		if (cr.impact.schedule.state === "con_impacto" && (cr.daysDelta === null || !cr.wbsIds.length && !cr.actIds.length)) out.push("cuantifica el efecto en el plazo: paquetes o actividades afectadas y los días");
		if (cr.impact.risk.state === "con_impacto" && !cr.riskIds.length && !cr.impact.risk.note.trim()) out.push("indica los riesgos afectados o los nuevos riesgos");
		return out;
	}
	function requiredAuthorityOf(cr, f) {
		const s = summarize(cr, f);
		let level = "pm", why = "sin cambio de línea base ni de costo";
		const up = (l, w) => {
			const rank = {
				pm: 1,
				ccb: 2,
				sponsor: 3
			};
			if (rank[l] > rank[level]) {
				level = l;
				why = w;
			}
		};
		if (s.baselines.scope || s.baselines.schedule || s.baselines.cost) up("ccb", "cambia una línea base (la aprueba el CCB)");
		if (cr.impact.cost.state === "con_impacto" && cr.costDelta) {
			const fundKind = cr.fund === "Contingencia" ? "cont" : cr.fund === "Financiamiento adicional" ? "extra" : "mgmt";
			const need = requiredLevel(f.policy, fundKind, Math.abs(cr.costDelta));
			if (need) up(need, fundKind === "cont" ? "monto con cargo a contingencia según la política de reservas" : "reserva de gestión o fondos adicionales: los autoriza el sponsor");
		}
		return {
			level,
			why
		};
	}
	function approvalProblems(cr, f) {
		const p = [];
		if (!cr.title.trim()) p.push("falta el título de la solicitud");
		if (!cr.requester.trim()) p.push("indica quién solicita el cambio");
		if (!cr.origin) p.push("indica el origen del cambio");
		assessmentGaps(cr).forEach((g) => p.push(g));
		if (!cr.approver.trim()) p.push("registra quién decide (CCB, sponsor…)");
		if (!cr.rationale.trim()) p.push("documenta el fundamento de la decisión");
		const req = requiredAuthorityOf(cr, f), have = authLevelOf({
			authLevel: cr.authLevel,
			sponsorAuth: cr.sponsorAuth,
			approver: cr.approver
		});
		if (!levelCovers(have, req.level)) p.push("esta solicitud la autoriza el " + AUTH_LABEL[req.level] + " (" + req.why + ")" + (have ? "; la decisión registrada es del " + AUTH_LABEL[have] : "; indica el nivel de autoridad con que se decide"));
		return p;
	}
	function implementationProblems(cr, f) {
		const p = [], s = summarize(cr, f);
		if (s.baselines.scope) {
			const linked = cr.modIds.map((id) => f.mods.find((m) => m.id === id)).filter((m) => !!m);
			if (cr.modIds.length > linked.length) p.push("vincula una modificación de alcance que ya no existe en Recopilar Requisitos");
			if (!linked.length) {
				if (!cr.modIds.length) p.push("registra la modificación de alcance en Recopilar Requisitos y vincúlala (MOD)");
			}
			linked.forEach((m) => {
				const st = MOD_STATUS_LABEL[m.status] || m.status;
				if (m.status === "rechazado") p.push("la modificación " + m.code + " está «Rechazada»: no puede respaldar un cambio de alcance aprobado (corrige el vínculo o el estado de la MOD)");
				else if (m.status !== "aprobado" && m.status !== "implementado") p.push("la modificación " + m.code + " está «" + st + "»: apruébala en Recopilar Requisitos antes de implementar el cambio");
				else if (!m.approver.trim()) p.push("la modificación " + m.code + " no registra quién la aprobó");
				const ccr = m.ccrRef.trim().toLowerCase();
				if (!ccr) p.push("la modificación " + m.code + " no cita esta solicitud: escribe «" + cr.code + "» en su campo de solicitud de cambio (CCR) en Recopilar Requisitos");
				else if (ccr !== cr.code.trim().toLowerCase()) p.push("la modificación " + m.code + " responde a la solicitud «" + m.ccrRef.trim() + "», no a " + cr.code + ": no corresponde a este cambio");
				const e = m.evidence;
				if (!e.baselineFrozen) p.push("la línea base de requisitos no está congelada: el cambio de alcance no tiene una línea base a la que incorporarse");
				else if (!e.affected) p.push("la modificación " + m.code + " no afecta ningún requisito: no hay evidencia de que el alcance cambió (actívala y edita la matriz de requisitos)");
				else if (e.incorporated < e.affected) p.push("solo " + e.incorporated + " de " + e.affected + " requisito(s) de " + m.code + " están tal cual en la línea base de requisitos v" + e.baselineVersion + ": congela una nueva versión de la línea base que incorpore la modificación");
				else if (cr.decidedOn && e.baselineDate && e.baselineDate < cr.decidedOn) p.push("la línea base de requisitos v" + e.baselineVersion + " (" + e.baselineDate + ") es anterior a la decisión (" + cr.decidedOn + "): no puede incorporar este cambio");
			});
		}
		if (cr.impact.cost.state === "con_impacto" && cr.costDelta) {
			const os = cr.orderIds.map((id) => f.orders.find((o) => o.id === id)).filter((o) => !!o);
			if (!os.length) p.push("registra la orden de cambio en Costos y vincúlala (OC)");
			else {
				const total = os.reduce((sum, o) => sum + o.cost, 0);
				if (Math.abs(total - cr.costDelta) > .5) p.push("las órdenes vinculadas suman " + Math.round(total) + " y el Δ costo de la solicitud es " + Math.round(cr.costDelta));
				os.forEach((o) => {
					if (o.status !== "Aprobada") p.push("la orden " + o.id + " está «" + o.status + "»: aprueba la orden en Costos");
					else if (!isCont(o.fund) && !o.baselined) p.push("la orden " + o.id + " usa " + o.fund.toLowerCase() + " y aún no está incorporada a la línea base de costos");
				});
			}
		}
		if (s.baselines.schedule) {
			if (!cr.scheduleBaseline) p.push("fija en Cronograma/CPM la nueva versión de la línea base e indica cuál (LB-n)");
			else if (!f.scheduleLog.some((l) => l.version === cr.scheduleBaseline)) p.push("la versión " + cr.scheduleBaseline + " no existe en la línea base del cronograma del proyecto");
			else {
				const v = f.scheduleLog.find((l) => l.version === cr.scheduleBaseline);
				if (cr.decidedOn && v.date && v.date < cr.decidedOn) p.push("la versión " + cr.scheduleBaseline + " (" + v.date + ") es anterior a la decisión (" + cr.decidedOn + "): no puede incorporar este cambio");
			}
		}
		return p;
	}
	var daysBetween = (a, b) => {
		const x = Date.parse(a + "T12:00:00Z"), y = Date.parse(b + "T12:00:00Z");
		return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : null;
	};
	function crFindings(cr, f, today) {
		const out = [], F = (code, severity, text) => {
			out.push({
				code,
				severity,
				text
			});
		};
		if (cr.status === "Pendiente") {
			const age = cr.requestedOn ? daysBetween(cr.requestedOn, today) : null;
			if (age !== null && age > 14) F("C1", "aviso", "Lleva " + age + " días sin decisión del CCB: un cambio pendiente deja el proyecto con un plan que quizá ya no es el vigente.");
			const gaps = assessmentGaps(cr);
			if (gaps.length) F("C2", "info", "Evaluación incompleta: " + gaps.slice(0, 3).join("; ") + (gaps.length > 3 ? "…" : "") + ".");
		}
		if (cr.status === "Aprobada") {
			const ip = implementationProblems(cr, f), age = cr.decidedOn ? daysBetween(cr.decidedOn, today) : null;
			if (ip.length) F("C3", age !== null && age > 14 ? "aviso" : "info", "Aprobada pero aún no implementada" + (age !== null ? " (hace " + age + " d)" : "") + ": " + ip[0] + (ip.length > 1 ? " (+" + (ip.length - 1) + " más)" : "") + ".");
		}
		if ((cr.status === "Aprobada" || cr.status === "Implementada") && cr.orderIds.length) {
			if (cr.orderIds.map((id) => f.orders.find((o) => o.id === id)).some((o) => !o)) F("C4", "aviso", "Vincula una orden de cambio que ya no existe en Costos.");
		}
		if (cr.origin === "Riesgo materializado" && !cr.riskIds.length) F("C5", "aviso", "El origen es un riesgo materializado pero no indica cuál: vincula el riesgo del registro.");
		if (cr.impact.schedule.state === "sin_impacto" && f.projectDelay) {
			const d = f.projectDelay(cr);
			if (d !== null && Math.abs(d) > .05) F("C6", "aviso", "Declara «sin impacto» en el plazo pero el CPM mueve el fin del proyecto " + Math.round(d * 10) / 10 + " d.");
		}
		return out;
	}
	function portfolio(crs, f, today) {
		const byStatus = {
			Pendiente: 0,
			Aprobada: 0,
			Rechazada: 0,
			Diferida: 0,
			Implementada: 0
		};
		let approvedCost = 0, approvedDays = 0, pendingBaseline = 0, oldest = null;
		crs.forEach((c) => {
			byStatus[c.status]++;
			if (c.status === "Aprobada" || c.status === "Implementada") {
				approvedCost += c.impact.cost.state === "con_impacto" ? c.costDelta || 0 : 0;
				const d = f.projectDelay ? f.projectDelay(c) : null;
				approvedDays += d || 0;
			}
			if (c.status === "Aprobada" && implementationProblems(c, f).length) pendingBaseline++;
			if (c.status === "Pendiente" && c.requestedOn) {
				const a = daysBetween(c.requestedOn, today);
				if (a !== null && (oldest === null || a > oldest)) oldest = a;
			}
		});
		return {
			total: crs.length,
			byStatus,
			approvedCost,
			approvedDays,
			pendingBaseline,
			oldestPendingDays: oldest
		};
	}
	//#endregion
	//#region src/shared/change-sample.ts
	var im = (state, note = "") => ({
		state,
		note
	});
	var SAMPLE_COST_ORDERS = [
		{
			id: "OC-001",
			cost: 18e4,
			fund: "Contingencia",
			status: "Aprobada",
			baselined: null
		},
		{
			id: "OC-002",
			cost: 24e4,
			fund: "Financiamiento adicional",
			status: "Pendiente",
			baselined: null
		},
		{
			id: "OC-003",
			cost: 9e4,
			fund: "Reserva de gestión",
			status: "Pendiente",
			baselined: null
		}
	];
	var SAMPLE_CRS = [
		{
			code: "CR-001",
			title: "Refuerzo de cimentación por hallazgo geotécnico",
			description: "El estudio de suelos ampliado detecta estratos de baja capacidad portante: se refuerza la cimentación (riesgo R-03 materializado).",
			requester: "Jefe de Ingeniería",
			requestedOn: "2026-08-31",
			origin: "Riesgo materializado",
			type: "Acción correctiva",
			wbs: ["4.2"],
			riskCodes: ["R-03"],
			impact: {
				scope: im("sin_impacto", "El refuerzo mantiene el entregable: la cimentación cumple lo especificado con otra solución."),
				schedule: im("con_impacto"),
				cost: im("con_impacto"),
				risk: im("con_impacto"),
				quality: im("con_impacto", "Ensayos adicionales de compactación y de resistencia del concreto."),
				resources: im("sin_impacto", "Misma cuadrilla; más horas.")
			},
			daysDelta: 8,
			costDelta: 18e4,
			fund: "Contingencia",
			orderIds: ["OC-001"],
			status: "Aprobada",
			decidedOn: "2026-09-02",
			approver: "CCB",
			authLevel: "ccb",
			rationale: "Riesgo identificado que ocurrió; se atiende con la contingencia (dentro de la línea base). Lo autoriza el CCB por su monto y porque mueve el fin del proyecto."
		},
		{
			code: "CR-002",
			title: "Ampliación de sala eléctrica solicitada por el cliente",
			description: "El cliente pide ampliar la sala eléctrica con dos tableros adicionales.",
			requester: "DISTRIB+ (cliente)",
			requestedOn: "2026-09-01",
			origin: "Solicitud del cliente",
			type: "Actualización de la línea base o del plan",
			wbs: ["4.5"],
			riskCodes: [],
			impact: {
				scope: im("con_impacto", "Amplía el alcance de Instalaciones MEP con dos tableros y su cableado."),
				schedule: im("con_impacto"),
				cost: im("con_impacto"),
				risk: im("sin_evaluar"),
				quality: im("sin_evaluar"),
				resources: im("con_impacto", "Una cuadrilla eléctrica adicional durante dos semanas.")
			},
			daysDelta: 10,
			costDelta: 24e4,
			fund: "Financiamiento adicional",
			orderIds: ["OC-002"],
			status: "Pendiente"
		},
		{
			code: "CR-003",
			title: "Demolición de losa existente no identificada en el levantamiento",
			description: "Aparece una losa antigua bajo la plataforma que no figuraba en el levantamiento: hay que demolerla antes de excavar.",
			requester: "Residente de Obra",
			requestedOn: "2026-09-08",
			origin: "Trabajo imprevisto dentro del alcance",
			type: "Acción correctiva",
			wbs: ["4.1"],
			riskCodes: [],
			impact: {
				scope: im("sin_impacto", "Pertenece al alcance ya aprobado (movimiento de tierras): no es un cambio de alcance."),
				schedule: im("con_impacto"),
				cost: im("con_impacto"),
				risk: im("sin_impacto", "No estaba identificado en el registro de riesgos."),
				quality: im("sin_impacto", "Sin efecto en la calidad."),
				resources: im("con_impacto", "Equipo de demolición por 4 días.")
			},
			daysDelta: 5,
			costDelta: 9e4,
			fund: "Reserva de gestión",
			orderIds: ["OC-003"],
			status: "Pendiente"
		}
	];
	function buildSampleCrs(resolveWbs, resolveRisk) {
		return SAMPLE_CRS.map((s, i) => normalizeCr({
			...s,
			id: "cr" + (i + 1),
			wbsIds: s.wbs.map(resolveWbs).filter(Boolean),
			riskIds: s.riskCodes.map(resolveRisk).filter(Boolean)
		}, "cr" + (i + 1)));
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
	//#region src/modules/changes/main.ts
	var $ = (id) => document.getElementById(id);
	var todayISO = () => todayLocalISO();
	function setStatus(msg) {
		$("statusLeft").textContent = msg;
	}
	var rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
	var CUR = {
		USD: "$",
		PEN: "S/",
		EUR: "€"
	};
	var ctx = null;
	var ctxDirty = true;
	function getCtx() {
		if (ctxDirty || !ctx) {
			ctx = buildCtx();
			ctxDirty = false;
		}
		return ctx;
	}
	function buildCtx() {
		const G = window.GPI, connected = !!(G && G.available() && G.active());
		const c = {
			connected,
			sym: "$",
			leaves: [],
			acts: [],
			eng: null,
			orders: [],
			mods: [],
			risks: [],
			scheduleLog: [],
			policy: null
		};
		if (!G || !G.util) return c;
		try {
			const m = connected ? null : sampleScheduleModules();
			const wbs = connected ? G.getModule("wbs") : m.wbs;
			c.leaves = G.util.wbsLeaves(wbs).map((l) => ({
				id: l.id,
				code: l.code,
				name: l.name
			}));
			const net = connected ? G.util.activeScheduleNetwork() : G.util.scheduleNetwork(wbs, m.activities, null, m.schedule, sampleSchedulePlan(), SAMPLE_START_DATE);
			if (net) {
				c.acts = net.nodes.filter((n) => !n.isMilestone).map((n) => ({
					id: n.id,
					code: n.code,
					name: n.name,
					leafId: n.leafId
				}));
				c.eng = makeEngine(net, G.util.cpm);
			}
			if (connected) {
				const meta = G.meta();
				c.sym = CUR[meta && meta.currency || ""] || "$";
				const cost = rec(G.getModule("cost"));
				c.orders = (Array.isArray(cost.changeOrders) ? cost.changeOrders.map(rec) : []).map((o) => ({
					id: String(o.id || ""),
					cost: Number(o.cost) || 0,
					fund: String(o.fund || ""),
					status: String(o.status || ""),
					baselined: o.baselined ? String(o.baselined) : null
				}));
				c.mods = modFacts(G.getModule("requirements"));
				const rk = G.getModule("risks");
				c.risks = (rk && Array.isArray(rk.risks) ? rk.risks : []).map((r, i) => normalizeRisk(r, "rk" + (i + 1))).map((r) => ({
					id: r.id,
					code: r.code,
					title: r.title
				}));
				c.policy = normalizePlan(rk && rk.plan).reserves;
				const sched = G.getModule("schedule"), bl = normalizeBaseline(sched ? sched.baseline : null);
				c.scheduleLog = bl ? bl.log.map((e) => ({
					version: e.version,
					date: e.date
				})) : [];
			} else {
				c.orders = SAMPLE_COST_ORDERS.map((o) => ({ ...o }));
				c.risks = buildSampleRisks((code) => "w-" + code).map((r) => ({
					id: r.id,
					code: r.code,
					title: r.title
				}));
				c.policy = SAMPLE_PLAN.reserves;
			}
		} catch (e) {}
		return c;
	}
	function delayOf(cr) {
		const C = getCtx();
		if (!C.eng || cr.daysDelta === null || !cr.wbsIds.length && !cr.actIds.length) return null;
		const t = resolveTargets(cr, C.eng);
		if (!t.targets.length) return null;
		const d = {};
		t.targets.forEach((x) => {
			d[x.id] = cr.daysDelta;
		});
		const dur = C.eng.duration(d);
		return dur === null ? null : dur - C.eng.base;
	}
	function factsOf() {
		const C = getCtx();
		return {
			orders: C.orders,
			mods: C.mods,
			risks: C.risks,
			scheduleLog: C.scheduleLog,
			policy: C.policy,
			projectDelay: delayOf
		};
	}
	var money = (n) => n == null || !isFinite(n) ? "—" : (n < 0 ? "−" : "") + getCtx().sym + " " + Math.abs(Math.round(n)).toLocaleString("es-PE");
	var requests = [];
	var idCounter = 1;
	var selectedId = null;
	var expanded = /* @__PURE__ */ new Set();
	var byId = (id) => requests.find((r) => r.id === id);
	var newId = () => "cr" + idCounter++;
	function loadSample() {
		const C = getCtx();
		requests = buildSampleCrs((code) => {
			const l = C.leaves.find((x) => x.code === code);
			return l ? l.id : "";
		}, (code) => {
			const r = C.risks.find((x) => x.code === code);
			return r ? r.id : "";
		});
		idCounter = requests.length + 1;
		selectedId = requests[0] ? requests[0].id : null;
		expanded = /* @__PURE__ */ new Set();
	}
	function missingSampleOrders() {
		const C = getCtx();
		if (!C.connected) return [];
		const have = new Set(C.orders.map((o) => o.id));
		return SAMPLE_COST_ORDERS.map((o) => o.id).filter((id) => !have.has(id));
	}
	var STATUS_CLASS = (s) => "pill st-" + s;
	function areaChips(cr) {
		return AREAS.map((a) => `<span class="ar ${cr.impact[a].state}" title="${esc(AREA_LABEL[a] + ": " + AREA_STATE_LABEL[cr.impact[a].state])}">${esc(AREA_LABEL[a].slice(0, 3).toUpperCase())}</span>`).join("");
	}
	function rowHtml(cr) {
		const f = factsOf(), s = summarize(cr, f), fs = crFindings(cr, f, todayISO()), worst = fs.some((x) => x.severity === "aviso") ? "aviso" : "";
		return `<td class="mono">${esc(cr.code)}</td><td><b>${esc(cr.title || "(sin título)")}</b><div class="muted small">${esc(cr.origin || "sin origen")} · ${esc(cr.requester || "sin solicitante")}${cr.requestedOn ? " · " + esc(cr.requestedOn) : ""}</div></td>
    <td>${areaChips(cr)}</td><td class="num">${cr.impact.cost.state === "con_impacto" && cr.costDelta ? money(cr.costDelta) : "—"}</td>
    <td class="num">${s.projectDelay === null ? "—" : (s.projectDelay > 0 ? "+" : "") + fmtDays(Math.round(s.projectDelay * 10) / 10)}</td>
    <td><span class="${STATUS_CLASS(cr.status)}">${esc(cr.status)}</span></td><td class="c">${worst ? `<span class="sv aviso" title="${fs.length} hallazgo(s)">${fs.length}</span>` : fs.length ? `<span class="sv info">${fs.length}</span>` : ""}</td>`;
	}
	function head() {
		return `<div class="view-head"><h2>Solicitudes de cambio</h2>
    <p>Todo cambio a las líneas base o al plan pasa por aquí. Cada solicitud se <b>evalúa a la vez</b> en alcance, cronograma, costo, riesgo, calidad y recursos; se <b>decide</b> con la autoridad que corresponde (CCB, sponsor o la política de reservas); y solo se marca <b>implementada</b> cuando cada línea base afectada está actualizada: la modificación de alcance en Recopilar Requisitos, la orden de cambio en Costos y la nueva versión LB-n del cronograma. <b>Haz clic en una solicitud</b> para evaluarla.</p></div>`;
	}
	function kpisHtml() {
		const p = portfolio(requests, factsOf(), todayISO()), k = (l, v, s, c = "") => `<div class="kpi ${c}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
		return `<div class="kpis">${k("Pendientes", String(p.byStatus.Pendiente), p.oldestPendingDays !== null ? "la más antigua: " + p.oldestPendingDays + " d" : "esperan decisión del CCB", p.byStatus.Pendiente ? "warn" : "")}
    ${k("Aprobadas sin implementar", String(p.pendingBaseline), "líneas base por actualizar", p.pendingBaseline ? "bad" : "ok")}
    ${k("Implementadas", String(p.byStatus.Implementada), "líneas base al día", "ok")}
    ${k("Rechazadas / diferidas", p.byStatus.Rechazada + " / " + p.byStatus.Diferida, "documentadas")}
    ${k("Δ costo aprobado", money(p.approvedCost), "aprobadas e implementadas")}
    ${k("Efecto aprobado en el plazo", (p.approvedDays > 0 ? "+" : "") + fmtDays(Math.round(p.approvedDays * 10) / 10), "sobre el fin del proyecto (CPM)")}</div>`;
	}
	function render() {
		const main = $("mainArea");
		if (!requests.length) {
			main.innerHTML = head() + `<div class="empty-hint">Aún no hay solicitudes de cambio. Usa <b>+ Solicitud de cambio</b> para registrar la primera, o <b>Cargar ejemplo</b> para ver el caso DISTRIB+ S.A.</div>`;
			$("btnDelete").disabled = true;
			return;
		}
		const rows = requests.map((r) => {
			const open = expanded.has(r.id);
			return `<tr class="cr-row${r.id === selectedId ? " sel" : ""}" data-id="${esc(r.id)}" tabindex="0" role="button" aria-expanded="${open}">${rowHtml(r)}</tr>
      <tr class="cr-det" data-id="${esc(r.id)}" style="display:${open ? "table-row" : "none"}"><td colspan="7"><div id="det-${esc(r.id)}">${open ? detailHtml(r) : ""}</div></td></tr>`;
		}).join("");
		main.innerHTML = head() + `<div id="kpiBox">${kpisHtml()}</div><div class="card"><table class="an"><thead><tr><th>Código</th><th>Solicitud</th><th>Áreas evaluadas</th><th class="num">Δ costo</th><th class="num">Fin del proyecto</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
		wireMain();
		$("btnDelete").disabled = !selectedId;
	}
	var fld = (label, control, cls = "", hint = "") => `<div class="fd ${cls}"><label>${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
	var inp = (c, f, v, type = "text", extra = "") => `<input class="ri" ${type === "number" ? "type=\"number\" step=\"any\"" : type === "date" ? "type=\"date\"" : "type=\"text\""} data-id="${esc(c.id)}" data-f="${f}" value="${esc(v === null || v === void 0 ? "" : v)}" ${extra}>`;
	var txt = (c, f, v, rows = 2, ph = "") => `<textarea class="ri" rows="${rows}" data-id="${esc(c.id)}" data-f="${f}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
	var sel = (c, f, opts, cur) => `<select class="ri" data-id="${esc(c.id)}" data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
	var msel = (c, f, opts, cur, size = 5) => `<select class="ri" multiple size="${size}" data-id="${esc(c.id)}" data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur.indexOf(v) >= 0 ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
	function areaRow(cr, a, extra) {
		const im = cr.impact[a];
		return `<div class="area"><div class="an-h">${esc(AREA_LABEL[a])}</div><div style="display:grid;grid-template-columns:180px 1fr;gap:8px">
    <select class="ri" data-id="${esc(cr.id)}" data-f="impact" data-a="${a}" data-k="state" aria-label="Impacto en ${esc(AREA_LABEL[a].toLowerCase())}">${[
			"sin_evaluar",
			"sin_impacto",
			"con_impacto"
		].map((s) => `<option value="${s}" ${im.state === s ? "selected" : ""}>${AREA_STATE_LABEL[s]}</option>`).join("")}</select>
    <input class="ri" type="text" data-id="${esc(cr.id)}" data-f="impact" data-a="${a}" data-k="note" value="${esc(im.note)}" placeholder="${a === "cost" || a === "schedule" ? "Nota (opcional; se cuantifica abajo)" : "Describe el impacto o por qué no lo hay"}"></div>${extra ? `<div class="extra">${extra}</div>` : ""}</div>`;
	}
	function detailHtml(cr) {
		const C = getCtx(), f = factsOf();
		const leafOpts = C.leaves.map((l) => [l.id, l.code + " " + l.name]);
		const actOpts = C.acts.filter((n) => !cr.wbsIds.length || n.leafId !== null && cr.wbsIds.indexOf(n.leafId) >= 0).map((n) => {
			const row = C.eng ? C.eng.rows[n.id] : null;
			return [n.id, n.code + " " + n.name + (row ? row.tf <= 1e-6 ? " · crítica" : " · holgura " + fmtDays(row.tf) : "")];
		});
		const ordOpts = C.orders.map((o) => [o.id, o.id + " · " + money(o.cost) + " · " + o.fund + " · " + o.status]);
		const modOpts = C.mods.map((m) => [m.id, m.code + " " + m.title]);
		const rkOpts = C.risks.map((r) => [r.id, r.code + " " + r.title]);
		const sched = areaRow(cr, "schedule", `${fld("Paquetes afectados", msel(cr, "wbsIds", leafOpts, cr.wbsIds))}${fld("Actividades (opcional)", msel(cr, "actIds", actOpts, cr.actIds), "", "Sin elegir: se aplica una vez a la de menor holgura del paquete.")}${fld("Días que suma (o resta) a esas actividades", inp(cr, "daysDelta", cr.daysDelta, "number"))}<div class="fd"><label>Efecto en el fin del proyecto</label><div id="eff-${esc(cr.id)}" class="hint">${effectHtml(cr)}</div></div>`);
		const cost = areaRow(cr, "cost", `${fld("Δ costo (" + esc(C.sym) + ")", inp(cr, "costDelta", cr.costDelta, "number"))}${fld("Fuente de fondos", sel(cr, "fund", [["", "— Elige —"], ...FUNDS.map((x) => [x, x])], cr.fund))}${fld("Órdenes de cambio de Costos", msel(cr, "orderIds", ordOpts, cr.orderIds, 4), "wide", C.orders.length ? "Vincula la orden que financia este cambio (se comprueba su monto, su aprobación y su línea base)." : "Este proyecto aún no tiene órdenes de cambio en Costos.")}`);
		const scope = areaRow(cr, "scope", `${fld("Modificaciones de alcance (Recopilar Requisitos)", msel(cr, "modIds", modOpts, cr.modIds, 3), "wide", C.mods.length ? "" : "Aún no hay modificaciones de alcance registradas en Recopilar Requisitos.")}`);
		const risk = areaRow(cr, "risk", `${fld("Riesgos afectados o que origina", msel(cr, "riskIds", rkOpts, cr.riskIds, 4), "wide")}`);
		const req = requiredAuthorityOf(cr, f);
		const lbOpts = [["", "— ninguna todavía —"], ...C.scheduleLog.map((l) => [l.version, l.version + " (" + l.date + ")"])];
		return `<div class="det-grid">
    <div class="sec">1 · Identificación</div>
    ${fld("Código", inp(cr, "code", cr.code))}${fld("Título", inp(cr, "title", cr.title), "two")}
    ${fld("Descripción del cambio", txt(cr, "description", cr.description, 2, "¿Qué se pide cambiar y por qué?"), "wide")}
    ${fld("Solicitante", inp(cr, "requester", cr.requester))}${fld("Fecha de solicitud", inp(cr, "requestedOn", cr.requestedOn, "date"))}
    ${fld("Origen", sel(cr, "origin", [["", "— Elige —"], ...ORIGINS.map((x) => [x, x])], cr.origin))}${fld("Tipo de solicitud", sel(cr, "type", [["", "— Elige —"], ...CR_TYPES.map((x) => [x, x])], cr.type))}
    <div class="sec">2 · Evaluación integrada del impacto (las seis áreas)</div>
    ${scope}${sched}${cost}${risk}${areaRow(cr, "quality", "")}${areaRow(cr, "resources", "")}
    <div class="sec">3 · Decisión del CCB</div>
    <div class="fd wide"><div id="calc-${esc(cr.id)}">${calcHtml(cr)}</div></div>
    ${fld("Estado", sel(cr, "status", CR_STATUSES.map((s) => [s, s]), cr.status), "", "Aprobar exige la evaluación completa y la autoridad requerida; Implementada, las líneas base actualizadas.")}
    ${fld("Fecha de la decisión", inp(cr, "decidedOn", cr.decidedOn, "date"))}${fld("Quién decide (CCB, sponsor…)", inp(cr, "approver", cr.approver))}
    ${fld("Nivel de autoridad", sel(cr, "authLevel", [["", "— Elige —"], ...AUTH_LEVELS.map((l) => [l, AUTH_LABEL[l]])], cr.authLevel), "", "Exigido: <b>" + esc(AUTH_LABEL[req.level]) + "</b> (" + esc(req.why) + ").")}
    ${fld("Fundamento de la decisión", txt(cr, "rationale", cr.rationale, 2, "¿Por qué se aprueba, rechaza o difiere?"), "two")}
    <div class="sec">4 · Actualización de las líneas base y trazabilidad</div>
    ${fld("Versión de la línea base del cronograma que la incorporó", sel(cr, "scheduleBaseline", lbOpts, cr.scheduleBaseline), "", C.scheduleLog.length ? "" : "Aún no hay línea base del cronograma: fíjala en Cronograma/CPM → Salud y línea base.")}
    ${fld("Notas", txt(cr, "notes", cr.notes, 2), "two")}
  </div>`;
	}
	function effectHtml(cr) {
		const C = getCtx();
		if (!C.eng) return "El proyecto no tiene una red de actividades: no se puede calcular el efecto en el plazo.";
		if (cr.daysDelta === null || !cr.wbsIds.length && !cr.actIds.length) return "Elige los paquetes o actividades afectados y los días.";
		const t = resolveTargets(cr, C.eng), d = delayOf(cr);
		if (!t.targets.length || d === null) return "Las actividades elegidas no existen en el cronograma.";
		return "Sobre " + t.targets.map((x) => esc(x.code) + (x.tf <= 1e-6 ? " (crítica)" : " (holgura " + fmtDays(x.tf) + ")")).join(", ") + ": <b>" + (Math.abs(d) < .05 ? "la holgura lo absorbe: el fin del proyecto no se mueve" : (d > 0 ? "+" : "") + fmtDays(Math.round(d * 10) / 10) + " el fin del proyecto") + "</b>.";
	}
	function calcHtml(cr) {
		const f = factsOf(), s = summarize(cr, f), req = requiredAuthorityOf(cr, f), fs = crFindings(cr, f, todayISO());
		const list = (t, xs) => xs.length ? `<div class="${t === "bad" ? "msg" : "warn-box"}" style="margin:8px 0"><b>${t === "bad" ? "No se puede aprobar todavía:" : "Para implementarla falta:"}</b><ul style="margin:4px 0 0 18px">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
		const pol = f.policy && (f.policy.pmLimit !== null || f.policy.ccbLimit !== null) ? `Política de reservas: ${esc(tiersText(f.policy, (n) => money(n)))}.` : "";
		const bl = [
			s.baselines.scope ? "alcance (MOD)" : "",
			s.baselines.schedule ? "cronograma (LB-n)" : "",
			s.baselines.cost ? "costos (LB-n)" : ""
		].filter(Boolean);
		return `<div class="note-box" style="margin:0 0 8px"><b>Líneas base que deben cambiar:</b> ${bl.length ? esc(bl.join(" · ")) : "ninguna"}. ${s.reasons.length ? "<br>" + s.reasons.map((r) => esc(r.charAt(0).toUpperCase() + r.slice(1))).join("<br>") : ""}<br><b>Autoridad requerida:</b> ${esc(AUTH_LABEL[req.level])} (${esc(req.why)}). ${pol}</div>
    ${cr.status === "Pendiente" ? list("bad", approvalProblems(cr, f)) : ""}${cr.status === "Aprobada" ? list("warn", implementationProblems(cr, f)) : ""}
    ${fs.length ? `<ul class="finds">${fs.map((x) => `<li><span class="sv ${x.severity}">${esc(x.code)}</span>${esc(x.text)}</li>`).join("")}</ul>` : ""}`;
	}
	var rowEl = (id) => Array.from(document.querySelectorAll("tr.cr-row")).find((e) => e.dataset.id === id) || null;
	function refreshCr(cr) {
		const tr = rowEl(cr.id);
		if (tr) tr.innerHTML = rowHtml(cr);
		const calc = document.getElementById("calc-" + cr.id);
		if (calc) calc.innerHTML = calcHtml(cr);
		const eff = document.getElementById("eff-" + cr.id);
		if (eff) eff.innerHTML = effectHtml(cr);
		const k = document.getElementById("kpiBox");
		if (k) k.innerHTML = kpisHtml();
	}
	function redrawDetail(cr) {
		const box = document.getElementById("det-" + cr.id);
		if (box) {
			box.innerHTML = detailHtml(cr);
			bindDetail(box);
		}
		refreshCr(cr);
	}
	function onField(el) {
		const cr = byId(el.dataset.id);
		if (!cr) return;
		const f = el.dataset.f, rc = cr;
		if (f === "impact") {
			const a = el.dataset.a, k = el.dataset.k;
			cr.impact[a][k] = el.value;
			if (k === "state") {
				redrawDetail(cr);
				save();
				return;
			}
		} else if (f === "wbsIds" || f === "actIds" || f === "orderIds" || f === "modIds" || f === "riskIds") {
			rc[f] = Array.from(el.selectedOptions).map((o) => o.value);
			if (f === "wbsIds" && cr.wbsIds.length) cr.actIds = cr.actIds.filter((id) => {
				const n = getCtx().acts.find((x) => x.id === id);
				return !n || n.leafId !== null && cr.wbsIds.indexOf(n.leafId) >= 0;
			});
			if (f === "wbsIds") {
				redrawDetail(cr);
				save();
				return;
			}
		} else if (f === "daysDelta" || f === "costDelta") {
			const raw = el.value.trim(), n = raw === "" ? null : Number(raw);
			rc[f] = n !== null && isFinite(n) ? n : null;
		} else if (f === "status") {
			changeStatus(cr, el.value);
			return;
		} else rc[f] = el.value;
		refreshCr(cr);
		save();
	}
	function changeStatus(cr, to) {
		const f = factsOf();
		let problems = [];
		if (to === "Aprobada") problems = approvalProblems(cr, f);
		else if (to === "Implementada") problems = cr.status !== "Aprobada" ? ["primero debe estar Aprobada"] : implementationProblems(cr, f);
		else if (to === "Rechazada" || to === "Diferida") {
			if (!cr.approver.trim()) problems.push("registra quién decide");
			if (!cr.rationale.trim()) problems.push("documenta el motivo en el fundamento de la decisión");
		}
		if (problems.length) {
			setStatus("No se puede pasar " + cr.code + " a «" + to + "»: " + problems.join("; ") + ".");
			redrawDetail(cr);
			showProblems(cr, "No se puede pasar a «" + to + "»", problems);
			return;
		}
		cr.status = to;
		if (to === "Aprobada" || to === "Rechazada" || to === "Diferida") {
			if (!cr.decidedOn) cr.decidedOn = todayISO();
		}
		if (to === "Implementada") cr.implementedOn = todayISO();
		else if (to !== "Aprobada") cr.implementedOn = "";
		redrawDetail(cr);
		save();
		setStatus(cr.code + " → " + to + ".");
	}
	function showProblems(cr, title, problems) {
		const calc = document.getElementById("calc-" + cr.id);
		if (!calc) return;
		calc.insertAdjacentHTML("afterbegin", `<div class="msg"><b>${esc(title)}:</b><ul style="margin:4px 0 0 18px">${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`);
	}
	function bindDetail(root) {
		root.querySelectorAll(".ri").forEach((el) => el.addEventListener(el.tagName === "SELECT" || el.type === "date" ? "change" : "input", () => onField(el)));
	}
	function wireMain() {
		document.querySelectorAll("tr.cr-row").forEach((tr) => {
			const toggle = () => {
				const id = tr.dataset.id;
				if (expanded.has(id)) expanded.delete(id);
				else expanded.add(id);
				selectedId = id;
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
		document.querySelectorAll("[id^='det-']").forEach((box) => {
			if (box.innerHTML.trim()) bindDetail(box);
		});
	}
	function addRequest() {
		const c = blankCr(newId(), nextCode(requests));
		c.requestedOn = todayISO();
		requests.push(c);
		selectedId = c.id;
		expanded.add(c.id);
		render();
		save();
		const row = rowEl(c.id);
		if (row) row.scrollIntoView({ block: "center" });
		setStatus(c.code + " creada: evalúa su impacto en las seis áreas.");
	}
	function deleteSelected() {
		const c = byId(selectedId || void 0);
		if (!c) return;
		showConfirm("¿Eliminar la solicitud " + c.code + " «" + (c.title || "sin título") + "»? Esta acción no se puede deshacer.", "Confirmar acción", "Eliminar").then((ok) => {
			if (!ok) return;
			const i = requests.findIndex((x) => x.id === c.id);
			if (i > -1) {
				expanded.delete(c.id);
				requests.splice(i, 1);
			}
			selectedId = requests.length ? requests[Math.max(0, i - 1)].id : null;
			render();
			save();
			setStatus("Solicitud eliminada.");
		});
	}
	function exportCsv() {
		factsOf();
		const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`;
		const lines = [[
			"Codigo",
			"Titulo",
			"Origen",
			"Tipo",
			"Solicitante",
			"Fecha",
			"Estado",
			"Decision",
			"Decide",
			"Nivel",
			"Delta_Costo",
			"Fondo",
			"Ordenes",
			"Dias",
			"Efecto_Fin_Dias",
			"MOD",
			"Riesgos",
			"LB_Cronograma",
			...AREAS.map((a) => "Impacto_" + a)
		].join(",")];
		requests.forEach((c) => {
			const d = delayOf(c);
			lines.push([
				c.code,
				c.title,
				c.origin,
				c.type,
				c.requester,
				c.requestedOn,
				c.status,
				c.decidedOn,
				c.approver,
				c.authLevel,
				c.costDelta ?? "",
				c.fund,
				c.orderIds.join(" "),
				c.daysDelta ?? "",
				d === null ? "" : Math.round(d * 10) / 10,
				c.modIds.join(" "),
				c.riskIds.join(" "),
				c.scheduleBaseline,
				...AREAS.map((a) => c.impact[a].state)
			].map(q).join(","));
		});
		const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = "solicitudes_de_cambio.csv";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus("Solicitudes exportadas como CSV.");
	}
	function showConfirm(message, title, okText = "Aceptar") {
		return new Promise((resolve) => {
			const overlay = $("modalOverlay"), ok = $("modalConfirmBtn"), cancel = $("modalCancelBtn");
			$("modalTitle").textContent = title;
			$("modalMessage").textContent = message;
			ok.textContent = okText;
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
		$("btnAdd").addEventListener("click", addRequest);
		$("btnDelete").addEventListener("click", deleteSelected);
		$("btnExportCsv").addEventListener("click", exportCsv);
		$("btnPrint").addEventListener("click", () => window.print());
		$("btnSample").addEventListener("click", () => {
			showConfirm("Esto reemplazará las solicitudes actuales con el caso de ejemplo DISTRIB+ S.A. ¿Continuar?", "Cargar ejemplo").then((ok) => {
				if (ok) {
					ctxDirty = true;
					loadSample();
					render();
					save();
					const falta = missingSampleOrders();
					setStatus("Caso de ejemplo cargado." + (falta.length ? " Costos de este proyecto aún no tiene las órdenes " + falta.join(", ") + ": las solicitudes las referencian; regístralas en Estimar/Gestionar Costos para que se verifiquen." : ""));
				}
			});
		});
		$("btnReset").addEventListener("click", () => {
			showConfirm("Esto borrará todas las solicitudes de cambio. ¿Continuar?", "Nuevo registro").then((ok) => {
				if (ok) {
					requests = [];
					idCounter = 1;
					selectedId = null;
					expanded = /* @__PURE__ */ new Set();
					render();
					save();
					setStatus("Registro nuevo iniciado.");
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
				b.innerHTML = "<b>El proyecto activo cambió en otra pestaña.</b> Esta pestaña quedó desactualizada y ya no puede guardar las solicitudes de cambio aquí: recárgala, o vuelve a activar el proyecto original desde el Panel de Control.";
				b.classList.add("show");
			}
		}
		const payload = () => ({
			requests,
			idCounter
		});
		function pull() {
			const p = window.GPI.active();
			if (!p) return;
			loadedProjectId = window.GPI.activeId();
			session = window.GPI.openSession("changes");
			if (p.meta) {
				if (p.meta.name) titleEl.value = p.meta.name;
				if (p.meta.course) courseEl.value = p.meta.course;
			}
			ctxDirty = true;
			const mod = p.modules && p.modules.changes;
			if (mod && Array.isArray(mod.requests)) {
				requests = mod.requests.map((o, i) => normalizeCr(o, "cr" + (i + 1)));
				idCounter = Number(mod.idCounter) || requests.length + 1;
				selectedId = requests.length ? requests[0].id : null;
				expanded = /* @__PURE__ */ new Set();
				window.GPI.rebaseSession(session, payload());
				render();
				setStatus("Datos cargados desde el Panel de Control.");
			} else {
				requests = [];
				idCounter = 1;
				selectedId = null;
				expanded = /* @__PURE__ */ new Set();
				render();
				setStatus("Proyecto sin solicitudes de cambio todavía. Registra la primera, o usa Cargar ejemplo para explorar el caso DISTRIB+.");
			}
		}
		function push() {
			if (!window.GPI.active()) return false;
			if (loadedProjectId != null && window.GPI.activeId() !== loadedProjectId) {
				markProjectStale();
				return false;
			}
			const r = pushWithSession(window.GPI, "changes", "El control de cambios", payload(), {
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
		installGpiBadge({
			name,
			onSync: pushFn
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
