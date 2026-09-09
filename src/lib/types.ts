/**
 * The shape of a note once it has been read off disk.
 *
 * The build script parses the LibreOffice files into exactly this and writes
 * it to `src/content/notes.json`; nothing at runtime touches a `.ods` or
 * `.odt`. Both the build and the browser import these types, so a change to
 * the parser that the UI hasn't kept up with is a type error rather than a
 * blank page.
 */

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number] | "Sonstige";

/* -------------------------------------------------------------- sheets */

export interface Cell {
  text: string;
  colspan: number;
  rowspan: number;
  /** swallowed by a merge above or to the left of it */
  covered: boolean;
  bold: boolean;
}

export interface TableBlock {
  header: Cell[] | null;
  rows: Cell[][];
}

/** One column group of a sheet: a stack of tables sharing a layout. */
export interface SheetGroup {
  blocks: TableBlock[];
}

export interface Sheet {
  name: string;
  groups: SheetGroup[];
}

/* ----------------------------------------------------------- documents */

export interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface ListItem {
  spans: Span[];
  /** 1 = top level; anything deeper is an example sentence */
  depth: number;
  ordered: boolean;
}

export type Block =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; items: ListItem[] }
  | { kind: "table"; groups: SheetGroup[] };

/* --------------------------------------------------------------- notes */

export type NoteKind = "sheet" | "document" | "book";

interface NoteBase {
  /** url segment, slugified from the title */
  slug: string;
  level: Level;
  title: string;
  kind: NoteKind;
}

export interface SheetNote extends NoteBase {
  kind: "sheet";
  sheets: Sheet[];
}

export interface DocumentNote extends NoteBase {
  kind: "document";
  blocks: Block[];
}

export interface BookNote extends NoteBase {
  kind: "book";
  /** path under /public, e.g. /books/A2 Menschen Kursbuch.pdf */
  href: string;
  filename: string;
  size: number;
}

export type Note = SheetNote | DocumentNote | BookNote;

export interface LevelGroup {
  level: Level;
  slug: string;
  notes: Note[];
}

export interface Library {
  levels: LevelGroup[];
  builtAt: string;
}
