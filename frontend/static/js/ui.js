import { api } from './api.js';
import { NODE_TYPES, DIRV, OPPOSITE, nodeSize } from './nodes.js';
import { state, bus, emit, loadProject, getNode, addNode, addConnection, updateNode, deleteNode, undo, redo } from './state.js';
import { render, fitView, setZoom, screenToWorld, onPickerRequest, applyTransform } from './canvas.js';
import { autoLayout } from './layout.js';

// ---------- toasts ----------
bus.addEventListener('toast', (e) => showToast(e.detail.message, e.detail.type));
export function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.dataset.testid = 'toast';
  t.textContent = message;
  root.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

// ---------- theme ----------
export function initTheme() {
  const saved = localStorage.getItem('ws-theme') || 'light';
  document.documentElement.dataset.theme = saved;
  updateThemeButtons();
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = cur;
  localStorage.setItem('ws-theme', cur);
  updateThemeButtons();
}
function updateThemeButtons() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = dark ? '\u2600' : '\u263e';
  const tt = document.getElementById('theme-toggle');
  const dt = document.getElementById('dash-theme-toggle');
  if (tt) tt.textContent = label;
  if (dt) dt.textContent = label;
}

// ---------- palette ----------
export function buildPalette() {
  const list = document.getElementById('palette-list');
  list.innerHTML = '';
  Object.entries(NODE_TYPES).forEach(([type, def]) => {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.draggable = true;
    item.dataset.testid = `palette-item-${type}`;
    item.style.setProperty('--node-accent', def.color);
    item.innerHTML = `<span class="node-icon">${def.icon}</span><div><span class="p-label">${def.label}</span><span class="p-desc">${def.desc}</span></div>`;
    item.addEventListener('dragstart', (e) => e.dataTransfer.setData('nodeType', type));
    item.addEventListener('click', () => {
      const canvas = document.getElementById('canvas');
      const r = canvas.getBoundingClientRect();
      const wp = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
      addNode(type, { x: wp.x - def.w / 2, y: wp.y - def.h / 2 });
    });
    list.appendChild(item);
  });
}

bus.addEventListener('palettedrop', (e) => addNode(e.detail.type, e.detail.position));

// ---------- node picker (guided builder) ----------
const picker = document.getElementById('node-picker');
let pending = null;

export function initPicker() {
  onPickerRequest((ctx) => showPicker(ctx));
  bus.addEventListener('hidepicker', hidePicker);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePicker(); });
}

function showPicker(ctx) {
  pending = ctx;
  picker.innerHTML = `<p class="mono-label picker-title">ADD &amp; CONNECT</p><div class="picker-grid">${Object.entries(NODE_TYPES)
    .map(([type, def]) => `<button class="picker-item" data-type="${type}" data-testid="picker-item-${type}" style="--node-accent:${def.color}"><span class="node-icon">${def.icon}</span><span>${def.label}</span></button>`) 
    .join('')}</div>`;
  const canvasRect = document.getElementById('canvas').getBoundingClientRect();
  picker.classList.remove('hidden');
  const pw = picker.offsetWidth, ph = picker.offsetHeight;
  let x = ctx.clientX - canvasRect.left + 12;
  let y = ctx.clientY - canvasRect.top + 12;
  x = Math.min(x, canvasRect.width - pw - 12);
  y = Math.min(y, canvasRect.height - ph - 12);
  picker.style.left = Math.max(8, x) + 'px';
  picker.style.top = Math.max(8, y) + 'px';
  picker.querySelectorAll('.picker-item').forEach((b) => b.addEventListener('click', () => pickType(b.dataset.type)));
}

function hidePicker() { picker.classList.add('hidden'); pending = null; }

