import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    const key = process.env.SCRAPINGDOG_API_KEY;
    if (!key) {
      res.status(500).json({ error: "SCRAPINGDOG_API_KEY não configurada no ambiente." }); return;
    }
    const username = String(body.username || "")
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/\/.*$/, "")
      .trim();
    if (!username) {
      res.status(400).json({ error: "Campo 'username' é obrigatório." }); return;
    }
    const url = `https://api.scrapingdog.com/instagram/profile?api_key=${encodeURIComponent(key)}&username=${encodeURIComponent(username)}`;
    const apiRes = await fetch(url);
    const text = await apiRes.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Resposta da API de Instagram não é JSON.", _raw: text.slice(0, 500) }); return;
    }
    const p = (parsed || {}) as Record<string, unknown>;
    if (!apiRes.ok || (!p.username && !p.full_name)) {
      res.status(200).json({ encontrado: false }); return;
    }
    const links = Array.isArray(p.bio_links) ? (p.bio_links as Record<string, unknown>[]) : [];
    const link = links.length ? String(links[0]?.url || "") : "";
    res.status(200).json({
      encontrado: true,
      username: String(p.username || username),
      nome: String(p.full_name || ""),
      bio: String(p.bio || ""),
      seguidores: Number(p.followers_count || 0),
      seguindo: Number(p.following_count || 0),
      link,
      fotoPerfil: String(p.profile_pic_url || ""),
      ehComercial: Boolean(p.is_business_account),
    }); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
