import {
  LADDER,
  WINDOW_TIERS_DAYS,
  shiftDateBack,
  windowRangeMs,
  type Rung,
} from "./ladder";
import {
  hydrateBlockTree,
  queryBlocksByCreatedAt,
  queryBlocksByJournalDay,
  type BlockHit,
} from "./query";

export type Resurfaced = {
  rung: Rung;
  block: BlockHit;
};

export async function selectResurfaced(
  anchor: Date,
  currentPageId: number | null,
): Promise<Resurfaced[]> {
  const results: Resurfaced[] = [];
  const usedUuids = new Set<string>();

  for (const rung of LADDER) {
    const anchoredBack = shiftDateBack(anchor, rung);
    let pick: BlockHit | null = null;

    for (const tierDays of WINDOW_TIERS_DAYS) {
      const [from, to] = windowRangeMs(anchoredBack, tierDays);
      let candidates = await queryBlocksByCreatedAt(
        from,
        to,
        currentPageId,
      );

      if (candidates.length === 0) {
        candidates = await queryBlocksByJournalDay(
          anchoredBack,
          tierDays,
          currentPageId,
        );
      }

      const fresh = candidates.filter((c) => !usedUuids.has(c.uuid));
      if (fresh.length === 0) continue;

      fresh.sort(
        (a, b) =>
          b.content.length - a.content.length || b.createdAt - a.createdAt,
      );
      pick = fresh[0];
      break;
    }

    if (pick) {
      usedUuids.add(pick.uuid);
      results.push({ rung, block: pick });
    }
  }

  return Promise.all(
    results.map(async (item) => ({
      ...item,
      block: await hydrateBlockTree(item.block),
    })),
  );
}
