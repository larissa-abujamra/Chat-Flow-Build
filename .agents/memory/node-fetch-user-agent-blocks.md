---
name: Node fetch User-Agent blocks
description: Some upstreams 403 the default Node global-fetch User-Agent; send a browser-like UA when scraping/calling public APIs server-side.
---

Node's global `fetch` sends `User-Agent: node` by default. Several public endpoints reject that with **403**:

- **BrasilAPI** (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`): 200 with no UA or a browser UA, but **403 with `user-agent: node`**. Confirmed via curl from the server's network (`-A node` → 403, `-A Mozilla/...` → 200).
- General site scraping (fetching a business's homepage to extract its Instagram link) — many sites also gate on UA.

**Why:** these providers block obvious bot/library UAs. The same call can succeed from a different network (e.g. the code-execution sandbox) and still fail from the api-server process, so "works in the notebook" does NOT prove the server path works — always verify from the server.

**How to apply:** when calling third-party HTTP APIs or scraping HTML from Node server code, set an explicit browser-like `user-agent` header on the request. Treat a 403 from such a call as a probable UA block before assuming an outage or rate limit.

Related, when scraping a page for footer social links: read the FULL body (cap generously, e.g. 3MB) rather than a small head slice — footer `instagram.com/...` links live near the END of the document. Also tolerate JSON-escaped slashes (`instagram.com\/handle`) inside inline `<script>` data.
