import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchGooglePlaces, webSearchWithFallback, extractJson, resolveGooglePhotos } from './_lib/research-core.js'

export const config = { maxDuration: 60 }

// Prioriza candidatos cuja cidade/UF batem com a que o usuário informou — sem
// descartar os demais (ficam no fim). Marcas grandes (ex.: Madero) podem ranquear
// uma unidade de outra cidade no topo; aqui garantimos que a cidade pedida venha
// primeiro. Comparação sem acento/caixa; casa por nome de cidade e/ou UF final.
const stripA = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const cityKey = (s: string): { city: string; uf: string } => {
  const n = stripA(s);
  const m = n.match(/^(.*?)\s*-\s*([a-z]{2})\s*$/);
  return m ? { city: m[1].trim(), uf: m[2] } : { city: n.replace(/[,].*$/, "").trim(), uf: "" };
};
function rankByCity<T extends { cidade?: string }>(cands: T[], requested: string): T[] {
  const r = cityKey(requested || "");
  if (!r.city && !r.uf) return cands;
  const score = (c: T): number => {
    const k = cityKey(String(c.cidade || ""));
    let s = 0;
    if (r.city && k.city && (k.city === r.city || k.city.includes(r.city) || r.city.includes(k.city))) s += 2;
    if (r.uf && k.uf && r.uf === k.uf) s += 1;
    return s;
  };
  return cands
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

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
    const city = String(body.city || "").trim();
    const site = String(body.site || "").trim();
    const instagram = String(body.instagram || "").trim();
    const bio = String(body.bio || "").trim();
    // ---- Etapa 0: Google Places primeiro -----------------------------
    // Determinístico e estruturado; só cai pro Perplexity se não achar.
    const gKey = process.env.GOOGLE_PLACES_API_KEY;
    if (gKey) {
      const gp = await fetchGooglePlaces(gKey, business, city);
      if (gp && gp.length) {
        const mapped = gp
          .map((c) => ({
            nome: c.nome,
            endereco: c.endereco,
            cidade: c.cidade,
            categoria: c.categoria,
            telefone: c.telefone,
            horario: c.horario,
            site: c.website,
            delivery: c.delivery,
            takeout: c.takeout,
            fotos: c.fotos || [],
          }))
          .filter((c) => c.endereco);
        // cidade pedida primeiro, depois corta em 4.
        const candidatos = rankByCity(mapped, city).slice(0, 4);
        if (candidatos.length) {
          // Resolve as fotos (nomes → URLs sem chave) só dos 4 finais, em
          // paralelo. A chave nunca vai pro cliente: só as URLs públicas.
          await Promise.all(
            candidatos.map(async (c) => {
              c.fotos = await resolveGooglePhotos(gKey, c.fotos || []);
            }),
          );
          res.status(200).json({ candidatos }); return;
        }
      }
    }

    const fontesOficiais = [
      site ? `o site oficial (${site})` : "",
      instagram ? `o Instagram (${instagram})` : "",
    ].filter(Boolean).join(" e ");

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      res.status(500).json({
        error: "OPENROUTER_API_KEY não configurada no ambiente.",
      }); return;
    }

    // ---- Etapa 1: pesquisa em TEXTO LIVRE com o Sonar Pro --------------
    // Forçar saída só-JSON faz o Sonar "desistir" e não buscar direito.
    // Em texto livre ele faz a busca web de verdade e acha negócios
    // pequenos/pouco conhecidos. Depois (etapa 2) estruturamos em JSON.
    const searchPrompt =
      `Pesquise na web informações REAIS e atuais sobre o estabelecimento "${business}"` +
      `${city ? ` localizado em "${city}"` : ""}. ` +
      `${fontesOficiais ? `O próprio negócio informou ${fontesOficiais} — comece por essas páginas (incluindo rodapé, "sobre" e "contato"), pois costumam trazer endereço, telefone e horário reais. ` : ""}` +
      `${bio ? `A bio do Instagram do negócio diz: "${bio}". Use como pista (pode conter bairro, telefone ou referência) — sem inventar. ` : ""}` +
      `O texto pode ter erros de digitação, falta de acentos ou abreviações ` +
      `(ex.: "sp" = São Paulo - SP, "bh" = Belo Horizonte - MG, "rj" = Rio de Janeiro - RJ); ` +
      `interprete a intenção mais provável e corrija a grafia. ` +
      `Para CADA unidade/filial que você encontrar, liste: o nome, o endereço completo ` +
      `(rua, número, bairro, cidade - UF), o telefone, o tipo de estabelecimento e o horário de funcionamento. ` +
      `Procure com afinco em fontes como Google Maps, Instagram, iFood, redes sociais e sites de avaliação — ` +
      `inclua até negócios pequenos e pouco conhecidos. Use apenas informações reais que encontrar — não invente. ` +
      `Só responda exatamente "NAO_ENCONTRADO" se, depois de procurar bem, tiver certeza de que esse estabelecimento não existe.`;

    // Busca com FALLBACK de modelo: Perplexity Sonar e, se ele não achar o
    // negócio, repete com o Gemini 2.5 Pro (:online) como pesquisador reserva.
    const { text: research } = await webSearchWithFallback(key, searchPrompt, {
      maxTokens: 900,
    });

    // Se nem o Sonar nem o fallback acharam nada, encerra sem estruturar.
    if (!research || /NAO_ENCONTRADO/i.test(research) || research.trim().length < 15) {
      res.status(200).json({ candidatos: [] }); return;
    }

    // ---- Etapa 2: estruturar o texto em JSON (sem inventar) ------------
    const formatSystem =
      "Você converte texto em JSON. Use SOMENTE informações presentes no texto fornecido — nunca invente endereços, telefones, horários ou nomes. Responda SOMENTE com JSON válido, sem markdown e sem texto extra.";
    const formatUser =
      `Texto da pesquisa:\n"""${research}"""\n\n` +
      `Extraia as unidades citadas para EXATAMENTE este formato JSON: ` +
      `{"candidatos":[{"nome":"nome da unidade","endereco":"localização conhecida","cidade":"Cidade - UF","categoria":"tipo de estabelecimento","telefone":"telefone com DDD","horario":"horário de funcionamento"}]}. ` +
      `Inclua no máximo 4 unidades. Inclua uma unidade mesmo que só haja a localização parcial conhecida — ` +
      `No campo "cidade", informe a cidade e UF corretas no formato "Cidade - UF", corrigindo abreviações ` +
      `e erros de digitação (ex.: "sp"/"sampa" → "São Paulo - SP"; "bh" → "Belo Horizonte - MG"; "rj" → "Rio de Janeiro - RJ"); se não souber, deixe vazio. ` +
      `use em "endereco" o nível mais específico citado no texto: rua e número se houver; senão bairro e cidade - UF; ` +
      `se for só delivery sem endereço, escreva a área de atendimento e "(somente delivery)" ` +
      `(ex.: "Barra Funda, São Paulo - SP (somente delivery)"). ` +
      `Em "telefone", coloque o telefone APENAS se aparecer no texto (com DDD, ex.: "(11) 99999-9999"); senão use "". ` +
      `No campo "horario", quando houver horário no texto, padronize EXATAMENTE neste formato: ` +
      `"Seg a Sex: 9h–18h; Sáb: 9h–13h; Dom: fechado" — use as abreviações Seg, Ter, Qua, Qui, Sex, Sáb, Dom; ` +
      `"h" nas horas (ex.: 9h, 14h30); "–" nas faixas; ";" entre grupos de dias; e "fechado" para dias sem expediente. ` +
      `NUNCA invente rua, número, telefone ou horário que não estejam no texto; se um campo não estiver no texto, use string vazia. ` +
      `Só retorne {"candidatos":[]} se o texto não trouxer NENHUMA localização real (nem bairro, cidade ou área de delivery).`;

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Sem reasoning: evita JSON truncado por estouro de orçamento.
        reasoning: { enabled: false },
        messages: [
          { role: "system", content: formatSystem },
          { role: "user", content: formatUser },
        ],
        max_tokens: 700,
      }),
    });

    const data: any = await orRes.json();
    if (!orRes.ok) {
      res.status(502).json({
        error: data?.error?.message || "Falha ao estruturar o resultado.",
      }); return;
    }

    const content: string = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    const candidatos = Array.isArray(parsed.candidatos)
      ? (parsed.candidatos as unknown[])
          .map((c) => {
            const rec = (c || {}) as Record<string, unknown>;
            const clean = (s: unknown) =>
              String(s || "")
                .replace(/&amp;/g, "&")
                .replace(/&nbsp;/g, " ")
                .trim();
            return {
              nome: clean(rec.nome),
              endereco: clean(rec.endereco),
              cidade: clean(rec.cidade),
              categoria: clean(rec.categoria),
              telefone: clean(rec.telefone),
              horario: clean(rec.horario),
            };
          })
          .filter((c) => c.endereco)
      : [];

    res.status(200).json({ candidatos: rankByCity(candidatos, city).slice(0, 4) }); return;
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    }); return;
  }
}
