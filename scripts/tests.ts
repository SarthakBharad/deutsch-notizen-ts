/**
 * Test reader — build-time only.
 *
 * A `<Level> Tests.odt` is written like a worksheet. This turns it into
 * exercises the site can check, using only what is already on the page:
 *
 *   Heading 1 ("Lektion - 1")         a chapter — one tab on the test page
 *   a bold paragraph                  the instruction that starts an exercise
 *   a paragraph split by " | "        the word bank for that exercise
 *   anything else, lists included     the lines of the exercise
 *
 * Inside a line:
 *
 *   [Antwort]        a blank, and the answer it is checked against
 *   [Cousine/Kusine] a blank that accepts either
 *   _____            a blank with no answer yet — shown, but never marked
 *   underlined text  a worked example, printed as it is ("geklettert (a)")
 *
 * This reads the ODF itself rather than going through `readDocument`, because
 * underline — the one thing that marks an example — is exactly what the note
 * reader throws away, and the note pages should stay as they are.
 */

import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";

import type { Exercise, FillExercise, TestLine, TestSegment, TestText } from "../src/lib/types.js";
import { find, iter, parseXml, type XmlElement } from "./xml.js";

/** A chapter before the build gives it a slug. */
export interface RawChapter {
  title: string;
  exercises: Exercise[];
  blanks: number;
}

/**
 * `[answer]`, optionally right after the underscores it replaced, or a bare run
 * of underscores. Order matters: at an underscore the bracketed form is tried
 * first, so `_____ [erzählt]` is one blank, not two.
 */
const BLANK = /_{2,}[ \t ]*\[([^[\]\n]*)\]|\[([^[\]\n]*)\]|_{2,}/g;

const MIN_WIDTH = 5;
/** Whole-sentence answers ("… Deshalb hatte er einen Unfall.") need the room. */
const MAX_WIDTH = 60;

/* -------------------------------------------------------------- styles */

/** `undefined` means the style doesn't say, so the surrounding value holds. */
interface Style {
  parent: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

type Flags = Pick<TestText, "bold" | "italic" | "underline">;

function collectStyles(root: XmlElement, family: string): Map<string, Style> {
  const styles = new Map<string, Style>();
  for (const style of iter(root, "style:style")) {
    if (style.attrs["style:family"] !== family) continue;
    const name = style.attrs["style:name"];
    if (!name) continue;

    const props = find(style, "style:text-properties")?.attrs ?? {};
    const weight = props["fo:font-weight"];
    const slant = props["fo:font-style"];
    const line = props["style:text-underline-style"];

    styles.set(name, {
      parent: style.attrs["style:parent-style-name"] ?? "",
      bold: weight === undefined ? undefined : weight === "bold" || Number(weight) >= 600,
      italic: slant === undefined ? undefined : slant === "italic" || slant === "oblique",
      underline: line === undefined ? undefined : line !== "none",
    });
  }
  return styles;
}

function apply(base: Flags, style: Style | undefined): Flags {
  if (!style) return base;
  return {
    bold: style.bold ?? base.bold,
    italic: style.italic ?? base.italic,
    underline: style.underline ?? base.underline,
  };
}

/** "title", a heading level, or null — following a paragraph style to its roots. */
function paragraphRole(styleName: string, paraStyles: Map<string, Style>): "title" | number | null {
  const seen = new Set<string>();
  let name = styleName;
  while (name && !seen.has(name)) {
    seen.add(name);
    const base = name.replace(/_20_/g, " ");
    if (base === "Title" || base === "Subtitle") return "title";
    if (base.startsWith("Heading")) {
      const tail = base.slice("Heading".length).trim();
      return /^\d+$/.test(tail) ? Number.parseInt(tail, 10) : 1;
    }
    name = paraStyles.get(name)?.parent ?? "";
  }
  return null;
}

/** {list style: {level: numbered?}} */
function collectListStyles(root: XmlElement): Map<string, Map<number, boolean>> {
  const styles = new Map<string, Map<number, boolean>>();
  for (const listStyle of iter(root, "text:list-style")) {
    const name = listStyle.attrs["style:name"];
    if (!name) continue;
    const levels = new Map<number, boolean>();
    for (const child of listStyle.children) {
      if (!child.tag.startsWith("text:list-level-style-")) continue;
      const level = Number.parseInt(child.attrs["text:level"] ?? "1", 10);
      if (Number.isFinite(level)) levels.set(level, child.tag === "text:list-level-style-number");
    }
    styles.set(name, levels);
  }
  return styles;
}

/* -------------------------------------------------------------- inline */

/** Elements whose text is not part of the line: footnotes and comments. */
const SKIP = new Set(["text:note", "office:annotation", "office:annotation-end"]);

function inlineRuns(el: XmlElement, textStyles: Map<string, Style>, flags: Flags): TestText[] {
  const out: TestText[] = [];

  const push = (text: string, f: Flags) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.bold === f.bold && last.italic === f.italic && last.underline === f.underline) {
      last.text += text;
    } else {
      out.push({ kind: "text", text, ...f });
    }
  };

  push(el.text, flags);
  for (const child of el.children) {
    if (SKIP.has(child.tag)) {
      // the note's own text is skipped, but what follows it is still the line
    } else if (child.tag === "text:s") {
      push(" ".repeat(Number.parseInt(child.attrs["text:c"] ?? "1", 10) || 1), flags);
    } else if (child.tag === "text:tab" || child.tag === "text:line-break") {
      push(" ", flags);
    } else if (child.tag === "text:span" || child.tag === "text:a") {
      const style = textStyles.get(child.attrs["text:style-name"] ?? "");
      for (const run of inlineRuns(child, textStyles, apply(flags, style))) push(run.text, run);
    } else {
      for (const run of inlineRuns(child, textStyles, flags)) push(run.text, run);
    }
    push(child.tail, flags);
  }

  return out;
}

