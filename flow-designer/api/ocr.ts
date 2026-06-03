import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sanitizeOcr } from './_lib/research-core'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    const image = String(body.image || "").trim();
    if (!image.startsWith("data:image/")) {
      res.status(400).json({ error: "Imagem inválida." }); return;
    }
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      // Sem chave: não quebra o fluxo, apenas devolve vazio.
      res.status(200).json({ text: "" }); return;
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
              "Você transcreve prints de conversas (WhatsApp, Instagram, etc.). Extraia SOMENTE o texto das mensagens visíveis, mantendo a ordem e quebrando linhas entre mensagens. NÃO invente, traduza ou complete nada. Ignore horários, status de entrega, nomes de contato e elementos de interface. Se não houver texto legível, responda com string vazia. Responda apenas com o texto transcrito, sem comentários nem markdown.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva o texto das mensagens neste print:" },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 1500,
      }),
    });
    if (!orRes.ok) { res.status(200).json({ text: "" }); return; }
    const data: any = await orRes.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    res.status(200).json({ text: sanitizeOcr(raw) }); return;
  } catch {
    res.status(200).json({ text: "" }); return;
  }
}
