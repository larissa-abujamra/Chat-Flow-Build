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
