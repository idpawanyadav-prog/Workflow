# Workflow Studio (Python Edition)

A visual workflow designer, documentation platform and interactive presentation tool —
**100% Python**. FastAPI serves both the API and the UI (Jinja2 + vanilla JavaScript).
No Node.js, no npm, no build step. ELK.js (auto-layout) and Quill (rich text) load from CDN.

## Run locally (one command)

```bash
pip install fastapi "uvicorn[standard]" jinja2 python-dotenv
python run_local.py
```

Open http://localhost:8000 — projects are stored in a local **SQLite** database
(`workflow_studio.db`), created automatically. No MongoDB required.

## Cloud / preview mode

In the hosted preview the same codebase runs as two processes:

- `backend/server.py` — API on port 8001 (storage: **MongoDB**, configured via `backend/.env`)
- `frontend/server.py` — UI server on port 3000 (Jinja2 templates + static assets)

The storage backend is selected automatically: `MONGO_URL` present → MongoDB,
otherwise SQLite. Override with `WORKFLOW_STORAGE=sqlite|mongo`.

## Features

- 10 node types (Start, End, Process, Decision, Database, API, Document, Delay, Email, Subflow)
- draw.io-style canvas: pan, zoom, drag & drop shapes from the palette, snap-to-grid
- Directional connection points (top/right/bottom/left) — drag to connect, click to
  open the guided "add & connect" shape picker
- Decision nodes auto-label branches Yes / No (max 2 outgoing)
- Double-click any node → rich-text documentation editor (Quill)
- Play Mode: step-by-step presentation with branch choices and animated traversal
- ELK.js Auto Layout (top→bottom or left→right)
- Undo / redo, auto-save, validation warnings, dark/light theme
- Export / import portable `.wflow` files

## Project structure

```
run_local.py            # single-process local runner (UI + API + SQLite)
backend/server.py       # FastAPI API (MongoDB or SQLite storage)
frontend/server.py      # FastAPI UI server (Jinja2 + static)
frontend/templates/     # index.html
frontend/static/        # css + vanilla JS modules (canvas, state, play, layout, ui)
```
