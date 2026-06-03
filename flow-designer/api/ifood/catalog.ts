import type { VercelRequest, VercelResponse } from '@vercel/node'
import { UUID_RE, ifoodPrice, type ResearchProduct } from '../_lib/research-core.js'

export const config = { maxDuration: 60 }

// ---- iFood: importação de cardápio a partir do LINK da loja -------------
// O usuário informa (ou a busca descobre) o link público da loja no iFood;
// dele extraímos o store_id (UUID) e lemos o cardápio REAL via ator do Apify.
// Honesto por construção: sem APIFY_API_TOKEN nenhuma chamada é feita e a
// etapa responde { configured:false } — a UI assume "não disponível" e nunca
// finge. Nunca inventamos itens/preços: só repassamos o que o ator retornar.
const APIFY_ACTOR = process.env.IFOOD_APIFY_ACTOR || "xmJ7nVZ3VrxjuFpmc";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    // Normaliza o token: remove espaços e um prefixo "Bearer " que às vezes
    // vem junto na hora de colar — assim a chamada à Apify não falha por isso.
    const apifyToken = (process.env.APIFY_API_TOKEN || "")
      .trim()
      .replace(/^Bearer\s+/i, "")
      .trim();
    // Sem token do Apify → honesto: importação ainda não disponível.
    if (!apifyToken) {
      res.status(200).json({ configured: false }); return;
    }
    // O store_id (UUID) vem do LINK público da loja no iFood. Aceitamos o id
    // direto OU extraímos do url — nunca inventamos um id.
    const rawId = String(body.storeId || "").trim();
    const rawUrl = String(body.url || "").trim();
    const storeId =
      (rawId.match(UUID_RE) || [])[0] || (rawUrl.match(UUID_RE) || [])[0] || "";
    if (!storeId) {
      res.status(400).json({
        error: "Não encontrei o identificador da loja no link do iFood.",
      }); return;
    }

    // Lê o cardápio REAL via ator do Apify (run-sync, retorna os itens do
    // dataset). lat/long são opcionais para o ator; passamos só o store_id.
    let p: Record<string, unknown>[] = [];
    try {
      const apiRes = await fetch(
        `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxPages: 1,
            maxRetries: 1,
            maxReviews: 1,
            mode: "menu",
            proxyCountry: "BR",
            proxyGroups: ["RESIDENTIAL"],
            store_id: storeId,
            timeout: 120,
            useApifyProxy: true,
          }),
        },
      );
      const text = await apiRes.text();
      if (!apiRes.ok) {
        res.status(502).json({
          error: "Não consegui ler o cardápio da loja no iFood agora.",
          _status: apiRes.status,
          _raw: text.slice(0, 400),
        }); return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          // Shape inesperado (não é a lista do dataset) → falha honesta, em
          // vez de fingir que o cardápio está vazio.
          res.status(502).json({
            error: "Resposta inesperada ao ler o cardápio no iFood.",
            _raw: text.slice(0, 400),
          }); return;
        }
        p = parsed;
      } catch {
        // Resposta não-JSON → falha honesta (não tratamos como sem itens).
        res.status(502).json({
          error: "Resposta inválida ao ler o cardápio no iFood.",
          _raw: text.slice(0, 400),
        }); return;
      }
    } catch (err) {
      res.status(502).json({
        error: "Falha ao consultar o cardápio no iFood.",
        _raw: err instanceof Error ? err.message : String(err),
      }); return;
    }

    // Extrai produtos do payload do ator. Defensivo quanto ao shape; usa
    // SOMENTE valores retornados — nome e preço reais, nunca inventados.
    const root = (p[0] || {}) as Record<string, unknown>;
    const data = (root.data as Record<string, unknown>) || {};
    const categorias = Array.isArray(data.categories)
      ? (data.categories as Record<string, unknown>[])
      : [];
    const produtos: ResearchProduct[] = [];
    const seen = new Set<string>();
    for (const cat of categorias) {
      const items = Array.isArray(cat?.items) ? (cat.items as Record<string, unknown>[]) : [];
      for (const item of items) {
        const nome = String(
          (item?.description as string) || (item?.name as string) || "",
        ).trim();
        if (!nome || seen.has(nome.toLowerCase())) continue;
        seen.add(nome.toLowerCase());
        // unit_price é o preço cheio; quando o item exige escolhas ele vem 0
        // e o preço inicial fica em unit_min_price. Nunca inventamos valor.
        const preco =
          ifoodPrice(item?.unit_price) ||
          ifoodPrice(item?.unit_min_price) ||
          ifoodPrice(item?.unit_original_price);
        produtos.push({ nome, preco });
      }
    }

    res.status(200).json({
      connected: true,
      store: { id: storeId, name: String(data.name || "") },
      produtos,
    }); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
