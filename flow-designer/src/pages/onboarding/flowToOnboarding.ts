import type { FlowDefinition, FlowNode } from '@/types'
import { DEFAULT_STEP_IDS, type Step } from './steps'

// Liga cada etapa semântica do wizard à chave de texto que o nó do canvas
// sobrescreve, por tipo de nó (mensagem vs pergunta). Chaves inexistentes são
// no-op seguro (o wizard usa overrides[key] ?? default).
const STEP_TEXT_KEY: Record<string, { message?: string; question?: string }> = {
  welcome: { message: 'welcome.l1', question: 'welcome.ask' },
  ask_city: { question: 'ask_city.msg' },
  confirm_contact: { question: 'confirm_contact.msg' },
  confirm_site: { question: 'confirm_site.confirm' },
  instagram: { question: 'instagram.l2' },
  ifood: { question: 'ifood.encontrei' },
  catalog: { question: 'catalog.found' },
  fulfillment: { question: 'fulfillment.msg' },
  tone_generated: { question: 'tone_generated.found' },
  emojis: { question: 'emojis.msg' },
  escalation: { question: 'escalation.msg' },
  tasks: { question: 'tasks.msg' },
  review: { message: 'review.msg' },
  configured: { message: 'configured.l1' },
}

const VALID_STEP_IDS = new Set(DEFAULT_STEP_IDS)

/** Um fluxo é "adaptativo" (usa o wizard real) se algum nó carrega stepId. */
export function flowHasStepIds(flow: FlowDefinition): boolean {
  return flow.nodes.some((n) => !!(n.data as { stepId?: string }).stepId)
}

// Caminha o grafo a partir do nó `start`, seguindo a primeira aresta de saída de
// cada nó (caminho principal), e devolve os nós em ordem de visita. Protege
// contra ciclos. Nós não alcançados entram no fim (ordem original) como reserva.
function orderedNodes(flow: FlowDefinition): FlowNode[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const outFirst = new Map<string, string>()
  for (const e of flow.edges) {
    if (!outFirst.has(e.source)) outFirst.set(e.source, e.target)
  }
  const start = flow.nodes.find((n) => n.type === 'start') ?? flow.nodes[0]
  const ordered: FlowNode[] = []
  const seen = new Set<string>()
  let cur: FlowNode | undefined = start
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    ordered.push(cur)
    const nextId = outFirst.get(cur.id)
    cur = nextId ? byId.get(nextId) : undefined
  }
  // nós órfãos (não no caminho principal) preservados no fim
  for (const n of flow.nodes) if (!seen.has(n.id)) ordered.push(n)
  return ordered
}

/**
 * Converte um FlowDefinition em props do wizard real (OnboardingPreview):
 *  - `steps`: as etapas cujos nós existem, NA ORDEM do grafo (excluir um nó
 *    pula a etapa; reordenar reordena o wizard). `features` (o tour) sempre no fim.
 *  - `overrides`: o texto editado de cada nó aplicado à chave principal da etapa.
 * Retorna null se o fluxo não for adaptativo (sem stepIds) → caller usa ChatPreview.
 */
export function flowToOnboarding(
  flow: FlowDefinition,
): { steps: Step[]; overrides: Record<string, string> } | null {
  if (!flowHasStepIds(flow)) return null

  const overrides: Record<string, string> = {}
  const stepOrder: string[] = []
  const added = new Set<string>()

  for (const node of orderedNodes(flow)) {
    const data = node.data as { stepId?: string; texto?: string }
    const stepId = data.stepId
    if (!stepId || !VALID_STEP_IDS.has(stepId)) continue
    if (!added.has(stepId)) {
      added.add(stepId)
      stepOrder.push(stepId)
    }
    // texto do nó → chave principal da etapa (por tipo de nó)
    const texto = (data.texto || '').trim()
    if (texto) {
      const keys = STEP_TEXT_KEY[stepId]
      const key = node.type === 'message' ? keys?.message : keys?.question
      if (key) overrides[key] = texto
    }
  }

  if (!stepOrder.length) return null

  // O tour de funcionalidades é sempre a última etapa.
  if (!added.has('features')) stepOrder.push('features')

  const steps: Step[] = stepOrder.map((id) => ({ id, kind: 'builtin' as const }))
  return { steps, overrides }
}
