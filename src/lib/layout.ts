/**
 * Recover structure from a hand-made spreadsheet.
 *
 * A sheet in a cheatsheet is rarely one clean table. It is usually several,
 * laid out side by side or stacked, separated by blank rows and columns, with
 * label rows ("Lektion - 1") running across. This reconstructs that intent so
 * each piece can be rendered as its own table.
 *
 * The rules, in order:
 *
 * 1. Trim blank rows and columns off the outside.
 * 2. Split into column groups on runs of 2+ blank columns.
 * 3. Split each group into blocks on runs of 2+ blank rows.
 * 4. A row with exactly one filled cell is a band (a heading inside a table).
 * 5. A row whose filled cells are mostly bold is a header row, and the block
 *    is split again at every one of them — so a sheet stacking Akkusativ over
 *    Dativ in one grid becomes two tables, each under its own header.
 * 6. Otherwise the first non-band row of a block is taken as its header.
 * 7. A header cell that spans rows is not a header at all — it is a label for
 *    the block beside it (the merged "Akkusativ"), so it moves into the body
 *    and keeps its rowspan there.
 *
 * A single blank row or column is breathing room, not a divide, because that
 * is how these sheets actually use them.
 */

import type { Cell, SheetGroup } from "./types";

/** Blank rows or columns needed to count as a real separator. */
const BLANK_RUN = 2;

/**
 * A header row has to be mostly bold, not entirely bold: a column added to a
 * sheet later often misses the formatting of the ones beside it. Half is high
 * enough to stay clear of a data row carrying a bold label down its side
 * ("Bestimmt" in Artikel, "Maskulin" in das Wetter), which run nearer a third.
 */
const HEADER_BOLD_SHARE = 0.5;

export const isEmptyCell = (c: Cell) => c.text.trim() === "";
export const isBlankRow = (row: Cell[]) => row.every(isEmptyCell);

/** A label row: exactly one filled cell, in the first column or two. */
export function isBand(row: Cell[]): boolean {
  const filled = row.map((c, i) => (isEmptyCell(c) ? -1 : i)).filter((i) => i >= 0);
  return filled.length === 1 && filled[0] <= 1;
}

export function bandText(row: Cell[]): string {
  return row.find((c) => !isEmptyCell(c))?.text ?? "";
}

/** Mostly bold, with at least two bold cells to go on. */
export function isHeaderRow(row: Cell[]): boolean {
  const filled = row.filter((c) => !isEmptyCell(c));
  if (filled.length < 3) return false;
  const bold = filled.filter((c) => c.bold).length;
  return bold >= 2 && bold >= HEADER_BOLD_SHARE * filled.length;
}

const blank = (): Cell => ({ text: "", colspan: 1, rowspan: 1, covered: false, bold: false });

export function structure(rows: Cell[][]): SheetGroup[] {
  let grid = trimRows(rectangular(rows));
  if (!grid.length) return [];
  grid = trimCols(grid);
  if (!grid.length || !grid[0].length) return [];

  const groups: SheetGroup[] = [];

  for (const [from, to] of columnGroups(grid)) {
    const sub = trimRows(grid.map((row) => row.slice(from, to)));
    if (!sub.length) continue;

    const group: SheetGroup = { blocks: [] };
    let groupHeader: Cell[] | null = null; // each column group has its own

    for (const chunk of rowBlocks(sub)) {
      for (const rawPiece of splitOnHeaders(chunk)) {
        const piece = trimCols(rawPiece);
        if (!piece.length) continue;

        let blockHeader: Cell[] | null = null;
        let body = piece;

        const firstData = piece.findIndex((row) => !isBand(row));
        if (firstData >= 0) {
          const candidate = piece[firstData];
          const takesRow =
            groupHeader === null || isHeaderRow(candidate) || sameText(candidate, groupHeader);

          if (takesRow) {
            const rest = [...piece.slice(0, firstData), ...piece.slice(firstData + 1)];
            [blockHeader, body] = liftHeader(candidate, rest);
            if (groupHeader === null) groupHeader = blockHeader;
          } else if (groupHeader !== null && candidate.length === groupHeader.length) {
            // Same shape, different content: repeat the header so the columns
            // stay legible without eating a row of notes.
            blockHeader = groupHeader;
          }
        }

        if (body.some((row) => row.some((c) => !isEmptyCell(c)))) {
          group.blocks.push({ header: blockHeader, rows: body });
        }
      }
    }

    if (group.blocks.length) groups.push(group);
  }

  return groups;
}

