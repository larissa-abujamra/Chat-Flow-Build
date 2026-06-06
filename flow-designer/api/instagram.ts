import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

// Junta as legendas reais dos posts/reels recentes do perfil. Nunca inventa:
// usa só o texto que veio do scraper. Deduplica (pelo início da legenda),
// normaliza espaços, corta cada legenda em 600 chars e devolve no máximo 15.
function collectCaptions(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const s = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!s) return;
    const dedupeKey = s.slice(0, 80).toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(s.slice(0, 600));
  };
  const media = (p.owner_to_timeline_media as Record<string, unknown> | undefined)?.media;
  if (Array.isArray(media)) for (const m of media) push((m as Record<string, unknown>)?.caption);
  const videos = (p.video_timeline as Record<string, unknown> | undefined)?.videos;
  if (Array.isArray(videos)) for (const v of videos) push((v as Record<string, unknown>)?.caption);
  return out.slice(0, 15);
}

// Junta as imagens dos posts recentes (display_url) — assets visuais reais da
// marca pro onboarding. Dedup + cap. Só URLs reais; nunca inventa.
function collectPostImages(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const media = (p.owner_to_timeline_media as Record<string, unknown> | undefined)?.media;
  if (Array.isArray(media)) {
    for (const m of media) {
      const url = String((m as Record<string, unknown>)?.display_url || "").trim();
      if (url && !seen.has(url)) { seen.add(url); out.push(url); }
    }
  }
  return out.slice(0, 8);
}

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
    // Legendas dos posts recentes — a melhor amostra do JEITO DE FALAR da marca.
    // O scraper de perfil já devolve até ~12 posts (owner_to_timeline_media) e os
    // vídeos/reels (video_timeline), cada um com seu `caption`. Coletamos o texto
    // real (sem inventar), deduplicamos e limitamos pra alimentar a análise de tom.
    const captions = collectCaptions(p);
    res.status(200).json({
      encontrado: true,
      username: String(p.username || username),
      nome: String(p.full_name || ""),
      bio: String(p.bio || ""),
      seguidores: Number(p.followers_count || 0),
      seguindo: Number(p.following_count || 0),
      link,
      fotoPerfil: String(p.profile_pic_url_hd || p.profile_pic_url || ""),
      ehComercial: Boolean(p.is_business_account),
      captions,
      postImages: collectPostImages(p),
    }); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
