import React from 'react';
import { useStore } from '../workflow/store';
import Canvas from './Canvas';
import LeftPalette from './LeftPalette';
import RightSidebar from './RightSidebar';
import TopBar from './TopBar';
import NodePickerPopover from './NodePicker';
import DetailEditor from './DetailEditor';
import PlayModePanel from './PlayModePanel';
import SettingsPanel from './SettingsPanel';
import Dashboard from './Dashboard';
import { Icon } from './Icon';

/**
 * App shell wires together the three-column editor experience and the
 * project dashboard. All routing is state-driven — no URL routing needed
 * for Electron parity.
 */
export default function AppShell() {
  const activeView = useStore((s) => s.activeView);
  const connectMode = useStore((s) => s.connectMode);
  const cancelConnect = useStore((s) => s.cancelConnect);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      {activeView === 'dashboard' ? (
        <Dashboard />
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <LeftPalette />
          <main style={{ flex: 1, position: 'relative' }}>
            <Canvas />
            {connectMode && (
              <div
                style={{
                  position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                  padding: '8px 14px', background: 'var(--ws-surface)',
                  border: '1px solid var(--ws-primary)', boxShadow: '3px 3px 0 var(--ws-primary)',
                  borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
                  zIndex: 15,
                }}
                data-testid="connect-mode-hint"
              >
                <Icon name="MousePointer2" size={14} />
                <span className="font-mono-label">Click a node to connect · Esc to cancel</span>
                <button className="ws-btn" onClick={cancelConnect} data-testid="cancel-connect">
                  <Icon name="X" size={12} />
                </button>
              </div>
            )}
            <PlayModePanel />
          </main>
          <RightSidebar />
        </div>
      )}
      <NodePickerPopover />
      <DetailEditor />
      <SettingsPanel />
    </div>
  );
}
