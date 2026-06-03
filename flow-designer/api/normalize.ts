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
    // ── Modo "sugerir emojis" ─────────────────────────────────────────────
    // Sugere emojis que combinam com o tom de voz + tipo de negócio + bio do
    // Instagram. Usado quando o lojista escolhe usar emojis "sempre/às vezes".
    const emojisReq = (body as Record<string, unknown>).emojis as
      | { tom?: string; business?: string; bio?: string; setor?: string }
      | undefined;
    if (emojisReq && typeof emojisReq === "object") {
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
        res.status(200).json({ emojis: list.filter((e: unknown) => typeof e === "string").slice(0, 10) });
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
