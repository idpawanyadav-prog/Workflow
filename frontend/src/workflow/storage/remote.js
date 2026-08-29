import axios from 'axios';
import { BaseWorkspaceStorage } from './base';

/**
 * Remote workspace surrogate – calls the FastAPI backend which persists to
 * MongoDB. When Electron ships, swap the transport for a Microsoft SQL Server
 * provider behind the same interface.
 */
export class RemoteWorkspaceStorage extends BaseWorkspaceStorage {
  constructor(baseUrl) {
    super('remote');
    const url = baseUrl?.replace(/\/$/, '') || '';
    this.api = axios.create({ baseURL: `${url}/api` });
  }

  async initialize() {
    try {
      await this.api.get('/health');
    } catch (err) {
      // Non-fatal; the UI will show a warning if calls fail.
      // eslint-disable-next-line no-console
      console.warn('Remote workspace unreachable', err.message);
    }
  }

  async listProjects() {
    const { data } = await this.api.get('/projects');
    return data;
  }

  async createProject(project) {
    const { data } = await this.api.post('/projects', project);
    return data;
  }

  async openProject(id) {
    const { data } = await this.api.get(`/projects/${id}`);
    return data;
  }

  async saveProject(project) {
    const { data } = await this.api.put(`/projects/${project.id}`, project);
    return data;
  }

  async deleteProject(id) {
    await this.api.delete(`/projects/${id}`);
  }
}
