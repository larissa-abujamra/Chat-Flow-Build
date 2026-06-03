import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchCatalogByScrape, isSafePublicUrl } from './_lib/research-core.js'

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
    if (!business) {
      res.status(400).json({ error: "Campo 'business' é obrigatório." }); return;
    }
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) {
      res.status(500).json({ error: "OPENROUTER_API_KEY não configurada no ambiente." }); return;
    }
    const sdKey = process.env.SCRAPINGDOG_API_KEY;
    const site = String(body.site || "").trim();
    // Anti-SSRF: normaliza e exige URL http(s) pública (bloqueia localhost,
    // redes privadas e 169.254.169.254). URL insegura → sem catálogo, como se
    // não houvesse site raspável (coerente com o "nunca inventa itens").
    const siteUrl = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : "";
    const siteSafe = !!siteUrl && isSafePublicUrl(siteUrl);

    // Catálogo SÓ via scraping do site / link da bio (Linktree etc.).
    // Sem site/link raspável não há catálogo (nunca inventamos itens).
    const produtos =
      siteSafe && sdKey
        ? await fetchCatalogByScrape(sdKey, orKey, site, business)
        : [];
    const source = produtos.length ? "scrape" : "none";

    res.status(200).json({ produtos, source }); return;
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    }); return;
  }
}
