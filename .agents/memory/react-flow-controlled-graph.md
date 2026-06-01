---
name: React Flow (@xyflow/react) controlled-graph pattern
description: How to wire a React Flow graph when the app's own state (not RF internal state) is the source of truth.
---

When embedding a React Flow (`@xyflow/react`) graph whose data is owned by app state (e.g. a flow document edited elsewhere too):

- Do NOT rebuild RF `nodes` with `useMemo` from app state every render. That hands React Flow brand-new node objects each render, which strips RF's internal `measured` dimensions and produces the runtime error "trying to drag a node that is not initialized" (overlay shows a generic "(unknown runtime error)" via the Replit runtime-error plugin). Dragging silently breaks.
- Instead use `useNodesState` / `useEdgesState` and **reconcile** from app state in a `useEffect`: map over the app-state nodes, and for each, spread the previous RF node (`...existing`) so `measured`/`width`/`height`/`position` survive, then overwrite `id`/`type`/`data`. Prefer the existing RF `position` over the stored one so live drags aren't clobbered mid-interaction.
- Persist drag positions on `onNodeDragStop` (read current `rfNodes` positions, write back to app state) — not on every `onNodesChange` position event.
- Pass RF's built-in `onNodesChange`/`onEdgesChange` so RF can apply position/dimension/selection changes locally for smooth UX. For edge deletes, wrap `onEdgesChange`: call it, then also strip the removed branch ids from app state. Handle node deletes via `onNodesDelete` (remove node AND null out branches/targets pointing at it).
- `onConnect` creates the domain relationship (e.g. a branch); guard against self-loops (`source === target`) and duplicate source→target edges.
- Define `nodeTypes` as a module-level const (or stable `useMemo`) to avoid the "new nodeTypes object" re-mount warning.
- Mark interactive elements inside custom nodes with `nodrag` (and `nowheel` for scrollable areas) so they don't start a node drag.

**Why:** A controlled (app-state-as-source-of-truth) setup keeps multiple editing views consistent and makes persistence trivial, but React Flow still needs to own the node *objects* so it can attach measured dimensions; recreating them each render is what breaks dragging.

**How to apply:** Reference-cleanup on node delete must be mirrored in EVERY editor surface (e.g. both a list view and the graph view), or one path leaves stale targets that silently break downstream logic.
