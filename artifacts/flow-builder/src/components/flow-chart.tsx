import { useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeChange,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FlowInput, FlowNode, FlowBranch } from "@workspace/api-client-react";
import { Flag, CheckCircle2, Plus } from "lucide-react";

type QuestionNodeData = {
  label: string;
  isStart: boolean;
  isActive: boolean;
  endBranches: string[];
  onQuestionChange: (id: string, value: string) => void;
  onSetStart: (id: string) => void;
};

type QNode = Node<QuestionNodeData>;

function computeLayout(flow: FlowInput): Record<string, { x: number; y: number }> {
  const level: Record<string, number> = {};
  const visited = new Set<string>();
  const queue: Array<[string, number]> = [];

  if (flow.startNodeId) queue.push([flow.startNodeId, 0]);

  while (queue.length) {
    const [id, lvl] = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    level[id] = lvl;
    const node = flow.nodes.find((n) => n.id === id);
    node?.branches.forEach((b) => {
      if (b.targetNodeId && !visited.has(b.targetNodeId)) {
        queue.push([b.targetNodeId, lvl + 1]);
      }
    });
  }

  let extra = Math.max(-1, ...Object.values(level)) + 1;
  flow.nodes.forEach((n) => {
    if (!(n.id in level)) {
      level[n.id] = extra;
      extra += 1;
    }
  });

  const byLevel: Record<number, string[]> = {};
  flow.nodes.forEach((n) => {
    const l = level[n.id] ?? 0;
    (byLevel[l] ||= []).push(n.id);
  });

  const pos: Record<string, { x: number; y: number }> = {};
  Object.entries(byLevel).forEach(([l, ids]) => {
    ids.forEach((id, i) => {
      pos[id] = { x: i * 320 + 40, y: Number(l) * 220 + 40 };
    });
  });
  return pos;
}

function QuestionNode({ id, data }: NodeProps<QNode>) {
  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-sm w-72 transition-colors ${
        data.isActive
          ? "border-primary ring-2 ring-primary/30"
          : data.isStart
            ? "border-green-400"
            : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-400 !border-2 !border-card" />
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Question
          </span>
          {data.isStart ? (
            <span className="flex items-center gap-1 text-green-600 text-[10px] font-bold px-1.5 py-0.5 bg-green-500/10 rounded">
              <CheckCircle2 className="w-3 h-3" /> Start
            </span>
          ) : (
            <button
              type="button"
              onClick={() => data.onSetStart(id)}
              className="nodrag flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="Set as start node"
            >
              <Flag className="w-3 h-3" /> Set start
            </button>
          )}
        </div>
        <textarea
          value={data.label}
          onChange={(e) => data.onQuestionChange(id, e.target.value)}
          rows={2}
          className="nodrag nowheel w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {data.endBranches.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.endBranches.map((label, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {label || "answer"} → End
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
    </div>
  );
}

const nodeTypes: NodeTypes = { question: QuestionNode };

