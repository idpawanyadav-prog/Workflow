import React from 'react';
import { NODE_DEFINITIONS } from '../workflow/nodeDefinitions';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';

export default function LeftPalette() {
  const addNodeAt = useStore((s) => s.addNodeAt);
  const project = useStore((s) => s.project);
  const validation = useStore((s) => s.validation);

  const onAdd = (type) => {
    if (!project) return;
    const positions = useStore.getState().nodes.map((n) => n.position);
    const baseX = positions.length ? Math.max(...positions.map((p) => p.x)) + 260 : 80;
    const baseY = 120;
    addNodeAt(type, { x: baseX, y: baseY });
  };

  return (
    <aside
      style={{
        width: 256,
        background: 'var(--ws-surface)',
        borderRight: '1px solid var(--ws-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      data-testid="left-palette"
    >
      <div style={{ padding: '18px 20px 8px' }}>
        <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>Shapes</div>
        <div className="font-heading" style={{ fontSize: 18, fontWeight: 700 }}>Node palette</div>
      </div>
      <div className="scrollbar-thin" style={{ overflowY: 'auto', padding: '6px 12px 16px' }}>
        {NODE_DEFINITIONS.map((def) => (
          <button
            key={def.type}
            onClick={() => onAdd(def.type)}
            data-testid={`palette-${def.type}`}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', margin: '4px 0',
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-border-subtle)',
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              transitionProperty: 'transform, box-shadow, background-color',
              transitionDuration: '120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '3px 3px 0 var(--ws-border)'; e.currentTarget.style.transform = 'translate(-1px,-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
          >
            <span style={{
              width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--ws-border)', borderRadius: 6, color: def.accent,
              background: 'var(--ws-surface-raised)',
            }}>
              <Icon name={def.icon} size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="font-heading" style={{ fontWeight: 600, fontSize: 13 }}>{def.displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {def.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--ws-border-subtle)', padding: '14px 20px' }}>
        <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)', marginBottom: 8 }}>Validation</div>
        {validation.issues.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ws-success)', fontSize: 12 }}>
            <Icon name="CheckCircle2" size={14} /> Workflow is clean
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }} data-testid="validation-list">
            {validation.issues.slice(0, 6).map((issue) => (
              <div key={issue.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12,
                color: issue.severity === 'error' ? '#B91C1C' : issue.severity === 'warning' ? '#B45309' : 'var(--ws-text-secondary)',
              }}>
                <Icon name={issue.severity === 'error' ? 'AlertCircle' : 'AlertTriangle'} size={12} />
                <span>{issue.message}</span>
              </div>
            ))}
            {validation.issues.length > 6 && (
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>+{validation.issues.length - 6} more…</div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
