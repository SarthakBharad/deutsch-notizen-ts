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

/* --------------------------------------------------------------- tests */

/** A run of plain text inside a test line, with the formatting that matters. */
export interface TestText {
  kind: "text";
  text: string;
  bold: boolean;
  italic: boolean;
  /** underlined in the .odt — how a worked example ("geklettert (a)") is marked */
  underline: boolean;
}

/** One gap to fill. Written `[Antwort]` in the .odt, or bare `_____`. */
export interface TestBlank {
  kind: "blank";
  /** position within its chapter, from 0 — the key for what has been typed */
  id: number;
  /** accepted answers, from `[a/b]`; empty when the .odt only has underscores */
  answers: string[];
  /** rough box width in characters */
  width: number;
}

export type TestSegment = TestText | TestBlank;

export interface TestLine {
  segments: TestSegment[];
  /** 0 = a plain paragraph, 1 = a list item, 2+ = nested list item */
  depth: number;
  ordered: boolean;
}

/** Fill in the blanks — the only kind so far. New kinds join the union below. */
export interface FillExercise {
  type: "fill";
  /** the bold line above it: "Ergänzen Sie das Possessivartikel." */
  instruction: string;
  /** "gezeichnet | gespielt | …" — the words to choose from, if any */
  bank: string[];
  lines: TestLine[];
}

export type Exercise = FillExercise;

/** Everything under one level-1 heading ("Lektion - 1"). */
export interface TestChapter {
  /** url hash, slugified from the title: #lektion-1 */
  slug: string;
  title: string;
  exercises: Exercise[];
  /** number of blanks in the chapter; ids run 0..blanks-1 */
  blanks: number;
}

/* --------------------------------------------------------------- notes */

export type NoteKind = "sheet" | "document" | "book" | "test";

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

/** `<Level> Tests.odt` — read as exercises rather than as a document. */
export interface TestNote extends NoteBase {
  kind: "test";
  chapters: TestChapter[];
}

export type Note = SheetNote | DocumentNote | BookNote | TestNote;

export interface LevelGroup {
  level: Level;
  slug: string;
  notes: Note[];
}

export interface Library {
  levels: LevelGroup[];
  builtAt: string;
}
