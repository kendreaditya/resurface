# Native Linked References Parity

Reference for the exact DOM / CSS / inline-rendering shape Resurface mirrors so
the injected "Resurfaced" section is visually indistinguishable from the native
Linked References section that renders directly below it on journal pages.

Source of truth: a clone of Logseq at `/tmp/logseq` on the contributor's
machine. Paths below are relative to that clone.

## 1. Spacing (from `block.css` + `page.css`)

Tailwind `@apply` directives expanded to concrete values for the ones we care
about.

| Selector | Native rule | Why it matters |
|---|---|---|
| `.ls-block` | `py-0.5` (4px vertical padding) | Base vertical rhythm between sibling blocks. |
| `.block-main-container` | `min-h-[24px]` | Baseline row height that keeps bullet alignment stable. |
| `.block-children-container` | `position:relative; margin-left:29px; padding-top:0.125rem; margin-bottom:-0.125rem` | Provides the 29-px child indent. `position:relative` is the positioning context for the left border. |
| `.block-children-left-border` | `position:absolute; left:-1px; top:0; width:4px; height:100%; border-radius:2px; z-index:1` | The vertical hover strip on the left of a child group. NOT a flex sibling — it's absolutely positioned inside `.block-children-container`. |
| `.block-children` | `border-left:1px solid var(--ls-guideline-color, var(--lx-gray-04-alpha, ...))` | The visible indent guide line itself. |
| `.references-blocks-item` | (from `.my-2` in Hiccup + theme-supplied bg in right sidebar) | Card wrapper; theme owns the background. |

**Resurface deltas (before this change):**

- `.ls-block { padding:0; margin:0 }` — flattened native `py-0.5`, so sibling
  blocks hugged each other too tightly.
- `.block-children-container { margin:0; padding:0 }` — killed the 29-px indent.
- `.block-children-left-border { flex-shrink:0 }` — treated the border as a
  flex sibling (with width `0` and no absolute positioning) so the indent guide
  never appeared.
- `.block-children { padding:0 }` — not strictly wrong, but removed the
  native border-left declaration.

Corrected values live in `src/styles.css`. Custom hover background on
`.block-content.inline:hover` was removed so the user's theme wins.

## 2. Inline parsing (from `block.cljs`)

Logseq's `inline` multimethod (`src/main/frontend/components/block.cljs:1662`)
dispatches on mldoc AST node types. Each row is `AST shape → emitted Hiccup`.

| AST node | Emitted element | Resurface today |
|---|---|---|
| `["Plain" s]` | escaped text | ✓ `escapeHtml` |
| `["Emphasis" [["Bold"] …]]` | `<b>` | ✓ `**x**` |
| `["Emphasis" [["Italic"] …]]` | `<i>` | ✓ `*x*` |
| `["Emphasis" [["Underline"] …]]` | `<ins>` | ✓ (this change) `__x__` |
| `["Emphasis" [["Strike_through"] …]]` | `<del>` | ✓ (this change) `~~x~~` |
| `["Emphasis" [["Highlight"] …]]` | `<mark>` | ✓ `==x==` |
| `["Code" s]` / `["Verbatim" s]` | `<code>` | ✓ backticks |
| `["Link" {:url Complex_link}]` (external) | `<a class="external-link" target="_blank">` | ✓ |
| `["Link" {:url Image_link}]` | `<img>` | ✓ (this change) `![alt](url)` |
| `["Link" {:url Page_ref}]` / `[[x]]` | `<span class="page-reference"><span class="bracket">[[</span><a class="page-ref">…</a><span class="bracket">]]</span></span>` | ✓ |
| `["Tag" …]` / `#x`, `#[[x]]` | `<a class="tag" data-ref>#name</a>` | ✓ |
| `["Link" {:url Block_ref uuid}]` | resolves target block title, renders same shape as `page-ref` with the resolved title as label | ✓ (this change) — uses `Editor.getBlock(uuid)` to hydrate a `refs` map before render |
| `[[label](url)]` hybrid (seen in vault) | mldoc parses as plain `["Link"]`; outer brackets are cosmetic | ✓ (this change) — preprocessed to `[label](url)` before link regex runs |

Logseq `emphasis-cp` mapping (`block.cljs:1633-1641`):

```clojure
(case kind
  "Bold"          :b
  "Italic"        :i
  "Underline"     :ins
  "Strike_through":del
  "Highlight"     :mark)
```

Property lines (`id::`, `key:: value`) are filtered out by `stripPreamble` in
`src/mdParser.ts`, mirroring how Logseq hides them from rendered output.

## 3. Block structure (Hiccup, from `block.cljs` → rendered HTML)

A single native block plus one child, simplified to the shape Resurface emits:

```
<div class="ls-block …" haschild="…" level="1" data-resurface-uuid="…">
  <div class="block-main-container flex flex-row pr-2">
    <div class="block-control-wrap flex flex-row items-center h-6">
      <a class="block-control">
        <span class="control-hide"><span class="rotating-arrow not-collapsed">…</span></span>
      </a>
      <a class="bullet-link-wrap">
        <span class="bullet-container cursor"><span class="bullet"></span></span>
      </a>
    </div>
    <div class="flex flex-col block-content-wrapper">
      <div class="flex flex-row">
        <div class="flex-1 w-full" style="display:flex">
          <div class="block-content inline">
            <div class="flex flex-row justify-between block-content-inner">
              <div class="flex-1 w-full">{titleHtml}</div>
            </div>
            {bodyHtml?}
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- when block has children: -->
  <div class="block-children-container flex">
    <div class="block-children-left-border"></div>
    <div class="block-children w-full">
      {children…}
    </div>
  </div>
</div>
```

The `references-blocks-item` wrapper (`block.cljs:4273`) sits *above* this and
is what Resurface's per-card container mirrors with a `.my-2 references-blocks-item`
div. The per-card rung label (`1d`, `6mo`, `1y`, etc.) is a Resurface-only
addition placed inside that card's `foldable-title` row.

## 4. Editability — why we don't attempt it

Logseq's editor owns its own React-stateful DOM. Plugin-injected HTML lives
outside that tree and cannot be promoted into an editable block without
forking a chunk of the editor into the plugin context. The fallback that
Resurface ships with is good enough in practice:

- Click on the block body → `Editor.scrollToBlockInPage(uuid)` (wired in
  `src/main.ts:99` and `src/inject.ts`) navigates to the source page and
  scrolls the native, editable rendering into view.
- Click on a block-ref link (this change) → same handler, different DOM hook
  (`a.block-ref[data-resurface-block-ref]`).

Do not attempt inline editing. If a future version wants one, the right
approach is to open the block in the right sidebar
(`Editor.openInRightSidebar`) and let the native editor handle it there.
