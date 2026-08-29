import { api } from './api.js';
import { state, loadProject, addNode, addConnection, commit } from './state.js';
import { render, fitView, applyTransform } from './canvas.js';
import { initTheme, buildPalette, initPicker, initDocPanel, wireTopbar, wireImport, wireCreateProject, renderDashboard, closeDoc, showToast } from './ui.js';
import { wirePlayControls, exitPlay } from './play.js';

const dashView = document.getElementById('view-dashboard');
const editorView = document.getElementById('view-editor');

function goHome() { location.hash = ''; }
function openProject(id, seed = false) { location.hash = `#/p/${id}${seed ? '?seed=1' : ''}`; }

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
  dashView.classList.add('hidden');
  editorView.classList.remove('hidden');
  document.getElementById('project-title').value = project.name;
  loadProject(project);
  if (seed && !state.nodes.length) seedStarter();
  state.zoom = 1; state.panX = 0; state.panY = 0;
  applyTransform();
  render();
  fitView(false);
}

function seedStarter() {
  const start = addNode('start', { x: 320, y: 96 }, { silent: true });
  const proc = addNode('process', { x: 304, y: 300 }, { silent: true });
  addConnection(start.id, 'bottom', proc.id, 'top', { silent: true });
  commit();
}

initTheme();
buildPalette();
initPicker();
initDocPanel();
wireTopbar(goHome);
wireImport(() => renderDashboard(openProject));
wireCreateProject(openProject);
wirePlayControls();

window.addEventListener('hashchange', route);
route();
