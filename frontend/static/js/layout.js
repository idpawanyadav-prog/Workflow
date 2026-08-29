import { DIRV, portPoint, nodeSize } from './nodes.js';
import { state, commit, emit } from './state.js';
import { fitView } from './canvas.js';

const SIZE_PAD = 8;
const EDGE_PAD = 8;

export async function autoLayout(direction = 'DOWN') {
  if (!state.nodes.length) return;
  if (typeof window.ELK === 'undefined') {
    emit('toast', { message: 'Layout engine still loading, try again in a second', type: 'error' });
    return;
  }

  const hasDiamond = state.nodes.some((n) => nodeSize(n).h >= 140);
  const layerGap = hasDiamond ? 120 : 108;
  const nodeGap = hasDiamond ? 92 : 80;

  const elk = new window.ELK();
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=16,left=24,bottom=16,right=24]',
      'elk.spacing.nodeNode': String(nodeGap),
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.nodePlacement.favorStraightEdges': 'false',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': '30',
      'elk.layered.compaction.postCompaction.strategy': 'NONE',
    },
    children: state.nodes.map((n) => {
      const { w, h } = nodeSize(n);
      return { id: n.id, width: w + SIZE_PAD * 2, height: h + SIZE_PAD * 2 };
    }),
    edges: state.connections.map((c) => ({ id: c.id, sources: [c.source], targets: [c.target] })),
  };

  let res;
  try {
    res = await elk.layout(graph);
  } catch (e) {
    graph.layoutOptions = {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.spacing.nodeNode': String(nodeGap),
    };
    res = await elk.layout(graph);
  }
  const pos = Object.fromEntries((res.children || []).map((c) => [c.id, { x: c.x, y: c.y }]));
  state.nodes.forEach((n) => {
    if (!pos[n.id]) return;
    n.position = {
      x: Math.round(pos[n.id].x + SIZE_PAD),
      y: Math.round(pos[n.id].y + SIZE_PAD),
    };
  });

  assignPorts(direction);
  separateOverlappingNodes(direction);
  detourEdgesThroughNodes(direction);
  snapPositions();
  commit();
  fitView(true);
}

function center(n) {
  const { w, h } = nodeSize(n);
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
}

function pickPorts(src, tgt, flowDir) {
  const sc = center(src), tc = center(tgt);
  const dx = tc.x - sc.x, dy = tc.y - sc.y;
  if (flowDir === 'RIGHT') {
    if (dx >= 12) return ['right', 'left'];
    if (dx <= -12) return ['left', 'right'];
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  if (dy >= 12) return ['bottom', 'top'];
  if (dy <= -12) return ['top', 'bottom'];
  return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
}

function assignPorts(flowDir) {
  const byId = Object.fromEntries(state.nodes.map((n) => [n.id, n]));
  state.connections.forEach((c) => {
    const src = byId[c.source], tgt = byId[c.target];
    if (!src || !tgt) return;
    const [sd, td] = pickPorts(src, tgt, flowDir);
    c.sourceDir = sd;
    c.targetDir = td;
  });
}

function snapPositions() {
  state.nodes.forEach((n) => {
    n.position.x = Math.round(n.position.x / 8) * 8;
    n.position.y = Math.round(n.position.y / 8) * 8;
  });
}

function inflate(n, pad = EDGE_PAD) {
  const { w, h } = nodeSize(n);
  return {
    x: n.position.x - pad,
    y: n.position.y - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function separateOverlappingNodes(flowDir) {
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < state.nodes.length; i++) {
      for (let j = i + 1; j < state.nodes.length; j++) {
        const a = inflate(state.nodes[i], 12);
        const b = inflate(state.nodes[j], 12);
        if (!rectsOverlap(a, b)) continue;
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const ca = center(state.nodes[i]), cb = center(state.nodes[j]);
        if (flowDir !== 'RIGHT') {
          const dir = ca.x <= cb.x ? -1 : 1;
          const shift = Math.max(overlapX / 2 + 8, 12);
          state.nodes[i].position.x += dir * shift;
          state.nodes[j].position.x -= dir * shift;
        } else {
          const dir = ca.y <= cb.y ? -1 : 1;
          const shift = Math.max(overlapY / 2 + 8, 12);
          state.nodes[i].position.y += dir * shift;
          state.nodes[j].position.y -= dir * shift;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function ctrlPoints(p1, d1, p2, d2) {
  const along = Math.abs(DIRV[d1][0] ? (p2.x - p1.x) : (p2.y - p1.y));
  const o = Math.min(Math.max(along / 2, 36), 90);
  return [
    { x: p1.x + DIRV[d1][0] * o, y: p1.y + DIRV[d1][1] * o },
    { x: p2.x + DIRV[d2][0] * o, y: p2.y + DIRV[d2][1] * o },
  ];
}

function bezierPoint(p1, c1, c2, p2, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p1.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p2.x,
    y: mt ** 3 * p1.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p2.y,
  };
}

function pointInNode(n, x, y, pad = EDGE_PAD) {
  const r = inflate(n, pad);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function edgeOverlapsNode(src, tgt, c, node) {
  if (node.id === src.id || node.id === tgt.id) return false;
  const p1 = portPoint(src, c.sourceDir);
  const p2 = portPoint(tgt, c.targetDir);
  const [c1, c2] = ctrlPoints(p1, c.sourceDir, p2, c.targetDir);
  for (let i = 1; i < 20; i++) {
    const p = bezierPoint(p1, c1, c2, p2, i / 20);
    if (pointInNode(node, p.x, p.y)) return true;
  }
  return false;
}

function detourEdgesThroughNodes(flowDir) {
  const axis = flowDir === 'RIGHT' ? 'y' : 'x';
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const c of state.connections) {
      const src = state.nodes.find((n) => n.id === c.source);
      const tgt = state.nodes.find((n) => n.id === c.target);
      if (!src || !tgt) continue;
      const sc = center(src), tc = center(tgt);
      const mid = (sc[axis] + tc[axis]) / 2;
      for (const node of state.nodes) {
        if (!edgeOverlapsNode(src, tgt, c, node)) continue;
        const nc = center(node);
        let dir = nc[axis] >= mid ? 1 : -1;
        if (Math.abs(nc[axis] - mid) < 4) dir = nc[axis] >= sc[axis] ? 1 : -1;
        node.position[axis] += dir * 20;
        moved = true;
      }
    }
    if (moved) assignPorts(flowDir);
    else break;
  }
}
