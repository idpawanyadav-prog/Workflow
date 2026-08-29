import React from 'react';
import { NODE_DEFINITIONS } from '../workflow/nodeDefinitions';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';

export default function NodePickerPopover() {
  const picker = useStore((s) => s.picker);
  const closePicker = useStore((s) => s.closePicker);
  const addConnectedNode = useStore((s) => s.addConnectedNode);
  const startConnectExisting = useStore((s) => s.startConnectExisting);

  if (!picker) return null;

  const onSelect = (type) => {
    addConnectedNode({
      sourceNodeId: picker.sourceNodeId,
      direction: picker.direction,
      type,
      branchLabel: picker.branchLabel,
    });
  };

  return (
    <div
      onClick={closePicker}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 60, backdropFilter: 'blur(4px)',
      }}
      data-testid="node-picker-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ws-card"
        style={{ width: 560, maxWidth: '90vw', padding: 22, background: 'var(--ws-surface)' }}
        data-testid="node-picker"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
              Add node · direction: {picker.direction}
            </div>
            <div className="font-heading" style={{ fontSize: 20, fontWeight: 700 }}>Choose a shape</div>
          </div>
          <button className="ws-btn" onClick={closePicker} data-testid="close-picker">
            <Icon name="X" size={14} /> Close
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {NODE_DEFINITIONS.map((def) => (
            <button
              key={def.type}
              onClick={() => onSelect(def.type)}
              className="ws-btn"
              data-testid={`picker-${def.type}`}
              style={{ flexDirection: 'column', alignItems: 'flex-start', padding: 12, height: 96, textAlign: 'left' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: def.accent }}>
                <Icon name={def.icon} size={16} />
                <span className="font-heading" style={{ color: 'var(--ws-text)', fontWeight: 600 }}>{def.displayName}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 4, lineHeight: 1.3 }}>
                {def.description}
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
            Tip: double-click a + button to connect an existing shape instead
          </div>
          <button
            className="ws-btn"
            data-testid="picker-connect-existing"
            onClick={() => {
              startConnectExisting({ sourceNodeId: picker.sourceNodeId, direction: picker.direction });
            }}
          >
            <Icon name="Link2" size={14} /> Connect existing
          </button>
        </div>
      </div>
    </div>
  );
}
