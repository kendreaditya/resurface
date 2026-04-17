import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";
import { isGunk } from "./ladder";

export type PageInfo = {
  id: number;
  name: string;
  originalName?: string;
  journalDay?: number;
};

export type BlockHit = {
  uuid: string;
  content: string;
  page: PageInfo;
  createdAt: number;
  tree?: BlockEntity | null;
};

let diagnosed = false;

export async function diagnoseSchema(): Promise<void> {
  if (diagnosed) return;
  diagnosed = true;
  try {
    const sample = await (logseq as any).DB.datascriptQuery(
      `[:find (pull ?b [*]) . :where [?b :block/uuid _] [?b :block/page _]]`,
    );
    console.log("[resurface] sample block attrs:", sample);

    const createdCount = await (logseq as any).DB.datascriptQuery(
      `[:find (count ?b) . :where [?b :block/created-at _]]`,
    );
    const journalDayCount = await (logseq as any).DB.datascriptQuery(
      `[:find (count ?p) . :where [?p :block/journal-day _]]`,
    );
    console.log(
      "[resurface] counts — blocks w/ :block/created-at:",
      createdCount,
      "pages w/ :block/journal-day:",
      journalDayCount,
    );

    const extrema = await (logseq as any).DB.datascriptQuery(
      `[:find (min ?ts) (max ?ts) :where [?b :block/created-at ?ts]]`,
    );
    console.log("[resurface] :block/created-at range:", extrema);
  } catch (e) {
    console.error("[resurface] diagnose failed:", e);
  }
}

function dateToJournalDay(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function normalizeHits(rows: any[], excludePageId: number | null): BlockHit[] {
  const hits: BlockHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pull: any = Array.isArray(row) ? row[0] : row;
    if (!pull) continue;
    const uuid = pull.uuid ?? pull["block/uuid"];
    const content =
      pull.content ?? pull.title ?? pull["block/content"] ?? pull["block/title"] ?? "";
    const pageRaw = pull.page ?? pull["block/page"];
    const createdAt = pull["created-at"] ?? pull.createdAt ?? pull["block/created-at"];
    const pageId = pageRaw?.id ?? pageRaw?.["db/id"];
    if (!uuid || !content || pageId == null) continue;
    if (excludePageId != null && pageId === excludePageId) continue;
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    if (isGunk(content)) continue;
    hits.push({
      uuid,
      content,
      page: {
        id: pageId,
        name: pageRaw.name ?? pageRaw["block/name"] ?? "",
        originalName:
          pageRaw["original-name"] ??
          pageRaw.originalName ??
          pageRaw["block/original-name"],
        journalDay:
          pageRaw["journal-day"] ??
          pageRaw.journalDay ??
          pageRaw["block/journal-day"],
      },
      createdAt: createdAt ?? 0,
    });
  }
  return hits;
}

async function runQuery(q: string): Promise<any[]> {
  try {
    return (await (logseq as any).DB.datascriptQuery(q)) ?? [];
  } catch (e) {
    console.error("[resurface] datascriptQuery failed:", e);
    return [];
  }
}

export async function queryBlocksByCreatedAt(
  fromMs: number,
  toMs: number,
  excludePageId: number | null,
): Promise<BlockHit[]> {
  const q = `[:find (pull ?b [:block/uuid :block/content :block/title :block/created-at {:block/page [:db/id :block/name :block/original-name :block/journal-day]}])
    :where
    [?b :block/created-at ?ts]
    [(>= ?ts ${fromMs})]
    [(<= ?ts ${toMs})]
    [?b :block/page ?p]]`;
  return normalizeHits(await runQuery(q), excludePageId);
}

export async function queryBlocksByJournalDay(
  anchor: Date,
  tierDays: number,
  excludePageId: number | null,
): Promise<BlockHit[]> {
  const from = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() - tierDays,
  );
  const to = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + tierDays,
  );
  const fromJd = dateToJournalDay(from);
  const toJd = dateToJournalDay(to);
  const q = `[:find (pull ?b [:block/uuid :block/content :block/title :block/created-at {:block/page [:db/id :block/name :block/original-name :block/journal-day]}])
    :where
    [?b :block/page ?p]
    [?p :block/journal-day ?day]
    [(>= ?day ${fromJd})]
    [(<= ?day ${toJd})]]`;
  return normalizeHits(await runQuery(q), excludePageId);
}

export async function hydrateBlockTree(hit: BlockHit): Promise<BlockHit> {
  try {
    const tree = await (logseq as any).Editor.getBlock(hit.uuid, {
      includeChildren: true,
    });

    if (!tree) return hit;

    return {
      ...hit,
      tree: {
        ...tree,
        content: tree.content ?? tree.title ?? hit.content,
        title: tree.title ?? tree.content ?? hit.content,
      },
    };
  } catch (e) {
    console.error("[resurface] getBlock(includeChildren) failed:", e);
    return hit;
  }
}
