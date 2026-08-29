import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const WFLOW_VERSION = 1;

/**
 * Export a project as a .wflow ZIP container.
 * Format:
 *   manifest.json  { version, exportedAt, name }
 *   workflow.json  full serialized project
 *   attachments/*  future
 */
export async function exportProjectToWflow(project) {
  const zip = new JSZip();
  const manifest = {
    version: WFLOW_VERSION,
    name: project.name,
    exportedAt: new Date().toISOString(),
    schema: 'workflow-studio/wflow',
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('workflow.json', JSON.stringify(project, null, 2));
  zip.folder('attachments');
  const blob = await zip.generateAsync({ type: 'blob' });
  const safeName = (project.name || 'workflow').replace(/[^a-z0-9-_]+/gi, '_');
  saveAs(blob, `${safeName}.wflow`);
}

/**
 * Import a .wflow file. Returns a plain project object with backward-compatible
 * fields. Throws if the file is missing manifest / workflow contents.
 */
export async function importWflowFile(file) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  const workflowFile = zip.file('workflow.json');
  if (!manifestFile || !workflowFile) {
    throw new Error('Invalid .wflow file: missing manifest or workflow content');
  }
  const manifest = JSON.parse(await manifestFile.async('string'));
  if (!manifest.schema || !manifest.schema.startsWith('workflow-studio/wflow')) {
    throw new Error('Not a Workflow Studio .wflow file');
  }
  if (manifest.version > WFLOW_VERSION) {
    throw new Error(`Unsupported .wflow version ${manifest.version}`);
  }
  const project = JSON.parse(await workflowFile.async('string'));
  return migrateProject(project);
}

/** Ensures older schemas still load into the current app shape. */
export function migrateProject(project) {
  const migrated = {
    id: project.id,
    name: project.name || 'Untitled workflow',
    description: project.description || '',
    version: project.version || 1,
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || new Date().toISOString(),
    storageType: project.storageType || 'local',
    metadata: project.metadata || {},
    nodes: (project.nodes || []).map((n) => ({
      id: n.id,
      projectId: n.projectId || project.id,
      type: n.type,
      title: n.title || '',
      shortDescription: n.shortDescription || '',
      detailedDescription: n.detailedDescription || null,
      position: n.position || { x: 0, y: 0 },
      dimensions: n.dimensions || null,
      metadata: n.metadata || {},
    })),
    connections: (project.connections || []).map((c) => ({
      id: c.id,
      projectId: c.projectId || project.id,
      sourceNodeId: c.sourceNodeId,
      sourceHandle: c.sourceHandle || null,
      targetNodeId: c.targetNodeId,
      targetHandle: c.targetHandle || null,
      label: c.label || '',
      type: c.type || 'default',
      metadata: c.metadata || {},
    })),
  };
  return migrated;
}
