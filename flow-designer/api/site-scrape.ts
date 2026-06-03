import type { VercelRequest, VercelResponse } from '@vercel/node'
import { htmlToText, extractInstagramFromHtml, extractMeta, extractSiteInfo } from './_lib/research-core'

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
    const rawSite = String(body.site || "").trim();
    if (!rawSite) {
      res.status(400).json({ error: "Campo 'site' é obrigatório." }); return;
    }
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) {
      res.status(500).json({ error: "OPENROUTER_API_KEY não configurada no ambiente." }); return;
    }
    const sdKey = process.env.SCRAPINGDOG_API_KEY;
    if (!sdKey) {
      res.status(500).json({ error: "SCRAPINGDOG_API_KEY não configurada no ambiente." }); return;
    }

    const url = /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;
    // Renderiza JS (dynamic=true): a maioria dos sites de PME (Wix, React,
    // etc.) monta o conteúdo — e os links de redes sociais do rodapé — no
    // cliente, então sem renderizar o HTML volta vazio. Cai pro modo leve
    // (dynamic=false) se o renderizado vier curto demais.
    const fetchHtml = async (dynamic: boolean): Promise<string> => {
      const sUrl = `https://api.scrapingdog.com/scrape?api_key=${encodeURIComponent(sdKey)}&url=${encodeURIComponent(url)}&dynamic=${dynamic}`;
      try {
        const r = await fetch(sUrl);
        return r.ok ? await r.text() : "";
      } catch {
        return "";
      }
    };
    let html = await fetchHtml(true);
    if (htmlToText(html).length < 40) {
      const fallback = await fetchHtml(false);
      if (htmlToText(fallback).length > htmlToText(html).length) html = fallback;
    }

    const igFromHtml = extractInstagramFromHtml(html);
    const meta = extractMeta(html);
    const bodyText = htmlToText(html).slice(0, 9000);
    // Prioriza os metadados (título/descrição) — maior sinal — e completa
    // com o texto do corpo. Em SPAs o corpo costuma ser ruído de navegação.
    const text = [meta, bodyText].filter(Boolean).join("\n\n").slice(0, 9500);
    const info = text.length >= 40 ? await extractSiteInfo(orKey, text, business) : null;
    const instagram = igFromHtml || info?.instagram || "";

    res.status(200).json({
      resumo: info?.resumo || "",
      produtos: info?.produtos || [],
      tom: info?.tom || "",
      exemplo: info?.exemplo || "",
      instagram,
      telefone: info?.telefone || "",
      endereco: info?.endereco || "",
      horario: info?.horario || "",
      source: info ? "scrape" : "none",
    }); return;
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    }); return;
  }
}
