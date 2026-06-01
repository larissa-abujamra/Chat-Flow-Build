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
import { Flag, CheckCircle2, Plus, Trash2 } from "lucide-react";
import BranchColorBadge from "@/components/branch-color-badge";

type BranchTargetOption = { id: string; label: string };

type QuestionNodeData = {
  label: string;
  number: number;
  isStart: boolean;
  isActive: boolean;
  branches: FlowBranch[];
  targetOptions: BranchTargetOption[];
  onQuestionChange: (id: string, value: string) => void;
  onSetStart: (id: string) => void;
  onAddBranch: (nodeId: string) => void;
  onBranchLabelChange: (nodeId: string, branchId: string, value: string) => void;
  onBranchTargetChange: (nodeId: string, branchId: string, target: string | null) => void;
  onBranchColorChange: (nodeId: string, branchId: string, color: string | null) => void;
  onRemoveBranch: (nodeId: string, branchId: string) => void;
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
      pos[id] = { x: i * 380 + 40, y: Number(l) * 460 + 40 };
    });
  });
  return pos;
}

function QuestionNode({ id, data }: NodeProps<QNode>) {
  return (
    <div
      className={`rounded-xl border-2 bg-card w-80 transition-all duration-200 ${
        data.isActive
          ? "border-waz ring-4 ring-waz/25 shadow-[0_0_0_1px_hsl(var(--waz))]"
          : data.isStart
            ? "border-waz/40"
            : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-fin !border-2 !border-card" />
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {data.number}
            </span>
            {data.isActive && <span className="w-1.5 h-1.5 rounded-full bg-waz animate-pulse" />}
            {data.isActive ? "Active" : "Question"}
          </span>
          {data.isStart ? (
            <span className="flex items-center gap-1 text-waz text-[10px] font-bold px-1.5 py-0.5 bg-waz/10 rounded-full">
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
          placeholder="Question / message"
          className="nodrag nowheel w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <div className="space-y-1.5">
          <span className="eyebrow">Answers</span>
          {data.branches.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">No answers yet.</p>
          )}
          {data.branches.map((branch, bi) => (
            <div key={branch.id} className="space-y-1 rounded-md bg-muted/50 p-1.5">
              <div className="flex items-center gap-1.5">
                <BranchColorBadge
                  size="sm"
                  label={`${data.number}${String.fromCharCode(65 + bi)}`}
                  color={branch.color}
                  onChange={(c) => data.onBranchColorChange(id, branch.id, c)}
                />
                <input
                  value={branch.label}
                  onChange={(e) => data.onBranchLabelChange(id, branch.id, e.target.value)}
                  placeholder="e.g. Yes"
                  className="nodrag nowheel flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => data.onRemoveBranch(id, branch.id)}
                  className="nodrag shrink-0 text-muted-foreground hover:text-destructive"
                  title="Remove answer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground shrink-0">→</span>
                <select
                  value={branch.targetNodeId ?? "end"}
                  onChange={(e) =>
                    data.onBranchTargetChange(id, branch.id, e.target.value === "end" ? null : e.target.value)
                  }
                  className="nodrag nowheel flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="end">End of conversation</option>
                  {data.targetOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => data.onAddBranch(id)}
            className="nodrag flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary"
          >
            <Plus className="w-3 h-3" /> Add answer
          </button>
        </div>
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

  const onAddBranch = useCallback(
    (nodeId: string) => {
      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const newBranch: FlowBranch = { id: crypto.randomUUID(), label: "New answer", targetNodeId: null };
      updateNode(nodeId, { branches: [...node.branches, newBranch] });
    },
    [flow.nodes, updateNode],
  );

  const onBranchLabelChange = useCallback(
    (nodeId: string, branchId: string, value: string) => {
      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNode(nodeId, {
        branches: node.branches.map((b) => (b.id === branchId ? { ...b, label: value } : b)),
      });
    },
    [flow.nodes, updateNode],
  );

  const onBranchTargetChange = useCallback(
    (nodeId: string, branchId: string, target: string | null) => {
      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNode(nodeId, {
        branches: node.branches.map((b) => (b.id === branchId ? { ...b, targetNodeId: target } : b)),
      });
    },
    [flow.nodes, updateNode],
  );

  const onBranchColorChange = useCallback(
    (nodeId: string, branchId: string, color: string | null) => {
      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNode(nodeId, {
        branches: node.branches.map((b) => (b.id === branchId ? { ...b, color } : b)),
      });
    },
    [flow.nodes, updateNode],
  );

  const onRemoveBranch = useCallback(
    (nodeId: string, branchId: string) => {
      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNode(nodeId, { branches: node.branches.filter((b) => b.id !== branchId) });
    },
    [flow.nodes, updateNode],
  );

  // Reconcile React Flow node state from app state, preserving existing
  // positions and measured dimensions so dragging stays initialized.
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return flow.nodes.map((n, ni) => {
        const existing = prevById.get(n.id);
        const base = existing ?? ({} as Partial<QNode>);
        return {
          ...base,
          id: n.id,
          type: "question",
          position: existing?.position ?? n.position ?? layout[n.id] ?? { x: 40, y: 40 },
          data: {
            label: n.question,
            number: ni + 1,
            isStart: flow.startNodeId === n.id,
            isActive: activeNodeId === n.id,
            branches: n.branches,
            targetOptions: flow.nodes
              .map((o, oi) => ({ o, oi }))
              .filter(({ o }) => o.id !== n.id)
              .map(({ o, oi }) => ({
                id: o.id,
                label: `${oi + 1}. ${o.question.slice(0, 25) + (o.question.length > 25 ? "…" : "") || "Untitled"}`,
              })),
            onQuestionChange,
            onSetStart,
            onAddBranch,
            onBranchLabelChange,
            onBranchTargetChange,
            onBranchColorChange,
            onRemoveBranch,
          },
        } as QNode;
      });
    });
  }, [
    flow.nodes,
    flow.startNodeId,
    activeNodeId,
    layout,
    onQuestionChange,
    onSetStart,
    onAddBranch,
    onBranchLabelChange,
    onBranchTargetChange,
    onBranchColorChange,
    onRemoveBranch,
    setRfNodes,
  ]);

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
            style: { stroke: "hsl(218 11% 72%)", strokeWidth: 1.5 },
            labelStyle: { fill: "hsl(222 40% 11%)", fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: "hsl(0 0% 100%)" },
            labelBgPadding: [6, 3],
            labelBgBorderRadius: 999,
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
        className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-black transition-colors"
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
        panOnScroll
        selectionOnDrag
        panOnDrag={[1, 2]}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(220 16% 88%)" />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const d = n.data as QuestionNodeData;
            if (d?.isActive) return "hsl(144 63% 48%)";
            if (d?.isStart) return "hsl(144 63% 70%)";
            return "hsl(218 11% 78%)";
          }}
        />
      </ReactFlow>
    </div>
  );
}