const plain = (runs: TestText[]) => runs.map((run) => run.text).join("");

/* ---------------------------------------------------------- raw stream */

type RawLine =
  | { type: "heading"; level: number; text: string }
  | { type: "line"; runs: TestText[]; depth: number; ordered: boolean; bold: boolean };

interface Context {
  textStyles: Map<string, Style>;
  paraStyles: Map<string, Style>;
  listStyles: Map<string, Map<number, boolean>>;
}

const NO_FLAGS: Flags = { bold: false, italic: false, underline: false };

function paragraph(el: XmlElement, ctx: Context, depth: number, ordered: boolean): RawLine | null {
  const styleName = el.attrs["text:style-name"] ?? "";
  const style = ctx.paraStyles.get(styleName);
  const runs = inlineRuns(el, ctx.textStyles, apply(NO_FLAGS, style));
  const text = plain(runs).trim();
  if (!text) return null;

  if (el.tag === "text:h") {
    const level = Number.parseInt(el.attrs["text:outline-level"] ?? "1", 10) || 1;
    return { type: "heading", level, text };
  }

  if (depth === 0) {
    const role = paragraphRole(styleName, ctx.paraStyles);
    if (role === "title") return null; // "A2 Tests" — the page already says so
    if (typeof role === "number") return { type: "heading", level: role, text };
  }

  return { type: "line", runs, depth, ordered, bold: style?.bold ?? false };
}

function listLines(el: XmlElement, ctx: Context, inherited: string, depth: number, out: RawLine[]) {
  const styleName = el.attrs["text:style-name"] || inherited;
  const ordered = ctx.listStyles.get(styleName)?.get(depth) ?? false;

  for (const item of el.children) {
    if (item.tag !== "text:list-item" && item.tag !== "text:list-header") continue;
    for (const child of item.children) {
      if (child.tag === "text:p" || child.tag === "text:h") {
        const line = paragraph(child, ctx, depth, ordered);
        if (line) out.push(line);
      } else if (child.tag === "text:list") {
        listLines(child, ctx, styleName, depth + 1, out);
      }
    }
  }
}

function walk(el: XmlElement, ctx: Context, out: RawLine[]) {
  for (const child of el.children) {
    if (child.tag === "text:p" || child.tag === "text:h") {
      const line = paragraph(child, ctx, 0, false);
      if (line) out.push(line);
    } else if (child.tag === "text:list") {
      listLines(child, ctx, "", 1, out);
    } else if (child.tag === "text:section") {
      walk(child, ctx, out);
    }
    // Tables and drawings are left for the exercise types that will need them.
  }
}

/* ------------------------------------------------------------- blanks */

const hasBlank = (text: string) => new RegExp(BLANK.source).test(text);

/** "gezeichnet | gespielt | erzählt" → the words, or null if it isn't a bank. */
function bankOf(text: string): string[] | null {
  if (!text.includes("|")) return null;
  const words = text.split("|").map((word) => word.trim()).filter(Boolean);
  return words.length >= 2 ? words : null;
}

/** Every visible character bold — how an instruction looks in these files. */
function allBold(line: Extract<RawLine, { type: "line" }>): boolean {
  if (line.bold) return true;
  const visible = line.runs.filter((run) => run.text.trim());
  return visible.length > 0 && visible.every((run) => run.bold);
}

const clamp = (n: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));

/**
 * Cut a line into text and blanks.
 *
 * The match runs on the line's whole text, not span by span: LibreOffice splits
 * spans wherever an edit happened, so `[gefeiert]` can easily arrive in three
 * pieces with different style names and identical formatting.
 */
