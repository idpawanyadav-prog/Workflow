/**
 * Configuration-driven node system.
 * Each definition drives palette rendering, canvas rendering, connection rules,
 * default sizing and branch behavior. Adding a new node type only requires
 * appending to NODE_DEFINITIONS.
 */

export const NODE_TYPES = {
  START: 'start',
  END: 'end',
  PROCESS: 'process',
  DECISION: 'decision',
  DATABASE: 'database',
  API: 'api',
  DOCUMENT: 'document',
  DELAY: 'delay',
  EMAIL: 'email',
  SUBFLOW: 'subflow',
};

/**
 * @typedef {Object} NodeDefinition
 * @property {string} type
 * @property {string} displayName
 * @property {string} description
 * @property {string} icon - lucide icon name
 * @property {'circle'|'rect'|'diamond'|'cylinder'|'parallelogram'|'hex'|'roundrect'} shape
 * @property {number} maxIncoming
 * @property {number} maxOutgoing
 * @property {{width:number,height:number}} defaultSize
 * @property {{label:string, color:string}[]} [branchDefinitions]
 * @property {string} accent
 */

/** @type {NodeDefinition[]} */
export const NODE_DEFINITIONS = [
  {
    type: NODE_TYPES.START,
    displayName: 'Start',
    description: 'Entry point of the workflow',
    icon: 'Play',
    shape: 'circle',
    maxIncoming: 0,
    maxOutgoing: 1,
    defaultSize: { width: 120, height: 60 },
    accent: '#10B981',
  },
  {
    type: NODE_TYPES.END,
    displayName: 'End',
    description: 'Terminates the workflow',
    icon: 'Square',
    shape: 'circle',
    maxIncoming: Infinity,
    maxOutgoing: 0,
    defaultSize: { width: 120, height: 60 },
    accent: '#111',
  },
  {
    type: NODE_TYPES.PROCESS,
    displayName: 'Process',
    description: 'A standard step in the workflow',
    icon: 'Box',
    shape: 'roundrect',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 180, height: 76 },
    accent: '#4338CA',
  },
  {
    type: NODE_TYPES.DECISION,
    displayName: 'Decision',
    description: 'Branches the flow via Yes / No',
    icon: 'GitBranch',
    shape: 'diamond',
    maxIncoming: Infinity,
    maxOutgoing: 2,
    defaultSize: { width: 180, height: 140 },
    accent: '#F59E0B',
    branchDefinitions: [
      { label: 'Yes', color: '#10B981' },
      { label: 'No', color: '#EF4444' },
    ],
  },
  {
    type: NODE_TYPES.DATABASE,
    displayName: 'Database',
    description: 'Read/write data from a database',
    icon: 'Database',
    shape: 'cylinder',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 170, height: 90 },
    accent: '#0EA5E9',
  },
  {
    type: NODE_TYPES.API,
    displayName: 'API Call',
    description: 'Invoke an external HTTP API',
    icon: 'Globe',
    shape: 'roundrect',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 180, height: 76 },
    accent: '#6366F1',
  },
  {
    type: NODE_TYPES.DOCUMENT,
    displayName: 'Document',
    description: 'Generate or read a document',
    icon: 'FileText',
    shape: 'parallelogram',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 180, height: 76 },
    accent: '#0891B2',
  },
  {
    type: NODE_TYPES.DELAY,
    displayName: 'Delay',
    description: 'Pause the flow for a duration',
    icon: 'Clock',
    shape: 'roundrect',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 160, height: 72 },
    accent: '#F97316',
  },
  {
    type: NODE_TYPES.EMAIL,
    displayName: 'Email',
    description: 'Send an email notification',
    icon: 'Mail',
    shape: 'roundrect',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 180, height: 76 },
    accent: '#EC4899',
  },
  {
    type: NODE_TYPES.SUBFLOW,
    displayName: 'Subflow',
    description: 'Invoke another workflow',
    icon: 'Layers',
    shape: 'hex',
    maxIncoming: Infinity,
    maxOutgoing: 1,
    defaultSize: { width: 180, height: 80 },
    accent: '#7C3AED',
  },
];

export const NODE_DEF_BY_TYPE = NODE_DEFINITIONS.reduce((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {});

export function getNodeDefinition(type) {
  return NODE_DEF_BY_TYPE[type] || NODE_DEF_BY_TYPE[NODE_TYPES.PROCESS];
}

export const DIRECTIONS = ['top', 'right', 'bottom', 'left'];

/** Opposite direction map (helps auto-target handle placement). */
export const OPPOSITE_DIRECTION = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};
