---
name: Deferred setState closures over mutable indices
description: Why React functional-updater callbacks must not read a mutable loop/closure variable; capture the value first.
---

# Deferred setState updaters must not read mutable closure vars

When scheduling sequential UI reveals (e.g. multi-bubble chat replies) with
`setTimeout` + a React functional updater, do NOT have the updater read a
mutable closure variable that you mutate synchronously after the `setState`
call.

**The trap:** `setMessages((prev) => [...prev, { content: parts[i] }]); i += 1;`
React runs the updater LATER (during commit), by which time `i` has already
advanced — so the updater reads `parts[i]` out of range and pushes `undefined`.

**The fix:** pass the index as a function argument and capture the value into a
`const` BEFORE calling `setState`:
`const content = parts[idx]; setMessages((prev) => [...prev, { content }]);`

**Why:** in Flow Builder this pushed an assistant message with
`content: undefined`, which then failed server-side zod (`messages[n].content`
is required) → `POST /api/chat` 400 → "Something went wrong generating a reply"
on the user's first answer. Symptom looked like a backend/LLM failure but was a
client payload-shape bug.

**How to apply:** any time a deferred callback (timer, promise, raf) feeds data
into setState, snapshot the data it needs at schedule/run time; never let it
dereference a variable you keep mutating.
