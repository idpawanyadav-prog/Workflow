# Architecture

Workflow Studio is designed to run as an Electron desktop application; the current
build ships a web preview that exercises the exact same architecture except that:
- The renderer is a browser page instead of an Electron BrowserWindow.
- The **personal workspace** uses IndexedDB (via Dexie) instead of SQLite.
- The **shared workspace** uses FastAPI + MongoDB instead of Microsoft SQL Server.

Every storage provider implements `BaseWorkspaceStorage`, so the UI code is
identical across providers. Migrating to Electron only requires swapping the
providers behind that interface.

## Layers
```
apps/desktop/renderer         React UI (Canvas, Properties, Play, Rich text)
        │
        ▼   validated actions (Zustand store)
Application services          workflow/store.js, workflow/commands.js
        │
        ▼
Domain                        workflow/nodeDefinitions.js, workflow/validation.js
        │
        ▼
Storage contracts             workflow/storage/base.js
        │
        ├── IndexedDbWorkspaceStorage   (Dexie / browser)
        ├── RemoteWorkspaceStorage      (Axios ⇄ FastAPI ⇄ MongoDB)
        └── (Electron) SQLiteWorkspaceStorage / SqlServerWorkspaceStorage
```

## Key rules
- UI never imports storage classes directly; it uses the store's actions.
- No business logic in components — all mutations flow through the `CommandStack`.
- Domain rules (branching, connection limits, validation) are declared once in
  `nodeDefinitions.js` and `validation.js`; components read from those.
- All external inputs (`.wflow` import, remote payloads) run through `migrateProject`
  to preserve backward compatibility.
