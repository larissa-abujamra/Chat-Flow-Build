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
} from 'lucide-react'
import type { FlowDefinition, FlowNode, ActionKind } from '@/types'
import { Button } from './ui/button'

// ── Types ───────────────────────────────────────────────────────────────────

type ChatItem =
  | { kind: 'bot'; text: string; nodeId: string }
  | { kind: 'action'; actionKind: ActionKind; label: string; nodeId: string }
  | { kind: 'user'; text: string; nodeId: string }
  | { kind: 'choices'; opcoes: Array<{ id: string; label: string }>; nodeId: string; chosen?: string }

interface PreviewState {
  items: ChatItem[]
  currentNodeId: string | null
  waitingForChoice: boolean
  done: boolean
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

/**
 * Walk from a given node, appending auto-advance items (bot, action) until
 * we either hit a question, end, or dead-end. Returns the updated state.
 *
 * `visited` prevents infinite loops.
 */
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
      // Silently advance past start
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
      items.push({
        kind: 'bot',
        text: data.texto,
        nodeId: node.id,
      })
      items.push({
        kind: 'choices',
        opcoes: data.opcoes,
        nodeId: node.id,
      })
      return { items, currentNodeId: node.id, waitingForChoice: true, done: false }
    }

    if (data.type === 'action') {
      items.push({ kind: 'action', actionKind: data.kind, label: data.label, nodeId: node.id })
      const next = nextNode(flow, node.id)
      nodeId = next?.id ?? null
      continue
    }

    if (data.type === 'end') {
      if (data.texto) {
        items.push({ kind: 'bot', text: data.texto, nodeId: node.id })
      }
      return { items, currentNodeId: node.id, waitingForChoice: false, done: true }
    }

    break
  }

  // Dead end or disconnected
  return { items, currentNodeId: nodeId, waitingForChoice: false, done: false }
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
    waitingForChoice: false,
    done: false,
  })
  const [started, setStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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
        waitingForChoice: false,
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
          waitingForChoice: false,
          done: false,
        }
    setState(newState)
    setStarted(true)
    notifyActive(newState.currentNodeId)
  }, [flow, notifyActive])

  const handleChoice = useCallback(
    (nodeId: string, opcaoId: string, opcaoLabel: string) => {
      setState((prev) => {
        // Replace the pending choices item with a confirmed one + user message
        const items: ChatItem[] = prev.items.map((item) =>
          item.kind === 'choices' && item.nodeId === nodeId && !item.chosen
            ? { ...item, chosen: opcaoId }
            : item
        )
        items.push({ kind: 'user', text: opcaoLabel, nodeId })

        // Find the edge keyed by sourceHandle = opcaoId
        const edge = flow.edges.find(
          (e) => e.source === nodeId && e.sourceHandle === opcaoId
        )
        if (!edge) {
          // Dead end — no edge for this option
          return {
            ...prev,
            items: [
              ...items,
              { kind: 'bot', text: '(Essa opção ainda não tem destino.)', nodeId },
            ],
            waitingForChoice: false,
          }
        }

        const newState = walkForward(flow, edge.target, items)
        notifyActive(newState.currentNodeId)
        return newState
      })
    },
    [flow, notifyActive]
  )

  const restart = useCallback(() => {
    setStarted(false)
    setState({ items: [], currentNodeId: null, waitingForChoice: false, done: false })
    notifyActive(null)
  }, [notifyActive])

  // Scroll to bottom whenever items change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [state.items])

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 h-full px-3 border-l border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors writing-mode-vertical"
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
          {/* Waz avatar */}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={restart}
            title="Reiniciar preview"
            aria-label="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            title="Recolher preview"
            aria-label="Recolher"
          >
            <PanelRightClose className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-secondary/40"
      >
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

          if (item.kind === 'choices') {
            if (item.chosen) {
              // Already chosen — show greyed-out buttons
              return (
                <div key={i} className="flex flex-wrap gap-1.5 pl-8">
                  {item.opcoes.map((o) => (
                    <span
                      key={o.id}
                      className={`px-3 py-1.5 rounded-full text-xs border text-muted-foreground ${
                        o.id === item.chosen
                          ? 'border-foreground/30 bg-muted'
                          : 'border-border opacity-40'
                      }`}
                    >
                      {o.label}
                    </span>
                  ))}
                </div>
              )
            }

            // Active — show clickable buttons
            return (
              <div key={i} className="flex flex-wrap gap-1.5 pl-8">
                {item.opcoes.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    (nenhuma opção adicionada)
                  </span>
                ) : (
                  item.opcoes.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => handleChoice(item.nodeId, o.id, o.label)}
                      className="px-3 py-1.5 rounded-full text-xs border border-border bg-card hover:bg-muted hover:border-foreground/30 transition-colors font-medium"
                    >
                      {o.label}
                    </button>
                  ))
                )}
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

        {started && !state.done && !state.waitingForChoice && state.items.length > 0 && (
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
    </div>
  )
}
