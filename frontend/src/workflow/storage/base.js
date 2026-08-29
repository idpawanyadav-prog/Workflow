/**
 * IWorkspaceStorage – storage contract shared by every provider.
 * Any provider (IndexedDB, SQLite, SQL Server, REST) must implement this
 * exact surface so the UI never knows which backend is active.
 *
 * Method signatures (all async unless noted):
 *   initialize()
 *   listProjects() -> ProjectSummary[]
 *   createProject(project) -> Project
 *   openProject(id) -> Project
 *   saveProject(project) -> Project
 *   deleteProject(id) -> void
 *   migrate(target)  (optional)
 */
export class BaseWorkspaceStorage {
  constructor(kind) {
    this.kind = kind;
  }
  async initialize() {}
  // eslint-disable-next-line no-unused-vars
  async listProjects() { throw new Error('not implemented'); }
  // eslint-disable-next-line no-unused-vars
  async createProject(project) { throw new Error('not implemented'); }
  // eslint-disable-next-line no-unused-vars
  async openProject(id) { throw new Error('not implemented'); }
  // eslint-disable-next-line no-unused-vars
  async saveProject(project) { throw new Error('not implemented'); }
  // eslint-disable-next-line no-unused-vars
  async deleteProject(id) { throw new Error('not implemented'); }
}
