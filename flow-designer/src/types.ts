export type NodeType = 'start' | 'message' | 'question' | 'action' | 'end'

export type ActionKind = 'scraping' | 'conectar-instagram' | 'gerar-tom' | 'custom'

export type NodeData =
  | { type: 'start' }
  | { type: 'message'; texto: string }
  | { type: 'question'; texto: string; opcoes: OpcaoItem[] }
  | { type: 'action'; kind: ActionKind; label: string }
  | { type: 'end'; texto: string }

export interface OpcaoItem {
  id: string
  label: string
}

export interface FlowNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: NodeData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export type FlowId = 'flow-a' | 'flow-b' | 'flow-c'

export interface FlowDefinition {
  id: FlowId
  nome: string
  scrapingEnabled: boolean
  nodes: FlowNode[]
  edges: FlowEdge[]
}
