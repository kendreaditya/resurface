# CLAUDE.md — Resurface

Resurface is a Logseq plugin that injects a "Resurfaced" section above Linked References on every journal page, showing one bullet block per rung of a time-decay ladder (`1d, 3d, 1w, 2w, 1mo, 2mo, 6mo, 1y, 2y, 5y, 10y`), drawn from anywhere in the vault by `:block/created-at`. Mission is emotional continuity and wisdom persistence through passive re-exposure — not SRS, not search, not random. v1 is stateless.

## Onboarding reading order

Read `docs/` in this order before making changes:

1. `docs/README.md` — index + summary.
2. `docs/architecture.md` — runtime pipeline, injection strategy, event dispatch.
3. `docs/design-decisions.md` — why each choice (ladder, windows, source pool, statelessness, parity).
4. `docs/logseq-internals.md` — DOM selectors, datascript query shape, plugin API surfaces.
5. `docs/markdown-renderer.md` — why `mdParser.ts` exists, regex order, edge cases.
6. `docs/debugging-notes.md` — real bugs that ate hours. Read before changing DOM or query code.

## Source files

- `src/main.ts` — plugin bootstrap, route + MutationObserver, `run()` pipeline orchestrator.
- `src/ladder.ts` — ladder config, date shifts, gunk filter, marker stripping.
- `src/query.ts` — `diagnoseSchema`, `queryBlocksByCreatedAt`, `queryBlocksByJournalDay`.
- `src/selection.ts` — per-rung window-tier fallback and block picking.
- `src/render.ts` — HTML emitter that mirrors Logseq's native Linked References DOM.
- `src/mdParser.ts` — inline markdown → Logseq-classed HTML (our own, since Logseq doesn't expose its renderer).
- `src/inject.ts` — DOM placement and delegated click handler.
- `src/state.ts` — persisted section collapse + transient card collapse.
- `src/styles.css` — three custom rules; everything else inherits from the user's Logseq theme.

## Top gotchas

1. **Date comes from the DOM title, not `Editor.getCurrentPage()`.** `getCurrentPage()` returns null on fresh journal mounts in recent Logseq builds. `src/main.ts:19` reads `.journal-title h1.title` (fallback `h1.title`) and parses both ISO and "Apr 17th, 2026" formats. Do not revert to `getCurrentPage()` as the primary source.
2. **`logseq.DB.datascriptQuery` returns flat, namespace-stripped pull keys.** A pull of `:block/uuid` comes back as `pull.uuid`, not `pull["block/uuid"]`. `:block/page` nested as `pull.page.id`, not `pull["block/page"]["db/id"]`. See `src/query.ts:54-90` for the defensive reader and `diagnoseSchema` (`src/query.ts:19`) for a startup log that shows the real shape. Do not trust intuition about namespacing.

## Build & load

```bash
npm install
npm run build      # vite build → dist/
# or: npm run dev  # vite build --watch
```

In Logseq Desktop: Settings → Advanced → Developer mode → on. Top-right `…` → Plugins → Load unpacked plugin → select this folder. Reload the plugin from the Plugins page after each rebuild.
