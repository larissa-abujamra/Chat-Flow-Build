import type { VercelRequest, VercelResponse } from '@vercel/node'
import { webSearchWithFallback, formatPhoneNumber, isValidCnpj, fetchCnpjData } from './_lib/research-core.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {}

  try {
    const key = process.env.OPENROUTER_API_KEY;
    const token = process.env.CPFCNPJ_TOKEN;
    if (!key) {
      res.status(500).json({ error: "OPENROUTER_API_KEY não configurada no ambiente." }); return;
    }
    if (!token) {
      res.status(500).json({ error: "CPFCNPJ_TOKEN não configurado no ambiente." }); return;
    }
    const business = String(body.business || "").trim();
    if (!business) {
      res.status(400).json({ error: "Campo 'business' é obrigatório." }); return;
    }
    const city = String(body.city || "").trim();
    const site = String(body.site || "").trim();
    const instagram = String(body.instagram || "").trim();
    const bio = String(body.bio || "").trim();
    const fontesOficiais = [
      site ? `o site oficial (${site})` : "",
      instagram ? `o Instagram (${instagram})` : "",
    ].filter(Boolean).join(" e ");

    const searchPrompt =
      `Pesquise na web o CNPJ oficial, o horário de funcionamento, o site oficial e o Instagram do estabelecimento "${business}"` +
      `${city ? ` localizado em "${city}"` : ""}. ` +
      `${fontesOficiais ? `O próprio negócio informou ${fontesOficiais} — verifique essas páginas primeiro (rodapé, "sobre", termos de uso), pois é onde o CNPJ e o horário costumam aparecer. ` : ""}` +
      `${bio ? `A bio do Instagram do negócio diz: "${bio}". Pode conter pistas úteis — sem inventar. ` : ""}` +
      `Procure em fontes confiáveis: site oficial (rodapé/página "sobre"/termos), redes sociais, Google Maps, iFood, ` +
      `e cadastros públicos de CNPJ (ex.: ReceitaWS, cnpj.biz, econodata, casa dos dados). ` +
      `Use SOMENTE dados reais que encontrar — NUNCA invente o número do CNPJ, o telefone, o site nem o Instagram. ` +
      `No FINAL da resposta, escreva EXATAMENTE estas cinco linhas:\n` +
      `CNPJ: <somente o número com 14 dígitos que apareça nas fontes, ou NAO_ENCONTRADO se não tiver certeza>\n` +
      `HORARIO: <horário no formato "Seg a Sex: 9h–18h; Sáb: 9h–13h; Dom: fechado" (abreviações Seg/Ter/Qua/Qui/Sex/Sáb/Dom, "h" nas horas, "–" nas faixas, ";" entre grupos, "fechado" quando não abre), ou deixe vazio se não souber>\n` +
      `TELEFONE: <telefone oficial de contato no formato "(11) 99999-9999"; deixe vazio se não tiver certeza>\n` +
      `SITE: <somente o domínio do site oficial do próprio negócio, ex.: nome.com.br — sem http e sem caminho; deixe vazio se não tiver certeza ou se for página de terceiros (iFood, Instagram, Google)>\n` +
      `INSTAGRAM: <somente o @ do perfil oficial no Instagram, ex.: @nome; deixe vazio se não tiver certeza>`;

    // Busca com FALLBACK de modelo (Sonar → Gemini :online). É "vazio" quando
    // não há CNPJ nem nenhuma das pistas (site/@/horário/telefone) — aí vale
    // a pena pedir uma segunda opinião ao pesquisador reserva.
    const dead = /^(vazio|n[aã]o|nao|n\/a|none|null|nenhum|-|—)$/i;
    const { text: txt } = await webSearchWithFallback(key, searchPrompt, {
      maxTokens: 700,
      isEmpty: (t) => {
        if (!t || t.trim().length < 15) return true;
        const lineVal = (label: string) => {
          const m = t.match(new RegExp(`${label}:\\s*(.+)`, "i"));
          const first = m ? m[1].trim().split(/\s/)[0] : "";
          return first && !dead.test(first) ? first : "";
        };
        const hasCnpj = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(t);
        return !(
          hasCnpj ||
          lineVal("INSTAGRAM") ||
          lineVal("SITE") ||
          lineVal("HORARIO") ||
          lineVal("TELEFONE")
        );
      },
    });

    // Horário: linha "HORARIO: ..."
    const horarioMatch = txt.match(/HORARIO:\s*(.+)/i);
    let horario = horarioMatch ? horarioMatch[1].trim() : "";
    if (/^(vazio|n[aã]o|nao|n\/a|-+|—+|none|null)$/i.test(horario)) horario = "";

    const vazio = (s: string) =>
      /^(vazio|n[aã]o|nao|n\/a|-+|—+|none|null|nenhum)$/i.test(s.trim());

    // Telefone: linha "TELEFONE: ..." — fallback quando a Receita/places
    // não trazem o número. EXTRAI só o padrão de telefone BR e reformata,
    // pra não vazar marcadores de citação (ex.: «”**.[2]») no número.
    const telMatch = txt.match(/TELEFONE:\s*(.+)/i);
    let telParsed = "";
    if (telMatch && !vazio(telMatch[1].trim())) {
      const telHit = telMatch[1].match(/\(?\d{2}\)?[\s.\-]?\d{4,5}[\s.\-]?\d{4}/);
      const telDigits = telHit ? telHit[0].replace(/\D/g, "") : "";
      if (telDigits.length === 10 || telDigits.length === 11) {
        telParsed = `(${telDigits.slice(0, 2)}) ${formatPhoneNumber(telDigits.slice(2))}`;
      }
    }

    // Site: linha "SITE: ..." — só o domínio, nunca inventado.
    const siteMatch = txt.match(/SITE:\s*(.+)/i);
    let siteOut = siteMatch ? siteMatch[1].trim() : "";
    siteOut = siteOut
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[\s/)\]]/)[0]
      .replace(/[.,;]+$/, "")
      .trim();
    if (vazio(siteOut) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(siteOut)) siteOut = "";
    if (/instagram\.com|facebook\.com|ifood\.com|google\.|maps\./i.test(siteOut)) siteOut = "";

    // Instagram: linha "INSTAGRAM: ..." — só o @handle, nunca inventado.
    const igMatch = txt.match(/INSTAGRAM:\s*(.+)/i);
    let instagramOut = igMatch ? igMatch[1].trim() : "";
    instagramOut = instagramOut
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .split(/[\s/?)\]]/)[0]
      .replace(/[.,;]+$/, "")
      .trim();
    if (vazio(instagramOut) || !/^[a-z0-9._]{2,30}$/i.test(instagramOut)) instagramOut = "";

    // Consistência: a busca ampla às vezes acha o CNPJ/telefone mas perde o
    // Instagram e/ou o site (resultado parcial — por isso "ora vinha, ora
    // não"). Esta busca DIRIGIDA, só do que faltou e usando o nome oficial,
    // é bem mais determinística. Nunca inventa: exige @handle/domínio
    // plausível e "vazio" se incerto; falha silenciosa não trava o fluxo.
    const enrichIgSite = async (nome: string): Promise<void> => {
      if ((instagramOut && siteOut) || !nome) return;
      try {
        const alvo =
          !instagramOut && !siteOut
            ? "o site oficial e o perfil OFICIAL no Instagram"
            : !instagramOut
              ? "o perfil OFICIAL no Instagram"
              : "o site OFICIAL";
        const followPrompt =
          `Pesquise na web ${alvo} do negócio "${nome}"` +
          `${business && nome.toLowerCase() !== business.toLowerCase() ? ` (também conhecido como "${business}")` : ""}` +
          `${city ? `, em "${city}"` : ""}. ` +
          `Use SOMENTE dados reais; se não tiver certeza, deixe vazio — NUNCA invente. ` +
          `Responda EXATAMENTE estas linhas:\n` +
          (!siteOut
            ? `SITE: <domínio do site oficial do próprio negócio, ex.: nome.com.br — sem http e sem caminho; vazio se incerto ou se for página de terceiros (iFood/Instagram/Google)>\n`
            : "") +
          (!instagramOut ? `INSTAGRAM: <somente o @ do perfil oficial, ex.: @nome; vazio se incerto>` : "");
        const { text: ftxt } = await webSearchWithFallback(key, followPrompt, {
          maxTokens: 200,
          isEmpty: (t) => {
            if (!t) return true;
            const pick = (label: string) => {
              const m = t.match(new RegExp(`${label}:\\s*(.+)`, "i"));
              const first = m ? m[1].trim().split(/\s/)[0] : "";
              return first && !dead.test(first) ? first : "";
            };
            return !(pick("INSTAGRAM") || pick("SITE"));
          },
        });
        if (!instagramOut) {
          const m = ftxt.match(/INSTAGRAM:\s*(.+)/i);
          let ig = m ? m[1].trim() : "";
          ig = ig
            .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
            .replace(/^@/, "")
            .split(/[\s/?)\]]/)[0]
            .replace(/[.,;]+$/, "")
            .trim();
          if (!vazio(ig) && /^[a-z0-9._]{2,30}$/i.test(ig)) instagramOut = ig;
        }
        if (!siteOut) {
          const m = ftxt.match(/SITE:\s*(.+)/i);
          let st = m ? m[1].trim() : "";
          st = st
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .split(/[\s/)\]]/)[0]
            .replace(/[.,;]+$/, "")
            .trim();
          if (
            !vazio(st) &&
            /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(st) &&
            !/instagram\.com|facebook\.com|ifood\.com|google\.|maps\./i.test(st)
          )
            siteOut = st;
        }
      } catch {
        /* segue com o que já tem — nunca trava nem inventa */
      }
    };

    // CNPJ: prioriza a linha "CNPJ:"; se não, varre o texto inteiro.
    // Em ambos os casos exige 14 dígitos E checksum válido (anti-alucinação).
    const candidatos: string[] = [];
    const lineMatch = txt.match(/CNPJ:\s*([\d.\/\s-]{14,25})/i);
    if (lineMatch) candidatos.push(lineMatch[1]);
    const allMatches = txt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
    candidatos.push(...allMatches);

    let cnpjDigits = "";
    for (const c of candidatos) {
      const digits = c.replace(/\D/g, "");
      if (digits.length === 14 && isValidCnpj(digits)) {
        cnpjDigits = digits;
        break;
      }
    }

    if (!cnpjDigits) {
      // sem CNPJ confirmado, ainda assim tenta firmar @/site com o nome
      // digitado — pra esse caminho também ficar consistente entre runs.
      await enrichIgSite(business);
      res.status(200).json({
        encontrado: false,
        horario,
        telefone: telParsed,
        site: siteOut,
        instagram: instagramOut,
      }); return;
    }

    const pacote = String(process.env.CPFCNPJ_PACKAGE || "6");
    const result = await fetchCnpjData(token, pacote, cnpjDigits);

    // Fallback de site: se a pesquisa não trouxe o domínio, deriva do
    // e-mail OFICIAL da Receita (ex.: nfce-sat@bullguer.com → bullguer.com).
    // É dado real (não inventado); ignora provedores genéricos de e-mail.
    if (!siteOut) {
      const email = String((result as { email?: string }).email || "").trim().toLowerCase();
      const dom = email.includes("@") ? email.split("@")[1].trim() : "";
      const genericos = /^(gmail|hotmail|outlook|live|yahoo|icloud|me|bol|uol|terra|ig|globo|globomail|msn|aol|protonmail|proton|zoho|gmx|yandex|email|r7)\./i;
      if (
        dom &&
        /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dom) &&
        !genericos.test(dom) &&
        !/instagram\.com|facebook\.com|ifood\.com|google\.|maps\./i.test(dom)
      ) {
        siteOut = dom.replace(/^www\./i, "");
      }
    }

    // Com o nome OFICIAL da Receita em mãos, firma @/site que faltaram.
    const nomeOficial =
      String((result as { nomeFantasia?: string }).nomeFantasia || "").trim() ||
      String((result as { razaoSocial?: string }).razaoSocial || "").trim() ||
      business;
    await enrichIgSite(nomeOficial);
    // O nome de marca (o que o usuário digitou) costuma achar o @ melhor que
    // a razão social. Se ainda faltou algo, tenta de novo pela marca.
    if (
      (!instagramOut || !siteOut) &&
      business &&
      business.toLowerCase() !== nomeOficial.toLowerCase()
    ) {
      await enrichIgSite(business);
    }

    res.status(200).json({
      ...result,
      horario,
      // Receita é autoritativa; usa o telefone da pesquisa só se faltar.
      telefone: String((result as { telefone?: string }).telefone || "") || telParsed,
      site: siteOut,
      instagram: instagramOut,
      cnpj: cnpjDigits,
    }); return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); return;
  }
}
