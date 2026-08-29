import React, { useEffect } from 'react';
import { useStore } from '../workflow/store';
import { Icon } from './Icon';
import { NODE_TYPES } from '../workflow/nodeDefinitions';

export default function PlayModePanel() {
  const playMode = useStore((s) => s.playMode);
  const nodes = useStore((s) => s.nodes);
  const connections = useStore((s) => s.connections);
  const playModeNext = useStore((s) => s.playModeNext);
  const playModePrevious = useStore((s) => s.playModePrevious);
  const playModeRestart = useStore((s) => s.playModeRestart);
  const playModeToggleAuto = useStore((s) => s.playModeToggleAuto);
  const playModeSetSpeed = useStore((s) => s.playModeSetSpeed);
  const stopPlayMode = useStore((s) => s.stopPlayMode);

  const current = nodes.find((n) => n.id === playMode.currentNodeId);
  const outgoing = connections.filter((c) => c.sourceNodeId === playMode.currentNodeId);
  const isDecision = current?.type === NODE_TYPES.DECISION;
  const atEnd = current && outgoing.length === 0;

  useEffect(() => {
    if (!playMode.isPlaying) return;
    const t = setTimeout(() => {
      if (atEnd) {
        playModeToggleAuto();
        return;
      }
      if (!isDecision) playModeNext();
      else playModeToggleAuto();
    }, playMode.speed);
    return () => clearTimeout(t);
  }, [playMode.isPlaying, playMode.currentNodeId, playMode.speed, atEnd, isDecision, playModeNext, playModeToggleAuto]);

  if (!playMode.active) return null;

  return (
    <div
      style={{
        position: 'absolute', left: '50%', bottom: 20, transform: 'translateX(-50%)',
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '10px 14px', borderRadius: 999, background: 'var(--ws-surface)',
        border: '1px solid var(--ws-border)', boxShadow: '3px 3px 0 var(--ws-border)',
        zIndex: 30, backdropFilter: 'blur(8px)',
      }}
      data-testid="play-controls"
    >
      <button className="ws-btn" onClick={playModeRestart} data-testid="play-restart" title="Restart">
        <Icon name="RotateCcw" size={14} />
      </button>
      <button className="ws-btn" onClick={playModePrevious} data-testid="play-prev" title="Previous">
        <Icon name="ChevronLeft" size={14} />
      </button>
      {isDecision ? (
        <>
          <button
            className="ws-btn"
            onClick={() => playModeNext('Yes')}
            data-testid="play-branch-yes"
            style={{ borderColor: 'var(--ws-success)', color: 'var(--ws-success)' }}
          >
            <Icon name="Check" size={14} /> Yes
          </button>
          <button
            className="ws-btn"
            onClick={() => playModeNext('No')}
            data-testid="play-branch-no"
            style={{ borderColor: '#EF4444', color: '#EF4444' }}
          >
            <Icon name="X" size={14} /> No
          </button>
        </>
      ) : (
        <button className="ws-btn ws-btn-play" onClick={() => playModeNext()} disabled={atEnd} data-testid="play-next">
          <Icon name="ChevronRight" size={14} /> Next
        </button>
      )}
      <button
        className={`ws-btn ${playMode.isPlaying ? '' : ''}`}
        onClick={playModeToggleAuto}
        data-testid="play-auto"
        disabled={isDecision || atEnd}
        title="Auto-play"
      >
        <Icon name={playMode.isPlaying ? 'Pause' : 'Play'} size={14} />
      </button>
      <select
        className="ws-input"
        value={playMode.speed}
        onChange={(e) => playModeSetSpeed(Number(e.target.value))}
        style={{ width: 90, height: 30 }}
        data-testid="play-speed"
      >
        <option value={3000}>Slow</option>
        <option value={1500}>Normal</option>
        <option value={700}>Fast</option>
      </select>
      <div className="font-mono-label" style={{ color: 'var(--ws-text-secondary)', minWidth: 60, textAlign: 'center' }}>
        {playMode.history.length} / {nodes.length}
      </div>
      <button className="ws-btn" onClick={stopPlayMode} data-testid="play-stop-inline">
        <Icon name="X" size={14} />
      </button>
    </div>
  );
}
