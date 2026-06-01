---
name: Replit managed AI with gpt-5 models
description: Quirks of calling gpt-5-family models through the Replit-managed AI OpenAI-compatible proxy.
---

When using gpt-5-family chat completions (e.g. `gpt-5-mini`) via the Replit-managed AI proxy:

- Do NOT pass `temperature` — gpt-5 models reject any non-default temperature and the request errors.
- Use `max_completion_tokens`, NOT `max_tokens`.
- `response_format: { type: "json_object" }` works for forcing JSON output.

**Why:** Discovered while building the chat branch-classifier; passing `temperature` or `max_tokens` caused request failures.

**How to apply:** When constructing any OpenAI chat completion against the managed proxy with a gpt-5 model, omit `temperature` and use `max_completion_tokens`.

Setup: managed AI is enabled via `setupReplitAIIntegrations` (may require user phone verification). It sets env vars `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`, consumed by the `openai` SDK directly. No user-provided API key needed.
