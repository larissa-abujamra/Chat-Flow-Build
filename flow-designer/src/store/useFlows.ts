import { useState, useCallback, useEffect, useRef } from 'react'
import type { FlowDefinition, FlowId } from '../types'
import { supabase } from '@/lib/supabase'

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
          'Agora falando do seu tom de voz, que é como o Waz atenderá seus clientes via Whatsapp.\n\nPodemos fazer a conexão com seu Instagram e puxar as legendas dos seus posts pra aprender como você fala, ou você me exportar algumas conversas do whatsapp de atendimento.\n\nComo você prefere fazer?',
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

const FLOW_C: FlowDefinition = {
  id: 'flow-c',
  nome: 'Fluxo C',
  scrapingEnabled: false,
  nodes: [
    { id: 'fc-start', type: 'start', position: { x: 300, y: 60 }, data: { type: 'start' } },
    {
      id: 'fc-msg-welcome',
      type: 'message',
      position: { x: 300, y: 200 },
      data: {
        type: 'message',
        texto:
          'Oi Bernard, bem-vindo ao Squad! 👋\n\nA partir de agora você conta com um time trabalhando 24/7 por você:\n\n📣Maky, seu marketing\n📱Waz, suas vendas e atendimento\n💰Fin, seu financeiro\n\nVou te guiar nesses primeiros passos e depois te apresentar ao seu time digital.\n\nPra isso, preciso de algumas informações sobre a sua empresa.',
      },
    },
    {
      id: 'fc-q-nome',
      type: 'question',
      position: { x: 300, y: 460 },
      data: {
        type: 'question',
        texto: 'Vamos começar pelo básico: qual é o nome da sua empresa?',
        opcoes: [{ id: 'fc-q-nome-r1', label: 'Nome da empresa' }],
      },
    },
    {
      id: 'fc-q-segmento',
      type: 'question',
      position: { x: 300, y: 660 },
      data: {
        type: 'question',
        texto: 'E em qual segmento a empresa atua?',
        opcoes: [{ id: 'fc-q-segmento-r1', label: 'Segmento' }],
      },
    },
    {
      id: 'fc-q-boas-vindas',
      type: 'question',
      position: { x: 300, y: 860 },
      data: {
        type: 'question',
        texto: 'Você já tem uma mensagem de boas vindas?',
        opcoes: [{ id: 'fc-q-boas-vindas-r1', label: 'Mensagem de boas vindas' }],
      },
    },
    {
      id: 'fc-q-catalogo',
      type: 'question',
      position: { x: 300, y: 1060 },
      data: {
        type: 'question',
        texto:
          'Você quer configurar como será enviado seu catálogo de produtos? Como você costuma enviar o catálogo para seus clientes?',
        opcoes: [{ id: 'fc-q-catalogo-r1', label: 'Catálogo' }],
      },
    },
    {
      id: 'fc-q-horarios',
      type: 'question',
      position: { x: 300, y: 1260 },
      data: {
        type: 'question',
        texto:
          'Quais são os seus dias e horários de funcionamento? Pode ser detalhado: dias diferentes, horários diferentes, exceções.',
        opcoes: [{ id: 'fc-q-horarios-r1', label: 'Horários' }],
      },
    },
    {
      id: 'fc-q-localizacao',
      type: 'question',
      position: { x: 300, y: 1460 },
      data: {
        type: 'question',
        texto: 'Onde fica seu negócio? Bairro, cidade e onde faz entrega.',
        opcoes: [{ id: 'fc-q-localizacao-r1', label: 'Localização' }],
      },
    },
    {
      id: 'fc-q-entrega',
      type: 'question',
      position: { x: 300, y: 1660 },
      data: {
        type: 'question',
        texto: 'Vocês fazem entrega ou retirada?',
        opcoes: [{ id: 'fc-q-entrega-r1', label: 'Entrega / retirada' }],
      },
    },
    {
      id: 'fc-q-prazo',
      type: 'question',
      position: { x: 300, y: 1860 },
      data: {
        type: 'question',
        texto: 'Qual é o prazo mínimo para encomendas?',
        opcoes: [{ id: 'fc-q-prazo-r1', label: 'Prazo mínimo' }],
      },
    },
    {
      id: 'fc-q-produto',
      type: 'question',
      position: { x: 300, y: 2060 },
      data: {
        type: 'question',
        texto: 'Qual o produto mais vendido? Conte o nome, a faixa de preço e o diferencial.',
        opcoes: [{ id: 'fc-q-produto-r1', label: 'Produto mais vendido' }],
      },
    },
    {
      id: 'fc-q-tom',
      type: 'question',
      position: { x: 300, y: 2260 },
      data: {
        type: 'question',
        texto:
          'Como a gente deve conversar com os clientes?\n\n1️⃣ Casual e descontraído — Conversa leve e amigável, como entre amigos. Linguagem simples e próxima do dia a dia.\n\n2️⃣ Afetuoso e acolhedor — Tom carinhoso e cuidadoso. Faz a cliente se sentir querida. Bom pra marcas com clima de casa.\n\n3️⃣ Elegante e sofisticado — Tom premium e refinado. Vocabulário cuidado, ideal pra marcas mais exclusivas.',
        opcoes: [
          { id: 'fc-q-tom-r1', label: 'Casual e descontraído' },
          { id: 'fc-q-tom-r2', label: 'Afetuoso e acolhedor' },
          { id: 'fc-q-tom-r3', label: 'Elegante e sofisticado' },
        ],
      },
    },
    {
      id: 'fc-q-emojis',
      type: 'question',
      position: { x: 300, y: 2520 },
      data: {
        type: 'question',
        texto: 'O agente deve usar emojis?',
        opcoes: [
          { id: 'fc-q-emojis-r1', label: 'Às vezes' },
          { id: 'fc-q-emojis-r2', label: 'Sim' },
          { id: 'fc-q-emojis-r3', label: 'Não' },
        ],
      },
    },
    {
      id: 'fc-q-quais-emojis',
      type: 'question',
      position: { x: 620, y: 2700 },
      data: {
        type: 'question',
        texto: 'Quais emojis você prefere usar?',
        opcoes: [{ id: 'fc-q-quais-emojis-r1', label: 'Emojis preferidos' }],
      },
    },
    {
      id: 'fc-q-mais-info',
      type: 'question',
      position: { x: 300, y: 2900 },
      data: {
        type: 'question',
        texto: 'Tem mais alguma coisa importante que o agente precisa saber?',
        opcoes: [{ id: 'fc-q-mais-info-r1', label: 'Informações adicionais' }],
      },
    },
    {
      id: 'fc-end',
      type: 'end',
      position: { x: 300, y: 3120 },
      data: {
        type: 'end',
        texto:
          'Prontinho! Tenho tudo que preciso para configurar seu Waz. Em instantes ele estará pronto para atender seus clientes 24/7! 🎉',
      },
    },
  ],
  edges: [
    { id: 'fc-e1', source: 'fc-start', target: 'fc-msg-welcome' },
    { id: 'fc-e2', source: 'fc-msg-welcome', target: 'fc-q-nome' },
    { id: 'fc-e3', source: 'fc-q-nome', target: 'fc-q-segmento', sourceHandle: 'fc-q-nome-r1' },
    { id: 'fc-e4', source: 'fc-q-segmento', target: 'fc-q-boas-vindas', sourceHandle: 'fc-q-segmento-r1' },
    { id: 'fc-e5', source: 'fc-q-boas-vindas', target: 'fc-q-catalogo', sourceHandle: 'fc-q-boas-vindas-r1' },
    { id: 'fc-e6', source: 'fc-q-catalogo', target: 'fc-q-horarios', sourceHandle: 'fc-q-catalogo-r1' },
    { id: 'fc-e7', source: 'fc-q-horarios', target: 'fc-q-localizacao', sourceHandle: 'fc-q-horarios-r1' },
    { id: 'fc-e8', source: 'fc-q-localizacao', target: 'fc-q-entrega', sourceHandle: 'fc-q-localizacao-r1' },
    { id: 'fc-e9', source: 'fc-q-entrega', target: 'fc-q-prazo', sourceHandle: 'fc-q-entrega-r1' },
    { id: 'fc-e10', source: 'fc-q-prazo', target: 'fc-q-produto', sourceHandle: 'fc-q-prazo-r1' },
    { id: 'fc-e11', source: 'fc-q-produto', target: 'fc-q-tom', sourceHandle: 'fc-q-produto-r1' },
    { id: 'fc-e12', source: 'fc-q-tom', target: 'fc-q-emojis', sourceHandle: 'fc-q-tom-r1' },
    { id: 'fc-e13', source: 'fc-q-tom', target: 'fc-q-emojis', sourceHandle: 'fc-q-tom-r2' },
    { id: 'fc-e14', source: 'fc-q-tom', target: 'fc-q-emojis', sourceHandle: 'fc-q-tom-r3' },
    { id: 'fc-e15', source: 'fc-q-emojis', target: 'fc-q-quais-emojis', sourceHandle: 'fc-q-emojis-r1' },
    { id: 'fc-e16', source: 'fc-q-emojis', target: 'fc-q-quais-emojis', sourceHandle: 'fc-q-emojis-r2' },
    { id: 'fc-e17', source: 'fc-q-emojis', target: 'fc-q-mais-info', sourceHandle: 'fc-q-emojis-r3' },
    { id: 'fc-e18', source: 'fc-q-quais-emojis', target: 'fc-q-mais-info', sourceHandle: 'fc-q-quais-emojis-r1' },
    { id: 'fc-e19', source: 'fc-q-mais-info', target: 'fc-end', sourceHandle: 'fc-q-mais-info-r1' },
  ],
}

