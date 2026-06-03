import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RotateCcw,
  PanelRightClose,
  PanelRightOpen,
  Globe,
  Instagram,
  Mic,
  Settings,
  Zap,
  Send,
} from 'lucide-react'
import type { FlowDefinition, FlowNode, ActionKind, OpcaoItem } from '@/types'
import { Button } from './ui/button'

// ── Types ───────────────────────────────────────────────────────────────────

type ChatItem =
  | { kind: 'bot'; text: string; nodeId: string }
  | { kind: 'action'; actionKind: ActionKind; label: string; nodeId: string }
  | { kind: 'user'; text: string; nodeId: string }

interface PreviewState {
  items: ChatItem[]
  currentNodeId: string | null
  waitingForInput: boolean
  done: boolean
}

// ── Flexible text matching ───────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().trim().replace(/[.,!?;]/g, '').trim()
}

function matchOpcao(input: string, opcoes: OpcaoItem[]): OpcaoItem | null {
  if (opcoes.length === 0) return null
  // Single path — any input advances
  if (opcoes.length === 1) return opcoes[0]

  const n = norm(input)

  // 1. Exact match on label or any variant
  for (const o of opcoes) {
    if (norm(o.label) === n) return o
    if (o.variants?.some((v) => norm(v) === n)) return o
  }

  // 2. Contains match (input contains label or label contains input)
  for (const o of opcoes) {
    const nl = norm(o.label)
    if (n.includes(nl) || nl.includes(n)) return o
    if (o.variants?.some((v) => { const nv = norm(v); return n.includes(nv) || nv.includes(n) })) return o
  }

  // 3. First-word match
  const firstWord = n.split(/\s+/)[0]
  if (firstWord) {
    for (const o of opcoes) {
      if (norm(o.label).startsWith(firstWord)) return o
      if (o.variants?.some((v) => norm(v).startsWith(firstWord))) return o
    }
  }

  // 4. Default: first option
  return opcoes[0]
}

// ── Traversal helpers ────────────────────────────────────────────────────────

function findStartNode(flow: FlowDefinition): FlowNode | null {
  return flow.nodes.find((n) => n.type === 'start') ?? null
}

function nextNode(flow: FlowDefinition, nodeId: string, sourceHandle?: string): FlowNode | null {
  const edge = flow.edges.find(
    (e) =>
      e.source === nodeId &&
      (sourceHandle ? e.sourceHandle === sourceHandle : !e.sourceHandle || e.sourceHandle === undefined)
  )
  if (!edge) return null
  return flow.nodes.find((n) => n.id === edge.target) ?? null
}

function walkForward(
  flow: FlowDefinition,
  startId: string,
  prevItems: ChatItem[],
  visited = new Set<string>()
): PreviewState {
  const items: ChatItem[] = [...prevItems]
  let nodeId: string | null = startId

  while (nodeId) {
    if (visited.has(nodeId)) break
    visited.add(nodeId)

    const node = flow.nodes.find((n) => n.id === nodeId)
    if (!node) break

    const data = node.data

    if (data.type === 'start') {
      const next = nextNode(flow, node.id)
      nodeId = next?.id ?? null
      continue
    }

    if (data.type === 'message') {
      items.push({ kind: 'bot', text: data.texto, nodeId: node.id })
      const next = nextNode(flow, node.id)
      nodeId = next?.id ?? null
      continue
    }

    if (data.type === 'question') {
      items.push({ kind: 'bot', text: data.texto, nodeId: node.id })
      return { items, currentNodeId: node.id, waitingForInput: true, done: false }
    }

    if (data.type === 'action') {
      items.push({ kind: 'action', actionKind: data.kind, label: data.label, nodeId: node.id })
      const next = nextNode(flow, node.id)
      nodeId = next?.id ?? null
      continue
    }

    if (data.type === 'end') {
      if (data.texto) items.push({ kind: 'bot', text: data.texto, nodeId: node.id })
      return { items, currentNodeId: node.id, waitingForInput: false, done: true }
    }

    break
  }

  return { items, currentNodeId: nodeId, waitingForInput: false, done: false }
}

// ── Action icon map ──────────────────────────────────────────────────────────

