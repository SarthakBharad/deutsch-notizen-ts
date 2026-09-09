/**
 * The parsed notes, and the lookups the pages need.
 *
 * `notes.json` is written by `pnpm notes` before every dev run and build, so
 * importing it here is what pins the site to whatever was in `notizen/` at
 * build time.
 */

import data from "@/content/notes.json";
import type { Library, LevelGroup, Note } from "@/lib/types";

export const library = data as unknown as Library;

export function findLevel(slug: string): LevelGroup | undefined {
  return library.levels.find((level) => level.slug === slug);
}

export function findNote(levelSlug: string, noteSlug: string): Note | undefined {
  return findLevel(levelSlug)?.notes.find((note) => note.slug === noteSlug);
}

export function splitNotes(notes: Note[]): { written: Note[]; books: Note[] } {
  return {
    written: notes.filter((note) => note.kind !== "book"),
    books: notes.filter((note) => note.kind === "book"),
  };
}