// Fluxo Stefano — espelha o onboarding real "Squad" que testamos (a experiência
// completa com CNPJ/Places/Instagram/iFood ao vivo). Os nós abaixo representam o
// fluxo no canvas; o preview à direita roda a experiência real (OnboardingPreview).
const FLOW_STEFANO_BASE: FlowDefinition = {
  id: 'flow-stefano',
  nome: 'Fluxo Stefano',
  scrapingEnabled: true,
  nodes: [
    { id: 'fs-start', type: 'start', position: { x: 300, y: 60 }, data: { type: 'start' } },
    {
      id: 'fs-msg-welcome',
      type: 'message',
      position: { x: 300, y: 200 },
      data: {
        type: 'message',
        texto:
          'Oi, {nome}, bem-vindo ao Squad! 👋\n\nSou o assistente do Squad e vou te ajudar a levar seu negócio ainda mais longe. Vou trabalhar 24/7 por você, cuidando do atendimento, do marketing e do financeiro.\n\nPra configurar tudo certinho, vou te fazer algumas perguntas rápidas.',
      },
    },
    {
      id: 'fs-q-nome',
      type: 'question',
      position: { x: 300, y: 460 },
      data: {
        type: 'question',
        texto: 'Pra configurar tudo certinho, me conta: qual o nome do seu negócio?',
        opcoes: [{ id: 'fs-q-nome-r1', label: 'Nome do negócio' }],
        salvarComo: 'negocio',
      },
    },
    {
      id: 'fs-q-cidade',
      type: 'question',
      position: { x: 300, y: 660 },
      data: {
        type: 'question',
        texto: 'Em qual cidade fica o {negocio}?',
        opcoes: [{ id: 'fs-q-cidade-r1', label: 'Cidade / estado' }],
        salvarComo: 'cidade',
      },
    },
    {
      id: 'fs-act-buscar',
      type: 'action',
      position: { x: 300, y: 860 },
      data: { type: 'action', kind: 'scraping', label: 'Buscar negócio (Places + CNPJ)' },
    },
    {
      id: 'fs-q-contato',
      type: 'question',
      position: { x: 300, y: 1000 },
      data: {
        type: 'question',
        texto: 'Peguei o endereço e o telefone do seu negócio (CNPJ, endereço, telefone). Confere se está tudo certo:',
        opcoes: [
          { id: 'fs-q-contato-r1', label: 'Está certo' },
          { id: 'fs-q-contato-r2', label: 'O CNPJ está errado' },
        ],
      },
    },
    {
      id: 'fs-q-site',
      type: 'question',
      position: { x: 300, y: 1240 },
      data: {
        type: 'question',
        texto: 'Achei o site do {negocio}. É esse mesmo? Vou usar pra puxar seu catálogo e suas informações de lá.',
        opcoes: [
          { id: 'fs-q-site-r1', label: 'Sim, é esse' },
          { id: 'fs-q-site-r2', label: 'Corrigir link' },
          { id: 'fs-q-site-r3', label: 'Não tenho site' },
        ],
      },
    },
    {
      id: 'fs-act-instagram',
      type: 'action',
      position: { x: 300, y: 1480 },
      data: { type: 'action', kind: 'conectar-instagram', label: 'Conectar Instagram' },
    },
    {
      id: 'fs-q-ifood',
      type: 'question',
      position: { x: 300, y: 1620 },
      data: {
        type: 'question',
        texto: 'Achei esta loja no iFood. É a sua? Posso importar seu cardápio com os preços de lá.',
        opcoes: [
          { id: 'fs-q-ifood-r1', label: 'Sim, é a minha loja' },
          { id: 'fs-q-ifood-r2', label: 'Não é essa' },
          { id: 'fs-q-ifood-r3', label: 'Não vendo no iFood' },
        ],
      },
    },
    {
      id: 'fs-q-catalogo',
      type: 'question',
      position: { x: 300, y: 1860 },
      data: {
        type: 'question',
        texto: 'Encontrei alguns produtos do seu catálogo. Confere se está certo:',
        opcoes: [
          { id: 'fs-q-catalogo-r1', label: 'Sim, é isso' },
          { id: 'fs-q-catalogo-r2', label: 'Falta coisa' },
        ],
      },
    },
    {
      id: 'fs-q-fulfillment',
      type: 'question',
      position: { x: 300, y: 2160 },
      data: {
        type: 'question',
        texto: 'Como seus clientes recebem os pedidos?',
        opcoes: [
          { id: 'fs-q-fulfillment-r1', label: 'Entrega' },
          { id: 'fs-q-fulfillment-r2', label: 'Retirada' },
          { id: 'fs-q-fulfillment-r3', label: 'Entrega e retirada' },
        ],
      },
    },
    {
      id: 'fs-act-tom',
      type: 'action',
      position: { x: 300, y: 2300 },
      data: { type: 'action', kind: 'gerar-tom', label: 'Gerar tom de voz' },
    },
    {
      id: 'fs-q-tom',
      type: 'question',
      position: { x: 300, y: 2440 },
      data: {
        type: 'question',
        texto: 'Pela pesquisa que fiz, seu tom me parece caloroso e informal — algo assim. Ficou a sua cara?',
        opcoes: [
          { id: 'fs-q-tom-r1', label: 'Sim, é meu tom' },
          { id: 'fs-q-tom-r2', label: 'Aprender de uma conversa' },
          { id: 'fs-q-tom-r3', label: 'Quero ajustar' },
        ],
      },
    },
    {
      id: 'fs-q-emojis',
      type: 'question',
      position: { x: 300, y: 2680 },
      data: {
        type: 'question',
        texto: 'E emojis — uso sempre, às vezes ou nunca?',
        opcoes: [
          { id: 'fs-q-emojis-r1', label: 'Sempre' },
          { id: 'fs-q-emojis-r2', label: 'Às vezes' },
          { id: 'fs-q-emojis-r3', label: 'Nunca' },
        ],
      },
    },
    {
      id: 'fs-msg-review',
      type: 'message',
      position: { x: 300, y: 3220 },
      data: {
        type: 'message',
        texto: 'Fechou! Aqui está o resumo do que eu já sei. Tá tudo certo pra eu começar?',
      },
    },
    {
      id: 'fs-msg-configurado',
      type: 'message',
      position: { x: 300, y: 3400 },
      data: {
        type: 'message',
        texto: 'Prontinho! Já sei quem você é, como falar e o que fazer. Bora ver o que eu sei fazer?',
      },
    },
    {
      id: 'fs-end',
      type: 'end',
      position: { x: 300, y: 3580 },
      data: { type: 'end', texto: 'Ver funcionalidades 🚀' },
    },
  ],
  edges: [
    { id: 'fs-e1', source: 'fs-start', target: 'fs-msg-welcome' },
    { id: 'fs-e2', source: 'fs-msg-welcome', target: 'fs-q-nome' },
    { id: 'fs-e3', source: 'fs-q-nome', target: 'fs-q-cidade', sourceHandle: 'fs-q-nome-r1' },
    { id: 'fs-e4', source: 'fs-q-cidade', target: 'fs-act-buscar', sourceHandle: 'fs-q-cidade-r1' },
    { id: 'fs-e5', source: 'fs-act-buscar', target: 'fs-q-contato' },
    { id: 'fs-e6', source: 'fs-q-contato', target: 'fs-q-site', sourceHandle: 'fs-q-contato-r1' },
    { id: 'fs-e7', source: 'fs-q-contato', target: 'fs-q-site', sourceHandle: 'fs-q-contato-r2' },
    { id: 'fs-e8', source: 'fs-q-site', target: 'fs-act-instagram', sourceHandle: 'fs-q-site-r1' },
    { id: 'fs-e9', source: 'fs-q-site', target: 'fs-act-instagram', sourceHandle: 'fs-q-site-r2' },
    { id: 'fs-e10', source: 'fs-q-site', target: 'fs-act-instagram', sourceHandle: 'fs-q-site-r3' },
    { id: 'fs-e11', source: 'fs-act-instagram', target: 'fs-q-ifood' },
    { id: 'fs-e12', source: 'fs-q-ifood', target: 'fs-q-catalogo', sourceHandle: 'fs-q-ifood-r1' },
    { id: 'fs-e13', source: 'fs-q-ifood', target: 'fs-q-catalogo', sourceHandle: 'fs-q-ifood-r2' },
    { id: 'fs-e14', source: 'fs-q-ifood', target: 'fs-q-catalogo', sourceHandle: 'fs-q-ifood-r3' },
    { id: 'fs-e15', source: 'fs-q-catalogo', target: 'fs-q-fulfillment', sourceHandle: 'fs-q-catalogo-r1' },
    { id: 'fs-e16', source: 'fs-q-catalogo', target: 'fs-q-fulfillment', sourceHandle: 'fs-q-catalogo-r2' },
    { id: 'fs-e17a', source: 'fs-q-fulfillment', target: 'fs-act-tom', sourceHandle: 'fs-q-fulfillment-r1' },
    { id: 'fs-e17b', source: 'fs-q-fulfillment', target: 'fs-act-tom', sourceHandle: 'fs-q-fulfillment-r2' },
    { id: 'fs-e17c', source: 'fs-q-fulfillment', target: 'fs-act-tom', sourceHandle: 'fs-q-fulfillment-r3' },
    { id: 'fs-e18', source: 'fs-act-tom', target: 'fs-q-tom' },
    { id: 'fs-e19', source: 'fs-q-tom', target: 'fs-q-emojis', sourceHandle: 'fs-q-tom-r1' },
    { id: 'fs-e20', source: 'fs-q-tom', target: 'fs-q-emojis', sourceHandle: 'fs-q-tom-r2' },
    { id: 'fs-e21', source: 'fs-q-tom', target: 'fs-q-emojis', sourceHandle: 'fs-q-tom-r3' },
    { id: 'fs-e22', source: 'fs-q-emojis', target: 'fs-msg-review', sourceHandle: 'fs-q-emojis-r1' },
    { id: 'fs-e23', source: 'fs-q-emojis', target: 'fs-msg-review', sourceHandle: 'fs-q-emojis-r2' },
    { id: 'fs-e24', source: 'fs-q-emojis', target: 'fs-msg-review', sourceHandle: 'fs-q-emojis-r3' },
    { id: 'fs-e24e', source: 'fs-msg-review', target: 'fs-msg-configurado' },
    { id: 'fs-e25', source: 'fs-msg-configurado', target: 'fs-end' },
  ],
}

