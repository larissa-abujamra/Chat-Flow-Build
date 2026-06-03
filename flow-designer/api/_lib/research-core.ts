export interface ResearchProduct {
  nome: string;
  preco: string;
}

export function extractJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  // Modelos às vezes embrulham o objeto num array (ex.: [ { "candidatos": [...] } ]).
  // Coage qualquer array para o primeiro objeto contido nele.
  const coerce = (v: unknown): Record<string, unknown> => {
    if (Array.isArray(v)) {
      const obj = v.find((x) => x && typeof x === "object" && !Array.isArray(x));
      return (obj as Record<string, unknown>) || {};
    }
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  };
  try {
    return coerce(JSON.parse(cleaned));
  } catch {
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return coerce(JSON.parse(match[0]));
      } catch {
        return {};
      }
    }
    return {};
  }
}

// Limpa a transcrição de um print: tira cercas de markdown e DESCARTA linhas que
// são comentário/recusa do modelo (ex.: "não consigo ler...", "desculpe...",
// "aqui está a transcrição:") em vez de texto real da conversa. Regra dura: na
// dúvida, devolve vazio — nunca deixa passar texto inventado/inferido pelo modelo.
export function sanitizeOcr(raw: string): string {
  const cleaned = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
  if (!cleaned) return "";
  // Recusas/respostas vazias inteiras → descarta tudo.
  const refusal =
    /^(desculpe|sinto muito|n[ãa]o (consigo|consegui|foi poss[íi]vel|h[áa] texto)|sem texto|imagem (vazia|ileg[íi]vel|sem))/i;
  if (refusal.test(cleaned)) return "";
  // Linhas de "moldura" típicas de comentário do assistente (não são conversa).
  const commentary =
    /^(aqui (est[áa]|v[ãa]o)|segue|transcri[çc][ãa]o|texto (transcrito|extra[íi]do)|observa[çc][ãa]o|nota:)/i;
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !commentary.test(l) && !refusal.test(l));
  return lines.join("\n").trim();
}

// Valida os dois dígitos verificadores do CNPJ — protege contra números
// "plausíveis" alucinados pelo modelo (que não passariam no checksum).
export function isValidCnpj(value: string): boolean {
  const cnpj = String(value || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string): number => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return (
    calc(cnpj.slice(0, 12)) === Number(cnpj[12]) &&
    calc(cnpj.slice(0, 13)) === Number(cnpj[13])
  );
}

export interface CnpjResult {
  encontrado: boolean;
  razaoSocial?: string;
  nomeFantasia?: string;
  endereco?: string;
  cidade?: string;
  telefone?: string;
  email?: string;
  situacao?: string;
  atividade?: string;
}

// Formata um número de telefone brasileiro (sem DDD) com hífen:
// 8 dígitos → 0000-0000 (fixo); 9 dígitos → 00000-0000 (celular).
// Se não bater, devolve só os dígitos. Nunca inventa: só reorganiza o que veio.
export function formatPhoneNumber(num: string): string {
  const d = String(num || "").replace(/\D/g, "");
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d || String(num || "").trim();
}

// Consulta os dados cadastrais reais na cpfcnpj.com.br e normaliza a resposta.
// Nunca inventa: campos ausentes voltam vazios.
export async function fetchCnpjData(
  token: string,
  pacote: string,
  cnpjDigits: string,
): Promise<CnpjResult> {
  const url = `https://api.cpfcnpj.com.br/${token}/${pacote}/${cnpjDigits}`;
  // Teto de tempo: a API da Receita às vezes pendura a conexão. Sem isto, a
  // correção manual de CNPJ (que aguarda esta chamada direto) congela o fluxo.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let apiRes: Response;
  let text: string;
  try {
    apiRes = await fetch(url, { signal: ctrl.signal });
    text = await apiRes.text();
  } catch {
    return { encontrado: false };
  } finally {
    clearTimeout(timer);
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return { encontrado: false };
  }
  if (!apiRes.ok || (parsed.status !== undefined && Number(parsed.status) !== 1)) {
    return { encontrado: false };
  }

  const end = (parsed.matrizEndereco || {}) as Record<string, unknown>;
  const s = (v: unknown) => String(v ?? "").trim();
  const ruaNum = [s(end.logradouro), s(end.numero)].filter(Boolean).join(", ");
  const enderecoPartes = [
    ruaNum,
    s(end.complemento),
    s(end.bairro),
    [s(end.cidade), s(end.uf)].filter(Boolean).join(" - "),
    s(end.cep),
  ].filter(Boolean);
  const endereco = enderecoPartes.join(", ");

  const tels = Array.isArray(parsed.telefones) ? parsed.telefones : [];
  let telefone = "";
  for (const t of tels) {
    const rec = (t || {}) as Record<string, unknown>;
    const ddd = s(rec.ddd);
    const num = s(rec.numero);
    if (ddd && num) {
      telefone = `(${ddd}) ${formatPhoneNumber(num)}`;
      break;
    }
    if (num) {
      telefone = formatPhoneNumber(num);
      break;
    }
  }

  const situacao = (parsed.situacao || {}) as Record<string, unknown>;
  const cnae = (parsed.cnae || {}) as Record<string, unknown>;

  return {
    encontrado: true,
    razaoSocial: s(parsed.razao),
    nomeFantasia: s(parsed.fantasia),
    endereco,
    cidade: [s(end.cidade), s(end.uf)].filter(Boolean).join(" - "),
    telefone,
    email: s(parsed.email),
    situacao: s(situacao.nome),
    atividade: s(cnae.descricao),
  };
}

