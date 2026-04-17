const MARKER_RE = /^(NOW|LATER|TODO|DONE|DOING|WAITING|CANCELLED)\s+/i;
const PROPERTY_RE = /^[A-Za-z_][\w-]*::\s*.*$/;

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

function emphasisReplace(html: string): string {
  html = html.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>");
  html = html.replace(/==([^=\n]+?)==/g, "<mark>$1</mark>");
  return html;
}

function markdownLinkReplace(html: string): string {
  return html.replace(/\[([^\]]+?)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safeUrl = escapeAttr(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener" class="external-link">${text}</a>`;
  });
}

function blockRefReplace(html: string): string {
  return html.replace(
    /\(\(([0-9a-f-]{36})\)\)/gi,
    `<span class="block-ref-placeholder" title="Block reference">↪ block</span>`,
  );
}

function renderInline(text: string): string {
  const placeholders: string[] = [];
  const stash = (markup: string): string => {
    const idx = placeholders.push(markup) - 1;
    return `\u0000PH${idx}\u0000`;
  };

  let html = escapeHtml(text);

  html = html.replace(/`([^`\n]+?)`/g, (_m, code: string) => {
    return stash(`<code>${code}</code>`);
  });

  html = html.replace(/\[([^\]]+?)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safeUrl = escapeAttr(url);
    return stash(
      `<a href="${safeUrl}" target="_blank" rel="noopener" class="external-link">${label}</a>`,
    );
  });

  html = html.replace(/#\[\[([^\]]+?)\]\]/g, (_m, inner: string) => {
    return stash(tagMarkup(inner));
  });

  html = wikilinkReplace(html);
  html = tagReplace(html);
  html = emphasisReplace(html);
  html = blockRefReplace(html);

  html = html.replace(/\u0000PH(\d+)\u0000/g, (_m, idx: string) => {
    return placeholders[Number(idx)] ?? "";
  });

  return html.replace(/\n/g, "<br>");
}

function renderTitleLine(line: string): { html: string; hasHeading: boolean } {
  const trimmed = line.trim();
  const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = Math.min(3, heading[1].length);
    return {
      html: `<h${level}>${renderInline(heading[2])}</h${level}>`,
      hasHeading: true,
    };
  }

  return {
    html: `<span class="inline">${renderInline(trimmed)}</span>`,
    hasHeading: false,
  };
}

function renderBody(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return paragraphs
    .map((paragraph) => `<div class="is-paragraph">${renderInline(paragraph)}</div>`)
    .join("");
}

export function renderBlockContent(raw: string): RenderedBlockContent {
  if (!raw) return { titleHtml: "", bodyHtml: "", hasHeading: false };

  const body = stripPreamble(raw);
  if (!body) return { titleHtml: "", bodyHtml: "", hasHeading: false };

  const lines = body.split("\n");
  const [firstLine = "", ...restLines] = lines;
  const title = renderTitleLine(firstLine);
  const bodyRaw = restLines.join("\n").trim();

  return {
    titleHtml: title.html,
    bodyHtml: bodyRaw ? renderBody(bodyRaw) : "",
    hasHeading: title.hasHeading,
  };
}
