import { state, bus } from './state.js';
import { NODE_TYPES } from './nodes.js';
import { applyTransform } from './canvas.js';

const MM_W = 192, MM_H = 128, PAD = 60;
const mm = document.getElementById('minimap');
const svg = document.getElementById('minimap-svg');
let map = null;
let dragging = false;
let userHidden = false;

function update() {
  if (!state.project || !state.nodes.length || userHidden) { mm.classList.add('hidden'); return; }
  mm.classList.remove('hidden');
  const cr = document.getElementById('canvas').getBoundingClientRect();
  const view = { x: -state.panX / state.zoom, y: -state.panY / state.zoom, w: cr.width / state.zoom, h: cr.height / state.zoom };
  let minX = view.x, minY = view.y, maxX = view.x + view.w, maxY = view.y + view.h;
  state.nodes.forEach((n) => {
    const d = NODE_TYPES[n.type];
    minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + d.w); maxY = Math.max(maxY, n.position.y + d.h);
  });
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
  const s = Math.min(MM_W / (maxX - minX), MM_H / (maxY - minY));
  const ox = (MM_W - (maxX - minX) * s) / 2, oy = (MM_H - (maxY - minY) * s) / 2;
  map = { minX, minY, maxX, maxY, s, ox, oy, cw: cr.width, ch: cr.height };
  const px = (x) => (ox + (x - minX) * s).toFixed(1);
  const py = (y) => (oy + (y - minY) * s).toFixed(1);
  let html = '';
  state.nodes.forEach((n) => {
    const d = NODE_TYPES[n.type];
    html += `<rect x="${px(n.position.x)}" y="${py(n.position.y)}" width="${(d.w * s).toFixed(1)}" height="${(d.h * s).toFixed(1)}" rx="1.5" fill="${d.color}" opacity="0.85"></rect>`;
  });
  html += `<rect class="mm-view" x="${px(view.x)}" y="${py(view.y)}" width="${(view.w * s).toFixed(1)}" height="${(view.h * s).toFixed(1)}"></rect>`;
  svg.innerHTML = html;
}

function moveTo(e) {
  if (!map) return;
  const r = svg.getBoundingClientRect();
  const wx = Math.min(map.maxX, Math.max(map.minX, map.minX + (e.clientX - r.left - map.ox) / map.s));
  const wy = Math.min(map.maxY, Math.max(map.minY, map.minY + (e.clientY - r.top - map.oy) / map.s));
  state.panX = map.cw / 2 - wx * state.zoom;
  state.panY = map.ch / 2 - wy * state.zoom;
  applyTransform();
}

export function initMinimap() {
  mm.addEventListener('mousedown', (e) => { dragging = true; moveTo(e); e.stopPropagation(); e.preventDefault(); });
  window.addEventListener('mousemove', (e) => { if (dragging) moveTo(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  bus.addEventListener('graph', update);
  bus.addEventListener('transform', update);

  const mmToggle = document.getElementById('minimap-toggle-btn');
  function setMinimapHidden(hidden) {
    userHidden = hidden;
    localStorage.setItem('ws-minimap-hidden', hidden ? '1' : '0');
    mmToggle.classList.toggle('active', !hidden);
    mmToggle.title = hidden ? 'Show minimap' : 'Hide minimap';
    mmToggle.setAttribute('aria-label', mmToggle.title);
    update();
  }
  setMinimapHidden(localStorage.getItem('ws-minimap-hidden') === '1');
  mmToggle.addEventListener('click', () => setMinimapHidden(!userHidden));
}
