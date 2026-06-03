import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  type IfoodCandidate,
  extractIfoodCandidates,
  webSearchWithFallback,
  verifyIfoodUrl,
  pickIfoodDeterministic,
  pickIfoodMatch,
} from '../_lib/research-core.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    const business = String(body.business || "").trim();
    const city = String(body.city || "").trim();
    if (!business) {
      res.status(400).json({ error: "Campo 'business' é obrigatório." }); return;
    }
    const sdKey = process.env.SCRAPINGDOG_API_KEY;
    if (!sdKey) { res.status(200).json({ found: false }); return; }

    const query = `${business} ${city} site:ifood.com.br`.replace(/\s+/g, " ").trim();
    const gUrl =
      `https://api.scrapingdog.com/google?api_key=${encodeURIComponent(sdKey)}` +
      `&query=${encodeURIComponent(query)}&country=br&results=10`;

    let candidatos: IfoodCandidate[] = [];
    try {
      const gr = await fetch(gUrl);
      if (gr.ok) {
        const raw = await gr.text();
        let gj: Record<string, unknown> = {};
        try {
          gj = JSON.parse(raw);
        } catch {
          /* resposta não-JSON */
        }
        const organicRaw = gj.organic_results ?? gj.organic_data;
        const organic = Array.isArray(organicRaw)
          ? (organicRaw as Record<string, unknown>[])
          : [];
        candidatos = extractIfoodCandidates(organic);
        // Fallback robusto a mudança de shape: varre o JSON cru por URLs de
        // loja do iFood (sem título — nome vem do slug da URL).
        if (!candidatos.length) {
          const urls = raw.match(/https?:\/\/(www\.)?ifood\.com\.br\/delivery\/[^\s"'\\]+/gi) || [];
          candidatos = extractIfoodCandidates(urls.map((link) => ({ link, title: "" })));
        }
      }
    } catch {
      /* busca falhou — trata como não encontrado */
    }

    const orKey = process.env.OPENROUTER_API_KEY;

    // Fallback de DESCOBERTA: se a busca no Google (scrapingdog) não trouxe
    // nenhuma loja, pergunta a um modelo de PESQUISA (Sonar → Gemini :online)
    // qual é a URL da loja no iFood. Só aceitamos URLs REAIS de loja
    // (ifood.com.br/delivery/...) extraídas da resposta — nunca inventadas.
    if (!candidatos.length && orKey) {
      const prompt =
        `Encontre a página OFICIAL da loja do estabelecimento "${business}"` +
        `${city ? ` em "${city}"` : ""} no iFood (site ifood.com.br). ` +
        `Responda APENAS com a URL completa da loja no formato ` +
        `https://www.ifood.com.br/delivery/... — e somente se ela existir de verdade. ` +
        `Se o negócio não tiver loja no iFood, responda exatamente NAO_ENCONTRADO. ` +
        `NUNCA invente uma URL.`;
      const { text } = await webSearchWithFallback(orKey, prompt, { maxTokens: 300 });
      const urls =
        text.match(/https?:\/\/(www\.)?ifood\.com\.br\/delivery\/[^\s"'\\)\]]+/gi) || [];
      const raw = extractIfoodCandidates(urls.map((link) => ({ link, title: "" })));
      // RE-ANCORAGEM anti-invenção: o modelo pode devolver uma URL plausível
      // mas inexistente. Só aceitamos candidatos cuja URL REALMENTE aparece no
      // índice do Google (scrapingdog) — URL fabricada não passa.
      const verificados: IfoodCandidate[] = [];
      for (const c of raw) {
        if (await verifyIfoodUrl(sdKey, c.url)) verificados.push(c);
      }
      candidatos = verificados;
    }

    if (!candidatos.length) { res.status(200).json({ found: false }); return; }

    // Casa primeiro de forma DETERMINÍSTICA (confiável); só recorre ao
    // Gemini quando o nome do negócio não bate direto com nenhum candidato.
    let best = pickIfoodDeterministic(business, city, candidatos);
    if (!best && orKey) best = await pickIfoodMatch(orKey, business, city, candidatos);
    if (!best) { res.status(200).json({ found: false }); return; }
    res.status(200).json({ found: true, loja: best }); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
