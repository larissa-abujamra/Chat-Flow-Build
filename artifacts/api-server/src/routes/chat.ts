import { Router, type IRouter, type Request } from "express";
import net from "node:net";
import dns from "node:dns/promises";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";
import { openai } from "../lib/openai";
import { getOpenRouter, SONAR_SEARCH_MODEL } from "../lib/openrouter";

const router: IRouter = Router();

// Nodes with these ids trigger a live web-research step: when the conversation
// advances INTO one, the server uses Perplexity Sonar to look up REAL, public
// information about the business (never invented) and folds it into the node's
// reply. This is an id-based convention so it survives UI edits. Flow
// advancement itself is unchanged.
const CATALOG_NODE_ID = "catalogo"; // real product/catalog lookup (Perplexity Sonar)
const CNPJ_NODE_ID = "confirmaDados"; // BrasilAPI CNPJ enrichment (Sonar name-lookup fallback)
const SITE_INSTAGRAM_NODE_ID = "confirmaInstagram"; // extract the Instagram handle from the site HTML

interface Branch {
  id: string;
  label: string;
  targetNodeId: string | null;
}
interface Node {
  id: string;
  question: string;
  branches: Branch[];
}

// The server now lists the REAL products it found, so the node's question should
// only carry the confirmation. Strip leftover wireframe/mockup annotations
// (e.g. "(mostro um card com 4 itens ...)") and a redundant "Achei esses
// produtos seus." claim that older flow snapshots still embed in the node text.
function sanitizeCatalogQuestion(q: string): string {
  const cleaned = q
    .replace(/\([^)]*\b(?:mostro|card)\b[^)]*\)/gi, "")
    .replace(/achei esses produtos[^.?!]*[.?!]\s*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleaned || "Esse é o seu catálogo?";
}

// The question text a node should show the user. The catalog node still carries
// leftover wireframe text in older flow snapshots, so strip it everywhere the
// raw node question would otherwise be emitted (start, re-ask, no-input paths).
function displayQuestion(node: { id: string; question: string }): string {
  return node.id === CATALOG_NODE_ID ? sanitizeCatalogQuestion(node.question) : node.question;
}

// Identify the business by the name the user just gave and fold a short, REAL
// public description into the confirmation question. Never invents a business —
// degrades to just the node's question when nothing is found or the key/search
// is unavailable.
async function researchBusiness(
  req: Request,
  transcript: string,
  latest: string,
  fallbackQuestion: string,
): Promise<string> {
  const openrouter = getOpenRouter();
  if (!openrouter) return fallbackQuestion;
  try {
    const search = await openrouter.chat.completions.create(
      {
        model: SONAR_SEARCH_MODEL,
        messages: [
          {
            role: "system",
            content:
              'You are onboarding a business. From the onboarding conversation you have the business name (and possibly its city/segment). Search the web for this REAL business and write ONE short line identifying it, formatted as "<Business Name> — <short description: what it sells / segment, and city if known>". Reply in the SAME language as the conversation. Do NOT ask any questions, do NOT add extra lines, and do NOT include links or citation markers. If you cannot confidently identify the business, reply with exactly: NO_INFO',
          },
          {
            role: "user",
            content: `Conversa de onboarding até aqui:\n${transcript}\nUsuário: ${latest}`,
          },
        ],
      },
      { timeout: 25000 },
    );
    const info = search.choices[0]?.message?.content?.trim() ?? "";
    if (!info || /no_info/i.test(info)) return fallbackQuestion;
    return `Perfeito! Dei uma olhada e encontrei:\n\n${info}\n\n${fallbackQuestion}`;
  } catch (businessErr) {
    const e = businessErr as { message?: string; status?: number; code?: string };
    req.log.error(
      { message: e?.message, status: e?.status, code: e?.code },
      "Business research failed; continuing without company info",
    );
    return fallbackQuestion;
  }
}

