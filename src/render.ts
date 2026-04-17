import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";
import { type Resurfaced } from "./selection";
import { renderBlockContent, extractBlockRefUuids, type BlockRefMap } from "./mdParser";
import { state } from "./state";

const CHEVRON_SVG = `<svg aria-hidden="true" version="1.1" viewBox="0 0 192 512" fill="currentColor" display="inline-block" class="h-4 w-4" style="margin-left: 2px;"><path d="M0 384.662V127.338c0-17.818 21.543-26.741 34.142-14.142l128.662 128.662c7.81 7.81 7.81 20.474 0 28.284L34.142 398.804C21.543 411.404 0 402.48 0 384.662z" fill-rule="evenodd"></path></svg>`;

/* Width/height match native ui.cljs `foldable-title` (`:style {:width 14 :height 16}`).
 * Left offset comes from the `.ls-foldable-title-control` class (`margin-left: -27px`),
 * and inside `.references-blocks-wrap .foldable-title .block-control` the theme adds
 * `right: -5px; top: 1px` — identical to native placement. */
const CTRL_STYLE = "width: 14px; height: 16px;";

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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  const m = n % 10;
  if (m === 1) return `${n}st`;
  if (m === 2) return `${n}nd`;
  if (m === 3) return `${n}rd`;
  return `${n}th`;
}

function formatJournalDay(jd: number): string {
  const s = String(jd);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  return `${MONTHS[m]} ${ordinal(d)}, ${y}`;
}

function arrowHtml(collapsed: boolean): string {
  const cls = collapsed ? "rotating-arrow collapsed" : "rotating-arrow not-collapsed";
  return `<span class="control-hide"><span class="${cls}">${CHEVRON_SVG}</span></span>`;
}

