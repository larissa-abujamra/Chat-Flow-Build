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

- DB schema (source of truth): `lib/db/src/schema/flows.ts` — single `flows` table, one persistent row id=`"default"`.
- API contract (source of truth): `lib/api-spec` OpenAPI spec → `pnpm --filter @workspace/api-spec run codegen` generates React Query hooks + Zod schemas into `@workspace/api-client-react`.
- Backend routes: `artifacts/api-server/src/routes/flow.ts` (GET/PUT `/flow`), `artifacts/api-server/src/routes/chat.ts` (POST `/chat`).
- LLM client: `artifacts/api-server/src/lib/openai.ts` (Replit-managed AI).
- Frontend: `artifacts/flow-builder/src/pages/home.tsx`, `components/flow-editor.tsx`, `components/chat-preview.tsx`.

## Architecture decisions

- Single persistent flow row (id=`"default"`) upserted via `onConflictDoUpdate` — the app edits one global flow, not per-user documents.
- Chat advancement is server-deterministic: the LLM only classifies a typed answer into one of the current node's branch IDs (returns `{matchedBranchId, reply}`); the server validates the ID against real branches and advances `currentNodeId`. Hallucinated/invalid IDs degrade to "no match" and stay on the current node.
- Hybrid off-script handling: on "no match", the classifier also returns `offTopicQuestion`. If true (a factual/real-world question), the server makes a SECOND call to Perplexity Sonar Pro Search (`perplexity/sonar-pro-search` via OpenRouter) to answer it with live web info, then appends the re-ask of the current question. If false (small talk / unclear / empty), it just re-asks. The server still does not advance `currentNodeId` on a no-match. Branch classification/advancement stays on gpt-5-mini (no web search) — Sonar is only invoked for off-topic questions.
- Onboarding lead-in: the flow starts with open-ended data-collection questions (business name, CNPJ, site, Instagram, sector). Each is a normal node with ONE permissive branch ("user provided X") so any answer advances. After those, a node with the reserved id `companyResearch` runs a web-research step.
- Research node convention: when the chat advances INTO a node whose id is `companyResearch` (`RESEARCH_NODE_ID` in `chat.ts`), the server calls Perplexity Sonar Pro Search with the onboarding transcript to fetch preliminary public company info and PREPENDS that summary to the node's reply, then continues normally. This is an id-based convention (no schema/openapi change) — it survives UI edits because node ids are preserved. Failures degrade to just the node's question.
- The chat preview sends the LIVE (possibly unsaved) flow from the editor, so users can test edits without saving first.
- LLM uses Replit-managed AI (no user API key). Model `gpt-5-mini`, `max_completion_tokens` (not `max_tokens`), `response_format: json_object`, and NO `temperature` (gpt-5 models reject it).

## Product

- Author a tree of question nodes; each node has answer branches that point to a next node or end the conversation. One node is the Start.
- Two editing views toggled in the header: **List** and **Flow Chart**, both editing the same live flow.
  - **Flow Chart** (draggable node graph, React Flow / `@xyflow/react`): each node edits its question and answers inline (answer text input + target dropdown + delete, plus "Add answer"). Drag boxes to reposition (persisted via the optional `position` field on each node), drag from a node's bottom handle to another node to create a branch, and delete edges/nodes to remove branches/nodes.
  - **List**: a scrollable column of node cards; each card edits the question, sets/marks the Start node, deletes the node, and edits branches (label input + target dropdown + delete, plus "Add Branch").
- Save the flow to persist it.
- Live chat preview: type answers, a real LLM matches each answer to a branch and advances; non-matching answers re-ask; conversation ends at leaf/end nodes. As the chat advances, the current question node is highlighted with a green (waz) outline in both Flow Chart and List views (wired via `currentNodeId` → `onActiveNodeChange` → `activeNodeId` → node `isActive`).
- "Squad" design system: light theme, Fustat font (loaded once in `index.html`), ink (near-black) primary, brand gradient `maky → waz → fin` (`.brand-gradient`), pill buttons, mono uppercase `.eyebrow` micro-labels, minimal shadows. Active/Start states use the green `waz` token. Squad color tokens (`maky`/`waz`/`fin`/`ink-3`) are registered in `@theme inline` so `bg-*`/`text-*`/`border-*`/`ring-*` utilities work.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Import generated types/hooks from the `@workspace/api-client-react` barrel, NOT the deep `@workspace/api-client-react/src/generated/api.schemas` path — the deep path breaks type resolution and cascades implicit-any errors.
- gpt-5 models reject `temperature` and use `max_completion_tokens`; do not add `temperature` to the chat completion call.
- Verify the frontend with `pnpm --filter @workspace/flow-builder run typecheck`, not `build` (build needs workflow-provided env vars).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
