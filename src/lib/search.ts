/**
 * Search that ignores umlauts, plus the filtering the results need.
 *
 * Typing "uber" should find "über" and "gruss" should find "Gruß", so nothing
 * has to be typed on a German keyboard layout. Highlighting returns segments
 * rather than HTML so React can render the marks itself — no string of markup
 * ever gets injected into the page.
 */

import { isBand, isEmptyCell } from "./layout";
import type { Block, Cell, ListItem, SheetGroup, TableBlock } from "./types";

const FOLD: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "s",
  é: "e",
  è: "e",
};

/**
 * Lowercase and strip diacritics, one output character per input character.
 *
 * The length has to be preserved: highlighting maps an index in the folded
 * string straight back onto the original, and "ß" → "ss" would slide every
 * position after it. Anything that would change the length is left alone and
 * simply doesn't match.
 */
export function fold(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    const mapped = FOLD[ch];
    if (mapped) {
      out += mapped.length === 1 ? mapped : ch;
      continue;
    }
    const stripped = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    out += stripped.length === 1 ? stripped : ch;
  }
  return out;
}

export interface Segment {
  text: string;
  hit: boolean;
}

export class Search {
  readonly query: string;
  private readonly needle: string;

  constructor(query: string) {
    this.query = query.trim();
    this.needle = fold(this.query);
  }

  get active(): boolean {
    return this.needle.length > 0;
  }

  matches(text: string): boolean {
    return !this.active || fold(text).includes(this.needle);
  }

  matchesAny(texts: string[]): boolean {
    return !this.active || texts.some((text) => fold(text).includes(this.needle));
  }

  /** Split text into plain and highlighted runs. */
  segment(text: string): Segment[] {
    if (!this.active || !text) return [{ text, hit: false }];

    const folded = fold(text);
    if (folded.length !== text.length) return [{ text, hit: false }];

    const out: Segment[] = [];
    let cursor = 0;
    for (;;) {
      const at = folded.indexOf(this.needle, cursor);
      if (at < 0) break;
      if (at > cursor) out.push({ text: text.slice(cursor, at), hit: false });
      const end = at + this.needle.length;
      out.push({ text: text.slice(at, end), hit: true });
      cursor = end;
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
    return out;
  }
}

/* ------------------------------------------------------------ filtering */

/**
 * Keep rows that match, plus the band each surviving row sits under.
 *
 * Dropping rows invalidates any vertical merge, so spans are flattened here
 * and a block label (the merged "Akkusativ") is carried onto the first row
 * that survives — otherwise the results lose the case they belong to.
 */
export function filterBlock(block: TableBlock, search: Search): TableBlock | null {
  if (!search.active) return block;

  const label = block.rows.flat().find((c) => c.rowspan > 1 && !isEmptyCell(c));
  const kept: Cell[][] = [];
  let pendingBand: Cell[] | null = null;

  for (const row of block.rows) {
    if (isBand(row)) {
      pendingBand = row;
      continue;
    }
    if (row.every(isEmptyCell)) continue;
    if (!search.matchesAny(row.map((c) => c.text))) continue;

    if (pendingBand) {
      kept.push(pendingBand);
      pendingBand = null;
    }
    kept.push(row.map((c) => ({ ...c, rowspan: 1, covered: false })));
  }

  if (!kept.length) return null;

  if (label) {
    const first = kept.find((row) => row.length > 0);
    if (first && isEmptyCell(first[0])) first[0] = { ...label, rowspan: 1, covered: false };
  }

  return { header: block.header, rows: kept };
}

export function filterGroups(
  groups: SheetGroup[],
  search: Search,
): { groups: SheetGroup[]; count: number } {
  const out: SheetGroup[] = [];
  let count = 0;

  for (const group of groups) {
    const blocks: TableBlock[] = [];
    for (const block of group.blocks) {
      const kept = filterBlock(block, search);
      if (!kept) continue;
      count += kept.rows.filter((row) => !isBand(row) && row.some((c) => !isEmptyCell(c))).length;
      blocks.push(kept);
    }
    if (blocks.length) out.push({ blocks });
  }

  return { groups: out, count };
}

/** Keep matching items, plus the parent line each one sits under. */
export function filterList(items: ListItem[], search: Search): ListItem[] {
  if (!search.active) return items;

  const kept: ListItem[] = [];
  items.forEach((item, index) => {
    if (!search.matchesAny(item.spans.map((s) => s.text))) return;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (items[i].depth < item.depth) {
        // an example sentence never appears without the rule it belongs to
        if (!kept.includes(items[i])) kept.push(items[i]);
        break;
      }
    }
    kept.push(item);
  });

  return kept;
}

export interface FilteredDocument {
  blocks: Block[];
  count: number;
}

/**
 * Filter a document, keeping the heading above whatever survived under it.
 */
export function filterDocument(blocks: Block[], search: Search): FilteredDocument {
  if (!search.active) return { blocks, count: 0 };

  const out: Block[] = [];
  let count = 0;
  let pendingHeading: Block | null = null;

  for (const block of blocks) {
    if (block.kind === "heading") {
      pendingHeading = block;
      continue;
    }

    let resolved: Block | null = null;
    let hits = 0;

    if (block.kind === "table") {
      const { groups, count: found } = filterGroups(block.groups, search);
      if (found) {
        resolved = { kind: "table", groups };
        hits = found;
      }
    } else if (block.kind === "list") {
      const items = filterList(block.items, search);
      if (items.length) {
        resolved = { kind: "list", items };
        hits = items.filter((item) => search.matchesAny(item.spans.map((s) => s.text))).length;
      }
    } else if (search.matches(block.spans.map((s) => s.text).join(""))) {
      resolved = block;
      hits = 1;
    }

    if (!resolved) continue;
    if (pendingHeading) {
      out.push(pendingHeading);
      pendingHeading = null;
    }
    out.push(resolved);
    count += hits;
  }

  return { blocks: out, count };
}
