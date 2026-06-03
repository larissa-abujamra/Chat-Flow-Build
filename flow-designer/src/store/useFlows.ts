import { useState, useCallback, useEffect, useRef } from 'react'
import type { FlowDefinition, FlowId } from '../types'
import { supabase } from '@/lib/supabase'

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
  nome: 'Fluxo A - Vi & Evandro',
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

const FLOW_B: FlowDefinition = {
  id: 'flow-b',
  nome: 'Fluxo B - Ana & Luiz',
  scrapingEnabled: false,
  nodes: [
    { id: 'fb-start', type: 'start', position: { x: 300, y: 60 }, data: { type: 'start' } },
    {
      id: 'fb-msg-welcome',
      type: 'message',
      position: { x: 300, y: 200 },
      data: {
        type: 'message',
        texto:
          'Oi Ana, bem-vindo ao Squad! 👋\n\nA partir de agora você conta com um time trabalhando 24/7 por você:\n\n📣Maky, seu marketing\n📱Waz, suas vendas e atendimento\n💰Fin, seu financeiro\n\nVou te guiar nesses primeiros passos e depois te apresentar ao seu time digital.\n\nPra isso, preciso de algumas informações sobre a sua empresa.',
      },
    },
    {
      id: 'fb-q-nome',
      type: 'question',
      position: { x: 300, y: 460 },
      data: {
        type: 'question',
        texto: 'Vamos começar pelo básico: qual é o nome da sua empresa?',
        opcoes: [{ id: 'fb-q-nome-r1', label: 'Nome da empresa' }],
      },
    },
    {
      id: 'fb-q-cnpj',
      type: 'question',
      position: { x: 300, y: 660 },
      data: {
        type: 'question',
        texto: 'Ótimo! Agora, me passa o CNPJ da empresa? Vou usar pra extrair algumas informações e agilizar seu cadastro.',
        opcoes: [{ id: 'fb-q-cnpj-r1', label: 'CNPJ' }],
      },
    },
    {
      id: 'fb-q-catalogo',
      type: 'question',
      position: { x: 300, y: 860 },
      data: {
        type: 'question',
        texto: 'Você já tem um cardápio de produtos? Pode ser link, pdf, site… me envie aqui!',
        opcoes: [{ id: 'fb-q-catalogo-r1', label: 'Cardápio' }],
      },
    },
    {
      id: 'fb-msg-catalogo-ok',
      type: 'message',
      position: { x: 300, y: 1060 },
      data: {
        type: 'message',
        texto:
          'Vendo aqui seu cardápio, consegui encontrar alguns produtos, como:\n\n- Docinhos variados (R$ 5,50 - R$ 500)\n- Cookie - R$ 16,00\n- Panelinha 1,3kg - R$ 180,00\n\nDepois terminamos de configurá-lo, ok?\n\nÉ importante agora que entendemos o tom de voz que você gostaria que o Waz, o seu novo assistente de atendimento, use para atender seus clientes.',
      },
    },
    {
      id: 'fb-q-tom',
      type: 'question',
      position: { x: 300, y: 1300 },
      data: {
        type: 'question',
        texto:
          'Escolha o que mais combina com a sua marca:\n\n1️⃣ Casual e descontraído — Conversa leve e amigável, como entre amigos. Linguagem simples e próxima do dia a dia.\n\n2️⃣ Afetuoso e acolhedor — Tom carinhoso e cuidadoso. Faz a cliente se sentir querida. Bom pra marcas com clima de casa.\n\n3️⃣ Elegante e sofisticado — Tom premium e refinado. Vocabulário cuidado, ideal pra marcas mais exclusivas.\n\nAlgum desses combina com sua marca? Você pode também digitar como define seu tom de voz.',
        opcoes: [
          { id: 'fb-q-tom-r1', label: 'Casual e descontraído' },
          { id: 'fb-q-tom-r2', label: 'Afetuoso e acolhedor' },
          { id: 'fb-q-tom-r3', label: 'Elegante e sofisticado' },
          { id: 'fb-q-tom-r4', label: 'Descrever meu tom' },
        ],
      },
    },
    {
      id: 'fb-q-regras-1',
      type: 'question',
      position: { x: 300, y: 1600 },
      data: {
        type: 'question',
        texto:
          'Agora me conta as principais regras do seu negócio.\n\nVocê trabalha mais com encomenda, pronta entrega, ou os dois? Se tiver prazo de antecedência ou pedido mínimo, me conta também.',
        opcoes: [{ id: 'fb-q-regras-1-r1', label: 'Modelo de atendimento' }],
      },
    },
    {
      id: 'fb-q-regras-2',
      type: 'question',
      position: { x: 300, y: 1820 },
      data: {
        type: 'question',
        texto: 'O que você aceita personalizar nos pedidos (sabor, recheio, tema...) e o que você não faz?',
        opcoes: [{ id: 'fb-q-regras-2-r1', label: 'Personalizações' }],
      },
    },
    {
      id: 'fb-q-regras-3',
      type: 'question',
      position: { x: 300, y: 2020 },
      data: {
        type: 'question',
        texto: 'Como o cliente recebe? Você faz entrega (pra quais regiões e com qual taxa) ou é só retirada no local?',
        opcoes: [{ id: 'fb-q-regras-3-r1', label: 'Entrega / retirada' }],
      },
    },
    {
      id: 'fb-q-regras-4',
      type: 'question',
      position: { x: 300, y: 2220 },
      data: {
        type: 'question',
        texto: 'Quais formas de pagamento você aceita? E pra encomenda, costuma pedir sinal ou entrada?',
        opcoes: [{ id: 'fb-q-regras-4-r1', label: 'Pagamento' }],
      },
    },
    {
      id: 'fb-q-faq',
      type: 'question',
      position: { x: 300, y: 2420 },
      data: {
        type: 'question',
        texto:
          'Criei algumas perguntas frequentes pro seu negócio. Revisa pra ver se ficou certinho?\n\n1. Como faço meu pedido? Tem prazo de antecedência?\nTrabalhamos somente por encomenda, com no mínimo 5 horas de antecedência. É só nos chamar pra combinar tudo!\n\n2. Vocês fazem pedidos personalizados?\nSim! Personalizamos tudo — sabor, recheio, tema, do jeitinho que você quiser.\n\n3. Como recebo meu pedido?\nAs entregas são feitas às terças-feiras. Me passa seu endereço que confirmamos a entrega pra você.\n\n4. Como funciona o pagamento?\nAs encomendas são confirmadas com 50% de sinal, e o restante é pago na entrega.\n\nVocê pode me enviar mais perguntas com as respostas se achar necessário, ou continuar depois.',
        opcoes: [
          { id: 'fb-q-faq-r1', label: 'Continuar depois' },
          { id: 'fb-q-faq-r2', label: 'Enviar mais perguntas' },
        ],
      },
    },
    {
      id: 'fb-q-nome-assistente',
      type: 'question',
      position: { x: 300, y: 2720 },
      data: {
        type: 'question',
        texto: 'Agora vamos dar um nome que os seus clientes vão chamar o Waz, seu assistente de atendimento.',
        opcoes: [{ id: 'fb-q-nome-assistente-r1', label: 'Nome do assistente' }],
      },
    },
    {
      id: 'fb-end',
      type: 'end',
      position: { x: 300, y: 2940 },
      data: { type: 'end', texto: 'Você já chegou a 90% do onboarding! 🎉 Que tal conhecer as ferramentas agora?' },
    },
  ],
  edges: [
    { id: 'fb-e1', source: 'fb-start', target: 'fb-msg-welcome' },
    { id: 'fb-e2', source: 'fb-msg-welcome', target: 'fb-q-nome' },
    { id: 'fb-e3', source: 'fb-q-nome', target: 'fb-q-cnpj', sourceHandle: 'fb-q-nome-r1' },
    { id: 'fb-e4', source: 'fb-q-cnpj', target: 'fb-q-catalogo', sourceHandle: 'fb-q-cnpj-r1' },
    { id: 'fb-e5', source: 'fb-q-catalogo', target: 'fb-msg-catalogo-ok', sourceHandle: 'fb-q-catalogo-r1' },
    { id: 'fb-e6', source: 'fb-msg-catalogo-ok', target: 'fb-q-tom' },
    { id: 'fb-e7', source: 'fb-q-tom', target: 'fb-q-regras-1', sourceHandle: 'fb-q-tom-r1' },
    { id: 'fb-e8', source: 'fb-q-tom', target: 'fb-q-regras-1', sourceHandle: 'fb-q-tom-r2' },
    { id: 'fb-e9', source: 'fb-q-tom', target: 'fb-q-regras-1', sourceHandle: 'fb-q-tom-r3' },
    { id: 'fb-e10', source: 'fb-q-tom', target: 'fb-q-regras-1', sourceHandle: 'fb-q-tom-r4' },
    { id: 'fb-e11', source: 'fb-q-regras-1', target: 'fb-q-regras-2', sourceHandle: 'fb-q-regras-1-r1' },
    { id: 'fb-e12', source: 'fb-q-regras-2', target: 'fb-q-regras-3', sourceHandle: 'fb-q-regras-2-r1' },
    { id: 'fb-e13', source: 'fb-q-regras-3', target: 'fb-q-regras-4', sourceHandle: 'fb-q-regras-3-r1' },
    { id: 'fb-e14', source: 'fb-q-regras-4', target: 'fb-q-faq', sourceHandle: 'fb-q-regras-4-r1' },
    { id: 'fb-e15', source: 'fb-q-faq', target: 'fb-q-nome-assistente', sourceHandle: 'fb-q-faq-r1' },
    { id: 'fb-e16', source: 'fb-q-faq', target: 'fb-q-nome-assistente', sourceHandle: 'fb-q-faq-r2' },
    { id: 'fb-e17', source: 'fb-q-nome-assistente', target: 'fb-end', sourceHandle: 'fb-q-nome-assistente-r1' },
  ],
}

