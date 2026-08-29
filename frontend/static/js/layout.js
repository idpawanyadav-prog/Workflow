import { NODE_TYPES } from './nodes.js';
import { state, commit, emit } from './state.js';
import { fitView } from './canvas.js';

export async function autoLayout(direction = 'DOWN') {
  if (!state.nodes.length) return;
  if (typeof window.ELK === 'undefined') {
    emit('toast', { message: 'Layout engine still loading, try again in a second', type: 'error' });
    return;
  }
  const elk = new window.ELK();
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.nodeNode': '70',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: state.nodes.map((n) => ({ id: n.id, width: NODE_TYPES[n.type].w, height: NODE_TYPES[n.type].h })),
    edges: state.connections.map((c) => ({ id: c.id, sources: [c.source], targets: [c.target] })),
  };
  const res = await elk.layout(graph);
  const pos = Object.fromEntries(res.children.map((c) => [c.id, { x: c.x, y: c.y }]));
  state.nodes.forEach((n) => { if (pos[n.id]) n.position = { x: Math.round(pos[n.id].x), y: Math.round(pos[n.id].y) }; });
  const [sd, td] = direction === 'RIGHT' ? ['right', 'left'] : ['bottom', 'top'];
  state.connections.forEach((c) => { c.sourceDir = sd; c.targetDir = td; });
  commit();
  fitView(true);
}
