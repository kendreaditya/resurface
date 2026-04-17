# Markdown Renderer (`src/mdParser.ts`)

## Why it exists

Logseq does not expose its native block renderer to plugins. The Hiccup dispatcher that turns markdown into DOM lives in `/tmp/logseq/src/main/frontend/components/block.cljs` in the `inline` multimethod — not callable from a plugin context. If we want to show a block's content, we have to render it ourselves.

We could embed an `<iframe>` with a Logseq block slot macro, but that loses theme parity and adds scroll/layout issues. We could run the raw `:block/content` string through escapeHtml and stop there, but then wikilinks and tags render as raw brackets and the card feels broken.

So `src/mdParser.ts` does the minimum viable inline rendering — the subset that actually appears in typical bullet blocks. The output uses Logseq's own class names (`page-reference`, `page-ref`, `bracket`, `tag`, `external-link`) so the user's theme styles everything automatically.

## Pipeline (`renderBlockContent(raw, refs?)`)

```
raw input
    ↓ stripPreamble                     (drop property lines id::, strip leading TODO/NOW)
    ↓ unwrapHybridLinks                 ([[label](url)] → [label](url) — vault hybrid shape)
    ↓ escapeHtml                        (one-shot escape)
    ↓ tokenize backticks                (replace with \0PH{n}\0 sentinels → <code>)
    ↓ tokenize images                   (![alt](url) → <img>)
    ↓ tokenize external links           ([text](url) → <a.external-link>)
    ↓ tokenize #[[Multi Word]]          (before tag-replace to avoid #[… matching)
    ↓ wikilinkReplace                   ([[Page]] → <span.page-reference>…)
    ↓ tagReplace                        (#simple → <a.tag>)
    ↓ emphasisReplace                   (** → <b>, ~~ → <del>, __ → <ins>, * → <i>, == → <mark>)
    ↓ blockRefReplace(refs)             (((uuid)) → hydrated <a.block-ref> if refs has uuid,
                                          else dim ↪ block placeholder)
    ↓ detokenize sentinels
    ↓ \n → <br>
```

The `refs?: Map<string,string>` parameter is threaded from `src/main.ts`
through `src/render.ts`. It maps block-ref uuids to their target block's
first-line content, pre-fetched via `Editor.getBlock(uuid)` before the render
pass. Synchronous consumption — no promises inside the inline pipeline.

## Order matters

1. **escapeHtml first.** All subsequent regexes operate on an already-escaped string, so we can emit raw tag markup in replacements without double-escaping content.
2. **Hybrid link unwrap before escaping.** `[[label](url)]` is reduced to `[label](url)` up front so the link regex anchors cleanly and no stray `[` leaks in front of the `<a>`.
3. **Code tokenization before emphasis/links.** If we ran `** **` or `[text](url)` first, an asterisk or bracket inside a code span would get eaten. Backticks become `\u0000PH{n}\u0000` sentinels, then re-expand at the end.
4. **Images before external links.** `![alt](url)` shares the `](url)` tail with the link rule — image has to win first or the `!` leaks out in front of an `<a>`.
5. **`#[[Multi Word]]` before `#simple`.** If `#simple` ran first, it would match `#[` and leave broken output. The multi-word branch consumes the whole `#[[…]]` form before the simple branch runs.
6. **Bold (`**`) before italic (`*`).** Italic's negative lookbehind `[^*\w]` plus negative lookahead `(?!\*)` avoids matching inside a bold pair, but the order is still load-bearing because bold is non-greedy and the string is already simpler after it runs.
7. **Strikethrough (`~~`) and underline (`__`) run inside `emphasisReplace`** — same pass as bold / italic / highlight, mirroring Logseq's `emphasis-cp` (`/tmp/logseq/src/main/frontend/components/block.cljs:1633`). Underline uses `(^|[^_\w])…(?!_)` guards so it doesn't collide with in-identifier underscores.
8. **blockRefReplace is last** so the uuid string isn't eaten by any prior regex.

## Class names mirrored from Logseq

From `/tmp/logseq/src/main/frontend/components/block.cljs` (inline dispatcher and `page-reference` / `page-cp` functions):

- Wikilink: `<span class="page-reference"><span class="text-gray-500 bracket">[[</span><a class="page-ref" data-ref data-page>…</a><span class="text-gray-500 bracket">]]</span></span>` (`src/mdParser.ts:28`).
- Tag: `<a class="tag" data-ref>#name</a>` (`src/mdParser.ts:41, 44`).
- External link: `<a class="external-link" target="_blank" rel="noopener">…</a>` (`src/mdParser.ts:59`).

Matching these classes is what makes the cards look like native Linked References blocks without us writing any visual CSS.

## Known edge cases / intentional gaps

- **Block refs `((uuid))`** are hydrated before render — `src/main.ts` walks the pick tree via `collectBlockRefUuids`, fetches each target with `Editor.getBlock(uuid)`, and passes the resulting `Map<uuid, firstLine>` into the render pipeline. Hydrated refs render as `<a class="block-ref" data-resurface-block-ref="uuid">{firstLine}</a>`; clicking one navigates to the source page via `Editor.scrollToBlockInPage`. Refs that can't be resolved (deleted target, permissioning errors) fall back to the dim `↪ block` placeholder.
- **Nested wikilinks** inside alias links (e.g. `[[Foo] [label](url)]`) are not unwrapped; we only handle flat `[[Page]]`. The `[[label](url)]` hybrid form *is* handled by `unwrapHybridLinks`.
- **Embeds (`{{embed ((uuid))}}`, `{{query …}}`)** are passed through as escaped text. Embeds in a timeline card would be visually noisy anyway.
- **Images** (`![alt](url)`) render as `<img loading="lazy">`.
- **Properties attached to child blocks** are not visible because we only render the top-level block content, not its children. Logseq stores properties as separate child blocks in DB graphs and as `id::` lines in file graphs — both are filtered by `stripPreamble` / `isGunk`.
- **Multi-paragraph blocks** render with `<br>` separators. No paragraph wrapping.

## When to extend

If the user complains "this block looks wrong," find the pattern in the raw `:block/content`, check Logseq's `inline` dispatcher for how it's handled (`/tmp/logseq/src/main/frontend/components/block.cljs` — `(defmethod inline …)`), and add a focused replacement to the pipeline above. Keep order-sensitivity in mind; if in doubt, tokenize the new construct before running existing regexes and detokenize at the end.
