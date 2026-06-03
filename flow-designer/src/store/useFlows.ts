import { useState, useCallback } from 'react'
import type { FlowDefinition, FlowId } from '../types'

function makeDefaultFlow(id: FlowId, nome: string, scrapingEnabled: boolean): FlowDefinition {
  return {
    id,
    nome,
    scrapingEnabled,
    nodes: [
      {
        id: `${id}-start`,
        type: 'start',
        position: { x: 200, y: 60 },
        data: { type: 'start' },
      },
    ],
    edges: [],
  }
}

const FLOW_A: FlowDefinition = {
  id: 'flow-a',
  nome: 'Fluxo A',
  scrapingEnabled: true,
  nodes: [
    { id: 'fa-start', type: 'start', position: { x: 300, y: 60 }, data: { type: 'start' } },
    {
      id: 'fa-msg-welcome',
      type: 'message',
      position: { x: 300, y: 200 },
      data: {
        type: 'message',
        texto:
          'Oi Vitória, bem-vindo ao Squad! 👋\n\nA partir de agora você conta com um time trabalhando 24/7 por você:\n\n📣Maky, seu marketing\n📱Waz, suas vendas e atendimento\n💰Fin, seu financeiro\n\nVou te guiar nesses primeiros passos e depois te apresentar ao seu time digital.\n\nPra isso, preciso de algumas informações sobre a sua empresa.',
      },
    },
    {
      id: 'fa-q-nome',
      type: 'question',
      position: { x: 300, y: 460 },
      data: {
        type: 'question',
        texto: 'Vamos começar pelo básico: qual é o nome da sua empresa?',
        opcoes: [{ id: 'fa-q-nome-r1', label: 'Nome da empresa' }],
      },
    },
    {
      id: 'fa-q-segmento',
      type: 'question',
      position: { x: 300, y: 660 },
      data: {
        type: 'question',
        texto: 'E em qual segmento a empresa atua?',
        opcoes: [{ id: 'fa-q-segmento-r1', label: 'Segmento' }],
      },
    },
    {
      id: 'fa-q-cnpj',
      type: 'question',
      position: { x: 300, y: 860 },
      data: {
        type: 'question',
        texto: 'Me passa o CNPJ da empresa? Vou usar pra extrair algumas informações e agilizar seu cadastro.',
        opcoes: [{ id: 'fa-q-cnpj-r1', label: 'CNPJ' }],
      },
    },
    {
      id: 'fa-act-scraping',
      type: 'action',
      position: { x: 300, y: 1060 },
      data: { type: 'action', kind: 'scraping', label: 'Scraping de dados' },
    },
    {
      id: 'fa-q-confirmar',
      type: 'question',
      position: { x: 300, y: 1200 },
      data: {
        type: 'question',
        texto:
          'Procurei aqui e achei alguns dados da Brigadayros. Pode conferir se está tudo certo?\n\nCNPJ: 35.316.163/0001-62\nEndereço: R. Simão Álvares, 29 - Pinheiros, São Paulo - SP, 05417-030',
        opcoes: [{ id: 'fa-q-confirmar-r1', label: 'Sim' }],
      },
    },
    {
      id: 'fa-q-catalogo',
      type: 'question',
      position: { x: 300, y: 1460 },
      data: {
        type: 'question',
        texto:
          'Legal! Achei este perfil: @brigadayros. É o Instagram da Brigadayros?\n\nAchei alguns produtos que a Brigadayros comercializa, como:\n- Docinhos variados (R$ 5,50 - R$ 500)\n- Cookie - R$ 16,00\n- Panelinha 1,3kg - R$ 180,00\n\nPara terminar de cadastrar seu cardápio de produtos, você tem um pdf ou link?',
        opcoes: [{ id: 'fa-q-catalogo-r1', label: 'Link do cardápio' }],
      },
    },
    {
      id: 'fa-q-tom',
      type: 'question',
      position: { x: 300, y: 1740 },
      data: {
        type: 'question',
        texto:
          'Agora falando do seu tom de voz, que é como o Waz atenderá seus clientes via Whatsapp.\n\nPodemos fazer a conexão com seu Instagram e puxar de como você responde seus clientes via DM, ou você me exportar algumas conversas do whatsapp de atendimento.\n\nComo você prefere fazer?',
        opcoes: [
          { id: 'fa-q-tom-r1', label: 'Conectar Instagram' },
          { id: 'fa-q-tom-r2', label: 'Exportar conversas' },
        ],
      },
    },
    {
      id: 'fa-act-instagram',
      type: 'action',
      position: { x: 620, y: 1940 },
      data: { type: 'action', kind: 'conectar-instagram', label: 'Conectar Instagram' },
    },
    {
      id: 'fa-msg-instagram-ok',
      type: 'message',
      position: { x: 620, y: 2080 },
      data: {
        type: 'message',
        texto: 'Perfeito! Instagram conectado.\n\nVou rodando algumas análises por aqui, mas já podemos continuar.',
      },
    },
    {
      id: 'fa-q-regras',
      type: 'question',
      position: { x: 300, y: 2280 },
      data: {
        type: 'question',
        texto:
          'Agora me conta as principais regras do seu negócio.\n\nPelo Google Maps, vi que seu horário de funcionamento é das 10h às 18h, confere?\n\nAproveita pra incluir coisas como prazo de antecedência para encomendas, o que você personaliza, formas de pagamento, entrega...\n\nPode gravar áudio se preferir!',
        opcoes: [{ id: 'fa-q-regras-r1', label: 'Regras do negócio' }],
      },
    },
    {
      id: 'fa-msg-prontinho',
      type: 'message',
      position: { x: 300, y: 2540 },
      data: {
        type: 'message',
        texto:
          'Prontinho! Já tenho tudo que preciso pra montar seu time.\n\nAgora é só deixar comigo: vou configurar o Waz, o Maky e o Fin com as informações da sua empresa. Em instantes eles estarão prontos pra trabalhar 24/7 por você.',
      },
    },
    {
      id: 'fa-end',
      type: 'end',
      position: { x: 300, y: 2760 },
      data: { type: 'end', texto: 'Bora conhecer seu time? 🚀' },
    },
  ],
  edges: [
    { id: 'fa-e1', source: 'fa-start', target: 'fa-msg-welcome' },
    { id: 'fa-e2', source: 'fa-msg-welcome', target: 'fa-q-nome' },
    { id: 'fa-e3', source: 'fa-q-nome', target: 'fa-q-segmento', sourceHandle: 'fa-q-nome-r1' },
    { id: 'fa-e4', source: 'fa-q-segmento', target: 'fa-q-cnpj', sourceHandle: 'fa-q-segmento-r1' },
    { id: 'fa-e5', source: 'fa-q-cnpj', target: 'fa-act-scraping', sourceHandle: 'fa-q-cnpj-r1' },
    { id: 'fa-e6', source: 'fa-act-scraping', target: 'fa-q-confirmar' },
    { id: 'fa-e7', source: 'fa-q-confirmar', target: 'fa-q-catalogo', sourceHandle: 'fa-q-confirmar-r1' },
    { id: 'fa-e8', source: 'fa-q-catalogo', target: 'fa-q-tom', sourceHandle: 'fa-q-catalogo-r1' },
    { id: 'fa-e9', source: 'fa-q-tom', target: 'fa-act-instagram', sourceHandle: 'fa-q-tom-r1' },
    { id: 'fa-e10', source: 'fa-q-tom', target: 'fa-q-regras', sourceHandle: 'fa-q-tom-r2' },
    { id: 'fa-e11', source: 'fa-act-instagram', target: 'fa-msg-instagram-ok' },
    { id: 'fa-e12', source: 'fa-msg-instagram-ok', target: 'fa-q-regras' },
    { id: 'fa-e13', source: 'fa-q-regras', target: 'fa-msg-prontinho', sourceHandle: 'fa-q-regras-r1' },
    { id: 'fa-e14', source: 'fa-msg-prontinho', target: 'fa-end' },
  ],
}

