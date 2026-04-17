# .logseq-ref/ — Logseq source snapshot

Read-only snapshot of key Logseq source files, copied from
`https://github.com/logseq/logseq` (master branch). Committed here so
future agents can diff `resurface`'s rendering against native Linked
References without needing to clone Logseq.

Folder name is `.logseq-ref` (not `.logseq`) to avoid colliding with
Logseq's own `.logseq/` config directory convention, in case this repo
is ever opened as a graph.

## What's here

### Linked References rendering
- `src/main/frontend/components/reference.cljs` — the `.references` root component.
- `src/main/frontend/components/reference_filters.cljs` — filter chip include/exclude behavior.
- `src/main/frontend/components/views.cljs` — renders the `view-head` ("N Linked References" + funnel icon).

### Block rendering + inline markup
- `src/main/frontend/components/block.cljs` — large file. Key functions: `ref-block-container`, `references-cp`, `breadcrumb-with-container`, `blocks-container`, `inline`, `map-inline`, `markup-element-cp`, `emphasis-cp`, `page-cp`, `page-inner`, `link-cp`, `block-reference`.
- `src/main/frontend/components/page.cljs` — where `.is-journals` class is applied and page layout flows.

### CSS (spacing + theming)
- `src/main/frontend/components/block.css` — `.ls-block`, `.block-main-container`, `.block-children-container`, `.block-children-left-border`, `.references-blocks-item`.
- `src/main/frontend/components/page.css` — `.references`, `.references-blocks-wrap`, `.page-linked`.

### Markdown / inline parsing (mldoc → AST)
- `deps/graph-parser/src/logseq/graph_parser/text.cljs` — inline text detection (page-ref, tag, block-ref regexes).
- `deps/graph-parser/src/logseq/graph_parser/block.cljs` — block-level parsing, namespace expansion.
- `deps/graph-parser/src/logseq/graph_parser/mldoc.cljc` — mldoc AST entry.
- `deps/graph-parser/src/logseq/graph_parser/schema/mldoc.cljc` — AST type schema.

### Plugin API surface
- `libs/src/LSPlugin.ts` — plugin types (`Editor.getBlock`, `DB.datascriptQuery`, `BlockEntity`, etc.).
- `src/main/logseq/api/block.cljs` — the `get_block` handler; confirms `includeChildren: true` returns nested `BlockEntity` via `blocks->vec-tree`.

## Notes

- These are **not** kept in sync with upstream. Treat as a snapshot. Refresh with:
  ```bash
  # (repo must be cloned at /tmp/logseq)
  cp /tmp/logseq/src/main/frontend/components/{reference,reference_filters,block,page,views}.cljs .logseq-ref/src/main/frontend/components/
  cp /tmp/logseq/src/main/frontend/components/{block,page}.css                                  .logseq-ref/src/main/frontend/components/
  cp /tmp/logseq/src/main/logseq/api/block.cljs                                                 .logseq-ref/src/main/logseq/api/
  cp /tmp/logseq/deps/graph-parser/src/logseq/graph_parser/{text,block}.cljs                    .logseq-ref/deps/graph-parser/src/logseq/graph_parser/
  cp /tmp/logseq/deps/graph-parser/src/logseq/graph_parser/mldoc.cljc                           .logseq-ref/deps/graph-parser/src/logseq/graph_parser/
  cp /tmp/logseq/deps/graph-parser/src/logseq/graph_parser/schema/mldoc.cljc                    .logseq-ref/deps/graph-parser/src/logseq/graph_parser/schema/
  cp /tmp/logseq/libs/src/LSPlugin.ts                                                            .logseq-ref/libs/src/
  ```
- Licensed under Logseq's AGPL-3.0-or-later.