// Search the web for the products/services the business actually sells (by its
// name, plus any site/Instagram in the transcript) and append a short list to
// the node's question. If nothing real is found, say so honestly instead of
// inventing a catalog.
async function researchCatalog(
  req: Request,
  transcript: string,
  latest: string,
  fallbackQuestion: string,
): Promise<string> {
  const question = sanitizeCatalogQuestion(fallbackQuestion);
  const openrouter = getOpenRouter();
  if (!openrouter) return question;
  try {
    const search = await openrouter.chat.completions.create(
      {
        model: SONAR_SEARCH_MODEL,
        messages: [
          {
            role: "system",
            content:
              'You are onboarding a business. From the onboarding conversation you have the business name (and possibly its website or Instagram). Search the web — the business\'s OWN website, Instagram, or delivery listings — for the REAL products it actually sells, with prices when shown. Reply in the SAME language as the conversation. Output ONLY a list of real products, one per line, formatted exactly as "<product name> | <price as R$XX,XX, or the local-language equivalent of \\"preço a confirmar\\" when no price is shown>". List at most 4 products. EVERY line MUST start with a real product name before the "|" — never output a line whose name is blank or is just the price placeholder. Do NOT pad the list to a fixed count: if you only confidently find 1 or 2 products, list only those. Do NOT add any lead-in line, bullets, questions, links, or citation markers. If you cannot find any real products, reply with exactly: NO_PRODUCTS',
          },
          {
            role: "user",
            content: `Conversa de onboarding até aqui:\n${transcript}\nUsuário: ${latest}`,
          },
        ],
      },
      { timeout: 25000 },
    );
    const raw = search.choices[0]?.message?.content?.trim() ?? "";
    // Keep only well-formed "<name> | <price>" lines with a real, non-placeholder
    // product name, so the model can't pad the catalog with nameless filler.
    const products = raw
      .split("\n")
      .map((l) => l.replace(/^[\s*\-•]+/, "").trim())
      .filter((l) => {
        const name = l.split("|")[0]?.trim() ?? "";
        return l.includes("|") && name.length > 0 && !/^preço a confirmar$/i.test(name);
      })
      .slice(0, 4);
    if (products.length === 0 || /no_products/i.test(raw)) {
      return `${question}\n\nDei uma olhada mas ainda não consegui montar seu cardápio automaticamente — você poderá cadastrar e ajustar seus produtos no painel.`;
    }
    return `${question}\n\n${products.join("\n")}`;
  } catch (catalogErr) {
    const e = catalogErr as { message?: string; status?: number; code?: string };
    req.log.error(
      { message: e?.message, status: e?.status, code: e?.code },
      "Catalog research failed; continuing without product list",
    );
    return question;
  }
}

// Shape of the BrasilAPI CNPJ response fields we use.
interface BrasilApiCnpj {
  razao_social?: string;
  nome_fantasia?: string;
  cnae_fiscal_descricao?: string;
  municipio?: string;
  uf?: string;
}

// When the user types their CNPJ, look it up on the free, key-less BrasilAPI and
// PREPEND a short factual summary (nome fantasia, setor, cidade) to the
// confirmation question — so we confirm the data instead of asking field by
// field. Invalid CNPJ or any API failure degrades to the name-based Sonar
// research (researchBusiness), which itself degrades to just the node question.
async function researchCnpj(
  req: Request,
  transcript: string,
  latest: string,
  fallbackQuestion: string,
): Promise<string> {
  const digits = latest.replace(/\D/g, "");
  if (digits.length === 14) {
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
        signal: AbortSignal.timeout(12000),
        // BrasilAPI 403s the default Node "user-agent: node" — send a browser-like UA.
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (compatible; SquadOnboardingBot/1.0; +https://squad.app)",
        },
      });
      if (resp.ok) {
        const data = (await resp.json()) as BrasilApiCnpj;
        const nome = (data.nome_fantasia || data.razao_social || "").trim();
        const setor = (data.cnae_fiscal_descricao || "").trim();
        const cidade = [data.municipio, data.uf].filter(Boolean).join(" - ").trim();
        const lines: string[] = [];
        if (nome) lines.push(`📛 Nome: ${nome}`);
        if (setor) lines.push(`🏷️ Setor: ${setor}`);
        if (cidade) lines.push(`📍 Cidade: ${cidade}`);
        if (lines.length > 0) {
          return `Encontrei o cadastro do seu CNPJ! 🎉\n\n${lines.join("\n")}\n\n${fallbackQuestion}`;
        }
      } else {
        req.log.warn({ status: resp.status }, "BrasilAPI CNPJ lookup returned non-OK");
      }
    } catch (cnpjErr) {
      const e = cnpjErr as { message?: string; name?: string; code?: string };
      req.log.error(
        { message: e?.message, name: e?.name, code: e?.code },
        "BrasilAPI CNPJ lookup failed; falling back to name-based research",
      );
    }
  }
  // Invalid/absent CNPJ or API failure: fall back to identifying the business by
  // the name already in the transcript.
  return researchBusiness(req, transcript, latest, fallbackQuestion);
}