export interface PlaceResult {
  nome: string;
  endereco: string;
  cidade: string;
  categoria: string;
  horario: string;
  telefone: string;
  website: string;
}

// Converte uma hora "HH:MM" para o formato compacto pt-BR: "09:00"→"9h",
// "14:30"→"14h30". Mantém o texto original se não casar.
export function normalizaHora(h: string): string {
  const m = h.trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return h.trim();
  const hh = String(parseInt(m[1], 10));
  const mm = m[2] === "00" ? "" : m[2];
  return `${hh}h${mm}`;
}

// Recebe a faixa de um dia (ex.: "11:45 – 22:30" ou "09:00–12:00, 14:00–18:00"
// ou "Fechado") e devolve "11h45–22h30" / "9h–12h, 14h–18h" / "fechado" / "24h".
// REGRA DE OURO: devolve null quando NÃO conseguir interpretar — nunca chuta
// "fechado" pra texto desconhecido (isso seria inventar que o negócio fecha).
export function normalizaFaixa(desc: string): string | null {
  const low = desc.toLowerCase();
  if (/fechado|encerrado|closed/.test(low)) return "fechado";
  if (/24\s*h|aberto 24|24\s*hours/.test(low)) return "24h";
  const horas = desc.match(/\d{1,2}:\d{2}/g) || [];
  if (horas.length < 2) return null;
  const pares: string[] = [];
  for (let i = 0; i + 1 < horas.length; i += 2) {
    pares.push(`${normalizaHora(horas[i])}–${normalizaHora(horas[i + 1])}`);
  }
  return pares.length ? pares.join(", ") : null;
}

// Condensa os weekdayDescriptions do Google (verbosos, um por dia) no mesmo
// formato compacto do fallback Perplexity: "Seg a Sex: 9h–18h; Sáb: 9h–13h;
// Dom: fechado" — agrupando dias consecutivos com o mesmo horário. Dias que não
// dá pra interpretar são OMITIDOS (nunca viram "fechado") e quebram o
// agrupamento, então "Seg a Sex" só aparece se os dias forem mesmo seguidos.
export function condensarHorario(weekday: string[]): string {
  const DIAS: [string, string][] = [
    ["segunda", "Seg"], ["terça", "Ter"], ["terca", "Ter"], ["quarta", "Qua"],
    ["quinta", "Qui"], ["sexta", "Sex"], ["sábado", "Sáb"], ["sabado", "Sáb"],
    ["domingo", "Dom"],
  ];
  const ordem = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const faixaPorDia: Record<string, string> = {};
  for (const linha of weekday) {
    const idx = linha.indexOf(":");
    if (idx < 0) continue;
    const diaRaw = linha.slice(0, idx).trim().toLowerCase();
    const resto = linha.slice(idx + 1).trim();
    const ab = DIAS.find(([full]) => diaRaw.startsWith(full));
    if (!ab) continue;
    const faixa = normalizaFaixa(resto);
    if (faixa === null) continue;
    faixaPorDia[ab[1]] = faixa;
  }
  const idxOf = (d: string) => ordem.indexOf(d);
  const seq = ordem.filter((d) => d in faixaPorDia).map((d) => ({ dia: d, faixa: faixaPorDia[d] }));
  if (!seq.length) return "";
  const grupos: { dias: string[]; faixa: string }[] = [];
  for (const item of seq) {
    const last = grupos[grupos.length - 1];
    const lastIdx = last ? idxOf(last.dias[last.dias.length - 1]) : -99;
    if (last && last.faixa === item.faixa && idxOf(item.dia) === lastIdx + 1) {
      last.dias.push(item.dia);
    } else {
      grupos.push({ dias: [item.dia], faixa: item.faixa });
    }
  }
  return grupos
    .map((g) => {
      const label = g.dias.length === 1 ? g.dias[0] : `${g.dias[0]} a ${g.dias[g.dias.length - 1]}`;
      return `${label}: ${g.faixa}`;
    })
    .join("; ");
}

