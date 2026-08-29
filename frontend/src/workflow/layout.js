import ELK from 'elkjs/lib/elk.bundled.js';
import { getNodeDefinition } from './nodeDefinitions';

const elk = new ELK();

const OPTIONS_BY_DIRECTION = {
  DOWN: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.layered.spacing.nodeNodeBetweenLayers': '90',
    'elk.spacing.nodeNode': '60',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.edgeRouting': 'ORTHOGONAL',
  },
  RIGHT: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.layered.spacing.nodeNodeBetweenLayers': '110',
    'elk.spacing.nodeNode': '60',
    'elk.edgeRouting': 'ORTHOGONAL',
  },
};

/**
 * Compute an auto-layout for the workflow using ELK.js.
 * @param {Array} nodes  domain nodes
 * @param {Array} connections domain connections
 * @param {'DOWN'|'RIGHT'} direction
 * @returns {Promise<Array<{id:string, position:{x:number,y:number}}>>}
 */
export async function autoLayout(nodes, connections, direction = 'DOWN') {
  if (nodes.length === 0) return [];
  const graph = {
    id: 'root',
    layoutOptions: OPTIONS_BY_DIRECTION[direction] || OPTIONS_BY_DIRECTION.DOWN,
    children: nodes.map((n) => {
      const def = getNodeDefinition(n.type);
      return {
        id: n.id,
        width: n.dimensions?.width || def.defaultSize.width,
        height: n.dimensions?.height || def.defaultSize.height,
      };
    }),
    edges: connections.map((c) => ({
      id: c.id,
      sources: [c.sourceNodeId],
      targets: [c.targetNodeId],
    })),
  };
  const result = await elk.layout(graph);
  return (result.children || []).map((c) => ({
    id: c.id,
    position: { x: c.x, y: c.y },
  }));
}