const DEFAULTS: Record<FlowId, FlowDefinition> = {
  'flow-a': FLOW_A,
  'flow-b': FLOW_B,
  'flow-c': makeDefaultFlow('flow-c', 'Fluxo C - Bernard', false),
}

// ── localStorage fallback (used when Supabase is not configured) ─────────────

function loadLocal(id: FlowId): FlowDefinition {
  try {
    const raw = localStorage.getItem(`waz-flow-${id}`)
    if (raw) return { ...JSON.parse(raw) as FlowDefinition, id }
  } catch { /* ignore */ }
  return DEFAULTS[id]
}

function saveLocal(flow: FlowDefinition) {
  try {
    localStorage.setItem(`waz-flow-${flow.id}`, JSON.stringify(flow))
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFlow(id: FlowId) {
  const [flow, setFlow] = useState<FlowDefinition>(() =>
    supabase ? DEFAULTS[id] : loadLocal(id)
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevents applying a remote update that echoes back our own save
  const isSaving = useRef(false)

  useEffect(() => {
    if (!supabase) return

    // Initial load
    supabase!
      .from('flows')
      .select('data')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setFlow(data ? { ...(data.data as FlowDefinition), id } : DEFAULTS[id])
      })

    // Real-time subscription
    const channel = supabase!
      .channel(`flow-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flows', filter: `id=eq.${id}` },
        (payload) => {
          if (!isSaving.current && payload.new && 'data' in payload.new) {
            setFlow({ ...(payload.new.data as FlowDefinition), id })
          }
        }
      )
      .subscribe()

    return () => { supabase!.removeChannel(channel) }
  }, [id])

  const update = useCallback((f: FlowDefinition) => {
    setFlow(f)

    if (!supabase) {
      saveLocal(f)
      return
    }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    isSaving.current = true
    saveTimer.current = setTimeout(async () => {
      await supabase!.from('flows').upsert({ id: f.id, data: f })
      isSaving.current = false
    }, 500)
  }, [])

  const reset = useCallback(() => {
    update(DEFAULTS[id])
  }, [id, update])

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
        update({ ...parsed, id })
      } catch {
        alert('Arquivo JSON inválido.')
      }
    }
    reader.readAsText(file)
  }, [id, update])

  return { flow, update, reset, exportJSON, importJSON }
}