// Busca os detalhes de UM place (telefone, horário, site, categoria) via
// Place Details (New). O Text Search (New) NÃO retorna o telefone — esse campo
// só vem pelo Place Details — então enriquecemos cada candidato aqui.
// Nunca inventa: o que a API não trouxer fica vazio.
export async function fetchGooglePlaceDetails(
  apiKey: string,
  placeId: string,
): Promise<{ telefone: string; horario: string; website: string; categoria: string }> {
  const empty = { telefone: "", horario: "", website: "", categoria: "" };
  if (!placeId) return empty;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "nationalPhoneNumber",
            "regularOpeningHours.weekdayDescriptions",
            "websiteUri",
            "primaryTypeDisplayName",
          ].join(","),
        },
      },
    );
    if (!res.ok) return empty;
    const pl = (await res.json()) as Record<string, any>;
    const s = (v: unknown) => String(v ?? "").trim();
    const wd = pl.regularOpeningHours?.weekdayDescriptions;
    return {
      telefone: s(pl.nationalPhoneNumber),
      horario: Array.isArray(wd) ? condensarHorario(wd) : "",
      website: s(pl.websiteUri),
      categoria: s(pl.primaryTypeDisplayName?.text),
    };
  } catch {
    return empty;
  }
}

// Busca o(s) estabelecimento(s) reais na Google Places API (Text Search, v1) e
// enriquece cada candidato com Place Details (telefone etc). Retorna dados
// oficiais — nunca inventa. Devolve null quando a chave falta, a API falha ou
// não há resultado, para que o chamador caia no fallback do Sonar Pro.
export async function fetchGooglePlaces(
  apiKey: string,
  business: string,
  city: string,
): Promise<PlaceResult[] | null> {
  try {
    const apiRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.nationalPhoneNumber",
          "places.regularOpeningHours.weekdayDescriptions",
          "places.primaryTypeDisplayName",
          "places.websiteUri",
          "places.addressComponents",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: [business, city].filter(Boolean).join(" "),
        languageCode: "pt-BR",
        regionCode: "BR",
        maxResultCount: 5,
      }),
    });
    if (!apiRes.ok) return null;
    const data = (await apiRes.json()) as Record<string, unknown>;
    const places = Array.isArray(data.places) ? (data.places as Record<string, any>[]) : [];
    if (!places.length) return null;
    const s = (v: unknown) => String(v ?? "").trim();
    const mapped = places.slice(0, 4).map((pl) => {
      const comps = Array.isArray(pl.addressComponents) ? pl.addressComponents : [];
      const findComp = (type: string, short = false) => {
        const c = comps.find(
          (cc: Record<string, any>) => Array.isArray(cc.types) && cc.types.includes(type),
        );
        return c ? s(short ? c.shortText : c.longText) : "";
      };
      const cityName = findComp("administrative_area_level_2") || findComp("locality");
      const uf = findComp("administrative_area_level_1", true);
      const wd = pl.regularOpeningHours?.weekdayDescriptions;
      return {
        id: s(pl.id),
        result: {
          nome: s(pl.displayName?.text) || business,
          endereco: s(pl.formattedAddress),
          cidade: [cityName, uf].filter(Boolean).join(" - "),
          categoria: s(pl.primaryTypeDisplayName?.text),
          horario: Array.isArray(wd) ? condensarHorario(wd) : "",
          telefone: s(pl.nationalPhoneNumber),
          website: s(pl.websiteUri),
        } as PlaceResult,
      };
    });

    // Enriquecimento: o Text Search não traz telefone (e às vezes falta
    // horário/site). Buscamos Place Details em paralelo para cada candidato e
    // preenchemos SOMENTE os campos que vieram vazios. Dados reais ou nada.
    await Promise.all(
      mapped.map(async (m) => {
        if (!m.id) return;
        if (m.result.telefone && m.result.horario && m.result.website) return;
        const det = await fetchGooglePlaceDetails(apiKey, m.id);
        if (!m.result.telefone) m.result.telefone = det.telefone;
        if (!m.result.horario) m.result.horario = det.horario;
        if (!m.result.website) m.result.website = det.website;
        if (!m.result.categoria) m.result.categoria = det.categoria;
      }),
    );

    const valid = mapped.map((m) => m.result).filter((c) => c.endereco);
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

export interface CatalogProduct {
  nome: string;
  preco: string;
}

// Normaliza a lista de produtos vinda do modelo (string ou objeto) para
// {nome, preco}, descartando itens sem nome e limitando a 8.
export function normalizeProdutos(raw: unknown): CatalogProduct[] {
  return Array.isArray(raw)
    ? (raw as unknown[])
        .map((p) =>
          typeof p === "string"
            ? { nome: p.trim(), preco: "" }
            : {
                nome: String((p as Record<string, unknown>)?.nome || "").trim(),
                preco: String((p as Record<string, unknown>)?.preco || "").trim(),
              },
        )
        .filter((p) => p.nome)
        .slice(0, 8)
    : [];
}

