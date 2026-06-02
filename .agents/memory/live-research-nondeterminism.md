---
name: Live research nodes are non-deterministic
description: Why Flow Builder's Sonar-backed business/catalog research nodes give different output across identical runs.
---

The Sonar-backed research nodes — `confirmaDados`/CNPJ name-lookup fallback (`researchBusiness`), `catalogo` (`researchCatalog`), and the off-script answer path — call Perplexity Sonar Pro Search live. The same business name/CNPJ can return a populated result on one run and the honest fallback on the next.

**Why:** live web search + LLM output vary; product/price availability changes and the model is not deterministic.

**How to apply:** when testing the onboarding chat, an empty catalog or sparse business summary is NOT necessarily a regression. Re-run a couple of times before concluding the research path is broken. The fallbacks are intentional honesty, not mocked data: the catalog now asks the user to type their 3 top sellers when nothing is found, rather than claiming "Achei seu cardápio!" with an empty list.
