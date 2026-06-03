import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MessageCircle, Trash2 } from 'lucide-react'
import type { FlowRFNode } from './shared'
import { VarText } from './VarText'

export default function MessageNode({ data }: NodeProps<FlowRFNode>) {
  const nodeData = data.flowNode.data
  if (nodeData.type !== 'message') return null

  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm transition-all ${
        data.isActive
          ? 'border-waz ring-4 ring-waz/20'
          : 'border-border'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-waz/60 !border-2 !border-card"
      />

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <MessageCircle className="w-3 h-3 text-waz" />
            Mensagem Waz
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

        <div className="rounded-lg border-l-2 border-waz bg-waz/5 px-2.5 py-2">
          <VarText
            value={nodeData.texto}
            onChange={(v) => data.onUpdate({ type: 'message', texto: v })}
            rows={3}
            placeholder="Waz diz…"
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-card"
      />
    </div>
  )
}
