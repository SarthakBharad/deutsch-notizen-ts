"use client";

import { useMemo, useState } from "react";

import { Document, Groups } from "@/components/Content";
import { isBand, isEmptyCell } from "@/lib/layout";
import { filterDocument, filterGroups, type Search } from "@/lib/search";
import type { Note, SheetGroup } from "@/lib/types";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function sizeLabel(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

/** Rows a reader would actually count: not bands, not spacers. */
function countRows(groups: SheetGroup[]): number {
  return groups.reduce(
    (sum, group) =>
      sum +
      group.blocks.reduce(
        (n, block) =>
          n +
          block.rows.filter((row) => !isBand(row) && row.some((c) => !isEmptyCell(c)))
            .length,
        0,
      ),
    0,
  );
}

export function NoteView({ note, search }: { note: Note; search: Search }) {
  if (note.kind === "book") return <BookView note={note} />;
  if (note.kind === "document") return <DocumentView note={note} search={search} />;
  return <SheetView note={note} search={search} />;
}

/* -------------------------------------------------------------- sheets */

function SheetView({
  note,
  search,
}: {
  note: Extract<Note, { kind: "sheet" }>;
  search: Search;
}) {
  const [active, setActive] = useState(0);

  const filtered = useMemo(
    () => note.sheets.map((sheet) => filterGroups(sheet.groups, search)),
    [note.sheets, search],
  );

  if (!note.sheets.length) {
    return (
      <p className="notice">
        <strong>Nothing in this file yet.</strong> Add a sheet in LibreOffice,
        save, then rebuild.
      </p>
    );
  }

  // A search runs across every sheet at once — tabs would hide the hits.
  if (search.active) {
    const hits = note.sheets
      .map((sheet, i) => ({ sheet, ...filtered[i] }))
      .filter((entry) => entry.count > 0);

    const total = hits.reduce((sum, entry) => sum + entry.count, 0);

    if (!total) {
      return (
        <p className="notice">
          <strong>No match for &ldquo;{search.query}&rdquo;.</strong> The search looks
          anywhere inside a cell, so a shorter word usually turns something up.
        </p>
      );
    }

    return (
      <>
        <p className="tally" style={{ marginBottom: "1.2rem" }}>
          {plural(total, "row", "rows")} across{" "}
          {plural(hits.length, "sheet", "sheets")}
        </p>
        {hits.map((entry, i) => (
          <section key={i} className="doc" style={{ maxWidth: "none" }}>
            <h2>{entry.sheet.name || `Sheet ${i + 1}`}</h2>
            <Groups groups={entry.groups} search={search} />
          </section>
        ))}
      </>
    );
  }

  const index = Math.min(active, note.sheets.length - 1);
  const sheet = note.sheets[index];
  const shown = filtered[index];
  const rows = countRows(shown.groups);

  return (
    <>
      <div className="chips" role="tablist" aria-label="Sheets">
        {note.sheets.map((entry, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setActive(i)}
          >
            {entry.name || `Sheet ${i + 1}`}
          </button>
        ))}
      </div>

      {shown.groups.length ? (
        <>
          <p className="tally" style={{ marginBottom: "1rem" }}>
            {plural(rows, "row", "rows")}
          </p>
          <Groups groups={shown.groups} search={search} />
        </>
      ) : (
        <p className="notice">
          <strong>{sheet.name} is empty.</strong> Add rows in LibreOffice, save,
          then rebuild.
        </p>
      )}
    </>
  );
}

/* ----------------------------------------------------------- documents */

function DocumentView({
  note,
  search,
}: {
  note: Extract<Note, { kind: "document" }>;
  search: Search;
}) {
  const filtered = useMemo(() => filterDocument(note.blocks, search), [note.blocks, search]);

  if (!note.blocks.length) {
    return (
      <p className="notice">
        <strong>Nothing written here yet.</strong> Add to the file in LibreOffice,
        save, then rebuild.
      </p>
    );
  }

  if (search.active) {
    if (!filtered.count) {
      return (
        <p className="notice">
          <strong>No match for &ldquo;{search.query}&rdquo;.</strong> Try a shorter
          word — the search looks anywhere inside a line.
        </p>
      );
    }
    return (
      <>
        <p className="tally" style={{ marginBottom: "1.2rem" }}>
          {plural(filtered.count, "passage", "passages")}
        </p>
        <Document blocks={filtered.blocks} search={search} />
      </>
    );
  }

  return <Document blocks={note.blocks} search={search} />;
}

/* --------------------------------------------------------------- books */

function BookView({ note }: { note: Extract<Note, { kind: "book" }> }) {
  return (
    <>
      <p className="tally" style={{ marginBottom: "0.8rem" }}>
        {note.filename} · {sizeLabel(note.size)}
      </p>
      <p>
        <a className="download" href={note.href} download={note.filename}>
          Download the PDF
        </a>
      </p>
      <object className="pdf-frame" data={note.href} type="application/pdf">
        <p className="notice">
          <strong>This browser won&rsquo;t show the PDF here.</strong> The download
          above works either way.
        </p>
      </object>
    </>
  );
}