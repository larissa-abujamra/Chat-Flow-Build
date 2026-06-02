---
name: Live research nodes are non-deterministic
description: Why Flow Builder's Sonar-backed business/catalog research nodes give different output across identical runs.
---

The `confirmaNegocio` (`researchBusiness`) and `catalogo` (`researchCatalog`) chat nodes call Perplexity Sonar Pro Search live. The same business name can return a populated result on one run and the honest "couldn't build it automatically" fallback on the next.

**Why:** live web search + LLM output vary; product/price availability changes and the model is not deterministic.

**How to apply:** when testing the onboarding chat, an empty catalog or sparse business summary is NOT necessarily a regression. Re-run a couple of times before concluding the research path is broken. The catalog fallback is intentional honesty, not mocked data.
