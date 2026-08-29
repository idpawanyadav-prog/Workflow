import React, { useEffect, useState } from 'react';
import AppShell from './components/AppShell';
import { useStore } from './workflow/store';
import { IndexedDbWorkspaceStorage } from './workflow/storage/indexeddb';
import { RemoteWorkspaceStorage } from './workflow/storage/remote';

export default function App() {
  const setStorage = useStore((s) => s.setStorage);
  const loadProjects = useStore((s) => s.loadProjects);
  const setTheme = useStore((s) => s.setTheme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const kind = localStorage.getItem('ws-storage-kind') || 'local';
      const theme = localStorage.getItem('ws-theme') || 'light';
      setTheme(theme);
      let storage;
      if (kind === 'remote') {
        storage = new RemoteWorkspaceStorage(process.env.REACT_APP_BACKEND_URL);
      } else {
        storage = new IndexedDbWorkspaceStorage();
      }
      await storage.initialize();
      setStorage(storage, kind);
      await loadProjects();
      setReady(true);
    })();
  }, [setStorage, loadProjects, setTheme]);

  if (!ready) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ws-bg)', color: 'var(--ws-text-secondary)',
      }}>
        <div className="font-mono-label">Loading Workflow Studio…</div>
      </div>
    );
  }

  return <AppShell />;
}
