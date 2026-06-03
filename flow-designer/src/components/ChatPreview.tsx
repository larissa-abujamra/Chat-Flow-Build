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
  Send,
  Smartphone,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import type { FlowDefinition, FlowNode, ActionKind, OpcaoItem, FlowId } from '@/types'
import { Button } from './ui/button'

// ── Orb ──────────────────────────────────────────────────────────────────────
// Same animated gradient orb as the OnboardingPreview wizard (.orb in index.css).

export function Orb({ size = 36 }: { size?: number }) {
  return <div className="orb shrink-0" style={{ width: size, height: size }} aria-hidden />
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
  // When the walk stops at an action node, it awaits a live /api call before
  // continuing from `resumeAfterAction`.
  pendingActionId: string | null
  resumeAfterAction: string | null
}

const EMPTY: PreviewState = {
  visibleItems: [],
  pendingItems: [],
  currentNodeId: null,
  pendingWaitingForInput: false,
  pendingDone: false,
  pendingActionId: null,
  resumeAfterAction: null,
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

type WalkResult = {
  items: ChatItem[]
  currentNodeId: string | null
  waitingForInput: boolean
  done: boolean
  actionId?: string | null
  resumeId?: string | null
}

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
      // Stop at the action so the caller can run its live /api call, then resume
      // the walk from the node after it.
      items.push({ kind: 'action', actionKind: data.kind, label: data.label, nodeId: node.id })
      const after = nextNode(flow, node.id)?.id ?? null
      return { items, currentNodeId: node.id, waitingForInput: false, done: false, actionId: node.id, resumeId: after }
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

// ── Live enrichment (action nodes call the real /api endpoints) ───────────────

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return (await res.json()) as Record<string, unknown>
}

const s = (v: unknown) => (v == null ? '' : String(v))

/**
 * Runs the /api endpoint named in an action node's label, using the values the
 * user has typed so far ({negocio}, {cidade}, …), and returns new vars to merge
 * (real {endereco}, {telefone}, {site}, {instagram}). Fails soft to {} when the
 * API is unavailable (e.g. `vite dev` has no functions) so the flow continues.
 */