// Remove tags/scripts/estilos de um HTML e condensa em texto simples,
// pronto para ser enviado ao extrator (Gemini).
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extrai produtos de um TEXTO já coletado (scraping). Nunca inventa itens
// ou preços — usa apenas o que está no texto.
export async function extractProdutosFromText(
  orKey: string,
  text: string,
  business: string,
): Promise<CatalogProduct[]> {
  try {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Sem reasoning: evita que o modelo gaste o orçamento "pensando" e
        // devolva JSON truncado (mesma causa do bug do site-scrape).
        reasoning: { enabled: false },
        messages: [
          {
            role: "system",
            content:
              "Você extrai o catálogo/cardápio de um TEXTO já coletado da página oficial do negócio. Use SOMENTE o que está no texto — nunca invente itens ou preços. Responda SOMENTE com JSON válido, sem markdown.",
          },
          {
            role: "user",
            content:
              `Texto da página do negócio "${business}":\n"""${text}"""\n\n` +
              `Extraia os produtos/itens do catálogo no formato EXATO {"produtos":[{"nome":"...","preco":""}]}. ` +
              `Liste até 8 itens REAIS citados no texto. Em "preco", coloque o valor APENAS se ele aparecer no texto junto do item (ex.: "R$ 25,00"); caso contrário use "". ` +
              `Se o texto não contiver um catálogo/cardápio, retorne {"produtos":[]}.`,
          },
        ],
        max_tokens: 700,
      }),
    });
    if (!orRes.ok) return [];
    const data: any = await orRes.json();
    return normalizeProdutos(extractJson(data?.choices?.[0]?.message?.content || "").produtos);
  } catch {
    return [];
  }
}

// Baixa o HTML bruto de uma URL via scrapingdog (renderizando JS). Retorna ""
// em qualquer falha. Usado pela estratégia de scraping do catálogo.
export async function scrapeHtml(sdKey: string, rawUrl: string): Promise<string> {
  try {
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const sUrl = `https://api.scrapingdog.com/scrape?api_key=${encodeURIComponent(sdKey)}&url=${encodeURIComponent(url)}&dynamic=true`;
    const r = await fetch(sUrl);
    if (!r.ok) return "";
    return await r.text();
  } catch {
    return "";
  }
}

// ---- Detecção da loja no iFood via BUSCA na web (o Google já indexou as páginas
// do iFood). NUNCA raspa o iFood direto — o anti-bot deles bloqueia (dead end
// confirmado). Só usa URLs REAIS retornadas pela busca; nunca inventa link. O
// usuário SEMPRE confirma "é essa sua loja?" antes de qualquer coisa. ----------
export interface IfoodCandidate {
  nome: string;
  url: string;
  id?: string;
}

export const IFOOD_STORE_RE = /^https?:\/\/(www\.)?ifood\.com\.br\/delivery\//i;
export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractIfoodCandidates(organic: Record<string, unknown>[]): IfoodCandidate[] {
  const out: IfoodCandidate[] = [];
  const seen = new Set<string>();
  for (const r of organic) {
    const link = String((r?.link as string) || "").trim();
    if (!IFOOD_STORE_RE.test(link)) continue;
    let u: URL;
    try {
      u = new URL(link);
    } catch {
      continue;
    }
    const norm = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    if (seen.has(norm)) continue;
    seen.add(norm);
    const segs = u.pathname.split("/").filter(Boolean); // [delivery, cidade, slug, uuid?]
    const uuid = segs.find((s) => UUID_RE.test(s));
    let nome = String((r?.title as string) || "").trim();
    nome = nome.replace(/\s*[|\-–—:]\s*ifood.*$/i, "").replace(/\s+no ifood.*$/i, "").trim();
    if (!nome) {
      const slug = segs.length >= 3 ? segs[2] : "";
      nome = slug.replace(/-?[0-9a-f-]{8,}$/i, "").replace(/-/g, " ").trim();
    }
    out.push({ nome: nome || link, url: norm, id: uuid });
    if (out.length >= 6) break;
  }
  return out;
}

// Escolhe, ENTRE os candidatos reais, qual corresponde ao negócio. Só pode
// devolver um índice fornecido — nunca cria URL. -1/erro = nenhum com confiança.
export async function pickIfoodMatch(
  orKey: string,
  business: string,
  city: string,
  candidatos: IfoodCandidate[],
): Promise<IfoodCandidate | null> {
  if (candidatos.length === 1) return candidatos[0];
  try {
    const lista = candidatos.map((c, i) => `${i}: ${c.nome} — ${c.url}`).join("\n");
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        reasoning: { enabled: false },
        messages: [
          {
            role: "system",
            content:
              "Você decide qual resultado de busca é a loja oficial de um negócio no iFood. Escolha SOMENTE entre os candidatos fornecidos — nunca invente. Responda SOMENTE JSON.",
          },
          {
            role: "user",
            content:
              `Negócio: "${business}"${city ? `, cidade: "${city}"` : ""}.\n` +
              `Candidatos (índice: nome — url):\n${lista}\n\n` +
              `Qual índice corresponde a esse negócio? Se NENHUM corresponder com confiança, use -1. Responda {"index": <número>}.`,
          },
        ],
        max_tokens: 60,
      }),
    });
    if (!orRes.ok) return null;
    const data: any = await orRes.json();
    const idx = Number(extractJson(data?.choices?.[0]?.message?.content || "").index);
    if (Number.isInteger(idx) && idx >= 0 && idx < candidatos.length) return candidatos[idx];
    return null;
  } catch {
    return null;
  }
}

// Tokeniza um nome ignorando acentos/pontuação e palavras genéricas. Usado para
// casar o nome do negócio com o nome da loja no iFood de forma DETERMINÍSTICA.
export const IFOOD_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "restaurante", "lanchonete", "bar",
  "cafe", "loja", "delivery", "comida", "ifood",
]);
export function ifoodNormTokens(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
}

