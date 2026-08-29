import { DIRS, DIRV, OPPOSITE, portPoint, nodeSize, typeDef, nodeAppearance } from './nodes.js';
import { state, bus, emit, getNode, addConnection, setSelection, deleteSelection, commit, validate } from './state.js';

const canvas = document.getElementById('canvas');
const world = document.getElementById('world');
const nodeLayer = document.getElementById('node-layer');
const edgeGroup = document.getElementById('edge-group');
const tempEdge = document.getElementById('temp-edge');

let pickerCallback = null;
export function onPickerRequest(cb) { pickerCallback = cb; }

// ---------- transforms ----------
export function applyTransform(animated = false) {
  world.classList.toggle('animated', animated);
  world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  canvas.style.backgroundSize = `${24 * state.zoom}px ${24 * state.zoom}px`;
  canvas.style.backgroundPosition = `${state.panX}px ${state.panY}px`;
  const zl = document.getElementById('zoom-level');
  if (zl) zl.textContent = `${Math.round(state.zoom * 100)}%`;
  emit('transform');
  if (animated) setTimeout(() => world.classList.remove('animated'), 350);
}

export function screenToWorld(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left - state.panX) / state.zoom, y: (cy - r.top - state.panY) / state.zoom };
}

export function setZoom(z, cx, cy) {
  const r = canvas.getBoundingClientRect();
  const mx = cx !== undefined ? cx - r.left : r.width / 2;
  const my = cy !== undefined ? cy - r.top : r.height / 2;
  const nz = Math.min(2.5, Math.max(0.2, z));
  state.panX = mx - ((mx - state.panX) / state.zoom) * nz;
  state.panY = my - ((my - state.panY) / state.zoom) * nz;
  state.zoom = nz;
  applyTransform();
}

export function fitView(animated = true) {
  if (!state.nodes.length) { state.zoom = 1; state.panX = 80; state.panY = 80; applyTransform(animated); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.nodes.forEach((n) => {
    const { w, h } = nodeSize(n);
    minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w); maxY = Math.max(maxY, n.position.y + h);
  });
  const r = canvas.getBoundingClientRect();
  const pad = 80;
  const z = Math.min(2, Math.max(0.2, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))));
  state.zoom = z;
  state.panX = (r.width - (maxX - minX) * z) / 2 - minX * z;
  state.panY = (r.height - (maxY - minY) * z) / 2 - minY * z;
  applyTransform(animated);
}

export function centerOn(nodeId, animated = true, zoomTo) {
  const n = getNode(nodeId);
  if (!n) return;
  const { w, h } = nodeSize(n);
  const r = canvas.getBoundingClientRect();
  if (zoomTo != null) {
    state.zoom = Math.min(2.5, Math.max(0.2, zoomTo));
  }
  state.panX = r.width / 2 - (n.position.x + w / 2) * state.zoom;
  state.panY = r.height / 2 - (n.position.y + h / 2) * state.zoom;
  applyTransform(animated);
}

/** Zoom close enough that the node is the focus, then center on it. */
export function zoomToNode(nodeId, animated = true) {
  const n = getNode(nodeId);
  if (!n) return;
  const { w, h } = nodeSize(n);
  const r = canvas.getBoundingClientRect();
  const padX = Math.min(280, r.width * 0.28);
  const padY = Math.min(220, r.height * 0.28);
  const z = Math.min(2.2, Math.max(1.35,
    Math.min((r.width - padX * 2) / Math.max(w, 1), (r.height - padY * 2) / Math.max(h, 1)),
  ));
  centerOn(nodeId, animated, z);
}

// ---------- rendering ----------
export function render() {
  renderNodes();
  renderEdges();
  renderValidation();
}

