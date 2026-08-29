# Changelog

## 0.9.0 – 2026-01 (Web preview covering phases 0-8)
### Added
- Configuration-driven node system with 10 node types (Start, End, Process, Decision, Database, API, Document, Delay, Email, Subflow).
- Guided builder UX: directional plus-buttons that open the node picker or start "connect existing" mode.
- Automatic Yes/No branch labeling for Decision nodes (max two outgoing branches).
- React Flow canvas with pan/zoom/minimap/grid/snap-to-grid and keyboard shortcuts (Ctrl+Z/Y/S, Del, Esc).
- Command-pattern undo/redo (`CommandStack`) covering add/delete/move/update/auto-layout.
- Zustand-backed application store with debounced auto-save.
- Domain validation engine (missing start, orphan detection, decision branch checks, etc.).
- ELK.js Auto Layout with DOWN and RIGHT orientations.
- TipTap rich-text detail editor (headings, lists, checklists, blockquote, code block, link, image, table, underline).
- Play Mode with step navigation, decision branch buttons, auto-play speed, animated active edge.
- Storage abstraction `BaseWorkspaceStorage` with two providers: `IndexedDbWorkspaceStorage` (Dexie) and `RemoteWorkspaceStorage` (FastAPI/MongoDB).
- `.wflow` ZIP portable project format (manifest.json + workflow.json + attachments/) with schema migration.
- Settings dialog (General, Workspace, Appearance, Editor, About) with theme toggle and workspace switcher.
- Distinctive "Modern Architectural / Crisp Neumorphism" theme in light and Obsidian dark modes.