// Casamento DETERMINÍSTICO: escolhe o candidato cujo nome contém TODOS os tokens
// significativos do negócio (evita falso positivo). Desempata pela cidade na URL
// ou no nome. Retorna null se nenhum bate por completo — aí o Gemini decide. Isso
// existe porque o modelo às vezes responde -1 mesmo com a loja óbvia na lista.
export function pickIfoodDeterministic(
  business: string,
  city: string,
  candidatos: IfoodCandidate[],
): IfoodCandidate | null {
  const bizTokens = ifoodNormTokens(business).filter((t) => !IFOOD_STOPWORDS.has(t));
  if (!bizTokens.length) return null;
  const cityTokens = ifoodNormTokens(city).filter((t) => !IFOOD_STOPWORDS.has(t));
  let best: IfoodCandidate | null = null;
  let bestScore = -1;
  for (const c of candidatos) {
    const nameTokens = new Set(ifoodNormTokens(c.nome));
    const matched = bizTokens.filter((t) => nameTokens.has(t)).length;
    if (matched < bizTokens.length) continue; // exige TODOS os tokens do negócio
    let score = 100;
    const hay = `${c.url} ${c.nome}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    if (cityTokens.some((ct) => hay.includes(ct))) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

// Confirma que uma URL de loja do iFood REALMENTE existe no índice do Google
// (via scrapingdog), buscando pelo slug específico da loja (que inclui o UUID).
// Serve de RE-ANCORAGEM quando a URL veio de um modelo de linguagem (fallback de
// descoberta): uma URL inventada não aparece nos resultados reais e é descartada.
// Nunca confiamos só no texto do modelo para uma URL.
export async function verifyIfoodUrl(sdKey: string, url: string): Promise<boolean> {
  try {
    const slug = (url.split("/delivery/")[1] || "").split(/[?#]/)[0];
    const terms = slug.replace(/[-/]+/g, " ").replace(/\s+/g, " ").trim();
    if (!terms) return false;
    const gUrl =
      `https://api.scrapingdog.com/google?api_key=${encodeURIComponent(sdKey)}` +
      `&query=${encodeURIComponent(`site:ifood.com.br ${terms}`)}&country=br&results=10`;
    const r = await fetch(gUrl);
    if (!r.ok) return false;
    const raw = (await r.text()).toLowerCase();
    const norm = (u: string) =>
      u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
    return raw.includes(norm(url));
  } catch {
    return false;
  }
}

