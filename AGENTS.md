# AGENTS.md

Este archivo es solo un **puntero**: la guía operativa completa vive en
[CLAUDE.md](CLAUDE.md) y los patrones y particularidades de cada módulo,
en [ARCHITECTURE.md](ARCHITECTURE.md). No dupliques aquí su contenido: se
desfasa (una copia anterior de este archivo quedó con conteos de módulos y
reglas obsoletos). Si cambia una regla, edítala **solo** en `CLAUDE.md`.

## Lo esencial (las reglas que no pueden fallar)

Suite educativa PMBOK de módulos HTML + un núcleo de datos compartido
(`gpi-core.js`) sobre `localStorage`. Sitio 100 % estático (GitHub Pages o
doble clic por `file://`). TypeScript bajo `src/` compilado con Vite.

1. **Todo build es IIFE**, nunca módulo ES (`file://` bloquea `type="module"`).
2. **Los artefactos compilados de la raíz se commitean** y nunca se editan a
   mano: tras editar un `.ts`, corre `npm run build:all` (falla si algo quedó
   desfasado).
3. **No se rompe el esquema de `localStorage["gpi_db"]`**: hay `.json` de
   alumnos que deben seguir abriendo.
4. **Un módulo sin datos arranca en blanco**; el caso DISTRIB+ solo se carga
   con «Cargar ejemplo», y todos los ejemplos son **un solo proyecto
   coherente** (se amplía, no se inventa otro).
5. Sin frameworks de componentes: vanilla + TypeScript.
6. Antes de comitear: `npm run build:all && npm run typecheck && npm run lint
   && npm test && npm run verify:deploy` (y `npm run test:e2e` si tocas
   comportamiento visible).

Todo lo demás (comandos, mapa de archivos, cómo agregar un módulo, trampas ya
encontradas, política de tests y de push) está en [CLAUDE.md](CLAUDE.md).
