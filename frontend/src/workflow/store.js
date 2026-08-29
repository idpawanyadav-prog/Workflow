import { create } from 'zustand';
import { CommandStack, commandFactory, newId } from './commands';
import { getNodeDefinition, NODE_TYPES, OPPOSITE_DIRECTION } from './nodeDefinitions';
import { validateWorkflow } from './validation';
import { autoLayout as elkAutoLayout } from './layout';

/**
 * Central application store. Holds:
 * - workspace + storage abstraction
 * - current project (nodes, connections)
 * - selection, play mode, dialogs
 * - command stack (undo/redo)
 *
 * All UI mutations flow through actions here so business logic stays out of
 * React components.
 */
export const useStore = create((set, get) => {
  const commandStack = new CommandStack(300);
  let autoSaveTimer = null;

  const runCommand = (cmd) => {
    const ctx = { nodes: [...get().nodes], connections: [...get().connections] };
    commandStack.run(cmd, ctx);
    set({
      nodes: ctx.nodes,
      connections: ctx.connections,
      canUndo: commandStack.canUndo(),
      canRedo: commandStack.canRedo(),
      isDirty: true,
    });
    get()._scheduleAutoSave();
  };

  return {
    // storage
    storage: null,
    storageKind: 'local',
    // projects
    projects: [],
    project: null,
    nodes: [],
    connections: [],
    selectedNodeId: null,
    selectedConnectionId: null,
    // play mode
    playMode: {
      active: false,
      currentNodeId: null,
      history: [],
      isPlaying: false,
      speed: 1500,
      completed: new Set(),
    },
    // ui
    activeView: 'dashboard', // dashboard | editor
    settingsOpen: false,
    detailEditor: { open: false, nodeId: null },
    picker: null, // { sourceNodeId, direction, branchLabel? }
    connectMode: null, // { sourceNodeId, direction }
    validation: { issues: [] },
    canUndo: false,
    canRedo: false,
    isDirty: false,
    autoSaveEnabled: true,
    theme: 'light',
    lastSavedAt: null,

    setStorage(storage, kind) {
      set({ storage, storageKind: kind });
    },

    async loadProjects() {
      const { storage } = get();
      if (!storage) return;
      const projects = await storage.listProjects();
      set({ projects });
    },

    async createProject(name, description = '') {
      const { storage } = get();
      const now = new Date().toISOString();
      const project = {
        id: newId(),
        name,
        description,
        version: 1,
        createdAt: now,
        updatedAt: now,
        storageType: get().storageKind,
        metadata: {},
        nodes: [],
        connections: [],
      };
      const saved = await storage.createProject(project);
      await get().loadProjects();
      get().openProjectData(saved);
      return saved;
    },

    async openProject(id) {
      const project = await get().storage.openProject(id);
      get().openProjectData(project);
    },

    openProjectData(project) {
      commandStack.clear();
      set({
        project,
        nodes: project.nodes || [],
        connections: project.connections || [],
        selectedNodeId: null,
        selectedConnectionId: null,
        canUndo: false,
        canRedo: false,
        isDirty: false,
        activeView: 'editor',
      });
      get()._runValidation();
    },

    closeProject() {
      set({ activeView: 'dashboard', project: null, nodes: [], connections: [] });
    },

    async saveProject() {
      const { project, nodes, connections, storage } = get();
      if (!project || !storage) return;
      const payload = { ...project, nodes, connections, updatedAt: new Date().toISOString() };
      const saved = await storage.saveProject(payload);
      set({ project: saved, isDirty: false, lastSavedAt: new Date().toISOString() });
      await get().loadProjects();
    },

    async deleteProject(id) {
      await get().storage.deleteProject(id);
      await get().loadProjects();
      if (get().project?.id === id) get().closeProject();
    },

    // ---------- Node / connection mutations ----------
    addNodeAt(type, position, extra = {}) {
      const def = getNodeDefinition(type);
      const node = {
        id: newId(),
        projectId: get().project.id,
        type,
        title: extra.title || def.displayName,
        shortDescription: extra.shortDescription || '',
        detailedDescription: null,
        position,
        dimensions: def.defaultSize,
        metadata: {},
      };
      runCommand(commandFactory.addNode(node));
      set({ selectedNodeId: node.id });
      get()._runValidation();
      return node;
    },

    addConnectedNode({ sourceNodeId, direction, type, branchLabel }) {
      const source = get().nodes.find((n) => n.id === sourceNodeId);
      if (!source) return null;
      const def = getNodeDefinition(type);
      const sourceDef = getNodeDefinition(source.type);
      const offset = 220;
      const dx =
        direction === 'right' ? offset :
        direction === 'left' ? -offset : 0;
      const dy =
        direction === 'bottom' ? offset :
        direction === 'top' ? -offset : 0;
      const centerX = source.position.x + (source.dimensions?.width || sourceDef.defaultSize.width) / 2;
      const centerY = source.position.y + (source.dimensions?.height || sourceDef.defaultSize.height) / 2;
      const newX = centerX + dx - def.defaultSize.width / 2;
      const newY = centerY + dy - def.defaultSize.height / 2;
      const node = {
        id: newId(),
        projectId: get().project.id,
        type,
        title: def.displayName,
        shortDescription: '',
        detailedDescription: null,
        position: { x: newX, y: newY },
        dimensions: def.defaultSize,
        metadata: {},
      };
      let label = branchLabel || '';
      if (source.type === NODE_TYPES.DECISION && !branchLabel) {
        const outgoing = get().connections.filter((c) => c.sourceNodeId === sourceNodeId);
        const usedLabels = new Set(outgoing.map((c) => (c.label || '').toLowerCase()));
        if (!usedLabels.has('yes')) label = 'Yes';
        else if (!usedLabels.has('no')) label = 'No';
      }
      const conn = {
        id: newId(),
        projectId: get().project.id,
        sourceNodeId,
        sourceHandle: `${direction}-source`,
        targetNodeId: node.id,
        targetHandle: `${OPPOSITE_DIRECTION[direction]}-target`,
        label,
        type: 'default',
        metadata: {},
      };
      runCommand(commandFactory.addNodeWithConnection(node, conn));
      set({ selectedNodeId: node.id, picker: null });
      get()._runValidation();
      return { node, connection: conn };
    },

    connectExistingNode({ sourceNodeId, direction, targetNodeId, branchLabel }) {
      const state = get();
      if (sourceNodeId === targetNodeId) return null;
      // Reject if target already connected as target of source
      const dup = state.connections.find(
        (c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId
      );
      if (dup) return null;
      const source = state.nodes.find((n) => n.id === sourceNodeId);
      let label = branchLabel || '';
      if (source?.type === NODE_TYPES.DECISION && !branchLabel) {
        const outgoing = state.connections.filter((c) => c.sourceNodeId === sourceNodeId);
        const usedLabels = new Set(outgoing.map((c) => (c.label || '').toLowerCase()));
        if (!usedLabels.has('yes')) label = 'Yes';
        else if (!usedLabels.has('no')) label = 'No';
      }
      const conn = {
        id: newId(),
        projectId: get().project.id,
        sourceNodeId,
        sourceHandle: `${direction}-source`,
        targetNodeId,
        targetHandle: `${OPPOSITE_DIRECTION[direction]}-target`,
        label,
        type: 'default',
        metadata: {},
      };
      runCommand(commandFactory.addConnection(conn));
      set({ connectMode: null });
      get()._runValidation();
      return conn;
    },

    deleteNode(nodeId) {
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const related = get().connections.filter(
        (c) => c.sourceNodeId === nodeId || c.targetNodeId === nodeId
      );
      runCommand(commandFactory.deleteNode(node, related));
      set({ selectedNodeId: null });
      get()._runValidation();
    },

    deleteConnection(connId) {
      const conn = get().connections.find((c) => c.id === connId);
      if (!conn) return;
      runCommand(commandFactory.deleteConnection(conn));
      set({ selectedConnectionId: null });
      get()._runValidation();
    },

    moveNode(nodeId, from, to) {
      if (from.x === to.x && from.y === to.y) return;
      runCommand(commandFactory.moveNode(nodeId, from, to));
    },

    updateNode(nodeId, patch) {
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const previous = Object.keys(patch).reduce((acc, k) => ({ ...acc, [k]: node[k] }), {});
      runCommand(commandFactory.updateNode(nodeId, patch, previous));
      get()._runValidation();
    },

    updateConnection(connId, patch) {
      const conn = get().connections.find((c) => c.id === connId);
      if (!conn) return;
      const previous = Object.keys(patch).reduce((acc, k) => ({ ...acc, [k]: conn[k] }), {});
      runCommand(commandFactory.updateConnection(connId, patch, previous));
      get()._runValidation();
    },

    async runAutoLayout(direction = 'DOWN') {
      const { nodes, connections } = get();
      if (nodes.length === 0) return;
      const prev = nodes.map((n) => ({ id: n.id, position: { ...n.position } }));
      const positions = await elkAutoLayout(nodes, connections, direction);
      runCommand(commandFactory.autoLayout(prev, positions));
    },

    undo() {
      const ctx = { nodes: [...get().nodes], connections: [...get().connections] };
      if (commandStack.undo(ctx)) {
        set({
          nodes: ctx.nodes,
          connections: ctx.connections,
          canUndo: commandStack.canUndo(),
          canRedo: commandStack.canRedo(),
          isDirty: true,
        });
        get()._runValidation();
        get()._scheduleAutoSave();
      }
    },
    redo() {
      const ctx = { nodes: [...get().nodes], connections: [...get().connections] };
      if (commandStack.redo(ctx)) {
        set({
          nodes: ctx.nodes,
          connections: ctx.connections,
          canUndo: commandStack.canUndo(),
          canRedo: commandStack.canRedo(),
          isDirty: true,
        });
        get()._runValidation();
        get()._scheduleAutoSave();
      }
    },

    // ---------- Selection & UI ----------
    selectNode(id) { set({ selectedNodeId: id, selectedConnectionId: null }); },
    selectConnection(id) { set({ selectedConnectionId: id, selectedNodeId: null }); },
    clearSelection() { set({ selectedNodeId: null, selectedConnectionId: null }); },
    openPicker(payload) { set({ picker: payload, connectMode: null }); },
    closePicker() { set({ picker: null }); },
    startConnectExisting({ sourceNodeId, direction }) {
      set({ connectMode: { sourceNodeId, direction }, picker: null });
    },
    cancelConnect() { set({ connectMode: null }); },
    openDetailEditor(nodeId) { set({ detailEditor: { open: true, nodeId } }); },
    closeDetailEditor() { set({ detailEditor: { open: false, nodeId: null } }); },
    openSettings() { set({ settingsOpen: true }); },
    closeSettings() { set({ settingsOpen: false }); },
    setTheme(theme) {
      set({ theme });
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('ws-theme', theme);
    },
    setAutoSaveEnabled(enabled) { set({ autoSaveEnabled: enabled }); },

    // ---------- Play mode ----------
    startPlayMode() {
      const start = get().nodes.find((n) => n.type === NODE_TYPES.START);
      if (!start) return;
      set({
        playMode: {
          active: true,
          currentNodeId: start.id,
          history: [start.id],
          isPlaying: false,
          speed: 1500,
          completed: new Set(),
        },
        selectedNodeId: start.id,
      });
    },
    stopPlayMode() {
      set({
        playMode: {
          active: false,
          currentNodeId: null,
          history: [],
          isPlaying: false,
          speed: 1500,
          completed: new Set(),
        },
      });
    },
    playModeNext(branchLabel) {
      const { playMode, nodes, connections } = get();
      if (!playMode.active || !playMode.currentNodeId) return;
      const current = nodes.find((n) => n.id === playMode.currentNodeId);
      if (!current) return;
      const outgoing = connections.filter((c) => c.sourceNodeId === playMode.currentNodeId);
      if (outgoing.length === 0) {
        set({ playMode: { ...playMode, isPlaying: false } });
        return;
      }
      let next = outgoing[0];
      if (current.type === NODE_TYPES.DECISION && branchLabel) {
        next = outgoing.find((c) => (c.label || '').toLowerCase() === branchLabel.toLowerCase()) || next;
      }
      const completed = new Set(playMode.completed);
      completed.add(playMode.currentNodeId);
      set({
        playMode: {
          ...playMode,
          currentNodeId: next.targetNodeId,
          history: [...playMode.history, next.targetNodeId],
          completed,
        },
        selectedNodeId: next.targetNodeId,
      });
    },
    playModePrevious() {
      const { playMode } = get();
      if (!playMode.active || playMode.history.length <= 1) return;
      const history = [...playMode.history];
      history.pop();
      const currentNodeId = history[history.length - 1];
      const completed = new Set(playMode.completed);
      completed.delete(currentNodeId);
      set({
        playMode: { ...playMode, history, currentNodeId, completed },
        selectedNodeId: currentNodeId,
      });
    },
    playModeRestart() {
      const start = get().nodes.find((n) => n.type === NODE_TYPES.START);
      if (!start) return;
      set({
        playMode: {
          ...get().playMode,
          currentNodeId: start.id,
          history: [start.id],
          completed: new Set(),
          isPlaying: false,
        },
        selectedNodeId: start.id,
      });
    },
    playModeToggleAuto() {
      const { playMode } = get();
      set({ playMode: { ...playMode, isPlaying: !playMode.isPlaying } });
    },
    playModeSetSpeed(speed) {
      set({ playMode: { ...get().playMode, speed } });
    },

    // ---------- Internal ----------
    _runValidation() {
      const { nodes, connections } = get();
      set({ validation: validateWorkflow(nodes, connections) });
    },
    _scheduleAutoSave() {
      if (!get().autoSaveEnabled || !get().project) return;
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        get().saveProject().catch((e) => console.warn('Auto-save failed', e));
      }, 1000);
    },
  };
});
