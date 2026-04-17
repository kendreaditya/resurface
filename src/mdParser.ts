const MARKER_RE = /^(NOW|LATER|TODO|DONE|DOING|WAITING|CANCELLED)\s+/i;
const PROPERTY_RE = /^[A-Za-z_][\w-]*::\s*.*$/;
const BLOCK_REF_RE = /\(\(([0-9a-f-]{36})\)\)/gi;

export type BlockRefMap = Map<string, string>;

export type RenderedBlockContent = {
  titleHtml: string;
  bodyHtml: string;
  hasHeading: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function stripPreamble(src: string): string {
  const lines = src.split("\n");
  const kept = lines.filter((ln) => !PROPERTY_RE.test(ln.trim()));
  const joined = kept.join("\n").replace(/^\n+|\n+$/g, "");
  return joined.replace(MARKER_RE, "").trim();
}

/**
 * Unwrap the `[[label](url)]` hybrid shape sometimes present in vault blocks.
 * mldoc parses this as a plain external link; we pre-reduce the outer brackets
 * so our `markdownLinkReplace` regex doesn't leak a stray `[` before the
 * anchor.
 */
function unwrapHybridLinks(src: string): string {
  return src.replace(/\[\[([^\]]+?)\]\(([^)\s]+)\)\]/g, "[$1]($2)");
}

function wikilinkMarkup(inner: string): string {
  const orig = inner;
  const lc = orig.toLowerCase();
  return (
    `<span data-ref="${escapeAttr(orig)}" class="page-reference">` +
    `<span class="text-gray-500 bracket">[[</span>` +
    `<a tabindex="0" draggable="true" data-ref="${escapeAttr(lc)}" class="page-ref" data-page="${escapeAttr(orig)}">${orig}</a>` +
    `<span class="text-gray-500 bracket">]]</span>` +
    `</span>`
  );
}

function wikilinkReplace(html: string): string {
  return html.replace(/\[\[([^\]]+?)\]\]/g, (_m, inner: string) => {
    return wikilinkMarkup(inner);
  });
}

function tagMarkup(tag: string): string {
  return `<a tabindex="0" draggable="true" class="tag" data-ref="${escapeAttr(tag.toLowerCase())}">#${tag}</a>`;
}

function tagReplace(html: string): string {
  html = html.replace(/(^|[\s(])#([A-Za-z][\w-]*)/g, (_m, pre: string, tag: string) => {
    return `${pre}${tagMarkup(tag)}`;
  });
  return html;
}

/**
 * Emphasis. Order matters:
 *  - bold (**) before strong-italic ambiguity
 *  - strikethrough (~~) runs before any other ~ usage
 *  - underline (__) after bold so `__` isn't confused with a second bold
 *    flavor (Logseq's mldoc treats `__` as underline — see emphasis-cp in
 *    logseq/src/main/frontend/components/block.cljs:1633)
 *  - italic (*…*) last, with lookarounds to avoid eating bold markers
 */
function emphasisReplace(html: string): string {
  html = html.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  html = html.replace(/(^|[^_\w])__([^_\n]+?)__(?!_)/g, "$1<ins>$2</ins>");
  html = html.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>");
  html = html.replace(/==([^=\n]+?)==/g, "<mark>$1</mark>");
  return html;
}

function blockRefReplace(html: string, refs?: BlockRefMap): string {
  return html.replace(BLOCK_REF_RE, (_m, uuid: string) => {
    const resolved = refs?.get(uuid);
    if (resolved) {
      const label = escapeHtml(resolved);
      return (
        `<a tabindex="0" class="block-ref" ` +
        `data-ref="${escapeAttr(uuid)}" ` +
        `data-resurface-block-ref="${escapeAttr(uuid)}">${label}</a>`
      );
    }
    return `<span class="block-ref-placeholder" title="Block reference">↪ block</span>`;
  });
}

function renderInline(text: string, refs?: BlockRefMap): string {
  const placeholders: string[] = [];
  const stash = (markup: string): string => {
    const idx = placeholders.push(markup) - 1;
    return `\u0000PH${idx}\u0000`;
  };

  let html = escapeHtml(unwrapHybridLinks(text));

  // Code spans first — protect their contents from every other regex.
  html = html.replace(/`([^`\n]+?)`/g, (_m, code: string) => {
    return stash(`<code>${code}</code>`);
  });

  // Images before links — otherwise the link regex eats the `(url)` and
  // orphans a `!` character.
  html = html.replace(/!\[([^\]]*?)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    return stash(
      `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy">`,
    );
  });

  // External links.
  html = html.replace(/\[([^\]]+?)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safeUrl = escapeAttr(url);
    return stash(
      `<a href="${safeUrl}" target="_blank" rel="noopener" class="external-link">${label}</a>`,
    );
  });

  // Multi-word tags before the simple #tag regex (otherwise `#[` matches).
  html = html.replace(/#\[\[([^\]]+?)\]\]/g, (_m, inner: string) => {
    return stash(tagMarkup(inner));
  });

  html = wikilinkReplace(html);
  html = tagReplace(html);
  html = emphasisReplace(html);
  html = blockRefReplace(html, refs);

  html = html.replace(/\u0000PH(\d+)\u0000/g, (_m, idx: string) => {
    return placeholders[Number(idx)] ?? "";
  });

  return html.replace(/\n/g, "<br>");
}

function renderTitleLine(line: string, refs?: BlockRefMap): { html: string; hasHeading: boolean } {
  const trimmed = line.trim();
  const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = Math.min(3, heading[1].length);
    return {
      html: `<h${level}>${renderInline(heading[2], refs)}</h${level}>`,
      hasHeading: true,
    };
  }

  return {
    html: `<span class="inline">${renderInline(trimmed, refs)}</span>`,
    hasHeading: false,
  };
}

function renderBody(body: string, refs?: BlockRefMap): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return paragraphs
    .map((paragraph) => `<div class="is-paragraph">${renderInline(paragraph, refs)}</div>`)
    .join("");
}

export function renderBlockContent(raw: string, refs?: BlockRefMap): RenderedBlockContent {
  if (!raw) return { titleHtml: "", bodyHtml: "", hasHeading: false };

  const body = stripPreamble(raw);
  if (!body) return { titleHtml: "", bodyHtml: "", hasHeading: false };

  const lines = body.split("\n");
  const [firstLine = "", ...restLines] = lines;
  const title = renderTitleLine(firstLine, refs);
  const bodyRaw = restLines.join("\n").trim();

  return {
    titleHtml: title.html,
    bodyHtml: bodyRaw ? renderBody(bodyRaw, refs) : "",
    hasHeading: title.hasHeading,
  };
}

/**
 * Walk a raw block content string and collect every `((uuid))` reference
 * found. Exported for `src/render.ts` + `src/main.ts` to pre-fetch the
 * target blocks before render.
 */
export function extractBlockRefUuids(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const re = new RegExp(BLOCK_REF_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.push(m[1].toLowerCase());
  }
  return out;
}
