# Workflow Studio – Product Requirements Document

_Last updated: 2026-01_

## Original problem statement
Workflow Studio is a local-first visual workflow designer, documentation platform and
interactive presentation tool. It resembles draw.io visually, but is a guided workflow
builder rather than a free-form drawing app. Primary target: Electron desktop; current
build ships a web preview targeting phases 0-8. Storage abstracts SQLite and Microsoft
SQL Server behind an `IWorkspaceStorage` interface; in this preview the personal
workspace is IndexedDB and the shared workspace is FastAPI + MongoDB.

## User personas
- **Solution architects** documenting business flows and API pipelines.
- **Product managers** presenting workflows to stakeholders via Play Mode.
- **Engineers** authoring rich runbooks that live directly on each node.

## Core requirements (static)
1. Guided visual builder with directional connection points and a shape picker.
2. Decision node auto-assigns Yes / No labels on outgoing edges (max two branches).
3. Rich TipTap-based node documentation with hover short-description + double-click detail.
4. ELK.js Auto Layout (top-to-bottom, left-to-right).
5. Play Mode with step navigation, decision branch selection, animated traversal.
6. Storage abstraction: Personal (IndexedDB / SQLite) & Shared (REST / SQL Server).
7. .wflow ZIP portable format with manifest + workflow.json + attachments/.
8. Undo/redo via command pattern; auto-save; validation warnings on canvas.
9. Distinctive "Modern Architectural / Crisp Neumorphism" theme with light & dark.

## What's implemented (2026-01)
- Configuration-driven node system (10 node types).
- React Flow canvas with pan, zoom, minimap, grid, snap, keyboard shortcuts.
- Directional handles (top/right/bottom/left) with hover + buttons that open the node picker
  or start a "connect existing" mode; Decision auto-labels Yes then No.
- Domain validation engine (missing start, orphan detection, decision branch checks, etc.).
- Command-pattern undo/redo (add/delete/move/update node & connection, auto layout).
- ELK.js Auto Layout (DOWN & RIGHT) with animated transitions.
- TipTap rich editor for detailed documentation (bold/italic/underline/headings/lists/
  checklists/blockquote/code/link/image/table).
- Play Mode: play/pause/next/prev/restart, speed, decision Yes/No selection, dim non-active
  nodes, animated active edge, focus-center on current node.
- Storage: `BaseWorkspaceStorage` + `IndexedDbWorkspaceStorage` (Dexie) +
  `RemoteWorkspaceStorage` (Axios ⇄ FastAPI ⇄ MongoDB).
- Dashboard listing projects with create/delete, workspace badge, node count.
- Settings dialog (General, Workspace, Appearance, Editor, About) with theme toggle and
  workspace switcher.
- .wflow ZIP export/import with schema migration & version guard.
- Auto-save (debounced 1s) with dirty indicator in top bar.
- Distinctive light + dark themes via CSS variables.

## Prioritized backlog
### P0 (required for production Electron ship)
- Electron shell (main / preload / renderer wiring, contextIsolation, IPC bridge)
- Native SQLite provider in Electron main process (mirror of Dexie provider).
- Secure credential storage (keytar) for SQL Server user/pass.
- SQL Server provider (mssql) with parameterized queries + migrations.

### P1 (production hardening)
- Storage migration flows (SQLite ↔ SQL Server) with report and preview.
- Accessibility pass (ARIA on canvas, keyboard-only workflow creation).
- Larger-graph performance work (virtualized minimap, memoization audit).
- Attachment upload (files stored under attachments/ in .wflow and referenced from nodes).
- Playwright E2E test suite.

### P2 (future)
- AI assistant (generate workflow from prompt) — Phase 9.
- Plugin architecture.
- Execution engine (evaluate conditions and execute actions per node).

## Architecture
```
Renderer (React + Zustand + React Flow)
        │  validated actions
        ▼
Application services (workflow/store, commands, validation)
        │  domain contracts
        ▼
Storage providers (BaseWorkspaceStorage → IndexedDb | Remote | SQLite | SQLServer)
```
UI never talks to storage directly; it goes through the Zustand store which orchestrates
`CommandStack` mutations and delegates persistence to whichever storage implementation is
currently active.

## Definition of done (per feature)
- Type-safe (JSDoc types are used across `/workflow/*.js`; strict TS will be added when the
  code moves into the `packages/` workspace for Electron).
- Validated (Zod planned; current validation lives in `workflow/validation.js`).
- Undo/redo hooked in where user-visible.
- Documented in CHANGELOG.md.