function sectionHeader(count: number): string {
  const chevron = arrowHtml(state.sectionCollapsed);
  return `
    <div class="ls-foldable-title content">
      <div class="flex-1 flex-row foldable-title">
        <div class="flex flex-row items-center ls-foldable-header gap-1">
          <a class="ls-foldable-title-control block-control opacity-50 hover:opacity-100" style="${CTRL_STYLE}" data-resurface-role="section-toggle">${chevron}</a>
          <div class="flex flex-row flex-1 justify-between items-center">
            <h2 class="font-medium">${count} Resurfaced</h2>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCard(item: Resurfaced, refs?: BlockRefMap): string {
  const { rung, block } = item;
  const collapsed = state.isCardCollapsed(block.uuid);
  const page = block.page;

  const displayTitle = page.journalDay
    ? formatJournalDay(page.journalDay)
    : (page.originalName ?? page.name ?? "Unknown page");
  const navName = page.originalName ?? page.name ?? "";
  const refName = (page.name ?? navName).toLowerCase();

  const chevron = arrowHtml(collapsed);
  const collapsedCls = collapsed ? " is-collapsed" : "";
  const uuidEsc = escapeAttr(block.uuid);
  const tree: BlockEntity =
    block.tree ??
    ({
      uuid: block.uuid,
      content: block.content,
      children: [],
    } as unknown as BlockEntity);
  const blockTree = renderRoot(tree, block.uuid, refs);

  return `
    <div class="my-2 references-blocks-item" data-resurface-card="${uuidEsc}">
      <div class="flex flex-col">
        <div class="ls-foldable-title content">
          <div class="flex-1 flex-row foldable-title">
            <div class="flex flex-row items-center ls-foldable-header gap-1">
              <a class="ls-foldable-title-control block-control opacity-50 hover:opacity-100" style="${CTRL_STYLE}" data-resurface-role="card-toggle" data-resurface-uuid="${uuidEsc}">${chevron}</a>
              <div class="flex flex-row flex-1 justify-between items-center">
                <div>
                  <a tabindex="0" data-ref="${escapeAttr(refName)}" data-page="${escapeAttr(navName)}" draggable="true" class="page-ref">${escapeHtml(displayTitle)}</a>
                </div>
                <span class="resurfaced-rung" title="written ~${rung.label} ago">${rung.label}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="ls-foldable-content${collapsedCls}" aria-hidden="${collapsed}">
          <div class="ls-foldable-content-inner">
            <div class="blocks-container flex-1">
              ${blockTree}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderResurfaced(
  items: Resurfaced[],
  refs?: BlockRefMap,
): { html: string; count: number } {
  if (items.length === 0) return { html: "", count: 0 };

  const collapsed = state.sectionCollapsed;
  const collapsedCls = collapsed ? " is-collapsed" : "";

  const html = `
    <div class="references page-linked flex-1 flex-row resurfaced-refs" id="resurfaced-refs">
      <div class="content pt-6">
        <div class="flex flex-col">
          ${sectionHeader(items.length)}
          <div class="ls-foldable-content${collapsedCls}" aria-hidden="${collapsed}">
            <div class="ls-foldable-content-inner">
              <div class="references-blocks">
                <div>
                  <div class="content">
                    <div class="flex flex-col references-blocks-wrap">
                      ${items.map((item) => renderCard(item, refs)).join("")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return { html, count: items.length };
}

/**
 * Walk a hydrated block tree and collect every `((uuid))` reference from it
 * and its descendants. Used by `main.ts` to pre-fetch block-ref targets
 * before rendering.
 */
export function collectBlockRefUuids(tree: BlockEntity | null | undefined): string[] {
  if (!tree) return [];
  const out = new Set<string>();
  const walk = (node: BlockEntity) => {
    const content = node.content ?? node.title ?? "";
    for (const uuid of extractBlockRefUuids(content)) out.add(uuid);
    for (const child of getChildren(node)) walk(child);
  };
  walk(tree);
  return [...out];
}

function isBlockEntity(value: unknown): value is BlockEntity {
  return Boolean(value && typeof value === "object" && "uuid" in (value as Record<string, unknown>));
}

function getChildren(block: BlockEntity | null): BlockEntity[] {
  if (!block?.children?.length) return [];
  return block.children.filter(isBlockEntity);
}

function renderRoot(block: BlockEntity, fallbackUuid: string, refs?: BlockRefMap): string {
  const rootContent = block.content ?? block.title ?? "";
  const rootRendered = renderBlockContent(rootContent, refs);
  const rootHasContent = !!(rootRendered.titleHtml || rootRendered.bodyHtml);
  const children = getChildren(block);
  if (!rootHasContent && children.length > 0) {
    return children
      .map((child) => renderBlockNode(child, 1, child.uuid, refs))
      .join("");
  }
  return renderBlockNode(block, 1, fallbackUuid, refs);
}

function renderBlockNode(
  block: BlockEntity | null,
  level: number,
  fallbackUuid: string,
  refs?: BlockRefMap,
): string {
  const uuid = block?.uuid ?? fallbackUuid;
  const content = block?.content ?? block?.title ?? "";
  const children = getChildren(block);
  const hasChildren = children.length > 0;
  const { titleHtml, bodyHtml, hasHeading } = renderBlockContent(content, refs);
  const uuidEsc = escapeAttr(uuid);
  const blockId = `resurface-block-${uuidEsc}`;
  const contentId = `resurface-block-content-${uuidEsc}`;
  const blank = !titleHtml && !bodyHtml && !hasChildren;

  return `
    <div haschild="${hasChildren}" class="ls-block ${uuidEsc}${blank ? " is-blank" : ""}" level="${level}" blockid="${uuidEsc}" id="${blockId}" data-collapsed="false" data-resurface-uuid="${uuidEsc}">
      <div class="block-main-container flex flex-row pr-2 ${hasHeading ? "items-baseline" : ""}">
        <div class="block-control-wrap flex flex-row items-center h-6">
          <a class="block-control">
            <span class="control-hide"><span class="rotating-arrow not-collapsed">${CHEVRON_SVG}</span></span>
          </a>
          <a class="bullet-link-wrap">
            <span id="dot-${uuidEsc}" draggable="true" blockid="${uuidEsc}" class="bullet-container cursor ">
              <span blockid="${uuidEsc}" class="bullet"></span>
            </span>
          </a>
        </div>
        <div class="flex flex-col block-content-wrapper">
          <div class="flex flex-row">
            <div class="flex-1 w-full" style="display: flex;">
              <div id="${contentId}" blockid="${uuidEsc}" data-type="default" class="block-content inline" style="width: 100%;"><div class="flex flex-row justify-between block-content-inner"><div class="flex-1 w-full">${titleHtml}</div></div>${bodyHtml ? `<div class="block-body">${bodyHtml}</div>` : ""}</div>
            </div>
            <div class="flex flex-row items-center"></div>
          </div>
        </div>
      </div>
      ${hasChildren ? `
        <div class="block-children-container flex">
          <div class="block-children-left-border"></div>
          <div class="block-children w-full">
            ${children.map((child) => renderBlockNode(child, level + 1, child.uuid, refs)).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}
