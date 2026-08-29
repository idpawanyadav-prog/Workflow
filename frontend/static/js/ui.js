import { api } from './api.js';
import { NODE_TYPES, DIRV, OPPOSITE, nodeSize, typeDef, CUSTOM_COLORS } from './nodes.js';
import { state, bus, emit, loadProject, getNode, addNode, addConnection, updateNode, deleteNode, undo, redo, commit, setSelection } from './state.js';
import { render, fitView, setZoom, screenToWorld, onPickerRequest, applyTransform, buildFlowSvg } from './canvas.js';
import { autoLayout } from './layout.js';
import { getSettings, saveSettings } from './settings.js';

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
      const pos = { x: wp.x - def.w / 2, y: wp.y - def.h / 2 };
      if (type === 'custom') openCustomProcessModal({ position: pos });
      else addNode(type, pos);
    });
    list.appendChild(item);
  });
}

bus.addEventListener('palettedrop', (e) => {
  if (e.detail.type === 'custom') openCustomProcessModal({ position: e.detail.position });
  else addNode(e.detail.type, e.detail.position);
});

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
  const def = typeDef(type);
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
  if (type === 'custom') {
    openCustomProcessModal({ position: pos, connect: ctx });
    return;
  }
  placeConnectedNode(type, pos, ctx);
}

function placeNodeAndMaybeConnect(type, pos, connect, extra = {}) {
  const node = addNode(type, pos, { silent: !!connect, ...extra });
  if (!node) { render(); return null; }
  if (connect) {
    addConnection(connect.sourceId, connect.sourceDir, node.id, OPPOSITE[connect.sourceDir], { silent: true });
    commit();
    setSelection(node.id, null);
  }
  return node;
}

function placeConnectedNode(type, pos, ctx) {
  placeNodeAndMaybeConnect(type, pos, ctx);
}

// ---------- documentation panel (Quill) ----------
const docPanel = document.getElementById('doc-panel');
let quill = null;
let docNodeId = null;
let docDirty = false;

export function initDocPanel() {
  bus.addEventListener('opendoc', (e) => openDoc(e.detail.nodeId));
  bus.addEventListener('selection', syncDocToSelection);
  bus.addEventListener('graph', () => {
    if (docNodeId && !getNode(docNodeId)) closeDoc({ keepSelection: true });
  });
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
  initShortDescResize();
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
  document.getElementById('link-add-btn').addEventListener('click', showLinkForm);
  document.getElementById('link-cancel-btn').addEventListener('click', hideLinkForm);
  document.getElementById('link-save-btn').addEventListener('click', addLink);
  document.getElementById('doc-collapse-btn').addEventListener('click', toggleDocCollapse);
}

// ---------- properties panel collapse ----------
function setDocCollapsed(collapsed) {
  const btn = document.getElementById('doc-collapse-btn');
  docPanel.classList.toggle('collapsed', collapsed);
  localStorage.setItem('ws-doc-collapsed', collapsed ? '1' : '0');
  btn.textContent = collapsed ? '\u00ab' : '\u00bb';
  btn.title = collapsed ? 'Expand properties' : 'Collapse properties';
  btn.setAttribute('aria-label', btn.title);
}

function toggleDocCollapse() {
  setDocCollapsed(!docPanel.classList.contains('collapsed'));
}

const SHORT_DESC_MAX_LINES = 5;
let shortDescManual = false;
let shortDescAutosizing = false;

function shortDescMetrics(el) {
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45;
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  return {
    min: lh + pad + border,
    maxAuto: lh * SHORT_DESC_MAX_LINES + pad + border,
  };
}

function fitShortDesc() {
  const el = document.getElementById('doc-short');
  if (!el) return;
  const { min, maxAuto } = shortDescMetrics(el);
  if (shortDescManual && el.offsetHeight > maxAuto + 1) return;

  shortDescAutosizing = true;
  el.style.height = 'auto';
  const next = Math.max(min, Math.min(el.scrollHeight + 2, maxAuto));
  el.style.height = `${next}px`;
  requestAnimationFrame(() => { shortDescAutosizing = false; });
}

function resetShortDescSize() {
  const el = document.getElementById('doc-short');
  shortDescManual = false;
  shortDescAutosizing = true;
  if (el) el.style.height = '';
  fitShortDesc();
}