const ACTION_ICON: Record<ActionKind, React.ReactNode> = {
  scraping: <Globe className="w-3.5 h-3.5" />,
  'conectar-instagram': <Instagram className="w-3.5 h-3.5" />,
  'gerar-tom': <Mic className="w-3.5 h-3.5" />,
  custom: <Settings className="w-3.5 h-3.5" />,
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatPreview({
  flow,
  onActiveNodeChange,
  collapsed,
  onToggleCollapse,
}: {
  flow: FlowDefinition
  onActiveNodeChange: (nodeId: string | null) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const [state, setState] = useState<PreviewState>({
    items: [],
    currentNodeId: null,
    waitingForInput: false,
    done: false,
  })
  const [started, setStarted] = useState(false)
  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const notifyActive = useCallback(
    (nodeId: string | null) => onActiveNodeChange(nodeId),
    [onActiveNodeChange]
  )

  const start = useCallback(() => {
    const startNode = findStartNode(flow)
    if (!startNode) {
      setState({
        items: [{ kind: 'bot', text: '⚠️ Fluxo sem nó de início.', nodeId: '' }],
        currentNodeId: null,
        waitingForInput: false,
        done: false,
      })
      setStarted(true)
      return
    }
    const next = nextNode(flow, startNode.id)
    const newState = next
      ? walkForward(flow, next.id, [])
      : {
          items: [{ kind: 'bot' as const, text: '(Nó start sem conexão.)', nodeId: startNode.id }],
          currentNodeId: startNode.id,
          waitingForInput: false,
          done: false,
        }
    setState(newState)
    setStarted(true)
    notifyActive(newState.currentNodeId)
  }, [flow, notifyActive])

  const handleTextSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !state.currentNodeId) return

      setState((prev) => {
        const node = flow.nodes.find((n) => n.id === prev.currentNodeId)
        if (!node || node.data.type !== 'question') return prev

        const opcoes = node.data.opcoes
        const matched = matchOpcao(trimmed, opcoes)

        const items: ChatItem[] = [
          ...prev.items,
          { kind: 'user', text: trimmed, nodeId: node.id },
        ]

        if (!matched) {
          return {
            ...prev,
            items: [
              ...items,
              { kind: 'bot', text: '(Essa pergunta ainda não tem respostas configuradas.)', nodeId: node.id },
            ],
            waitingForInput: false,
          }
        }

        const edge = flow.edges.find(
          (e) => e.source === node.id && e.sourceHandle === matched.id
        )
        if (!edge) {
          return {
            ...prev,
            items: [
              ...items,
              { kind: 'bot', text: '(Essa resposta ainda não tem destino configurado.)', nodeId: node.id },
            ],
            waitingForInput: false,
          }
        }

        const newState = walkForward(flow, edge.target, items)
        notifyActive(newState.currentNodeId)
        return newState
      })

      setInputText('')
    },
    [flow, state.currentNodeId, notifyActive]
  )

  const restart = useCallback(() => {
    setStarted(false)
    setInputText('')
    setState({ items: [], currentNodeId: null, waitingForInput: false, done: false })
    notifyActive(null)
  }, [notifyActive])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [state.items])

  useEffect(() => {
    if (state.waitingForInput) inputRef.current?.focus()
  }, [state.waitingForInput])

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 h-full px-3 border-l border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        style={{ writingMode: 'vertical-lr' }}
        title="Abrir preview"
      >
        <PanelRightOpen className="w-4 h-4 rotate-180" />
        <span className="text-xs font-medium eyebrow mt-2">Preview</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card border-l border-border" style={{ width: 340 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: 'hsl(var(--waz))' }}
          >
            W
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Waz</p>
            <p className="eyebrow mt-0.5">Preview do fluxo</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={restart} title="Reiniciar preview" aria-label="Reiniciar">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Recolher preview" aria-label="Recolher">
            <PanelRightClose className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-secondary/40">
        {!started && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ background: 'hsl(var(--waz))' }}
            >
              W
            </div>
            <p className="text-sm text-muted-foreground max-w-[180px]">
              Visualize o fluxo como conversa real
            </p>
            <Button variant="waz" onClick={start}>
              Iniciar preview
            </Button>
          </div>
        )}

        {state.items.map((item, i) => {
          if (item.kind === 'bot') {
            return (
              <div key={i} className="flex items-end gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ background: 'hsl(var(--waz))' }}
                >
                  W
                </div>
                <div
                  className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm bg-card border border-border text-foreground ${
                    item.text ? '' : 'italic text-muted-foreground'
                  }`}
                >
                  {item.text || '(mensagem vazia)'}
                </div>
              </div>
            )
          }

          if (item.kind === 'action') {
            return (
              <div key={i} className="flex items-end gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ background: 'hsl(var(--fin))' }}
                >
                  <Zap className="w-3 h-3" />
                </div>
                <div className="max-w-[78%] px-3 py-2 rounded-2xl rounded-tl-sm text-xs bg-fin/10 border border-fin/20 text-fin flex items-center gap-1.5">
                  {ACTION_ICON[item.actionKind]}
                  <span className="font-medium">{item.label || item.actionKind}</span>
                </div>
              </div>
            )
          }

          if (item.kind === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[78%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm bg-primary text-primary-foreground">
                  {item.text}
                </div>
              </div>
            )
          }

          return null
        })}

        {state.done && (
          <div className="flex flex-col items-center pt-4 border-t border-border space-y-3">
            <p className="text-xs text-muted-foreground">Conversa encerrada</p>
            <Button variant="outline" size="sm" onClick={restart}>
              <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
            </Button>
          </div>
        )}

        {started && !state.done && !state.waitingForInput && state.items.length > 0 && (
          <div className="flex justify-start pl-8">
            <div className="px-3.5 py-2.5 bg-card border border-border rounded-2xl rounded-tl-sm flex items-center gap-1.5">
              <span className="sr-only">Waz está digitando</span>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Text input bar */}
      {started && !state.done && state.waitingForInput && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleTextSubmit(inputText) }}
          className="px-3 py-2.5 border-t border-border bg-card shrink-0 flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Digite sua resposta…"
            className="flex-1 rounded-full border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40 transition-opacity shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  )
}
