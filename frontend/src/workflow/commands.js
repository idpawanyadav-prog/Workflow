import { v4 as uuid } from 'uuid';

/**
 * Command pattern for undo/redo. Every mutation on the workflow graph
 * is expressed as a command with execute() / undo() methods.
 *
 * Commands receive a "context" containing the mutable arrays it should
 * modify; store.js wires this into Zustand state.
 */
export class CommandStack {
  constructor(limit = 200) {
    this.stack = [];
    this.pointer = -1;
    this.limit = limit;
  }
  run(cmd, ctx) {
    cmd.execute(ctx);
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(cmd);
    if (this.stack.length > this.limit) this.stack.shift();
    this.pointer = this.stack.length - 1;
  }
  undo(ctx) {
    if (this.pointer < 0) return false;
    const cmd = this.stack[this.pointer];
    cmd.undo(ctx);
    this.pointer -= 1;
    return true;
  }
  redo(ctx) {
    if (this.pointer + 1 >= this.stack.length) return false;
    this.pointer += 1;
    this.stack[this.pointer].execute(ctx);
    return true;
  }
  canUndo() { return this.pointer >= 0; }
  canRedo() { return this.pointer + 1 < this.stack.length; }
  clear() { this.stack = []; this.pointer = -1; }
}

export const commandFactory = {
  addNode(node) {
    return {
      name: 'AddNode',
      execute: (ctx) => { ctx.nodes.push(node); },
      undo: (ctx) => { ctx.nodes.splice(ctx.nodes.findIndex((n) => n.id === node.id), 1); },
    };
  },
  addConnection(conn) {
    return {
      name: 'AddConnection',
      execute: (ctx) => { ctx.connections.push(conn); },
      undo: (ctx) => { ctx.connections.splice(ctx.connections.findIndex((c) => c.id === conn.id), 1); },
    };
  },
  addNodeWithConnection(node, conn) {
    return {
      name: 'AddNodeWithConnection',
      execute: (ctx) => {
        ctx.nodes.push(node);
        if (conn) ctx.connections.push(conn);
      },
      undo: (ctx) => {
        ctx.nodes.splice(ctx.nodes.findIndex((n) => n.id === node.id), 1);
        if (conn) ctx.connections.splice(ctx.connections.findIndex((c) => c.id === conn.id), 1);
      },
    };
  },
  deleteNode(node, relatedConnections) {
    return {
      name: 'DeleteNode',
      execute: (ctx) => {
        ctx.nodes.splice(ctx.nodes.findIndex((n) => n.id === node.id), 1);
        relatedConnections.forEach((c) => {
          const idx = ctx.connections.findIndex((x) => x.id === c.id);
          if (idx >= 0) ctx.connections.splice(idx, 1);
        });
      },
      undo: (ctx) => {
        ctx.nodes.push(node);
        relatedConnections.forEach((c) => ctx.connections.push(c));
      },
    };
  },
  deleteConnection(conn) {
    return {
      name: 'DeleteConnection',
      execute: (ctx) => {
        const idx = ctx.connections.findIndex((c) => c.id === conn.id);
        if (idx >= 0) ctx.connections.splice(idx, 1);
      },
      undo: (ctx) => { ctx.connections.push(conn); },
    };
  },
  moveNode(nodeId, from, to) {
    return {
      name: 'MoveNode',
      execute: (ctx) => {
        const n = ctx.nodes.find((x) => x.id === nodeId);
        if (n) n.position = to;
      },
      undo: (ctx) => {
        const n = ctx.nodes.find((x) => x.id === nodeId);
        if (n) n.position = from;
      },
    };
  },
  updateNode(nodeId, patch, previous) {
    return {
      name: 'UpdateNode',
      execute: (ctx) => {
        const n = ctx.nodes.find((x) => x.id === nodeId);
        if (n) Object.assign(n, patch);
      },
      undo: (ctx) => {
        const n = ctx.nodes.find((x) => x.id === nodeId);
        if (n) Object.assign(n, previous);
      },
    };
  },
  updateConnection(connId, patch, previous) {
    return {
      name: 'UpdateConnection',
      execute: (ctx) => {
        const c = ctx.connections.find((x) => x.id === connId);
        if (c) Object.assign(c, patch);
      },
      undo: (ctx) => {
        const c = ctx.connections.find((x) => x.id === connId);
        if (c) Object.assign(c, previous);
      },
    };
  },
  autoLayout(prevPositions, newPositions) {
    return {
      name: 'AutoLayout',
      execute: (ctx) => {
        newPositions.forEach(({ id, position }) => {
          const n = ctx.nodes.find((x) => x.id === id);
          if (n) n.position = position;
        });
      },
      undo: (ctx) => {
        prevPositions.forEach(({ id, position }) => {
          const n = ctx.nodes.find((x) => x.id === id);
          if (n) n.position = position;
        });
      },
    };
  },
};

export function newId() { return uuid(); }
