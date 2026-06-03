export type NodeType = 'start' | 'message' | 'question' | 'action' | 'end'

export type ActionKind = 'scraping' | 'conectar-instagram' | 'gerar-tom' | 'custom'

// `stepId` (opcional) liga um nó do canvas a uma etapa semântica do onboarding
// real (welcome, ask_city, confirm_contact, instagram, ifood, …). Fluxos
// adaptativos (Fluxo Stefano e novos fluxos) usam isso para reformar o wizard
// conforme a ordem/presença/textos dos nós. Fluxos sem stepId (A/B/C) seguem
// usando o ChatPreview roteirizado.
export type NodeData =
  | { type: 'start'; stepId?: string }
  | { type: 'message'; texto: string; stepId?: string }
  | { type: 'question'; texto: string; opcoes: OpcaoItem[]; salvarComo?: string; stepId?: string }
  | { type: 'action'; kind: ActionKind; label: string; stepId?: string }
  | { type: 'end'; texto: string; stepId?: string }

export interface OpcaoItem {
  id: string
  label: string
  variants?: string[] // alternative phrasings that route to the same destination
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

export type FlowId = string

export interface FlowDefinition {
  id: FlowId
  nome: string
  scrapingEnabled: boolean
  nodes: FlowNode[]
  edges: FlowEdge[]
}