function renderNodes() {
  nodeLayer.innerHTML = '';
  state.nodes.forEach((n) => {
    const def = nodeAppearance(n);
    const el = document.createElement('div');
    el.className = `wf-node shape-${def.shape}`;
    el.dataset.id = n.id;
    el.dataset.testid = 'workflow-node';
    el.dataset.nodeType = n.type;
    el.style.width = def.w + 'px';
    el.style.height = def.h + 'px';
    el.style.transform = `translate(${n.position.x}px, ${n.position.y}px)`;
    el.style.setProperty('--node-accent', def.color);
    if (n.shortDescription) el.title = n.shortDescription;
    if (state.selection.nodeId === n.id) el.classList.add('selected');

    if (def.shape === 'diamond') {
      el.innerHTML = `
        <svg class="diamond-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,2 98,50 50,98 2,50"></polygon>
        </svg>
        <div class="node-inner diamond-inner">
          <span class="node-icon">${def.icon}</span>
          <span class="node-title">${escapeHtml(n.title)}</span>
        </div>`;
    } else {
      const sub = (n.type === 'subflow' && n.subflow && n.subflow.projectId) ? n.subflow : null;
      el.innerHTML = `
        <div class="node-inner">
          <span class="node-icon">${def.icon}</span>
          <div class="node-text">
            <span class="node-title">${escapeHtml(n.title)}</span>
            <span class="node-type mono-label">${def.label.toUpperCase()}</span>
            ${sub ? `<span class="node-subflow">&#8601; ${escapeHtml(sub.name)}<span class="node-subflow-count"> &middot; ${sub.nodeCount ?? 0}N / ${sub.connectionCount ?? 0}L</span></span>` : ''}
          </div>
        </div>`;
    }
    DIRS.forEach((dir) => {
      const p = document.createElement('button');
      p.className = `port port-${dir}`;
      p.dataset.dir = dir;
      p.dataset.testid = `node-port-${dir}`;
      p.title = 'Drag to connect \u00b7 Click to add a shape';
      el.appendChild(p);
    });
    nodeLayer.appendChild(el);
  });
  applyPlayClasses();
}

function renderEdges() {
  edgeGroup.innerHTML = '';
  state.connections.forEach((c) => {
    const src = getNode(c.source), tgt = getNode(c.target);
    if (!src || !tgt) return;
    const p1 = portPoint(src, c.sourceDir), p2 = portPoint(tgt, c.targetDir);
    const d = edgePath(p1, c.sourceDir, p2, c.targetDir);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.id = c.id;
    g.setAttribute('data-testid', 'workflow-edge');
    g.classList.add('edge');
    if (state.selection.connId === c.id) g.classList.add('selected');
    const hit = mkPath(d, 'edge-hit');
    const vis = mkPath(d, 'edge-path');
    vis.setAttribute('marker-end', 'url(#arrow)');
    g.appendChild(hit); g.appendChild(vis);
    if (c.label) {
      const m = bezierMid(p1, c.sourceDir, p2, c.targetDir);
      const lw = c.label.length * 8 + 16;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', m.x - lw / 2); rect.setAttribute('y', m.y - 12);
      rect.setAttribute('width', lw); rect.setAttribute('height', 24);
      rect.setAttribute('rx', 4); rect.classList.add('edge-label-bg');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', m.x); text.setAttribute('y', m.y + 4);
      text.setAttribute('text-anchor', 'middle');
      text.classList.add('edge-label');
      text.setAttribute('data-testid', 'edge-label');
      text.textContent = c.label;
      g.appendChild(rect); g.appendChild(text);
    }
    edgeGroup.appendChild(g);
  });
  applyPlayClasses();
}

function mkPath(d, cls) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.classList.add(cls);
  return p;
}

function ctrlPoints(p1, d1, p2, d2) {
  const ax = DIRV[d1][0] ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y);
  const across = DIRV[d1][0] ? Math.abs(p2.y - p1.y) : Math.abs(p2.x - p1.x);
  const o = Math.min(Math.max(ax / 2, 36), across > 180 ? 72 : 96);
  return [
    { x: p1.x + DIRV[d1][0] * o, y: p1.y + DIRV[d1][1] * o },
    { x: p2.x + DIRV[d2][0] * o, y: p2.y + DIRV[d2][1] * o },
  ];
}

export function edgePath(p1, d1, p2, d2) {
  const [c1, c2] = ctrlPoints(p1, d1, p2, d2);
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
}

function bezierMid(p1, d1, p2, d2) {
  const [c1, c2] = ctrlPoints(p1, d1, p2, d2);
  const t = 0.5, mt = 1 - t;
  return {
    x: mt ** 3 * p1.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p2.x,
    y: mt ** 3 * p1.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p2.y,
  };
}

export function buildFlowSvg() {
  if (!state.nodes.length) return null;
  const dark = document.documentElement.dataset.theme === 'dark';
  const C = dark
    ? { bg: '#0A0A0A', surface: '#141414', border: '#333333', text: '#F5F5F5', text2: '#A3A3A3', shadow: 'rgba(255,255,255,0.16)' }
    : { bg: '#F7F7F5', surface: '#FFFFFF', border: '#1A1A1A', text: '#1A1A1A', text2: '#525252', shadow: 'rgba(26,26,26,1)' };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.nodes.forEach((n) => {
    const { w, h } = nodeSize(n);
    minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w); maxY = Math.max(maxY, n.position.y + h);
  });
  const pad = 56;
  const ox = minX - pad, oy = minY - pad;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const X = (x) => x - ox;
  const Y = (y) => y - oy;
  const parts = [];
  parts.push(`<rect width="${width}" height="${height}" fill="${C.bg}"/>`);
  parts.push(`<defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.text2}"/></marker></defs>`);

  state.connections.forEach((c) => {
    const src = getNode(c.source), tgt = getNode(c.target);
    if (!src || !tgt) return;
    const p1 = portPoint(src, c.sourceDir), p2 = portPoint(tgt, c.targetDir);
    const a = { x: X(p1.x), y: Y(p1.y) }, b = { x: X(p2.x), y: Y(p2.y) };
    parts.push(`<path d="${edgePath(a, c.sourceDir, b, c.targetDir)}" fill="none" stroke="${C.text2}" stroke-width="2" marker-end="url(#flow-arrow)"/>`);
    if (c.label) {
      const m = bezierMid(a, c.sourceDir, b, c.targetDir);
      const lw = c.label.length * 8 + 16;
      parts.push(`<rect x="${(m.x - lw / 2).toFixed(1)}" y="${(m.y - 12).toFixed(1)}" width="${lw}" height="24" rx="4" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>`);
      parts.push(`<text x="${m.x.toFixed(1)}" y="${(m.y + 4).toFixed(1)}" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="11" font-weight="600" fill="${C.text}">${escapeHtml(c.label)}</text>`);
    }
  });

  state.nodes.forEach((n) => {
    const def = nodeAppearance(n);
    const x = X(n.position.x), y = Y(n.position.y), w = def.w, h = def.h;
    const iconInner = String(def.icon).replace(/^<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    const title = escapeHtml(n.title || def.label);
    if (def.shape === 'diamond') {
      const cx = x + w / 2, cy = y + h / 2;
      parts.push(`<polygon points="${cx + 4},${y + 8} ${x + w},${cy + 4} ${cx + 4},${y + h} ${x + 8},${cy + 4}" fill="${C.shadow}"/>`);
      parts.push(`<polygon points="${cx},${y + 4} ${x + w - 4},${cy} ${cx},${y + h - 4} ${x + 4},${cy}" fill="${C.surface}" stroke="${C.border}" stroke-width="1.5"/>`);
      parts.push(`<svg x="${cx - 10}" y="${y + h * 0.28}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${def.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconInner}</svg>`);
      parts.push(`<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-size="12.5" font-weight="600" fill="${C.text}">${title}</text>`);
    } else {
      const rx = def.shape === 'pill' ? h / 2 : 8;
      parts.push(`<rect x="${x + 4}" y="${y + 4}" width="${w}" height="${h}" rx="${rx}" fill="${C.shadow}"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>`);
      if (def.shape === 'pill') {
        parts.push(`<svg x="${x + 22}" y="${y + (h - 20) / 2}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${def.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconInner}</svg>`);
        parts.push(`<text x="${x + 48}" y="${y + h / 2 + 5}" font-family="Segoe UI, system-ui, sans-serif" font-size="13.5" font-weight="600" fill="${C.text}">${title}</text>`);
      } else {
        parts.push(`<svg x="${x + 16}" y="${y + (h - 20) / 2}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${def.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconInner}</svg>`);
        parts.push(`<text x="${x + 46}" y="${y + h / 2 - 2}" font-family="Segoe UI, system-ui, sans-serif" font-size="13.5" font-weight="600" fill="${C.text}">${title}</text>`);
        parts.push(`<text x="${x + 46}" y="${y + h / 2 + 14}" font-family="ui-monospace, Consolas, monospace" font-size="9.5" font-weight="500" fill="${C.text2}">${escapeHtml(def.label.toUpperCase())}</text>`);
      }
    }
  });

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`,
    width, height, bg: C.bg,
  };
}

function renderValidation() {
  const chip = document.getElementById('validation-chip');
  const warnings = validate();
  if (!warnings.length) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  chip.innerHTML = `<span class="warn-count mono-label">\u26a0 ${warnings.length} WARNING${warnings.length > 1 ? 'S' : ''}</span>
    <ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
}

function applyPlayClasses() {
  const play = state.play;
  canvas.classList.toggle('play-mode', !!play);
  nodeLayer.querySelectorAll('.wf-node').forEach((el) => {
    el.classList.remove('play-active', 'play-visited', 'play-dimmed');
    if (!play) return;
    if (el.dataset.id === play.current) el.classList.add('play-active');
    else if (play.visitedNodes.has(el.dataset.id)) el.classList.add('play-visited');
    else el.classList.add('play-dimmed');
  });
  edgeGroup.querySelectorAll('g.edge').forEach((g) => {
    g.classList.remove('play-traversed', 'play-last', 'play-dimmed');
    if (!play) return;
    if (play.lastConn === g.dataset.id) g.classList.add('play-last');
    else if (play.traversed.has(g.dataset.id)) g.classList.add('play-traversed');
    else g.classList.add('play-dimmed');
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- interactions ----------
let drag = null; // {kind:'pan'|'node'|'port', ...}
let lastNodeClick = { id: null, t: 0 };

canvas.addEventListener('mousedown', (e) => {
  if (e.target.closest('#zoom-controls, #node-picker, #validation-chip, #play-bar, #play-summary, #minimap')) return;
  if (state.play) {
    // During play mode, allow a double-click on a node to restart playback
    // from that node (manual detection since the canvas re-renders).
    const nodeEl = e.target.closest('.wf-node');
    if (nodeEl) {
      const now = Date.now();
      if (lastNodeClick.id === nodeEl.dataset.id && now - lastNodeClick.t < 450) {
        lastNodeClick = { id: null, t: 0 };
        emit('playfrom', { nodeId: nodeEl.dataset.id });
        return;
      }
      lastNodeClick = { id: nodeEl.dataset.id, t: now };
    }
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: state.panX, panY: state.panY, moved: false };
    canvas.classList.add('panning');
    e.preventDefault();
    return;
  }
  const port = e.target.closest('.port');
  const nodeEl = e.target.closest('.wf-node');
  if (port && nodeEl) {
    drag = { kind: 'port', sourceId: nodeEl.dataset.id, sourceDir: port.dataset.dir, moved: false, sx: e.clientX, sy: e.clientY };
    e.preventDefault();
    return;
  }
  if (nodeEl) {
    // manual double-click detection: the canvas re-renders between clicks,
    // so the browser's native dblclick is unreliable here
    const now = Date.now();
    if (lastNodeClick.id === nodeEl.dataset.id && now - lastNodeClick.t < 450) {
      lastNodeClick = { id: null, t: 0 };
      drag = null;
      emit('opendoc', { nodeId: nodeEl.dataset.id });
      return;
    }
    lastNodeClick = { id: nodeEl.dataset.id, t: now };
    const n = getNode(nodeEl.dataset.id);
    drag = { kind: 'node', id: n.id, el: nodeEl, startPos: { ...n.position }, sx: e.clientX, sy: e.clientY, moved: false };
    e.preventDefault();
    return;
  }
  const edgeG = e.target.closest('g.edge');
  if (edgeG) { setSelection(null, edgeG.dataset.id); render(); return; }
  drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: state.panX, panY: state.panY, moved: false };
  canvas.classList.add('panning');
  hidePicker();
});

window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (drag.kind === 'pan') {
    state.panX = drag.panX + dx; state.panY = drag.panY + dy;
    applyTransform();
  } else if (drag.kind === 'node') {
    const n = getNode(drag.id);
    n.position.x = Math.round((drag.startPos.x + dx / state.zoom) / 8) * 8;
    n.position.y = Math.round((drag.startPos.y + dy / state.zoom) / 8) * 8;
    drag.el.style.transform = `translate(${n.position.x}px, ${n.position.y}px)`;
    renderEdges();
  } else if (drag.kind === 'port') {
    const src = getNode(drag.sourceId);
    const p1 = portPoint(src, drag.sourceDir);
    const p2 = screenToWorld(e.clientX, e.clientY);
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.wf-node');
    let d2 = OPPOSITE[drag.sourceDir];
    if (under && under.dataset.id !== drag.sourceId) d2 = nearestSide(getNode(under.dataset.id), p2);
    tempEdge.setAttribute('d', edgePath(p1, drag.sourceDir, p2, d2));
    tempEdge.classList.remove('hidden');
    nodeLayer.querySelectorAll('.wf-node').forEach((el) => el.classList.toggle('drop-target', !!under && el === under && el.dataset.id !== drag.sourceId));
  }
});

window.addEventListener('mouseup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  canvas.classList.remove('panning');
  tempEdge.classList.add('hidden');
  nodeLayer.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
  if (d.kind === 'pan' && d.moved) lastNodeClick = { id: null, t: 0 };
  if (d.kind === 'pan' && !d.moved && !state.play) { setSelection(null, null); render(); }
  if (d.kind === 'node') {
    if (d.moved) { lastNodeClick = { id: null, t: 0 }; commit(); }
    setSelection(d.id, null);
    if (!d.moved) render();
  }
  if (d.kind === 'port') {
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.wf-node');
    if (under && under.dataset.id !== d.sourceId) {
      const tgt = getNode(under.dataset.id);
      const wp = screenToWorld(e.clientX, e.clientY);
      addConnection(d.sourceId, d.sourceDir, tgt.id, nearestSide(tgt, wp));
    } else if (pickerCallback) {
      const wp = d.moved ? screenToWorld(e.clientX, e.clientY) : null;
      pickerCallback({ sourceId: d.sourceId, sourceDir: d.sourceDir, worldPos: wp, clientX: e.clientX, clientY: e.clientY });
    }
  }
});

canvas.addEventListener('dblclick', (e) => {
  if (state.play) return;
  // backup path for the manual detection in mousedown
  const nodeEl = e.target.closest('.wf-node');
  if (nodeEl) e.preventDefault();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY);
}, { passive: false });

function nearestSide(node, wp) {
  const { w, h } = nodeSize(node);
  const cx = node.position.x + w / 2, cy = node.position.y + h / 2;
  const dx = (wp.x - cx) / w, dy = (wp.y - cy) / h;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}

function hidePicker() { emit('hidepicker'); }

// drag & drop from palette
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer.getData('nodeType');
  if (!type) return;
  const wp = screenToWorld(e.clientX, e.clientY);
  const def = typeDef(type);
  emit('palettedrop', { type, position: { x: wp.x - def.w / 2, y: wp.y - def.h / 2 } });
});

window.addEventListener('keydown', (e) => {
  if (state.play) return;
  if (e.target.matches('input, textarea, [contenteditable="true"]') || e.target.closest('.ql-editor')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); }
});

bus.addEventListener('graph', () => render());
bus.addEventListener('selection', () => render());
