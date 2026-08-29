import { api } from './api.js';
import { NODE_TYPES, DIRV, OPPOSITE, nodeSize } from './nodes.js';
import { state, bus, emit, loadProject, getNode, addNode, addConnection, updateNode, deleteNode, undo, redo, commit } from './state.js';
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
    item.title = def.label;
    item.innerHTML = `<span class="node-icon">${def.icon}</span><div class="p-text"><span class="p-label">${def.label}</span><span class="p-desc">${def.desc}</span></div>`;
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

// ---------- palette collapse / expand ----------
export function initPaletteToggle() {
  const palette = document.getElementById('palette');
  const btn = document.getElementById('palette-toggle-btn');

  function setCollapsed(collapsed) {
    palette.classList.toggle('collapsed', collapsed);
    localStorage.setItem('ws-palette-collapsed', collapsed ? '1' : '0');
    btn.textContent = collapsed ? '\u00bb' : '\u00ab';
    btn.title = collapsed ? 'Expand shapes panel' : 'Collapse shapes panel';
    btn.setAttribute('aria-label', btn.title);
  }

  if (localStorage.getItem('ws-palette-collapsed') === '1') setCollapsed(true);
  btn.addEventListener('click', () => setCollapsed(!palette.classList.contains('collapsed')));
}

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
  commit();
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
  document.getElementById('doc-title').addEventListener('input', (e) => {
    document.getElementById('doc-heading').textContent = e.target.value.trim() || 'Node';
  });
  document.getElementById('edit-docs-btn').addEventListener('click', () => {
    if (!docNodeId) return;
    document.getElementById('doc-editor-heading').textContent = document.getElementById('doc-title').value.trim() || 'Documentation';
    document.getElementById('doc-editor-modal').classList.remove('hidden');
    setTimeout(() => quill && quill.focus(), 50);
  });
  const closeEditorModal = () => {
    document.getElementById('doc-editor-modal').classList.add('hidden');
    saveDoc();
  };
  document.getElementById('doc-editor-done').addEventListener('click', closeEditorModal);
  document.getElementById('doc-editor-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeEditorModal(); });
  document.getElementById('attach-btn').addEventListener('click', () => document.getElementById('attach-input').click());
  document.getElementById('attach-input').addEventListener('change', onAttachFile);
  document.getElementById('subflow-link-btn').addEventListener('click', linkSubflow);
  document.getElementById('subflow-unlink-btn').addEventListener('click', unlinkSubflow);
  document.getElementById('subflow-open-btn').addEventListener('click', openLinkedFlow);
}

