import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractJson } from './_lib/research-core'

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
              "Você normaliza textos que um usuário brasileiro digitou. Apenas conserte a grafia: capitalização correta, acentuação e expansão de abreviações/apelidos comuns de cidades. NUNCA invente, traduza ou troque o nome por outro negócio; se não reconhecer, só ajuste capitalização e acentos. Responda SOMENTE com JSON válido, sem markdown.",
          },
          {
            role: "user",
            content:
              `Normalize os campos a seguir (deixe vazio o que vier vazio):\n` +
              `nome do negócio: "${business}"\n` +
              `cidade: "${city}"\n\n` +
              `Para a cidade, escreva o nome oficial com acentos e, quando óbvio, no formato "Cidade - UF" ` +
              `(ex.: "sp"/"sampa"/"sao paulo" → "São Paulo - SP"; "rj" → "Rio de Janeiro - RJ"; "bh" → "Belo Horizonte - MG"; "poa" → "Porto Alegre - RS"). ` +
              `Para o nome do negócio, use capitalização e acentos corretos, preservando siglas/estilizações próprias da marca. ` +
              `Retorne EXATO: {"business":"...","city":"..."}.`,
          },
        ],
        max_tokens: 200,
      }),
    });
    if (!orRes.ok) { res.status(200).json({ business, city }); return; }
    const data: any = await orRes.json();
    const parsed = extractJson(data?.choices?.[0]?.message?.content || "");
    // Fallback para o valor digitado se o modelo devolver vazio.
    const outBiz = String(parsed.business || "").trim() || business;
    const outCity = String(parsed.city || "").trim() || city;
    res.status(200).json({ business: outBiz, city: outCity }); return;
  } catch {
    // Falha inesperada: devolve o que foi digitado, sem quebrar o fluxo.
    res.status(200).json({ business, city }); return;
  }
}
