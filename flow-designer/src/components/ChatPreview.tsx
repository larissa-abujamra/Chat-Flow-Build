import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'wouter'
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
  Smartphone,
} from 'lucide-react'
import type { FlowDefinition, FlowNode, ActionKind, OpcaoItem, FlowId } from '@/types'
import { Button } from './ui/button'

// ── Orb ──────────────────────────────────────────────────────────────────────

export function Orb({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/orbe.png"
      alt="Orbe"
      width={size}
      height={size}
      style={{ flexShrink: 0, borderRadius: '50%', objectFit: 'cover' }}
    />
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatItem =
  | { kind: 'bot'; text: string; nodeId: string }
  | { kind: 'action'; actionKind: ActionKind; label: string; nodeId: string }
  | { kind: 'user'; text: string; nodeId: string }

interface PreviewState {
  visibleItems: ChatItem[]
  pendingItems: ChatItem[]
  currentNodeId: string | null
  pendingWaitingForInput: boolean
  pendingDone: boolean
}

const EMPTY: PreviewState = {
  visibleItems: [],
  pendingItems: [],
  currentNodeId: null,
  pendingWaitingForInput: false,
  pendingDone: false,
}

// ── Matching ──────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().trim().replace(/[.,!?;]/g, '').trim()
}

function matchOpcao(input: string, opcoes: OpcaoItem[]): OpcaoItem | null {
  if (opcoes.length === 0) return null
  if (opcoes.length === 1) return opcoes[0]
  const n = norm(input)
  for (const o of opcoes) {
    if (norm(o.label) === n) return o
    if (o.variants?.some((v) => norm(v) === n)) return o
  }
  for (const o of opcoes) {
    const nl = norm(o.label)
    if (n.includes(nl) || nl.includes(n)) return o
    if (o.variants?.some((v) => { const nv = norm(v); return n.includes(nv) || nv.includes(n) })) return o
  }
  const fw = n.split(/\s+/)[0]
  if (fw) {
    for (const o of opcoes) {
      if (norm(o.label).startsWith(fw)) return o
      if (o.variants?.some((v) => norm(v).startsWith(fw))) return o
    }
  }
  return opcoes[0]
}

// ── Message splitting ─────────────────────────────────────────────────────────

function splitMessages(texto: string): string[] {
  return texto.split(/\n[ \t]*---[ \t]*\n/).map((p) => p.trim()).filter(Boolean)
}

// ── Traversal ─────────────────────────────────────────────────────────────────

function findStartNode(flow: FlowDefinition): FlowNode | null {
  return flow.nodes.find((n) => n.type === 'start') ?? null
}

function nextNode(flow: FlowDefinition, nodeId: string, sourceHandle?: string): FlowNode | null {
  const edge = flow.edges.find(
    (e) => e.source === nodeId && (sourceHandle ? e.sourceHandle === sourceHandle : !e.sourceHandle || e.sourceHandle === undefined)
  )
  return edge ? (flow.nodes.find((n) => n.id === edge.target) ?? null) : null
}

type WalkResult = { items: ChatItem[]; currentNodeId: string | null; waitingForInput: boolean; done: boolean }

function walkForward(
  flow: FlowDefinition,
  startId: string,
  prevItems: ChatItem[],
  visited = new Set<string>()
): WalkResult {
  const items: ChatItem[] = [...prevItems]
  let nodeId: string | null = startId
  while (nodeId) {
    if (visited.has(nodeId)) break
    visited.add(nodeId)
    const node = flow.nodes.find((n) => n.id === nodeId)
    if (!node) break
    const data = node.data
    if (data.type === 'start') { nodeId = nextNode(flow, node.id)?.id ?? null; continue }
    if (data.type === 'message') {
      for (const part of splitMessages(data.texto)) {
        items.push({ kind: 'bot', text: part, nodeId: node.id })
      }
      nodeId = nextNode(flow, node.id)?.id ?? null
      continue
    }
    if (data.type === 'question') {
      for (const part of splitMessages(data.texto)) {
        items.push({ kind: 'bot', text: part, nodeId: node.id })
      }
      return { items, currentNodeId: node.id, waitingForInput: true, done: false }
    }
    if (data.type === 'action') {
      items.push({ kind: 'action', actionKind: data.kind, label: data.label, nodeId: node.id })
      nodeId = nextNode(flow, node.id)?.id ?? null
      continue
    }
    if (data.type === 'end') {
      if (data.texto) {
        for (const part of splitMessages(data.texto)) {
          items.push({ kind: 'bot', text: part, nodeId: node.id })
        }
      }
      return { items, currentNodeId: node.id, waitingForInput: false, done: true }
    }
    break
  }
  return { items, currentNodeId: nodeId, waitingForInput: false, done: false }
}

// ── Typing delay ──────────────────────────────────────────────────────────────

function typingDelay(item: ChatItem): number {
  if (item.kind === 'bot') return Math.min(Math.max(item.text.length * 18, 900), 2400)
  if (item.kind === 'action') return 500
  return 0
}

// ── Action icons ──────────────────────────────────────────────────────────────

const ACTION_ICON: Record<ActionKind, React.ReactNode> = {
  scraping: <Globe className="w-3.5 h-3.5" />,
  'conectar-instagram': <Instagram className="w-3.5 h-3.5" />,
  'gerar-tom': <Mic className="w-3.5 h-3.5" />,
  custom: <Settings className="w-3.5 h-3.5" />,
}

// ── Background style ──────────────────────────────────────────────────────────

const CHAT_BG: React.CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(251,113,133,0.07) 0%, rgba(34,197,94,0.05) 36%, rgba(59,130,246,0.05) 72%, transparent 100%)',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPreview({
  flow,
  onActiveNodeChange,
  collapsed,
  onToggleCollapse,
  flowId,
  standalone = false,
}: {
  flow: FlowDefinition
  onActiveNodeChange?: (nodeId: string | null) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  flowId?: FlowId
  standalone?: boolean
}) {
  const [state, setState] = useState<PreviewState>(EMPTY)
  const [isTyping, setIsTyping] = useState(false)
  const [started, setStarted] = useState(false)
  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notifyActive = useCallback(
    (nodeId: string | null) => onActiveNodeChange?.(nodeId),
    [onActiveNodeChange]
  )

  const waitingForInput = state.pendingItems.length === 0 && state.pendingWaitingForInput
  const done = state.pendingItems.length === 0 && state.pendingDone

  // ── Animate pending items one by one ────────────────────────────────────────
  useEffect(() => {
    if (state.pendingItems.length === 0 || processingRef.current) return

    const next = state.pendingItems[0]
    processingRef.current = true
    const delay = typingDelay(next)

    if (delay > 0 && next.kind === 'bot') setIsTyping(true)

    timerRef.current = setTimeout(() => {
      setIsTyping(false)
      setState((prev) => {
        if (prev.pendingItems.length === 0) return prev
        return {
          ...prev,
          visibleItems: [...prev.visibleItems, prev.pendingItems[0]],
          pendingItems: prev.pendingItems.slice(1),
        }
      })
      processingRef.current = false
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      processingRef.current = false
      setIsTyping(false)
    }
  }, [state.pendingItems])

  // Notify active node once all pending items are revealed
  useEffect(() => {
    if (waitingForInput) notifyActive(state.currentNodeId)
  }, [waitingForInput, state.currentNodeId, notifyActive])

  const start = useCallback(() => {
    const startNode = findStartNode(flow)
    const errItem = (text: string, nodeId: string): PreviewState => ({
      ...EMPTY,
      pendingItems: [{ kind: 'bot', text, nodeId }],
    })
    if (!startNode) {
      setState(errItem('⚠️ Fluxo sem nó de início.', ''))
      setStarted(true)
      return
    }
    const next = nextNode(flow, startNode.id)
    if (!next) {
      setState(errItem('(Nó start sem conexão.)', startNode.id))
      setStarted(true)
      return
    }
    const result = walkForward(flow, next.id, [])
    setState({
      visibleItems: [],
      pendingItems: result.items,
      currentNodeId: result.currentNodeId,
      pendingWaitingForInput: result.waitingForInput,
      pendingDone: result.done,
    })
    setStarted(true)
  }, [flow])

  // Auto-start in standalone mode
  useEffect(() => {
    if (standalone && !started) start()
  }, [standalone, started, start])

  const handleTextSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !state.currentNodeId) return
      setInputText('')

      setState((prev) => {
        const node = flow.nodes.find((n) => n.id === prev.currentNodeId)
        if (!node || node.data.type !== 'question') return prev

        const matched = matchOpcao(trimmed, node.data.opcoes)
        const userMsg: ChatItem = { kind: 'user', text: trimmed, nodeId: node.id }

        if (!matched) {
          return {
            ...prev,
            visibleItems: [...prev.visibleItems, userMsg],
            pendingItems: [{ kind: 'bot', text: '(Pergunta sem respostas configuradas.)', nodeId: node.id }],
            pendingWaitingForInput: false,
            pendingDone: false,
          }
        }

        const edge = flow.edges.find((e) => e.source === node.id && e.sourceHandle === matched.id)
        if (!edge) {
          return {
            ...prev,
            visibleItems: [...prev.visibleItems, userMsg],
            pendingItems: [{ kind: 'bot', text: '(Resposta sem destino configurado.)', nodeId: node.id }],
            pendingWaitingForInput: false,
            pendingDone: false,
          }
        }

        const result = walkForward(flow, edge.target, [...prev.visibleItems, userMsg])
        notifyActive(result.currentNodeId)
        return {
          visibleItems: [...prev.visibleItems, userMsg],
          pendingItems: result.items.slice(prev.visibleItems.length + 1),
          currentNodeId: result.currentNodeId,
          pendingWaitingForInput: result.waitingForInput,
          pendingDone: result.done,
        }
      })
    },
    [flow, state.currentNodeId, notifyActive]
  )

  const restart = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    processingRef.current = false
    setIsTyping(false)
    setStarted(false)
    setInputText('')
    setState(EMPTY)
    notifyActive(null)
  }, [notifyActive])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.visibleItems, isTyping])

  useEffect(() => {
    if (waitingForInput) inputRef.current?.focus()
  }, [waitingForInput])

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderItem = (item: ChatItem, i: number) => {
    if (item.kind === 'bot') {
      return (
        <div key={i} className="flex items-end gap-2">
          <div className={`max-w-[84%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm bg-card border border-border text-foreground shadow-sm whitespace-pre-wrap ${item.text ? '' : 'italic text-muted-foreground'}`}>
            {item.text || '(mensagem vazia)'}
          </div>
        </div>
      )
    }
    if (item.kind === 'action') {
      return (
        <div key={i} className="flex items-end gap-2">
          <div className="max-w-[84%] px-3 py-2 rounded-2xl rounded-tl-sm text-xs bg-fin/10 border border-fin/20 text-fin flex items-center gap-1.5">
            {ACTION_ICON[item.actionKind]}
            <span className="font-medium">{item.label || item.actionKind}</span>
          </div>
        </div>
      )
    }
    if (item.kind === 'user') {
      return (
        <div key={i} className="flex justify-end">
          <div className="max-w-[84%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm bg-primary text-primary-foreground shadow-sm">
            {item.text}
          </div>
        </div>
      )
    }
    return null
  }

  const inputBar = waitingForInput && (
    <form
      onSubmit={(e) => { e.preventDefault(); handleTextSubmit(inputText) }}
      className="px-3 py-2.5 border-t border-border bg-card/80 backdrop-blur-sm shrink-0 flex items-center gap-2"
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
  )

  const messagesArea = (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-secondary/30"
      style={CHAT_BG}
    >
      {!started && !standalone && (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
          <Orb size={56} />
          <p className="text-sm text-muted-foreground max-w-[180px]">
            Visualize o fluxo como conversa real
          </p>
          <Button variant="waz" onClick={start}>
            Iniciar preview
          </Button>
        </div>
      )}

      {state.visibleItems.map(renderItem)}

      {isTyping && (
        <div className="flex items-end gap-2">
          <div className="px-3.5 py-2.5 bg-card border border-border rounded-2xl rounded-tl-sm flex items-center gap-1.5 shadow-sm">
            <span className="sr-only">digitando</span>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}

      {done && (
        <div className="flex flex-col items-center pt-4 border-t border-border space-y-3">
          <p className="text-xs text-muted-foreground">Conversa encerrada</p>
          <Button variant="outline" size="sm" onClick={restart}>
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
          </Button>
        </div>
      )}
    </div>
  )

  // ── Collapsed strip ───────────────────────────────────────────────────────────
  if (collapsed && !standalone) {
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

  // ── Standalone (iPhone) ───────────────────────────────────────────────────────
  if (standalone) {
    return (
      <div className="flex flex-col h-full bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-card/90 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <Orb size={34} />
            <div>
              <p className="text-sm font-semibold leading-none">Waz</p>
              <p className="text-[10px] text-green-500 font-medium mt-0.5">online agora</p>
            </div>
          </div>
          <button
            type="button"
            onClick={restart}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        {messagesArea}
        {inputBar}
      </div>
    )
  }

  // ── Panel (default) ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-card border-l border-border" style={{ width: 340 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Orb size={32} />
          <div>
            <p className="text-sm font-semibold leading-none">Waz</p>
            <p className="eyebrow mt-0.5">Preview do fluxo</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {flowId && (
            <Link href={`/preview/${flowId}`}>
              <span
                role="button"
                className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Ver no iPhone"
              >
                <Smartphone className="w-4 h-4" />
              </span>
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={restart} title="Reiniciar" aria-label="Reiniciar">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Recolher" aria-label="Recolher">
            <PanelRightClose className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {messagesArea}
      {inputBar}
    </div>
  )
}
