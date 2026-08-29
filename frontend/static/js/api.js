export const API = '/api';

async function req(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  listProjects: () => req('GET', '/projects'),
  createProject: (name, description = '') => req('POST', '/projects', { name, description }),
  getProject: (id) => req('GET', `/projects/${id}`),
  updateProject: (id, patch) => req('PUT', `/projects/${id}`, patch),
  deleteProject: (id) => req('DELETE', `/projects/${id}`),
  saveGraph: (id, graph) => req('PUT', `/projects/${id}/graph`, graph),
  importProject: (payload) => req('POST', '/projects/import', payload),
};