// Reserved Instagram path segments that are never a user handle.
const IG_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "stories",
  "tv",
  "accounts",
  "about",
  "developer",
  "developers",
  "legal",
  "directory",
  "web",
  "sharer",
  "privacy",
  "help",
]);

// Pull the first real Instagram handle out of a page's HTML, skipping content
// URLs (/p/, /reel/, /explore/, /stories/, …) and reserved segments. Tolerates
// JSON-escaped slashes (instagram.com\/handle), common in inline <script> data.
function extractInstagramHandle(html: string): string | null {
  const re = /instagram\.com\\?\/@?([A-Za-z0-9._]{1,30})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const handle = m[1].replace(/\.$/, "").toLowerCase();
    if (!handle || IG_RESERVED.has(handle)) continue;
    return handle;
  }
  return null;
}

// Reject obviously non-public hosts (loopback, private ranges, link-local,
// cloud metadata) before fetching a user-supplied URL server-side. Returns the
// normalized URL or null. Protocol + literal-host checks only; the real
// network-level SSRF protection (DNS resolution + per-redirect-hop IP
// validation) lives in `hostResolvesToBlocked()` / `fetchSiteHtmlSafely()`.
function normalizeSiteUrl(raw: string): URL | null {
  let candidate = raw.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return null;
  }
  return url;
}

// True if an IP literal points at a non-public range we must never fetch
// server-side (loopback, private, link-local/metadata, CGNAT, ULA, multicast).
// Handles IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) and zone ids. Anything that
// isn't a parseable IP is treated as blocked (fail closed).
function ipIsBlocked(ip: string): boolean {
  let addr = ip.toLowerCase().trim();
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) addr = mapped[1];
  const kind = net.isIP(addr);
  if (kind === 4) {
    const parts = addr.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 "this host"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (kind === 6) {
    if (addr === "::1" || addr === "::") return true; // loopback / unspecified
    if (addr.startsWith("fe80")) return true; // link-local
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // ULA
    if (addr.startsWith("ff")) return true; // multicast
    return false;
  }
  return true; // unparseable -> block
}

// Resolve the hostname and block if it is (or resolves to) a non-public IP.
// IP literals are checked directly; hostnames are resolved (A + AAAA) and ALL
// answers must be public. Resolution failure fails closed (blocked).
async function hostResolvesToBlocked(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return ipIsBlocked(host);
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) return true;
    return records.some((r) => ipIsBlocked(r.address));
  } catch {
    return true;
  }
}

// Fetch a user-supplied site's HTML with redirects followed MANUALLY so every
// hop is re-validated against the SSRF guard (a public URL can otherwise 30x to
// an internal/private target). Returns the (capped) body or null on any
// block/failure/non-HTML response.
async function fetchSiteHtmlSafely(req: Request, startUrl: URL): Promise<string | null> {
  let url = startUrl;
  for (let hop = 0; hop < 5; hop++) {
    if (await hostResolvesToBlocked(url.hostname)) {
      req.log.warn({ host: url.hostname }, "Blocked SSRF target while fetching site");
      return null;
    }
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      redirect: "manual",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SquadOnboardingBot/1.0; +https://squad.app)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) return null;
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return null;
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") return null;
      url = next;
      continue;
    }
    if (!resp.ok) {
      req.log.warn({ status: resp.status }, "Site fetch for Instagram returned non-OK");
      return null;
    }
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html|xml/i.test(contentType)) return null;
    // Cap the body so a huge page can't blow up memory. Footer social links live
    // near the END of the document, so keep a generous cap rather than a small
    // head slice that would miss them.
    const full = await resp.text();
    return full.length > 3_000_000 ? full.slice(0, 3_000_000) : full;
  }
  req.log.warn("Too many redirects while fetching site for Instagram");
  return null;
}

