# Resurface — Design Docs

Resurface is a Logseq plugin that injects a "Resurfaced" section above Linked References on every journal page. It surfaces one bullet block per rung of a time-decay ladder (`1d, 3d, 1w, 2w, 1mo, 2mo, 6mo, 1y, 2y, 5y, 10y`), drawn from anywhere in the vault based on `:block/created-at`. Mission: emotional continuity + wisdom persistence via passive re-exposure. Not SRS, not random, not search — "Timehop for your vault" structured on forgetting-curve intuitions. v1 is fully stateless.

## Reading order

1. `architecture.md` — runtime flow, pipeline, injection strategy, event dispatch.
2. `design-decisions.md` — rationale for ladder, window fallbacks, source pool, statelessness, parity with Linked References.
3. `logseq-internals.md` — DOM selectors, datascript query shape quirks, plugin API surfaces we leaned on.
4. `markdown-renderer.md` — why `mdParser.ts` exists, regex order, edge cases.
5. `debugging-notes.md` — the non-obvious bugs that ate hours. Read before making changes.

## Source map

- `src/main.ts` — plugin bootstrap, route + mutation watcher, pipeline orchestrator.
- `src/ladder.ts` — rung config, date math, gunk filter, marker stripping.
- `src/query.ts` — datascript queries + schema diagnostic.
- `src/selection.ts` — per-rung window tier fallback + picking.
- `src/render.ts` — Linked-References-parity HTML emitter.
- `src/mdParser.ts` — inline markdown → Logseq-classed HTML.
- `src/inject.ts` — DOM placement + delegated click handler.
- `src/state.ts` — persisted section collapse + transient card collapse.
- `src/styles.css` — three custom rules; everything else inherits from Logseq theme.
