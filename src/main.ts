import "@logseq/libs";
import { diagnoseSchema } from "./query";
import { selectResurfaced, type Resurfaced } from "./selection";
import { renderResurfaced, collectBlockRefUuids } from "./render";
import {
  injectResurfaced,
  removeExisting,
  isJournalPage,
  type ClickAction,
} from "./inject";
import { state } from "./state";
import cssText from "./styles.css?raw";

let renderInFlight = false;
let renderQueued = false;
let lastRenderedTitle: string | null = null;
let lastPicks: Resurfaced[] = [];
let lastRefs: Map<string, string> = new Map();

function readJournalTitleFromDom(): string | null {
  const doc = (window as any).top?.document ?? document;
  const el = doc.querySelector(
    ".journal-title h1.title, .journal .title h1.title, h1.title",
  ) as HTMLElement | null;
  return el?.textContent?.trim() ?? null;
}

function parseJournalName(name: string): number | null {
  if (!name) return null;
  const iso = name.match(/^(\d{4})[-_](\d{2})[-_](\d{2})$/);
  if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const pretty = name
    .toLowerCase()
    .match(/^([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (pretty) {
    const monthIdx = months.indexOf(pretty[1].slice(0, 3));
    if (monthIdx >= 0) {
      return Number(pretty[3]) * 10000 + (monthIdx + 1) * 100 + Number(pretty[2]);
    }
  }
  return null;
}

async function resolvePageId(name: string): Promise<number | null> {
  const variants = [name, name.toLowerCase()];
  for (const v of variants) {
    try {
      const p: any = await (logseq as any).Editor.getPage(v);
      if (p?.id != null) return p.id;
    } catch {
      /* noop */
    }
  }
  return null;
}

function persistState(): void {
  try {
    (logseq as any).updateSettings(state.dump());
  } catch {
    /* noop */
  }
}

function reinject(): void {
  const { html } = renderResurfaced(lastPicks, lastRefs);
  injectResurfaced(html, handleAction);
}

async function fetchBlockRefs(picks: Resurfaced[]): Promise<Map<string, string>> {
  const uuids = new Set<string>();
  for (const p of picks) {
    if (p.block.tree) {
      for (const u of collectBlockRefUuids(p.block.tree)) uuids.add(u);
    }
  }
  const refs = new Map<string, string>();
  await Promise.all(
    [...uuids].map(async (uuid) => {
      try {
        const b: any = await (logseq as any).Editor.getBlock(uuid);
        if (!b) return;
        const raw = (b.title ?? b.content ?? "").toString();
        const firstLine = raw.split("\n")[0].trim();
        if (firstLine) refs.set(uuid, firstLine);
      } catch {
        /* getBlock can throw on orphan refs — leave unresolved, we fall
         * back to the dim `↪ block` placeholder. */
      }
    }),
  );
  return refs;
}

function handleAction(action: ClickAction): void {
  switch (action.type) {
    case "section-toggle":
      state.toggleSection();
      persistState();
      reinject();
      return;
    case "card-toggle":
      state.toggleCard(action.uuid);
      reinject();
      return;
    case "page-nav":
      try {
        (logseq as any).App.pushState("page", { name: action.name });
      } catch (e) {
        console.error("[resurface] page-nav failed:", e);
      }
      return;
    case "tag-nav":
      try {
        (logseq as any).App.pushState("page", { name: action.ref });
      } catch (e) {
        console.error("[resurface] tag-nav failed:", e);
      }
      return;
    case "block-nav":
      try {
        (logseq as any).Editor.scrollToBlockInPage?.(action.uuid);
      } catch (e) {
        try {
          (logseq as any).Editor.openInRightSidebar?.(action.uuid);
        } catch (e2) {
          console.error("[resurface] block-nav failed:", e2);
        }
      }
      return;
  }
}

async function run(): Promise<void> {
  if (renderInFlight) {
    renderQueued = true;
    return;
  }
  renderInFlight = true;
  try {
    if (!isJournalPage()) {
      lastRenderedTitle = null;
      lastPicks = [];
      lastRefs = new Map();
      removeExisting();
      return;
    }

    const title = readJournalTitleFromDom();
    if (!title) return;
    if (title === lastRenderedTitle) return;

    const jd = parseJournalName(title);
    if (!jd) return;

    const y = Math.floor(jd / 10000);
    const m = Math.floor((jd % 10000) / 100) - 1;
    const d = jd % 100;
    const anchor = new Date(y, m, d);

    const excludePageId = await resolvePageId(title);
    const picks = await selectResurfaced(anchor, excludePageId);

    state.collapsedCards.clear();
    lastPicks = picks;
    lastRefs = await fetchBlockRefs(picks);

    const { html } = renderResurfaced(picks, lastRefs);
    const injected = injectResurfaced(html, handleAction);

    if (injected) {
      lastRenderedTitle = title;
      console.log(`[resurface] ${title} → ${picks.length} block(s)`);
    }
  } catch (e) {
    console.error("[resurface] run failed:", e);
  } finally {
    renderInFlight = false;
    if (renderQueued) {
      renderQueued = false;
      run();
    }
  }
}

function watchForJournalMount(): void {
  const doc = (window as any).top?.document ?? document;
  const body = doc.body;
  if (!body) return;
  const obs = new MutationObserver(() => {
    const title = readJournalTitleFromDom();
    if (title && title !== lastRenderedTitle && isJournalPage()) run();
  });
  obs.observe(body, { childList: true, subtree: true });
}

async function main(): Promise<void> {
  (logseq as any).provideStyle({ key: "resurface-styles", style: cssText });
  state.load((logseq as any).settings);

  await diagnoseSchema();
  await run();
  watchForJournalMount();

  (logseq as any).App.onRouteChanged(async () => {
    lastRenderedTitle = null;
    await run();
  });
}

(logseq as any).ready(main).catch((e: unknown) => {
  console.error("[resurface] ready failed:", e);
});
