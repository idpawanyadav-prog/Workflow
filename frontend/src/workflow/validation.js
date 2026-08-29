import { NODE_TYPES, getNodeDefinition } from './nodeDefinitions';

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

/**
 * Run domain-level validation against the given workflow graph.
 * @param {Array} nodes
 * @param {Array} connections
 * @returns {{issues: Array<{id:string,severity:string,message:string,nodeId?:string,connectionId?:string}>}}
 */
export function validateWorkflow(nodes, connections) {
  const issues = [];
  const push = (severity, message, extras = {}) =>
    issues.push({ id: `${severity}-${issues.length}`, severity, message, ...extras });

  const startNodes = nodes.filter((n) => n.type === NODE_TYPES.START);
  if (startNodes.length === 0) {
    push(SEVERITY.ERROR, 'Workflow is missing a Start node.');
  } else if (startNodes.length > 1) {
    startNodes.forEach((n) =>
      push(SEVERITY.ERROR, 'Multiple Start nodes are not permitted.', { nodeId: n.id })
    );
  }

  const endNodes = nodes.filter((n) => n.type === NODE_TYPES.END);
  if (endNodes.length === 0) {
    push(SEVERITY.WARNING, 'Workflow has no End node.');
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const outByNode = new Map();
  const inByNode = new Map();
  connections.forEach((c) => {
    if (!nodeIds.has(c.sourceNodeId)) {
      push(SEVERITY.ERROR, 'Connection references a missing source node.', {
        connectionId: c.id,
      });
      return;
    }
    if (!nodeIds.has(c.targetNodeId)) {
      push(SEVERITY.ERROR, 'Connection references a missing target node.', {
        connectionId: c.id,
      });
      return;
    }
    if (!outByNode.has(c.sourceNodeId)) outByNode.set(c.sourceNodeId, []);
    if (!inByNode.has(c.targetNodeId)) inByNode.set(c.targetNodeId, []);
    outByNode.get(c.sourceNodeId).push(c);
    inByNode.get(c.targetNodeId).push(c);
  });

  // Duplicate connection detection
  const seenPairs = new Set();
  connections.forEach((c) => {
    const key = `${c.sourceNodeId}::${c.targetNodeId}::${c.sourceHandle || ''}`;
    if (seenPairs.has(key)) {
      push(SEVERITY.WARNING, 'Duplicate connection between the same nodes.', {
        connectionId: c.id,
      });
    } else {
      seenPairs.add(key);
    }
  });

  // Node-specific rules
  nodes.forEach((n) => {
    const def = getNodeDefinition(n.type);
    const outgoing = outByNode.get(n.id) || [];
    const incoming = inByNode.get(n.id) || [];

    if (outgoing.length > def.maxOutgoing) {
      push(SEVERITY.ERROR, `${def.displayName} allows at most ${def.maxOutgoing} outgoing connection(s).`, {
        nodeId: n.id,
      });
    }
    if (n.type === NODE_TYPES.END && outgoing.length > 0) {
      push(SEVERITY.ERROR, 'End node cannot have outgoing connections.', { nodeId: n.id });
    }
    if (n.type === NODE_TYPES.START && incoming.length > 0) {
      push(SEVERITY.ERROR, 'Start node cannot have incoming connections.', { nodeId: n.id });
    }
    if (n.type === NODE_TYPES.DECISION) {
      const labels = new Set(outgoing.map((c) => (c.label || '').toLowerCase()));
      if (!labels.has('yes')) {
        push(SEVERITY.WARNING, 'Decision node is missing the Yes branch.', { nodeId: n.id });
      }
      if (!labels.has('no')) {
        push(SEVERITY.WARNING, 'Decision node is missing the No branch.', { nodeId: n.id });
      }
    }
    if (
      n.type !== NODE_TYPES.START &&
      n.type !== NODE_TYPES.END &&
      incoming.length === 0 &&
      outgoing.length === 0
    ) {
      push(SEVERITY.WARNING, `Orphan ${def.displayName} node has no connections.`, {
        nodeId: n.id,
      });
    }
  });

  return { issues };
}
