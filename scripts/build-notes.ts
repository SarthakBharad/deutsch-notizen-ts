/**
 * Turn the LibreOffice files in `notizen/` into `src/content/notes.json`.
 *
 * Vercel builds once and serves static files — there is no filesystem to read
 * a `.ods` from when someone opens the page. So the parsing that the Streamlit
 * version did per request happens here instead, at build time, and the site
 * ships the result. `pnpm dev` and `pnpm build` both run this first.
 *
 * The filename is the metadata: `<Level>_<Title>`, underscores or spaces.
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { structure } from "../src/lib/layout.js";
import { LEVELS, type Block, type Level, type Library, type Note, type Sheet } from "../src/lib/types.js";
import { readDocument, readSpreadsheet, type RawBlock } from "./odf.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTES_DIR = path.join(ROOT, "notizen");
const OUT_FILE = path.join(ROOT, "src", "content", "notes.json");
const BOOKS_DIR = path.join(ROOT, "public", "books");

const KIND: Record<string, Note["kind"]> = {
  ".ods": "sheet",
  ".odt": "document",
  ".pdf": "book",
};

function levelOf(stem: string): Level {
  const head = stem.trim().split(/[_\s]+/)[0]?.toUpperCase() ?? "";
  return (LEVELS as readonly string[]).includes(head) ? (head as Level) : "Sonstige";
}

function titleOf(stem: string): string {
  let parts = stem.trim().split(/[_\s]+/);
  if (parts.length > 1 && (LEVELS as readonly string[]).includes(parts[0].toUpperCase())) {
    parts = parts.slice(1);
  }
  return parts.filter(Boolean).join(" ").replace(/-/g, " ").trim() || stem;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "note";
}

/** Recover table structure inside a document the same way a sheet gets it. */
function resolveBlocks(raw: RawBlock[]): Block[] {
  return raw.map((block) =>
    block.kind === "table" ? { kind: "table", groups: structure(block.grid.rows) } : block,
  );
}

function build(): Library {
  let entries: string[] = [];
  try {
    entries = readdirSync(NOTES_DIR);
  } catch {
    console.warn(`\n  notizen/ not found at ${NOTES_DIR} — writing an empty library.\n`);
  }

  const notes: Array<Note & { sortKey: string }> = [];
  const books: string[] = [];

  for (const name of entries.sort()) {
    if (name.startsWith(".") || name.startsWith("~")) continue;
    const ext = path.extname(name).toLowerCase();
    const kind = KIND[ext];
    if (!kind) continue;

    const file = path.join(NOTES_DIR, name);
    const stem = path.basename(name, ext);
    const level = levelOf(stem);
    const title = titleOf(stem);
    const slug = slugify(title);
    const base = { slug, level, title } as const;

    if (kind === "sheet") {
      const sheets: Sheet[] = readSpreadsheet(file).map((grid) => ({
        name: grid.name,
        groups: structure(grid.rows),
      }));
      notes.push({ ...base, kind, sheets, sortKey: `0${title.toLowerCase()}` });
      report(name, `${sheets.length} sheets`);
    } else if (kind === "document") {
      const blocks = resolveBlocks(readDocument(file));
      notes.push({ ...base, kind, blocks, sortKey: `0${title.toLowerCase()}` });
      report(name, `${blocks.length} blocks`);
    } else {
      // Books are copied into public/ so the browser can fetch them. They are
      // gitignored, so on a clean deploy there simply aren't any.
      mkdirSync(BOOKS_DIR, { recursive: true });
      copyFileSync(file, path.join(BOOKS_DIR, name));
      books.push(name);
      notes.push({
        ...base,
        kind,
        href: `/books/${encodeURIComponent(name)}`,
        filename: name,
        size: statSync(file).size,
        sortKey: `1${title.toLowerCase()}`,
      });
      report(name, "book");
    }
  }

  const levelOrder = (level: Level) => {
    const at = (LEVELS as readonly string[]).indexOf(level);
    return at < 0 ? LEVELS.length : at;
  };

  const byLevel = new Map<Level, Note[]>();
  for (const entry of notes.sort((a, b) => a.sortKey.localeCompare(b.sortKey))) {
    const note = { ...entry } as Partial<typeof entry>;
    delete note.sortKey;
    const bucket = byLevel.get(entry.level) ?? [];
    bucket.push(note as Note);
    byLevel.set(entry.level, bucket);
  }

  const levels = [...byLevel.entries()]
    .sort(([a], [b]) => levelOrder(a) - levelOrder(b))
    .map(([level, group]) => ({ level, slug: slugify(level), notes: group }));

  if (!books.length) {
    rmSync(BOOKS_DIR, { recursive: true, force: true });
  }

  return { levels, builtAt: new Date().toISOString() };
}

function report(name: string, detail: string) {
  console.log(`  ${name.padEnd(34)} ${detail}`);
}

console.log("\nReading notizen/");
const library = build();
mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(library, null, 2)}\n`);

const total = library.levels.reduce((sum, level) => sum + level.notes.length, 0);
console.log(
  `\n  → src/content/notes.json — ${total} notes across ${library.levels.length} levels\n`,
);