function initShortDescResize() {
  const el = document.getElementById('doc-short');
  el.addEventListener('input', fitShortDesc);
  if (typeof ResizeObserver === 'undefined') return;
  let primed = false;
  new ResizeObserver(() => {
    if (shortDescAutosizing) return;
    if (!primed) { primed = true; return; }
    shortDescManual = true;
  }).observe(el);
}

function applyDocCollapsePref() {
  const s = getSettings();
  const btn = document.getElementById('doc-collapse-btn');
  const collapsible = s.properties.collapsible !== false;
  btn.style.display = collapsible ? '' : 'none';
  if (!collapsible) setDocCollapsed(false);
  else if (localStorage.getItem('ws-doc-collapsed') === '1') setDocCollapsed(true);
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

function syncDocToSelection() {
  const id = state.selection.nodeId;
  if (id) openDoc(id);
  else closeDoc({ keepSelection: true });
}

async function openDoc(nodeId) {
  if (docNodeId === nodeId && !docPanel.classList.contains('hidden')) return;
  if (docNodeId && docNodeId !== nodeId) saveDoc();
  const n = getNode(nodeId);
  if (!n) return;
  ensureQuill();
  docNodeId = nodeId;
  docDirty = false;
  document.getElementById('doc-heading').textContent = n.title || 'Node';
  document.getElementById('doc-type-pill').textContent = typeDef(n.type).label.toUpperCase();
  document.getElementById('doc-title').value = n.title;
  document.getElementById('doc-short').value = n.shortDescription || '';
  quill.root.innerHTML = n.detailedDescription || '';
  renderAccentPicker(n);
  renderAttachments(n);
  renderLinks(n);
  hideLinkForm();
  if (n.type === 'subflow' && !projectsCache.length) await loadProjectsCache();
  renderSubflowSection(n);
  applyDocCollapsePref();
  docPanel.classList.remove('hidden');
  resetShortDescSize();
}

function saveDoc() {
  if (!docNodeId || !docDirty) return;
  const n = getNode(docNodeId);
  if (!n) return;
  updateNode(docNodeId, {
    title: document.getElementById('doc-title').value.trim() || typeDef(n.type).label,
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

// ---------- node links (external URLs with grouping) ----------
const collapsedLinkGroups = new Set();

function renderLinks(n) {
  const wrap = document.getElementById('doc-links');
  const links = n.links || [];
  if (!links.length) {
    wrap.innerHTML = '<p class="attach-empty hint">No links yet.</p>';
    return;
  }
  const groups = {};
  links.forEach((l) => {
    const g = (l.group || '').trim() || 'General';
    (groups[g] = groups[g] || []).push(l);
  });
  wrap.innerHTML = '';
  Object.entries(groups).forEach(([group, items]) => {
    const gEl = document.createElement('div');
    gEl.className = 'link-group';
    const key = `${docNodeId}::${group}`;
    const collapsed = collapsedLinkGroups.has(key);
    gEl.classList.toggle('collapsed', collapsed);

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'link-group-name';
    head.dataset.testid = 'link-group-toggle';
    head.setAttribute('aria-expanded', String(!collapsed));
    head.innerHTML = `<span class="link-group-chev">${collapsed ? '\u25b8' : '\u25be'}</span>`
      + `<span class="link-group-label">${escapeHtml(group)}</span>`
      + `<span class="link-group-count">${items.length}</span>`;
    head.addEventListener('click', () => {
      if (collapsedLinkGroups.has(key)) collapsedLinkGroups.delete(key);
      else collapsedLinkGroups.add(key);
      renderLinks(getNode(docNodeId));
    });
    gEl.appendChild(head);

    const body = document.createElement('div');
    body.className = 'link-group-body';
    items.forEach((l) => {
      const item = document.createElement('div');
      item.className = 'link-item';
      item.dataset.testid = 'node-link-item';
      const label = l.label || l.url;
      item.innerHTML = `<a class="link-url" href="${escapeHtml(l.url)}" target="_blank" rel="noopener" data-testid="node-link-anchor">${escapeHtml(label)}</a>`
        + `<button class="link-remove" data-testid="node-link-remove-btn" title="Remove link" aria-label="Remove link">&#10005;</button>`;
      item.querySelector('.link-remove').addEventListener('click', () => removeLink(l.id));
      body.appendChild(item);
    });
    gEl.appendChild(body);
    wrap.appendChild(gEl);
  });
}

function showLinkForm() {
  const form = document.getElementById('link-form');
  document.getElementById('link-url').value = '';
  document.getElementById('link-label').value = '';
  document.getElementById('link-group').value = '';
  populateLinkGroups();
  form.classList.remove('hidden');
  document.getElementById('link-url').focus();
}

function hideLinkForm() {
  document.getElementById('link-form').classList.add('hidden');
}

function populateLinkGroups() {
  const n = docNodeId && getNode(docNodeId);
  const dl = document.getElementById('link-group-list');
  const groups = new Set();
  (n && n.links || []).forEach((l) => { if (l.group) groups.add(l.group.trim()); });
  dl.innerHTML = [...groups].map((g) => `<option value="${escapeHtml(g)}"></option>`).join('');
}

function addLink() {
  if (!docNodeId) return;
  const url = document.getElementById('link-url').value.trim();
  const label = document.getElementById('link-label').value.trim();
  const group = document.getElementById('link-group').value.trim();
  if (!url) { showToast('Enter a URL', 'error'); return; }
  const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const n = getNode(docNodeId);
  updateNode(docNodeId, { links: [...(n.links || []), { id: crypto.randomUUID(), url: fullUrl, label, group }] });
  renderLinks(getNode(docNodeId));
  hideLinkForm();
  showToast('Link added');
}

function removeLink(id) {
  if (!docNodeId) return;
  const n = getNode(docNodeId);
  updateNode(docNodeId, { links: (n.links || []).filter((l) => l.id !== id) });
  renderLinks(getNode(docNodeId));
}

export function closeDoc(opts = {}) {
  saveDoc();
  docNodeId = null;
  docPanel.classList.add('hidden');
  document.getElementById('doc-editor-modal').classList.add('hidden');
  if (!opts.keepSelection && state.selection.nodeId) setSelection(null, null);
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
  layoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('flow-image-menu')?.classList.add('hidden');
    layoutMenu.classList.toggle('hidden');
  });
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

export function wireImageCreator() {
  const btn = document.getElementById('flow-image-btn');
  const menu = document.getElementById('flow-image-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('layout-menu')?.classList.add('hidden');
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));
  menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    menu.classList.add('hidden');
    downloadFlowGraphic(b.dataset.fmt);
  }));
}

