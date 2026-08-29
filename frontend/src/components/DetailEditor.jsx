import React, { useEffect, useState } from 'react';
import { useStore } from '../workflow/store';
import RichEditor from './RichEditor';
import { Icon } from './Icon';

export default function DetailEditor() {
  const detailEditor = useStore((s) => s.detailEditor);
  const closeDetailEditor = useStore((s) => s.closeDetailEditor);
  const nodes = useStore((s) => s.nodes);
  const updateNode = useStore((s) => s.updateNode);
  const [draft, setDraft] = useState(null);

  const node = nodes.find((n) => n.id === detailEditor.nodeId);

  useEffect(() => {
    if (node) setDraft(node.detailedDescription || { type: 'doc', content: [{ type: 'paragraph' }] });
  }, [node?.id]);

  if (!detailEditor.open || !node) return null;

  const save = () => {
    updateNode(node.id, { detailedDescription: draft });
    closeDetailEditor();
  };

  return (
    <div
      onClick={closeDetailEditor}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)',
        zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}
      data-testid="detail-editor-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ws-card"
        style={{
          width: 'min(920px, 92vw)', height: 'min(720px, 88vh)',
          display: 'flex', flexDirection: 'column', padding: 22, background: 'var(--ws-surface)',
        }}
        data-testid="detail-editor"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
              Detailed documentation
            </div>
            <div className="font-heading" style={{ fontSize: 22, fontWeight: 700 }}>{node.title || 'Untitled node'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ws-btn" onClick={closeDetailEditor} data-testid="detail-editor-cancel">
              <Icon name="X" size={14} /> Cancel
            </button>
            <button className="ws-btn ws-btn-primary" onClick={save} data-testid="detail-editor-save">
              <Icon name="Save" size={14} /> Save documentation
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RichEditor value={draft} onChange={setDraft} autoFocus />
        </div>
      </div>
    </div>
  );
}
