---
name: Orval query hooks require queryKey in options
description: Generated useQuery hooks need an explicit queryKey when you pass a query options object (e.g. enabled).
---

When calling an Orval-generated React Query hook (e.g. `useListFlowVersions`) and passing a `query` options object, you MUST include `queryKey` — even if all you actually want is `enabled`:

```ts
useListFlowVersions({ query: { queryKey: getListFlowVersionsQueryKey(), enabled: open } });
```

Omitting it fails typecheck: `TS2741: Property 'queryKey' is missing ... required in type 'UseQueryOptions<...>'`.

**Why:** this repo's Orval config types the per-hook `query` field as the full `UseQueryOptions`, where `queryKey` is required. The hook supplies a default internally, but once you pass your own options object TS expects the complete shape.

**How to apply:** every generated list/get hook exports a matching `get<Name>QueryKey()` helper — pass it as `queryKey`. Import both from the `@workspace/api-client-react` barrel.
