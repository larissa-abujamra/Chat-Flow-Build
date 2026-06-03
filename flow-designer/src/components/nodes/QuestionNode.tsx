import { Handle, Position, type NodeProps } from '@xyflow/react'
import { HelpCircle, Plus, Trash2 } from 'lucide-react'
import type { FlowRFNode } from './shared'
import type { OpcaoItem } from '@/types'

export default function QuestionNode({ data }: NodeProps<FlowRFNode>) {
  const nodeData = data.flowNode.data
  if (nodeData.type !== 'question') return null

  const addOpcao = () => {
    const newOpcao: OpcaoItem = { id: crypto.randomUUID(), label: 'Nova opção' }
    data.onUpdate({
      ...nodeData,
      opcoes: [...nodeData.opcoes, newOpcao],
    })
  }

  const updateOpcaoLabel = (id: string, label: string) => {
    data.onUpdate({
      ...nodeData,
      opcoes: nodeData.opcoes.map((o) => (o.id === id ? { ...o, label } : o)),
    })
  }

  const removeOpcao = (id: string) => {
    data.onUpdate({
      ...nodeData,
      opcoes: nodeData.opcoes.filter((o) => o.id !== id),
    })
  }

  // Position source handles evenly across the bottom
  const getHandleLeft = (i: number, total: number) =>
    total === 1 ? '50%' : `${((i + 0.5) / total) * 100}%`

  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm transition-all ${
        data.isActive
          ? 'border-amber-400 ring-4 ring-amber-400/20'
          : 'border-border'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-400/60 !border-2 !border-card"
      />

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <HelpCircle className="w-3 h-3 text-amber-500" />
            Pergunta
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

        <div className="rounded-lg border-l-2 border-amber-400 bg-amber-50/60 px-2.5 py-2">
          <textarea
            value={nodeData.texto}
            onChange={(e) =>
              data.onUpdate({
                ...nodeData,
                texto: e.target.value,
              })
            }
            rows={2}
            placeholder="Waz pergunta…"
            className="nodrag nowheel w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <span className="eyebrow">Respostas esperadas</span>
          {nodeData.opcoes.map((opcao, i) => (
            <div key={opcao.id} className="flex items-center gap-1.5">
              <span
                className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: 'hsl(var(--fin))' }}
              >
                {i + 1}
              </span>
              <input
                value={opcao.label}
                onChange={(e) => updateOpcaoLabel(opcao.id, e.target.value)}
                className="nodrag nowheel flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Resposta do usuário"
              />
              <button
                type="button"
                className="nodrag shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeOpcao(opcao.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="nodrag flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            onClick={addOpcao}
          >
            <Plus className="w-3 h-3" /> Adicionar resposta
          </button>
        </div>
      </div>

      {/* One source handle per opcao, evenly spaced */}
      {nodeData.opcoes.map((opcao, i) => (
        <Handle
          key={opcao.id}
          id={opcao.id}
          type="source"
          position={Position.Bottom}
          style={{ left: getHandleLeft(i, nodeData.opcoes.length) }}
          className="!w-3 !h-3 !bg-fin !border-2 !border-card"
        />
      ))}
      {nodeData.opcoes.length === 0 && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-muted !border-2 !border-card"
        />
      )}
    </div>
  )
}
