/**
 * OpenDocument reader — build-time only.
 *
 * `.ods` and `.odt` are ZIP archives holding a `content.xml`. This unzips and
 * walks that XML directly, so the notes need no export step: the LibreOffice
 * file stays the source of truth.
 *
 * It handles the three things that actually matter for hand-written notes:
 * repeated cells and rows, merged cells, and Calc tables embedded inside a
 * Writer document (LibreOffice stores those as a nested document under
 * `Object N/`).
 */

import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

import type { Cell, ListItem, Span } from "../src/lib/types.js";
import { find, findAll, iter, parseXml, textContent, type XmlElement } from "./xml.js";

const NS = {
  office: "office",
  text: "text",
  table: "table",
  draw: "draw",
  style: "style",
  fo: "fo",
  xlink: "xlink",
} as const;

/** ODF always uses these prefixes; tags are matched on the prefixed name. */
const q = (prefix: keyof typeof NS, tag: string) => `${NS[prefix]}:${tag}`;

/** A hand-made sheet never repeats a cell thousands of times on purpose. */
const MAX_REPEAT = 1024;
const MAX_BLANK_ROWS = 16;

export interface Grid {
  name: string;
  rows: Cell[][];
}

/**
 * What the reader emits for a document.
 *
 * The same as the published `Block`, except a table is still a raw Grid here:
 * recovering its structure is the next step, and belongs with the sheet logic
 * rather than the parser.
 */
export type RawBlock =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; items: ListItem[] }
  | { kind: "table"; grid: Grid };

const cell = (over: Partial<Cell> = {}): Cell => ({
  text: "",
  colspan: 1,
  rowspan: 1,
  covered: false,
  bold: false,
  ...over,
});

const isEmpty = (c: Cell) => c.text.trim() === "";

/* ------------------------------------------------------------- entries */

function contentOf(path: string, inner = "content.xml"): XmlElement | null {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const raw = files[inner];
  return raw ? parseXml(strFromU8(raw)) : null;
}

export function readSpreadsheet(path: string): Grid[] {
  const root = contentOf(path);
  if (!root) return [];
  const bold = collectCellStyles(root);
  return iter(root, q("table", "table")).map((table) => parseTable(table, bold));
}

export function readDocument(path: string): RawBlock[] {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const raw = files["content.xml"];
  if (!raw) return [];

  const root = parseXml(strFromU8(raw));
  const textStyles = collectTextStyles(root);
  const paraStyles = collectParagraphStyles(root);
  const listStyles = collectListStyles(root);

  const body = find(root, q("office", "body"));
  const textBody = body ? find(body, q("office", "text")) : null;
  if (!textBody) return [];

  const blocks: RawBlock[] = [];
  for (const el of textBody.children) {
    blocks.push(...documentBlock(el, files, textStyles, paraStyles, listStyles));
  }
  return mergeLists(blocks);
}

/* -------------------------------------------------------------- styles */

interface StyleInfo {
  parent: string;
  bold: boolean;
  italic: boolean;
}

function eachStyle(root: XmlElement, family: string, fn: (name: string, info: StyleInfo) => void) {
  for (const style of iter(root, q("style", "style"))) {
    if (style.attrs[q("style", "family")] !== family) continue;
    const name = style.attrs[q("style", "name")];
    if (!name) continue;
    const props = find(style, q("style", "text-properties"));
    fn(name, {
      parent: style.attrs[q("style", "parent-style-name")] ?? "",
      bold: props?.attrs[q("fo", "font-weight")] === "bold",
      italic: props?.attrs[q("fo", "font-style")] === "italic",
    });
  }
}

/** {cell style name: is bold} — used to spot header rows in a sheet. */
function collectCellStyles(root: XmlElement): Map<string, boolean> {
  const bold = new Map<string, boolean>();
  eachStyle(root, "table-cell", (name, info) => bold.set(name, info.bold));
  return bold;
}

function collectTextStyles(root: XmlElement): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  eachStyle(root, "text", (name, info) => styles.set(name, info));
  return styles;
}

function collectParagraphStyles(root: XmlElement): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  eachStyle(root, "paragraph", (name, info) => styles.set(name, info));
  return styles;
}

/** {list style name: {level: is ordered}} — numbered versus bulleted. */
function collectListStyles(root: XmlElement): Map<string, Map<number, boolean>> {
  const styles = new Map<string, Map<number, boolean>>();
  for (const listStyle of iter(root, q("text", "list-style"))) {
    const name = listStyle.attrs[q("style", "name")];
    if (!name) continue;
    const levels = new Map<number, boolean>();
    for (const child of listStyle.children) {
      if (!child.tag.startsWith(q("text", "list-level-style-"))) continue;
      const level = Number.parseInt(child.attrs[q("text", "level")] ?? "1", 10);
      if (Number.isFinite(level)) {
        levels.set(level, child.tag === q("text", "list-level-style-number"));
      }
    }
    styles.set(name, levels);
  }
  return styles;
}

