const EXISTING_ID = "resurfaced-refs";

export type ClickAction =
  | { type: "section-toggle" }
  | { type: "card-toggle"; uuid: string }
  | { type: "page-nav"; name: string }
  | { type: "tag-nav"; ref: string }
  | { type: "block-nav"; uuid: string };

function getHostDoc(): Document {
  return (window as any).top?.document ?? document;
}

export function removeExisting(): void {
  const doc = getHostDoc();
  const el = doc.getElementById(EXISTING_ID);
  if (el) el.remove();
}

function journalRoot(): HTMLElement | null {
  const doc = getHostDoc();
  return (doc.querySelector(".journal-item") ??
    doc.querySelector(".journal.page") ??
    doc.querySelector(".page.is-journals") ??
    doc.querySelector(".page-inner-wrap.is-journals")) as HTMLElement | null;
}

export function isJournalPage(): boolean {
  return journalRoot() !== null;
}

function findAnchor(): {
  target: HTMLElement;
  position: "beforebegin" | "afterend" | "beforeend";
} | null {
  const doc = getHostDoc();
  const root = journalRoot();
  if (!root) return null;

  const refs =
    (root.querySelector(".references:not(.resurfaced-refs)") as HTMLElement | null) ??
    (doc.querySelector(".references:not(.resurfaced-refs)") as HTMLElement | null);

  if (refs) {
    const wrapper = refs.closest(".lazy-visibility") as HTMLElement | null;
    return { target: wrapper ?? refs, position: "beforebegin" };
  }

  return { target: root, position: "beforeend" };
}

function resolveAction(target: HTMLElement): ClickAction | null {
  const sectionToggle = target.closest(
    '[data-resurface-role="section-toggle"]',
  ) as HTMLElement | null;
  if (sectionToggle && sectionToggle.closest("#resurfaced-refs")) {
    if (!sectionToggle.closest("[data-resurface-card]")) {
      return { type: "section-toggle" };
    }
  }

  const cardToggle = target.closest(
    '[data-resurface-role="card-toggle"]',
  ) as HTMLElement | null;
  if (cardToggle) {
    const uuid =
      cardToggle.dataset.resurfaceUuid ??
      (cardToggle.closest("[data-resurface-card]") as HTMLElement | null)
        ?.dataset.resurfaceCard ??
      "";
    if (uuid) return { type: "card-toggle", uuid };
  }

  const pageRef = target.closest("a.page-ref") as HTMLElement | null;
  if (pageRef && pageRef.closest("#resurfaced-refs")) {
    const name =
      pageRef.dataset.page ?? pageRef.dataset.ref ?? pageRef.textContent ?? "";
    if (name) return { type: "page-nav", name };
  }

  const tag = target.closest("a.tag") as HTMLElement | null;
  if (tag && tag.closest("#resurfaced-refs")) {
    const ref = tag.dataset.ref ?? "";
    if (ref) return { type: "tag-nav", ref };
  }

  const blockContent = target.closest(".block-content.inline") as HTMLElement | null;
  if (blockContent && blockContent.closest("#resurfaced-refs")) {
    const lsBlock = target.closest("[data-resurface-uuid]") as HTMLElement | null;
    const uuid = lsBlock?.dataset.resurfaceUuid ?? "";
    if (uuid) return { type: "block-nav", uuid };
  }

  return null;
}

export function injectResurfaced(
  html: string,
  onAction: (action: ClickAction) => void,
): boolean {
  removeExisting();
  if (!html) return true;

  const anchor = findAnchor();
  if (!anchor) return false;

  const doc = getHostDoc();
  const wrapper = doc.createElement("div");
  wrapper.innerHTML = html.trim();
  const el = wrapper.firstElementChild as HTMLElement | null;
  if (!el) return false;

  el.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('a[href^="http"]')) return;
    const action = resolveAction(target);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    onAction(action);
  });

  anchor.target.insertAdjacentElement(anchor.position, el);
  return true;
}
