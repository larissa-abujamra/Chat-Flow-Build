import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchCnpjData } from './_lib/research-core.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    const token = process.env.CPFCNPJ_TOKEN;
    if (!token) {
      res.status(500).json({ error: "CPFCNPJ_TOKEN não configurado no ambiente." }); return;
    }
    const cnpjDigits = String(body.cnpj || "").replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      res.status(400).json({ error: "CNPJ inválido (precisa ter 14 dígitos)." }); return;
    }
    // Pacote 6 = CNPJ D (dados completos: endereço, telefones, e-mail, etc.).
    // Configurável caso o token só tenha outro pacote contratado.
    const pacote = String(process.env.CPFCNPJ_PACKAGE || "6");
    const result = await fetchCnpjData(token, pacote, cnpjDigits);
    res.status(200).json(result); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
