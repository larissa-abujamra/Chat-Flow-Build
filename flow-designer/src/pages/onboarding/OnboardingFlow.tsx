import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Send, Sparkles, CheckCircle2, Circle, Instagram, Loader2, Wand2,
  ListTodo, StickyNote, BookOpen, MessageSquare, RotateCcw, Settings2,
  X, ArrowRight, Check, Lock, RefreshCw, Headset,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Pencil, Eye,
  GitBranch, List as ListIcon, GripVertical, Plus, Trash2, Maximize2,
  MapPin, Phone, FileText, Globe, Store, ExternalLink,
} from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import "./_group.css";

/* Tipos de negócio simulados (definem qual scraper/placeholders aparecem).
   Dados reais virão das APIs; aqui usamos rótulos, nunca dados inventados. */
type BizType = "alimentacao" | "varejo" | "servicos";
const BIZ_TYPES: { id: BizType; label: string }[] = [
  { id: "alimentacao", label: "Alimentação · iFood" },
  { id: "varejo", label: "Varejo · e-commerce" },
  { id: "servicos", label: "Serviços · sem catálogo" },
];
const PLACEHOLDER_CATALOG: Record<BizType, { name: string; price: string | null }[]> = {
  alimentacao: [
    { name: "[Prato 1 — via iFood]", price: null },
    { name: "[Prato 2 — via iFood]", price: null },
    { name: "[Prato 3 — via iFood]", price: null },
  ],
  varejo: [
    { name: "[Produto 1 — via e-commerce]", price: null },
    { name: "[Produto 2 — via e-commerce]", price: null },
    { name: "[Produto 3 — via e-commerce]", price: null },
  ],
  servicos: [],
};

interface PlaceCandidate {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  categoria: string;
  horario: string;
  telefone: string;
  site: string;
}

interface CnpjData {
  encontrado: boolean;
  cnpj: string;
  cidade: string;
  razaoSocial: string;
  nomeFantasia: string;
  endereco: string;
  telefone: string;
  email: string;
  situacao: string;
  atividade: string;
  horario: string;
  site: string;
  instagram: string;
}

interface IgData {
  encontrado: boolean;
  username: string;
  nome: string;
  bio: string;
  seguidores: number;
  seguindo: number;
  link: string;
  fotoPerfil: string;
  ehComercial: boolean;
}

const CLIENT_Q = "Oii, vocês fazem bolo de pote?";

const TONE_EXAMPLES: Record<string, string> = {
  "Casual e descontraído": "Oii! Fazemos sim 😄 Quer que eu te mande as opções?",
  "Afetuoso e acolhedor": "Oii, que delícia de pedido! Fazemos sim, viu? 💕 Posso te mandar as opções pra você escolher?",
  "Elegante e sofisticado": "Olá! Sim, trabalhamos com bolo de pote. Posso lhe enviar as opções disponíveis?",
  "Atencioso e prestativo": "Olá! Fazemos sim. Posso te enviar agora as opções para você escolher a ideal?",
};
const TONES = Object.keys(TONE_EXAMPLES);

type FeatureId = "copiloto" | "automatico" | "nota" | "tarefa" | "base" | "direta";

const FEATURES: { id: FeatureId; name: string; desc: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "copiloto", name: "Co-piloto", desc: "Eu sugiro a resposta e você aprova.", Icon: Wand2 },
  { id: "automatico", name: "Piloto automático", desc: "Eu respondo sozinho o que já sei.", Icon: Sparkles },
  { id: "nota", name: "Nota interna", desc: "Recados que só a equipe vê.", Icon: StickyNote },
  { id: "tarefa", name: "Tarefa para o assistente", desc: "Delegue lembretes e tarefas pra mim.", Icon: ListTodo },
  { id: "base", name: "Base de conhecimento", desc: "Me ensine informações do negócio.", Icon: BookOpen },
  { id: "direta", name: "Mensagem direta", desc: "Você mesmo fala com o cliente.", Icon: MessageSquare },
];

type Phase = "intro" | "chat" | "tour" | "done";
type NodeId =
  | "welcome"
  | "ask_city" | "place_pick" | "confirm_contact" | "contact_adjust"
  | "confirm_site" | "confirm_site_edit" | "site_scraping"
  | "catalog" | "catalog_falta" | "carro_chefe"
  | "ifood" | "ifood_connecting" | "ifood_link" | "ifood_ask_link"
  | "instagram" | "instagram_edit" | "instagram_connecting"
  | "tone_generated" | "tone_manual" | "tone_upload" | "tone_reading"
  | "emojis" | "configured";

type TextField = "businessName" | "city" | "cnpj" | "site" | "instagram" | "setor" | "services";

interface Msg {
  id: number;
  sender: "oddy" | "user";
  kind: "text" | "extra";
  text?: string;
  extra?: "catalog" | "connecting" | "toneExample" | "searching" | "contact" | "readingChat" | "scraping" | "ifoodConnecting" | "ifoodSearching" | "ifoodFound";
  // blocos de status (busca/leitura/conexão) começam girando e viram um
  // checkmark verde quando a operação correspondente termina.
  done?: boolean;
}

interface Choice {
  label: string;
  value: string;
  next: string;
  set?: () => void;
}
type Pending =
  | { kind: "choice"; options: Choice[] }
  | { kind: "carroChefe" }
  | { kind: "destaque" }
  | { kind: "placePick" }
  | { kind: "toneManual" }
  | { kind: "toneUpload" }
  | { kind: "textInput"; field: string; placeholder: string }
  | { kind: "finish" };

interface Research {
  resumo: string;
  website: string;
  produtos: { nome: string; preco?: string }[];
  tom: string;
  exemplo: string;
  horario: string;
  telefone: string;
  endereco: string;
  citations: { title: string; url: string }[];
}

interface SiteScrape {
  resumo: string;
  produtos: { nome: string; preco: string }[];
  tom: string;
  exemplo: string;
  instagram: string;
  telefone: string;
  endereco: string;
  horario: string;
}

type CatalogItem = { nome: string; preco: string };

// Loja detectada do negócio no iFood (achada por BUSCA, não por scraping do
// iFood). Só é preenchida depois que o usuário CONFIRMA "é a minha loja". A URL
// é sempre real (indexada na busca) — nunca inventada.
interface IFoodStore {
  nome: string;
  url: string;
  id?: string;
}

