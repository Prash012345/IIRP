import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Helper to auto-layout the nodes in a top-down tree
const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 60 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 90,
        y: nodeWithPosition.y - 30,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function ServiceGraph({ services, dependencies }) {
  const { initialNodes, initialEdges } = useMemo(() => {
    // 1. Map backend services to React Flow Nodes
    const mappedNodes = services.map((srv) => {
      let bg = 'bg-white border-slate-300 text-slate-800';
      if (srv.status === 'DEGRADED') bg = 'bg-orange-50 border-orange-400 text-orange-900';
      if (srv.status === 'UNAVAILABLE') bg = 'bg-red-50 border-red-400 text-red-900';

      return {
        id: String(srv.id),
        data: { 
          label: (
            <div className="flex flex-col items-center justify-center h-full text-sm">
              <strong className="font-bold">{srv.name}</strong>
              <span className="text-xs opacity-75">({srv.status})</span>
            </div>
          )
        },
        className: `rounded-md border-2 shadow-sm ${bg}`,
      };
    });

    // 2. Map backend dependencies to React Flow Edges
    // Important: In our DB, "service_id" DEPENDS ON "depends_on_id"
    // So the visual flow of traffic/impact goes FROM depends_on_id TO service_id
    const mappedEdges = dependencies.map((dep) => ({
      id: `e${dep.depends_on_id}-${dep.service_id}`,
      source: String(dep.depends_on_id),
      target: String(dep.service_id),
      animated: true,
      style: { stroke: '#94a3b8', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    }));

    // 3. Apply auto-layout
    const layouted = getLayoutedElements(mappedNodes, mappedEdges);
    return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
  }, [services, dependencies]);

  if (!services.length) return null;

  return (
    <div className="h-[400px] w-full bg-slate-50 rounded-lg border border-slate-200">
      <ReactFlow 
        nodes={initialNodes} 
        edges={initialEdges} 
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#cbd5e1" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}