// The user gave us their website: fetch the HTML and extract the Instagram
// handle so we can confirm it instead of asking. Any failure (bad URL,
// unreachable/blocked site, no handle found) degrades to just asking for the
// handle.
async function researchInstagramFromSite(
  req: Request,
  latest: string,
  fallbackQuestion: string,
): Promise<string> {
  const url = normalizeSiteUrl(latest);
  if (!url) return fallbackQuestion;
  try {
    const html = await fetchSiteHtmlSafely(req, url);
    if (!html) return fallbackQuestion;
    const handle = extractInstagramHandle(html);
    if (!handle) return fallbackQuestion;
    return `Achei seu Instagram pelo site: @${handle} 🎉\n\nÉ esse mesmo? Se não for, é só me mandar o @ certo.`;
  } catch (siteErr) {
    const e = siteErr as { message?: string; name?: string; code?: string };
    req.log.error(
      { message: e?.message, name: e?.name, code: e?.code },
      "Site fetch for Instagram failed; falling back to asking the handle",
    );
    return fallbackQuestion;
  }
}

router.post("/chat", async (req, res) => {
  const parsed = SendChatBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      { issues: parsed.error.issues.map((i) => ({ path: i.path, code: i.code, message: i.message })) },
      "Rejected chat input (400)",
    );
    res.status(400).json({ error: "Invalid chat input", details: parsed.error.issues });
    return;
  }

  const { flow, messages, currentNodeId } = parsed.data;
  const nodes = (flow.nodes ?? []) as Node[];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Empty flow guard
  if (nodes.length === 0 || !flow.startNodeId || !nodeMap.has(flow.startNodeId)) {
    res.json(
      SendChatResponse.parse({
        reply:
          "This flow has no questions yet. Add a node and pick a start node to begin.",
        currentNodeId: null,
        matchedBranchId: null,
        done: true,
      }),
    );
    return;
  }

  // Start of conversation: present the start node's question.
  if (!currentNodeId) {
    const startNode = nodeMap.get(flow.startNodeId)!;
    res.json(
      SendChatResponse.parse({
        reply: displayQuestion(startNode),
        currentNodeId: startNode.id,
        matchedBranchId: null,
        done: startNode.branches.length === 0,
      }),
    );
    return;
  }

  const currentNode = nodeMap.get(currentNodeId);
  if (!currentNode || currentNode.branches.length === 0) {
    res.json(
      SendChatResponse.parse({
        reply: "This conversation has ended. Restart to try a different path.",
        currentNodeId: null,
        matchedBranchId: null,
        done: true,
      }),
    );
    return;
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    res.json(
      SendChatResponse.parse({
        reply: displayQuestion(currentNode),
        currentNodeId: currentNode.id,
        matchedBranchId: null,
        done: false,
      }),
    );
    return;
  }

  // Describe each branch and where it leads so the LLM can phrase a natural reply.
  const branchDescriptions = currentNode.branches.map((b) => {
    const target = b.targetNodeId ? nodeMap.get(b.targetNodeId) : null;
    const next = target
      ? `next question: "${displayQuestion(target)}"`
      : "ends the conversation";
    return `- id "${b.id}": answer means "${b.label}" -> ${next}`;
  });

  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are driving a branching conversational flow. The user is currently being asked this question:
"${displayQuestion(currentNode)}"

The possible answer branches are:
${branchDescriptions.join("\n")}

Decide which branch the user's latest message best matches. Then write a short, natural assistant reply:
- If a branch matches and it leads to a next question, briefly acknowledge the answer, then ask that next question (you may rephrase it naturally, keeping its meaning). Set offTopicQuestion to false.
- If a branch matches and it ends the conversation, give a brief, friendly closing message. Set offTopicQuestion to false.
- If no branch clearly matches, set matchedBranchId to null:
  - If the user's latest message is an off-topic question or request that needs real-world / factual information to answer well (e.g. a general knowledge question, current prices, dates, availability, news, "what is X", "how do I Y"), set offTopicQuestion to true. In that case leave "reply" as just a natural re-ask of the current question (clarifying the available options) — a separate web-search step will supply the factual answer, so do NOT try to answer the question yourself.
  - If the message is small talk, a simple comment, or just unclear/empty, set offTopicQuestion to false and simply re-ask the current question, clarifying the available options. NEVER invent facts.

