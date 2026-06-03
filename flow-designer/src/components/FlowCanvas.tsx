import { useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type EdgeChange,
  type Connection,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  MessageCircle,
  HelpCircle,
  Zap,
  Flag,
  Globe,
  Instagram,
  Mic,
  Settings,
  Download,
  Upload,
} from 'lucide-react'
import type { FlowDefinition, FlowNode, NodeData, ActionKind } from '@/types'
import type { FlowRFNode, FlowNodeRFData } from './nodes/shared'
import StartNode from './nodes/StartNode'
import MessageNode from './nodes/MessageNode'
import QuestionNode from './nodes/QuestionNode'
import ActionNode from './nodes/ActionNode'
import EndNode from './nodes/EndNode'
import { Tooltip, TooltipProvider } from './ui/tooltip'
import { Button } from './ui/button'

const nodeTypes: NodeTypes = {
  start: StartNode,
  message: MessageNode,
  question: QuestionNode,
  action: ActionNode,
  end: EndNode,
}

interface PaletteItem {
  type: string
  label: string
  icon: React.ReactNode
  color: string
  makeData: () => NodeData
  requiresScraping?: boolean
}

function makePaletteItems(scrapingEnabled: boolean): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      type: 'message',
      label: 'Mensagem',
      icon: <MessageCircle className="w-4 h-4" />,
      color: 'hsl(var(--waz))',
      makeData: () => ({ type: 'message', texto: '' }),
    },
    {
      type: 'question',
      label: 'Pergunta',
      icon: <HelpCircle className="w-4 h-4" />,
      color: 'hsl(38 92% 55%)',
      makeData: () => ({ type: 'question', texto: '', opcoes: [] }),
    },
    {
      type: 'action',
      label: 'Instagram',
      icon: <Instagram className="w-4 h-4" />,
      color: 'hsl(var(--maky))',
      makeData: () => ({
        type: 'action',
        kind: 'conectar-instagram' as ActionKind,
        label: 'Conectar Instagram',
      }),
    },
    {
      type: 'action',
      label: 'Tom de Voz',
      icon: <Mic className="w-4 h-4" />,
      color: 'hsl(var(--waz))',
      makeData: () => ({
        type: 'action',
        kind: 'gerar-tom' as ActionKind,
        label: 'Gerar tom de voz',
      }),
    },
    {
      type: 'action',
      label: 'Ação Custom',
      icon: <Settings className="w-4 h-4" />,
      color: 'hsl(var(--ink-3))',
      makeData: () => ({
        type: 'action',
        kind: 'custom' as ActionKind,
        label: 'Ação customizada',
      }),
    },
    {
      type: 'end',
      label: 'Fim',
      icon: <Flag className="w-4 h-4" />,
      color: 'hsl(var(--destructive))',
      makeData: () => ({ type: 'end', texto: 'Até mais! 👋' }),
    },
  ]

  if (scrapingEnabled) {
    items.splice(2, 0, {
      type: 'action',
      label: 'Scraping',
      icon: <Globe className="w-4 h-4" />,
      color: 'hsl(var(--fin))',
      requiresScraping: true,
      makeData: () => ({
        type: 'action',
        kind: 'scraping' as ActionKind,
        label: 'Scraping de empresa',
      }),
    })
  }

  return items
}