/* -------------------------------------------------------------------- */

/**
 * Cut a chunk before each interior all-bold row.
 *
 * If most of the chunk is bold the sheet is simply set in bold throughout and
 * the signal means nothing, so it is ignored rather than turning every row
 * into its own table.
 */
function splitOnHeaders(rows: Cell[][]): Cell[][][] {
  const marks = rows.map((row, i) => (isHeaderRow(row) ? i : -1)).filter((i) => i >= 0);
  if (!marks.length || marks.length > Math.max(1, Math.floor(rows.length / 2))) return [rows];

  const pieces: Cell[][][] = [];
  let start = 0;

  for (const mark of marks) {
    // a band sitting just above a header ("Teil - 1", "Länder") introduces the
    // table below it, so the cut goes above the band, not between them
    let cut = mark;
    while (cut > 0 && isBlankRow(rows[cut - 1])) cut -= 1;
    while (cut > 0 && isBand(rows[cut - 1])) cut -= 1;
    if (cut > start) {
      pieces.push(rows.slice(start, cut));
      start = cut;
    }
  }
  pieces.push(rows.slice(start));

  return pieces.filter((piece) => piece.some((row) => row.some((c) => !isEmptyCell(c))));
}

/**
 * Take a header row, leaving behind any cell that spans into the body.
 *
 * A merged label like "Akkusativ" sits in the same row as the column headings,
 * because that is where a vertical merge puts its text. It is not a heading
 * for its column, so it is pushed down into the first body row with one row of
 * its span used up.
 */
function liftHeader(candidate: Cell[], body: Cell[][]): [Cell[], Cell[][]] {
  const header = candidate.map((c) => ({ ...c, rowspan: 1 }));
  if (!body.length) return [header, body];

  const rows = body.map((row) => [...row]);
  candidate.forEach((c, index) => {
    if (c.rowspan <= 1 || isEmptyCell(c)) return;
    header[index] = { ...blank(), bold: c.bold };
    if (index < rows[0].length) {
      rows[0][index] = {
        ...c,
        rowspan: Math.min(c.rowspan - 1, rows.length),
        covered: false,
      };
    }
  });

  return [header, rows];
}

function rectangular(rows: Cell[][]): Cell[][] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => [...row, ...Array.from({ length: width - row.length }, blank)]);
}

function trimRows(rows: Cell[][]): Cell[][] {
  let start = 0;
  let end = rows.length;
  while (start < end && isBlankRow(rows[start])) start += 1;
  while (end > start && isBlankRow(rows[end - 1])) end -= 1;
  return rows.slice(start, end);
}

function trimCols(rows: Cell[][]): Cell[][] {
  if (!rows.length) return rows;
  const width = rows[0].length;
  const filled: number[] = [];
  for (let i = 0; i < width; i += 1) {
    if (rows.some((row) => !isEmptyCell(row[i]))) filled.push(i);
  }
  if (!filled.length) return [];
  const lo = filled[0];
  const hi = filled[filled.length - 1] + 1;
  return rows.map((row) => row.slice(lo, hi));
}

function columnGroups(rows: Cell[][]): Array<[number, number]> {
  const width = rows[0].length;
  const blankCols = Array.from({ length: width }, (_, i) => rows.every((row) => isEmptyCell(row[i])));
  return segments(blankCols);
}

function rowBlocks(rows: Cell[][]): Cell[][][] {
  return segments(rows.map(isBlankRow)).map(([a, b]) => rows.slice(a, b));
}

/** Index ranges of content, split on runs of BLANK_RUN or more blanks. */
function segments(blanks: boolean[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  let start: number | null = null;
  let run = 0;

  blanks.forEach((isBlank, i) => {
    if (isBlank) {
      run += 1;
      if (run >= BLANK_RUN && start !== null) {
        found.push([start, i - run + 1]);
        start = null;
      }
    } else {
      run = 0;
      if (start === null) start = i;
    }
  });
  if (start !== null) found.push([start, blanks.length]);

  return found.filter(([a, b]) => b > a);
}

function sameText(a: Cell[], b: Cell[]): boolean {
  return a.length === b.length && a.every((c, i) => c.text.trim() === b[i].text.trim());
}
