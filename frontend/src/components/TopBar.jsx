import React, { useRef } from 'react';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';
import { exportProjectToWflow, importWflowFile } from '../workflow/io';

export default function TopBar() {
  const project = useStore((s) => s.project);
  const isDirty = useStore((s) => s.isDirty);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const saveProject = useStore((s) => s.saveProject);
  const closeProject = useStore((s) => s.closeProject);
  const runAutoLayout = useStore((s) => s.runAutoLayout);
  const startPlayMode = useStore((s) => s.startPlayMode);
  const playMode = useStore((s) => s.playMode);
  const stopPlayMode = useStore((s) => s.stopPlayMode);
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const openProjectData = useStore((s) => s.openProjectData);
  const nodes = useStore((s) => s.nodes);
  const connections = useStore((s) => s.connections);
  const fileInputRef = useRef(null);

  const doExport = async () => {
    if (!project) return;
    await exportProjectToWflow({ ...project, nodes, connections });
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importWflowFile(file);
      // Import into current project space by replacing content but keeping id
      const target = {
        ...imported,
        id: project?.id || imported.id,
        storageType: useStore.getState().storageKind,
      };
      openProjectData(target);
      await saveProject();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  };

  return (
    <header
      style={{
        height: 56,
        background: 'var(--ws-surface)',
        borderBottom: '1px solid var(--ws-border-subtle)',
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14,
      }}
      data-testid="top-bar"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, background: 'var(--ws-text)', color: 'var(--ws-bg)',
          borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="Workflow" size={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>Workflow Studio</div>
          <div className="font-heading" style={{ fontWeight: 700, fontSize: 14, lineHeight: 1 }}>
            {project ? project.name : 'Dashboard'}
          </div>
        </div>
      </div>

      {project && (
        <>
          <div style={{ width: 1, height: 24, background: 'var(--ws-border-subtle)' }} />
          <button className="ws-btn" onClick={closeProject} data-testid="close-project-btn">
            <Icon name="ArrowLeft" size={14} /> Dashboard
          </button>
          <button className="ws-btn" onClick={undo} disabled={!canUndo} data-testid="undo-btn">
            <Icon name="Undo2" size={14} /> Undo
          </button>
          <button className="ws-btn" onClick={redo} disabled={!canRedo} data-testid="redo-btn">
            <Icon name="Redo2" size={14} /> Redo
          </button>
          <button className="ws-btn" onClick={saveProject} data-testid="save-btn">
            <Icon name="Save" size={14} /> Save
          </button>
          <button className="ws-btn" onClick={() => runAutoLayout('DOWN')} data-testid="auto-layout-btn">
            <Icon name="LayoutTemplate" size={14} /> Auto layout
          </button>
          <button className="ws-btn" onClick={() => runAutoLayout('RIGHT')} data-testid="auto-layout-right-btn">
            <Icon name="MoveHorizontal" size={14} /> Horizontal
          </button>
          <button className="ws-btn" onClick={doExport} data-testid="export-btn">
            <Icon name="Download" size={14} /> Export
          </button>
          <button className="ws-btn" onClick={() => fileInputRef.current?.click()} data-testid="import-btn">
            <Icon name="Upload" size={14} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wflow,application/zip"
            onChange={doImport}
            style={{ display: 'none' }}
            data-testid="import-file-input"
          />
        </>
      )}

      <div style={{ flex: 1 }} />

      {project && (
        <div className="font-mono-label" style={{ color: isDirty ? 'var(--ws-warning)' : 'var(--ws-text-secondary)' }}>
          {isDirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Saved'}
        </div>
      )}

      {project && !playMode.active && (
        <button
          className="ws-btn ws-btn-play"
          onClick={startPlayMode}
          data-testid="play-mode-start"
          style={{ borderColor: 'var(--ws-border)' }}
        >
          <Icon name="Play" size={14} /> Play
        </button>
      )}
      {playMode.active && (
        <button className="ws-btn" onClick={stopPlayMode} data-testid="play-mode-stop" style={{ borderColor: 'var(--ws-play)', color: 'var(--ws-play)' }}>
          <Icon name="Square" size={14} /> Stop
        </button>
      )}

      <button
        className="ws-btn"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        data-testid="theme-toggle"
        title="Toggle theme"
      >
        <Icon name={theme === 'light' ? 'Moon' : 'Sun'} size={14} />
      </button>
      <button className="ws-btn" onClick={openSettings} data-testid="settings-btn">
        <Icon name="Settings" size={14} /> Settings
      </button>
    </header>
  );
}