Always reply in the same language as the conversation. Respond ONLY as JSON: {"matchedBranchId": <branch id string or null>, "offTopicQuestion": <boolean>, "reply": <string>}.`;

  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-5-mini",
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Conversation so far:\n${transcript}\n\nThe user's latest message: "${lastUser.content}"`,
          },
        ],
      },
      // Bound the classification call so a stalled upstream fails fast (502)
      // instead of hanging the request forever. Sonar calls have their own
      // timeouts below.
      { timeout: 25000 },
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw) as {
      matchedBranchId?: string | null;
      offTopicQuestion?: boolean;
      reply?: string;
    };

    let matched = result.matchedBranchId
      ? currentNode.branches.find((b) => b.id === result.matchedBranchId)
      : undefined;

    // Single-branch (open-ended) nodes advance on any genuine answer, even when
    // the classifier is unsure — unless the user actually asked an off-topic
    // question (handled below). Keeps linear data-collection from stalling.
    let forcedAdvance = false;
    if (!matched && currentNode.branches.length === 1 && result.offTopicQuestion !== true) {
      matched = currentNode.branches[0];
      forcedAdvance = true;
    }

    if (!matched) {
      const reAsk = result.reply ?? displayQuestion(currentNode);
      let reply = reAsk;

      // Off-script question: answer it with a real web search (Perplexity Sonar Pro),
      // then steer back by re-asking the current question. Flow does NOT advance.
      const openrouter = getOpenRouter();
      if (result.offTopicQuestion === true && openrouter) {
        try {
          const search = await openrouter.chat.completions.create(
            {
              model: SONAR_SEARCH_MODEL,
              messages: [
                {
                  role: "system",
                  content:
                    "You answer the user's question helpfully and concisely using up-to-date web information. Reply in the SAME language as the user's message. Keep it to 1-3 sentences. Do not include citation markers, footnotes, or URLs.",
                },
                { role: "user", content: lastUser.content },
              ],
            },
            { timeout: 15000 },
          );
          const answer = search.choices[0]?.message?.content?.trim();
          if (answer) reply = `${answer}\n\n${reAsk}`;
        } catch (searchErr) {
          const e = searchErr as { message?: string; status?: number; code?: string };
          req.log.error(
            { message: e?.message, status: e?.status, code: e?.code },
            "Sonar search failed; falling back to re-ask",
          );
        }
      }

      res.json(
        SendChatResponse.parse({
          reply,
          currentNodeId: currentNode.id,
          matchedBranchId: null,
          done: false,
        }),
      );
      return;
    }

    const target = matched.targetNodeId ? nodeMap.get(matched.targetNodeId) : null;
    if (!target) {
      res.json(
        SendChatResponse.parse({
          reply: result.reply ?? "Thanks, that's everything for now.",
          currentNodeId: null,
          matchedBranchId: matched.id,
          done: true,
        }),
      );
      return;
    }

    // Entering a research node: augment its reply with a live web lookup before
    // continuing (real public info only — never invented).
    let reply = forcedAdvance ? displayQuestion(target) : (result.reply ?? displayQuestion(target));
    if (target.id === CATALOG_NODE_ID) {
      reply = await researchCatalog(req, transcript, lastUser.content, target.question);
    } else if (target.id === CNPJ_NODE_ID) {
      reply = await researchCnpj(req, transcript, lastUser.content, target.question);
    } else if (target.id === SITE_INSTAGRAM_NODE_ID) {
      reply = await researchInstagramFromSite(req, lastUser.content, target.question);
    }

    res.json(
      SendChatResponse.parse({
        reply,
        currentNodeId: target.id,
        matchedBranchId: matched.id,
        done: target.branches.length === 0,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Chat completion failed");
    res.status(502).json({ error: "Failed to generate a reply" });
  }
});

export default router;
