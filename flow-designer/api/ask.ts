import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

// Assistente "pergunte qualquer coisa" durante o onboarding: o lojista pode
// virar no meio do fluxo e perguntar algo geral (ex.: "qual a capital do
// Brasil?"). Respondemos de forma breve e o fluxo continua de onde parou.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}
  const question = String(body.question || '').trim().slice(0, 1000)
  const business = String(body.business || '').trim()
  if (!question) { res.status(400).json({ error: "Campo 'question' é obrigatório." }); return }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) { res.status(200).json({ answer: '' }); return }

  try {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        reasoning: { enabled: false },
        messages: [
          {
            role: 'system',
            content:
              'Você é o assistente do Squad ajudando um lojista durante o onboarding. ' +
              'O usuário fez uma pergunta paralela (fora do roteiro). Responda de forma ' +
              'BREVE, correta e amigável, em português do Brasil (1 a 3 frases). ' +
              'Nunca invente: se não souber, diga que não sabe. Não repita a pergunta. ' +
              (business ? `O negócio dele se chama "${business}". ` : '') +
              'Depois desta resposta o onboarding continua normalmente.',
          },
          { role: 'user', content: question },
        ],
        max_tokens: 400,
      }),
    })
    if (!orRes.ok) { res.status(200).json({ answer: '' }); return }
    const data: any = await orRes.json()
    const answer = String(data?.choices?.[0]?.message?.content || '').trim()
    res.status(200).json({ answer }); return
  } catch {
    res.status(200).json({ answer: '' }); return
  }
}