function segment(runs: TestText[], firstId: number): { segments: TestSegment[]; count: number } {
  const full = plain(runs);
  const starts: number[] = [];
  let at = 0;
  for (const run of runs) {
    starts.push(at);
    at += run.text.length;
  }

  const textBetween = (from: number, to: number): TestText[] => {
    const pieces: TestText[] = [];
    runs.forEach((run, i) => {
      const lo = Math.max(from, starts[i]);
      const hi = Math.min(to, starts[i] + run.text.length);
      if (hi > lo) pieces.push({ ...run, text: run.text.slice(lo - starts[i], hi - starts[i]) });
    });
    return pieces;
  };

  const segments: TestSegment[] = [];
  let cursor = 0;
  let id = firstId;

  for (const match of full.matchAll(BLANK)) {
    const index = match.index ?? 0;
    segments.push(...textBetween(cursor, index));

    const written = match[1] ?? match[2];
    const answers = written === undefined
      ? []
      : written.split("/").map((answer) => answer.replace(/\s+/g, " ").trim()).filter(Boolean);
    const underscores = (match[0].match(/_/g) ?? []).length;
    const longest = answers.reduce((max, answer) => Math.max(max, answer.length), 0);

    segments.push({
      kind: "blank",
      id,
      answers,
      width: clamp(Math.max(longest ? longest + 2 : 0, underscores)),
    });
    id += 1;
    cursor = index + match[0].length;
  }
  segments.push(...textBetween(cursor, full.length));

  return { segments: tidy(segments), count: id - firstId };
}

/** Merge neighbouring text, trim the ends, and never underline bare spaces. */
function tidy(segments: TestSegment[]): TestSegment[] {
  const out: TestSegment[] = [];
  for (const seg of segments) {
    if (seg.kind === "text") {
      const piece = seg.text.trim() ? seg : { ...seg, underline: false, bold: false, italic: false };
      const last = out[out.length - 1];
      if (
        last?.kind === "text" &&
        last.bold === piece.bold &&
        last.italic === piece.italic &&
        last.underline === piece.underline
      ) {
        last.text += piece.text;
        continue;
      }
      out.push({ ...piece });
    } else {
      out.push(seg);
    }
  }

  const first = out[0];
  if (first?.kind === "text") first.text = first.text.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.kind === "text") last.text = last.text.replace(/\s+$/, "");
  return out.filter((seg) => seg.kind === "blank" || seg.text);
}

/* --------------------------------------------------------------- entry */

export function readTest(path: string): RawChapter[] {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const raw = files["content.xml"];
  if (!raw) return [];

  const root = parseXml(strFromU8(raw));
  const ctx: Context = {
    textStyles: collectStyles(root, "text"),
    paraStyles: collectStyles(root, "paragraph"),
    listStyles: collectListStyles(root),
  };

  const body = find(root, "office:body");
  const textBody = body ? find(body, "office:text") : null;
  if (!textBody) return [];

  const stream: RawLine[] = [];
  walk(textBody, ctx, stream);

  const chapters: RawChapter[] = [];
  const open: { chapter: RawChapter | null; exercise: FillExercise | null } = {
    chapter: null,
    exercise: null,
  };

  const openChapter = (title: string): RawChapter => {
    const chapter: RawChapter = { title, exercises: [], blanks: 0 };
    chapters.push(chapter);
    open.chapter = chapter;
    open.exercise = null;
    return chapter;
  };

  /** Content before any "Lektion" heading still gets a chapter of its own. */
  const currentChapter = (): RawChapter => open.chapter ?? openChapter("");

  const openExercise = (instruction: string): FillExercise => {
    const exercise: FillExercise = { type: "fill", instruction, bank: [], lines: [] };
    currentChapter().exercises.push(exercise);
    open.exercise = exercise;
    return exercise;
  };

  for (const entry of stream) {
    if (entry.type === "heading") {
      if (entry.level <= 1) openChapter(entry.text);
      else openExercise(entry.text);
      continue;
    }

    const text = plain(entry.runs).trim();

    if (entry.depth === 0 && !hasBlank(text)) {
      const bank = bankOf(text);
      if (bank) {
        // A bank opens its exercise's lines; one turning up after lines have
        // started belongs to a new exercise that simply has no instruction.
        const current = open.exercise;
        const target = current && current.lines.length === 0 ? current : openExercise("");
        target.bank.push(...bank);
        continue;
      }
      if (allBold(entry)) {
        openExercise(text);
        continue;
      }
    }

    const target = open.exercise ?? openExercise("");
    const chapter = currentChapter();
    const { segments, count } = segment(entry.runs, chapter.blanks);
    chapter.blanks += count;
    const line: TestLine = { segments, depth: entry.depth, ordered: entry.ordered };
    target.lines.push(line);
  }

  return chapters
    .map((ch) => ({ ...ch, exercises: ch.exercises.filter((ex) => ex.lines.length > 0) }))
    .filter((ch) => ch.exercises.length > 0);
}

/** Totals for the build log. */
export function tally(chapters: RawChapter[]) {
  let exercises = 0;
  let blanks = 0;
  let unanswered = 0;
  for (const ch of chapters) {
    exercises += ch.exercises.length;
    for (const ex of ch.exercises) {
      for (const line of ex.lines) {
        for (const seg of line.segments) {
          if (seg.kind !== "blank") continue;
          blanks += 1;
          if (!seg.answers.length) unanswered += 1;
        }
      }
    }
  }
  return { exercises, blanks, unanswered };
}
