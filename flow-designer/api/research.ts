import type { VercelRequest, VercelResponse } from '@vercel/node'
import { webSearchWithFallback, extractJson, type ResearchProduct } from './_lib/research-core.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      res.status(500).json({
        error: "OPENROUTER_API_KEY não configurada no ambiente.",
      }); return;
    }

    const business = String(body.business || "").trim();
    if (!business) {
      res.status(400).json({ error: "Campo 'business' é obrigatório." }); return;
    }
    const site = String(body.site || "").trim();
    const instagram = String(body.instagram || "").trim();
    const setor = String(body.setor || "").trim();

    const pistas = [
      site ? `site oficial: ${site}` : "",
      instagram ? `Instagram: ${instagram}` : "",
      setor ? `setor: ${setor}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const systemPrompt =
      "Você é um assistente de pesquisa de negócios brasileiro. Responda SOMENTE com JSON válido, sem markdown e sem texto extra. NUNCA invente dados (site, preços, telefones, endereços ou horários) — se não tiver certeza, use string vazia.";

    const userPrompt =
      `Pesquise o negócio brasileiro "${business}"${pistas ? ` (${pistas})` : ""}. ` +
      `Use o site e/ou o Instagram oficiais como fonte principal e extraia dados reais de lá. ` +
      `Retorne exatamente este formato JSON: ` +
      `{"resumo":"uma frase curta sobre o negócio","website":"","produtos":[{"nome":"...","preco":""}],"tom_de_voz":"frase curta descrevendo o tom e o estilo de comunicação do negócio","exemplo":"uma resposta curta (1 a 2 frases) que ESTE negócio daria no WhatsApp a um cliente perguntando se fazem determinado produto, NO MESMO TOM e estilo observados — sem inventar preços, telefones, endereços ou horários","horario_atendimento":"","telefone":"","endereco":""}. ` +
      `Liste até 6 produtos reais. Em "preco" de cada produto, coloque o valor APENAS se ele estiver realmente publicado na fonte (ex.: "R$ 25,00"); caso contrário use "". ` +
      `Preencha website, horario_atendimento, telefone e endereco SOMENTE com dados reais e confiáveis encontrados; caso contrário deixe "". NUNCA invente preços, telefones, endereços, horários ou site.`;

    // Pesquisa com FALLBACK de modelo (Sonar → Gemini :online). O isEmpty olha
    // o JSON: se não veio resumo, nem produtos, nem tom, nem exemplo, pede uma
    // segunda opinião ao pesquisador reserva antes de desistir.
    const { text: content, data } = await webSearchWithFallback(key, userPrompt, {
      system: systemPrompt,
      maxTokens: 750,
      isEmpty: (t) => {
        const p = extractJson(t);
        const temProd = Array.isArray(p.produtos) && p.produtos.length > 0;
        return !(p.resumo || temProd || p.tom_de_voz || p.tom || p.exemplo);
      },
    });
    const parsed = extractJson(content);

    const rawCitations: unknown[] = Array.isArray(
      (data as Record<string, unknown> | null)?.citations,
    )
      ? ((data as Record<string, unknown>).citations as unknown[])
      : [];
    const citations = rawCitations
      .map((c) => {
        const rec = c as Record<string, unknown>;
        const uc = rec?.url_citation as Record<string, unknown> | undefined;
        if (uc) return { title: String(uc.title || uc.url || ""), url: String(uc.url || "") };
        if (typeof c === "string") return { title: c, url: c };
        return { title: String(rec?.title || ""), url: String(rec?.url || "") };
      })
      .filter((c) => c.url)
      .slice(0, 5);

    const produtos: ResearchProduct[] = Array.isArray(parsed.produtos)
      ? (parsed.produtos as unknown[])
          .map((p) =>
            typeof p === "string"
              ? { nome: p, preco: "" }
              : {
                  nome: String((p as Record<string, unknown>)?.nome || ""),
                  preco: String((p as Record<string, unknown>)?.preco || ""),
                },
          )
          .filter((p) => p.nome)
          .slice(0, 6)
      : [];

    res.status(200).json({
      resumo: String(parsed.resumo || ""),
      website: String(parsed.website || ""),
      produtos,
      tom: String(parsed.tom_de_voz || parsed.tom || ""),
      exemplo: String(parsed.exemplo || ""),
      horario: String(parsed.horario_atendimento || parsed.horario || ""),
      telefone: String(parsed.telefone || ""),
      endereco: String(parsed.endereco || ""),
      citations,
    }); return;
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    }); return;
  }
}
