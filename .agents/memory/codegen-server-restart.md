---
name: codegen requires server restart
description: After api-spec codegen adds/changes fields, the running api-server must be restarted or new fields get silently stripped.
---

After `pnpm --filter @workspace/api-spec run codegen` changes the OpenAPI schema (e.g. adding an optional field), the api-server route handlers validate/serialize with the generated Zod schemas from `@workspace/api-zod`. The already-running `api-server` workflow keeps the OLD compiled schemas in memory.

**Symptom:** a newly added optional field (e.g. a per-branch `color`) returns `undefined` on a PUT→GET round-trip even though typecheck passes — Zod's default strip drops the unknown key because the live process still has the pre-codegen schema.

**Why:** the dev server does not always reload regenerated lib output; the stale schema silently strips the field on parse.

**How to apply:** after any codegen that adds/changes request or response fields, restart the `artifacts/api-server: API Server` workflow before testing persistence. Always verify with an actual PUT→GET round-trip, not just typecheck.
