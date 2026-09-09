/**
 * The parsed notes, and the lookups the pages need.
 *
 * `notes.json` is written by `pnpm notes` before every dev run and build, so
 * importing it here is what pins the site to whatever was in `notizen/` at
 * build time.
 */

import data from "@/content/notes.json";
import type { Level, Library, LevelGroup, Note } from "@/lib/types";

export const library = data as unknown as Library;

export function findLevel(slug: string): LevelGroup | undefined {
  return library.levels.find((level) => level.slug === slug);
}

export function findNote(levelSlug: string, noteSlug: string): Note | undefined {
  return findLevel(levelSlug)?.notes.find((note) => note.slug === noteSlug);
}

/**
 * Which CEFR band a level belongs to.
 *
 * Hue is tied to the band rather than to each level, so the whole A ladder
 * reads coral and the whole B ladder teal — you can see which half of the
 * course you are in before reading the label.
 */
export type Band = "a" | "b" | "c" | "x";

export function bandOf(level: Level): Band {
  const first = level.charAt(0).toLowerCase();
  return first === "a" || first === "b" || first === "c" ? (first as Band) : "x";
}

/** Where a level's own link should point: its first note. */
export function levelHref(level: LevelGroup): string {
  return `/${level.slug}/${level.notes[0]?.slug ?? ""}`;
}

export function splitNotes(notes: Note[]): { written: Note[]; books: Note[] } {
  return {
    written: notes.filter((note) => note.kind !== "book"),
    books: notes.filter((note) => note.kind === "book"),
  };
}