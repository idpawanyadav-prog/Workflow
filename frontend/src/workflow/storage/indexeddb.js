import Dexie from 'dexie';
import { BaseWorkspaceStorage } from './base';

/**
 * IndexedDB-backed personal workspace. Mirrors the SQLite provider that will
 * live in the Electron main process. Storage schema is intentionally
 * normalized so it can be re-mapped 1:1 to SQL tables later.
 */
class WorkflowDb extends Dexie {
  constructor(name = 'workflow-studio') {
    super(name);
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      nodes: 'id, projectId',
      connections: 'id, projectId',
      settings: 'key',
    });
  }
}

export class IndexedDbWorkspaceStorage extends BaseWorkspaceStorage {
  constructor(dbName) {
    super('local');
    this.db = new WorkflowDb(dbName);
  }

  async initialize() {
    await this.db.open();
  }

  async listProjects() {
    const projects = await this.db.projects.orderBy('updatedAt').reverse().toArray();
    const summaries = await Promise.all(
      projects.map(async (p) => ({
        ...p,
        nodeCount: await this.db.nodes.where('projectId').equals(p.id).count(),
      }))
    );
    return summaries;
  }

  async createProject(project) {
    await this.db.projects.put({
      id: project.id,
      name: project.name,
      description: project.description || '',
      version: project.version || 1,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      storageType: 'local',
      metadata: project.metadata || {},
    });
    if (project.nodes?.length) {
      await this.db.nodes.bulkPut(project.nodes.map((n) => ({ ...n, projectId: project.id })));
    }
    if (project.connections?.length) {
      await this.db.connections.bulkPut(
        project.connections.map((c) => ({ ...c, projectId: project.id }))
      );
    }
    return this.openProject(project.id);
  }

  async openProject(id) {
    const project = await this.db.projects.get(id);
    if (!project) throw new Error('Project not found');
    const [nodes, connections] = await Promise.all([
      this.db.nodes.where('projectId').equals(id).toArray(),
      this.db.connections.where('projectId').equals(id).toArray(),
    ]);
    return { ...project, nodes, connections };
  }

  async saveProject(project) {
    await this.db.transaction('rw', this.db.projects, this.db.nodes, this.db.connections, async () => {
      await this.db.projects.put({
        id: project.id,
        name: project.name,
        description: project.description || '',
        version: (project.version || 1),
        createdAt: project.createdAt,
        updatedAt: new Date().toISOString(),
        storageType: 'local',
        metadata: project.metadata || {},
      });
      await this.db.nodes.where('projectId').equals(project.id).delete();
      await this.db.connections.where('projectId').equals(project.id).delete();
      if (project.nodes?.length) {
        await this.db.nodes.bulkPut(project.nodes.map((n) => ({ ...n, projectId: project.id })));
      }
      if (project.connections?.length) {
        await this.db.connections.bulkPut(
          project.connections.map((c) => ({ ...c, projectId: project.id }))
        );
      }
    });
    return this.openProject(project.id);
  }

  async deleteProject(id) {
    await this.db.transaction('rw', this.db.projects, this.db.nodes, this.db.connections, async () => {
      await this.db.nodes.where('projectId').equals(id).delete();
      await this.db.connections.where('projectId').equals(id).delete();
      await this.db.projects.delete(id);
    });
  }
}
