import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Globe, Instagram, Mic, Settings, Trash2 } from 'lucide-react'
import type { FlowRFNode } from './shared'
import type { ActionKind } from '@/types'

const KIND_META: Record<ActionKind, { label: string; icon: React.ReactNode; color: string }> = {
  scraping: {
    label: 'Scraping',
    icon: <Globe className="w-3.5 h-3.5" />,
    color: 'hsl(var(--fin))',
  },
  'conectar-instagram': {
    label: 'Conectar Instagram',
    icon: <Instagram className="w-3.5 h-3.5" />,
    color: 'hsl(var(--maky))',
  },
  'gerar-tom': {
    label: 'Gerar Tom de Voz',
    icon: <Mic className="w-3.5 h-3.5" />,
    color: 'hsl(var(--waz))',
  },
  custom: {
    label: 'Ação Custom',
    icon: <Settings className="w-3.5 h-3.5" />,
    color: 'hsl(var(--ink-3))',
  },
}

export default function ActionNode({ data }: NodeProps<FlowRFNode>) {
  const nodeData = data.flowNode.data
  if (nodeData.type !== 'action') return null

  const meta = KIND_META[nodeData.kind]

  return (
    <div
      className={`w-64 rounded-xl border bg-card shadow-sm transition-all ${
        data.isActive ? 'border-fin ring-4 ring-fin/20' : 'border-border'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-fin/60 !border-2 !border-card"
      />

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <span style={{ color: meta.color }}>{meta.icon}</span>
            Ação
          </span>
          <button
            type="button"
            className="nodrag text-muted-foreground hover:text-destructive transition-colors"
            onClick={data.onDelete}
            title="Deletar nó"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          className="rounded-lg px-3 py-2 flex items-center gap-2"
          style={{ background: `${meta.color}18`, borderLeft: `2px solid ${meta.color}` }}
        >
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold" style={{ color: meta.color }}>
              {meta.label}
            </div>
            <input
              value={nodeData.label}
              onChange={(e) =>
                data.onUpdate({ type: 'action', kind: nodeData.kind, label: e.target.value })
              }
              placeholder="Descrição da ação"
              className="nodrag nowheel w-full bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none mt-0.5"
            />
          </div>
        </div>

        <select
          value={nodeData.kind}
          onChange={(e) =>
            data.onUpdate({
              type: 'action',
              kind: e.target.value as ActionKind,
              label: nodeData.label,
            })
          }
          className="nodrag nowheel w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="scraping">Scraping</option>
          <option value="conectar-instagram">Conectar Instagram</option>
          <option value="gerar-tom">Gerar Tom de Voz</option>
          <option value="custom">Ação Custom</option>
        </select>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-card"
      />
    </div>
  )
}
