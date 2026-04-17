# Design Decisions

Each decision was made with the user and is load-bearing. Do not change without re-litigating.

## 1. Decay ladder: `1d, 3d, 1w, 2w, 1mo, 2mo, 6mo, 1y, 2y, 5y, 10y`

Defined at `src/ladder.ts:8`. Rungs are front-loaded (four within 2 weeks) then stretch out exponentially. The early rungs catch recent writes when the memory is still warm; the long rungs deliver surprise. The user chose these specific values — they are not tunable via settings yet, and changes require re-building. SR research (Ebbinghaus, Leitner, SM-2) informed the *intuition* that expanding intervals match the forgetting curve, but we are not running a scheduler.

## 2. Window strategy: ±3d → ±7d → ±14d → skip

`src/ladder.ts:22` (`WINDOW_TIERS_DAYS`), applied in `src/selection.ts:30`. Primary window is ±3 days around the rung's anchor date. If no candidates, widen to ±7d, then ±14d. If still empty, the rung is skipped (no card rendered). Rationale: the user writes ~daily but not every day. A hard ±3 window would silently drop rungs on thin weeks; a single ±14 window would dilute the anchor meaning. Tiered fallback is the compromise.

## 3. Flat list, one pick per rung

`src/selection.ts:53` picks exactly one block per rung (max content length, tiebreak by newest `createdAt`). No grouping headers ("1 year ago", "6 months ago"), no multi-block rungs. The user explicitly rejected grouping — the section should read as a unified stream with rung labels as metadata, not as a table of contents. The rung label lives inside the card header (`src/render.ts:92`), right-aligned.

## 4. Source pool = any bullet block, not just journal bullets

`queryBlocksByCreatedAt` (`src/query.ts:101`) walks the whole DB filtered by `:block/created-at`, not by page type. Study notes, reading highlights, scratch pages — all are candidates as long as they were *written* on the anniversary date. This is the key reason we query by `:block/created-at` rather than the page's `:block/journal-day`: a note written today on a non-journal page will resurface a year from now even though the containing page has no journal-day. Journal-day is only used as a fallback (`src/query.ts:115`) for vaults where `created-at` is missing.

## 5. Trigger = journal page open only

`src/main.ts:108` gates on `isJournalPage()`. No sidebar, no popup, no notifications, no command palette entry. The user wanted this to feel like a built-in part of the journal, not a feature they have to invoke. Route changes and DOM mutations both re-trigger the pipeline so it stays in sync as the user navigates between journal days.

## 6. Stateless v1 — no exposure tracking

No "I've seen this block" memory, no SM-2 grading, no ease factor. `src/state.ts` persists only `sectionCollapsed`. A block can (and will) resurface on multiple rungs over its lifetime. The user's argument: passive re-exposure *is* the point, and deduping across sessions would require tracking, which would require a schema, which would require migration, which kills the "zero ceremony" feel. If the same block comes up twice in the same session within different rungs, `usedUuids` in `src/selection.ts:24` prevents that — cross-session dedup is explicitly out of scope.

## 7. Parity with Linked References styling

`src/render.ts:128` emits a DOM tree that mirrors Logseq's native `.references.page-linked` section (see `logseq-internals.md` for the original Clojure reference). We reuse the exact class names (`foldable-title`, `references-blocks-item`, `ls-block`, `block-content inline`, `block-main-container`, `bullet-link-wrap`, etc.) so the user's active theme styles us automatically. No CSS variable plumbing, no theme detection. The filter icon that sits on the native section header is omitted — there is nothing meaningful to filter in the resurfaced set, and a no-op icon would be worse than absence.

## 8. Rung label visible on each card

`src/render.ts:92` emits `<span class="resurfaced-rung">{rung.label}</span>` inside the card header, right of the page-ref. The user explicitly requested this and liked it. Styling is minimal (`src/styles.css:1`) — small, dim, tabular-nums. It is the single clearest signal that this section is temporal, not topical, and it answers the first question the user has when they see a resurfaced block: "how old is this?"

## 9. Exclude current page from source pool

`resolvePageId(title)` (`src/main.ts:47`) fetches the current journal's pageId and passes it to the selector, which filters it out inside `normalizeHits` (`src/query.ts:67`). Otherwise the `1d` rung tends to surface blocks from yesterday's journal *on* yesterday's journal when navigating backward, which is useless.

## 10. Gunk filter

`isGunk` (`src/ladder.ts:72`) rejects blocks that are property-only, pure headers, marker-only (`TODO `), lone page-refs, lone block-refs, or shorter than 8 chars. `stripLogseqMarkers` (`src/ladder.ts:82`) is reserved for future use; rendering strips preamble independently via `mdParser.ts:17`. The filter is conservative — its job is to prevent "surfacing a block that says just `TODO`" from dominating a rung because it happens to be the only hit in the window.