/** Follow a paragraph style through its parents to a heading level. */
function headingLevel(styleName: string, paraStyles: Map<string, StyleInfo>): number | null {
  const seen = new Set<string>();
  let name = styleName;
  while (name && !seen.has(name)) {
    seen.add(name);
    const base = name.replace(/_20_/g, " ");
    if (base === "Title") return 1;
    if (base === "Subtitle") return 2;
    if (base.startsWith("Heading")) {
      const tail = base.slice("Heading".length).trim();
      return /^\d+$/.test(tail) ? Number.parseInt(tail, 10) + 1 : 2;
    }
    name = paraStyles.get(name)?.parent ?? "";
  }
  return null;
}

/* -------------------------------------------------------------- inline */

function inlineSpans(
  el: XmlElement,
  styles: Map<string, StyleInfo>,
  bold = false,
  italic = false,
): Span[] {
  const out: Span[] = [];

  const push = (text: string, b: boolean, i: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.bold === b && last.italic === i) last.text += text;
    else out.push({ text, bold: b, italic: i });
  };

  push(el.text, bold, italic);
  for (const child of el.children) {
    if (child.tag === q("text", "s")) {
      push(" ".repeat(Number.parseInt(child.attrs[q("text", "c")] ?? "1", 10) || 1), bold, italic);
    } else if (child.tag === q("text", "tab")) {
      push("\t", bold, italic);
    } else if (child.tag === q("text", "line-break")) {
      push("\n", bold, italic);
    } else if (child.tag === q("text", "span") || child.tag === q("text", "a")) {
      const style = styles.get(child.attrs[q("text", "style-name")] ?? "");
      out.push(...inlineSpans(child, styles, bold || !!style?.bold, italic || !!style?.italic));
    } else {
      out.push(...inlineSpans(child, styles, bold, italic));
    }
    push(child.tail, bold, italic);
  }

  return out;
}

const joined = (spans: Span[]) => spans.map((s) => s.text).join("").trim();

