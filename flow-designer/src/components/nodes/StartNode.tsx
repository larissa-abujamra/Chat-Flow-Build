import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { FlowRFNode } from './shared'

export default function StartNode({ data }: NodeProps<FlowRFNode>) {
  return (
    <div
      className={`rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all select-none ${
        data.isActive
          ? 'ring-4 ring-waz/30 shadow-[0_0_0_1px_hsl(var(--waz))]'
          : ''
      }`}
      style={{ background: 'hsl(var(--waz))' }}
    >
      <span>INÍCIO</span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-white !border-2 !border-waz"
      />
    </div>
  )
}