const DEFAULTS: Record<FlowId, FlowDefinition> = {
  'flow-a': FLOW_A,
  'flow-b': makeDefaultFlow('flow-b', 'Fluxo B', true),
  'flow-c': makeDefaultFlow('flow-c', 'Fluxo C', false),
}

function loadFlow(id: FlowId): FlowDefinition {
  try {
    const raw = localStorage.getItem(`waz-flow-${id}`)
    if (raw) {
      const parsed = JSON.parse(raw) as FlowDefinition
      // Ensure scrapingEnabled matches the default when loading older saves
      return { ...parsed, id }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULTS[id]
}

function persistFlow(flow: FlowDefinition) {
  try {
    localStorage.setItem(`waz-flow-${flow.id}`, JSON.stringify(flow))
  } catch {
    // ignore storage errors (quota, private mode)
  }
}

export function useFlow(id: FlowId) {
  const [flow, setFlow] = useState<FlowDefinition>(() => loadFlow(id))

  const update = useCallback((f: FlowDefinition) => {
    setFlow(f)
    persistFlow(f)
  }, [])

  const reset = useCallback(() => {
    const fresh = DEFAULTS[id]
    setFlow(fresh)
    persistFlow(fresh)
  }, [id])

  const exportJSON = useCallback(() => {
    const json = JSON.stringify(flow, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const slug = flow.nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/, '') || flow.id
    a.href = url
    a.download = `${slug}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [flow])

  const importJSON = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as FlowDefinition
        // Force the id to match this flow slot
        update({ ...parsed, id })
      } catch {
        alert('Arquivo JSON inválido.')
      }
    }
    reader.readAsText(file)
  }, [id, update])

  return { flow, update, reset, exportJSON, importJSON }
}
