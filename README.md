<div align="center">
  <img src="icon.svg" width="128" height="128" alt="Resurface">

  <h1>Resurface</h1>

  <p>A Logseq plugin that resurfaces bullet blocks you wrote <em>around this time</em> in past cycles.<br/>
  Passive re-exposure to your own past — for emotional continuity and wisdom persistence.</p>
</div>

---

## What it does

On every journal page, Resurface injects a section **above Linked References** listing one bullet block from each rung of a decay ladder:

```
1d · 3d · 1w · 2w · 1mo · 2mo · 6mo · 1y · 2y · 5y · 10y
```

Each rung looks for a block you wrote within **±3 days** of that offset from the journal page's date (falling back to ±7d, then ±14d if nothing matches, otherwise skipping the rung). The block with the most substantive content wins. Blocks from non-journal pages (e.g. study notes, reading highlights) surface on their own write-anniversaries too.

Nothing is tracked, nothing is scheduled — it's just there when you open a journal.

## Installation

### From source

```bash
git clone https://github.com/kendreaditya/resurface.git
cd resurface
npm install
npm run build
```

In Logseq Desktop: **Settings → Advanced → Developer mode** (on). Top-right ⋯ → **Plugins** → **Load unpacked plugin** → select this folder. Open any journal page.

### Development

```bash
npm run dev    # vite build --watch
```

Reload the plugin from the Plugins page after each rebuild.

## How it works

- **Trigger:** `logseq.App.onRouteChanged` fires → we check for the `.page.is-journals` class on the host DOM to confirm we're on a journal, then read `Editor.getCurrentPage().journalDay`.
- **Selection:** for each rung we query the Logseq Datalog DB (`logseq.DB.datascriptQuery`) for blocks whose `:block/created-at` falls in the rung's window.
- **Injection:** a `.resurfaced-refs` element is inserted `beforebegin` the `.references` section (or appended to `.page-inner-wrap` when there are no linked references yet).
- **Styling:** CSS uses Logseq's theme variables (`--ls-*`) so it matches both light and dark themes.

## Limitations

- File-based graphs only (DB-only graphs may need schema tweaks in `src/query.ts`).
- Blocks without `:block/created-at` (rare legacy imports) won't surface — v2 will fall back to journal-day.
- No settings UI yet — edit `src/ladder.ts` to tweak the ladder or window tiers and rebuild.
- One block per rung, max — no grouping headers, no multi-block rungs (v2).

## License

MIT.
