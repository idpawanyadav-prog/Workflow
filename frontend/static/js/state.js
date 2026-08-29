import { api } from './api.js';
import { typeDef } from './nodes.js';

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export const state = {
  project: null,
  nodes: [],
  connections: [],
  selection: { nodeId: null, connId: null },
  zoom: 1, panX: 0, panY: 0,
  saveStatus: 'Saved',
  play: null,
};

let undoStack = [];
let redoStack = [];
let lastSnapshot = null;
let saveTimer = null;

const serialize = () => JSON.stringify({ nodes: state.nodes, connections: state.connections });
const uid = () => crypto.randomUUID();

export function loadProject(project) {
  state.project = project;
  state.nodes = (project.graph?.nodes) || [];
  state.connections = (project.graph?.connections) || [];
  state.selection = { nodeId: null, connId: null };
  undoStack = []; redoStack = [];
  lastSnapshot = serialize();
  state.saveStatus = 'Saved';
  emit('graph');
  emit('selection');
}

export function commit() {
  undoStack.push(lastSnapshot);
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  lastSnapshot = serialize();
  scheduleSave();
  emit('graph');
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(serialize());
  applySnapshot(undoStack.pop());
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(serialize());
  applySnapshot(redoStack.pop());
}

function applySnapshot(snap) {
  const g = JSON.parse(snap);
  state.nodes = g.nodes;
  state.connections = g.connections;
  lastSnapshot = snap;
  state.selection = { nodeId: null, connId: null };
  scheduleSave();
  emit('graph');
  emit('selection');
}

function scheduleSave() {
  state.saveStatus = 'Unsaved';
  emit('savestatus');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!state.project) return;
    state.saveStatus = 'Saving\u2026';
    emit('savestatus');
    try {
      await api.saveGraph(state.project.id, { nodes: state.nodes, connections: state.connections });
      state.saveStatus = 'Saved';
    } catch (e) {
      state.saveStatus = 'Save failed';
      emit('toast', { message: 'Auto-save failed: ' + e.message, type: 'error' });
    }
    emit('savestatus');
  }, 800);
}

export const getNode = (id) => state.nodes.find((n) => n.id === id);
export const outgoing = (id) => state.connections.filter((c) => c.source === id);
export const incoming = (id) => state.connections.filter((c) => c.target === id);

export function addNode(type, position, opts = {}) {
  const def = typeDef(type);
  if (type === 'start' && state.nodes.some((n) => n.type === 'start')) {
    emit('toast', { message: 'A workflow can only have one Start node', type: 'error' });
    return null;
  }
  const node = {
    id: uid(), type,
    title: opts.title || def.label,
    shortDescription: '', detailedDescription: '',
    position: { x: Math.round(position.x / 8) * 8, y: Math.round(position.y / 8) * 8 },
  };
  if (opts.accent) node.accent = opts.accent;
  state.nodes.push(node);
  if (!opts.silent) {
    commit();
    setSelection(node.id, null);
  }
  return node;
}

export function updateNode(id, patch) {
  const n = getNode(id);
  if (!n) return;
  Object.assign(n, patch);
  commit();
}

export function deleteNode(id) {
  state.nodes = state.nodes.filter((n) => n.id !== id);
  state.connections = state.connections.filter((c) => c.source !== id && c.target !== id);
  const cleared = state.selection.nodeId === id;
  if (cleared) state.selection.nodeId = null;
  relabelDecisions();
  commit();
  if (cleared) emit('selection');
}

export function addConnection(sourceId, sourceDir, targetId, targetDir, opts = {}) {
  if (sourceId === targetId) return null;
  const src = getNode(sourceId), tgt = getNode(targetId);
  if (!src || !tgt) return null;
  if (state.connections.some((c) => c.source === sourceId && c.target === targetId)) {
    emit('toast', { message: 'These nodes are already connected', type: 'error' });
    return null;
  }
  const srcDef = typeDef(src.type), tgtDef = typeDef(tgt.type);
  if (outgoing(sourceId).length >= srcDef.maxOut) {
    emit('toast', { message: `${srcDef.label} allows max ${srcDef.maxOut} outgoing connection${srcDef.maxOut === 1 ? '' : 's'}`, type: 'error' });
    return null;
  }
  if (incoming(targetId).length >= tgtDef.maxIn) {
    emit('toast', { message: `${tgtDef.label} does not accept incoming connections`, type: 'error' });
    return null;
  }
  let label = '';
  if (src.type === 'decision') label = outgoing(sourceId).length === 0 ? 'Yes' : 'No';
  const conn = { id: uid(), source: sourceId, sourceDir, target: targetId, targetDir, label };
  state.connections.push(conn);
  if (!opts.silent) commit();
  return conn;
}

export function deleteConnection(id) {
  state.connections = state.connections.filter((c) => c.id !== id);
  const cleared = state.selection.connId === id;
  if (cleared) state.selection.connId = null;
  relabelDecisions();
  commit();
  if (cleared) emit('selection');
}

function relabelDecisions() {
  state.nodes.filter((n) => n.type === 'decision').forEach((n) => {
    outgoing(n.id).forEach((c, i) => { c.label = i === 0 ? 'Yes' : 'No'; });
  });
}

export function setSelection(nodeId, connId) {
  state.selection = { nodeId: nodeId || null, connId: connId || null };
  emit('selection');
}

export function deleteSelection() {
  if (state.selection.nodeId) deleteNode(state.selection.nodeId);
  else if (state.selection.connId) deleteConnection(state.selection.connId);
}

export function validate() {
  const warnings = [];
  if (!state.nodes.length) return warnings;
  const starts = state.nodes.filter((n) => n.type === 'start');
  if (!starts.length) warnings.push('No Start node in the workflow');
  if (!state.nodes.some((n) => n.type === 'end')) warnings.push('No End node in the workflow');
  state.nodes.forEach((n) => {
    if (state.nodes.length > 1 && !outgoing(n.id).length && !incoming(n.id).length) {
      warnings.push(`"${n.title}" is not connected to anything`);
    }
    if (n.type === 'decision' && outgoing(n.id).length < 2) {
      warnings.push(`Decision "${n.title}" needs both Yes and No branches`);
    }
  });
  return warnings;
}
