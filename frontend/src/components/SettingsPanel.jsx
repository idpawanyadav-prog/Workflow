import React, { useState } from 'react';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';
import { IndexedDbWorkspaceStorage } from '../workflow/storage/indexeddb';
import { RemoteWorkspaceStorage } from '../workflow/storage/remote';

const SECTIONS = [
  { id: 'general', label: 'General', icon: 'Settings' },
  { id: 'workspace', label: 'Workspace', icon: 'Database' },
  { id: 'appearance', label: 'Appearance', icon: 'Palette' },
  { id: 'editor', label: 'Editor', icon: 'FileText' },
  { id: 'about', label: 'About', icon: 'Info' },
];

export default function SettingsPanel() {
  const open = useStore((s) => s.settingsOpen);
  const close = useStore((s) => s.closeSettings);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setStorage = useStore((s) => s.setStorage);
  const storageKind = useStore((s) => s.storageKind);
  const loadProjects = useStore((s) => s.loadProjects);
  const autoSaveEnabled = useStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useStore((s) => s.setAutoSaveEnabled);
  const closeProject = useStore((s) => s.closeProject);

  const [section, setSection] = useState('general');
  const [remoteStatus, setRemoteStatus] = useState(null);

  if (!open) return null;

  const switchStorage = async (kind) => {
    closeProject();
    if (kind === 'local') {
      const store = new IndexedDbWorkspaceStorage();
      await store.initialize();
      setStorage(store, 'local');
      localStorage.setItem('ws-storage-kind', 'local');
    } else {
      const store = new RemoteWorkspaceStorage(process.env.REACT_APP_BACKEND_URL);
      await store.initialize();
      setStorage(store, 'remote');
      localStorage.setItem('ws-storage-kind', 'remote');
    }
    await loadProjects();
  };

  const testRemote = async () => {
    setRemoteStatus('testing');
    try {
      const store = new RemoteWorkspaceStorage(process.env.REACT_APP_BACKEND_URL);
      await store.initialize();
      await store.listProjects();
      setRemoteStatus('ok');
    } catch (err) {
      setRemoteStatus(`error: ${err.message}`);
    }
  };

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.5)', zIndex: 65,
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
      }}
      data-testid="settings-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ws-card"
        style={{ width: 'min(880px, 92vw)', height: 'min(600px, 86vh)', display: 'flex', overflow: 'hidden', background: 'var(--ws-surface)' }}
        data-testid="settings-dialog"
      >
        <aside style={{
          width: 200, borderRight: '1px solid var(--ws-border-subtle)',
          padding: 18, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className="ws-btn"
              onClick={() => setSection(s.id)}
              data-testid={`settings-tab-${s.id}`}
              style={{
                justifyContent: 'flex-start',
                background: section === s.id ? 'var(--ws-text)' : 'var(--ws-surface)',
                color: section === s.id ? 'var(--ws-bg)' : 'var(--ws-text)',
                border: '1px solid var(--ws-border-subtle)',
                boxShadow: section === s.id ? '2px 2px 0 var(--ws-border)' : 'none',
              }}
            >
              <Icon name={s.icon} size={14} /> {s.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="ws-btn" onClick={close} data-testid="settings-close">
            <Icon name="X" size={14} /> Close
          </button>
        </aside>
        <section className="scrollbar-thin" style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          {section === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionHead title="General" description="Application preferences" />
              <Row label="Auto-save" hint="Save on every mutation (debounced 1s)">
                <Switch checked={autoSaveEnabled} onChange={setAutoSaveEnabled} testId="setting-autosave" />
              </Row>
            </div>
          )}

          {section === 'workspace' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionHead title="Workspace" description="Where your workflows are stored" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <WorkspaceCard
                  title="Personal"
                  icon="HardDrive"
                  description="Local, offline. Uses IndexedDB in browser (SQLite in Electron)."
                  selected={storageKind === 'local'}
                  onSelect={() => switchStorage('local')}
                  testId="workspace-local"
                />
                <WorkspaceCard
                  title="Shared"
                  icon="Cloud"
                  description="Remote workspace. Uses REST + MongoDB (Microsoft SQL Server in production)."
                  selected={storageKind === 'remote'}
                  onSelect={() => switchStorage('remote')}
                  testId="workspace-remote"
                />
              </div>
              <div style={{ padding: 14, border: '1px solid var(--ws-border-subtle)', borderRadius: 8 }}>
                <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>SQL Server (future)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <input className="ws-input" placeholder="Server (e.g. sql.company.internal)" data-testid="sql-server-host" />
                  <input className="ws-input" placeholder="Database" data-testid="sql-server-db" />
                  <input className="ws-input" placeholder="Username" data-testid="sql-server-user" />
                  <input className="ws-input" placeholder="Password" type="password" data-testid="sql-server-pass" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="ws-btn" onClick={testRemote} data-testid="test-remote-connection">
                    <Icon name="PlugZap" size={14} /> Test connection
                  </button>
                  {remoteStatus && (
                    <div className="font-mono-label" style={{
                      color: remoteStatus === 'ok' ? 'var(--ws-success)' : remoteStatus === 'testing' ? 'var(--ws-text-secondary)' : '#B91C1C',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Icon name={remoteStatus === 'ok' ? 'CheckCircle2' : 'AlertTriangle'} size={12} />
                      {remoteStatus}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 8 }}>
                  Credentials are never stored in plain text; they will be persisted in the OS credential vault
                  once the desktop app ships.
                </div>
              </div>
            </div>
          )}

          {section === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionHead title="Appearance" description="Theme & density" />
              <Row label="Theme">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="ws-btn"
                    onClick={() => setTheme('light')}
                    data-testid="theme-light"
                    style={theme === 'light' ? { background: 'var(--ws-text)', color: 'var(--ws-bg)' } : {}}
                  >
                    <Icon name="Sun" size={14} /> Light
                  </button>
                  <button
                    className="ws-btn"
                    onClick={() => setTheme('dark')}
                    data-testid="theme-dark"
                    style={theme === 'dark' ? { background: 'var(--ws-text)', color: 'var(--ws-bg)' } : {}}
                  >
                    <Icon name="Moon" size={14} /> Obsidian
                  </button>
                </div>
              </Row>
            </div>
          )}

          {section === 'editor' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionHead title="Editor" description="Canvas and documentation defaults" />
              <div style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>
                Snap to grid, minimap and background dots are enabled by default. More editor
                preferences will surface here in a future release.
              </div>
            </div>
          )}

          {section === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionHead title="About Workflow Studio" description="Version and diagnostic information" />
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                Workflow Studio is a guided visual workflow designer, documentation platform and
                interactive presentation tool. The current build targets the browser as a preview of
                the Electron desktop application. Storage abstractions (personal / shared) map 1:1 to
                SQLite and Microsoft SQL Server providers.
              </div>
              <div className="ws-badge">v0.9.0 preview</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHead({ title, description }) {
  return (
    <div>
      <div className="font-heading" style={{ fontSize: 22, fontWeight: 700 }}>{title}</div>
      <div style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>{description}</div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--ws-border-subtle)' }}>
      <div>
        <div className="font-heading" style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, testId }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      data-testid={testId}
      style={{
        width: 40, height: 22, borderRadius: 999, position: 'relative',
        background: checked ? 'var(--ws-text)' : 'var(--ws-surface-raised)',
        border: '1px solid var(--ws-border)', cursor: 'pointer',
        transition: 'background-color 150ms',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 16, height: 16, borderRadius: '50%',
        background: checked ? 'var(--ws-bg)' : 'var(--ws-text)',
        transition: 'left 150ms',
      }} />
    </button>
  );
}

function WorkspaceCard({ title, icon, description, selected, onSelect, testId }) {
  return (
    <button
      onClick={onSelect}
      data-testid={testId}
      className="ws-card"
      style={{
        padding: 16, textAlign: 'left',
        background: selected ? 'var(--ws-text)' : 'var(--ws-surface)',
        color: selected ? 'var(--ws-bg)' : 'var(--ws-text)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} />
        <span className="font-heading" style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{description}</div>
      {selected && (
        <div className="font-mono-label" style={{ marginTop: 8 }}>Active</div>
      )}
    </button>
  );
}
