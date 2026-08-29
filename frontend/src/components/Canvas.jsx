import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  BackgroundVariant,
} from '@xyflow/react';
import { useStore } from '../workflow/store';
import WorkflowNodeView from './WorkflowNode';
import { getNodeDefinition } from '../workflow/nodeDefinitions';

const nodeTypes = {
  workflowNode: WorkflowNodeView,
};

function toRFNodes(nodes, selectedNodeId) {
  return nodes.map((n) => {
    const def = getNodeDefinition(n.type);
    return {
      id: n.id,
      type: 'workflowNode',
      position: n.position || { x: 0, y: 0 },
      data: {
        type: n.type,
        title: n.title,
        shortDescription: n.shortDescription,
        dimensions: n.dimensions || def.defaultSize,
      },
      selected: n.id === selectedNodeId,
      draggable: true,
      width: n.dimensions?.width || def.defaultSize.width,
      height: n.dimensions?.height || def.defaultSize.height,
    };
  });
}

function toRFEdges(connections, playMode) {
  return connections.map((c) => {
    const active =
      playMode.active &&
      playMode.history.length >= 2 &&
      playMode.history[playMode.history.length - 2] === c.sourceNodeId &&
      playMode.history[playMode.history.length - 1] === c.targetNodeId;
    return {
      id: c.id,
      source: c.sourceNodeId,
      target: c.targetNodeId,
      sourceHandle: c.sourceHandle,
      targetHandle: c.targetHandle,
      type: 'smoothstep',
      label: c.label || undefined,
      className: active ? 'ws-edge-active' : '',
      labelStyle: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      labelBgStyle: { fill: 'var(--ws-surface)' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      markerEnd: { type: 'arrowclosed', color: 'var(--ws-border)' },
    };
  });
}

function InnerCanvas() {
  const rf = useReactFlow();
  const nodes = useStore((s) => s.nodes);
  const connections = useStore((s) => s.connections);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const playMode = useStore((s) => s.playMode);
  const selectNode = useStore((s) => s.selectNode);
  const selectConnection = useStore((s) => s.selectConnection);
  const clearSelection = useStore((s) => s.clearSelection);
  const moveNode = useStore((s) => s.moveNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const saveProject = useStore((s) => s.saveProject);
  const selectedConnectionId = useStore((s) => s.selectedConnectionId);
  const cancelConnect = useStore((s) => s.cancelConnect);
  const connectMode = useStore((s) => s.connectMode);
  const dragStart = useRef({});

  const rfNodes = useMemo(() => toRFNodes(nodes, selectedNodeId), [nodes, selectedNodeId]);
  const rfEdges = useMemo(() => toRFEdges(connections, playMode), [connections, playMode]);

  const onNodeDragStart = useCallback((e, node) => {
    dragStart.current[node.id] = { ...node.position };
  }, []);
  const onNodeDragStop = useCallback((e, node) => {
    const from = dragStart.current[node.id];
    if (from) moveNode(node.id, from, node.position);
  }, [moveNode]);

  const onNodeClick = useCallback((_, node) => selectNode(node.id), [selectNode]);
  const onEdgeClick = useCallback((_, edge) => selectConnection(edge.id), [selectConnection]);
  const onPaneClick = useCallback(() => {
    clearSelection();
    if (connectMode) cancelConnect();
  }, [clearSelection, cancelConnect, connectMode]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea'].includes(tag) || e.target?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault(); redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); saveProject();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) { e.preventDefault(); deleteNode(selectedNodeId); }
        else if (selectedConnectionId) { e.preventDefault(); deleteConnection(selectedConnectionId); }
      } else if (e.key === 'Escape') {
        if (connectMode) cancelConnect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, saveProject, selectedNodeId, selectedConnectionId, deleteNode, deleteConnection, connectMode, cancelConnect]);

  // Focus current play node
  useEffect(() => {
    if (playMode.active && playMode.currentNodeId) {
      const n = nodes.find((x) => x.id === playMode.currentNodeId);
      if (n) rf.setCenter(n.position.x + 100, n.position.y + 60, { zoom: 1, duration: 500 });
    }
  }, [playMode.active, playMode.currentNodeId, nodes, rf]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      snapToGrid
      snapGrid={[16, 16]}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      panOnDrag={!connectMode}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="var(--ws-border-subtle)" />
      <Controls showInteractive={false} />
      <MiniMap
        maskColor="rgba(0,0,0,0.05)"
        nodeStrokeColor="var(--ws-border)"
        nodeColor={() => 'var(--ws-surface-raised)'}
        pannable zoomable
      />
    </ReactFlow>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <InnerCanvas />
    </ReactFlowProvider>
  );
}