export default function FlowCanvas({
  flow,
  onChange,
  activeNodeId,
}: {
  flow: FlowDefinition
  onChange: (f: FlowDefinition) => void
  activeNodeId: string | null
}) {
  // Use refs so callbacks don't go stale without triggering re-renders
  const flowRef = useRef(flow)
  flowRef.current = flow
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowRFNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  // --- Stable node callbacks ---
  const onNodeUpdate = useCallback((nodeId: string, data: NodeData) => {
    const f = flowRef.current
    onChangeRef.current({
      ...f,
      nodes: f.nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)),
    })
  }, [])

  const onNodeDelete = useCallback((nodeId: string) => {
    const f = flowRef.current
    onChangeRef.current({
      ...f,
      nodes: f.nodes.filter((n) => n.id !== nodeId),
      edges: f.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    })
  }, [])

  // --- Sync FlowDefinition.nodes → rfNodes ---
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return flow.nodes.map((fn) => {
        const existing = prevById.get(fn.id)
        const rfData: FlowNodeRFData = {
          flowNode: fn,
          onUpdate: (data: NodeData) => onNodeUpdate(fn.id, data),
          onDelete: () => onNodeDelete(fn.id),
          isActive: activeNodeId === fn.id,
        }
        return {
          ...(existing ?? {}),
          id: fn.id,
          type: fn.type,
          position: existing?.position ?? fn.position,
          data: rfData,
        } as FlowRFNode
      })
    })
  }, [flow.nodes, activeNodeId, onNodeUpdate, onNodeDelete, setRfNodes])

  // --- Sync FlowDefinition.edges → rfEdges ---
  useEffect(() => {
    // Build a map to look up opcao labels for question nodes
    const nodeById = new Map(flow.nodes.map((n) => [n.id, n]))

    const edges: Edge[] = flow.edges.map((fe) => {
      const sourceNode = nodeById.get(fe.source)
      let label = ''
      if (
        fe.sourceHandle &&
        sourceNode?.data.type === 'question'
      ) {
        const opcao = sourceNode.data.opcoes.find((o) => o.id === fe.sourceHandle)
        label = opcao?.label ?? ''
      }

      return {
        id: fe.id,
        source: fe.source,
        target: fe.target,
        sourceHandle: fe.sourceHandle,
        animated: true,
        label: label || undefined,
        style: { stroke: 'hsl(220 16% 82%)', strokeWidth: 1.5 },
        labelStyle: { fill: 'hsl(222 40% 11%)', fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: 'hsl(0 0% 100%)' },
        labelBgPadding: [5, 2] as [number, number],
        labelBgBorderRadius: 999,
      }
    })
    setRfEdges(edges)
  }, [flow.nodes, flow.edges, setRfEdges])

  // --- Persist positions on drag stop ---
  const onNodeDragStop = useCallback(() => {
    const posById = new Map(rfNodes.map((n) => [n.id, n.position]))
    onChangeRef.current({
      ...flowRef.current,
      nodes: flowRef.current.nodes.map((n) => ({
        ...n,
        position: posById.get(n.id) ?? n.position,
      })),
    })
  }, [rfNodes])

  // --- Handle new connections ---
  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return
    if (conn.source === conn.target) return
    const f = flowRef.current
    // Prevent duplicate edges from the same handle
    const duplicate = f.edges.some(
      (e) => e.source === conn.source && e.sourceHandle === (conn.sourceHandle ?? undefined)
        && e.target === conn.target
    )
    if (duplicate) return
    const newEdge = {
      id: crypto.randomUUID(),
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle ?? undefined,
    }
    onChangeRef.current({ ...f, edges: [...f.edges, newEdge] })
  }, [])

  // --- Handle edge deletion ---
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes)
      const removedIds = new Set(
        changes
          .filter((c): c is EdgeChange & { type: 'remove'; id: string } => c.type === 'remove')
          .map((c) => c.id)
      )
      if (removedIds.size === 0) return
      const f = flowRef.current
      onChangeRef.current({
        ...f,
        edges: f.edges.filter((e) => !removedIds.has(e.id)),
      })
    },
    [onEdgesChange]
  )

  // --- Handle node deletion from canvas (backspace/delete key) ---
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map((d) => d.id))
    const f = flowRef.current
    onChangeRef.current({
      ...f,
      nodes: f.nodes.filter((n) => !ids.has(n.id)),
      edges: f.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
    })
  }, [])

  // --- Add a node from the palette ---
  const addNode = useCallback((item: PaletteItem) => {
    const f = flowRef.current
    const newNode: FlowNode = {
      id: crypto.randomUUID(),
      type: item.type as FlowNode['type'],
      position: {
        x: 100 + Math.random() * 200,
        y: 100 + f.nodes.length * 20,
      },
      data: item.makeData(),
    }
    onChangeRef.current({ ...f, nodes: [...f.nodes, newNode] })
  }, [])

  const palette = makePaletteItems(flow.scrapingEnabled)

  return (
    <div className="relative w-full h-full">
      {/* Node palette — left edge */}
      <TooltipProvider delayDuration={300}>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5 bg-card border border-border rounded-xl shadow-sm p-1.5">
          <span className="eyebrow text-center px-1 mb-0.5">Nós</span>
          {palette.map((item, i) => (
            <Tooltip key={i} label={item.label} side="right">
              <button
                type="button"
                onClick={() => addNode(item)}
                className="w-9 h-9 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
                style={{ color: item.color }}
              >
                {item.icon}
              </button>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

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
        fitViewOptions={{ padding: 0.3 }}
        panOnScroll
        selectionOnDrag
        panOnDrag={[1, 2]}
        zoomOnScroll={false}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(220 16% 88%)" />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const d = n.data as FlowNodeRFData
            if (d?.isActive) return 'hsl(var(--waz))'
            const type = d?.flowNode?.type
            if (type === 'start') return 'hsl(var(--waz))'
            if (type === 'message') return 'hsl(var(--waz) / 0.4)'
            if (type === 'question') return 'hsl(38 92% 55% / 0.6)'
            if (type === 'action') return 'hsl(var(--fin) / 0.6)'
            if (type === 'end') return 'hsl(var(--destructive) / 0.6)'
            return 'hsl(var(--muted-foreground))'
          }}
        />
      </ReactFlow>
    </div>
  )
}