// Liga cada nó do Fluxo Stefano à etapa semântica do onboarding real. Isso torna
// o fluxo "adaptativo": editar texto, reordenar ou excluir um nó reforma o wizard
// (ver flowToOnboarding). Nós sem entrada aqui (ex.: fs-act-buscar, fs-start) não
// viram etapa — a busca Places/CNPJ acontece implicitamente em ask_city/contato.
const FS_STEP_MAP: Record<string, string> = {
  'fs-msg-welcome': 'welcome',
  'fs-q-nome': 'welcome',
  'fs-q-cidade': 'ask_city',
  'fs-q-contato': 'confirm_contact',
  'fs-q-site': 'confirm_site',
  'fs-act-instagram': 'instagram',
  'fs-q-ifood': 'ifood',
  'fs-q-catalogo': 'catalog',
  'fs-q-fulfillment': 'fulfillment',
  'fs-act-tom': 'tone_generated',
  'fs-q-tom': 'tone_generated',
  'fs-q-emojis': 'emojis',
  'fs-msg-review': 'review',
  'fs-msg-configurado': 'configured',
  'fs-end': 'features',
}

function withStepIds(flow: FlowDefinition, map: Record<string, string>): FlowDefinition {
  return {
    ...flow,
    nodes: flow.nodes.map((n) =>
      map[n.id]
        ? { ...n, data: { ...n.data, stepId: map[n.id] } }
        : n,
    ),
  }
}

