import React, { useEffect, useState } from 'react';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';

export default function Dashboard() {
  const projects = useStore((s) => s.projects);
  const loadProjects = useStore((s) => s.loadProjects);
  const createProject = useStore((s) => s.createProject);
  const openProject = useStore((s) => s.openProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const storageKind = useStore((s) => s.storageKind);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects, storageKind]);

  const onCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createProject(name.trim(), description.trim());
      setName(''); setDescription('');
    } finally { setCreating(false); }
  };

  return (
    <div
      style={{
        height: '100%', overflow: 'auto', padding: '40px 48px',
        background:
          'linear-gradient(180deg, var(--ws-bg) 0%, var(--ws-surface-raised) 100%)',
      }}
      data-testid="dashboard"
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
              {storageKind === 'local' ? 'Personal workspace · IndexedDB' : 'Shared workspace · Remote'}
            </div>
            <h1 className="font-heading" style={{ fontSize: 40, fontWeight: 800, margin: '4px 0 0' }}>
              Workflow Studio
            </h1>
            <p style={{ color: 'var(--ws-text-secondary)', maxWidth: 560, marginTop: 6, fontSize: 14 }}>
              A local-first visual workflow designer, documentation platform and interactive presentation tool.
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 28, marginTop: 40,
        }}>
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="font-heading" style={{ fontSize: 20, fontWeight: 700 }}>Projects</div>
              <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
                {projects.length} total
              </div>
            </div>
            {projects.length === 0 ? (
              <div className="ws-card-subtle" style={{ padding: 32, textAlign: 'center' }}>
                <Icon name="Sparkles" size={22} />
                <div className="font-heading" style={{ marginTop: 8, fontSize: 16, fontWeight: 600 }}>
                  No projects yet
                </div>
                <div style={{ color: 'var(--ws-text-secondary)', fontSize: 13, marginTop: 4 }}>
                  Create your first workflow using the panel on the right.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {projects.map((p) => (
                  <div key={p.id} className="ws-card" style={{ padding: 18, background: 'var(--ws-surface)' }} data-testid={`project-card-${p.id}`}>
                    <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
                      Updated {new Date(p.updatedAt).toLocaleString()}
                    </div>
                    <div className="font-heading" style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 6px' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', minHeight: 32 }}>
                      {p.description || 'No description'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className="ws-btn ws-btn-primary" data-testid={`open-project-${p.id}`} onClick={() => openProject(p.id)}>
                        <Icon name="ArrowRight" size={14} /> Open
                      </button>
                      <button
                        className="ws-btn"
                        onClick={() => {
                          if (window.confirm(`Delete "${p.name}"?`)) deleteProject(p.id);
                        }}
                        style={{ color: '#B91C1C', borderColor: '#B91C1C' }}
                        data-testid={`delete-project-${p.id}`}
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                    <div className="ws-badge" style={{ marginTop: 12 }}>
                      {(p.nodeCount || 0)} nodes
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="ws-card" style={{ padding: 22, alignSelf: 'start', background: 'var(--ws-surface)' }}>
            <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>New project</div>
            <div className="font-heading" style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Start a new workflow
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              <span className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>Name</span>
              <input
                className="ws-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer onboarding"
                data-testid="new-project-name"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <span className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>Description</span>
              <textarea
                className="ws-input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short summary"
                style={{ resize: 'vertical' }}
                data-testid="new-project-description"
              />
            </label>
            <button
              className="ws-btn ws-btn-primary"
              onClick={onCreate}
              disabled={!name.trim() || creating}
              data-testid="create-project-btn"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Icon name="Plus" size={14} /> Create workflow
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
