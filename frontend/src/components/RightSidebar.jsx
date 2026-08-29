import React from 'react';
import { useStore } from '../workflow/store';
import { getNodeDefinition } from '../workflow/nodeDefinitions';
import { Icon } from './Icon';

export default function RightSidebar() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedConnectionId = useStore((s) => s.selectedConnectionId);
  const nodes = useStore((s) => s.nodes);
  const connections = useStore((s) => s.connections);
  const updateNode = useStore((s) => s.updateNode);
  const updateConnection = useStore((s) => s.updateConnection);
  const deleteNode = useStore((s) => s.deleteNode);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const openDetailEditor = useStore((s) => s.openDetailEditor);
  const project = useStore((s) => s.project);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const conn = connections.find((c) => c.id === selectedConnectionId);

  return (
    <aside
      style={{
        width: 320,
        background: 'var(--ws-surface)',
        borderLeft: '1px solid var(--ws-border-subtle)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
      data-testid="right-sidebar"
    >
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--ws-border-subtle)' }}>
        <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>Properties</div>
        <div className="font-heading" style={{ fontSize: 18, fontWeight: 700 }}>
          {node ? getNodeDefinition(node.type).displayName : conn ? 'Connection' : 'Inspector'}
        </div>
      </div>
      <div className="scrollbar-thin" style={{ overflowY: 'auto', flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!node && !conn && (
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>
            {project ? 'Select a node or connection to inspect properties.' : 'No project open.'}
          </div>
        )}

        {node && (
          <>
            <Field label="Title">
              <input
                className="ws-input"
                value={node.title}
                onChange={(e) => updateNode(node.id, { title: e.target.value })}
                data-testid="sidebar-node-title-input"
              />
            </Field>
            <Field label="Short description" hint="Shown on hover">
              <textarea
                className="ws-input"
                rows={3}
                value={node.shortDescription || ''}
                onChange={(e) => updateNode(node.id, { shortDescription: e.target.value })}
                data-testid="sidebar-node-short-desc-input"
                style={{ resize: 'vertical' }}
              />
            </Field>
            <Field label="Detailed documentation">
              <button
                className="ws-btn"
                onClick={() => openDetailEditor(node.id)}
                data-testid="open-detail-editor"
              >
                <Icon name="FileText" size={14} /> Edit rich documentation
              </button>
            </Field>
            <Field label="Type">
              <div className="ws-badge">{getNodeDefinition(node.type).displayName}</div>
            </Field>
            <div style={{ marginTop: 8 }}>
              <button className="ws-btn" onClick={() => deleteNode(node.id)} data-testid="delete-node-btn"
                style={{ color: '#B91C1C', borderColor: '#B91C1C' }}>
                <Icon name="Trash2" size={14} /> Delete node
              </button>
            </div>
          </>
        )}

        {conn && (
          <>
            <Field label="Label">
              <input
                className="ws-input"
                value={conn.label || ''}
                onChange={(e) => updateConnection(conn.id, { label: e.target.value })}
                data-testid="connection-label-input"
              />
            </Field>
            <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
              {conn.sourceNodeId.slice(0, 6)} → {conn.targetNodeId.slice(0, 6)}
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="ws-btn" onClick={() => deleteConnection(conn.id)} data-testid="delete-connection-btn"
                style={{ color: '#B91C1C', borderColor: '#B91C1C' }}>
                <Icon name="Trash2" size={14} /> Delete connection
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>{hint}</span>}
    </label>
  );
}
