# Markdown Renderer (`src/mdParser.ts`)

## Why it exists

Logseq does not expose its native block renderer to plugins. The Hiccup dispatcher that turns markdown into DOM lives in `/tmp/logseq/src/main/frontend/components/block.cljs` in the `inline` multimethod — not callable from a plugin context. If we want to show a block's content, we have to render it ourselves.

We could embed an `<iframe>` with a Logseq block slot macro, but that loses theme parity and adds scroll/layout issues. We could run the raw `:block/content` string through escapeHtml and stop there, but then wikilinks and tags render as raw brackets and the card feels broken.

So `src/mdParser.ts` does the minimum viable inline rendering — the subset that actually appears in typical bullet blocks. The output uses Logseq's own class names (`page-reference`, `page-ref`, `bracket`, `tag`, `external-link`) so the user's theme styles everything automatically.

## Pipeline (`renderBlockContent`, `src/mdParser.ts:70`)

```
raw input
    ↓ stripPreamble        src/mdParser.ts:17   (drop property lines id::, strip leading TODO/NOW)
    ↓ escapeHtml                                  (one-shot escape)
    ↓ tokenize backticks    src/mdParser.ts:77   (replace with \0CODE{n}\0 sentinels)
    ↓ wikilinkReplace       src/mdParser.ts:24   ([[Page]] → <span.page-reference>…)
    ↓ tagReplace            src/mdParser.ts:38   (#[[Multi Word]] first, then #simple)
    ↓ emphasisReplace       src/mdParser.ts:49   (** ** → <b>, * * → <i>, == == → <mark>)
    ↓ markdownLinkReplace   src/mdParser.ts:56   ([text](url) → <a.external-link>)
    ↓ blockRefReplace       src/mdParser.ts:63   (((uuid)) → placeholder pill)
    ↓ detokenize backticks  src/mdParser.ts:88
    ↓ \n → <br>             src/mdParser.ts:92
```

## Order matters

1. **escapeHtml first.** All subsequent regexes operate on an already-escaped string, so we can emit raw tag markup in replacements without double-escaping content.
2. **Code tokenization before emphasis/links.** If we ran `** **` or `[text](url)` first, an asterisk or bracket inside a code span would get eaten. Backticks become `\u0000CODE0\u0000`-style sentinels, then re-expand at the end into `<code>…</code>` wrappers.
3. **`#[[Multi Word]]` before `#simple`.** If `#simple` ran first, it would match `#[` and leave broken output. The multi-word branch (`src/mdParser.ts:39`) consumes the whole `#[[…]]` form before the simple branch runs.
4. **Bold (`**`) before italic (`*`).** Italic's negative lookbehind `[^*\w]` plus negative lookahead `(?!\*)` avoids matching inside a bold pair, but the order is still load-bearing because bold is non-greedy and the string is already simpler after it runs.

## Class names mirrored from Logseq

From `/tmp/logseq/src/main/frontend/components/block.cljs` (inline dispatcher and `page-reference` / `page-cp` functions):

- Wikilink: `<span class="page-reference"><span class="text-gray-500 bracket">[[</span><a class="page-ref" data-ref data-page>…</a><span class="text-gray-500 bracket">]]</span></span>` (`src/mdParser.ts:28`).
- Tag: `<a class="tag" data-ref>#name</a>` (`src/mdParser.ts:41, 44`).
- External link: `<a class="external-link" target="_blank" rel="noopener">…</a>` (`src/mdParser.ts:59`).

Matching these classes is what makes the cards look like native Linked References blocks without us writing any visual CSS.

## Known edge cases / intentional gaps

- **Block refs `((uuid))`** render as a dim `↪ block` placeholder (`src/mdParser.ts:64`). Resolving them would require a DB lookup per ref per card per render — worth doing in v2 but not essential.
- **Nested wikilinks** inside alias links (e.g. `[[Foo] [label](url)]`) are not unwrapped; we only handle flat `[[Page]]`.
- **Embeds (`{{embed ((uuid))}}`, `{{query …}}`)** are passed through as escaped text. Embeds in a timeline card would be visually noisy anyway.
- **Image markdown (`![alt](url)`)** is not special-cased; it falls through `markdownLinkReplace` and renders as a text link.
- **Properties attached to child blocks** are not visible because we only render the top-level block content, not its children. Logseq stores properties as separate child blocks in DB graphs and as `id::` lines in file graphs — both are filtered by `stripPreamble` / `isGunk`.
- **Multi-paragraph blocks** render with `<br>` separators. No paragraph wrapping.

## When to extend

If the user complains "this block looks wrong," find the pattern in the raw `:block/content`, check Logseq's `inline` dispatcher for how it's handled (`/tmp/logseq/src/main/frontend/components/block.cljs` — `(defmethod inline …)`), and add a focused replacement to the pipeline above. Keep order-sensitivity in mind; if in doubt, tokenize the new construct before running existing regexes and detokenize at the end.