// Busca web com FALLBACK de modelo. Primeiro tenta o Perplexity Sonar Pro
// (especialista em busca web). Se ele não trouxer nada útil (vazio, curto demais
// ou "NAO_ENCONTRADO"), REPETE a MESMA pergunta com o Gemini 2.5 Pro no modo
// ":online" (plugin de busca web do OpenRouter) — um modelo forte de pesquisa
// como segunda opinião. Os dois recebem o mesmo prompt "no-invent"; quem consome
// ainda valida/estrutura o texto, então isto nunca inventa dados — só aumenta a
// chance de ACHAR algo real que o Perplexity sozinho não achou.
// Retorna o texto, a resposta crua (p/ citations) e qual modelo respondeu.
export async function webSearchWithFallback(
  key: string,
  prompt: string,
  opts?: {
    system?: string;
    maxTokens?: number;
    isEmpty?: (text: string) => boolean;
  },
): Promise<{ text: string; data: Record<string, unknown> | null; model: string }> {
  const maxTokens = opts?.maxTokens ?? 800;
  const isEmpty =
    opts?.isEmpty ??
    ((t: string) => !t || t.trim().length < 15 || /NAO_ENCONTRADO/i.test(t));
  const messages = opts?.system
    ? [
        { role: "system", content: opts.system },
        { role: "user", content: prompt },
      ]
    : [{ role: "user", content: prompt }];

  // Uma chamada ao OpenRouter com timeout (AbortController) e diagnóstico. NUNCA
  // lança — devolve {ok,status,text,error} pra quem chama decidir se tenta de novo.
  type Call = { ok: boolean; status: number; text: string; data: Record<string, unknown> | null; error?: string };
  const callOnce = async (body: Record<string, unknown>, timeoutMs: number): Promise<Call> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        let detail = "";
        try { detail = (await r.text()).slice(0, 200); } catch { /* ignore */ }
        return { ok: false, status: r.status, text: "", data: null, error: detail };
      }
      const d = (await r.json()) as Record<string, unknown>;
      const t: string =
        ((d?.choices as { message?: { content?: string } }[])?.[0]?.message?.content) || "";
      return { ok: true, status: r.status, text: t, data: d };
    } catch (e) {
      const name = (e as { name?: string })?.name;
      return { ok: false, status: 0, text: "", data: null, error: name === "AbortError" ? "timeout" : String((e as Error)?.message || e) };
    } finally {
      clearTimeout(timer);
    }
  };

  // Falhas transitórias (rede caída, timeout, 429 rate-limit, 5xx) merecem nova
  // tentativa; um 4xx "real" (ex.: 400/401) não. A busca de CNPJ depende 100%
  // disto, então um soluço momentâneo não pode zerar o cartão de contato.
  const transient = (status: number) => status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Tenta um modelo até `attempts` vezes, parando cedo num 4xx não-transitório.
  const tryModel = async (
    label: string,
    body: Record<string, unknown>,
    accept: (c: Call) => boolean,
    attempts: number,
    timeoutMs: number,
  ): Promise<Call | null> => {
    let last: Call | null = null;
    for (let i = 0; i < attempts; i++) {
      const c = await callOnce(body, timeoutMs);
      last = c;
      if (c.ok && accept(c)) return c;
      // 4xx não-transitório (auth/payload): não adianta repetir.
      if (!c.ok && !transient(c.status)) {
        console.warn(`[webSearchWithFallback] ${label} falhou (status ${c.status}): ${c.error || ""}`.trim());
        break;
      }
      if (i < attempts - 1) {
        console.warn(`[webSearchWithFallback] ${label} tentativa ${i + 1} sem resposta (status ${c.status}${c.error ? `, ${c.error}` : ""}); repetindo…`);
        await sleep(600 * (i + 1));
      }
    }
    return last;
  };

  // 1) Perplexity Sonar Pro — busca web nativa, com retries em falha transitória.
  const sonar = await tryModel(
    "Sonar",
    {
      model: "perplexity/sonar-pro",
      messages,
      max_tokens: maxTokens,
      web_search_options: { search_context_size: "high" },
    },
    (c) => !isEmpty(c.text),
    2,
    20000,
  );
  if (sonar && sonar.ok && !isEmpty(sonar.text)) {
    return { text: sonar.text, data: sonar.data, model: "perplexity/sonar-pro" };
  }

  // 2) Fallback: Gemini 2.5 Pro com busca web (:online). Reasoning DESLIGADO para
  // não estourar o orçamento de tokens (ver memória) e devolver o texto completo.
  const gemini = await tryModel(
    "Gemini :online",
    {
      model: "google/gemini-2.5-pro:online",
      reasoning: { enabled: false },
      messages,
      max_tokens: maxTokens,
    },
    // mesma régua do Sonar: respostas vazias/sem sinal (NAO_ENCONTRADO/junk)
    // disparam nova tentativa em vez de encerrar cedo.
    (c) => !isEmpty(c.text),
    2,
    20000,
  );
  if (gemini && gemini.ok && gemini.text) {
    return { text: gemini.text, data: gemini.data, model: "google/gemini-2.5-pro:online" };
  }

  // Distingue "nenhum modelo respondeu" (provável indisponibilidade) de um
  // "não encontrado" real — o chamador degrada para vazio, mas fica no log.
  console.warn(
    `[webSearchWithFallback] nenhum modelo respondeu (Sonar status ${sonar?.status ?? "?"}${sonar?.error ? `/${sonar.error}` : ""}; Gemini status ${gemini?.status ?? "?"}${gemini?.error ? `/${gemini.error}` : ""}).`,
  );
  return { text: "", data: null, model: "" };
}

// Hosts de "agregadores de link" (a bio do Instagram quase sempre aponta pra um
// deles). A página em si é só uma LISTA de botões — o cardápio fica um clique
// adiante, então precisamos seguir o link certo.
export const LINK_HUB_HOSTS =
  /(^|\.)(linktr\.ee|linkin\.bio|bio\.link|beacons\.ai|campsite\.bio|lnk\.bio|linkbio\.co|msha\.ke|linke\.bio|linktree\.|solo\.to|tap\.bio|znap\.link|flowpage\.com|allmylinks\.com)/i;

export function hostOf(rawUrl: string): string {
  try {
    return new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).hostname;
  } catch {
    return "";
  }
}

// Portão anti-SSRF/open-proxy: antes de seguir um link RASPADO (origem não
// confiável) só permitimos http/https público. Bloqueia localhost, .local e
// literais de IP privados/reservados/link-local (inclui o IP de metadados de
// nuvem 169.254.169.254). Não fazemos resolução DNS aqui de propósito — o fetch
// real é feito pela scrapingdog (fora da nossa rede), então o risco é literais.
export function isSafePublicUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return false;
  // IPv6 literal entre colchetes — bloqueia loopback/ULA/link-local.
  if (host.startsWith("[")) {
    if (/^\[(::1|::|fc|fd|fe80|::ffff:)/i.test(host)) return false;
    return true;
  }
  // IPv4 literal — bloqueia faixas privadas/reservadas.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local + metadados
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast/reservado
  }
  return true;
}

