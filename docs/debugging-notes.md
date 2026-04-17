# Debugging Notes

Real bugs that ate real hours. Each entry is symptom → root cause → fix → how to avoid regressing.

## 1. `Editor.getCurrentPage()` returns null on a journal page

**Symptom.** `run()` bailed before doing anything. Logging showed `await logseq.Editor.getCurrentPage()` returning `null` even with the journal fully mounted. No errors.

**Root cause.** On the user's Logseq build (Electron desktop, recent), `getCurrentPage()` is only populated when the user has explicitly navigated via a page link. Opening a journal via the calendar sidebar or the initial mount leaves it null. This isn't documented and may differ across versions.

**Fix.** Read the page title from the DOM instead. `readJournalTitleFromDom()` (`src/main.ts:19`) tries `.journal-title h1.title` first, then falls back to `h1.title`. The string is parsed by `parseJournalName` (`src/main.ts:27`) which accepts both ISO (`2026-04-17`, `2026_04_17`) and Logseq's pretty format (`Apr 17th, 2026`). The resulting `jd` is converted to an anchor Date.

**Avoid regressing.** Do not add `await Editor.getCurrentPage()` back into the main path. Use it only as a secondary check if needed, never as the primary source of truth for "what journal is this". If the title parser hits a new format, extend `parseJournalName`.

## 2. `datascriptQuery` pull results use flat, namespace-stripped keys

**Symptom.** Every rung returned 0 blocks. Schema diagnostic logged `createdCount = 1603` (blocks exist), but `queryBlocksByCreatedAt` produced empty hit arrays for every window tier on every rung.

**Root cause.** We were accessing `pull["block/uuid"]`, `pull["block/content"]`, `pull["block/page"]["db/id"]`. `logseq.DB.datascriptQuery` returns pulls with the namespace stripped: the actual keys are `uuid`, `content`, `page.id`, `"created-at"`, etc. Every `pull["block/uuid"]` evaluated to `undefined`, `if (!uuid) continue` filtered the row, and the query looked empty.

**Fix.** `normalizeHits` (`src/query.ts:54-90`) reads with the flat key first and falls back to the namespaced key:

```ts
const uuid = pull.uuid ?? pull["block/uuid"];
const content = pull.content ?? pull.title ?? pull["block/content"] ?? pull["block/title"] ?? "";
const pageRaw = pull.page ?? pull["block/page"];
const pageId = pageRaw?.id ?? pageRaw?.["db/id"];
```

The `pull.title` fallback covers DB-mode graphs where blocks expose `:block/title` instead of `:block/content`.

**Avoid regressing.** `diagnoseSchema` (`src/query.ts:19`) logs a sample pull on startup. When debugging query issues, check that log first — the shape is right there. Do not trust intuition about namespacing; verify by logging.

## 3. Journal root selector varies across builds

**Symptom.** On the user's machine, "today's journal" was detected but "yesterday's journal in a scrolling journal stack" was not. Injection was skipped entirely.

**Root cause.** The original `isJournalPage()` only matched `.page.is-journals`. In recent builds, today's journal uses `.journal-item > .journal.page`; the `.page.is-journals` class only appears when visiting a past journal directly.

**Fix.** `journalRoot()` (`src/inject.ts:19`) tries four selectors in order:

```ts
doc.querySelector(".journal-item")
  ?? doc.querySelector(".journal.page")
  ?? doc.querySelector(".page.is-journals")
  ?? doc.querySelector(".page-inner-wrap.is-journals")
```

Any match counts as a journal page.

**Avoid regressing.** If a future Logseq build introduces another selector, add it to this chain — do not replace entries. The chain is intentionally generous; false positives are harmless because the next step (title parse) gates on a valid date.

## 4. `.references` is not a descendant of `.journal.page`

**Symptom.** `findAnchor()` called `root.querySelector('.references')` and got `null` even though Linked References was clearly rendered on the page.

**Root cause.** In the DOM, `.references` lives as a sibling of `.journal.page` inside `.journal-item`, not as a child of `.journal.page`. The original code rooted the query at `.page.is-journals` and missed the refs entirely.

**Fix.** Two layers in `findAnchor` (`src/inject.ts:38-41`):

1. Query the journal root (which is `.journal-item` when present — see fix #3).
2. Fallback to a document-wide query if not found inside the root.

Also: walk up to `.lazy-visibility` if present and insert `beforebegin` on the wrapper, not on `.references` itself, so we survive the lazy container's re-mounts.

**Avoid regressing.** Do not restrict the refs query to the journal root without the document-wide fallback. The root-vs-sibling relationship depends on the build.

## 5. Chevrons render inside card padding instead of in the gutter

**Symptom.** First working render — cards showed up, content was right, but the fold chevrons sat inside the card text area, not in the left gutter where native Linked References chevrons live.

**Root cause.** Logseq's native `.block-control` relies on layout context (parent flex + sibling bullet) to size and position itself. Without that context, our anchor collapsed to zero-width and rendered in-flow with the title.

**Fix.** Inline style on both section-level and card-level controls:

```ts
const CTRL_STYLE = "width: 14px; height: 16px; margin-left: -30px;";
```

Defined at `src/render.ts:7`. The negative `margin-left` pulls the chevron into the gutter; the explicit width/height prevents collapse. Applied at `src/render.ts:55` (section) and `:87` (card).

**Avoid regressing.** Do not remove this inline style when "cleaning up." It looks like dead CSS but it is the only thing keeping chevrons in the gutter. If you move to an external CSS rule, prove out in at least two themes (light default + dark default) before committing — inline survives specificity fights that external CSS can lose to theme overrides.

## 6. Card-collapse state accumulates stale uuids

**Symptom.** Not a bug per se but a latent leak: `collapsedCards: Set<string>` grew without bound as the user navigated between journals.

**Fix.** Clear on every fresh render at `src/main.ts:130` (`state.collapsedCards.clear()`). Card collapse is a "within this view" concept; persistence across journals is not wanted.

**Avoid regressing.** If you ever add persistence for card collapse, do it in a uuid→timestamp map with TTL eviction, not an unbounded Set. And think about whether the user actually wants that persistence — they did not in v1.
