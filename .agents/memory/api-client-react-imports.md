---
name: Importing from @workspace/api-client-react
description: Where to import generated React Query hooks and Zod/TS types from in this monorepo.
---

Always import generated hooks and types from the package barrel:

```ts
import { FlowInput, ChatMessage, ChatResult, useSendChat } from "@workspace/api-client-react";
```

Do NOT import from the deep generated path:

```ts
// WRONG — breaks type resolution and cascades implicit-any errors across the file
import { FlowInput } from "@workspace/api-client-react/src/generated/api.schemas";
```

**Why:** Importing from the deep `src/generated/...` path bypasses the package's type entry points, so TS fails to resolve the generated types and every value depending on them becomes implicit `any`.

**How to apply:** Whenever consuming Orval-generated hooks/schemas in any artifact, import from the `@workspace/api-client-react` barrel only.