// Valida e canoniza um link de LOJA do iFood colado pelo usuário. Só aceita o
// host oficial (ifood.com.br) e o caminho de loja (/delivery/); descarta
// query/fragment. Retorna null se não for um link REAL de loja — nunca "conserta"
// um link inválido nem inventa URL.
function parseIfoodStoreUrl(raw: string): { url: string; id?: string } | null {
  let s = String(raw || "").trim().replace(/[)\].,;]+$/, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "ifood.com.br" && host !== "www.ifood.com.br") return null;
  if (!/^\/delivery\//i.test(u.pathname)) return null;
  const url = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  const id = (u.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
  return { url, id };
}

// Resultado da importação do cardápio do iFood (via link da loja → Apify). Só
// traz itens REAIS retornados pelo ator; nunca inventa nome/preço.
interface IFoodImportResult {
  connected: boolean;
  produtos: CatalogItem[];
  store?: { id: string; name: string };
}

/* ---------- Editable copy registry (drives the builder) ---------- */

interface FlowField {
  key: string;
  label: string;
  default: string;
  multiline?: boolean;
}
interface FlowNodeDef {
  id: string;
  title: string;
  kind: "Entrada" | "Pergunta" | "Mensagem";
  fields: FlowField[];
}

const FLOW_NODES: FlowNodeDef[] = [
  {
    id: "welcome",
    title: "Boas-vindas",
    kind: "Entrada",
    fields: [
      { key: "welcome.l1", label: "Saudação", default: "Oi, {nome}, bem-vindo ao Squad! 👋" },
      { key: "welcome.l2", label: "Apresentação", default: "Sou o assistente do Squad e vou te ajudar a levar seu negócio ainda mais longe.", multiline: true },
      { key: "welcome.l3", label: "Como funciona", default: "Vou trabalhar 24/7 por você, cuidando do atendimento, do marketing e do financeiro.", multiline: true },
      { key: "welcome.ask", label: "Pergunta (nome do negócio)", default: "Pra configurar tudo certinho, me conta: qual o nome do seu negócio?" },
      { key: "welcome.ph", label: "Placeholder", default: "Nome do seu negócio" },
    ],
  },
  {
    id: "ask_city",
    title: "Cidade",
    kind: "Entrada",
    fields: [
      { key: "ask_city.msg", label: "Pergunta", default: "Em qual cidade fica o {negocio}?" },
      { key: "ask_city.ph", label: "Placeholder", default: "Cidade / estado" },
    ],
  },
  {
    id: "place_pick",
    title: "Seleção do negócio",
    kind: "Pergunta",
    fields: [
      { key: "place_pick.bg", label: "Buscando em segundo plano", default: "Boa! Já vou procurar o {negocio} em {cidade} aqui em segundo plano enquanto a gente continua 👀" },
      { key: "place_pick.searching", label: "Buscando", default: "Deixa eu procurar o {negocio} em {cidade}…" },
      { key: "place_pick.found", label: "Achei", default: "Achei esses resultados. Qual é o seu?" },
      { key: "place_pick.multi", label: "Aviso multi-unidade", default: "Parece que vocês têm mais de uma unidade — escolhe a que vamos configurar primeiro." },
      { key: "place_pick.notfound", label: "Não achei", default: "Não consegui localizar o endereço automaticamente — sem problema, você confirma os dados de contato no próximo passo." },
      { key: "place_pick.cnpj_addr", label: "Achei pelo CNPJ", default: "Não localizei pelo mapa, mas puxei o endereço pelo CNPJ na Receita. Confere os dados:" },
      { key: "place_pick.none", label: "Opção: nenhum", default: "Não é nenhum desses" },
    ],
  },
  {
    id: "confirm_contact",
    title: "Confirmar contato",
    kind: "Pergunta",
    fields: [
      { key: "confirm_contact.msg", label: "Mensagem", default: "Peguei o endereço e o telefone do seu negócio. Confere se está tudo certo:" },
      { key: "confirm_contact.opt_sim", label: "Opção: confirmar", default: "Está certo" },
      { key: "confirm_contact.opt_ajustar", label: "Opção: ajustar", default: "O CNPJ está errado" },
      { key: "contact_adjust.msg", label: "Pedir CNPJ correto", default: "Sem problema! Qual é o CNPJ correto da empresa? Vou puxar os dados atualizados." },
      { key: "contact_adjust.ph", label: "Placeholder CNPJ", default: "00.000.000/0000-00" },
      { key: "contact_adjust.invalido", label: "CNPJ inválido", default: "Esse CNPJ não parece válido — ele precisa ter 14 dígitos. Pode conferir e mandar de novo?" },
      { key: "contact_adjust.notfound", label: "CNPJ não encontrado", default: "Não consegui localizar esse CNPJ na base. Mantive os dados anteriores — confere abaixo ou tenta de novo." },
    ],
  },
  {
    id: "confirm_site",
    title: "Confirmar site",
    kind: "Pergunta",
    fields: [
      { key: "confirm_site.found", label: "Site encontrado", default: "Achei o site do {negocio}: {site}" },
      { key: "confirm_site.confirm", label: "Confirmação", default: "É esse mesmo? Vou usar pra puxar seu catálogo e suas informações de lá." },
      { key: "confirm_site.opt_sim", label: "Opção: confirmar", default: "Sim, é esse" },
      { key: "confirm_site.opt_edit", label: "Opção: corrigir", default: "Corrigir link" },
      { key: "confirm_site.opt_none", label: "Opção: sem site", default: "Não tenho site" },
      { key: "confirm_site.ask", label: "Sem site deduzido", default: "Você tem um site? Me manda o link que eu puxo suas informações de lá — ou escreve \"não tenho\".", multiline: true },
      { key: "confirm_site.edit_msg", label: "Pedir link", default: "Qual é o link do seu site?" },
      { key: "confirm_site.ph", label: "Placeholder", default: "www.seusite.com.br" },
      { key: "site_scraping.msg", label: "Lendo o site", default: "Perfeito! Já tô dando uma olhada no site do {negocio} pra puxar catálogo, contatos e o seu jeito de falar… 🔍" },
    ],
  },
  {
    id: "catalog",
    title: "Catálogo",
    kind: "Pergunta",
    fields: [
      { key: "catalog.searching", label: "Buscando dados", default: "Boa! Deixa eu dar uma olhada no que encontro sobre o {negocio}." },
      { key: "catalog.found", label: "Catálogo encontrado", default: "Encontrei alguns produtos do seu catálogo. Confere se está certo:" },
      { key: "catalog.example", label: "Catálogo de exemplo", default: "Montei um catálogo de exemplo pra seguirmos. Esse é o seu catálogo?" },
      { key: "catalog.opt_sim", label: "Opção: confirmar", default: "Sim, é isso" },
      { key: "catalog.opt_falta", label: "Opção: falta coisa", default: "Falta coisa" },
      { key: "catalog.services_msg", label: "Pergunta (serviços)", default: "Quais são os principais serviços que vocês oferecem?" },
      { key: "catalog.services_ph", label: "Placeholder (serviços)", default: "Ex.: corte, coloração, manicure" },
    ],
  },
  {
    id: "catalog_falta",
    title: "Catálogo — ajuste",
    kind: "Mensagem",
    fields: [
      { key: "catalog_falta.msg", label: "Mensagem", default: "Sem problema, você ajusta cada item depois no painel." },
    ],
  },
  {
    id: "carro_chefe",
    title: "Carro-chefe",
    kind: "Pergunta",
    fields: [
      { key: "carro_chefe.msg", label: "Pergunta", default: "Qual desses é o carro-chefe?" },
      { key: "carro_chefe.services_msg", label: "Pergunta (serviços)", default: "Qual desses serviços é o destaque?" },
    ],
  },
  {
    id: "instagram",
    title: "Conectar Instagram",
    kind: "Pergunta",
    fields: [
      { key: "instagram.l1", label: "Destaque (com carro-chefe)", default: "Show, vou dar destaque pro {carro_chefe}." },
      { key: "instagram.l1_alt", label: "Destaque (sem carro-chefe)", default: "Show!" },
      { key: "instagram.l2", label: "Convite", default: "Quer conectar seu Instagram pra eu aprender seu jeito de falar? Uso suas DMs e legendas só pra captar o tom.", multiline: true },
      { key: "instagram.l2_found", label: "Instagram encontrado", default: "Achei seu Instagram: @{handle}. Quer que eu conecte? Uso suas legendas e DMs pra aprender seu tom e puxar mais do seu catálogo.", multiline: true },
      { key: "instagram.scanning", label: "Varrendo o site", default: "Deixa eu dar uma olhada no site de vocês pra já adiantar algumas coisas... 🔎" },
      { key: "instagram.found_on_site", label: "Instagram achado no site", default: "Achei o Instagram de vocês no site: {handle} 📸 Já vou conectar pra você." },
      { key: "instagram.opt_sim", label: "Opção: conectar", default: "Conectar Instagram" },
      { key: "instagram.opt_edit", label: "Opção: corrigir @", default: "Corrigir @" },
      { key: "instagram.opt_manual", label: "Opção: informar @", default: "Informar meu @" },
      { key: "instagram.opt_nao", label: "Opção: agora não", default: "Agora não" },
      { key: "instagram.edit_msg", label: "Pedir @", default: "Qual é o @ do seu Instagram?" },
      { key: "instagram.edit_ph", label: "Placeholder @", default: "@seu_perfil" },
    ],
  },
  {
    id: "instagram_connecting",
    title: "Instagram conectado",
    kind: "Mensagem",
    fields: [
      { key: "instagram_connecting.done", label: "Confirmação", default: "Pronto, conectei! 🎉" },
    ],
  },
  {
    id: "ifood",
    title: "Conectar iFood",
    kind: "Pergunta",
    fields: [
      { key: "ifood.l1", label: "Convite", default: "Você vende pelo iFood? Posso conectar pra importar seu cardápio com os preços certos, direto da fonte oficial.", multiline: true },
      { key: "ifood.procurando", label: "Procurando", default: "Deixa eu ver se acho seu negócio no iFood…", multiline: true },
      { key: "ifood.encontrei", label: "Encontrei a loja", default: "Achei esta loja no iFood: {nome}. É a sua?", multiline: true },
      { key: "ifood.opt_sim_minha", label: "Opção: é minha loja", default: "Sim, é a minha loja" },
      { key: "ifood.opt_naoessa", label: "Opção: não é essa", default: "Não é essa" },
      { key: "ifood.nao_achei", label: "Não achei", default: "Não achei seu negócio no iFood automaticamente. Você vende por lá?", multiline: true },
      { key: "ifood.opt_vendo_link", label: "Opção: vendo (tenho link)", default: "Vendo — tenho o link" },
      { key: "ifood.cole_link", label: "Pedir link", default: "Manda o link da sua loja no iFood que eu guardo aqui 🙂", multiline: true },
      { key: "ifood.link_ph", label: "Placeholder link", default: "Cole o link da sua loja no iFood" },
      { key: "ifood.link_invalido", label: "Link inválido", default: "Hmm, esse não parece um link de loja do iFood. Ele começa com ifood.com.br/delivery/… — pode conferir e colar de novo?", multiline: true },
      { key: "ifood.outra_loja", label: "Não é essa loja", default: "Sem problema! Se quiser, me manda o link certo da sua loja no iFood. Se preferir, seguimos sem.", multiline: true },
      { key: "ifood.salvo", label: "Loja salva (importação indisponível)", default: "Anotado! Guardei o link da sua loja no iFood. A importação automática do cardápio fica disponível em breve. 👍", multiline: true },
      { key: "ifood.opt_sim", label: "Opção: conectar", default: "Conectar iFood" },
      { key: "ifood.opt_nao", label: "Opção: não vendo / agora não", default: "Não vendo no iFood" },
      { key: "ifood.indisponivel", label: "Importação indisponível", default: "A importação do cardápio pelo iFood ainda não está ativa por aqui. Por enquanto seguimos sem ela. 👍", multiline: true },
      { key: "ifood.importado", label: "Importado", default: "Pronto! 🎉 Importei {n} itens do seu cardápio direto do iFood, com os preços de lá." },
      { key: "ifood.sem_itens", label: "Sem itens", default: "Achei sua loja no iFood, mas não consegui ler os itens do cardápio agora. Você adiciona depois no painel." },
      { key: "ifood.falha", label: "Falha", default: "Não consegui importar seu cardápio do iFood agora. Sem problema — seguimos e você tenta de novo depois pelo painel." },
    ],
  },
  {
    id: "tone_generated",
    title: "Tom de voz",
    kind: "Pergunta",
    fields: [
      { key: "tone_generated.found", label: "Tom (da pesquisa)", default: "Pela pesquisa que fiz, seu tom me parece {tom} — algo assim:" },
      { key: "tone_generated.default", label: "Tom (padrão)", default: "Analisei suas conversas. Seu tom me parece afetuoso e acolhedor — algo assim:" },
      { key: "tone_generated.found_plain", label: "Tom sem exemplo", default: "Pela pesquisa que fiz, seu tom me parece {tom}." },
      { key: "tone_generated.default_plain", label: "Tom sem exemplo (padrão)", default: "Ainda não consegui captar bem o seu jeito de falar. Quer me ajudar a ajustar?" },
      { key: "tone_generated.ask", label: "Confirmação", default: "Ficou a sua cara?" },
      { key: "tone_generated.opt_sim", label: "Opção: é meu tom", default: "Sim, é meu tom" },
      { key: "tone_generated.opt_ajustar", label: "Opção: ajustar", default: "Quero ajustar" },
      { key: "tone_generated.opt_upload", label: "Opção: enviar conversa", default: "Aprender de uma conversa" },
    ],
  },
  {
    id: "tone_manual",
    title: "Tom manual",
    kind: "Pergunta",
    fields: [
      { key: "tone_manual.msg", label: "Pergunta", default: "Sem problema, me diz: como você quer que eu converse?" },
    ],
  },
  {
    id: "tone_upload",
    title: "Tom por conversa",
    kind: "Pergunta",
    fields: [
      { key: "tone_upload.msg", label: "Pedido", default: "Boa ideia! Me envia uma conversa sua — pode ser a exportação de um chat do WhatsApp (.txt ou PDF) ou um print de conversa do WhatsApp/Instagram. Eu leio e aprendo seu jeito de falar. Você também pode colar alguns trechos aqui.", multiline: true },
      { key: "tone_upload.done", label: "Resultado", default: "Li suas conversas! Seu tom me parece {tom} — vou falar assim:" },
      { key: "tone_upload.fail", label: "Falha", default: "Não consegui captar o tom desse arquivo. Vamos do jeito tradicional então:" },
    ],
  },
  {
    id: "emojis",
    title: "Emojis",
    kind: "Pergunta",
    fields: [
      { key: "emojis.msg", label: "Pergunta", default: "E emojis — uso sempre, às vezes ou nunca?" },
      { key: "emojis.opt_sempre", label: "Opção: sempre", default: "Sempre" },
      { key: "emojis.opt_asvezes", label: "Opção: às vezes", default: "Às vezes" },
      { key: "emojis.opt_nunca", label: "Opção: nunca", default: "Nunca" },
    ],
  },
  {
    id: "configured",
    title: "Configurado",
    kind: "Mensagem",
    fields: [
      { key: "configured.l1", label: "Mensagem 1", default: "Prontinho! Já sei quem você é e como falar." },
      { key: "configured.l2", label: "Mensagem 2", default: "Bora ver o que eu sei fazer?" },
      { key: "configured.cta", label: "Botão", default: "Ver funcionalidades" },
    ],
  },
];

const FLOW_DEFAULTS: Record<string, string> = Object.fromEntries(
  FLOW_NODES.flatMap((n) => n.fields.map((f) => [f.key, f.default])),
);

function makeT(overrides: Record<string, string>) {
  return (key: string, ctx: Record<string, string> = {}) => {
    let s = overrides[key] ?? FLOW_DEFAULTS[key] ?? "";
    for (const [k, v] of Object.entries(ctx)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return s;
  };
}

/* ---------- Ordered, editable step list (drives builder + engine) ---------- */

// Modelo de etapas extraído para ./steps (módulo leve) — ver nota lá.
import { DEFAULT_STEP_IDS, DEFAULT_STEPS, type Step, type StepKind } from "./steps";
export { DEFAULT_STEP_IDS, DEFAULT_STEPS };
export type { Step, StepKind };

function customFieldDefs(id: string, kind: StepKind): FlowField[] {
  if (kind === "message")
    return [{ key: `${id}.l1`, label: "Mensagem do assistente", default: "", multiline: true }];
  if (kind === "input")
    return [
      { key: `${id}.msg`, label: "Pergunta", default: "" },
      { key: `${id}.ph`, label: "Placeholder", default: "" },
    ];
  return [
    { key: `${id}.msg`, label: "Pergunta", default: "" },
    { key: `${id}.opt1`, label: "Opção 1", default: "" },
    { key: `${id}.opt2`, label: "Opção 2", default: "" },
    { key: `${id}.opt3`, label: "Opção 3 (opcional)", default: "" },
  ];
}
function customSeeds(id: string, kind: StepKind): Record<string, string> {
  if (kind === "message") return { [`${id}.l1`]: "Escreva aqui a mensagem do assistente." };
  if (kind === "input")
    return { [`${id}.msg`]: "Qual a sua pergunta?", [`${id}.ph`]: "Digite a resposta…" };
  return {
    [`${id}.msg`]: "Escolha uma opção:",
    [`${id}.opt1`]: "Opção 1",
    [`${id}.opt2`]: "Opção 2",
    [`${id}.opt3`]: "",
  };
}
function customTitle(kind: StepKind): string {
  return kind === "message" ? "Mensagem" : kind === "input" ? "Pergunta" : "Escolha";
}

/* ---------- Small shared UI ---------- */

function Orb({ size = 40 }: { size?: number }) {
  return <div className="orb shrink-0" style={{ width: size, height: size }} aria-hidden />;
}

function PillButton({
  children, onClick, variant = "primary", className = "", disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "accent";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all disabled:opacity-40 disabled:pointer-events-none";
  const styles =
    variant === "primary"
      ? "bg-[#13161D] text-white hover:bg-[#06070A] hover:-translate-y-0.5"
      : variant === "accent"
      ? "bg-[#13161D] text-white hover:brightness-110 hover:-translate-y-0.5"
      : "bg-white text-[#13161D] border border-gray-200 hover:bg-[#F4F5F8]";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

/* ---------- Extra in-chat blocks ---------- */

// Ícone de status compartilhado: gira enquanto a operação roda e vira um
// checkmark verde quando ela termina (done=true).
function StatusSpinner({ done, color = "#13161D" }: { done?: boolean; color?: string }) {
  return done ? (
    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
  ) : (
    <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color }} />
  );
}

function SearchingBlock({ done }: { done?: boolean }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-4 py-4 flex items-center gap-3">
      <StatusSpinner done={done} />
      <div>
        <p className="text-sm font-semibold text-[#13161D]">
          {done ? "Pesquisa concluída" : "Pesquisando na web…"}
        </p>
        <p className="text-xs text-gray-500">
          {done ? "Informações reais do seu negócio." : "Buscando informações reais do seu negócio."}
        </p>
      </div>
    </div>
  );
}

function CatalogBlock({ items }: { items: { name: string; price: string | null }[] }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#13161D]" />
        <span className="text-sm font-semibold text-[#13161D]">Catálogo encontrado</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.name} className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-[#13161D]">{item.name}</span>
            {item.price ? (
              <span className="text-sm font-semibold text-[#13161D] shrink-0">{item.price}</span>
            ) : (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full shrink-0">
                preço a confirmar
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Valida CNPJ: 14 dígitos + dígitos verificadores (mesma regra do backend).
function isValidCnpj(value: string): boolean {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(d[len - i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12], 10) && calc(13) === parseInt(d[13], 10);
}

// Formata 14 dígitos como 00.000.000/0000-00 (mantém o valor original se não tiver 14).
function formatCnpj(value: string): string {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length !== 14) return value || "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function ContactBlock({
  cnpj,
  endereco,
  telefone,
}: {
  cnpj: string;
  endereco: string;
  telefone: string;
}) {
  const rows = [
    { Icon: FileText, label: "CNPJ", value: cnpj ? formatCnpj(cnpj) : "[CNPJ — a confirmar]" },
    { Icon: MapPin, label: "Endereço", value: endereco || "[Endereço — a confirmar]" },
    { Icon: Phone, label: "Telefone", value: telefone || "[Telefone — a confirmar]" },
  ];
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-[#13161D]" />
        <span className="text-sm font-semibold text-[#13161D]">Dados de contato</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.label} className="px-4 py-3 flex items-center gap-3">
            <r.Icon className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{r.label}</p>
              <p className="text-sm text-[#13161D] truncate">{r.value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectingBlock({ done }: { done?: boolean }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-4 py-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#13161D] flex items-center justify-center shrink-0">
        <Instagram className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#13161D]">
          {done ? "Leitura concluída" : "Conectando ao Instagram"}
        </p>
        <p className="text-xs text-gray-500">
          {done ? "Veja o resultado abaixo." : "Lendo DMs e legendas para captar o tom…"}
        </p>
      </div>
      <StatusSpinner done={done} />
    </div>
  );
}

function IFoodConnectingBlock({ done }: { done?: boolean }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-4 py-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#EA1D2C] flex items-center justify-center shrink-0">
        <Store className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#13161D]">
          {done ? "Cardápio importado" : "Importando do iFood"}
        </p>
        <p className="text-xs text-gray-500">
          {done ? "Veja o resultado abaixo." : "Lendo o cardápio da sua loja no iFood…"}
        </p>
      </div>
      <StatusSpinner done={done} color="#EA1D2C" />
    </div>
  );
}

function IFoodSearchingBlock({ done }: { done?: boolean }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-4 py-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#EA1D2C] flex items-center justify-center shrink-0">
        <Store className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#13161D]">
          {done ? "Busca concluída" : "Procurando no iFood"}
        </p>
        <p className="text-xs text-gray-500">
          {done ? "Verificação no iFood finalizada." : "Buscando sua loja na web…"}
        </p>
      </div>
      <StatusSpinner done={done} color="#EA1D2C" />
    </div>
  );
}

// Mostra a loja ENCONTRADA no iFood com o link real para o usuário CONFERIR antes
// de confirmar. A URL nunca é inventada — vem da busca indexada.
function IFoodFoundBlock({ store }: { store: IFoodStore | null }) {
  if (!store) return null;
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#EA1D2C] flex items-center justify-center">
          <Store className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#13161D] truncate">{store.nome}</p>
          <p className="text-xs text-gray-500">Encontrado no iFood</p>
        </div>
      </div>
      <a
        href={store.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#EA1D2C] px-4 py-2 text-sm font-semibold text-[#EA1D2C] hover:bg-[#EA1D2C]/5"
      >
        Conferir no iFood <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}

function ScrapingBlock({ done }: { done?: boolean }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-4 py-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#13161D] flex items-center justify-center shrink-0">
        <Globe className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#13161D]">
          {done ? "Site analisado" : "Lendo seu site"}
        </p>
        <p className="text-xs text-gray-500">
          {done ? "Catálogo, contatos e tom de voz captados." : "Puxando catálogo, contatos e o tom de voz…"}
        </p>
      </div>
      <StatusSpinner done={done} />
    </div>
  );
}

function ReadingChatBlock({ done }: { done?: boolean }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-4 py-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#13161D] flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#13161D]">
          {done ? "Conversas analisadas" : "Lendo suas conversas"}
        </p>
        <p className="text-xs text-gray-500">
          {done ? "Seu jeito de falar foi captado." : "Analisando o jeito de falar para captar o tom…"}
        </p>
      </div>
      <StatusSpinner done={done} />
    </div>
  );
}

function ToneExampleBlock({ tomLabel, exemplo }: { tomLabel?: string; exemplo?: string }) {
  // Exemplo SEMPRE personalizado (vindo do site/Instagram/conversa enviada).
  // Sem voz real captada, não exibimos nada genérico.
  const reply = exemplo?.trim().replace(/^["“”]+|["“”]+$/g, "");
  if (!reply) return null;
  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-[#F4F5F8] p-4 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Exemplo</p>
      {tomLabel ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#13161D] border border-gray-200">
          <Sparkles className="w-3 h-3 text-[#13161D]" /> Tom da pesquisa: {tomLabel}
        </span>
      ) : null}
      <div className="flex justify-start">
        <div className="bg-white rounded-2xl rounded-tl-md px-3 py-2 text-sm text-[#13161D] max-w-[80%] shadow-sm">
          {CLIENT_Q}
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-[#13161D] text-white rounded-2xl rounded-tr-md px-3 py-2 text-sm max-w-[80%]">
          {reply}
        </div>
      </div>
    </div>
  );
}

/* ---------- Mini demos (Etapa 4) ---------- */

function ClientBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="bg-[#F4F5F8] text-[#13161D] rounded-2xl rounded-tl-md px-4 py-2.5 text-sm max-w-[85%]">
        {text}
      </div>
    </div>
  );
}
function OddyBubble({ text, badge }: { text: string; badge?: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-1">
        {badge && (
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#13161D] bg-[#13161D]/10 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" /> {badge}
            </span>
          </div>
        )}
        <div className="bg-[#13161D] text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm">{text}</div>
      </div>
    </div>
  );
}

function DoneStrip({ onDone, label = "Continuar" }: { onDone: () => void; label?: string }) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 mb-3">
        <CheckCircle2 className="w-5 h-5" /> Tudo certo nesta etapa
      </div>
      <PillButton variant="accent" onClick={onDone} className="w-full h-12 text-base">
        {label} <ArrowRight className="w-4 h-4" />
      </PillButton>
    </div>
  );
}

function FeatureDemo({ feature, isLast, onComplete, research }: {
  feature: FeatureId;
  isLast: boolean;
  onComplete: () => void;
  research: Research | null;
}) {
  const doneLabel = isLast ? "Concluir onboarding" : "Continuar";

  // dados reais para o demo do piloto automático (nunca inventar)
  const realHorario = research?.horario?.trim() || "";
  const realEndereco = research?.endereco?.trim() || "";
  const autoQA = realHorario
    ? { q: "Qual o horário de vocês?", a: realHorario }
    : realEndereco
    ? { q: "Onde vocês ficam?", a: realEndereco }
    : null;

  // co-piloto
  const draftA = "Oi! Sobre o valor do bolo de pote, deixa eu confirmar certinho com a equipe e já te passo, tá? Quer que eu veja os sabores disponíveis também?";
  const draftB = "Opa! O bolo de pote a gente confirma o valorzinho com a equipe e te retorna rapidinho. Posso adiantar quais sabores temos?";
  const [coMode, setCoMode] = useState<"review" | "editing" | "sent">("review");
  const [coDraft, setCoDraft] = useState(draftA);
  const [coText, setCoText] = useState(draftA);

  // nota
  const [nota, setNota] = useState("cliente recorrente, caprichar no carinho");
  const [notaAdded, setNotaAdded] = useState(false);

  // tarefa
  const [tarefa, setTarefa] = useState("me lembra de confirmar o pedido da Ana amanhã às 9h");
  const [tarefaAdded, setTarefaAdded] = useState(false);

  // base
  const [base, setBase] = useState("no fim de ano funcionamos até dia 23");
  const [baseAdded, setBaseAdded] = useState(false);

  // automatico
  const [autoOk, setAutoOk] = useState(false);

  // direta
  const [direta, setDireta] = useState("Oi Ana! Seu bolo já está pronto para retirada 😊");
  const [diretaSent, setDiretaSent] = useState(false);

  let body: React.ReactNode = null;

  if (feature === "copiloto") {
    body = (
      <>
        <ClientBubble text="Qual o valor do bolo de pote?" />
        {coMode === "sent" ? (
          <>
            <OddyBubble text={coText} />
            <DoneStrip onDone={onComplete} label={doneLabel} />
          </>
        ) : coMode === "editing" ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Editar rascunho</p>
            <textarea
              value={coText}
              onChange={(e) => setCoText(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#13161D]"
            />
            <PillButton onClick={() => setCoMode("sent")} className="w-full h-12 text-base">
              Enviar <Send className="w-4 h-4" />
            </PillButton>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-dashed border-[#13161D]/40 bg-[#13161D]/5 p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#13161D]">
                Rascunho do assistente — não enviado
              </p>
              <p className="text-sm text-[#13161D]">{coDraft}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PillButton onClick={() => { setCoText(coDraft); setCoMode("sent"); }} className="h-11 px-5">
                <Check className="w-4 h-4" /> Aprovar
              </PillButton>
              <PillButton variant="outline" onClick={() => { setCoText(coDraft); setCoMode("editing"); }} className="h-11 px-5">
                Editar
              </PillButton>
              <PillButton
                variant="outline"
                onClick={() => setCoDraft((d) => (d === draftA ? draftB : draftA))}
                className="h-11 px-5"
              >
                <RefreshCw className="w-4 h-4" /> Refazer
              </PillButton>
            </div>
          </>
        )}
      </>
    );
  } else if (feature === "automatico") {
    body = (
      <>
        {autoQA ? (
          <>
            <ClientBubble text={autoQA.q} />
            <OddyBubble badge="Respondido no automático" text={autoQA.a} />
          </>
        ) : (
          <>
            <ClientBubble text="Qual o horário de vocês?" />
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-3 text-sm text-gray-600">
              Assim que você cadastrar esse dado, eu respondo sozinho — sem precisar te chamar. Não invento informação que ainda não tenho.
            </div>
          </>
        )}
        <div className="rounded-2xl bg-[#F4F5F8] p-3 text-sm text-gray-600">
          Nesse modo eu respondo sozinho o que já sei — sem precisar te chamar.
        </div>
        {autoOk ? (
          <DoneStrip onDone={onComplete} label={doneLabel} />
        ) : (
          <PillButton onClick={() => setAutoOk(true)} className="w-full h-12 text-base">
            Entendi
          </PillButton>
        )}
      </>
    );
  } else if (feature === "nota") {
    body = (
      <>
        <ClientBubble text="Oi, queria encomendar de novo aquele bolo!" />
        {notaAdded ? (
          <>
            <div className="flex justify-center">
              <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">
                  <Lock className="w-3 h-3" /> Nota interna · só a equipe vê
                </div>
                <p className="text-sm text-amber-900">{nota}</p>
              </div>
            </div>
            <DoneStrip onDone={onComplete} label={doneLabel} />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Escreva um recado para a equipe. O cliente não vê essa mensagem.
            </p>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#13161D]"
            />
            <PillButton variant="accent" onClick={() => setNotaAdded(true)} className="w-full h-12 text-base" disabled={!nota.trim()}>
              <StickyNote className="w-4 h-4" /> Adicionar nota interna
            </PillButton>
          </div>
        )}
      </>
    );
  } else if (feature === "tarefa") {
    body = (
      <>
        {tarefaAdded ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tarefas do assistente</p>
            <div className="rounded-2xl border border-gray-200 p-4 flex items-start gap-3">
              <Circle className="w-5 h-5 text-gray-300 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-[#13161D]">{tarefa}</p>
                <span className="inline-block mt-1 text-xs text-[#13161D] bg-[#13161D]/10 px-2 py-0.5 rounded-full">
                  amanhã · 09:00
                </span>
              </div>
            </div>
            <DoneStrip onDone={onComplete} label={doneLabel} />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Delegue uma tarefa ou lembrete para mim.</p>
            <textarea
              value={tarefa}
              onChange={(e) => setTarefa(e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#13161D]"
            />
            <PillButton onClick={() => setTarefaAdded(true)} className="w-full h-12 text-base" disabled={!tarefa.trim()}>
              <ListTodo className="w-4 h-4" /> Criar tarefa
            </PillButton>
          </div>
        )}
      </>
    );
  } else if (feature === "base") {
    body = (
      <>
        {baseAdded ? (
          <>
            <div className="rounded-2xl border border-gray-200 p-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#13161D]" />
              <span className="text-sm text-[#13161D]">{base}</span>
            </div>
            <OddyBubble text="Anotado, vou usar isso quando perguntarem." />
            <DoneStrip onDone={onComplete} label={doneLabel} />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Me ensine uma informação do seu negócio.</p>
            <textarea
              value={base}
              onChange={(e) => setBase(e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#13161D]"
            />
            <PillButton variant="accent" onClick={() => setBaseAdded(true)} className="w-full h-12 text-base" disabled={!base.trim()}>
              <BookOpen className="w-4 h-4" /> Adicionar à base
            </PillButton>
          </div>
        )}
      </>
    );
  } else if (feature === "direta") {
    body = (
      <>
        <ClientBubble text="Oi! Já posso retirar meu pedido?" />
        {diretaSent ? (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] space-y-1">
                <div className="flex justify-end">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Você · sem o assistente
                  </span>
                </div>
                <div className="bg-[#13161D] text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm">{direta}</div>
              </div>
            </div>
            <DoneStrip onDone={onComplete} label={doneLabel} />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Escreva você mesmo. O assistente não responde nessa mensagem.
            </p>
            <textarea
              value={direta}
              onChange={(e) => setDireta(e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#13161D]"
            />
            <PillButton onClick={() => setDiretaSent(true)} className="w-full h-12 text-base" disabled={!direta.trim()}>
              Enviar como você <Send className="w-4 h-4" />
            </PillButton>
          </div>
        )}
      </>
    );
  }

  return <div className="space-y-4">{body}</div>;
}

/* ---------- Slideshow de funcionalidades ---------- */

function FeatureSlideshow({
  research,
  onFinish,
  screenH,
}: {
  research: Research | null;
  onFinish: () => void;
  screenH: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false });
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = (i: number) => emblaApi?.scrollTo(i);
  const next = () => emblaApi?.scrollNext();
  const prev = () => emblaApi?.scrollPrev();

  return (
    <div className={`${screenH} flex flex-col max-w-2xl mx-auto`}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <Orb size={44} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#13161D] leading-tight">O que eu sei fazer</p>
          <p className="text-xs text-gray-500">Deslize para conhecer e escolher</p>
        </div>
        <button onClick={onFinish} className="text-xs font-medium text-gray-400 hover:text-gray-600 shrink-0">
          Pular
        </button>
      </div>

      <div className="px-5 pt-4 flex items-center gap-2 overflow-x-auto">
        {FEATURES.map((f, i) => {
          const Icon = f.Icon;
          return (
            <button
              key={f.id}
              onClick={() => scrollTo(i)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                i === selected
                  ? "bg-[#13161D] text-white border-[#13161D]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {f.name}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        <div className="overflow-hidden h-full" ref={emblaRef}>
          <div className="flex h-full">
            {FEATURES.map((f, i) => {
              const Icon = f.Icon;
              return (
                <div
                  key={f.id}
                  className="shrink-0 grow-0 basis-full min-w-0 h-full overflow-y-auto px-5 py-6 space-y-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#F4F5F8] flex items-center justify-center shrink-0">
                      <Icon className="w-6 h-6 text-[#13161D]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {i + 1} / {FEATURES.length}
                      </p>
                      <h2 className="text-xl font-bold tracking-tight text-[#13161D]">{f.name}</h2>
                      <p className="text-sm text-gray-500">{f.desc}</p>
                    </div>
                  </div>

                  <FeatureDemo
                    feature={f.id}
                    research={research}
                    isLast={i === FEATURES.length - 1}
                    onComplete={() => {
                      if (i < FEATURES.length - 1) next();
                      else onFinish();
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
        <button
          onClick={prev}
          disabled={!canPrev}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 disabled:opacity-30 hover:text-[#13161D]"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <div className="flex items-center gap-1.5">
          {FEATURES.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === selected ? "w-6 bg-[#13161D]" : "w-1.5 bg-gray-300"}`}
            />
          ))}
        </div>
        {canNext ? (
          <button onClick={next} className="inline-flex items-center gap-1 text-sm font-medium text-[#13161D] hover:opacity-70">
            Próximo <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <PillButton onClick={onFinish} className="h-10 px-5 text-sm">
            Concluir <Check className="w-4 h-4" />
          </PillButton>
        )}
      </div>
    </div>
  );
}

/* ---------- Preview (runs the flow) ---------- */

export function OnboardingPreview({
  overrides = {},
  steps = DEFAULT_STEPS,
  embedded = false,
  bizType = "alimentacao",
}: {
  overrides?: Record<string, string>;
  steps?: Step[];
  embedded?: boolean;
  bizType?: BizType;
}) {
  const tx = makeT(overrides);
  const stepMap = React.useMemo(
    () => Object.fromEntries(steps.map((s) => [s.id, s])) as Record<string, Step>,
    [steps],
  );
  const screenH = embedded ? "h-full" : "h-screen";
  const minScreenH = embedded ? "min-h-full" : "min-h-screen";
  const [phase, setPhase] = useState<Phase>("intro");
  const [name, setName] = useState("Marina");
  const [businessName, setBusinessName] = useState("");

  const [node, setNode] = useState<string>(steps[0]?.id ?? "welcome");
  const [runKey, setRunKey] = useState(0);
  const [chat, setChat] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const [carroChefe, setCarroChefe] = useState("");
  const [tone, setTone] = useState("");
  const [emoji, setEmoji] = useState("");
  const [research, setResearch] = useState<Research | null>(null);
  const [site, setSite] = useState("");
  const [igHandle, setIgHandle] = useState("");
  const [setor, setSetor] = useState("");
  const [city, setCity] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [placeAddr, setPlaceAddr] = useState("");
  const [placeHorario, setPlaceHorario] = useState("");
  const [placeTelefone, setPlaceTelefone] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceCandidate[]>([]);
  const [cnpjData, setCnpjData] = useState<CnpjData | null>(null);
  const [igData, setIgData] = useState<IgData | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  // Loja detectada no iFood por busca, confirmada pelo usuário (ou colada pelo
  // próprio usuário como link). O ref espelha o estado para leitura síncrona
  // dentro do motor do fluxo (evita valor obsoleto).
  const [ifoodFound, setIfoodFound] = useState<IFoodStore | null>(null);
  const ifoodFoundRef = useRef<IFoodStore | null>(null);
  const ifoodCatalogRef = useRef<CatalogItem[] | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [askDraft, setAskDraft] = useState(""); // "pergunte qualquer coisa" nos passos de botões
  const [toneDraft, setToneDraft] = useState("");
  const [toneFileBusy, setToneFileBusy] = useState(false);
  const [toneErr, setToneErr] = useState("");
  const toneFileInputRef = useRef<HTMLInputElement>(null);
  const toneTextRef = useRef("");
  // incrementado ao sair do passo de upload (Voltar/reset); leituras de
  // arquivo em andamento checam este token e abortam se ele mudou.
  const toneRunRef = useRef(0);
  // incrementado em cada reset/restart/jump do fluxo; a normalização assíncrona
  // da cidade checa este token e descarta conclusões obsoletas de runs antigos.
  const flowRunRef = useRef(0);

  // dev forced decisions
  const [forceIg, setForceIg] = useState<"ask" | "conectar" | "nao">("ask");
  const [forceTone, setForceTone] = useState<"ask" | "sim" | "nao">("ask");

  const [devOpen, setDevOpen] = useState(false);

  const idRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const businessNameRef = useRef(businessName);
  businessNameRef.current = businessName;
  const siteRef = useRef(site);
  siteRef.current = site;
  const igHandleRef = useRef(igHandle);
  igHandleRef.current = igHandle;
  const setorRef = useRef(setor);
  setorRef.current = setor;
  const cityRef = useRef(city);
  cityRef.current = city;
  const bizTypeRef = useRef(bizType);
  bizTypeRef.current = bizType;
  const researchPromiseRef = useRef<Promise<Research | null> | null>(null);
  // normalização do que o usuário digitou (nome/cidade): capitalização, acentos
  // e abreviações de cidade (sp/sampa → São Paulo). Só arruma o texto; não inventa.
  const normalizePromiseRef = useRef<Promise<{ business: string; city: string }> | null>(null);
  const placePromiseRef = useRef<Promise<PlaceCandidate[]> | null>(null);
  const cnpjPromiseRef = useRef<Promise<CnpjData | null> | null>(null);
  const manualCnpjRef = useRef(false);
  const igPromiseRef = useRef<Promise<IgData | null> | null>(null);
  const catalogPromiseRef = useRef<Promise<CatalogItem[]> | null>(null);
  // varredura robusta do site confirmado (catálogo + tom + @ do Instagram)
  const siteScrapePromiseRef = useRef<Promise<SiteScrape | null> | null>(null);
  const siteScrapeRef = useRef<SiteScrape | null>(null);
  // marca quando o @ do Instagram veio do próprio site (auto-conecta sem perguntar)
  const igFromSiteRef = useRef(false);
  // garante que o scraping unificado (site + Instagram) só dispare uma vez
  const scrapeFiredRef = useRef(false);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const advanceFrom = useCallback((fromId: string) => {
    const list = stepsRef.current;
    const i = list.findIndex((s) => s.id === fromId);
    const next = i >= 0 ? list[i + 1] : undefined;
    setPending(null);
    if (!next) {
      setTyping(false);
      setPhase("done");
      return;
    }
    if (next.id === "features") {
      setTyping(false);
      setPhase("tour");
      return;
    }
    setNode(next.id);
  }, []);

  const addUser = (text: string) =>
    setChat((c) => [...c, { id: idRef.current++, sender: "user", kind: "text", text }]);
  const addOddy = (text: string) =>
    setChat((c) => [...c, { id: idRef.current++, sender: "oddy", kind: "text", text }]);

  // trata respostas negativas ("não temos", "sem site"…) como vazio
  const cleanField = (v: string) =>
    /^(n[aã]o\b|nao\b|sem\b|nenhum|n\/a|-+$|—+$)/i.test(v.trim()) ? "" : v.trim();

  // Normaliza o que o usuário DIGITOU (nome do negócio e/ou cidade): conserta
  // capitalização, acentos e expande abreviações/apelidos de cidade. Nunca
  // inventa — em caso de falha, devolve o texto original.
  const normalizeIdentity = async (
    payload: { business?: string; city?: string },
  ): Promise<{ business: string; city: string }> => {
    const business = (payload.business || "").trim();
    const city = (payload.city || "").trim();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, city }),
        signal: ctrl.signal,
      });
      const json = await r.json();
      if (!r.ok || json.error) return { business, city };
      return {
        business: String(json.business || "").trim() || business,
        city: String(json.city || "").trim() || city,
      };
    } catch {
      return { business, city };
    } finally {
      clearTimeout(timer);
    }
  };

  // ── "Pergunte qualquer coisa" no meio do fluxo ────────────────────────────
  // O lojista pode virar no meio do onboarding e perguntar algo geral (ex.:
  // "qual a capital do Brasil?"). Detectamos perguntas paralelas, respondemos
  // via /api/ask e voltamos a fazer a pergunta atual — sem perder o lugar.
  const looksLikeSideQuestion = (v: string): boolean => {
    const t = v.trim().toLowerCase();
    if (t.length < 3) return false;
    if (t.endsWith("?")) return true;
    return /^(o que|oq|qual|quais|quanto|quantos|quantas|quem|onde|aonde|quando|como|por que|por quê|porque|porquê|pra que|para que|cad[êe]|me (diz|explica|fala)|voc[êe] sabe|sabe me dizer)\b/.test(
      t,
    );
  };

  const askAssistant = async (question: string): Promise<string> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      // /api/normalize responde também ao modo "pergunta paralela" quando o
      // corpo traz `question` (consolidado lá p/ caber no limite de 12 funções
      // Serverless do plano Hobby da Vercel).
      const r = await fetch(`${import.meta.env.BASE_URL}api/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, business: businessNameRef.current.trim() }),
        signal: ctrl.signal,
      });
      const json = await r.json();
      return (json && typeof json.answer === "string" ? json.answer.trim() : "") || "";
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  };

  // Responde a pergunta paralela e re-exibe a pergunta atual. NÃO consome o
  // campo (o `pending` continua o mesmo), então o input segue aberto pra
  // resposta real depois.
  const answerSideQuestion = async (q: string) => {
    // captura a última fala do assistente (a pergunta atual) p/ re-perguntar.
    const lastQuestion = [...chat].reverse().find(
      (m) => m.sender === "oddy" && m.kind === "text",
    )?.text;
    addUser(q);
    setTextDraft("");
    setTyping(true);
    const reply = await askAssistant(q);
    setTyping(false);
    addOddy(reply || "Não consegui responder isso agora, mas seguimos! 🙂");
    if (lastQuestion) {
      await new Promise((r) => setTimeout(r, 450));
      addOddy(lastQuestion);
    }
  };

  // "Pergunte qualquer coisa" nos passos de BOTÕES (choice/carroChefe/destaque/
  // placePick/finish): o usuário digita uma dúvida na caixinha; respondemos e os
  // botões continuam ali (não mexemos no `pending`), então ele escolhe depois.
  const submitAsk = async () => {
    const q = askDraft.trim();
    if (!q) return;
    setAskDraft("");
    await answerSideQuestion(q);
  };

  const fetchPlaces = async (
    business: string,
    city: string,
  ): Promise<PlaceCandidate[]> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/places`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, city }),
      });
      const json = await r.json();
      if (!r.ok || json.error || !Array.isArray(json.candidatos)) return [];
      return json.candidatos
        .map((c: { nome?: string; endereco?: string; cidade?: string; categoria?: string; horario?: string; telefone?: string; site?: string }, i: number) => ({
          id: `u${i + 1}`,
          nome: String(c?.nome || business).trim() || business,
          endereco: String(c?.endereco || "").trim(),
          cidade: String(c?.cidade || "").trim(),
          categoria: String(c?.categoria || "").trim(),
          horario: String(c?.horario || "").trim(),
          telefone: String(c?.telefone || "").trim(),
          site: String(c?.site || "").trim(),
        }))
        .filter((c: PlaceCandidate) => c.endereco);
    } catch {
      return [];
    }
  };

  // Consulta direta por um número de CNPJ (usada quando a pessoa corrige o CNPJ
  // manualmente no card de contato) — a API puxa os dados atualizados de novo.
  const fetchCnpj = async (cnpjStr: string): Promise<CnpjData | null> => {
    const digits = cnpjStr.replace(/\D/g, "");
    // Teto de tempo no cliente: a reconsulta manual aguarda esta chamada direto
    // em confirm_contact; sem isto, uma API pendurada congela o fluxo (o "travou").
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/cnpj`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: digits }),
        signal: ctrl.signal,
      });
      const json = await r.json();
      if (!r.ok || json.error || !json.encontrado) return null;
      return {
        encontrado: true,
        cnpj: digits,
        cidade: String(json.cidade || ""),
        razaoSocial: String(json.razaoSocial || ""),
        nomeFantasia: String(json.nomeFantasia || ""),
        endereco: String(json.endereco || ""),
        telefone: String(json.telefone || ""),
        email: String(json.email || ""),
        situacao: String(json.situacao || ""),
        atividade: String(json.atividade || ""),
        horario: "",
        site: "",
        instagram: "",
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // Descoberta automática do CNPJ (sem pedir ao usuário): o backend usa o
  // Perplexity Sonar para achar o CNPJ oficial, valida os dígitos e puxa os
  // dados cadastrais reais na Receita. Cruzamos esses dados com o resultado do
  // /api/places para preencher endereço/telefone. Nunca inventa.
  const fetchCnpjLookup = async (
    business: string,
    city: string,
  ): Promise<CnpjData | null> => {
    // Teto de tempo no cliente: o backend agora repete a busca web em falhas
    // transitórias, então damos uma folga (45s) mas nunca deixamos o fluxo travar.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/cnpj-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, city }),
        signal: ctrl.signal,
      });
      const json = await r.json();
      if (!r.ok || json.error) return null;
      const encontrado = Boolean(json.encontrado);
      const site = String(json.site || "");
      const instagram = String(json.instagram || "");
      const horario = String(json.horario || "");
      const telefone = String(json.telefone || "");
      // Mesmo sem CNPJ confirmado, aproveitamos telefone/site/Instagram/horário
      // deduzidos pela pesquisa. Só descartamos se não veio nada de útil.
      if (!encontrado && !site && !instagram && !horario && !telefone) return null;
      return {
        encontrado,
        cnpj: String(json.cnpj || ""),
        cidade: String(json.cidade || ""),
        razaoSocial: String(json.razaoSocial || ""),
        nomeFantasia: String(json.nomeFantasia || ""),
        endereco: String(json.endereco || ""),
        telefone: String(json.telefone || ""),
        email: String(json.email || ""),
        situacao: String(json.situacao || ""),
        atividade: String(json.atividade || ""),
        horario: String(json.horario || ""),
        site: String(json.site || ""),
        instagram: String(json.instagram || ""),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchInstagram = async (username: string): Promise<IgData | null> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = await r.json();
      if (!r.ok || json.error || !json.encontrado) return null;
      return {
        encontrado: true,
        username: String(json.username || ""),
        nome: String(json.nome || ""),
        bio: String(json.bio || ""),
        seguidores: Number(json.seguidores || 0),
        seguindo: Number(json.seguindo || 0),
        link: String(json.link || ""),
        fotoPerfil: String(json.fotoPerfil || ""),
        ehComercial: Boolean(json.ehComercial),
      };
    } catch {
      return null;
    }
  };

  // Importa o cardápio da loja a partir do LINK público do iFood: o backend
  // extrai o store_id (UUID) do link e lê o cardápio real via Apify. Sem token
  // do Apify retorna { configured:false }. Nunca inventa itens/preços — só
  // repassa o que o ator retornar.
  const scrapeIfoodCatalog = async (
    store: IFoodStore | null,
  ): Promise<IFoodImportResult | { configured: false } | null> => {
    if (!store) return null;
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/ifood/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id || "", url: store.url || "" }),
      });
      const json = await r.json();
      if (json && json.configured === false) return { configured: false };
      if (!r.ok || json.error || !json.connected) return null;
      const produtos: CatalogItem[] = Array.isArray(json.produtos)
        ? json.produtos
            .map((p: Record<string, unknown>) => ({
              nome: String(p?.nome || "").trim(),
              preco: String(p?.preco || "").trim(),
            }))
            .filter((p: CatalogItem) => p.nome)
        : [];
      return {
        connected: true,
        produtos,
        store: json.store
          ? { id: String(json.store.id || ""), name: String(json.store.name || "") }
          : undefined,
      };
    } catch {
      return null;
    }
  };

  // Detecta a loja do negócio no iFood por BUSCA na web (o backend NÃO raspa o
  // iFood). Retorna a loja só quando a busca trouxe uma URL real — nunca inventa.
  const detectIfood = async (): Promise<IFoodStore | null> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/ifood/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessNameRef.current, city: cityRef.current }),
      });
      const json = await r.json();
      if (!r.ok || json.error || !json.found || !json.loja) return null;
      const nome = String(json.loja.nome || "").trim();
      const url = String(json.loja.url || "").trim();
      if (!url) return null;
      return {
        nome: nome || "Loja no iFood",
        url,
        id: json.loja.id ? String(json.loja.id) : undefined,
      };
    } catch {
      return null;
    }
  };

  // Analisa o TOM DE VOZ a partir de trechos de conversas reais (WhatsApp/PDF
  // ou texto colado). O backend só descreve o jeito de falar — nunca inventa
  // dados do negócio (preços, telefones etc.).
  const analyzeToneFromText = async (
    text: string,
  ): Promise<{ tom: string; exemplo: string } | null> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/tone-from-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await r.json();
      if (!r.ok || json.error) return null;
      const tom = String(json.tom || "").trim();
      if (!tom) return null;
      return { tom, exemplo: String(json.exemplo || "").trim() };
    } catch {
      return null;
    }
  };

  // Remove ruído típico de exportação do WhatsApp (avisos de criptografia,
  // mídias omitidas) sem descaracterizar o jeito de escrever.
  const cleanChatText = (raw: string): string =>
    raw
      .split(/\r?\n/)
      .filter(
        (l) =>
          !/mensagens e liga|end-to-end|criptografad|m[ií]dia ocult|media omitted|figurinha omitida|imagem ocultada|[aá]udio ocultado|v[ií]deo omitido|gif omitido|sticker omitido/i.test(
            l,
          ),
      )
      .join("\n")
      .trim();

  // Extrai texto de um PDF no próprio navegador (pdfjs).
  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjs = await import("pdfjs-dist");
    // worker servido pela própria build do Vite
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
      workerUrl;
    const buf = await file.arrayBuffer();
    const doc = await (pdfjs as unknown as {
      getDocument: (a: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> }> };
    }).getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out +=
        content.items
          .map((it) => (it && typeof it === "object" && "str" in it ? String((it as { str: unknown }).str) : ""))
          .join(" ") + "\n";
    }
    return out.trim();
  };

  // OCR de um print de conversa (WhatsApp/Instagram): converte a imagem em data
  // URL e pede ao backend (/api/ocr) o texto visível. Nunca inventa — devolve
  // string vazia se não houver texto ou se a chamada falhar.
  const extractImageText = async (file: File): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await r.json();
      if (!r.ok || json.error) return "";
      return String(json.text || "").trim();
    } catch {
      return "";
    }
  };

  // Busca o catálogo real: SÓ scraping do site/link da bio (scrapingdog) no
  // backend, seguindo o link de cardápio do Linktree; nunca inventa preços.
  const fetchCatalog = async (
    business: string,
    opts: { city?: string; site?: string; instagram?: string; bio?: string } = {}
  ): Promise<CatalogItem[]> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business,
          city: opts.city || "",
          site: opts.site || "",
          instagram: opts.instagram || "",
          bio: opts.bio || "",
        }),
      });
      const json = await r.json();
      if (!r.ok || json.error || !Array.isArray(json.produtos)) return [];
      return json.produtos
        .map((p: { nome?: string; preco?: string }) => ({
          nome: String(p?.nome || ""),
          preco: String(p?.preco || ""),
        }))
        .filter((p: CatalogItem) => p.nome);
    } catch {
      return [];
    }
  };

  const doResearch = async (
    business: string,
    opts: { site?: string; instagram?: string; setor?: string } = {}
  ): Promise<Research | null> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business,
          site: opts.site || "",
          instagram: opts.instagram || "",
          setor: opts.setor || "",
        }),
      });
      const json = await r.json();
      if (!r.ok || json.error) return null;
      return {
        resumo: json.resumo || "",
        website: json.website || "",
        produtos: Array.isArray(json.produtos)
          ? json.produtos.map((p: { nome?: string; preco?: string }) => ({
              nome: String(p?.nome || ""),
              preco: String(p?.preco || ""),
            }))
          : [],
        tom: json.tom || "",
        exemplo: json.exemplo || "",
        horario: json.horario || "",
        telefone: json.telefone || "",
        endereco: json.endereco || "",
        citations: Array.isArray(json.citations) ? json.citations : [],
      };
    } catch {
      return null;
    }
  };

  // Varredura robusta do site CONFIRMADO: o backend faz o scraping (scrapingdog)
  // e extrai o máximo de infos reais com um modelo forte, além de tentar achar
  // o @ do Instagram no próprio site. Nunca inventa nada.
  const fetchSiteScrape = async (
    site: string,
    business: string,
  ): Promise<SiteScrape | null> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/site-scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, business }),
      });
      const json = await r.json();
      if (!r.ok || json.error) return null;
      return {
        resumo: String(json.resumo || ""),
        produtos: Array.isArray(json.produtos)
          ? json.produtos
              .map((p: { nome?: string; preco?: string }) => ({
                nome: String(p?.nome || ""),
                preco: String(p?.preco || ""),
              }))
              .filter((p: CatalogItem) => p.nome)
          : [],
        tom: String(json.tom || ""),
        exemplo: String(json.exemplo || ""),
        instagram: String(json.instagram || ""),
        telefone: String(json.telefone || ""),
        endereco: String(json.endereco || ""),
        horario: String(json.horario || ""),
      };
    } catch {
      return null;
    }
  };

  // Dispara a varredura robusta do site assim que o usuário CONFIRMA/informa o
  // link. O resultado (catálogo + tom + @ do Instagram) é consumido depois, no
  // passo do Instagram (auto-conexão) e no `catalog` (fireScrapes).
  const fireSiteScrape = () => {
    const url = cleanField(siteRef.current || "");
    const biz = businessNameRef.current.trim();
    siteScrapeRef.current = null;
    igFromSiteRef.current = false;
    siteScrapePromiseRef.current = url && biz ? fetchSiteScrape(url, biz) : null;
  };

  const fireScrapes = () => {
    if (scrapeFiredRef.current) return;
    scrapeFiredRef.current = true;
    const biz = businessNameRef.current.trim();
    if (!biz) { catalogPromiseRef.current = null; researchPromiseRef.current = null; return; }
    const igh = cleanField(igHandleRef.current || "");
    const siteUrl = cleanField(siteRef.current);
    const sc = siteScrapeRef.current;
    // Pesquisa/tom: prefere a varredura do site; cai pro Sonar se veio vazia.
    researchPromiseRef.current = sc && sc.tom
      ? Promise.resolve<Research>({
          resumo: sc.resumo,
          website: siteUrl,
          produtos: sc.produtos,
          tom: sc.tom,
          exemplo: sc.exemplo,
          horario: sc.horario,
          telefone: sc.telefone,
          endereco: sc.endereco,
          citations: [],
        })
      : doResearch(biz, { site: siteUrl, instagram: igh, setor: setorRef.current });
    // Catálogo: prefere os produtos da varredura; senão raspa via /api/catalog.
    if (bizTypeRef.current === "servicos") {
      catalogPromiseRef.current = null;
    } else if (ifoodCatalogRef.current && ifoodCatalogRef.current.length) {
      // catálogo oficial do iFood tem prioridade sobre o scraping
      catalogPromiseRef.current = Promise.resolve(ifoodCatalogRef.current);
    } else if (sc && sc.produtos.length) {
      catalogPromiseRef.current = Promise.resolve(sc.produtos);
    } else {
      // sem site confirmado, usa o link da bio do Instagram como fonte do catálogo
      const url = siteUrl || cleanField(igData?.link || "");
      catalogPromiseRef.current = fetchCatalog(biz, { city: cityRef.current, site: url, instagram: igh, bio: igData?.bio || "" });
    }
  };

  /* conversation engine */
  useEffect(() => {
    if (phase !== "chat") return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((res) => { timers.push(setTimeout(res, ms)); });
    const push = (m: Omit<Msg, "id">) =>
      setChat((c) => [...c, { ...m, id: idRef.current++ }]);

    const say = async (text: string) => {
      setTyping(true);
      await wait(650);
      if (cancelled) return;
      setTyping(false);
      push({ sender: "oddy", kind: "text", text });
      await wait(320);
    };
    // Empurra um bloco de status (girando) e devolve o id da mensagem para que,
    // ao terminar a operação, possamos trocar o spinner por um checkmark verde.
    const extra = async (e: Msg["extra"]): Promise<number> => {
      const id = idRef.current++;
      setChat((c) => [...c, { sender: "oddy", kind: "extra", extra: e, id }]);
      await wait(420);
      return id;
    };
    // Marca um bloco de status como concluído (spinner → checkmark).
    const markExtraDone = (id: number) =>
      setChat((c) => c.map((m) => (m.id === id ? { ...m, done: true } : m)));
    const decide = (
      force: string,
      mapNao: Record<string, string> | null,
      options: Choice[]
    ) => {
      if (cancelled) return;
      if (force === "ask") {
        setPending({ kind: "choice", options });
        return;
      }
      let target = force;
      if (mapNao && mapNao[force]) target = mapNao[force];
      const opt = options.find((o) => o.value === target) || options[0];
      (async () => {
        await wait(550);
        if (cancelled) return;
        addUser(opt.label);
        opt.set?.();
        if (opt.next === "__advance__") advanceFrom(node);
        else setNode(opt.next);
      })();
    };

    const stepNow = stepMap[node];
    const ctx = (): Record<string, string> => ({
      nome: name,
      negocio: businessNameRef.current.trim(),
      cidade: cityRef.current.trim(),
      carro_chefe: carroChefe,
      tom: research?.tom?.trim() || "",
    });

    async function run() {
      setPending(null);
      if (stepNow && stepNow.kind !== "builtin") {
        if (stepNow.kind === "message") {
          await say(tx(`${stepNow.id}.l1`, ctx()) || "…");
          await wait(450);
          if (!cancelled) advanceFrom(stepNow.id);
        } else if (stepNow.kind === "input") {
          await say(tx(`${stepNow.id}.msg`, ctx()));
          if (!cancelled)
            setPending({
              kind: "textInput",
              field: "custom",
              placeholder: tx(`${stepNow.id}.ph`, ctx()),
            });
        } else if (stepNow.kind === "choice") {
          await say(tx(`${stepNow.id}.msg`, ctx()));
          const opts: Choice[] = [1, 2, 3]
            .map((i) => tx(`${stepNow.id}.opt${i}`, ctx()))
            .filter((l) => l.trim())
            .map((label, idx) => ({ label, value: `o${idx}`, next: "__advance__" }));
          if (!cancelled)
            setPending({
              kind: "choice",
              options: opts.length
                ? opts
                : [{ label: "Continuar", value: "o0", next: "__advance__" }],
            });
        }
        return;
      }
      switch (node) {
        case "welcome":
          await say(tx("welcome.l1", { nome: name }));
          await say(tx("welcome.l2"));
          await say(tx("welcome.l3"));
          await say(tx("welcome.ask"));
          if (!cancelled)
            setPending({ kind: "textInput", field: "businessName", placeholder: tx("welcome.ph") });
          break;
        case "ask_city":
          // aplica o nome do negócio já normalizado (capitalização/acentos) antes
          // de perguntar a cidade, para a Oddy usar a versão corrigida.
          if (normalizePromiseRef.current) {
            const n = await normalizePromiseRef.current;
            normalizePromiseRef.current = null;
            if (!cancelled && n.business) {
              setBusinessName(n.business);
              businessNameRef.current = n.business;
            }
          }
          if (cancelled) break;
          await say(tx("ask_city.msg", ctx()));
          if (!cancelled)
            setPending({ kind: "textInput", field: "city", placeholder: tx("ask_city.ph") });
          break;
        case "place_pick": {
          // a busca do Google Places foi disparada em segundo plano ao informar
          // a cidade. Mostramos o indicador de "procurando" enquanto aguardamos.
          await say(tx("place_pick.searching", ctx()));
          const placeBlock = await extra("searching");
          const pre = placePromiseRef.current;
          const found = await (pre
            ?? fetchPlaces(businessNameRef.current.trim(), cityRef.current.trim()));
          if (cancelled) return;
          markExtraDone(placeBlock);
          setPlaceResults(found);
          if (found.length === 0) {
            await say(tx("place_pick.notfound"));
            await wait(450);
            if (!cancelled) advanceFrom("place_pick");
            break;
          }
          await say(tx("place_pick.found"));
          if (found.length > 1) await say(tx("place_pick.multi"));
          if (!cancelled) setPending({ kind: "placePick" });
          break;
        }
        case "confirm_contact": {
          // resolve a descoberta de CNPJ disparada em 2º plano (na cidade) ou a
          // reconsulta após correção manual — e cruza com os dados do Perplexity.
          if (cnpjPromiseRef.current) {
            const c = await cnpjPromiseRef.current;
            if (cancelled) return;
            if (c) {
              setCnpjData(c);
              // deduz setor (CNAE), site e Instagram a partir da descoberta —
              // sem perguntar. Nunca sobrescreve algo que o usuário já informou.
              if (!manualCnpjRef.current) {
                if (c.atividade && !setorRef.current) {
                  setSetor(c.atividade); setorRef.current = c.atividade;
                }
                const dSite = cleanField(c.site || "");
                if (dSite && !siteRef.current) {
                  setSite(c.site); siteRef.current = c.site;
                }
                const dIg = cleanField(c.instagram || "");
                if (dIg && !igHandleRef.current) {
                  setIgHandle(c.instagram); igHandleRef.current = c.instagram;
                }
              }
              // só na correção manual e SÓ se a reconsulta deu certo: limpa os
              // dados do Perplexity para a Receita (CNPJ corrigido) prevalecer.
              if (manualCnpjRef.current) { setPlaceAddr(""); setPlaceTelefone(""); }
            } else if (manualCnpjRef.current) {
              // falhou: mantém os dados anteriores (Perplexity + CNPJ antigo).
              await say(tx("contact_adjust.notfound"));
            }
            cnpjPromiseRef.current = null;
            manualCnpjRef.current = false;
          }
          await say(tx("confirm_contact.msg"));
          await extra("contact");
          if (!cancelled)
            setPending({
              kind: "choice",
              options: [
                { label: tx("confirm_contact.opt_sim"), value: "sim", next: "__advance__" },
                { label: tx("confirm_contact.opt_ajustar"), value: "ajustar", next: "contact_adjust" },
              ],
            });
          break;
        }
        case "contact_adjust":
          await say(tx("contact_adjust.msg"));
          if (!cancelled)
            setPending({ kind: "textInput", field: "cnpj", placeholder: tx("contact_adjust.ph") });
          break;
        case "confirm_site": {
          const s = cleanField(siteRef.current || "");
          if (s) {
            await say(tx("confirm_site.found", { negocio: businessNameRef.current.trim(), site: s }));
            await say(tx("confirm_site.confirm"));
            if (!cancelled)
              setPending({
                kind: "choice",
                options: [
                  { label: tx("confirm_site.opt_sim"), value: "sim", next: "site_scraping", set: () => fireSiteScrape() },
                  { label: tx("confirm_site.opt_edit"), value: "edit", next: "confirm_site_edit" },
                  {
                    label: tx("confirm_site.opt_none"),
                    value: "none",
                    next: "__advance__",
                    set: () => { setSite(""); siteRef.current = ""; },
                  },
                ],
              });
          } else {
            await say(tx("confirm_site.ask"));
            if (!cancelled)
              setPending({ kind: "textInput", field: "site", placeholder: tx("confirm_site.ph") });
          }
          break;
        }
        case "confirm_site_edit":
          await say(tx("confirm_site.edit_msg"));
          if (!cancelled)
            setPending({ kind: "textInput", field: "site", placeholder: tx("confirm_site.ph") });
          break;
        case "site_scraping": {
          // a varredura do site já foi disparada (fireSiteScrape); aqui só damos
          // o feedback visível de que estamos lendo o site antes de seguir.
          await say(tx("site_scraping.msg", { negocio: businessNameRef.current.trim() }));
          const scrapeBlock = await extra("scraping");
          // espera a varredura real do site terminar (não um tempo fixo), para o
          // checkmark só aparecer quando os dados realmente chegaram — mas com um
          // teto de tempo para nunca travar o fluxo se o backend não responder.
          if (siteScrapePromiseRef.current) {
            await Promise.race([
              siteScrapePromiseRef.current.catch(() => null),
              wait(25000),
            ]);
          } else {
            await wait(1100);
          }
          if (cancelled) return;
          markExtraDone(scrapeBlock);
          await wait(400);
          if (!cancelled) advanceFrom("confirm_site");
          break;
        }
        case "catalog": {
          // scraping unificado dispara AGORA: site confirmado + Instagram já lido
          fireScrapes();
          if (bizTypeRef.current === "servicos") {
            await say(tx("catalog.services_msg", ctx()));
            if (!cancelled)
              setPending({ kind: "textInput", field: "services", placeholder: tx("catalog.services_ph") });
            break;
          }
          await say(tx("catalog.searching", ctx()));
          const catalogBlock = await extra("searching");
          const foundCatalog = catalogPromiseRef.current ? await catalogPromiseRef.current : [];
          if (cancelled) return;
          markExtraDone(catalogBlock);
          if (foundCatalog.length) setCatalogItems(foundCatalog);
          await wait(550);
          if (cancelled) return;
          await say(foundCatalog.length ? tx("catalog.found") : tx("catalog.example"));
          await extra("catalog");
          if (!cancelled)
            setPending({
              kind: "choice",
              options: [
                { label: tx("catalog.opt_sim"), value: "sim", next: "__advance__" },
                { label: tx("catalog.opt_falta"), value: "falta", next: "catalog_falta" },
              ],
            });
          break;
        }
        case "catalog_falta":
          await say(tx("catalog_falta.msg"));
          await wait(450);
          if (!cancelled) advanceFrom("catalog");
          break;
        case "carro_chefe":
          await say(bizTypeRef.current === "servicos" ? tx("carro_chefe.services_msg") : tx("carro_chefe.msg"));
          if (!cancelled)
            setPending({ kind: bizTypeRef.current === "servicos" ? "destaque" : "carroChefe" });
          break;
        case "instagram": {
          // Aguarda a varredura do site (pode trazer o @ do Instagram).
          if (siteScrapePromiseRef.current && !siteScrapeRef.current) {
            await say(tx("instagram.scanning"));
            const sc = await siteScrapePromiseRef.current;
            if (cancelled) return;
            siteScrapeRef.current = sc;
            // @ achado no próprio site → conecta sem perguntar, mesmo que já
            // tivéssemos um @ vindo do CNPJ (o site corrobora a descoberta).
            if (sc?.instagram) {
              if (!cleanField(igHandleRef.current)) {
                setIgHandle(sc.instagram); igHandleRef.current = sc.instagram;
              }
              igFromSiteRef.current = true;
            }
          }
          const igh = cleanField(igHandleRef.current || "");
          // @ achado no PRÓPRIO site → conecta sem perguntar.
          if (igFromSiteRef.current && igh) {
            await say(carroChefe ? tx("instagram.l1", { carro_chefe: carroChefe }) : tx("instagram.l1_alt"));
            await say(tx("instagram.found_on_site", { handle: igh }));
            igPromiseRef.current = fetchInstagram(igh);
            if (!cancelled) setNode("instagram_connecting");
            break;
          }
          await say(carroChefe ? tx("instagram.l1", { carro_chefe: carroChefe }) : tx("instagram.l1_alt"));
          if (igh) {
            await say(tx("instagram.l2_found", { handle: igh }));
            decide(forceIg, null, [
              {
                label: tx("instagram.opt_sim"),
                value: "conectar",
                next: "instagram_connecting",
                set: () => { igPromiseRef.current = fetchInstagram(igh); },
              },
              { label: tx("instagram.opt_edit"), value: "edit", next: "instagram_edit" },
              { label: tx("instagram.opt_nao"), value: "nao", next: "__advance__" },
            ]);
          } else {
            await say(tx("instagram.l2"));
            decide(forceIg, { conectar: "manual" }, [
              { label: tx("instagram.opt_manual"), value: "manual", next: "instagram_edit" },
              { label: tx("instagram.opt_nao"), value: "nao", next: "__advance__" },
            ]);
          }
          break;
        }
        case "instagram_edit":
          await say(tx("instagram.edit_msg"));
          if (!cancelled)
            setPending({ kind: "textInput", field: "instagram", placeholder: tx("instagram.edit_ph") });
          break;
        case "instagram_connecting": {
          const connBlock = await extra("connecting");
          let ig: IgData | null = igData;
          if (igPromiseRef.current) {
            ig = await igPromiseRef.current;
            if (cancelled) return;
            if (ig) setIgData(ig);
          }
          markExtraDone(connBlock);
          await wait(ig ? 800 : 1600);
          if (cancelled) return;
          if (ig && ig.encontrado) {
            const segs = ig.seguidores
              ? ` (${ig.seguidores.toLocaleString("pt-BR")} seguidores)`
              : "";
            await say(`Pronto, conectei ao @${ig.username}! 🎉${segs}`);
          } else {
            await say(tx("instagram_connecting.done"));
          }
          await wait(450);
          if (!cancelled) advanceFrom("instagram");
          break;
        }
        case "ifood": {
          // iFood é só para negócios com cardápio/catálogo (não serviços).
          if (bizTypeRef.current === "servicos") { advanceFrom("ifood"); break; }
          // Procura a loja no iFood por BUSCA (sem perguntar) e pede só a
          // confirmação "é a sua loja?". Nunca raspamos o iFood nem inventamos.
          const myRun = flowRunRef.current;
          await say(tx("ifood.procurando", ctx()));
          const ifoodSearchBlock = await extra("ifoodSearching");
          const loja = await detectIfood();
          if (myRun !== flowRunRef.current || cancelled) return;
          markExtraDone(ifoodSearchBlock);
          if (loja) {
            ifoodFoundRef.current = loja;
            setIfoodFound(loja);
            await say(tx("ifood.encontrei", { nome: loja.nome }));
            await extra("ifoodFound");
            if (!cancelled)
              setPending({
                kind: "choice",
                options: [
                  { label: tx("ifood.opt_sim_minha"), value: "sim", next: "ifood_connecting" },
                  { label: tx("ifood.opt_naoessa"), value: "naoessa", next: "ifood_ask_link", set: () => { ifoodFoundRef.current = null; setIfoodFound(null); } },
                  { label: tx("ifood.opt_nao"), value: "nao", next: "__advance__", set: () => { ifoodFoundRef.current = null; setIfoodFound(null); } },
                ],
              });
          } else {
            await say(tx("ifood.nao_achei", ctx()));
            if (!cancelled)
              setPending({
                kind: "choice",
                options: [
                  { label: tx("ifood.opt_vendo_link"), value: "temlink", next: "ifood_link" },
                  { label: tx("ifood.opt_nao"), value: "nao", next: "__advance__" },
                ],
              });
          }
          break;
        }
        case "ifood_ask_link": {
          // Recuperação: o usuário disse que a loja detectada não é a dele. Damos
          // a chance de mandar o link certo OU seguir sem — nunca o prendemos aqui.
          await say(tx("ifood.outra_loja", ctx()));
          if (!cancelled)
            setPending({
              kind: "choice",
              options: [
                { label: tx("ifood.opt_vendo_link"), value: "temlink", next: "ifood_link" },
                { label: tx("ifood.opt_nao"), value: "nao", next: "__advance__" },
              ],
            });
          break;
        }
        case "ifood_link": {
          await say(tx("ifood.cole_link", ctx()));
          if (!cancelled)
            setPending({ kind: "textInput", field: "ifoodLink", placeholder: tx("ifood.link_ph") });
          break;
        }
        case "ifood_connecting": {
          // Importa o cardápio da loja confirmada/colada usando o store_id do
          // link (via Apify). Nunca inventa itens — só mostra o que vier real.
          const ifoodConnBlock = await extra("ifoodConnecting");
          const r = await scrapeIfoodCatalog(ifoodFoundRef.current);
          if (cancelled) return;
          markExtraDone(ifoodConnBlock);
          if (r && "configured" in r && r.configured === false) {
            // Sem token do Apify → honesto. Se já temos o link da loja, guardamos
            // e dizemos que a importação fica para quando estiver disponível;
            // senão, avisamos que a importação ainda não está ativa.
            await say(tx(ifoodFoundRef.current ? "ifood.salvo" : "ifood.indisponivel"));
          } else if (r && !("configured" in r) && r.connected && r.produtos.length) {
            ifoodCatalogRef.current = r.produtos;
            setCatalogItems(r.produtos);
            await say(tx("ifood.importado", { n: String(r.produtos.length) }));
          } else if (r && !("configured" in r) && r.connected) {
            await say(tx("ifood.sem_itens"));
          } else {
            // r === null → falha real (erro de rede/Apify), nunca confundida com
            // "indisponível": somos honestos de que a importação não concluiu.
            await say(tx("ifood.falha"));
          }
          await wait(450);
          if (!cancelled) advanceFrom("ifood");
          break;
        }
        case "tone_generated": {
          let r = research;
          if (!r && researchPromiseRef.current) {
            r = await researchPromiseRef.current;
            if (cancelled) return;
            if (r) setResearch(r);
          }
          const tomFound = r?.tom?.trim();
          const exemploFound = r?.exemplo?.trim();
          // Só promete/mostra um exemplo quando ele é REAL (personalizado).
          if (exemploFound) {
            await say(tomFound ? tx("tone_generated.found", { tom: tomFound }) : tx("tone_generated.default"));
            await extra("toneExample");
          } else {
            await say(tomFound ? tx("tone_generated.found_plain", { tom: tomFound }) : tx("tone_generated.default_plain"));
          }
          await say(tx("tone_generated.ask"));
          decide(forceTone, { nao: "ajustar" }, [
            { label: tx("tone_generated.opt_sim"), value: "sim", next: "__advance__", set: () => setTone(tomFound || "Afetuoso e acolhedor") },
            { label: tx("tone_generated.opt_upload"), value: "upload", next: "tone_upload" },
            { label: tx("tone_generated.opt_ajustar"), value: "ajustar", next: "tone_manual" },
          ]);
          break;
        }
        case "tone_manual":
          await say(tx("tone_manual.msg"));
          if (!cancelled) setPending({ kind: "toneManual" });
          break;
        case "tone_upload":
          setToneErr("");
          await say(tx("tone_upload.msg"));
          if (!cancelled) setPending({ kind: "toneUpload" });
          break;
        case "tone_reading": {
          const readBlock = await extra("readingChat");
          const result = await analyzeToneFromText(toneTextRef.current);
          if (cancelled) return;
          markExtraDone(readBlock);
          if (result && result.tom) {
            setTone(result.tom);
            await say(tx("tone_upload.done", { tom: result.tom }));
            const ex = result.exemplo;
            if (ex) {
              const segWithoutQuotes = ex.replace(/^["“”]+|["“”]+$/g, "");
              await say(`“${segWithoutQuotes}”`);
            }
            await wait(400);
            if (!cancelled) advanceFrom("tone_generated");
          } else {
            await say(tx("tone_upload.fail"));
            await wait(300);
            if (!cancelled) setNode("tone_manual");
          }
          break;
        }
        case "emojis":
          await say(tx("emojis.msg"));
          if (!cancelled)
            setPending({
              kind: "choice",
              options: [
                { label: tx("emojis.opt_sempre"), value: "sempre", next: "__advance__", set: () => setEmoji("Sempre") },
                { label: tx("emojis.opt_asvezes"), value: "asvezes", next: "__advance__", set: () => setEmoji("Às vezes") },
                { label: tx("emojis.opt_nunca"), value: "nunca", next: "__advance__", set: () => setEmoji("Nunca") },
              ],
            });
          break;
        case "configured":
          await say(tx("configured.l1"));
          await say(tx("configured.l2"));
          if (!cancelled) setPending({ kind: "finish" });
          break;
      }
    }
    run();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, phase, runKey]);

  /* autoscroll */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, typing, pending]);

  /* persistência: guarda o perfil coletado no navegador (localStorage) a cada
     mudança, para que os dados puxados das APIs não se percam durante o fluxo. */
  useEffect(() => {
    const perfil = {
      negocio: businessName,
      cidade: city,
      cnpj: cnpjData?.cnpj || "",
      razaoSocial: cnpjData?.razaoSocial || "",
      nomeFantasia: cnpjData?.nomeFantasia || "",
      endereco: placeAddr || cnpjData?.endereco || "",
      telefone: placeTelefone || cnpjData?.telefone || "",
      email: cnpjData?.email || "",
      situacao: cnpjData?.situacao || "",
      atividade: cnpjData?.atividade || "",
      horario: placeHorario || cnpjData?.horario || "",
      instagram: igData
        ? { usuario: igData.username, seguidores: igData.seguidores }
        : null,
      site,
      setor,
      servicos: services,
      produtos: catalogItems,
      carroChefe,
      ifood: ifoodFound ? { nome: ifoodFound.nome, url: ifoodFound.url, id: ifoodFound.id || null } : null,
      tom: tone,
      emoji,
      atualizadoEm: new Date().toISOString(),
    };
    try {
      localStorage.setItem("squad_onboarding_profile", JSON.stringify(perfil));
    } catch {
      /* ambiente sem localStorage — ignora */
    }
  }, [businessName, city, cnpjData, placeAddr, placeTelefone, placeHorario, igData, site, setor, services, catalogItems, carroChefe, ifoodFound, tone, emoji]);

  /* handlers */
  const handleChoice = (opt: Choice) => {
    setPending(null);
    addUser(opt.label);
    opt.set?.();
    if (!opt.next || opt.next === "__advance__") advanceFrom(node);
    else setNode(opt.next);
  };
  const pickCarroChefe = (n: string) => {
    setPending(null);
    setCarroChefe(n);
    addUser(n);
    advanceFrom("carro_chefe");
  };
  const pickTone = (t: string) => {
    setPending(null);
    setTone(t);
    addUser(t);
    advanceFrom("tone_generated");
  };
  // Recebe a conversa (texto já extraído) e parte para a análise do tom.
  const startToneAnalysis = (text: string, label: string) => {
    const clean = cleanChatText(text);
    if (clean.length < 20) {
      setToneErr("Esse conteúdo é muito curto pra eu entender o tom. Tenta uma conversa com mais mensagens.");
      return;
    }
    setToneErr("");
    toneTextRef.current = clean.slice(0, 12000);
    setPending(null);
    setToneDraft("");
    addUser(label);
    setNode("tone_reading");
  };
  const handleTonePaste = () => {
    if (!toneDraft.trim()) return;
    startToneAnalysis(toneDraft, "📝 Colei alguns trechos das minhas conversas");
  };
  const handleToneFile = async (file: File) => {
    setToneErr("");
    setToneFileBusy(true);
    const run = ++toneRunRef.current;
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name);
      const text = isImage
        ? await extractImageText(file)
        : isPdf
        ? await extractPdfText(file)
        : await file.text();
      // usuário saiu do passo (Voltar/reset) enquanto líamos o arquivo: aborta.
      if (run !== toneRunRef.current) return;
      if (!text || text.trim().length < 20) {
        setToneErr(
          isImage
            ? "Não consegui ler texto suficiente nesse print. Tenta um print mais nítido ou cole os trechos abaixo."
            : "Não consegui ler texto suficiente desse arquivo. Tenta um .txt do WhatsApp ou cole os trechos abaixo."
        );
        return;
      }
      startToneAnalysis(text, `📎 ${file.name}`);
    } catch {
      if (run === toneRunRef.current) {
        setToneErr("Não consegui abrir esse arquivo. Tenta exportar a conversa do WhatsApp como .txt, enviar um print ou colar os trechos abaixo.");
      }
    } finally {
      if (run === toneRunRef.current) setToneFileBusy(false);
      if (toneFileInputRef.current) toneFileInputRef.current.value = "";
    }
  };
  const handlePlacePick = (c: PlaceCandidate) => {
    setPending(null);
    setPlaceAddr(c.endereco);
    setPlaceHorario(c.horario);
    setPlaceTelefone(c.telefone);
    // o site oficial vindo do Google tem prioridade sobre o deduzido no CNPJ
    // (confirm_contact só preenche o site se este ainda estiver vazio).
    if (c.site) { setSite(c.site); siteRef.current = c.site; }
    // usa a cidade canônica descoberta (corrige abreviação/erro do que foi digitado)
    if (c.cidade) { setCity(c.cidade); cityRef.current = c.cidade; }
    addUser(`${c.nome} — ${c.endereco}`);
    advanceFrom("place_pick");
  };
  const handlePlaceNone = (label: string) => {
    setPending(null);
    addUser(label);
    advanceFrom("place_pick");
  };
  const pickDestaque = (s: string) => {
    setPending(null);
    setCarroChefe(s);
    addUser(s);
    advanceFrom("carro_chefe");
  };
  const submitText = () => {
    if (!pending || pending.kind !== "textInput") return;
    const v = textDraft.trim();
    if (!v) return;
    // Pergunta paralela ("qual a capital do Brasil?") → responde e re-pergunta,
    // sem consumir o campo. O CNPJ é só dígitos, então nunca cai aqui.
    if (pending.field !== "cnpj" && looksLikeSideQuestion(v)) {
      void answerSideQuestion(v);
      return;
    }
    const field = pending.field;
    setPending(null);
    addUser(v);
    setTextDraft("");
    if (field === "businessName") {
      setBusinessName(v);
      businessNameRef.current = v;
      // normaliza o nome em 2º plano (capitalização/acentos); aplicado no nó
      // ask_city antes da próxima fala, para a Oddy usar a versão corrigida.
      normalizePromiseRef.current = normalizeIdentity({ business: v });
    } else if (field === "cnpj") {
      // correção manual do CNPJ no card de contato → valida, reconsulta a API
      // com o número informado e volta para reexibir os dados atualizados.
      const digits = v.replace(/\D/g, "");
      if (!isValidCnpj(digits)) {
        addOddy(tx("contact_adjust.invalido"));
        setPending({ kind: "textInput", field: "cnpj", placeholder: tx("contact_adjust.ph") });
        return;
      }
      // a /api/cnpj só traz dados cadastrais (Receita) — não retorna horário,
      // site nem Instagram. Esses três foram descobertos pela MARCA (busca por
      // nome+cidade), não pelo CNPJ, então corrigir os dígitos do CNPJ não muda
      // a marca: preservamos pra não APAGAR o @ e o site achados antes.
      // OBS: atividade (CNAE) é específica do CNPJ — vem só do spread `...c`
      // (lookup novo), nunca do anterior, senão herdaria o ramo do CNPJ errado.
      const prev = cnpjData;
      manualCnpjRef.current = true;
      // não limpamos placeAddr/placeTelefone aqui: só após a reconsulta dar
      // certo (em confirm_contact), para não perder os dados anteriores se o
      // CNPJ corrigido não for encontrado.
      cnpjPromiseRef.current = fetchCnpj(digits).then((c) =>
        c
          ? {
              ...c,
              horario: c.horario || prev?.horario || "",
              site: c.site || prev?.site || "",
              instagram: c.instagram || prev?.instagram || "",
            }
          : null,
      );
      setNode("confirm_contact");
      return;
    } else if (field === "city") {
      // mostra de imediato o que foi digitado; a versão corrigida é aplicada
      // logo abaixo, antes de disparar a descoberta.
      setCity(v);
      cityRef.current = v;
      manualCnpjRef.current = false;
      igPromiseRef.current = null;
      researchPromiseRef.current = null;
      catalogPromiseRef.current = null;
      const curNode = node;
      const myRun = flowRunRef.current;
      // Normaliza a cidade (sp/sampa → "São Paulo - SP", acentos) ANTES de buscar:
      // isso melhora a descoberta e garante a exibição corrigida. Com nome +
      // cidade já deduzimos quase tudo, sem mais perguntas. Em 2º plano e em
      // paralelo: (1) endereço/telefone no Perplexity (/api/places) e (2) a
      // descoberta oficial (/api/cnpj-lookup) — CNPJ, setor (CNAE), site e
      // Instagram. O scraping do catálogo, o tom e o perfil do Instagram são
      // disparados só APÓS as confirmações de site e Instagram. NUNCA inventa.
      (async () => {
        const n = await normalizeIdentity({ business: businessNameRef.current.trim(), city: v });
        // descarta se o fluxo foi reiniciado/saltado enquanto normalizava.
        if (myRun !== flowRunRef.current) return;
        const cleanCity = n.city || v;
        setCity(cleanCity); cityRef.current = cleanCity;
        if (n.business) { setBusinessName(n.business); businessNameRef.current = n.business; }
        const biz = businessNameRef.current.trim();
        placePromiseRef.current = biz ? fetchPlaces(biz, cleanCity) : null;
        cnpjPromiseRef.current = biz ? fetchCnpjLookup(biz, cleanCity) : null;
        advanceFrom(curNode);
      })();
      return;
    } else if (field === "site") {
      // confirmação/correção do site → guarda o link E já dispara a varredura
      // robusta (catálogo + tom + @ do Instagram). Vazio → não dispara (cai pro
      // link da bio do IG / Sonar mais tarde, no passo `catalog`).
      const url = cleanField(v);
      setSite(url); siteRef.current = url;
      // com site informado: dispara a varredura e mostra o indicador de leitura;
      // sem site ("não tenho"): segue direto, sem animação de scraping.
      if (url) { fireSiteScrape(); setNode("site_scraping"); }
      else advanceFrom("confirm_site");
      return;
    } else if (field === "instagram") {
      // @ informado/corrigido → dispara o scraping do perfil e segue pra conexão.
      const handle = cleanField(v);
      setIgHandle(handle); igHandleRef.current = handle;
      igPromiseRef.current = handle ? fetchInstagram(handle) : null;
      if (handle) { setNode("instagram_connecting"); return; }
      advanceFrom("instagram");
      return;
    } else if (field === "ifoodLink") {
      // Link da loja no iFood colado pelo usuário. Só aceita URL REAL de loja do
      // iFood (host oficial + /delivery/); nunca inventamos nem "consertamos". Em
      // link inválido, reexplica e pede de novo em vez de pular silenciosamente.
      const parsed = v
        .split(/\s+/)
        .map((t) => parseIfoodStoreUrl(t))
        .find((p): p is { url: string; id?: string } => !!p);
      if (!parsed) {
        addOddy(tx("ifood.link_invalido"));
        setPending({ kind: "textInput", field: "ifoodLink", placeholder: tx("ifood.link_ph") });
        return;
      }
      const loja: IFoodStore = {
        nome: businessNameRef.current || "Minha loja no iFood",
        url: parsed.url,
        id: parsed.id,
      };
      ifoodFoundRef.current = loja;
      setIfoodFound(loja);
      setNode("ifood_connecting");
      return;
    } else if (field === "services") {
      const list = v.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
      setServices(list.length ? list : [v]);
    }
    advanceFrom(node);
  };

  const goTour = () => {
    setPending(null);
    advanceFrom(node);
  };

  const resetChatState = () => {
    setChat([]);
    setTyping(false);
    setPending(null);
    idRef.current = 1;
    setBusinessName(""); businessNameRef.current = "";
    setSite(""); siteRef.current = "";
    setIgHandle(""); igHandleRef.current = "";
    setSetor(""); setorRef.current = "";
    setCity(""); cityRef.current = "";
    setServices([]); setPlaceAddr(""); setPlaceHorario(""); setPlaceTelefone(""); setPlaceResults([]);
    setCnpjData(null); setIgData(null); setCatalogItems([]);
    ifoodCatalogRef.current = null; setIfoodFound(null); ifoodFoundRef.current = null;
    setTextDraft(""); setToneDraft(""); setToneErr(""); setToneFileBusy(false);
    toneTextRef.current = ""; toneRunRef.current++; flowRunRef.current++;
    setCarroChefe(""); setTone(""); setEmoji("");
    setResearch(null);
    researchPromiseRef.current = null;
    normalizePromiseRef.current = null;
    placePromiseRef.current = null;
    cnpjPromiseRef.current = null;
    igPromiseRef.current = null;
    catalogPromiseRef.current = null;
    siteScrapePromiseRef.current = null;
    siteScrapeRef.current = null;
    igFromSiteRef.current = false;
    scrapeFiredRef.current = false;
  };

  const startChat = () => {
    resetChatState();
    setNode(stepsRef.current[0]?.id ?? "welcome");
    setRunKey((k) => k + 1);
    setPhase("chat");
  };

  const restart = () => {
    resetChatState();
    setNode(stepsRef.current[0]?.id ?? "welcome");
    setRunKey((k) => k + 1);
    setPhase("intro");
  };

  const jumpTo = (stage: string) => {
    setPending(null);
    setTyping(false);
    if (stage === "tour") { setPhase("tour"); return; }
    if (stage === "fim") { setPhase("done"); return; }
    flowRunRef.current++;
    setChat([]);
    setResearch(null);
    // Reset completo do estado por-execução; preservamos apenas businessName
    // (config de mock do painel dev usada para disparar a pesquisa).
    setSite(""); siteRef.current = "";
    setIgHandle(""); igHandleRef.current = "";
    setSetor(""); setorRef.current = "";
    setCity(""); cityRef.current = "";
    setCarroChefe(""); setTone(""); setEmoji(""); setTextDraft("");
    setServices([]); setPlaceAddr(""); setPlaceHorario(""); setPlaceTelefone(""); setPlaceResults([]);
    setCnpjData(null); setIgData(null); setCatalogItems([]);
    ifoodCatalogRef.current = null; setIfoodFound(null); ifoodFoundRef.current = null;
    researchPromiseRef.current = null;
    normalizePromiseRef.current = null;
    placePromiseRef.current = null;
    cnpjPromiseRef.current = null;
    igPromiseRef.current = null;
    catalogPromiseRef.current = null;
    siteScrapePromiseRef.current = null;
    siteScrapeRef.current = null;
    igFromSiteRef.current = false;
    idRef.current = 1;
    const biz = businessNameRef.current.trim();
    const needsResearch = ["catalogo", "instagram", "tom", "configurado"].includes(stage);
    researchPromiseRef.current = biz && needsResearch
      ? doResearch(biz, {
          site: cleanField(siteRef.current),
          instagram: cleanField(igHandleRef.current),
          setor: setorRef.current,
        })
      : null;
    catalogPromiseRef.current = biz && needsResearch
      ? fetchCatalog(biz, {
          city: cityRef.current.trim(),
          site: cleanField(siteRef.current),
          instagram: cleanField(igHandleRef.current),
        })
      : null;
    // se o jump já pré-disparou (catalogo+), trava o fireScrapes do nó `catalog`;
    // senão libera pra disparar naturalmente quando chegar no catálogo.
    scrapeFiredRef.current = needsResearch;
    const map: Record<string, NodeId> = {
      boasvindas: "welcome",
      localizacao: "ask_city",
      dados: "place_pick",
      catalogo: "catalog",
      instagram: "instagram",
      tom: "tone_generated",
      configurado: "configured",
    };
    setNode(map[stage] || "welcome");
    setRunKey((k) => k + 1);
    setPhase("chat");
  };

  /* renderers */
  const renderExtra = (e: Msg["extra"], done?: boolean) => {
    if (e === "searching") return <SearchingBlock done={done} />;
    if (e === "scraping") return <ScrapingBlock done={done} />;
    if (e === "catalog")
      return (
        <CatalogBlock
          items={
            catalogItems.length
              ? catalogItems.map((p) => ({ name: p.nome, price: p.preco || null }))
              : PLACEHOLDER_CATALOG[bizType]
          }
        />
      );
    if (e === "contact")
      return (
        <ContactBlock
          cnpj={cnpjData?.cnpj || ""}
          endereco={placeAddr || cnpjData?.endereco || ""}
          telefone={placeTelefone || cnpjData?.telefone || ""}
        />
      );
    if (e === "connecting") return <ConnectingBlock done={done} />;
    if (e === "ifoodConnecting") return <IFoodConnectingBlock done={done} />;
    if (e === "ifoodSearching") return <IFoodSearchingBlock done={done} />;
    if (e === "ifoodFound") return <IFoodFoundBlock store={ifoodFound} />;
    if (e === "readingChat") return <ReadingChatBlock done={done} />;
    if (e === "toneExample")
      return <ToneExampleBlock tomLabel={research?.tom?.trim() || undefined} exemplo={research?.exemplo?.trim() || undefined} />;
    return null;
  };

  return (
    <div className={`onboarding-bg ${embedded ? "h-full overflow-y-auto" : "min-h-screen"} w-full text-[#13161D]`} style={{ fontFamily: "Fustat, sans-serif" }}>
      {/* dev toggle */}
      {!embedded && (
        <button
          onClick={() => setDevOpen((v) => !v)}
          className="fixed top-4 right-4 z-30 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-50 shadow-sm"
        >
          <Settings2 className="w-3.5 h-3.5" /> Painel dev
        </button>
      )}

      {/* INTRO */}
      {phase === "intro" && (
        <div className={`${minScreenH} flex items-center justify-center px-6`}>
          <div className="w-full max-w-md text-center animate-slide-up space-y-7">
            <div className="flex justify-center">
              <Orb size={112} />
            </div>
            <div className="space-y-3">
              <h1 className="text-[2.5rem] leading-[1.05] font-bold tracking-tight">Bem-vindo ao Squad</h1>
              <p className="text-lg text-gray-500">
                Sou o assistente do Squad. Vou te configurar em poucos minutos.
              </p>
            </div>
            <div className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#13161D]">Como podemos te chamar?</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && startChat()}
                  placeholder="Seu nome"
                  className="w-full h-14 px-5 text-lg bg-white border border-gray-200 rounded-2xl focus:outline-none focus:border-[#13161D]"
                />
                <p className="text-xs text-gray-400">
                  Vou te fazer algumas perguntas rápidas pra configurar tudo.
                </p>
              </div>
            </div>
            <PillButton onClick={startChat} disabled={!name.trim()} className="w-full h-14 text-lg">
              Começar <ArrowRight className="w-5 h-5" />
            </PillButton>
          </div>
        </div>
      )}

      {/* CHAT */}
      {phase === "chat" && (
        <div className={`${screenH} flex flex-col max-w-2xl mx-auto`}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <Orb size={44} />
            <div className="flex-1">
              <p className="font-bold text-[#13161D] leading-tight">Assistente Squad</p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Online agora
              </p>
            </div>
            <Headset className="w-5 h-5 text-gray-300" />
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
            {chat.map((m) =>
              m.kind === "text" ? (
                <div
                  key={m.id}
                  className={`flex chat-enter ${m.sender === "user" ? "justify-end" : "justify-start items-end gap-2"}`}
                >
                  {m.sender === "oddy" && <Orb size={30} />}
                  <div
                    className={`px-4 py-2.5 text-[15px] leading-relaxed max-w-[78%] ${
                      m.sender === "user"
                        ? "bg-[#13161D] text-white rounded-2xl rounded-tr-md"
                        : "bg-[#F4F5F8] text-[#13161D] rounded-2xl rounded-tl-md"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex chat-enter justify-start items-end gap-2">
                  <div className="w-[30px] shrink-0" />
                  {renderExtra(m.extra, m.done)}
                </div>
              )
            )}

            {typing && (
              <div className="flex items-end gap-2 chat-enter">
                <Orb size={30} />
                <div className="bg-[#F4F5F8] rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1">
                  <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
                  <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
                  <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
                </div>
              </div>
            )}

            {/* pending interactions */}
            {pending?.kind === "choice" && (
              <div className="flex flex-wrap gap-2 justify-end pt-1 chat-enter">
                {pending.options.map((o) => (
                  <PillButton
                    key={o.value}
                    variant={o.value === "nao" || o.value === "falta" || o.value === "ajustar" || o.value === "nunca" ? "outline" : "primary"}
                    onClick={() => handleChoice(o)}
                    className="h-11 px-5"
                  >
                    {o.label}
                  </PillButton>
                ))}
              </div>
            )}

            {pending?.kind === "carroChefe" && (
              <div className="flex flex-wrap gap-2 justify-end pt-1 chat-enter">
                {(catalogItems.length
                  ? catalogItems.map((p) => p.nome)
                  : PLACEHOLDER_CATALOG[bizType].map((c) => c.name)
                ).map((nome) => (
                  <PillButton key={nome} variant="outline" onClick={() => pickCarroChefe(nome)} className="h-11 px-5">
                    {nome}
                  </PillButton>
                ))}
              </div>
            )}

            {pending?.kind === "destaque" && (
              <div className="flex flex-wrap gap-2 justify-end pt-1 chat-enter">
                {(services.length ? services : ["[Serviço 1]", "[Serviço 2]", "[Serviço 3]"]).map((s) => (
                  <PillButton key={s} variant="outline" onClick={() => pickDestaque(s)} className="h-11 px-5">
                    {s}
                  </PillButton>
                ))}
              </div>
            )}

            {pending?.kind === "placePick" && (
              <div className="flex flex-col gap-2 pt-1 chat-enter w-full">
                {placeResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handlePlacePick(c)}
                    className="text-left rounded-2xl border border-gray-200 bg-white p-4 hover:border-[#13161D] hover:shadow-sm transition-all flex items-start gap-3"
                  >
                    <MapPin className="w-5 h-5 text-[#13161D] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#13161D]">{c.nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{c.endereco}</p>
                      {c.categoria && <p className="text-[11px] text-gray-400 mt-1">{c.categoria}</p>}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => handlePlaceNone(tx("place_pick.none"))}
                  className="text-sm text-gray-500 hover:text-[#13161D] underline self-end px-2 py-1"
                >
                  {tx("place_pick.none")}
                </button>
              </div>
            )}

            {pending?.kind === "toneManual" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 chat-enter">
                {TONES.map((t) => (
                  <button
                    key={t}
                    onClick={() => pickTone(t)}
                    className="text-left rounded-2xl border border-gray-200 bg-white p-4 hover:border-[#13161D] hover:shadow-sm transition-all space-y-2"
                  >
                    <p className="text-sm font-bold text-[#13161D]">{t}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-start">
                        <div className="bg-[#F4F5F8] rounded-xl rounded-tl-sm px-2.5 py-1.5 text-xs text-[#13161D] max-w-[90%]">
                          {CLIENT_Q}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="bg-[#13161D] text-white rounded-xl rounded-tr-sm px-2.5 py-1.5 text-xs max-w-[90%]">
                          {TONE_EXAMPLES[t]}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {pending?.kind === "toneUpload" && (
              <div className="space-y-3 pt-1 chat-enter">
                <input
                  ref={toneFileInputRef}
                  type="file"
                  accept=".txt,.pdf,text/plain,application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleToneFile(f);
                  }}
                />
                <button
                  onClick={() => toneFileInputRef.current?.click()}
                  disabled={toneFileBusy}
                  className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-4 hover:border-[#13161D] hover:shadow-sm transition-all disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#13161D] flex items-center justify-center shrink-0">
                    {toneFileBusy ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <FileText className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[#13161D]">
                      {toneFileBusy ? "Lendo arquivo…" : "Enviar conversa (.txt, PDF ou print)"}
                    </p>
                    <p className="text-xs text-gray-500">Exporte do WhatsApp (.txt/PDF) ou mande um print do WhatsApp/Instagram</p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">ou cole os trechos</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <textarea
                  value={toneDraft}
                  onChange={(e) => setToneDraft(e.target.value)}
                  placeholder="Cole aqui algumas mensagens suas de atendimento…"
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:border-[#13161D] text-[15px] resize-none"
                />

                {toneErr && <p className="text-xs text-red-500">{toneErr}</p>}

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => { toneRunRef.current++; setToneFileBusy(false); setToneErr(""); setToneDraft(""); setNode("tone_generated"); }}
                    className="text-sm text-gray-500 hover:text-[#13161D]"
                  >
                    Voltar
                  </button>
                  <PillButton
                    onClick={handleTonePaste}
                    disabled={!toneDraft.trim() || toneFileBusy}
                    className="h-11 px-5"
                  >
                    Analisar tom <ArrowRight className="w-4 h-4" />
                  </PillButton>
                </div>
              </div>
            )}

            {pending?.kind === "textInput" && (
              <div className="flex items-center gap-2 pt-1 chat-enter">
                <input
                  autoFocus
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitText()}
                  placeholder={pending.placeholder}
                  className="flex-1 h-12 px-4 bg-white border border-gray-200 rounded-full focus:outline-none focus:border-[#13161D] text-[15px]"
                />
                <PillButton
                  onClick={submitText}
                  disabled={!textDraft.trim()}
                  className="h-12 w-12 !px-0 shrink-0"
                >
                  <Send className="w-5 h-5" />
                </PillButton>
              </div>
            )}

            {pending?.kind === "finish" && (
              <div className="flex justify-end pt-1 chat-enter">
                <PillButton variant="accent" onClick={goTour} className="h-12 px-6 text-base">
                  {tx("configured.cta")} <ArrowRight className="w-4 h-4" />
                </PillButton>
              </div>
            )}

            {/* "Pergunte qualquer coisa" também nos passos de BOTÕES: caixinha
                discreta abaixo das opções; responder NÃO escolhe nada, os botões
                acima continuam disponíveis. */}
            {(pending?.kind === "choice" ||
              pending?.kind === "carroChefe" ||
              pending?.kind === "destaque" ||
              pending?.kind === "placePick") && (
              <div className="flex items-center gap-2 pt-1 opacity-90">
                <input
                  value={askDraft}
                  onChange={(e) => setAskDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAsk()}
                  placeholder="Quer perguntar algo antes? Escreva aqui…"
                  className="flex-1 h-10 px-4 bg-white border border-gray-200 rounded-full focus:outline-none focus:border-[#13161D] text-[14px]"
                />
                <PillButton
                  variant="outline"
                  onClick={submitAsk}
                  disabled={!askDraft.trim()}
                  className="h-10 w-10 !px-0 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </PillButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOUR — slideshow de funcionalidades */}
      {phase === "tour" && (
        <FeatureSlideshow
          research={research}
          screenH={screenH}
          onFinish={() => advanceFrom("features")}
        />
      )}

      {/* DONE */}
      {phase === "done" && (
        <div className={`${minScreenH} flex items-center justify-center px-6`}>
          <div className="w-full max-w-md text-center animate-slide-up space-y-7">
            <div className="flex justify-center">
              <Orb size={112} />
            </div>
            <div className="space-y-3">
              <h1 className="text-[2.5rem] leading-[1.05] font-bold tracking-tight">Tudo pronto! 🎉</h1>
              <p className="text-lg text-gray-500">Seu atendimento está no ar, respondendo seus clientes.</p>
            </div>
            {(tone || emoji || carroChefe) && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left text-sm text-gray-600 space-y-1">
                {carroChefe && <p>Carro-chefe: <span className="text-[#13161D] font-medium">{carroChefe}</span></p>}
                {tone && <p>Tom de voz: <span className="text-[#13161D] font-medium">{tone}</span></p>}
                {emoji && <p>Emojis: <span className="text-[#13161D] font-medium">{emoji}</span></p>}
              </div>
            )}
            <PillButton onClick={restart} className="w-full h-14 text-lg">
              <RotateCcw className="w-5 h-5" /> Recomeçar a demo
            </PillButton>
          </div>
        </div>
      )}

      {/* DEV PANEL */}
      {devOpen && (
        <div className="fixed top-0 right-0 bottom-0 z-40 w-80 max-w-[85vw] bg-white border-l border-gray-200 shadow-2xl dev-slide overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 sticky top-0 bg-white">
            <span className="text-sm font-bold text-[#13161D] flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Painel de dev
            </span>
            <button onClick={() => setDevOpen(false)} className="p-1 rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="p-4 space-y-5 text-sm">
            <button
              onClick={restart}
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-[#13161D] text-white font-medium hover:bg-[#06070A]"
            >
              <RotateCcw className="w-4 h-4" /> Reiniciar fluxo
            </button>

            <div className="space-y-1.5">
              <label className="font-semibold text-gray-700">Nome mockado</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#13161D]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-gray-700">Negócio mockado (pesquisa)</label>
              <input
                value={businessName}
                onChange={(e) => { setBusinessName(e.target.value); businessNameRef.current = e.target.value; }}
                placeholder="Ex.: Sodiê Doces"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#13161D]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-gray-700">Ir para etapa</label>
              <select
                onChange={(e) => { if (e.target.value) jumpTo(e.target.value); e.target.value = ""; }}
                defaultValue=""
                className="w-full h-9 px-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#13161D]"
              >
                <option value="" disabled>Selecionar…</option>
                <option value="boasvindas">Boas-vindas</option>
                <option value="localizacao">Localização</option>
                <option value="dados">Dados do negócio</option>
                <option value="catalogo">Catálogo</option>
                <option value="instagram">Instagram</option>
                <option value="tom">Tom de voz</option>
                <option value="configurado">Configurado</option>
                <option value="tour">Tour</option>
                <option value="fim">Fim</option>
              </select>
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="font-semibold text-gray-700">Decisões</p>

              <div className="space-y-1.5">
                <label className="text-gray-600">Conectar Instagram?</label>
                <select
                  value={forceIg}
                  onChange={(e) => setForceIg(e.target.value as typeof forceIg)}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#13161D]"
                >
                  <option value="ask">Perguntar no chat</option>
                  <option value="conectar">Forçar: Conectar</option>
                  <option value="nao">Forçar: Não</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-gray-600">Gostou do tom?</label>
                <select
                  value={forceTone}
                  onChange={(e) => setForceTone(e.target.value as typeof forceTone)}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#13161D]"
                >
                  <option value="ask">Perguntar no chat</option>
                  <option value="sim">Forçar: Sim</option>
                  <option value="nao">Forçar: Não (ajustar)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Builder (node manager + live preview) ---------- */

const KIND_BADGE: Record<string, string> = {
  Entrada: "Entrada",
  Pergunta: "Pergunta",
  Mensagem: "Mensagem",
  message: "Mensagem",
  input: "Pergunta",
  choice: "Escolha",
  features: "Tour",
};

const BUILTIN_DEFS: Record<string, FlowNodeDef> = Object.fromEntries(
  FLOW_NODES.map((n) => [n.id, n]),
);

// transient engine nodes whose fields live inside a parent card
const MERGE_FIELDS: Record<string, string[]> = {
  catalog: ["catalog_falta"],
  instagram: ["instagram_connecting"],
  tone_generated: ["tone_manual"],
};

interface CardModel {
  title: string;
  badge: string;
  fields: FlowField[];
  note?: string;
  editableTitle: boolean;
}

function cardModel(step: Step): CardModel {
  if (step.kind !== "builtin") {
    return {
      title: step.title ?? customTitle(step.kind),
      badge: KIND_BADGE[step.kind] ?? "Etapa",
      fields: customFieldDefs(step.id, step.kind),
      editableTitle: true,
    };
  }
  if (step.id === "features") {
    return {
      title: "Funcionalidades",
      badge: KIND_BADGE.features,
      fields: [],
      note: "Slideshow final de funcionalidades — sem textos editáveis.",
      editableTitle: false,
    };
  }
  const def = BUILTIN_DEFS[step.id];
  const merged = (MERGE_FIELDS[step.id] ?? []).flatMap(
    (mid) => BUILTIN_DEFS[mid]?.fields ?? [],
  );
  return {
    title: def?.title ?? step.id,
    badge: def ? KIND_BADGE[def.kind] : "Etapa",
    fields: [...(def?.fields ?? []), ...merged],
    editableTitle: false,
  };
}

const ADD_OPTIONS: { kind: StepKind; label: string; desc: string }[] = [
  { kind: "message", label: "Mensagem", desc: "O assistente fala algo e segue." },
  { kind: "input", label: "Pergunta", desc: "Pede uma resposta em texto." },
  { kind: "choice", label: "Escolha", desc: "Oferece opções de botão." },
];

export default function OnboardingFlow() {
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState(0);
  const [bizType, setBizType] = useState<BizType>("alimentacao");
  const [fullscreen, setFullscreen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const counter = useRef(1);

  const set = (key: string, val: string) =>
    setOverrides((o) => ({ ...o, [key]: val }));
  const bump = () => setRunId((k) => k + 1);

  const move = (idx: number, dir: -1 | 1) => {
    setSteps((s) => {
      const j = idx + dir;
      if (j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    bump();
  };
  const moveTo = (from: number, to: number) => {
    setSteps((s) => {
      if (from === to || to < 0 || to >= s.length) return s;
      const next = s.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    bump();
  };
  const removeStep = (idx: number) => {
    setSteps((s) => s.filter((_, i) => i !== idx));
    bump();
  };
  const updateTitle = (id: string, title: string) =>
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, title } : st)));

  const addNode = (kind: StepKind) => {
    const id = `custom_${counter.current++}`;
    setOverrides((o) => ({ ...o, ...customSeeds(id, kind) }));
    setSteps((s) => {
      const step: Step = { id, kind, title: customTitle(kind) };
      const fIdx = s.findIndex((st) => st.id === "features");
      if (fIdx === -1) return [...s, step];
      const next = s.slice();
      next.splice(fIdx, 0, step);
      return next;
    });
    setAddOpen(false);
    bump();
  };

  const restoreAll = () => {
    setSteps(DEFAULT_STEPS);
    setOverrides({});
    counter.current = 1;
    bump();
  };

  const editedTexts = Object.keys(overrides).filter(
    (k) => (overrides[k] ?? "") !== (FLOW_DEFAULTS[k] ?? ""),
  ).length;
  const structureChanged =
    steps.length !== DEFAULT_STEPS.length ||
    steps.some((s, i) => s.id !== DEFAULT_STEPS[i]?.id);

  const previewPane = (k: string) => (
    <OnboardingPreview key={k} steps={steps} overrides={overrides} embedded bizType={bizType} />
  );

  return (
    <div
      className="h-screen w-full flex flex-col bg-white text-[#13161D]"
      style={{ fontFamily: "Fustat, sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Orb size={36} />
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">Onboarding Squad</p>
            <p className="text-xs text-gray-500 truncate">
              Editor de fluxo · {steps.length} etapas
              {editedTexts > 0 ? ` · ${editedTexts} texto${editedTexts > 1 ? "s" : ""}` : ""}
              {structureChanged ? " · estrutura alterada" : ""}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1" title="Simula o tipo de negócio (define quais APIs/placeholders aparecem)">
            <GitBranch className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={bizType}
              onChange={(e) => { setBizType(e.target.value as BizType); bump(); }}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:border-[#13161D] cursor-pointer"
            >
              {BIZ_TYPES.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={restoreAll}
            disabled={editedTexts === 0 && !structureChanged}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar tudo
          </button>
          <button
            onClick={() => { bump(); setFullscreen(true); }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#13161D] text-white px-4 py-1.5 text-xs font-semibold hover:bg-[#06070A]"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Preview
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT — node manager */}
        <div className="w-[54%] min-w-0 border-r border-gray-200 overflow-y-auto bg-[#FAFBFC]">
          <div className="px-6 py-6 max-w-2xl mx-auto">
            <div className="mb-5 flex items-center gap-2 text-sm text-gray-500">
              <Pencil className="w-4 h-4" />
              Arraste para reordenar, edite os textos, adicione ou remova etapas. O preview reflete tudo.
            </div>

            <div className="space-y-0">
              {steps.map((step, i) => {
                const m = cardModel(step);
                const removable = step.id !== "welcome";
                return (
                  <div key={step.id} className="relative">
                    {i > 0 && (
                      <div className="flex justify-start pl-[18px]">
                        <div className="w-px h-6 bg-gray-300" />
                      </div>
                    )}

                    <div
                      onDragOver={(e) => {
                        if (dragIdx !== null) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx !== null) moveTo(dragIdx, i);
                        setDragIdx(null);
                      }}
                      className={`rounded-2xl border bg-white shadow-sm transition-shadow ${
                        dragIdx === i ? "border-[#13161D] opacity-60" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
                        <span
                          draggable
                          onDragStart={() => setDragIdx(i)}
                          onDragEnd={() => setDragIdx(null)}
                          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
                          title="Arrastar para reordenar"
                        >
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <span className="w-7 h-7 rounded-full bg-[#13161D] text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        {m.editableTitle ? (
                          <input
                            value={m.title}
                            onChange={(e) => updateTitle(step.id, e.target.value)}
                            className="font-bold text-[#13161D] leading-tight flex-1 min-w-0 bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:border-[#13161D] focus:outline-none"
                          />
                        ) : (
                          <p className="font-bold text-[#13161D] leading-tight flex-1 min-w-0 truncate">
                            {m.title}
                          </p>
                        )}
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                          {m.badge}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => move(i, -1)}
                            disabled={i === 0}
                            className="p-1 rounded-md text-gray-400 hover:text-[#13161D] hover:bg-gray-100 disabled:opacity-30"
                            title="Mover para cima"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => move(i, 1)}
                            disabled={i === steps.length - 1}
                            className="p-1 rounded-md text-gray-400 hover:text-[#13161D] hover:bg-gray-100 disabled:opacity-30"
                            title="Mover para baixo"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          {removable && (
                            <button
                              onClick={() => removeStep(i)}
                              className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                              title="Remover etapa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-4 space-y-3.5">
                        {m.note && (
                          <p className="text-xs text-gray-400 italic">{m.note}</p>
                        )}
                        {m.fields.map((f) => {
                          const value = overrides[f.key] ?? f.default;
                          const changed = value !== f.default;
                          return (
                            <div key={f.key} className="space-y-1">
                              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                                {f.label}
                                {changed && <span className="w-1.5 h-1.5 rounded-full bg-[#13161D]" />}
                              </label>
                              {f.multiline ? (
                                <textarea
                                  value={value}
                                  onChange={(e) => set(f.key, e.target.value)}
                                  rows={3}
                                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#13161D] focus:outline-none focus:border-[#13161D]"
                                />
                              ) : (
                                <input
                                  value={value}
                                  onChange={(e) => set(f.key, e.target.value)}
                                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#13161D] focus:outline-none focus:border-[#13161D]"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add node */}
            <div className="pt-6">
              {addOpen ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-gray-500">Adicionar etapa</span>
                    <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-[#13161D]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {ADD_OPTIONS.map((opt) => (
                    <button
                      key={opt.kind}
                      onClick={() => addNode(opt.kind)}
                      className="w-full text-left rounded-xl border border-gray-200 px-3 py-2.5 hover:border-[#13161D] hover:bg-[#FAFBFC] transition-colors"
                    >
                      <p className="text-sm font-semibold text-[#13161D]">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setAddOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-500 hover:border-[#13161D] hover:text-[#13161D] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Adicionar etapa
                </button>
              )}
              <p className="mt-2 text-[11px] text-gray-400 text-center">
                Novas etapas entram antes do slideshow final.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT — live preview */}
        <div className="flex-1 min-w-0 flex flex-col bg-gray-100">
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-200 bg-white shrink-0">
            <Eye className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500">Pré-visualização ao vivo</span>
            <button
              onClick={bump}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
            </button>
          </div>
          <div className="flex-1 min-h-0 p-5 flex items-center justify-center">
            <div className="w-full max-w-md h-full bg-white rounded-3xl shadow-xl ring-1 ring-black/5 overflow-hidden">
              {previewPane(`side-${runId}`)}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen preview overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-[#06070A] flex flex-col">
          <div className="flex items-center gap-2 px-5 py-2.5 bg-[#13161D] text-white shrink-0">
            <Eye className="w-4 h-4 text-white/60" />
            <span className="text-xs font-semibold text-white/80">Preview em tela cheia</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={bump}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/40"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
              </button>
              <button
                onClick={() => setFullscreen(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#13161D] px-4 py-1.5 text-xs font-semibold hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" /> Fechar
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {previewPane(`fs-${runId}`)}
          </div>
        </div>
      )}
    </div>
  );
}
