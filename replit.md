# Flow Builder

An editable conversation-flow wireframe: author a tree of question nodes (each answer branches to the next question) and test it live in a chat preview where a real LLM decides which branch each typed answer matches.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `OPENROUTER_API_KEY` — user-provided OpenRouter key, used only for Perplexity Sonar Pro Search in off-script chat answers

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/flows.ts` — `flows` table (one persistent live row id=`"default"`) + `flow_versions` table (snapshot history, uuid id, name, nullable notes, startNodeId, nodes, createdAt, updatedAt).
- API contract (source of truth): `lib/api-spec` OpenAPI spec → `pnpm --filter @workspace/api-spec run codegen` generates React Query hooks + Zod schemas into `@workspace/api-client-react`.
- Backend routes: `artifacts/api-server/src/routes/flow.ts` (GET/PUT `/flow`), `artifacts/api-server/src/routes/versions.ts` (GET/POST `/versions`, PATCH/DELETE `/versions/{id}`), `artifacts/api-server/src/routes/chat.ts` (POST `/chat`).
- LLM client: `artifacts/api-server/src/lib/openai.ts` (Replit-managed AI).
- Frontend: `artifacts/flow-builder/src/pages/home.tsx`, `components/flow-editor.tsx`, `components/chat-preview.tsx`, `components/version-history.tsx`.

## Architecture decisions

- Single persistent flow row (id=`"default"`) upserted via `onConflictDoUpdate` — the app edits one global flow, not per-user documents.
- Chat advancement is server-deterministic: the LLM only classifies a typed answer into one of the current node's branch IDs (returns `{matchedBranchId, reply}`); the server validates the ID against real branches and advances `currentNodeId`. Hallucinated/invalid IDs degrade to "no match" and stay on the current node.
- Hybrid off-script handling: on "no match", the classifier also returns `offTopicQuestion`. If true (a factual/real-world question), the server makes a SECOND call to Perplexity Sonar Pro Search (`perplexity/sonar-pro-search` via OpenRouter) to answer it with live web info, then appends the re-ask of the current question. If false (small talk / unclear / empty), it just re-asks. The server still does not advance `currentNodeId` on a no-match. Branch classification/advancement stays on gpt-5-mini (no web search) — Sonar is only invoked for off-topic questions.
- Onboarding sequence (ALL responses are REAL — no mocked/wireframe data in the data-collection or research steps). Order: `q_nome` (start; multi-bubble intro via `---`, last bubble invites the user to add teammates by email) → `q_negocio` ("Agora sim, poderia me informar o nome do seu negócio?") → `confirmaNegocio` (research-by-name) → `catalogo` (research products) → `instagram` → `igUsername` → `igConectado` ("Pronto, conectado!") → the tone-of-voice / tour tail (`tomGerado`/`tomManual`/`emojis`/… unchanged). `confirmaNegocio` (Sim → `catalogo`, Não → back to `q_negocio`); `catalogo` (Sim → `instagram`, "Falta coisa" → `faltaCoisa` → `instagram`); `instagram` ("Conectar" → `igUsername`, "Agora não" → `tomManual`). The open-ended nodes (`q_nome`, `q_negocio`, `igUsername`) each carry ONE permissive branch ("user provided X") so any answer advances. Removed legacy nodes: `q_cnpj`, `q_site`, `q_instagram`, `q_setor`, `companyResearch`, `carroChefe`; `igConectado` no longer says "(conexão simulada)".
- Research node conventions (id-based, no schema/openapi change — survive UI edits because node ids are preserved; each degrades to just the node's question on failure or when OpenRouter is absent). Implemented as helpers in `chat.ts` invoked when the chat advances INTO the matching `target.id`:
  - `confirmaNegocio` (`BUSINESS_NODE_ID`, `researchBusiness()`): Sonar Pro Search identifies the REAL business by the name the user just typed and PREPENDS a short factual summary ("Perfeito! Dei uma olhada e encontrei:\n\n<info>\n\n<question>"). On `NO_INFO`/empty or no OpenRouter key it falls back to just the node question.
  - `catalogo` (`CATALOG_NODE_ID`, `researchCatalog()`): Sonar Pro Search of the business's REAL site/Instagram/delivery listings lists up to 4 actual products, question-FIRST (`${question}\n\n${list}`), each line formatted `<product name> | <R$XX,XX or "preço a confirmar">`. The server filters the model output to well-formed lines with a real, non-placeholder product name (drops nameless filler so the model can't pad to a fixed count). If none are found (`NO_PRODUCTS`/empty after filtering) it says so honestly instead of inventing a catalog.
  - There used to be a separate `companyResearch` node that PREPENDED a public-company summary before the catalog step — superseded by `confirmaNegocio`. Older flow snapshots may embed leftover wireframe text in the `catalogo` node question ("(mostro um card com 4 itens…)" parenthetical and an "Achei esses produtos seus." sentence). `sanitizeCatalogQuestion()` strips both; `displayQuestion(node)` applies it to ANY user-facing emission of a `catalogo` node's question, so wireframe text never leaks.
- The chat preview sends the LIVE (possibly unsaved) flow from the editor, so users can test edits without saving first.
- LLM uses Replit-managed AI (no user API key). Model `gpt-5-mini`, `max_completion_tokens` (not `max_tokens`), `response_format: json_object`, and NO `temperature` (gpt-5 models reject it).

## Product

- Author a tree of question nodes; each node has answer branches that point to a next node or end the conversation. One node is the Start.
- Two editing views toggled in the header: **List** and **Flow Chart**, both editing the same live flow.
  - **Flow Chart** (draggable node graph, React Flow / `@xyflow/react`): each node edits its question and answers inline (answer text input + target dropdown + delete, plus "Add answer"). Drag boxes to reposition (persisted via the optional `position` field on each node), drag from a node's bottom handle to another node to create a branch, and delete edges/nodes to remove branches/nodes.
  - **List**: a scrollable column of node cards; each card edits the question, sets/marks the Start node, deletes the node, and edits branches (label input + target dropdown + delete, plus "Add Branch").
- Save the flow to persist it. Each "Save Flow" both updates the live `default` flow AND appends a version snapshot to history (server auto-names "Flow Chart vN" when no name is supplied).
- Version history: a **History** button in the editor header opens a Sheet listing all version snapshots (newest first). Each entry supports inline rename, free-text **notes** (a discreet "Add notes" button reveals a Textarea; saved notes display under the title and are clickable to edit; clearing them sends `null`), **Load** (sets the editor's live flow to that snapshot — does NOT auto-persist; save to make it live), and **Delete** (with an AlertDialog confirm). Notes persist via the `notes` column on `flow_versions` and the PATCH `/versions/{id}` partial update (`updateVersion` mutation accepts `name` and/or `notes`). Component: `components/version-history.tsx`.
- Shareable preview: the `/preview` route (`pages/share.tsx`) renders ONLY the chat (the saved `default` flow, fetched via `useGetFlow`) inside a phone mockup frame — no editor. Share this link to demo the chatbot. Client-side route registered in `App.tsx`; production static serve already rewrites `/* → /index.html` so deep-linking works when published.
- Multi-bubble replies: put a line containing only `---` in a node's question text to split that reply into several messages. The chat preview sends each chunk as a separate bubble, one after another, with a short typing pause between (scaled to chunk length) so it reads like a human typing. Splitting is client-side in `chat-preview.tsx` (`splitIntoBubbles` / `revealReply`); the server contract is unchanged. No marker = one bubble (unchanged behavior).
- Live chat preview: type answers, a real LLM matches each answer to a branch and advances; non-matching answers re-ask; conversation ends at leaf/end nodes. As the chat advances, the current question node is highlighted with a green (waz) outline in both Flow Chart and List views (wired via `currentNodeId` → `onActiveNodeChange` → `activeNodeId` → node `isActive`).
- Chat preview presentation (`chat-preview.tsx`): styled as a messaging app with the bot persona "Oddy". The header is a centered rounded avatar (`@assets/image_1780407881420.png`, imported via the Vite `@assets` alias so it bundles in prod) with the name "Oddy" below; action buttons (external-link/restart/collapse) are compact icons in the top-right corner. Message bubbles carry NO per-message avatar (just left/right alignment). The "busy" indicator is an animated three-dot typing bubble (`.typing-dot` + `@keyframes typing-bounce` in `index.css`), not a "Thinking…" spinner. A subtle yellow gradient (`rgba(250,204,21,…)`) washes down from the top of the screen. `pt-12` on the header keeps the avatar clear of the phone-mockup notch in the `/preview` share frame.
- "Squad" design system: light theme, Fustat font (loaded once in `index.html`), ink (near-black) primary, brand gradient `maky → waz → fin` (`.brand-gradient`), pill buttons, mono uppercase `.eyebrow` micro-labels, minimal shadows. Active/Start states use the green `waz` token. Squad color tokens (`maky`/`waz`/`fin`/`ink-3`) are registered in `@theme inline` so `bg-*`/`text-*`/`border-*`/`ring-*` utilities work.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Import generated types/hooks from the `@workspace/api-client-react` barrel, NOT the deep `@workspace/api-client-react/src/generated/api.schemas` path — the deep path breaks type resolution and cascades implicit-any errors.
- gpt-5 models reject `temperature` and use `max_completion_tokens`; do not add `temperature` to the chat completion call.
- Verify the frontend with `pnpm --filter @workspace/flow-builder run typecheck`, not `build` (build needs workflow-provided env vars).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
