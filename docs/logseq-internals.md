# Logseq Internals We Leaned On

Verified against the `/tmp/logseq/` checkout. Line numbers drift across Logseq versions — treat them as starting points, not guarantees.

## Journal page DOM shape

The host Logseq Electron/webview does not expose React internals to plugins; we must read the rendered DOM.

- Today's journal root: `.journal-item > .journal.page`
- Past journals (from journal stack): `.page.is-journals` (sometimes `.page-inner-wrap.is-journals`)
- Title element: `.journal-title h1.title`, fallback `h1.title`
- Linked References wrapper: `.references.page-linked`
- Lazy-load wrapper for refs (recent builds): `.lazy-visibility`

Selection logic: `src/inject.ts:19` (journalRoot), `src/inject.ts:31` (findAnchor), `src/main.ts:19` (title probe).

Clojure origin of `.references`: `/tmp/logseq/src/main/frontend/components/reference.cljs:71` — `[:div.references (references-cp entity ...)]`. The ref is a sibling within the journal-item, not a descendant of `.journal.page` — see debugging note #4.

Where `.is-journals` is attached to the page root: `/tmp/logseq/src/main/frontend/components/page.cljs` around the `page-inner-wrap` builder (search for `is-journals`).

The native card layout we mimic (block-main-container → block-control-wrap → bullet → block-content-wrapper → block-content.inline) is defined in `/tmp/logseq/src/main/frontend/components/block.cljs` around the `ref-block-container` / block rendering functions. Our mirror is `src/render.ts:100-119`.

## Datascript query gotcha (critical)

`logseq.DB.datascriptQuery` returns pull results with **namespace-stripped flat keys**. A pull like

```clojure
(pull ?b [:block/uuid :block/content {:block/page [:db/id :block/name :block/journal-day]}])
```

comes back as:

```js
{
  uuid: "…",
  content: "…",
  "created-at": 17…,
  page: { id: 123, name: "…", "original-name": "…", "journal-day": 20260417 }
}
```

NOT as `{ "block/uuid": …, "block/content": …, "block/page": { "db/id": …, "block/name": … } }`. Accessing `pull["block/uuid"]` returns `undefined` and will silently drop every row. We lost hours to this. `src/query.ts:54-90` tolerates both shapes defensively (`pull.uuid ?? pull["block/uuid"]`, etc.), but the flat shape is what you get in practice.

The schema diagnostic in `src/query.ts:19` logs a sample pull on startup so you can spot the shape immediately in devtools.

## Plugin API surfaces we used

From `/tmp/logseq/libs/src/LSPlugin.ts`:

- `logseq.ready(callback)` — entry point.
- `logseq.provideStyle({ key, style })` — injects our `styles.css` into the host.
- `logseq.updateSettings(obj)` — persisted settings bag; used for `sectionCollapsed`.
- `logseq.settings` — read back the persisted bag on load (`src/state.ts:9`).
- `logseq.App.onRouteChanged(cb)` — fires on SPA navigation.
- `logseq.App.pushState('page', { name })` — navigate to a page.
- `logseq.Editor.getPage(name)` — resolve a page entity by name.
- `logseq.DB.datascriptQuery(q)` — run a raw Datalog query against the block DB.

What we did NOT use:

- `logseq.Editor.getCurrentPage()` — returns null on the user's build when mounted on a journal. See debugging note #1.
- Logseq's native block renderer — there is no plugin-accessible function that takes a block uuid and returns rendered HTML. The renderer lives in `/tmp/logseq/src/main/frontend/components/block.cljs` in the `inline` dispatcher (large pattern-match on Hiccup AST) and is not exposed. That's why `src/mdParser.ts` exists — see `markdown-renderer.md`.

## Chevron styling trick

Logseq's Linked References uses a `block-control` anchor that sits in the left gutter, outside the card padding. Without explicit sizing, a block-control inside our DOM collapses or sits inline with the title. The fix is an inline style on every chevron wrapper:

```ts
const CTRL_STYLE = "width: 14px; height: 16px; margin-left: -30px;";
```

Defined once in `src/render.ts:7` and applied to both section-level (`src/render.ts:55`) and card-level (`src/render.ts:87`) controls. The negative margin pulls the chevron into the gutter so it visually aligns with native Linked References chevrons.

## What Logseq stores on a block

Fields we read (via pull): `:block/uuid`, `:block/content`, `:block/title` (DB graphs), `:block/created-at`, `:block/page`. On the page entity: `:db/id`, `:block/name` (lowercased canonical), `:block/original-name` (casing preserved), `:block/journal-day` (int like `20260417`, only on journal pages).

DB-mode graphs (newer) store content under `:block/title`; file-based graphs use `:block/content`. Our pull requests both and `normalizeHits` (`src/query.ts:62`) falls back accordingly.

## Why not `logseq.DB.q` or `customQuery`?

`DB.q` and `DB.customQuery` layer extra processing (rule expansion, advanced query syntax). `datascriptQuery` is the rawest path and matches the shape we want (pull results). No reason to take the more featureful wrappers when we control the query string.