const FLOW_STEFANO: FlowDefinition = withStepIds(FLOW_STEFANO_BASE, FS_STEP_MAP)

// Flow Final — onboarding completo do Squad como grafo. Cada etapa de
// enriquecimento é um nó de ação cujo label aponta o endpoint /api real que a
// experiência ao vivo (/onboarding) chama. Usa os 4 kinds existentes (mesma
// convenção do Fluxo Stefano). Placeholders {nome}/{negocio}/{cidade}/{site}
// são literais no preview de design; o wizard ao vivo substitui pelos valores.
// Flow Final — runs as the scripted node-walker preview (ChatPreview), faithful
// to this exact script. Its action nodes call the real /api endpoints live, so
// {endereco}/{telefone}/{site}/{instagram} below are filled with real data for
// the business the user types (see ChatPreview runAction). {nome}/{negocio}/
// {cidade} come from the answers via `salvarComo`.
const FLOW_FINAL: FlowDefinition = {
  id: 'flow-final',
  nome: 'Flow Final - Squad',
  scrapingEnabled: true,
  nodes: [
    { id: 'ff-start', type: 'start', position: { x: 300, y: 60 }, data: { type: 'start' } },
    {
      id: 'ff-q-nome',
      type: 'question',
      position: { x: 300, y: 200 },
      data: {
        type: 'question',
        texto: 'Bem-vindo ao Squad! 👋\n\nComo podemos te chamar?',
        opcoes: [{ id: 'ff-q-nome-r1', label: 'Nome' }],
        salvarComo: 'nome',
      },
    },
    {
      id: 'ff-msg-welcome',
      type: 'message',
      position: { x: 300, y: 420 },
      data: {
        type: 'message',
        texto:
          'Oi {nome}, bem-vindo ao Squad! 👋\n\nSou o assistente do Squad e vou te ajudar a levar seu negócio ainda mais longe.\n\nA partir de agora você conta com um time trabalhando 24/7 por você:\n\n📣 Maky, seu marketing\n📱 Waz, suas vendas e atendimento\n💰 Fin, seu financeiro',
      },
    },
    {
      id: 'ff-q-empresa',
      type: 'question',
      position: { x: 300, y: 720 },
      data: {
        type: 'question',
        texto: 'Vamos começar pelo básico: pra começar, qual é o nome da sua empresa?',
        opcoes: [{ id: 'ff-q-empresa-r1', label: 'Nome da empresa' }],
        salvarComo: 'negocio',
      },
    },
    {
      id: 'ff-q-cidade',
      type: 'question',
      position: { x: 300, y: 920 },
      data: {
        type: 'question',
        texto: 'Em qual cidade fica o {negocio}?',
        opcoes: [{ id: 'ff-q-cidade-r1', label: 'Cidade' }],
        salvarComo: 'cidade',
      },
    },
    {
      id: 'ff-q-segmento',
      type: 'question',
      position: { x: 300, y: 1120 },
      data: {
        type: 'question',
        texto: 'E em qual segmento a {negocio} atua?',
        opcoes: [{ id: 'ff-q-segmento-r1', label: 'Segmento' }],
      },
    },
    {
      id: 'ff-msg-procurando',
      type: 'message',
      position: { x: 300, y: 1320 },
      data: {
        type: 'message',
        texto: 'Boa! Já vou procurar o {negocio} em {cidade} aqui em segundo plano enquanto a gente continua 👀',
      },
    },
    {
      id: 'ff-act-places',
      type: 'action',
      position: { x: 300, y: 1520 },
      data: { type: 'action', kind: 'scraping', label: 'Buscar negócio → /api/places' },
    },
    {
      id: 'ff-q-resultado',
      type: 'question',
      position: { x: 300, y: 1660 },
      data: {
        type: 'question',
        texto: 'Achei esses resultados. Qual é o seu?\n\n📍 {negocio} — {endereco}',
        opcoes: [
          { id: 'ff-q-resultado-r1', label: 'É esse' },
          { id: 'ff-q-resultado-r2', label: 'Outro' },
          { id: 'ff-q-resultado-r3', label: 'Nenhum desses' },
        ],
      },
    },
    {
      id: 'ff-q-endereco',
      type: 'question',
      position: { x: 300, y: 1900 },
      data: {
        type: 'question',
        texto:
          'Peguei o endereço e o telefone do seu negócio. Confere se está tudo certo:\n\n📍 {endereco}\n📞 {telefone}',
        opcoes: [{ id: 'ff-q-endereco-r1', label: 'Está tudo certo' }],
      },
    },
    {
      id: 'ff-q-site',
      type: 'question',
      position: { x: 300, y: 2140 },
      data: {
        type: 'question',
        texto:
          'Achei o site do {negocio}: {site}\n\nÉ esse mesmo? Vou usar pra puxar seu catálogo e suas informações de lá.',
        opcoes: [{ id: 'ff-q-site-r1', label: 'Sim' }],
      },
    },
    {
      id: 'ff-act-sitescrape',
      type: 'action',
      position: { x: 300, y: 2380 },
      data: { type: 'action', kind: 'scraping', label: 'Extrair do site → /api/site-scrape + /api/catalog' },
    },
    {
      id: 'ff-act-redes',
      type: 'action',
      position: { x: 300, y: 2520 },
      data: { type: 'action', kind: 'conectar-instagram', label: 'Instagram + iFood → /api/instagram, /api/ifood' },
    },
    {
      id: 'ff-q-instagram',
      type: 'question',
      position: { x: 300, y: 2660 },
      data: {
        type: 'question',
        texto: 'Encontrei esse Instagram aqui, seria seu?\n\n{instagram}',
        opcoes: [{ id: 'ff-q-instagram-r1', label: 'Sim' }],
      },
    },
    {
      id: 'ff-q-boasvindas',
      type: 'question',
      position: { x: 300, y: 2900 },
      data: {
        type: 'question',
        texto: 'Você já tem uma mensagem de boas-vindas?',
        opcoes: [{ id: 'ff-q-boasvindas-r1', label: 'Mensagem de boas-vindas' }],
      },
    },
    {
      id: 'ff-q-catalogo-msg',
      type: 'question',
      position: { x: 300, y: 3140 },
      data: {
        type: 'question',
        texto: 'Gostaria de enviar seu catálogo de produtos na sua mensagem de boas-vindas?',
        opcoes: [
          { id: 'ff-q-catalogo-msg-r1', label: 'Sim' },
          { id: 'ff-q-catalogo-msg-r2', label: 'Não' },
        ],
      },
    },
    {
      id: 'ff-q-anexar',
      type: 'question',
      position: { x: 600, y: 3380 },
      data: {
        type: 'question',
        texto: 'Show! Poderia anexar aqui, por favor?',
        opcoes: [{ id: 'ff-q-anexar-r1', label: 'cardapio.pdf' }],
      },
    },
    {
      id: 'ff-act-ocr',
      type: 'action',
      position: { x: 600, y: 3620 },
      data: { type: 'action', kind: 'custom', label: 'Ler catálogo (PDF) → /api/ocr' },
    },
    {
      id: 'ff-q-entrega',
      type: 'question',
      position: { x: 300, y: 4260 },
      data: {
        type: 'question',
        texto: 'Vocês fazem entrega ou retirada?',
        opcoes: [{ id: 'ff-q-entrega-r1', label: 'Entrega / retirada' }],
      },
    },
    {
      id: 'ff-q-prazo',
      type: 'question',
      position: { x: 300, y: 4460 },
      data: {
        type: 'question',
        texto: 'Qual é o prazo mínimo para encomendas?',
        opcoes: [{ id: 'ff-q-prazo-r1', label: 'Prazo mínimo' }],
      },
    },
    {
      id: 'ff-act-tom',
      type: 'action',
      position: { x: 300, y: 4880 },
      data: { type: 'action', kind: 'gerar-tom', label: 'Gerar tom de voz → /api/tone-from-text + /api/research' },
    },
    {
      id: 'ff-q-tom',
      type: 'question',
      position: { x: 300, y: 5020 },
      data: {
        type: 'question',
        texto: 'Com base no seu site e Instagram, criei esse tom de voz para você! O que achou?',
        opcoes: [
          { id: 'ff-q-tom-r1', label: 'Gostei' },
          { id: 'ff-q-tom-r2', label: 'Quero ajustar' },
        ],
      },
    },
    {
      id: 'ff-q-mais',
      type: 'question',
      position: { x: 300, y: 5320 },
      data: {
        type: 'question',
        texto: 'Tem mais alguma coisa importante que o agente precisa saber?',
        opcoes: [
          { id: 'ff-q-mais-r1', label: 'Por agora não' },
          { id: 'ff-q-mais-r2', label: 'Adicionar info' },
        ],
      },
    },
    {
      id: 'ff-msg-testar',
      type: 'message',
      position: { x: 300, y: 5560 },
      data: { type: 'message', texto: 'Perfeito! Vamos testar seu atendimento? 🚀' },
    },
    {
      id: 'ff-end',
      type: 'end',
      position: { x: 300, y: 5760 },
      data: { type: 'end', texto: 'Iniciar fluxo de teste 🚀' },
    },
  ],
  edges: [
    { id: 'ff-e1', source: 'ff-start', target: 'ff-q-nome' },
    { id: 'ff-e2', source: 'ff-q-nome', target: 'ff-msg-welcome', sourceHandle: 'ff-q-nome-r1' },
    { id: 'ff-e3', source: 'ff-msg-welcome', target: 'ff-q-empresa' },
    { id: 'ff-e4', source: 'ff-q-empresa', target: 'ff-q-cidade', sourceHandle: 'ff-q-empresa-r1' },
    { id: 'ff-e5', source: 'ff-q-cidade', target: 'ff-q-segmento', sourceHandle: 'ff-q-cidade-r1' },
    { id: 'ff-e6', source: 'ff-q-segmento', target: 'ff-msg-procurando', sourceHandle: 'ff-q-segmento-r1' },
    { id: 'ff-e7', source: 'ff-msg-procurando', target: 'ff-act-places' },
    { id: 'ff-e8', source: 'ff-act-places', target: 'ff-q-resultado' },
    { id: 'ff-e9', source: 'ff-q-resultado', target: 'ff-q-endereco', sourceHandle: 'ff-q-resultado-r1' },
    { id: 'ff-e10', source: 'ff-q-resultado', target: 'ff-q-endereco', sourceHandle: 'ff-q-resultado-r2' },
    { id: 'ff-e11', source: 'ff-q-resultado', target: 'ff-q-endereco', sourceHandle: 'ff-q-resultado-r3' },
    { id: 'ff-e12', source: 'ff-q-endereco', target: 'ff-q-site', sourceHandle: 'ff-q-endereco-r1' },
    { id: 'ff-e13', source: 'ff-q-site', target: 'ff-act-sitescrape', sourceHandle: 'ff-q-site-r1' },
    { id: 'ff-e14', source: 'ff-act-sitescrape', target: 'ff-act-redes' },
    { id: 'ff-e15', source: 'ff-act-redes', target: 'ff-q-instagram' },
    { id: 'ff-e16', source: 'ff-q-instagram', target: 'ff-q-boasvindas', sourceHandle: 'ff-q-instagram-r1' },
    { id: 'ff-e17', source: 'ff-q-boasvindas', target: 'ff-q-catalogo-msg', sourceHandle: 'ff-q-boasvindas-r1' },
    { id: 'ff-e18', source: 'ff-q-catalogo-msg', target: 'ff-q-anexar', sourceHandle: 'ff-q-catalogo-msg-r1' },
    { id: 'ff-e19', source: 'ff-q-catalogo-msg', target: 'ff-q-entrega', sourceHandle: 'ff-q-catalogo-msg-r2' },
    { id: 'ff-e20', source: 'ff-q-anexar', target: 'ff-act-ocr', sourceHandle: 'ff-q-anexar-r1' },
    { id: 'ff-e21', source: 'ff-act-ocr', target: 'ff-q-entrega' },
    { id: 'ff-e24', source: 'ff-q-entrega', target: 'ff-q-prazo', sourceHandle: 'ff-q-entrega-r1' },
    { id: 'ff-e25', source: 'ff-q-prazo', target: 'ff-act-tom', sourceHandle: 'ff-q-prazo-r1' },
    { id: 'ff-e27', source: 'ff-act-tom', target: 'ff-q-tom' },
    { id: 'ff-e28', source: 'ff-q-tom', target: 'ff-q-mais', sourceHandle: 'ff-q-tom-r1' },
    { id: 'ff-e29', source: 'ff-q-tom', target: 'ff-q-mais', sourceHandle: 'ff-q-tom-r2' },
    { id: 'ff-e30', source: 'ff-q-mais', target: 'ff-msg-testar', sourceHandle: 'ff-q-mais-r1' },
    { id: 'ff-e31', source: 'ff-q-mais', target: 'ff-msg-testar', sourceHandle: 'ff-q-mais-r2' },
    { id: 'ff-e32', source: 'ff-msg-testar', target: 'ff-end' },
  ],
}

