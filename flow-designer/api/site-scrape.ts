import type { VercelRequest, VercelResponse } from '@vercel/node'
import { htmlToText, extractInstagramFromHtml, extractMeta, extractSiteInfo, extractImages, isSafePublicUrl } from './_lib/research-core.js'

export const config = { maxDuration: 60 }

// Hosts de CDN de imagem que o navegador NÃO consegue exibir por hotlink (bloqueio
// por referer): Instagram/Facebook, iFood e Google. Só ESTES podem passar pelo
// proxy de imagem — allowlist fechada pra evitar SSRF (a página jamais aponta
// pra rede interna). O server fetch não manda referer, então a imagem volta.
function isProxyableImageHost(host: string): boolean {
  return /(^|\.)(fbcdn\.net|cdninstagram\.com|ifood\.com\.br|googleusercontent\.com)$/i.test(host);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  // ── Proxy de imagem (GET ?img=URL) ────────────────────────────────────
  // Reexibe fotos da marca cujo CDN bloqueia hotlink (Instagram/iFood): busca a
  // imagem no servidor (sem referer) e devolve os bytes pela NOSSA origem.
  if (req.method === 'GET') {
    const raw = String((req.query?.img as string) || "").trim();
    // Valida cada URL (inclusive cada salto de redirect) contra a allowlist de
    // host + o portão anti-SSRF. Só http(s) público de um CDN conhecido passa.
    const allowed = (target: string): URL | null => {
      let x: URL | null = null;
      try { x = new URL(target); } catch { return null; }
      if (x.protocol !== "https:" && x.protocol !== "http:") return null;
      if (!isSafePublicUrl(target) || !isProxyableImageHost(x.hostname)) return null;
      return x;
    };
    let cur = allowed(raw);
    if (!cur) { res.status(400).json({ error: "URL de imagem inválida ou não permitida." }); return; }
    try {
      // SSRF: NÃO seguimos redirect automaticamente — cada salto é revalidado
      // (host allowlistado + IP público), com teto de saltos. Um 302 pra rede
      // interna é barrado em vez de seguido cegamente.
      let r: Response | null = null;
      for (let hop = 0; hop < 4; hop++) {
        r = await fetch(cur.toString(), { redirect: "manual" });
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get("location");
          const next = loc ? allowed(new URL(loc, cur).toString()) : null;
          if (!next) { res.status(400).end(); return; }
          cur = next;
          continue;
        }
        break;
      }
      if (!r) { res.status(502).end(); return; }
      // XSS: só imagens RASTER. SVG (image/svg+xml) é HTML executável servido na
      // nossa origem → recusado. nosniff + CSP/sandbox como defesa extra caso o
      // tipo seja confundido no futuro.
      const ct = (r.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      if (!r.ok || !/^image\/(jpeg|jpg|png|webp|gif|avif|bmp)$/.test(ct)) { res.status(415).end(); return; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 6_000_000) { res.status(413).end(); return; } // teto 6MB
      res.setHeader("Content-Type", ct);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.status(200).end(buf); return;
    } catch {
      res.status(502).end(); return;
    }
  }

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
    // Anti-SSRF: só raspamos URLs http(s) públicas. Bloqueia localhost, redes
    // privadas e o IP de metadados de nuvem (169.254.169.254). Nenhum site real
    // de cliente cai aqui, então não afeta o fluxo legítimo.
    if (!isSafePublicUrl(url)) {
      res.status(400).json({ error: "URL de site inválida ou não permitida." }); return;
    }
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
    const imagens = extractImages(html, url);
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
      imagens,
      source: info ? "scrape" : "none",
    }); return;
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    }); return;
  }
}