/** All paragraph text under an element, one line per paragraph. */
function plainText(el: XmlElement): string {
  const paras = iter(el, q("text", "p"));
  if (paras.length === 0) return textContent(el).trim();
  return paras
    .map((p) => textContent(p).trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/* -------------------------------------------------------------- tables */

function parseTable(el: XmlElement, boldStyles: Map<string, boolean>): Grid {
  const rows: Cell[][] = [];
  const allRows = iter(el, q("table", "table-row"));
  const lastRow = allRows[allRows.length - 1];

  for (const rowEl of allRows) {
    const cells: Cell[] = [];
    const children = rowEl.children;

    children.forEach((cellEl, index) => {
      const covered = cellEl.tag === q("table", "covered-table-cell");
      if (cellEl.tag !== q("table", "table-cell") && !covered) return;

      const text = plainText(cellEl);
      const bold = boldStyles.get(cellEl.attrs[q("table", "style-name")] ?? "") ?? false;
      let repeat = Number.parseInt(cellEl.attrs[q("table", "number-columns-repeated")] ?? "1", 10) || 1;

      if (!text.trim()) {
        // LibreOffice pads every row out to the sheet width with one hugely
        // repeated blank cell at the end. Drop that padding, but keep interior
        // blank runs exact — they position the columns that come after them.
        repeat = index === children.length - 1 ? 1 : Math.min(repeat, MAX_REPEAT);
      }

      cells.push(
        cell({
          text,
          colspan: Number.parseInt(cellEl.attrs[q("table", "number-columns-spanned")] ?? "1", 10) || 1,
          rowspan: Number.parseInt(cellEl.attrs[q("table", "number-rows-spanned")] ?? "1", 10) || 1,
          covered,
          bold,
        }),
      );
      for (let i = 1; i < repeat; i += 1) cells.push(cell({ text, covered, bold }));
    });

    while (cells.length && isEmpty(cells[cells.length - 1])) cells.pop();

    let rowRepeat = Number.parseInt(rowEl.attrs[q("table", "number-rows-repeated")] ?? "1", 10) || 1;
    if (cells.length === 0) {
      // Same padding trick one dimension up: the sheet ends with a blank row
      // repeated to the bottom. Interior blank runs are kept, so a deliberate
      // gap between two tables still reads as a gap.
      rowRepeat = rowEl === lastRow ? 1 : Math.min(rowRepeat, MAX_BLANK_ROWS);
    }
    for (let i = 0; i < Math.min(rowRepeat, MAX_REPEAT); i += 1) {
      rows.push(cells.map((c) => ({ ...c })));
    }
  }

  while (rows.length && !rows[rows.length - 1].some((c) => !isEmpty(c))) rows.pop();

  return { name: el.attrs[q("table", "name")] ?? "", rows };
}

/* ----------------------------------------------------------- documents */

function documentBlock(
  el: XmlElement,
  files: Record<string, Uint8Array>,
  textStyles: Map<string, StyleInfo>,
  paraStyles: Map<string, StyleInfo>,
  listStyles: Map<string, Map<number, boolean>>,
): RawBlock[] {
  const { tag } = el;

  if (tag === q("text", "h")) {
    const level = (Number.parseInt(el.attrs[q("text", "outline-level")] ?? "1", 10) || 1) + 1;
    const spans = inlineSpans(el, textStyles);
    return joined(spans) ? [{ kind: "heading", level: Math.min(level, 5), spans }] : [];
  }

  if (tag === q("text", "p")) {
    const embedded = embeddedGrids(el, files);
    if (embedded.length) {
      return embedded.map((grid) => ({ kind: "table", grid }) as const);
    }
    const styleName = el.attrs[q("text", "style-name")] ?? "";
    const spans = inlineSpans(el, textStyles);
    if (!joined(spans)) return [];

    const level = headingLevel(styleName, paraStyles);
    if (level !== null) return [{ kind: "heading", level: Math.min(level, 5), spans }];

    const style = paraStyles.get(styleName);
    if (style?.bold || style?.italic) {
      for (const span of spans) {
        span.bold = span.bold || !!style.bold;
        span.italic = span.italic || !!style.italic;
      }
    }
    return [{ kind: "paragraph", spans }];
  }

  if (tag === q("text", "list")) {
    const items = listItems(el, textStyles, listStyles, el.attrs[q("text", "style-name")] ?? "", 1);
    return items.length ? [{ kind: "list", items }] : [];
  }


  if (tag === q("table", "table")) {
    return [{ kind: "table", grid: parseTable(el, new Map()) }];
  }

  if (tag === q("draw", "frame") || tag === q("draw", "g")) {
    return embeddedGrids(el, files).map((grid) => ({ kind: "table", grid }) as const);
  }

  return [];
}

/**
 * Flatten a list, and any list nested inside it, keeping the depth.
 *
 * LibreOffice writes an indented sub-list as a list whose only item is another
 * list, with no text of its own — so this has to recurse rather than read one
 * level of list-item paragraphs.
 */
function listItems(
  el: XmlElement,
  textStyles: Map<string, StyleInfo>,
  listStyles: Map<string, Map<number, boolean>>,
  inheritedStyle: string,
  depth: number,
): ListItem[] {
  const styleName = el.attrs[q("text", "style-name")] || inheritedStyle;
  const ordered = listStyles.get(styleName)?.get(depth) ?? false;
  const items: ListItem[] = [];

  for (const item of findAll(el, q("text", "list-item"))) {
    let spans: Span[] = [];
    for (const child of item.children) {
      if (child.tag === q("text", "p")) {
        spans.push(...inlineSpans(child, textStyles));
      } else if (child.tag === q("text", "list")) {
        if (joined(spans)) {
          items.push({ spans, depth, ordered });
          spans = [];
        }
        items.push(...listItems(child, textStyles, listStyles, styleName, depth + 1));
      }
    }
    if (joined(spans)) items.push({ spans, depth, ordered });
  }

  return items;
}

/** Pull tables out of Calc objects embedded in a Writer document. */
function embeddedGrids(el: XmlElement, files: Record<string, Uint8Array>): Grid[] {
  const grids: Grid[] = [];
  for (const obj of iter(el, q("draw", "object"))) {
    const href = (obj.attrs[q("xlink", "href")] ?? "").replace(/^\.?\//, "");
    if (!href) continue;
    const raw = files[`${href}/content.xml`];
    if (!raw) continue;

    const sub = parseXml(strFromU8(raw));
    for (const table of iter(sub, q("table", "table"))) {
      const grid = parseTable(table, collectCellStyles(sub));
      if (grid.rows.length) {
        grid.name = ""; // "Sheet1" is noise inside a document
        grids.push(grid);
      }
    }
  }
  return grids;
}

/**
 * Join lists that were only split apart by nesting or continued numbering.
 *
 * LibreOffice ends one <text:list> and starts another whenever the level
 * changes, and ties them back together with text:continue-list. On the page
 * they are one list, so they are merged back here — which is also what makes
 * the numbering run 1..n instead of restarting at each break.
 */
function mergeLists(blocks: RawBlock[]): RawBlock[] {
  const merged: RawBlock[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (block.kind === "list" && last?.kind === "list") last.items.push(...block.items);
    else merged.push(block);
  }
  return merged;
}