function slugFilename(text, ext) {
  const base = (text || 'workflow').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workflow';
  return `${base}.${ext}`;
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function svgToPngBlob(svg, bg) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const vb = svg.match(/viewBox=["']([^"']+)["']/i);
      let w = 1024, h = 768;
      if (vb) {
        const p = vb[1].trim().split(/[\s,]+/).map(Number);
        if (p.length === 4 && p[2] > 0 && p[3] > 0) {
          w = Math.round(p[2]);
          h = Math.round(p[3]);
        }
      }
      const scale = Math.min(2, 2048 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bg || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        if (!b) reject(new Error('Could not export PNG'));
        else resolve(b);
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not rasterize SVG')); };
    img.src = url;
  });
}

async function downloadFlowGraphic(fmt) {
  const built = buildFlowSvg();
  if (!built) { showToast('Add shapes to the canvas first', 'error'); return; }
  const base = state.project?.name || 'workflow';
  if (fmt === 'svg') {
    downloadBlob(new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' }), slugFilename(base, 'svg'));
    showToast('SVG downloaded');
    return;
  }
  try {
    const blob = await svgToPngBlob(built.svg, built.bg);
    downloadBlob(blob, slugFilename(base, 'png'));
    showToast('PNG downloaded');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function colorSwatchesHtml(selected) {
  const cur = (selected || CUSTOM_COLORS[0]).toLowerCase();
  return CUSTOM_COLORS.map((c) =>
    `<button type="button" class="color-swatch${c.toLowerCase() === cur ? ' selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
  ).join('');
}

function renderAccentPicker(n) {
  const wrap = document.getElementById('doc-accent');
  const swatches = document.getElementById('doc-accent-swatches');
  if (!wrap || !swatches) return;
  const show = n.type === 'custom';
  wrap.classList.toggle('hidden', !show);
  if (!show) return;
  swatches.innerHTML = colorSwatchesHtml(n.accent || typeDef('custom').color);
  swatches.querySelectorAll('.color-swatch').forEach((b) => {
    b.addEventListener('click', () => {
      updateNode(n.id, { accent: b.dataset.color });
      renderAccentPicker(getNode(n.id));
    });
  });
}

function openCustomProcessModal({ position, connect } = {}) {
  const root = document.getElementById('modal-root');
  const def = typeDef('custom');
  let accent = def.color;
  root.innerHTML = `
    <div class="modal-backdrop" data-testid="custom-process-modal">
      <div class="modal">
        <h2>Custom process</h2>
        <p class="ai-hint">Give this step a name and color. It works like a process node, with your own label on the canvas.</p>
        <label class="field-label">Name</label>
        <input class="field-input" id="cp-name" data-testid="custom-process-name" maxlength="80" placeholder="e.g. Review invoice" />
        <label class="field-label">Color</label>
        <div class="color-swatches" id="cp-swatches">${colorSwatchesHtml(accent)}</div>
        <div class="modal-actions">
          <button class="btn ghost" id="cp-cancel" data-testid="custom-process-cancel-btn">Cancel</button>
          <button class="btn primary" id="cp-add" data-testid="custom-process-add-btn">Add to canvas</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  const swatchWrap = root.querySelector('#cp-swatches');
  const paint = () => { swatchWrap.innerHTML = colorSwatchesHtml(accent); bindSwatches(); };
  const bindSwatches = () => {
    swatchWrap.querySelectorAll('.color-swatch').forEach((b) => {
      b.addEventListener('click', () => { accent = b.dataset.color; paint(); });
    });
  };
  bindSwatches();
  root.querySelector('#cp-cancel').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  const submit = () => {
    const title = root.querySelector('#cp-name').value.trim() || def.label;
    const canvas = document.getElementById('canvas');
    const r = canvas.getBoundingClientRect();
    const wp = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    const pos = position || { x: wp.x - def.w / 2, y: wp.y - def.h / 2 };
    close();
    placeNodeAndMaybeConnect('custom', pos, connect, { title, accent });
  };
  root.querySelector('#cp-add').addEventListener('click', submit);
  root.querySelector('#cp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => root.querySelector('#cp-name').focus(), 50);
}

function aiAuthPayload(extra) {
  const s = getSettings();
  const payload = { ...extra };
  if (s.ai.apiKey) {
    payload.api_key = s.ai.apiKey;
    if (s.ai.baseUrl) payload.base_url = s.ai.baseUrl;
    if (s.ai.model) payload.model = s.ai.model;
    if (s.ai.provider) payload.provider = s.ai.provider;
  }
  return payload;
}

// ---------- settings (preferences) ----------
export function wireSettings() {
  document.getElementById('dash-settings-btn').addEventListener('click', openSettingsModal);
}

function openSettingsModal() {
  const s = getSettings();
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-testid="settings-modal">
      <div class="modal">
        <h2>Settings</h2>
        <p class="settings-note">These preferences are stored locally in your browser.</p>

        <div class="settings-section">
          <h3>AI Draft</h3>
          <p class="settings-note">Cursor keys (<code>crsr_</code>) use <code>https://api.cursor.com</code>. Grok keys (<code>xai-</code>) use <code>https://api.x.ai/v1</code>. Leave base URL blank and Auto-detect will pick the right host.</p>
          <label class="field-label">Provider</label>
          <select class="field-input" id="set-ai-provider" data-testid="settings-ai-provider">
            <option value="auto" ${s.ai.provider === 'auto' || !s.ai.provider ? 'selected' : ''}>Auto-detect</option>
            <option value="grok" ${s.ai.provider === 'grok' ? 'selected' : ''}>xAI Grok</option>
            <option value="openai" ${s.ai.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="cursor" ${s.ai.provider === 'cursor' ? 'selected' : ''}>Cursor (crsr_)</option>
            <option value="custom" ${s.ai.provider === 'custom' ? 'selected' : ''}>Custom (OpenAI-compatible)</option>
          </select>
          <label class="field-label">Base URL <span class="hint">(optional for Grok)</span></label>
          <input class="field-input" id="set-ai-baseurl" data-testid="settings-ai-baseurl" placeholder="https://api.x.ai/v1" value="${escapeHtml(s.ai.baseUrl)}" autocomplete="off" />
          <label class="field-label">Model <span class="hint">(optional)</span></label>
          <input class="field-input" id="set-ai-model" data-testid="settings-ai-model" placeholder="grok-4.6" value="${escapeHtml(s.ai.model || '')}" autocomplete="off" />
          <label class="field-label">API key</label>
          <input class="field-input" id="set-ai-key" data-testid="settings-ai-key" type="password" placeholder="xai-... or sk-..." value="${escapeHtml(s.ai.apiKey)}" autocomplete="off" />
          <div class="settings-test-row">
            <button type="button" class="btn ghost" id="set-ai-test" data-testid="settings-ai-test-btn">Test connection</button>
            <p class="settings-test-status hint" id="set-ai-test-status" data-testid="settings-ai-test-status"></p>
          </div>
        </div>

        <div class="settings-section">
          <h3>Play</h3>
          <label class="checkbox-row"><input type="checkbox" id="set-play-summary" data-testid="settings-play-summary" ${s.play.showSummary ? 'checked' : ''} /> Show summary of the current step</label>
        </div>

        <div class="settings-section">
          <h3>Properties</h3>
          <label class="checkbox-row"><input type="checkbox" id="set-props-collapsible" data-testid="settings-props-collapsible" ${s.properties.collapsible !== false ? 'checked' : ''} /> Enable expand / collapse mode</label>
        </div>

        <div class="modal-actions">
          <button class="btn ghost" id="set-cancel" data-testid="settings-cancel-btn">Cancel</button>
          <button class="btn primary" id="set-save" data-testid="settings-save-btn">Save</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('#set-cancel').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  const providerEl = root.querySelector('#set-ai-provider');
  const baseEl = root.querySelector('#set-ai-baseurl');
  const modelEl = root.querySelector('#set-ai-model');
  providerEl.addEventListener('change', () => {
    if (providerEl.value === 'grok') {
      if (!baseEl.value.trim()) baseEl.value = 'https://api.x.ai/v1';
      if (!modelEl.value.trim()) modelEl.placeholder = 'grok-4.6';
    } else if (providerEl.value === 'openai') {
      if (!baseEl.value.trim()) baseEl.value = 'https://api.openai.com/v1';
      if (!modelEl.value.trim()) modelEl.placeholder = 'gpt-4o-mini';
    } else if (providerEl.value === 'cursor') {
      if (!baseEl.value.trim()) baseEl.value = 'https://api.cursor.com';
      if (!modelEl.value.trim()) modelEl.placeholder = 'grok-4.6';
    }
  });
  root.querySelector('#set-ai-test').addEventListener('click', () => testAiConnection(root));
  root.querySelector('#set-save').addEventListener('click', () => {
    saveSettings({
      ai: {
        provider: root.querySelector('#set-ai-provider').value,
        baseUrl: root.querySelector('#set-ai-baseurl').value.trim(),
        apiKey: root.querySelector('#set-ai-key').value.trim(),
        model: root.querySelector('#set-ai-model').value.trim(),
      },
      play: { showSummary: root.querySelector('#set-play-summary').checked },
      properties: { collapsible: root.querySelector('#set-props-collapsible').checked },
    });
    close();
    showToast('Settings saved');
  });
}

async function testAiConnection(root) {
  const key = root.querySelector('#set-ai-key').value.trim();
  const status = root.querySelector('#set-ai-test-status');
  const btn = root.querySelector('#set-ai-test');
  status.classList.remove('ok', 'err');
  if (!key) {
    status.textContent = 'Enter an API key first';
    status.classList.add('err');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Testing\u2026';
  status.textContent = 'Checking connection\u2026';
  try {
    const res = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        base_url: root.querySelector('#set-ai-baseurl').value.trim() || null,
        model: root.querySelector('#set-ai-model').value.trim() || null,
        provider: root.querySelector('#set-ai-provider').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.detail || `Test failed (${res.status})`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    status.textContent = data.message || 'Connected';
    status.classList.add('ok');
    showToast(data.message || 'AI connection OK');
  } catch (e) {
    status.textContent = e.message;
    status.classList.add('err');
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test connection';
  }
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
      const payload = aiAuthPayload({ prompt });
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

export function wireSampleProjects(refresh) {
  const load = async () => {
    try {
      const res = await api.seedSamples();
      const n = res.insertedCount || 0;
      if (n) showToast(`Loaded ${n} sample workflow${n === 1 ? '' : 's'}`);
      else showToast('Sample workflows are already on the dashboard');
      refresh();
    } catch (e) {
      showToast('Could not load samples: ' + e.message, 'error');
    }
  };
  document.getElementById('load-samples-btn').addEventListener('click', load);
  document.getElementById('empty-samples-btn').addEventListener('click', load);
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
