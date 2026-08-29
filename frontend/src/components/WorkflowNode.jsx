import React, { useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getNodeDefinition, NODE_TYPES } from '../workflow/nodeDefinitions';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';

const positionMap = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function ShapeFrame({ shape, selected, dim, isActive, isCompleted, isDim, def, children }) {
  const base = {
    background: 'var(--ws-surface)',
    border: `1.5px solid ${selected ? 'var(--ws-primary)' : 'var(--ws-border)'}`,
    boxShadow: selected
      ? '5px 5px 0 var(--ws-primary)'
      : '4px 4px 0 var(--ws-border)',
    color: 'var(--ws-text)',
    width: dim.width,
    height: dim.height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 14px',
    transitionProperty: 'transform, box-shadow, opacity',
    transitionDuration: '150ms',
    opacity: isDim ? 0.35 : 1,
  };
  if (isActive) {
    base.boxShadow = `0 0 0 3px var(--ws-play), 5px 5px 0 var(--ws-play)`;
    base.borderColor = 'var(--ws-play)';
  } else if (isCompleted) {
    base.borderColor = 'var(--ws-success)';
    base.boxShadow = '4px 4px 0 var(--ws-success)';
  }
  const style = { ...base };

  if (shape === 'circle') {
    style.borderRadius = '999px';
  } else if (shape === 'diamond') {
    return (
      <div style={{ position: 'relative', width: dim.width, height: dim.height }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: 'rotate(45deg)',
            border: base.border,
            background: base.background,
            boxShadow: base.boxShadow,
            borderRadius: 8,
            opacity: base.opacity,
            transitionProperty: 'transform, box-shadow, opacity',
            transitionDuration: '150ms',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
          {children}
        </div>
      </div>
    );
  } else if (shape === 'cylinder') {
    style.borderRadius = '32px / 12px';
  } else if (shape === 'parallelogram') {
    style.transform = 'skewX(-14deg)';
    style.borderRadius = 4;
  } else if (shape === 'hex') {
    style.clipPath = 'polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)';
    style.boxShadow = 'none';
    style.border = 'none';
    return (
      <div style={{ position: 'relative', width: dim.width, height: dim.height }}>
        <div style={{ ...style, background: 'var(--ws-border)', padding: 2 }}>
          <div style={{ ...style, background: 'var(--ws-surface)', padding: 8, boxShadow: 'none', border: 'none' }}>
            {children}
          </div>
        </div>
      </div>
    );
  } else {
    style.borderRadius = 10;
  }

  return (
    <div style={style}>
      {shape === 'parallelogram' ? (
        <div style={{ transform: 'skewX(14deg)', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
      ) : children}
    </div>
  );
}

export default function WorkflowNodeView({ id, data, selected }) {
  const def = getNodeDefinition(data.type);
  const {
    playMode,
    openPicker,
    startConnectExisting,
    openDetailEditor,
    connectMode,
    connectExistingNode,
  } = useStore();

  const dim = data.dimensions || def.defaultSize;
  const isActive = playMode.active && playMode.currentNodeId === id;
  const isCompleted = playMode.active && playMode.completed.has(id);
  const isDim = playMode.active && !isActive && !isCompleted;

  const connections = useStore((s) => s.connections);
  const outgoing = useMemo(() => connections.filter((c) => c.sourceNodeId === id), [connections, id]);
  const remainingOut = def.maxOutgoing - outgoing.length;

  const isConnectTarget = connectMode && connectMode.sourceNodeId !== id;

  const handleFreeClick = (dir) => (e) => {
    e.stopPropagation();
    openPicker({ sourceNodeId: id, direction: dir });
  };
  const handleConnectExisting = (dir) => (e) => {
    e.stopPropagation();
    startConnectExisting({ sourceNodeId: id, direction: dir });
  };

  const onNodeDoubleClick = (e) => {
    e.stopPropagation();
    openDetailEditor(id);
  };

  const onNodeClickWhileConnecting = () => {
    if (isConnectTarget) {
      connectExistingNode({
        sourceNodeId: connectMode.sourceNodeId,
        direction: connectMode.direction,
        targetNodeId: id,
      });
    }
  };

  return (
    <div
      className={`ws-node ${selected ? 'selected' : ''}`}
      onDoubleClick={onNodeDoubleClick}
      onClick={onNodeClickWhileConnecting}
      data-testid={`node-${id}`}
      style={{
        position: 'relative',
        outline: isConnectTarget ? '2px dashed var(--ws-primary)' : 'none',
        outlineOffset: 6,
        cursor: isConnectTarget ? 'crosshair' : 'grab',
      }}
    >
      <ShapeFrame
        shape={def.shape}
        selected={selected}
        dim={dim}
        isActive={isActive}
        isCompleted={isCompleted}
        isDim={isDim}
        def={def}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: def.accent, display: 'inline-flex' }}>
              <Icon name={def.icon} size={16} />
            </span>
            <span className="font-mono-label" style={{ color: 'var(--ws-text-secondary)' }}>
              {def.displayName}
            </span>
          </div>
          <div
            className="font-heading"
            style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2, maxWidth: dim.width - 20, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={data.shortDescription || data.title}
          >
            {data.title || def.displayName}
          </div>
        </div>
      </ShapeFrame>

      {/* Handles (4 directions, source and target) */}
      {['top', 'right', 'bottom', 'left'].map((dir) => (
        <React.Fragment key={dir}>
          <Handle
            id={`${dir}-target`}
            type="target"
            position={positionMap[dir]}
            className="ws-handle"
            data-testid={`handle-target-${dir}-${id}`}
            isConnectable={def.maxIncoming > 0}
          />
          <Handle
            id={`${dir}-source`}
            type="source"
            position={positionMap[dir]}
            className="ws-handle"
            data-testid={`handle-source-${dir}-${id}`}
            isConnectable={remainingOut > 0}
          />
        </React.Fragment>
      ))}

      {/* + buttons on hover for adding a new node in that direction */}
      {!playMode.active && remainingOut > 0 && !connectMode && (
        <>
          {['top', 'right', 'bottom', 'left'].map((dir) => {
            const style = {
              position: 'absolute',
              width: 22, height: 22, borderRadius: 999,
              border: '1.5px solid var(--ws-border)',
              background: 'var(--ws-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', opacity: 0,
              transitionProperty: 'opacity, transform, background-color, color',
              transitionDuration: '120ms',
              boxShadow: '2px 2px 0 var(--ws-border)',
              zIndex: 5,
            };
            if (dir === 'top') { style.top = -30; style.left = '50%'; style.transform = 'translateX(-50%)'; }
            if (dir === 'bottom') { style.bottom = -30; style.left = '50%'; style.transform = 'translateX(-50%)'; }
            if (dir === 'left') { style.left = -30; style.top = '50%'; style.transform = 'translateY(-50%)'; }
            if (dir === 'right') { style.right = -30; style.top = '50%'; style.transform = 'translateY(-50%)'; }
            return (
              <div
                key={`plus-${dir}`}
                className="ws-plus"
                onClick={handleFreeClick(dir)}
                onDoubleClick={handleConnectExisting(dir)}
                title="Click: add shape • Double-click: connect existing"
                data-testid={`plus-${dir}-${id}`}
                style={style}
              >
                <Icon name="Plus" size={12} />
              </div>
            );
          })}
        </>
      )}
      <style>{`.ws-node:hover .ws-plus, .ws-node.selected .ws-plus { opacity: 1 !important; } .ws-plus:hover { background: var(--ws-primary) !important; color: white; border-color: var(--ws-primary) !important; }`}</style>
    </div>
  );
}