// Extrai os links (<a href>) de um HTML, resolvendo URLs relativas contra a
// página de origem e descartando âncoras/js/mailto/tel.
export function extractLinks(html: string, baseUrl: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    // Decodifica entidades comuns em URLs (&amp; → &) antes de resolver.
    const rawHref = m[1].trim().replace(/&amp;/gi, "&");
    if (!rawHref || /^(#|javascript:|mailto:|tel:)/i.test(rawHref)) continue;
    let abs = "";
    try {
      abs = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(abs) || seen.has(abs)) continue;
    seen.add(abs);
    out.push({ url: abs, label: htmlToText(m[2]).slice(0, 80) });
  }
  return out;
}

// Pontua cada link por probabilidade de ser o cardápio/catálogo e devolve o
// melhor (ou null). Olha tanto o texto do botão quanto a URL de destino.
export function pickCatalogLink(
  links: { url: string; label: string }[],
  sourceUrl: string,
): string | null {
  const srcHost = hostOf(sourceUrl);
  const srcEhHub = LINK_HUB_HOSTS.test(srcHost);
  // Plataformas/termos que indicam cardápio ou loja online; peso maior = mais forte.
  const KW: [RegExp, number][] = [
    [/ifood/i, 10],
    [/goomer|anota\.?ai|cardapioweb|cardap\.io|menudino|abrahao|saipos|delivery\s*direto|neemo|aiqfome/i, 10],
    [/card[aá]pio|menu\b/i, 9],
    [/cat[aá]logo/i, 8],
    [/fazer\s*pedido|pe[cç]a|pedir|pedido|comprar|loja|store|shop/i, 6],
    [/delivery|tele?\s*entrega|whatsapp.*pedido/i, 4],
  ];
  let best: string | null = null;
  let bestScore = 0;
  for (const { url, label } of links) {
    // Inclui no "texto pontuável" o destino REAL embutido em params de redirect
    // (ex.: /out?url=https%3A%2F%2F...ifood...), pra escolher pelo alvo e não
    // pela ordem em páginas de hub com vários /out.
    let hay = `${label} ${url}`;
    try {
      const q = new URL(url).searchParams;
      for (const k of ["url", "u", "l", "link", "target", "redirect", "to", "dest"]) {
        const v = q.get(k);
        if (v) hay += ` ${decodeURIComponent(v)}`;
      }
    } catch {
      /* mantém o hay básico */
    }
    const host = hostOf(url);
    // Ignora links pra redes sociais/mapas (nunca são cardápio).
    if (/instagram\.com|facebook\.com|wa\.me|api\.whatsapp\.com|youtu|tiktok|maps\.|goo\.gl\/maps/i.test(url))
      continue;
    // Mesmo host que a origem: normalmente é navegação do próprio site/hub e é
    // ignorado — EXCETO quando a origem é um hub e o link é um endpoint de
    // redirect (que encaminha pro destino externo; a scrapingdog segue o 3xx).
    if (host && host === srcHost) {
      const pareceRedirect = /\/(out|redirect|r|go|link|url)(\/|\?|$)/i.test(url);
      if (!(srcEhHub && pareceRedirect)) continue;
    }
    let score = 0;
    for (const [re, w] of KW) if (re.test(hay)) score += w;
    // Hub redirect sem palavra-chave ainda vale um ponto-base (o destino real só
    // aparece depois do 3xx), mas só se a origem for hub.
    if (score === 0 && srcEhHub && host === srcHost) score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  // Limiar mínimo: evita seguir um link fraco (gasto/latência à toa). Aceita
  // sinal forte (≥6) OU um redirect de hub (score-base 1).
  return bestScore >= 6 || (bestScore >= 1 && srcEhHub) ? best : null;
}

// "Riqueza" de uma lista: nº de itens + bônus por itens com preço. Usada para
// escolher, entre duas raspagens, a que trouxe o catálogo mais completo.
export function catalogRichness(arr: CatalogProduct[]): number {
  return arr.length + arr.filter((p) => p.preco).length * 2;
}

// Estratégia A: scraping da página (site oficial ou link da bio do Instagram)
// via scrapingdog + extração dos produtos. Se a página for um agregador de
// links (Linktree etc.) ou não render produtos, SEGUE o link de cardápio mais
// provável e raspa a página de destino. Nunca inventa itens/preços.
export async function fetchCatalogByScrape(
  sdKey: string,
  orKey: string,
  rawUrl: string,
  business: string,
): Promise<CatalogProduct[]> {
  try {
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const html = await scrapeHtml(sdKey, url);
    if (!html) return [];
    const text = htmlToText(html).slice(0, 7000);
    let produtos = text.length >= 40 ? await extractProdutosFromText(orKey, text, business) : [];

    // Segue o link de cardápio quando: a fonte é um hub de links OU a raspagem
    // direta não rendeu produtos. Apenas UM salto (controla custo/latência).
    const ehHub = LINK_HUB_HOSTS.test(hostOf(url));
    if (ehHub || produtos.length === 0) {
      const alvo = pickCatalogLink(extractLinks(html, url), url);
      // Normaliza pra evitar re-raspar a MESMA URL por diferença de formatação
      // (barra final, caixa do host etc.).
      const urlNorm = (() => {
        try {
          return new URL(url).toString();
        } catch {
          return url;
        }
      })();
      // Só segue se passar no portão anti-SSRF e não for a MESMA URL já raspada.
      if (alvo && alvo !== urlNorm && isSafePublicUrl(alvo)) {
        const html2 = await scrapeHtml(sdKey, alvo);
        const text2 = html2 ? htmlToText(html2).slice(0, 7000) : "";
        if (text2.length >= 40) {
          const produtos2 = await extractProdutosFromText(orKey, text2, business);
          // Prefere a lista mais rica (mais itens / mais preços).
          if (catalogRichness(produtos2) > catalogRichness(produtos)) produtos = produtos2;
        }
      }
    }
    return produtos;
  } catch {
    return [];
  }
}

// Extrai os metadados de maior sinal (título + descrições) do HTML bruto.
// São o melhor resumo/tom da página e quase sempre vêm renderizados no <head>,
// mesmo quando o corpo é montado por JS. Nunca inventa: só lê o que está lá.
export function extractMeta(html: string): string {
  const pick = (re: RegExp): string => {
    const m = html.match(re);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogSite = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  const kw = pick(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
  const parts = [
    ogSite && `Site: ${ogSite}`,
    (title || ogTitle) && `Título: ${title || ogTitle}`,
    (desc || ogDesc) && `Descrição: ${desc || ogDesc}`,
    kw && `Palavras-chave: ${kw}`,
  ].filter(Boolean);
  return parts.join("\n");
}

// Extrai o @ do Instagram a partir do HTML bruto do site (links no rodapé,
// botões de redes sociais). Mais confiável que pedir ao modelo. Nunca inventa:
// só retorna se houver um link REAL para instagram.com na página.
export function extractInstagramFromHtml(html: string): string {
  const bad =
    /^(p|reel|reels|explore|accounts|about|developer|legal|privacy|tv|stories|share|direct|web|tags|locations)$/i;
  const matches = html.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,40})/gi);
  for (const m of matches) {
    const handle = m[1].replace(/\/+$/, "");
    if (handle && !bad.test(handle)) return `@${handle}`;
  }
  return "";
}

export interface SiteInfo {
  resumo: string;
  produtos: CatalogProduct[];
  tom: string;
  exemplo: string;
  instagram: string;
  telefone: string;
  endereco: string;
  horario: string;
}

// Extrai o MÁXIMO de informações reais a partir do texto já coletado da página
// oficial, usando um modelo forte (Gemini 2.5 Pro). Nunca inventa preços,
// telefones, endereços, horários ou perfis — usa apenas o que está no texto.
export async function extractSiteInfo(
  orKey: string,
  text: string,
  business: string,
): Promise<SiteInfo | null> {
  try {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Desliga o "reasoning": o Gemini 2.5 consumia TODO o orçamento de tokens
        // pensando (reasoning_tokens) e devolvia JSON truncado (finish_reason:
        // "length") — por isso resumo/tom/produtos vinham vazios. Sem reasoning,
        // o modelo usa o orçamento na resposta e o JSON sai completo.
        reasoning: { enabled: false },
        messages: [
          {
            role: "system",
            content:
              "Você analisa o TEXTO da página oficial de um negócio brasileiro e extrai informações REAIS. NUNCA invente dados (preços, telefones, endereços, horários, perfis). Responda SOMENTE com JSON válido, sem markdown.",
          },
          {
            role: "user",
            content:
              `Texto do site do negócio "${business}":\n"""${text}"""\n\n` +
              `Retorne EXATO este JSON: {"resumo":"uma frase curta sobre o negócio","produtos":[{"nome":"...","preco":""}],"tom_de_voz":"frase curta descrevendo o tom e o estilo de comunicação observados no texto (ex.: caloroso e informal; sóbrio e técnico)","exemplo":"uma resposta curta (1 a 2 frases) que ESTE negócio daria no WhatsApp a um cliente perguntando se fazem determinado produto, escrita NO MESMO TOM e estilo do site — sem inventar preços, telefones, endereços ou horários","instagram":"@perfil oficial do Instagram se aparecer no texto, senão vazio","telefone":"","endereco":"","horario":""}. ` +
              `Liste até 8 produtos REAIS citados; em "preco" use o valor só se publicado, senão "". ` +
              `Preencha telefone, endereco e horario SOMENTE se aparecerem no texto; caso contrário "". NUNCA invente.`,
          },
        ],
        max_tokens: 1500,
      }),
    });
    if (!orRes.ok) return null;
    const data: any = await orRes.json();
    const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
    const rawIg = String(parsed.instagram || "").trim().replace(/^@/, "");
    const igClean = /^[A-Za-z0-9._]{2,40}$/.test(rawIg) ? `@${rawIg}` : "";
    return {
      resumo: String(parsed.resumo || "").trim(),
      produtos: normalizeProdutos(parsed.produtos),
      tom: String(parsed.tom_de_voz || parsed.tom || "").trim(),
      exemplo: String(parsed.exemplo || "").trim(),
      instagram: igClean,
      telefone: String(parsed.telefone || "").trim(),
      endereco: String(parsed.endereco || "").trim(),
      horario: String(parsed.horario || "").trim(),
    };
  } catch {
    return null;
  }
}

// Formata um preço numérico do iFood em BRL. Sem valor → "" (nunca inventa).
export const ifoodPrice = (v: unknown): string => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
};
