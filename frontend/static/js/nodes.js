const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const NODE_TYPES = {
  start: {
    label: 'Start', shape: 'pill', w: 150, h: 52, color: '#10B981', maxIn: 0, maxOut: 1,
    desc: 'Entry point of the workflow',
    icon: icon('<polygon points="6 3 20 12 6 21 6 3"/>'),
  },
  end: {
    label: 'End', shape: 'pill', w: 150, h: 52, color: '#EF4444', maxIn: Infinity, maxOut: 0,
    desc: 'Terminates the workflow',
    icon: icon('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  },
  process: {
    label: 'Process', shape: 'rect', w: 180, h: 64, color: '#4338CA', maxIn: Infinity, maxOut: 1,
    desc: 'A task or action step',
    icon: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>'),
  },
  decision: {
    label: 'Decision', shape: 'diamond', w: 150, h: 150, color: '#F59E0B', maxIn: Infinity, maxOut: 2,
    desc: 'Yes / No branching point',
    icon: icon('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
  },
  database: {
    label: 'Database', shape: 'rect', w: 180, h: 64, color: '#0EA5E9', maxIn: Infinity, maxOut: 1,
    desc: 'Read or write data',
    icon: icon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>'),
  },
  api: {
    label: 'API Call', shape: 'rect', w: 180, h: 64, color: '#8B5CF6', maxIn: Infinity, maxOut: 1,
    desc: 'External service call',
    icon: icon('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  },
  document: {
    label: 'Document', shape: 'rect', w: 180, h: 64, color: '#64748B', maxIn: Infinity, maxOut: 1,
    desc: 'Generate or read a document',
    icon: icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  },
  delay: {
    label: 'Delay', shape: 'rect', w: 180, h: 64, color: '#F97316', maxIn: Infinity, maxOut: 1,
    desc: 'Wait for a duration or event',
    icon: icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  },
  email: {
    label: 'Email', shape: 'rect', w: 180, h: 64, color: '#EC4899', maxIn: Infinity, maxOut: 1,
    desc: 'Send a notification email',
    icon: icon('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
  },
  subflow: {
    label: 'Subflow', shape: 'rect', w: 180, h: 64, color: '#14B8A6', maxIn: Infinity, maxOut: 1,
    desc: 'Reference to another workflow',
    icon: icon('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.18-8.58 3.91a2 2 0 0 1-1.66 0L2 12.18"/><path d="m22 17.18-8.58 3.91a2 2 0 0 1-1.66 0L2 17.18"/>'),
  },
};

export const DIRS = ['top', 'right', 'bottom', 'left'];
export const DIRV = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
export const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export function nodeSize(node) {
  const d = NODE_TYPES[node.type];
  return { w: d.w, h: d.h };
}

export function portPoint(node, dir) {
  const { w, h } = nodeSize(node);
  const { x, y } = node.position;
  switch (dir) {
    case 'top': return { x: x + w / 2, y };
    case 'bottom': return { x: x + w / 2, y: y + h };
    case 'left': return { x, y: y + h / 2 };
    case 'right': return { x: x + w, y: y + h / 2 };
  }
}
