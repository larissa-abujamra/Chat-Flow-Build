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

  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      res.status(500).json({ error: "OPENROUTER_API_KEY não configurada no ambiente." }); return;
    }
    let text = String(body.text || "").trim();
    if (!text) {
      res.status(400).json({ error: "Campo 'text' é obrigatório." }); return;
    }
    if (text.length > 12000) text = text.slice(0, 12000);

    const systemPrompt =
      "Você analisa o ESTILO e o TOM DE VOZ de conversas reais de atendimento de um negócio brasileiro. " +
      "Responda SOMENTE com JSON válido, sem markdown e sem texto extra. " +
      "Descreva apenas o jeito de escrever (formalidade, gírias, emojis, simpatia, ritmo). " +
      "NUNCA invente nem extraia fatos do negócio (preços, telefones, endereços, produtos, horários).";

    const userPrompt =
      "Abaixo estão trechos de conversas/atendimentos reais. " +
      "Analise como a EMPRESA escreve (não o cliente). " +
      'Retorne exatamente este JSON: {"tom":"de 3 a 6 palavras descrevendo o tom, ex: descontraído, direto e simpático","exemplo":"uma resposta curta (1 a 2 frases) que a empresa daria nesse mesmo tom a um cliente, SEM citar preços, telefones ou endereços específicos"}.\n\n' +
      "CONVERSAS:\n" +
      text;

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "perplexity/sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
      }),
    });
    const data: any = await orRes.json();
    if (!orRes.ok) {
      res.status(502).json({
        error: data?.error?.message || "Falha ao consultar o OpenRouter.",
      }); return;
    }
    const content: string = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    res.status(200).json({
      tom: String(parsed.tom || "").trim(),
      exemplo: String(parsed.exemplo || "").trim(),
    }); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