function pickType(type) {
  if (!pending) return;
  const ctx = pending;
  hidePicker();
  const def = NODE_TYPES[type];
  let pos;
  if (ctx.worldPos) {
    pos = { x: ctx.worldPos.x - def.w / 2, y: ctx.worldPos.y - def.h / 2 };
  } else {
    const src = getNode(ctx.sourceId);
    const { w, h } = nodeSize(src);
    const [dx, dy] = DIRV[ctx.sourceDir];
    const gap = 130;
    pos = {
      x: src.position.x + dx * (w / 2 + gap + def.w / 2) + (w - def.w) / 2,
      y: src.position.y + dy * (h / 2 + gap + def.h / 2) + (h - def.h) / 2,
    };
  }
  const node = addNode(type, pos, { silent: true });
  if (!node) { render(); return; }
  addConnection(ctx.sourceId, ctx.sourceDir, node.id, OPPOSITE[ctx.sourceDir], { silent: true });
  emit('graph');
  // single commit for node+connection
  import('./state.js').then((m) => m.commit());
}

// ---------- documentation panel (Quill) ----------
const docPanel = document.getElementById('doc-panel');
let quill = null;
let docNodeId = null;
let docDirty = false;

export function initDocPanel() {
  bus.addEventListener('opendoc', (e) => openDoc(e.detail.nodeId));
  document.getElementById('doc-close-btn').addEventListener('click', closeDoc);
  document.getElementById('doc-delete-btn').addEventListener('click', () => {
    if (!docNodeId) return;
    const id = docNodeId;
    docNodeId = null;
    docPanel.classList.add('hidden');
    deleteNode(id);
  });
  ['doc-title', 'doc-short'].forEach((id) => document.getElementById(id).addEventListener('input', () => { docDirty = true; }));
}

function ensureQuill() {
  if (quill) return;
  quill = new window.Quill('#doc-editor', {
    theme: 'snow',
    placeholder: 'Write detailed documentation for this step\u2026',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
        ['blockquote', 'code-block', 'link', 'image'],
        ['clean'],
      ],
    },
  });
  quill.on('text-change', (d, o, source) => { if (source === 'user') docDirty = true; });
}

function openDoc(nodeId) {
  if (docNodeId && docNodeId !== nodeId) saveDoc();
  const n = getNode(nodeId);
  if (!n) return;
  ensureQuill();
  docNodeId = nodeId;
  docDirty = false;
  document.getElementById('doc-node-type').textContent = NODE_TYPES[n.type].label.toUpperCase() + ' NODE';
  document.getElementById('doc-title').value = n.title;
  document.getElementById('doc-short').value = n.shortDescription || '';
  quill.root.innerHTML = n.detailedDescription || '';
  docPanel.classList.remove('hidden');
}

function saveDoc() {
  if (!docNodeId || !docDirty) return;
  const n = getNode(docNodeId);
  if (!n) return;
  updateNode(docNodeId, {
    title: document.getElementById('doc-title').value.trim() || NODE_TYPES[n.type].label,
    shortDescription: document.getElementById('doc-short').value.trim(),
    detailedDescription: quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML,
  });
}

export function closeDoc() {
  saveDoc();
  docNodeId = null;
  docPanel.classList.add('hidden');
}

// ---------- topbar ----------
export function wireTopbar(goHome) {
  document.getElementById('back-btn').addEventListener('click', () => { closeDoc(); goHome(); });
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('dash-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('export-btn').addEventListener('click', exportProject);
  document.getElementById('zoom-in-btn').addEventListener('click', () => setZoom(state.zoom * 1.2));
  document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(state.zoom / 1.2));
  document.getElementById('zoom-fit-btn').addEventListener('click', () => fitView(true));

  const layoutBtn = document.getElementById('layout-btn');
  const layoutMenu = document.getElementById('layout-menu');
  layoutBtn.addEventListener('click', (e) => { e.stopPropagation(); layoutMenu.classList.toggle('hidden'); });
  document.addEventListener('click', () => layoutMenu.classList.add('hidden'));
  layoutMenu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    layoutMenu.classList.add('hidden');
    autoLayout(b.dataset.dir);
  }));

  const title = document.getElementById('project-title');
  let titleTimer = null;
  title.addEventListener('input', () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(async () => {
      if (!state.project) return;
      const name = title.value.trim();
      if (!name) return;
      state.project.name = name;
      await api.updateProject(state.project.id, { name }).catch(() => showToast('Rename failed', 'error'));
    }, 600);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea') || e.target.closest('.ql-editor')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  });

  bus.addEventListener('savestatus', () => {
    const el = document.getElementById('save-status');
    el.textContent = state.saveStatus;
    el.classList.toggle('dirty', state.saveStatus !== 'Saved');
  });
}

