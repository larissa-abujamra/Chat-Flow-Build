---
name: Server-side flow PUT vs. the open editor's stale state
description: Why a server-side PUT /api/flow change can silently revert, and what to do about it.
---

The Flow Builder editor (flow-editor.tsx) holds the whole flow in React state and
its "Save Flow" button does a full `PUT /api/flow` of that in-memory copy. The
chat preview also sends the editor's LIVE flow, not the DB row.

**Symptom:** you change the persisted flow server-side (e.g. `curl`/script PUT to
re-wire branches), it verifies fine, but later a GET shows the OLD wiring again.

**Why:** the user still had the editor open with the pre-change flow loaded. When
they (or an autosave-like action) click "Save Flow", that stale in-memory flow
overwrites the DB — clobbering your server-side edit. The editor only re-fetches
on a fresh page load (useGetFlow), so it never saw your change.

**How to apply:** after any server-side flow edit, tell the user to RELOAD the
Flow Builder tab before touching the editor, otherwise their next save reverts it.
For durable flow changes, prefer doing them through the editor/UI or warn loudly.
The flow chart needs no manual layout update: node `position` is usually null and
`computeLayout()` (BFS depth → y level) auto-arranges from the wiring, so the
chart reflects branch changes automatically once the new flow is loaded.
