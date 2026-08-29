import { state, bus, emit, getNode, outgoing } from './state.js';
import { render, centerOn, zoomToNode } from './canvas.js';
import { getSettings } from './settings.js';
import { NODE_TYPES } from './nodes.js';

const bar = document.getElementById('play-bar');
const stepEl = document.getElementById('play-step');
const nextBtn = document.getElementById('play-next-btn');
const choicesEl = document.getElementById('play-choices');
const enterSubflowBtn = document.getElementById('play-enter-subflow-btn');
const backParentBtn = document.getElementById('play-back-parent-btn');
const backParentLabel = document.getElementById('play-back-parent-label');
const summaryEl = document.getElementById('play-summary');
const summaryTitleEl = document.getElementById('play-summary-title');
const summaryDescEl = document.getElementById('play-summary-desc');

// Play-navigation stack: each entry records the parent flow + the subflow node
// we entered from, so we can return at any time (and nest several levels).
const PLAY_STACK_KEY = 'ws-play-stack';
function readPlayStack() {
  try { return JSON.parse(sessionStorage.getItem(PLAY_STACK_KEY) || '[]'); }
  catch { return []; }
}
function writePlayStack(stack) { sessionStorage.setItem(PLAY_STACK_KEY, JSON.stringify(stack)); }
export function clearPlayStack() { sessionStorage.removeItem(PLAY_STACK_KEY); }

export function enterPlay(startId) {
  const start = (startId && state.nodes.find((n) => n.id === startId))
    || state.nodes.find((n) => n.type === 'start')
    || state.nodes[0];
  if (!start) {
    emit('toast', { message: 'Add at least one node before playing', type: 'error' });
    return;
  }
  state.play = {
    current: start.id,
    history: [],
    traversed: new Set(),
    visitedNodes: new Set(),
    lastConn: null,
  };
  bar.classList.remove('hidden');
  document.getElementById('play-btn').classList.add('active');
  document.getElementById('palette').classList.add('palette-hidden');
  update();
  requestAnimationFrame(() => zoomToNode(start.id, true));
}

export function exitPlay() {
  state.play = null;
  bar.classList.add('hidden');
  choicesEl.classList.add('hidden');
  summaryEl.classList.add('hidden');
  document.getElementById('play-btn').classList.remove('active');
  document.getElementById('palette').classList.remove('palette-hidden');
  render();
}

export function restart() {
  if (!state.play) return;
  exitPlay();
  enterPlay();
}

function update() {
  const play = state.play;
  stepEl.textContent = `STEP ${play.history.length + 1}`;
  const outs = outgoing(play.current);
  const node = getNode(play.current);
  const needsChoice = node.type === 'decision' && outs.length > 1;
  choicesEl.classList.toggle('hidden', !needsChoice);
  nextBtn.classList.toggle('hidden', needsChoice);
  if (needsChoice) {
    choicesEl.innerHTML = '';
    outs.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'btn choice-btn';
      b.dataset.testid = `play-choice-btn-${(c.label || 'branch').toLowerCase()}`;
      b.textContent = c.label || 'Branch';
      b.addEventListener('click', () => advance(c));
      choicesEl.appendChild(b);
    });
  } else if (!outs.length) {
    const hasParent = readPlayStack().length > 0;
    nextBtn.textContent = hasParent ? 'End of flow \u2192 Parent' : 'End Play';
    nextBtn.disabled = false;
  } else {
    nextBtn.textContent = 'Next \u2192';
    nextBtn.disabled = false;
  }
  const linked = node.type === 'subflow' && node.subflow && node.subflow.projectId;
  enterSubflowBtn.classList.toggle('hidden', !linked);
  const stack = readPlayStack();
  backParentBtn.classList.toggle('hidden', stack.length === 0);
  if (stack.length) backParentLabel.textContent = stack[stack.length - 1].name;
  updateSummary(node);
  render();
}

function updateSummary(node) {
  const enabled = getSettings().play.showSummary !== false;
  if (!enabled) { summaryEl.classList.add('hidden'); return; }
  summaryTitleEl.textContent = node.title || (NODE_TYPES[node.type] && NODE_TYPES[node.type].label) || 'Step';
  const desc = node.shortDescription || stripHtml(node.detailedDescription) || '';
  summaryDescEl.textContent = desc;
  summaryDescEl.classList.toggle('hidden', !desc);
  summaryEl.classList.remove('hidden');
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent.trim();
}

function advance(conn) {
  const play = state.play;
  play.history.push({ nodeId: play.current, connId: conn.id });
  play.visitedNodes.add(play.current);
  play.traversed.add(conn.id);
  play.lastConn = conn.id;
  play.current = conn.target;
  update();
  centerOn(play.current, true);
}

export function next() {
  const play = state.play;
  if (!play) return;
  const outs = outgoing(play.current);
  if (!outs.length) {
    // Reached the end: return to the parent flow when this is a child flow,
    // otherwise finish playback.
    if (readPlayStack().length) backToParentPlay();
    else exitPlay();
    return;
  }
  const node = getNode(play.current);
  if (node.type === 'decision' && outs.length > 1) return; // must choose
  advance(outs[0]);
}

export function prev() {
  const play = state.play;
  if (!play || !play.history.length) return;
  const last = play.history.pop();
  play.traversed.delete(last.connId);
  play.visitedNodes.delete(last.nodeId);
  play.current = last.nodeId;
  play.lastConn = play.history.length ? play.history[play.history.length - 1].connId : null;
  update();
  centerOn(play.current, true);
}

function enterSubflowPlay() {
  const play = state.play;
  if (!play) return;
  const node = getNode(play.current);
  if (!node || node.type !== 'subflow' || !node.subflow || !node.subflow.projectId) return;
  const stack = readPlayStack();
  stack.push({ projectId: state.project.id, name: state.project.name, nodeId: node.id });
  writePlayStack(stack);
  location.hash = `#/p/${node.subflow.projectId}?play=1`;
}

function backToParentPlay() {
  const stack = readPlayStack();
  const parent = stack.pop();
  writePlayStack(stack);
  if (!parent) return;
  location.hash = `#/p/${parent.projectId}?play=1&resumeNode=${parent.nodeId}`;
}

export function wirePlayControls() {
  document.getElementById('play-btn').addEventListener('click', () => (state.play ? exitPlay() : enterPlay()));
  document.getElementById('play-exit-btn').addEventListener('click', exitPlay);
  document.getElementById('play-restart-btn').addEventListener('click', restart);
  document.getElementById('play-next-btn').addEventListener('click', next);
  document.getElementById('play-prev-btn').addEventListener('click', prev);
  document.getElementById('play-enter-subflow-btn').addEventListener('click', enterSubflowPlay);
  document.getElementById('play-back-parent-btn').addEventListener('click', backToParentPlay);

  // Start (or restart) playback from a specific node, triggered by a
  // double-click on that node while in play mode.
  bus.addEventListener('playfrom', (e) => {
    const nodeId = e.detail && e.detail.nodeId;
    if (!nodeId || !state.nodes.some((n) => n.id === nodeId)) return;
    const node = getNode(nodeId);
    exitPlay();
    enterPlay(nodeId);
    if (node) emit('toast', { message: `Playing from \u201c${node.title}\u201d`, type: 'info' });
  });

  window.addEventListener('keydown', (e) => {
    if (!state.play) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Escape') exitPlay();
  });
}