// ---------- export / import ----------
function exportProject() {
  if (!state.project) return;
  const payload = {
    format: 'wflow', version: 2,
    name: state.project.name,
    description: state.project.description || '',
    graph: { nodes: state.nodes, connections: state.connections },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.project.name.replace(/[^a-z0-9-_ ]/gi, '')}.wflow`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Workflow exported');
}

export function wireImport(refresh) {
  const input = document.getElementById('import-file-input');
  document.getElementById('import-project-btn').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const graph = data.graph || { nodes: data.nodes || [], connections: data.connections || [] };
      await api.importProject({ name: data.name || file.name.replace(/\.(wflow|json)$/i, ''), description: data.description || '', graph });
      showToast('Workflow imported');
      refresh();
    } catch (e) {
      showToast('Import failed: ' + e.message, 'error');
    }
  });
}

// ---------- dashboard ----------
export async function renderDashboard(openProject) {
  const grid = document.getElementById('project-grid');
  const empty = document.getElementById('dash-empty');
  let projects = [];
  try {
    projects = await api.listProjects();
  } catch (e) {
    showToast('Could not load projects: ' + e.message, 'error');
  }
  grid.innerHTML = '';
  empty.classList.toggle('hidden', projects.length > 0);
  projects.forEach((p) => {
    const card = document.createElement('article');
    card.className = 'project-card';
    card.dataset.testid = 'project-card';
    card.innerHTML = `
      <div class="pc-top">
        <h3>${escapeHtml(p.name)}</h3>
        <button class="pc-delete" data-testid="delete-project-btn" title="Delete project">&#10005;</button>
      </div>
      <p class="pc-desc">${escapeHtml(p.description || 'No description')}</p>
      <div class="pc-meta mono-label">
        <span>${p.nodeCount} NODES</span><span>${p.connectionCount} LINKS</span>
        <span>${new Date(p.updatedAt).toLocaleDateString()}</span>
      </div>`;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.pc-delete')) return;
      openProject(p.id);
    });
    card.querySelector('.pc-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      await api.deleteProject(p.id);
      showToast('Project deleted');
      renderDashboard(openProject);
    });
    grid.appendChild(card);
  });
}

export function wireCreateProject(openProject) {
  const open = () => createProjectModal(openProject);
  document.getElementById('create-project-btn').addEventListener('click', open);
  document.getElementById('empty-create-btn').addEventListener('click', open);
}

function createProjectModal(openProject) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-testid="create-project-modal">
      <div class="modal">
        <h2>New Workflow</h2>
        <label class="field-label">Name</label>
        <input class="field-input" id="np-name" data-testid="project-name-input" placeholder="e.g. Order Fulfilment" maxlength="120" autofocus />
        <label class="field-label">Description <span class="hint">(optional)</span></label>
        <textarea class="field-input" id="np-desc" data-testid="project-desc-input" rows="2" maxlength="300"></textarea>
        <div class="modal-actions">
          <button class="btn ghost" id="np-cancel" data-testid="project-cancel-btn">Cancel</button>
          <button class="btn primary" id="np-create" data-testid="project-create-submit-btn">Create</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('#np-cancel').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  const submit = async () => {
    const name = root.querySelector('#np-name').value.trim();
    if (!name) { showToast('Give your workflow a name', 'error'); return; }
    const p = await api.createProject(name, root.querySelector('#np-desc').value.trim());
    close();
    openProject(p.id, true);
  };
  root.querySelector('#np-create').addEventListener('click', submit);
  root.querySelector('#np-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => root.querySelector('#np-name').focus(), 50);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
