---
name: React Flow (@xyflow/react) controlled-graph pattern
description: How to wire a React Flow graph when the app's own state (not RF internal state) is the source of truth.
---

When embedding a React Flow (`@xyflow/react`) graph whose data is owned by app state (e.g. a flow document edited elsewhere too):

- Derive RF `nodes`/`edges` with `useMemo` from app state every render — do NOT keep a parallel `useNodesState` copy that can drift.
- Persist drag positions by handling `onNodesChange`: filter for `type === "position"` changes and write `position` back into the app state node. Store position as an optional field so existing data stays valid.
- `onConnect` should create the domain relationship (e.g. a branch) — guard against self-loops (`source === target`) and duplicate source→target edges.
- Use `onEdgesChange` (filter `type === "remove"`) and `onNodesDelete` to remove the underlying domain objects AND clean up dangling references (null out targets pointing at deleted nodes).
- Define `nodeTypes` as a module-level const (or stable `useMemo`) to avoid React Flow re-mount warnings.
- Mark interactive elements inside custom nodes with the `nodrag` class (and `nowheel` for scrollable areas) so they don't trigger node dragging.

**Why:** A controlled (app-state-as-source-of-truth) setup keeps multiple editing views consistent and makes persistence trivial, but only if every mutation path cleans references.

**How to apply:** Reference-cleanup on node delete must be mirrored in EVERY editor surface (e.g. both a list view and the graph view), or one path leaves stale targets that silently break downstream logic.
