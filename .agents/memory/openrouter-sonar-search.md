---
name: OpenRouter Sonar search for off-script chat
description: How/why Perplexity Sonar Pro Search is wired into the chat's off-script path
---

# Perplexity Sonar Pro Search in chat off-script handling

The chat preview answers off-topic/factual questions with a real web search instead of refusing to state facts.

**Design:** branch classification + flow advancement stays on gpt-5-mini (Replit-managed AI, no web search). The classifier also returns an `offTopicQuestion` boolean. ONLY when there is no branch match AND `offTopicQuestion` is true does the server make a SECOND call to `perplexity/sonar-pro-search` (OpenRouter) to answer, then appends the re-ask of the current question. Small talk / unclear / empty input never triggers a search.

**Why:** running Sonar on every turn would web-search even simple branch matches — slow and costly, and Sonar isn't ideal for strict JSON branch classification. Two-call split keeps advancement deterministic and cheap, and only pays for search when it adds value.

**Key facts:**
- Uses the user's OWN key `OPENROUTER_API_KEY` (not the Replit-managed OpenRouter integration), because the user explicitly provided their own key. Per the ai-integrations-openrouter skill precedence, "user wants own key" → do NOT use the managed integration.
- Client is just the `openai` SDK pointed at `https://openrouter.ai/api/v1`.
- The exact model id is `perplexity/sonar-pro-search` (verified via the OpenRouter models list; there is also a plain `perplexity/sonar-pro`). Do not guess Perplexity model ids — list them with the OpenRouter models curl.
- Sonar failures are caught and degrade gracefully to just the re-ask.
