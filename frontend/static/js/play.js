import { state, emit, getNode, outgoing } from './state.js';
import { render, centerOn } from './canvas.js';

const bar = document.getElementById('play-bar');
const stepEl = document.getElementById('play-step');
const nextBtn = document.getElementById('play-next-btn');
const choicesEl = document.getElementById('play-choices');

export function enterPlay() {
  const start = state.nodes.find((n) => n.type === 'start') || state.nodes[0];
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
  update();
  centerOn(start.id, true);
}

export function exitPlay() {
  state.play = null;
  bar.classList.add('hidden');
  choicesEl.classList.add('hidden');
  document.getElementById('play-btn').classList.remove('active');
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
    nextBtn.textContent = 'End of flow';
    nextBtn.disabled = true;
  } else {
    nextBtn.textContent = 'Next \u2192';
    nextBtn.disabled = false;
  }
  render();
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
  if (!outs.length) return;
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

export function wirePlayControls() {
  document.getElementById('play-btn').addEventListener('click', () => (state.play ? exitPlay() : enterPlay()));
  document.getElementById('play-exit-btn').addEventListener('click', exitPlay);
  document.getElementById('play-restart-btn').addEventListener('click', restart);
  document.getElementById('play-next-btn').addEventListener('click', next);
  document.getElementById('play-prev-btn').addEventListener('click', prev);
  window.addEventListener('keydown', (e) => {
    if (!state.play) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Escape') exitPlay();
  });
}
