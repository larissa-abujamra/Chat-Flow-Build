import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Flag, Trash2 } from 'lucide-react'
import type { FlowRFNode } from './shared'

export default function EndNode({ data }: NodeProps<FlowRFNode>) {
  const nodeData = data.flowNode.data
  if (nodeData.type !== 'end') return null

  return (
    <div
      className={`w-64 rounded-xl border bg-card shadow-sm transition-all ${
        data.isActive
          ? 'border-destructive ring-4 ring-destructive/20'
          : 'border-border'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-destructive/60 !border-2 !border-card"
      />

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <Flag className="w-3 h-3 text-destructive" />
            Fim
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

        <div className="rounded-lg border-l-2 border-destructive bg-destructive/5 px-2.5 py-2">
          <textarea
            value={nodeData.texto}
            onChange={(e) => data.onUpdate({ type: 'end', texto: e.target.value })}
            rows={2}
            placeholder="Mensagem de encerramento…"
            className="nodrag nowheel w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
