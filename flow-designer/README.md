# Waz Flow Designer + Squad Onboarding

A Vite + React 19 (TypeScript, Tailwind v4, wouter) app with two surfaces:

1. **Flow designer** (`/flow-a`, `/flow-b`, `/flow-c`, `/flow-stefano`, `/flow-final`, plus
   `+` to create new flows) — a node-graph editor with a live preview on the right.
2. **Squad onboarding** (`/onboarding`) — the real conversational wizard that sets up a
   business's AI team (Waz = atendimento, Maky = marketing, Fin = financeiro) by
   **auto-discovering** most data and **asking only what can't be discovered**.

`/onboarding/editor` opens the onboarding step/copy editor.

## The onboarding goal

Capture the **minimal necessary information for the AI team to actually operate the
business** — answer customers, take orders, quote prices, get paid, escalate, and run
day-to-day tasks — not just describe it. Most of it is scraped; the rest is asked in a
few taps.

### Flow (in order)

| Step | Source | Notes |
|------|--------|-------|
| `welcome` | ask | Business name — **kept exactly as typed** (never "corrected"). |
| `ask_city` | ask | City/state — normalized (`sp` → `São Paulo - SP`). Fires Places + CNPJ. |
| `place_pick` | scrape | Google Places. **Auto-selects when a single confident match** (collapse). Ranks candidates by the requested city/UF. |
| `confirm_contact` | scrape | CNPJ (Receita) + address + phone + hours. One confirm card. |
| `confirm_site` | scrape | Auto-found site. **Skipped for food businesses with no site** (iFood covers the catalog). |
| `instagram` | scrape | Handle from site/CNPJ → profile (followers/bio). |
| `ifood` | scrape | Detect store (verified, no false positives) → import real menu + prices. Manual URL paste supported. |
| `catalog` | scrape | Confirm imported/researched products. |
| `carro_chefe` | ask | Best-seller (tap a product). |
| **`fulfillment`** | **ask** | Delivery / pickup / both + rules (area, fee, minimum, lead time). **Operational.** |
| **`payment`** | **ask** | Methods + Pix key + deposit/sinal. **Operational.** |
| `tone_generated` | scrape | Research-derived tone + personalized example. |
| `emojis` | ask | Emoji usage. |
| **`escalation`** | **ask** | WhatsApp to hand off to a human when the AI can't resolve. **Safe autonomy.** |
| **`tasks`** | **ask** | Multi-select: what the team should start doing (atender, pedidos, cardápio, follow-up, agenda, financeiro). **Activation.** |
| **`review`** | display | Summary card of everything captured → confirm. |
| `configured` → `features` | — | Done + feature tour. |

`bizType` (alimentação / varejo / serviços) is **auto-derived from the CNAE** in the live
experience, so services skip iFood and ask for "serviços" instead of "produtos".

Mid-flow the user can **ask any off-topic question** (on text and button steps); it's
answered and the current question is re-asked.

### Persisted profile (the contract the AI team consumes)

Saved to `localStorage["squad_onboarding_profile"]` on every change:

```jsonc
{
  "negocio": "Brigadayros",
  "cidade": "São Paulo - SP",
  "cnpj": "35316163000162", "razaoSocial": "...", "nomeFantasia": "...",
  "endereco": "...", "telefone": "...", "email": "...", "horario": "...",
  "instagram": { "usuario": "brigadayros", "seguidores": 26808 },
  "site": "https://linktr.ee/brigadayros",
  "tipoNegocio": "alimentacao",
  "produtos": [{ "nome": "...", "preco": "R$ 18,00" }],   // 27 itens (iFood/site)
  "carroChefe": "Brigadeirão",
  "entrega": { "modo": "Entrega e retirada", "regras": "bairros, taxa, mínimo, prazo" },
  "pagamento": "Pix (chave ...), cartão, dinheiro. 50% de sinal.",
  "tom": "caloroso e informal", "emoji": "Às vezes",
  "escalacao": "(11) 99999-9999 — falar com a Júlia",
  "tarefas": ["atender", "pedidos", "financeiro"],
  "atualizadoEm": "..."
}
```

## Per-flow adaptation

Flows with `stepId`s on their nodes (Fluxo Stefano + new flows) drive the **real wizard**
from their canvas: reorder/delete a node → the wizard reorders/skips that step; edit a
node's text → the wizard shows it (`src/pages/onboarding/flowToOnboarding.ts`). A/B/C use
the scripted `ChatPreview`.

## Backend (`/api`) — Vercel Serverless Functions

12 endpoints proxy paid services server-side (keys never reach the browser):
`normalize` (also answers mid-flow `{question}`), `ocr`, `places`, `cnpj`, `cnpj-lookup`,
`tone-from-text`, `instagram`, `research`, `catalog`, `site-scrape`, `ifood/detect`,
`ifood/catalog`.

### Required env vars (Vercel → Settings → Environment Variables, Production + Preview)

See `.env.example`. `OPENROUTER_API_KEY`, `GOOGLE_PLACES_API_KEY`, `CPFCNPJ_TOKEN`
(+`CPFCNPJ_PACKAGE`), `SCRAPINGDOG_API_KEY`, `APIFY_API_TOKEN` (+`IFOOD_APIFY_ACTOR`).

> Note: the iFood/Apify actor returns menu items only (no delivery/payment/hours), so
> those operational fields are **asked**, never invented.

## Develop

```bash
npm install
npm run dev          # frontend
npm run build        # tsc + vite build
npx tsc --noEmit -p api/tsconfig.json   # type-check serverless functions
```
Deployed on Vercel (Root Directory = `flow-designer`). SPA rewrite + `/api` functions.