export default function FlowChart({
  flow,
  onChange,
  activeNodeId,
}: {
  flow: FlowInput;
  onChange: (f: FlowInput) => void;
  activeNodeId: string | null;
}) {
  const layout = useMemo(() => computeLayout(flow), [flow]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<QNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const updateNode = useCallback(
    (id: string, updates: Partial<FlowNode>) => {
      onChange({
        ...flow,
        nodes: flow.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
      });
    },
    [flow, onChange],
  );

  const onQuestionChange = useCallback(
    (id: string, value: string) => updateNode(id, { question: value }),
    [updateNode],
  );

  const onSetStart = useCallback(
    (id: string) => onChange({ ...flow, startNodeId: id }),
    [flow, onChange],
  );

  // Reconcile React Flow node state from app state, preserving existing
  // positions and measured dimensions so dragging stays initialized.
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return flow.nodes.map((n) => {
        const existing = prevById.get(n.id);
        const base = existing ?? ({} as Partial<QNode>);
        return {
          ...base,
          id: n.id,
          type: "question",
          position: existing?.position ?? n.position ?? layout[n.id] ?? { x: 40, y: 40 },
          data: {
            label: n.question,
            isStart: flow.startNodeId === n.id,
            isActive: activeNodeId === n.id,
            endBranches: n.branches.filter((b) => !b.targetNodeId).map((b) => b.label),
            onQuestionChange,
            onSetStart,
          },
        } as QNode;
      });
    });
  }, [flow.nodes, flow.startNodeId, activeNodeId, layout, onQuestionChange, onSetStart, setRfNodes]);

  useEffect(() => {
    const edges: Edge[] = [];
    flow.nodes.forEach((n) => {
      n.branches.forEach((b) => {
        if (b.targetNodeId) {
          edges.push({
            id: b.id,
            source: n.id,
            target: b.targetNodeId,
            label: b.label || "answer",
            animated: true,
            style: { stroke: "hsl(330 81% 60%)", strokeWidth: 2 },
            labelStyle: { fill: "hsl(222 47% 14%)", fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: "hsl(0 0% 100%)" },
            labelBgPadding: [6, 3],
            labelBgBorderRadius: 6,
          });
        }
      });
    });
    setRfEdges(edges);
  }, [flow.nodes, setRfEdges]);

  const onNodeDragStop = useCallback(() => {
    const posById = new Map(rfNodes.map((n) => [n.id, n.position]));
    onChange({
      ...flow,
      nodes: flow.nodes.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })),
    });
  }, [rfNodes, flow, onChange]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === conn.target) return;
      const source = flow.nodes.find((n) => n.id === conn.source);
      if (!source) return;
      if (source.branches.some((b) => b.targetNodeId === conn.target)) return;
      const newBranch: FlowBranch = {
        id: crypto.randomUUID(),
        label: "New answer",
        targetNodeId: conn.target,
      };
      updateNode(conn.source, { branches: [...source.branches, newBranch] });
    },
    [flow.nodes, updateNode],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      const removed = changes
        .filter((c): c is EdgeChange & { type: "remove"; id: string } => c.type === "remove")
        .map((c) => c.id);
      if (removed.length === 0) return;
      onChange({
        ...flow,
        nodes: flow.nodes.map((n) => ({
          ...n,
          branches: n.branches.filter((b) => !removed.includes(b.id)),
        })),
      });
    },
    [onEdgesChange, flow, onChange],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set(deleted.map((d) => d.id));
      onChange({
        ...flow,
        startNodeId: flow.startNodeId && ids.has(flow.startNodeId) ? null : flow.startNodeId,
        nodes: flow.nodes
          .filter((n) => !ids.has(n.id))
          .map((n) => ({
            ...n,
            branches: n.branches.map((b) =>
              b.targetNodeId && ids.has(b.targetNodeId) ? { ...b, targetNodeId: null } : b,
            ),
          })),
      });
    },
    [flow, onChange],
  );

  const addNode = useCallback(() => {
    const newNode: FlowNode = {
      id: crypto.randomUUID(),
      question: "New Question",
      branches: [],
      position: { x: 60 + Math.random() * 120, y: 60 + Math.random() * 120 },
    };
    onChange({
      ...flow,
      nodes: [...flow.nodes, newNode],
      startNodeId: flow.nodes.length === 0 ? newNode.id : flow.startNodeId,
    });
  }, [flow, onChange]);

  return (
    <div className="relative w-full h-full">
      <button
        type="button"
        onClick={addNode}
        className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
      >
        <Plus className="w-4 h-4" /> Add Node
      </button>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(220 16% 88%)" />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            (n.data as QuestionNodeData)?.isStart ? "hsl(145 63% 55%)" : "hsl(330 81% 70%)"
          }
        />
      </ReactFlow>
    </div>
  );
}