async function onAttachFile() {
  const input = document.getElementById('attach-input');
  const file = input.files[0];
  input.value = '';
  if (!file || !docNodeId) return;
  if (file.size > 10 * 1024 * 1024) { showToast('File too large (max 10 MB)', 'error'); return; }
  const btn = document.getElementById('attach-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading\u2026';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/attachments', { method: 'POST', body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Upload failed (${res.status})`);
    const meta = await res.json();
    const n = getNode(docNodeId);
    updateNode(docNodeId, { attachments: [...(n.attachments || []), meta] });
    renderAttachments(getNode(docNodeId));
    showToast('Attachment uploaded');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Attach file or image';
  }
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments(n) {
  const wrap = document.getElementById('doc-attachments');
  const items = n.attachments || [];
  wrap.innerHTML = items.length ? '' : '<p class="attach-empty hint">No attachments yet.</p>';
  items.forEach((a) => {
    const item = document.createElement('div');
    item.className = 'attach-item';
    item.dataset.testid = 'attachment-item';
    const isImg = (a.contentType || '').startsWith('image/');
    item.innerHTML = `${isImg ? `<img class="attach-thumb" src="${a.url}" alt="" loading="lazy">` : '<span class="attach-icon mono-label">FILE</span>'}
      <a class="attach-name" href="${a.url}" target="_blank" rel="noopener" data-testid="attachment-link">${escapeHtml(a.name)}</a>
      <span class="attach-size hint">${fmtSize(a.size)}</span>
      <button class="attach-remove" data-testid="attachment-remove-btn" title="Remove attachment">&#10005;</button>`;
    item.querySelector('.attach-remove').addEventListener('click', async () => {
      fetch(`/api/attachments/${a.id}`, { method: 'DELETE' }).catch(() => {});
      const node = getNode(docNodeId);
      updateNode(docNodeId, { attachments: (node.attachments || []).filter((x) => x.id !== a.id) });
      renderAttachments(getNode(docNodeId));
      showToast('Attachment removed');
    });
    wrap.appendChild(item);
  });
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

async function openDoc(nodeId) {
  if (docNodeId && docNodeId !== nodeId) saveDoc();
  const n = getNode(nodeId);
  if (!n) return;
  ensureQuill();
  docNodeId = nodeId;
  docDirty = false;
  document.getElementById('doc-heading').textContent = n.title || 'Node';
  document.getElementById('doc-type-pill').textContent = NODE_TYPES[n.type].label.toUpperCase();
  document.getElementById('doc-title').value = n.title;
  document.getElementById('doc-short').value = n.shortDescription || '';
  quill.root.innerHTML = n.detailedDescription || '';
  renderAttachments(n);
  if (n.type === 'subflow' && !projectsCache.length) await loadProjectsCache();
  renderSubflowSection(n);
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
  docDirty = false;
}

// ---------- subflow linking ----------
let projectsCache = [];

async function loadProjectsCache() {
  try {
    projectsCache = await api.listProjects();
  } catch (e) {
    projectsCache = [];
  }
}

function renderSubflowSection(n) {
  const section = document.getElementById('doc-subflow');
  const isSubflow = n.type === 'subflow';
  section.classList.toggle('hidden', !isSubflow);
  if (!isSubflow) return;

  const sub = n.subflow && n.subflow.projectId ? n.subflow : null;
  const select = document.getElementById('subflow-select');
  const others = projectsCache.filter((p) => p.id !== state.project.id);
  select.innerHTML = '<option value="">&mdash; Select a flow &mdash;</option>' + others
    .map((p) => `<option value="${p.id}" ${sub && p.id === sub.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');

  const card = document.getElementById('subflow-linked');
  if (sub) {
    card.classList.remove('hidden');
    document.getElementById('subflow-linked-name').textContent = sub.name || '';
    document.getElementById('subflow-linked-desc').textContent = sub.description || '';
    document.getElementById('subflow-linked-nodes').textContent = `${sub.nodeCount ?? 0} NODES`;
    document.getElementById('subflow-linked-links').textContent = `${sub.connectionCount ?? 0} LINKS`;
  } else {
    card.classList.add('hidden');
  }
}

function linkSubflow() {
  if (!docNodeId) return;
  const n = getNode(docNodeId);
  if (!n || n.type !== 'subflow') return;
  const pid = document.getElementById('subflow-select').value;
  if (!pid) { showToast('Select a flow to link', 'error'); return; }
  const p = projectsCache.find((x) => x.id === pid);
  if (!p) return;
  updateNode(docNodeId, {
    subflow: { projectId: p.id, name: p.name, description: p.description || '', nodeCount: p.nodeCount, connectionCount: p.connectionCount },
  });
  renderSubflowSection(getNode(docNodeId));
  showToast(`Linked to \u201c${p.name}\u201d`);
}

function unlinkSubflow() {
  if (!docNodeId) return;
  updateNode(docNodeId, { subflow: null });
  renderSubflowSection(getNode(docNodeId));
  showToast('Flow unlinked');
}

function openLinkedFlow() {
  const n = docNodeId && getNode(docNodeId);
  if (!n || !n.subflow || !n.subflow.projectId || !state.project) return;
  const parentName = state.project.name || 'Parent flow';
  location.hash = `#/p/${n.subflow.projectId}?parent=${state.project.id}&parentName=${encodeURIComponent(parentName)}`;
}

export function closeDoc() {
  saveDoc();
  docNodeId = null;
  docPanel.classList.add('hidden');
  document.getElementById('doc-editor-modal').classList.add('hidden');
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

// ---------- AI workflow draft ----------
export function wireAiDraft() {
  document.getElementById('ai-draft-btn').addEventListener('click', openAiModal);
}

function openAiModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-testid="ai-draft-modal">
      <div class="modal">
        <h2>AI Workflow Draft</h2>
        <p class="ai-hint">Describe your process in plain text and the AI will lay out a ready-made workflow you can refine on the canvas.</p>
        <label class="field-label">Process description</label>
        <textarea class="field-input ai-textarea" id="ai-prompt" data-testid="ai-prompt-input" maxlength="3000"
          placeholder="e.g. A customer places an order. Check stock in the database; if available, charge the card via the payment API and email a confirmation, otherwise notify the customer and end."></textarea>
        <div class="modal-actions">
          <button class="btn ghost" id="ai-cancel" data-testid="ai-cancel-btn">Cancel</button>
          <button class="btn primary" id="ai-generate" data-testid="ai-generate-btn">Generate</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('#ai-cancel').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  root.querySelector('#ai-generate').addEventListener('click', async () => {
    const prompt = root.querySelector('#ai-prompt').value.trim();
    if (prompt.length < 5) { showToast('Describe your process in a bit more detail', 'error'); return; }
    const btn = root.querySelector('#ai-generate');
    btn.disabled = true;
    btn.textContent = 'Generating\u2026';
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Generation failed (${res.status})`);
      const graph = await res.json();
      if (state.nodes.length && !confirm('Replace the current canvas with the AI draft?')) {
        btn.disabled = false;
        btn.textContent = 'Generate';
        return;
      }
      state.nodes = graph.nodes;
      state.connections = graph.connections;
      commit();
      close();
      await autoLayout('DOWN');
      showToast(`AI draft created with ${graph.nodes.length} steps`);
    } catch (e) {
      showToast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Generate';
    }
  });
  setTimeout(() => root.querySelector('#ai-prompt').focus(), 50);
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
