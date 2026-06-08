import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractJson } from './_lib/research-core.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  let business = "";
  let city = "";
  try {
    // ── Modo "resumir avaliações" ─────────────────────────────────────────
    // Recebe textos de avaliações REAIS de clientes (Google) e devolve 3-5
    // destaques curtos do que os clientes mais elogiam + uma frase de resumo.
    // É prova social / linguagem do cliente pro onboarding e pro marketing.
    // Fail-open: sem chave/erro → {destaques:[],resumo:""}.
    const reviewsReq = (body as Record<string, unknown>).reviews as
      | { business?: string; textos?: unknown }
      | undefined;
    if (reviewsReq && typeof reviewsReq === "object") {
      const textos = Array.isArray(reviewsReq.textos)
        ? (reviewsReq.textos as unknown[])
            .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
            .map((t) => t.slice(0, 600))
            .slice(0, 8)
        : [];
      const rKey = process.env.OPENROUTER_API_KEY;
      if (!rKey || textos.length === 0) { res.status(200).json({ destaques: [], resumo: "" }); return; }
      try {
        const rRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${rKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            reasoning: { enabled: false },
            messages: [
              {
                role: "system",
                content:
                  "Você lê avaliações REAIS de clientes de um negócio e resume o que eles mais elogiam. " +
                  "Use SOMENTE o que está nas avaliações — nunca invente. Responda em pt-BR, SOMENTE JSON. " +
                  "Formato: {\"destaques\":[\"3 a 5 pontos fortes curtos, 1-3 palavras cada, ex: 'atendimento atencioso','brigadeiro gourmet'\"],\"resumo\":\"uma frase curta do que os clientes amam\"}. " +
                  "Foque em pontos POSITIVOS recorrentes (comida, atendimento, ambiente, entrega). Ignore reclamações isoladas.",
              },
              {
                role: "user",
                content:
                  `Negócio: "${String(reviewsReq.business || "").slice(0, 120)}"\n\nAvaliações:\n` +
                  textos.map((t, i) => `${i + 1}. ${t}`).join("\n"),
              },
            ],
            max_tokens: 300,
          }),
        });
        if (!rRes.ok) { res.status(200).json({ destaques: [], resumo: "" }); return; }
        const rData: any = await rRes.json();
        const parsed = extractJson(rData?.choices?.[0]?.message?.content || "");
        const destaques = Array.isArray(parsed.destaques)
          ? (parsed.destaques as unknown[])
              .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
              .map((d) => d.trim().slice(0, 40))
              .slice(0, 5)
          : [];
        res.status(200).json({ destaques, resumo: typeof parsed.resumo === "string" ? parsed.resumo.trim() : "" });
        return;
      } catch {
        res.status(200).json({ destaques: [], resumo: "" }); return;
      }
    }

    // ── Modo "filtrar fotos" (visão) ──────────────────────────────────────
    // Recebe uma lista de URLs de imagem e usa um modelo de VISÃO pra manter só
    // as que mostram o PRODUTO/pratos/itens do negócio — descartando logos,
    // banners promocionais, anúncios, texto, fachadas e gráficos genéricos.
    // Fail-open: sem chave/erro → mantém todas (nunca some com as fotos).
    const imagesReq = (body as Record<string, unknown>).classifyImages as
      | { urls?: unknown }
      | undefined;
    if (imagesReq && typeof imagesReq === "object") {
      const urls = Array.isArray(imagesReq.urls)
        ? (imagesReq.urls as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, 12)
        : [];
      const allIdx = urls.map((_, i) => i);
      const iKey = process.env.OPENROUTER_API_KEY;
      if (!iKey || urls.length <= 3) { res.status(200).json({ keep: allIdx }); return; }
      try {
        const content: Record<string, unknown>[] = [
          {
            type: "text",
            text:
              "Você escolhe FOTOS do produto pra vitrine de um negócio. " +
              "MANTENHA toda imagem que for PREDOMINANTEMENTE uma fotografia do produto — prato/comida/bebida/item à venda ou o resultado do serviço (a comida ocupa a maior parte do quadro). Uma marca d'água pequena ou um logo discreto NÃO desqualifica uma boa foto de comida. " +
              "DESCARTE imagens que são PEÇAS DE DESIGN/PROPAGANDA, não foto de produto: cartazes/banners/posts de campanha ou evento com texto grande, slogan ou chamada (ex.: 'ARENA COCO BAMBU', 'A NOSSA SELEÇÃO ESTÁ CONVOCADA'), logotipos, selos, botões, pessoas posando para a marca, fachadas, salão/ambiente vazio, mapas, prints e gráficos. " +
              "Critério: se mais da metade da imagem é texto/arte/propaganda → DESCARTE; se é majoritariamente a comida/produto → MANTENHA. Na dúvida entre foto de comida e propaganda, fique com a foto de comida. " +
              "Responda SOMENTE JSON: {\"keep\":[índices base-0 das fotos de produto, melhores primeiro]}.",
          },
        ];
        for (const u of urls) content.push({ type: "image_url", image_url: { url: u } });
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 40000);
        const iRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${iKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            reasoning: { enabled: false },
            messages: [{ role: "user", content }],
            max_tokens: 120,
          }),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer));
        if (!iRes.ok) { res.status(200).json({ keep: allIdx }); return; }
        const iData: any = await iRes.json();
        const parsed = extractJson(iData?.choices?.[0]?.message?.content || "");
        const keepRaw = Array.isArray(parsed.keep) ? parsed.keep : [];
        const keep = keepRaw
          .map((n: unknown) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n >= 0 && n < urls.length);
        // dedupe preservando ordem; se vier vazio, mantém todas (fail-open).
        const seen = new Set<number>();
        const out = keep.filter((n: number) => (seen.has(n) ? false : (seen.add(n), true)));
        res.status(200).json({ keep: out.length ? out : allIdx }); return;
      } catch {
        res.status(200).json({ keep: allIdx }); return;
      }
    }

    // ── Modo "sugerir emojis" ─────────────────────────────────────────────
    // Sugere emojis que combinam com o tom de voz + tipo de negócio + bio do
    // Instagram. Usado quando o lojista escolhe usar emojis "sempre/às vezes".
    const emojisReq = (body as Record<string, unknown>).emojis as
      | { tom?: string; business?: string; bio?: string; setor?: string; avoid?: unknown }
      | undefined;
    if (emojisReq && typeof emojisReq === "object") {
      const avoid = Array.isArray(emojisReq.avoid)
        ? (emojisReq.avoid as unknown[]).filter((e) => typeof e === "string").slice(0, 40)
        : [];
      const eKey = process.env.OPENROUTER_API_KEY;
      if (!eKey) { res.status(200).json({ emojis: [] }); return; }
      try {
        const eRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${eKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            reasoning: { enabled: false },
            messages: [
              {
                role: "system",
                content:
                  "Sugira de 6 a 10 emojis que combinem com a MARCA: use o tom de voz, o ramo do negócio e a bio do Instagram fornecidos. " +
                  "Escolha emojis que o negócio realmente usaria no atendimento (produtos, clima, setor). Sem repetir. " +
                  (avoid.length
                    ? `NÃO use nenhum destes (já foram sugeridos): ${avoid.join(" ")}. Traga um conjunto DIFERENTE. `
                    : "") +
                  "Cada item DEVE ser um ÚNICO emoji Unicode — NUNCA palavras, texto ou descrições (ex.: nada de \"familia\", use 👨‍👩‍👧). " +
                  "Responda SOMENTE JSON: {\"emojis\":[\"🍫\",\"🧁\", ...]}.",
              },
              {
                role: "user",
                content:
                  `Negócio: "${String(emojisReq.business || "").slice(0, 120)}"\n` +
                  `Ramo/CNAE: "${String(emojisReq.setor || "").slice(0, 160)}"\n` +
                  `Tom de voz: "${String(emojisReq.tom || "").slice(0, 200)}"\n` +
                  `Bio do Instagram: "${String(emojisReq.bio || "").slice(0, 200)}"`,
              },
            ],
            max_tokens: 120,
          }),
        });
        if (!eRes.ok) { res.status(200).json({ emojis: [] }); return; }
        const eData: any = await eRes.json();
        const parsed = extractJson(eData?.choices?.[0]?.message?.content || "");
        const list = Array.isArray(parsed.emojis) ? parsed.emojis : [];
        // normaliza removendo o seletor de variação (U+FE0F) — senão "🍫" e "🍫️"
        // contam como diferentes e emojis repetidos passam pelo filtro de "avoid".
        const stripVS = (s: string) => s.replace(/️/g, "");
        const avoidSet = new Set(avoid.map(stripVS));
        // Só aceita tokens que são DE FATO emoji: tem pictograma e nenhuma letra.
        // Bloqueia o modelo de devolver palavras soltas (ex.: "familia") como item.
        const isEmoji = (s: string) => {
          const t = s.trim();
          return !!t && !/\p{L}/u.test(t) && /\p{Extended_Pictographic}/u.test(t);
        };
        res.status(200).json({
          emojis: list
            .filter((e: unknown) => typeof e === "string" && isEmoji(e as string) && !avoidSet.has(stripVS(e as string)))
            .slice(0, 10),
        });
        return;
      } catch {
        res.status(200).json({ emojis: [] }); return;
      }
    }

    // ── Modo "classificar resposta" ───────────────────────────────────────
    // Decide se o texto que o usuário digitou É uma resposta plausível à pergunta
    // do onboarding, ou se é OFF-TOPIC (outra pergunta, pedido aleatório, sem
    // sentido). Se for off-topic e for uma pergunta, já devolve uma resposta breve.
    // Usado pra: entender qualquer coisa que o usuário digite, responder e voltar
    // pro onboarding — sem aceitar bobagem como se fosse a resposta.
    const classify = (body as Record<string, unknown>).classify as
      | { question?: string; answer?: string; business?: string }
      | undefined;
    if (classify && typeof classify === "object") {
      const cKey = process.env.OPENROUTER_API_KEY;
      const cQuestion = String(classify.question || "").trim().slice(0, 500);
      const cAnswer = String(classify.answer || "").trim().slice(0, 500);
      if (!cKey || !cAnswer) { res.status(200).json({ offtopic: false, reply: "" }); return; }
      try {
        const cRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            reasoning: { enabled: false },
            messages: [
              {
                role: "system",
                content:
                  "Você ajuda no onboarding de um negócio. Recebe a PERGUNTA do assistente e o TEXTO que o usuário digitou. " +
                  "Decida se o TEXTO é uma resposta plausível à PERGUNTA (offtopic=false) ou se é fora de contexto — " +
                  "outra pergunta, um pedido aleatório, um comentário, ou algo sem sentido (offtopic=true). " +
                  "Seja TOLERANTE: nomes de negócio incomuns, cidades, gírias, respostas curtas ('sp', 'aqui mesmo') SÃO respostas válidas (offtopic=false). " +
                  "Só marque offtopic=true quando claramente NÃO responde à pergunta. " +
                  "Se offtopic=true E for uma pergunta que dá pra responder, escreva em 'reply' uma resposta BREVE e amigável em pt-BR (1-2 frases); " +
                  "se for sem sentido, 'reply' deve ser um pedido gentil pra responder a pergunta (ex.: 'Não entendi bem 🙂'). " +
                  "Se offtopic=false, 'reply' deve ser \"\". Responda SOMENTE JSON: {\"offtopic\":bool,\"reply\":\"...\"}.",
              },
              {
                role: "user",
                content: `PERGUNTA do assistente: "${cQuestion}"\nTEXTO do usuário: "${cAnswer}"`,
              },
            ],
            max_tokens: 300,
          }),
        });
        if (!cRes.ok) { res.status(200).json({ offtopic: false, reply: "" }); return; }
        const cData: any = await cRes.json();
        const parsed = extractJson(cData?.choices?.[0]?.message?.content || "");
        res.status(200).json({
          offtopic: parsed.offtopic === true,
          reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
        });
        return;
      } catch {
        // falha → não bloqueia: trata como resposta válida.
        res.status(200).json({ offtopic: false, reply: "" }); return;
      }
    }

    // ── Modo "pergunte qualquer coisa" ────────────────────────────────────
    // Consolidado AQUI (em vez de um /api/ask separado) para o deploy caber no
    // limite de 12 Serverless Functions do plano Hobby da Vercel. Se o corpo
    // trouxer `question`, respondemos a pergunta paralela e retornamos {answer}.
    const question = String((body as Record<string, unknown>).question || "").trim().slice(0, 1000);
    if (question) {
      const askKey = process.env.OPENROUTER_API_KEY;
      if (!askKey) { res.status(200).json({ answer: "" }); return; }
      const askBiz = String(body.business || "").trim();
      const askRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${askKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          reasoning: { enabled: false },
          messages: [
            {
              role: "system",
              content:
                "Você é o assistente do Squad ajudando um lojista durante o onboarding. " +
                "O usuário fez uma pergunta paralela (fora do roteiro). Responda de forma " +
                "BREVE, correta e amigável, em português do Brasil (1 a 3 frases). " +
                "Nunca invente: se não souber, diga que não sabe. Não repita a pergunta. " +
                (askBiz ? `O negócio dele se chama "${askBiz}". ` : "") +
                "Depois desta resposta o onboarding continua normalmente.",
            },
            { role: "user", content: question },
          ],
          max_tokens: 400,
        }),
      });
      if (!askRes.ok) { res.status(200).json({ answer: "" }); return; }
      const askData: any = await askRes.json();
      const answer = String(askData?.choices?.[0]?.message?.content || "").trim();
      res.status(200).json({ answer }); return;
    }

    business = String(body.business || "").trim();
    city = String(body.city || "").trim();
    if (!business && !city) {
      res.status(200).json({ business: "", city: "" }); return;
    }
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      // Sem chave: devolve o que veio, sem quebrar o fluxo.
      res.status(200).json({ business, city }); return;
    }
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        reasoning: { enabled: false },
        messages: [
          {
            role: "system",
            content:
              "Você normaliza APENAS o nome de uma cidade brasileira que um usuário digitou: conserte capitalização, acentuação e expanda abreviações/apelidos comuns. NUNCA invente nem troque por outra cidade; se não reconhecer, só ajuste capitalização e acentos. Responda SOMENTE com JSON válido, sem markdown.",
          },
          {
            role: "user",
            content:
              `Normalize SOMENTE a cidade a seguir (deixe vazio se vier vazio):\n` +
              `cidade: "${city}"\n\n` +
              `Escreva o nome oficial com acentos e, quando óbvio, no formato "Cidade - UF" ` +
              `(ex.: "sp"/"sampa"/"sao paulo" → "São Paulo - SP"; "rj" → "Rio de Janeiro - RJ"; "bh" → "Belo Horizonte - MG"; "poa" → "Porto Alegre - RS"). ` +
              `Retorne EXATO: {"city":"..."}.`,
          },
        ],
        max_tokens: 200,
      }),
    });
    if (!orRes.ok) { res.status(200).json({ business, city }); return; }
    const data: any = await orRes.json();
    const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
    // Nome do negócio: mantém EXATAMENTE como o usuário digitou (não corrige).
    // Só a cidade é normalizada; cai pro valor digitado se o modelo vier vazio.
    const outCity = String(parsed.city || "").trim() || city;
    res.status(200).json({ business, city: outCity }); return;
  } catch {
    // Falha inesperada: devolve o que foi digitado, sem quebrar o fluxo.
    res.status(200).json({ business, city }); return;
  }
}
