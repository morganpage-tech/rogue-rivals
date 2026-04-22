export interface NarrativeEntry {
  readonly tick: number;
  readonly text: string;
}

export class NarrativeBuffer {
  private entries: NarrativeEntry[] = [];

  add(tick: number, text: string): void {
    this.entries.push({ tick, text });
  }

  render(maxEntries = 15): string {
    if (this.entries.length === 0) return "";
    const slice = this.entries.slice(-maxEntries);
    return slice.map((e) => `Tick ${e.tick}: ${e.text}`).join("\n");
  }

  get length(): number {
    return this.entries.length;
  }
}
