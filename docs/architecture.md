# Architecture

## Lifecycle

```
logseq.ready(main)                         src/main.ts:176
    │
    ├─ provideStyle(resurface-styles)      src/main.ts:163
    ├─ state.load(logseq.settings)         src/main.ts:164  → src/state.ts:9
    ├─ diagnoseSchema()                    src/main.ts:166  → src/query.ts:19
    ├─ run()                               src/main.ts:167
    ├─ watchForJournalMount()              src/main.ts:151  (MutationObserver on body)
    └─ App.onRouteChanged(run)             src/main.ts:170
```

Both the route-change hook and the MutationObserver call `run()`. The observer catches cases where Logseq swaps the journal content without firing a route change (e.g. infinite-scroll journal stacks). Dedup is handled by `lastRenderedTitle` (`src/main.ts:16`, `:117`).

## `run()` pipeline (`src/main.ts:101`)

```
isJournalPage()            src/inject.ts:27  — DOM probe for .journal-item / .journal.page / .page.is-journals
    ↓
readJournalTitleFromDom()  src/main.ts:19   — .journal-title h1.title, fallback h1.title
    ↓
parseJournalName()         src/main.ts:27   — accepts "YYYY-MM-DD", "YYYY_MM_DD", or "Apr 17th, 2026"
    ↓
resolvePageId(title)       src/main.ts:47   — Editor.getPage(name); tries lowercase variant too
    ↓
selectResurfaced(anchor)   src/selection.ts:19
    │
    │   for each rung in LADDER                       src/ladder.ts:8
    │     anchoredBack = shiftDateBack(anchor, rung)  src/ladder.ts:24
    │     for tierDays in [3, 7, 14]:                 src/ladder.ts:22
    │       hits = queryBlocksByCreatedAt(...)        src/query.ts:101
    │       if empty: hits = queryBlocksByJournalDay  src/query.ts:115
    │       fresh = hits - usedUuids
    │       if fresh: pick longest (tiebreak newest)  src/selection.ts:49
    │                 break
    ↓
renderResurfaced(picks)    src/render.ts:128
    ↓
injectResurfaced(html, onAction) src/inject.ts:89
```

A render-in-flight guard (`src/main.ts:14,102`) collapses concurrent triggers. If a trigger arrives while a render is running, it queues exactly one re-run on completion.

## Injection strategy (`src/inject.ts:31`)

```
root ← journalRoot()   // .journal-item | .journal.page | .page.is-journals | .page-inner-wrap.is-journals
    │
    ├─ refs = root.querySelector('.references:not(.resurfaced-refs)')
    │       (or document-wide as fallback)
    │
    ├─ if refs exists:
    │     wrapper = refs.closest('.lazy-visibility')
    │     insertAdjacentElement('beforebegin', ourEl)
    │         on wrapper if present, else on refs
    │
    └─ else:
          insertAdjacentElement('beforeend', ourEl) on root
```

The `.lazy-visibility` closest-walk is important: Linked References is wrapped in a lazy-load container in recent Logseq builds, and inserting inside it causes our element to get unmounted when the lazy container re-renders.

## Event dispatch (`src/inject.ts:51`, `:105`)

One `click` listener is attached to our injected root. `resolveAction(target)` walks ancestors for `data-resurface-role` / `data-resurface-card` / `a.page-ref` / `a.tag` and returns a tagged `ClickAction`:

- `section-toggle` — toggle `state.sectionCollapsed`; persist via `logseq.updateSettings` (`src/main.ts:60`).
- `card-toggle` — toggle membership in `state.collapsedCards` (transient; cleared on every fresh render, `src/main.ts:130`).
- `page-nav` — `App.pushState('page', { name })` (`src/main.ts:86`).
- `tag-nav` — same, using the `data-ref` attribute.

`http`-prefixed anchors short-circuit the handler (`src/inject.ts:108`) so external links open normally.

## State (`src/state.ts`)

Only `sectionCollapsed` is persisted. Card collapse is deliberately transient — the card set is identity-tied to the uuids in the current render, and a new journal produces new uuids. Clearing on render (`src/main.ts:130`) avoids stale entries accumulating.

## Styling

`src/styles.css` ships three rules:

1. `.resurfaced-rung` — the small right-aligned label.
2. `.block-ref-placeholder` — dim italic for unresolved `((uuid))` refs.
3. Hide twistie on leaf blocks (our cards have no children to toggle).

All other visual parity is achieved by reusing Logseq's class names (`references page-linked`, `foldable-title`, `references-blocks-item`, `ls-block`, `block-content inline`, etc.) in `src/render.ts`. The user's theme then styles us for free.
