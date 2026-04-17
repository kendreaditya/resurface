type Persisted = {
  sectionCollapsed?: boolean;
};

class State {
  sectionCollapsed = false;
  collapsedCards: Set<string> = new Set();

  load(settings: any): void {
    const s: Persisted = settings ?? {};
    this.sectionCollapsed = s.sectionCollapsed ?? false;
  }

  dump(): Persisted {
    return { sectionCollapsed: this.sectionCollapsed };
  }

  toggleSection(): void {
    this.sectionCollapsed = !this.sectionCollapsed;
  }

  toggleCard(uuid: string): void {
    if (this.collapsedCards.has(uuid)) this.collapsedCards.delete(uuid);
    else this.collapsedCards.add(uuid);
  }

  isCardCollapsed(uuid: string): boolean {
    return this.collapsedCards.has(uuid);
  }
}

export const state = new State();
