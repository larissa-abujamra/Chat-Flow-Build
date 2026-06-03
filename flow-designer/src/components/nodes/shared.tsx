// Shared types and utilities for custom Flow nodes
import type { Node } from '@xyflow/react'
import type { NodeData, FlowNode } from '@/types'

export type FlowNodeRFData = {
  flowNode: FlowNode
  onUpdate: (data: NodeData) => void
  onDelete: () => void
  isActive: boolean
} & Record<string, unknown>

export type FlowRFNode = Node<FlowNodeRFData>