async function runAction(label: string, vars: Record<string, string>): Promise<Record<string, string>> {
  const endpoint = (label.match(/\/api\/[a-z/-]+/) || [])[0]
  try {
    if (endpoint === '/api/places') {
      const d = await postJson('/api/places', { business: vars.negocio || '', city: vars.cidade || '' })
      const c = (Array.isArray(d.candidatos) ? d.candidatos[0] : null) as Record<string, unknown> | null
      // Always return the keys (even empty) so the call succeeding never leaves
      // a literal {endereco} on screen.
      return { endereco: s(c?.endereco), telefone: s(c?.telefone), site: s(c?.site), horario: s(c?.horario) }
    } else if (endpoint === '/api/site-scrape') {
      if (vars.site) {
        const d = await postJson('/api/site-scrape', { business: vars.negocio || '', site: vars.site })
        const out: Record<string, string> = { instagram: s(d.instagram) }
        if (d.telefone && !vars.telefone) out.telefone = s(d.telefone)
        return out
      }
      return { instagram: '' }
    } else if (endpoint === '/api/instagram') {
      const handle = (vars.instagram || '')
        .replace(/^@/, '')
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
        .replace(/\/.*$/, '')
        .trim()
      if (handle) {
        const d = await postJson('/api/instagram', { username: handle })
        if (d.encontrado) {
          return {
            instagram: '@' + s(d.username || handle),
            instagram_seguidores: s(d.seguidores),
          }
        }
      }
    }
  } catch {
    /* no API in dev, or provider error — flow continues with placeholders */
  }
  return {}
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
  // Values the user typed, keyed by each question's `salvarComo`. Used to fill
  // {placeholders} in later messages so the preview reads like the real chat.
  const [vars, setVars] = useState<Record<string, string>>({})
  // Mirror of `vars` for use inside async callbacks (avoids stale closures).
  const varsRef = useRef<Record<string, string>>({})
  const [fetchingActionId, setFetchingActionId] = useState<string | null>(null)
  const fetchingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Capture vars + mirror into the ref in one place.
  const mergeVars = useCallback((patch: Record<string, string>) => {
    varsRef.current = { ...varsRef.current, ...patch }
    setVars(varsRef.current)
  }, [])

  const notifyActive = useCallback(
    (nodeId: string | null) => onActiveNodeChange?.(nodeId),
    [onActiveNodeChange]
  )

  // Replace {var} tokens with the values the user typed; unknown tokens stay
  // literal (e.g. {site} before a site step). Applied at render time.
  const subst = useCallback(
    (t: string) => t.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? `{${k}}`),
    [vars]
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

  // ── Run the live /api call when the walk stops at an action node ─────────────
  useEffect(() => {
    if (state.pendingItems.length > 0) return // wait until the action item is shown
    if (!state.pendingActionId || fetchingRef.current) return
    const actionNode = flow.nodes.find((n) => n.id === state.pendingActionId)
    if (!actionNode || actionNode.data.type !== 'action') return

    fetchingRef.current = true
    setFetchingActionId(state.pendingActionId)
    const resumeId = state.resumeAfterAction
    const baseVisible = state.visibleItems

    runAction(actionNode.data.label, varsRef.current).then((patch) => {
      if (Object.keys(patch).length) mergeVars(patch)
      fetchingRef.current = false
      setFetchingActionId(null)
      const result: WalkResult = resumeId
        ? walkForward(flow, resumeId, baseVisible)
        : { items: baseVisible, currentNodeId: null, waitingForInput: false, done: true }
      setState({
        visibleItems: baseVisible,
        pendingItems: result.items.slice(baseVisible.length),
        currentNodeId: result.currentNodeId,
        pendingWaitingForInput: result.waitingForInput,
        pendingDone: result.done,
        pendingActionId: result.actionId ?? null,
        resumeAfterAction: result.resumeId ?? null,
      })
      notifyActive(result.currentNodeId)
    })
  }, [state.pendingItems.length, state.pendingActionId, state.resumeAfterAction, state.visibleItems, flow, mergeVars, notifyActive])

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
      pendingActionId: result.actionId ?? null,
      resumeAfterAction: result.resumeId ?? null,
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

      const node = flow.nodes.find((n) => n.id === state.currentNodeId)
      if (!node || node.data.type !== 'question') return

      // Capture this answer under the question's variable so later {placeholders}
      // can be filled with what the user actually typed.
      if (node.data.salvarComo) {
        mergeVars({ [node.data.salvarComo]: trimmed })
      }

      // The input bar only renders when the preview is idle (no pending items),
      // so `state` is the committed, stable snapshot here. Compute the next
      // state from it and notify the parent AFTER committing — calling
      // notifyActive() inside the setState updater would update FlowEditor while
      // ChatPreview renders (React "setState in render" warning).
      const matched = matchOpcao(trimmed, node.data.opcoes)
      const userMsg: ChatItem = { kind: 'user', text: trimmed, nodeId: node.id }

      if (!matched) {
        setState({
          ...state,
          visibleItems: [...state.visibleItems, userMsg],
          pendingItems: [{ kind: 'bot', text: '(Pergunta sem respostas configuradas.)', nodeId: node.id }],
          pendingWaitingForInput: false,
          pendingDone: false,
        })
        return
      }

      const edge = flow.edges.find((e) => e.source === node.id && e.sourceHandle === matched.id)
      if (!edge) {
        setState({
          ...state,
          visibleItems: [...state.visibleItems, userMsg],
          pendingItems: [{ kind: 'bot', text: '(Resposta sem destino configurado.)', nodeId: node.id }],
          pendingWaitingForInput: false,
          pendingDone: false,
        })
        return
      }

      const result = walkForward(flow, edge.target, [...state.visibleItems, userMsg])
      setState({
        visibleItems: [...state.visibleItems, userMsg],
        pendingItems: result.items.slice(state.visibleItems.length + 1),
        currentNodeId: result.currentNodeId,
        pendingWaitingForInput: result.waitingForInput,
        pendingDone: result.done,
        pendingActionId: result.actionId ?? null,
        resumeAfterAction: result.resumeId ?? null,
      })
      notifyActive(result.currentNodeId)
    },
    [flow, state, notifyActive]
  )

  const restart = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    processingRef.current = false
    fetchingRef.current = false
    setFetchingActionId(null)
    setIsTyping(false)
    setStarted(false)
    setInputText('')
    varsRef.current = {}
    setVars({})
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
        <div key={i} className="flex chat-enter justify-start items-end gap-2">
          <Orb size={30} />
          <div className={`px-4 py-2.5 text-[15px] leading-relaxed max-w-[78%] bg-[#F4F5F8] text-[#13161D] rounded-2xl rounded-tl-md whitespace-pre-wrap ${item.text ? '' : 'italic text-gray-400'}`}>
            {item.text ? subst(item.text) : '(mensagem vazia)'}
          </div>
        </div>
      )
    }
    if (item.kind === 'action') {
      // Status widget — matches the OnboardingPreview's in-chat step cards.
      // Shows a spinner while its live /api call runs, then a green check.
      const isFetching = fetchingActionId === item.nodeId
      return (
        <div key={i} className="flex chat-enter justify-start items-end gap-2">
          <div className="w-[30px] shrink-0" />
          <div className="max-w-[85%] rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-[#F4F5F8] flex items-center justify-center text-[#13161D] shrink-0">
              {ACTION_ICON[item.actionKind]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#13161D] leading-tight truncate">{item.label || item.actionKind}</p>
              <p className="text-xs text-gray-500 mt-0.5">{isFetching ? 'buscando dados reais…' : 'concluído'}</p>
            </div>
            {isFetching
              ? <Loader2 className="w-5 h-5 text-[#13161D] animate-spin shrink-0" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
          </div>
        </div>
      )
    }
    if (item.kind === 'user') {
      return (
        <div key={i} className="flex chat-enter justify-end">
          <div className="px-4 py-2.5 text-[15px] leading-relaxed max-w-[78%] bg-[#13161D] text-white rounded-2xl rounded-tr-md whitespace-pre-wrap">
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
      className="px-5 py-4 border-t border-gray-100 bg-white shrink-0 flex items-center gap-2"
    >
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Digite sua resposta…"
        className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#13161D] focus:outline-none focus:border-[#13161D] transition-colors"
      />
      <button
        type="submit"
        disabled={!inputText.trim()}
        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#13161D] text-white hover:bg-[#06070A] disabled:opacity-40 transition-all shrink-0"
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  )

  const messagesArea = (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-5 py-6 space-y-4 bg-white"
    >
      {!started && !standalone && (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-12">
          <Orb size={56} />
          <p className="text-sm text-gray-500 max-w-[200px]">
            Visualize o fluxo como conversa real
          </p>
          <button
            onClick={start}
            className="inline-flex items-center justify-center gap-2 rounded-full font-medium h-11 px-6 bg-[#13161D] text-white hover:bg-[#06070A] hover:-translate-y-0.5 transition-all"
          >
            Iniciar preview
          </button>
        </div>
      )}

      {state.visibleItems.map(renderItem)}

      {isTyping && (
        <div className="flex items-end gap-2 chat-enter">
          <Orb size={30} />
          <div className="bg-[#F4F5F8] rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1">
            <span className="sr-only">digitando</span>
            <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
            <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
            <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
          </div>
        </div>
      )}

      {done && (
        <div className="flex flex-col items-center pt-4 space-y-3">
          <p className="text-xs text-gray-500">Conversa encerrada</p>
          <button
            onClick={restart}
            className="inline-flex items-center justify-center gap-2 rounded-full font-medium h-10 px-5 bg-white text-[#13161D] border border-gray-200 hover:bg-[#F4F5F8] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
          </button>
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
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0 bg-white">
          <Orb size={42} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#13161D] leading-tight">Assistente Squad</p>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Online agora
            </p>
          </div>
          <button
            type="button"
            onClick={restart}
            className="text-gray-300 hover:text-[#13161D] transition-colors p-1"
            title="Reiniciar"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
        {messagesArea}
        {inputBar}
      </div>
    )
  }

  // ── Panel (default) ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white border-l border-border" style={{ width: 360 }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
        <Orb size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#13161D] leading-tight">Assistente Squad</p>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Online agora
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          {flowId && (
            <Link href={`/preview/${flowId}`}>
              <span
                role="button"
                className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-[#13161D] hover:bg-[#F4F5F8] transition-colors cursor-pointer"
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