const DEFAULTS: Record<string, FlowDefinition> = {
  'flow-a': FLOW_A,
  'flow-b': FLOW_B,
  'flow-c': FLOW_C,
  'flow-stefano': FLOW_STEFANO,
  'flow-final': FLOW_FINAL,
}

function createEmptyFlow(id: string): FlowDefinition {
  // Novos fluxos nascem em branco — só com o nó de início. O usuário monta o
  // fluxo do zero a partir daí.
  return {
    id,
    nome: 'Novo Fluxo',
    scrapingEnabled: false,
    nodes: [{ id: `${id}-start`, type: 'start', position: { x: 300, y: 200 }, data: { type: 'start' } }],
    edges: [],
  }
}

// ── localStorage fallback (used when Supabase is not configured) ─────────────

function loadLocal(id: string): FlowDefinition {
  try {
    const raw = localStorage.getItem(`waz-flow-${id}`)
    if (raw) return { ...JSON.parse(raw) as FlowDefinition, id }
  } catch { /* ignore */ }
  return DEFAULTS[id] ?? createEmptyFlow(id)
}

function saveLocal(flow: FlowDefinition) {
  try {
    localStorage.setItem(`waz-flow-${flow.id}`, JSON.stringify(flow))
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFlow(id: FlowId) {
  const [flow, setFlow] = useState<FlowDefinition>(() =>
    supabase ? (DEFAULTS[id] ?? createEmptyFlow(id)) : loadLocal(id)
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
        setFlow(data ? { ...(data.data as FlowDefinition), id } : (DEFAULTS[id] ?? createEmptyFlow(id)))
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
    update(DEFAULTS[id] ?? createEmptyFlow(id))
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

// ── Flow list (dynamic tabs) ──────────────────────────────────────────────────

const DEFAULT_TABS = [
  { id: 'flow-a', label: 'Fluxo A' },
  { id: 'flow-b', label: 'Fluxo B' },
  { id: 'flow-c', label: 'Fluxo C' },
  { id: 'flow-stefano', label: 'Fluxo Stefano' },
  { id: 'flow-final', label: 'Flow Final' },
]

export function useFlowList() {
  const [extra, setExtra] = useState<{ id: string; label: string }[]>(() => {
    try {
      const raw = localStorage.getItem('waz-extra-flows')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return []
  })

  const tabs = [
    ...DEFAULT_TABS.map((t) => ({ ...t, custom: false })),
    ...extra.map((t) => ({ ...t, custom: true })),
  ]

  const addFlow = useCallback((): string => {
    const id = `flow-${Date.now()}`
    setExtra((prev) => {
      const next = [...prev, { id, label: `Fluxo ${DEFAULT_TABS.length + prev.length + 1}` }]
      try { localStorage.setItem('waz-extra-flows', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    return id
  }, [])

  // Removes a custom (non-default) flow: its tab, its saved data, and its row.
  const removeFlow = useCallback((id: string) => {
    setExtra((prev) => {
      const next = prev.filter((t) => t.id !== id)
      try { localStorage.setItem('waz-extra-flows', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    try { localStorage.removeItem(`waz-flow-${id}`) } catch { /* ignore */ }
    if (supabase) {
      supabase.from('flows').delete().eq('id', id).then(() => {}, () => {})
    }
  }, [])

  return { tabs, addFlow, removeFlow }
}
