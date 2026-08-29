import { api } from './api.js';
import { state, loadProject, addNode, addConnection, commit } from './state.js';
import { render, fitView, applyTransform } from './canvas.js';
import { initTheme, buildPalette, initPaletteToggle, initPicker, initDocPanel, wireTopbar, wireImport, wireCreateProject, renderDashboard, closeDoc, showToast, wireAiDraft } from './ui.js';
import { wirePlayControls, exitPlay, enterPlay, clearPlayStack } from './play.js';
import { initMinimap } from './minimap.js';

const dashView = document.getElementById('view-dashboard');
const editorView = document.getElementById('view-editor');

function goHome() { location.hash = ''; }
function openProject(id, seed = false) { location.hash = `#/p/${id}${seed ? '?seed=1' : ''}`; }

// Read optional parent-flow info from the hash (e.g. #/p/ID?parent=ID&parentName=Name)
function parseParent() {
  const q = (location.hash.split('?')[1] || '');
  const params = new URLSearchParams(q);
  const parent = params.get('parent');
  if (!parent) return null;
  return { id: parent, name: params.get('parentName') || 'Parent flow' };
}

function updateParentButton() {
  const btn = document.getElementById('parent-btn');
  const parent = parseParent();
  if (parent) {
    btn.classList.remove('hidden');
    document.getElementById('parent-btn-label').textContent = parent.name;
  } else {
    btn.classList.add('hidden');
  }
}

async function route() {
  const m = location.hash.match(/^#\/p\/([a-f0-9-]+)/i);
  if (m) {
    const seed = location.hash.includes('seed=1');
    await showEditor(m[1], seed);
  } else {
    showDashboard();
  }
}

function showDashboard() {
  exitPlay();
  clearPlayStack();
  closeDoc();
  state.project = null;
  editorView.classList.add('hidden');
  dashView.classList.remove('hidden');
  renderDashboard(openProject);
}

async function showEditor(id, seed) {
  let project;
  try {
    project = await api.getProject(id);
  } catch (e) {
    showToast('Project not found', 'error');
    goHome();
    return;
  }
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const autoPlay = q.get('play') === '1';
  if (autoPlay) {
    state.play = null;
  } else {
    exitPlay();
    clearPlayStack();
  }
  dashView.classList.add('hidden');
  editorView.classList.remove('hidden');
  document.getElementById('project-title').value = project.name;
  loadProject(project);
  if (seed && !state.nodes.length) seedStarter();
  state.zoom = 1; state.panX = 0; state.panY = 0;
  applyTransform();
  render();
  fitView(false);
  updateParentButton();
  if (autoPlay) enterPlay(q.get('resumeNode') || undefined);
}

function seedStarter() {
  const start = addNode('start', { x: 320, y: 96 }, { silent: true });
  const proc = addNode('process', { x: 304, y: 300 }, { silent: true });
  addConnection(start.id, 'bottom', proc.id, 'top', { silent: true });
  commit();
}

initTheme();
buildPalette();
initPaletteToggle();
initPicker();
initDocPanel();
wireTopbar(goHome);
wireImport(() => renderDashboard(openProject));
wireCreateProject(openProject);
wirePlayControls();
wireAiDraft();
initMinimap();

document.getElementById('parent-btn').addEventListener('click', () => {
  const parent = parseParent();
  if (parent) location.hash = `#/p/${parent.id}`;
});

window.addEventListener('hashchange', route);
route();
