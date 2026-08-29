# Workflow Studio – Product Requirements Document

_Last updated: 2026-06 (Python Edition migration)_

## Original problem statement
Workflow Studio is a local-first visual workflow designer, documentation platform and
interactive presentation tool (draw.io-style guided builder). Originally built as a React
web preview; in June 2026 the user requested a FULL migration to a **completely
Python-based stack** (no npm/Node): FastAPI serves both API and UI. User also requested
it must "run locally" and have a "draw.io type" layout.

## Current architecture (Python Edition)
```
Cloud preview:
  backend/server.py   -> FastAPI API on :8001 (/api/*), storage = MongoDB (MONGO_URL)
  frontend/server.py  -> FastAPI UI server on :3000 (Jinja2 index.html + /static assets)
  (supervisor 'frontend' program: package.json start script launches uvicorn - no npm packages)

Local run (single command):
  python run_local.py -> one FastAPI process on :8000 serving UI + API, storage = SQLite
                         (workflow_studio.db, auto-created). Deps: fastapi, uvicorn, jinja2,
                         python-dotenv only.

Storage selection: WORKFLOW_STORAGE env (sqlite|mongo); defaults to mongo when MONGO_URL set.
Both backends implement the same interface (MongoStorage / SQLiteStorage in backend/server.py).
```

## Frontend (vanilla JS, zero build)
- `templates/index.html` – full app markup (dashboard + editor), CDN: ELK.js 0.9.3, Quill 2.0.3, Google Fonts.
- `static/js/nodes.js` – 10 node type definitions (shape, size, color, inline SVG icon, maxIn/maxOut).
- `static/js/state.js` – graph state, snapshot undo/redo, debounced auto-save, connection rules
  (decision auto Yes/No labels, maxOut enforcement, duplicate/self-loop rejection), validation.
- `static/js/canvas.js` – custom SVG/div canvas: pan, wheel zoom, snap-to-grid node drag,
  hover ports (4 directions), drag-to-connect, port-click guided picker, bezier edges with
  labels, fit view, center-on-node, play-mode CSS classes.
- `static/js/ui.js` – palette (HTML5 dnd + click), node picker, Quill doc panel (dblclick),
  topbar, dashboard, create modal, export/import .wflow, toasts, theme.
- `static/js/play.js` – play mode (next/prev/restart/exit, Yes/No branch choices, dimming, animated edge).
- `static/js/layout.js` – ELK layered auto-layout (DOWN/RIGHT) + port direction reassignment.

## API endpoints (all /api prefixed)
health, projects CRUD (GET list w/ nodeCount, POST, GET/{id}, PUT/{id}, DELETE/{id}),
PUT /projects/{id}/graph, POST /projects/import.

## What's implemented (2026-06)
- Full React→Python migration; React source deleted; npm dependency removed.
- All previous features rebuilt: 10 node types, guided plus/port builder, decision Yes/No,
  Quill rich docs, Play Mode, ELK auto-layout, undo/redo, auto-save, validation warnings,
  dark/light theme, export/import .wflow, dashboard CRUD.
- Dual storage: MongoDB (cloud) + SQLite (local) behind one interface.
- `run_local.py` single-command local runner + README instructions.
- Tested: backend 13/13 pytest, frontend 15/15 flows (test_reports/iteration_2.json).

## Prioritized backlog
### P1
- Attachment upload on nodes (would need object storage in cloud / filesystem locally).
- Accessibility pass (keyboard-only workflow creation).
- Large-graph performance (only re-render changed nodes instead of full rebuild).
- Minimap / outline panel (draw.io parity).
### P2
- AI assistant (generate workflow from prompt) — deferred by user earlier.
- Execution engine, plugins/templates gallery.
- Optional MS SQL Server storage backend (same interface as SQLiteStorage).

## Notes / decisions
- Electron packaging and MS SQL Server explicitly out of scope in this sandbox (user approved web preview earlier; local SQLite now covers the "local-first" requirement).
- Design system: "Modern Architectural / Crisp Neumorphism" per /app/design_guidelines.json (hard shadows, Outfit/Inter/JetBrains Mono, light-first + obsidian dark).
- Minor known non-issues: FastAPI on_event('shutdown') deprecation warning; guided picker adds node without edge (with toast) when source maxOut reached.
