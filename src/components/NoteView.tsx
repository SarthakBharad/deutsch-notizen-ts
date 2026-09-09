"use client";

import { useMemo, useState } from "react";

import { Document, Groups } from "@/components/Content";
import { filterDocument, filterGroups, Search } from "@/lib/search";
import type { Note } from "@/lib/types";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function sizeLabel(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

export function NoteView({ note, query }: { note: Note; query: string }) {
  const search = useMemo(() => new Search(query), [query]);

  if (note.kind === "book") {
    return (
      <>
        <p className="count">
          {note.filename} · {sizeLabel(note.size)}
        </p>
        <p>
          <a className="btn btn-primary" href={note.href} download={note.filename}>
            Download PDF
          </a>
        </p>
        <object data={note.href} type="application/pdf" width="100%" height="760">
          <div className="empty">
            This browser won&rsquo;t display the PDF inline. The download above works
            either way.
          </div>
        </object>
      </>
    );
  }

  if (note.kind === "document") {
    return <DocumentView note={note} search={search} />;
  }

  return <SheetView note={note} search={search} />;
}

/* ------------------------------------------------------------- sheets */

function SheetView({ note, search }: { note: Extract<Note, { kind: "sheet" }>; search: Search }) {
  const [active, setActive] = useState(0);

  const filtered = useMemo(
    () => note.sheets.map((sheet) => filterGroups(sheet.groups, search)),
    [note.sheets, search],
  );

  if (!note.sheets.length) {
    return <div className="empty">This file has no sheets yet.</div>;
  }

  // Searching looks across every sheet at once; tabs would hide the hits.
  if (search.active) {
    const hits = note.sheets
      .map((sheet, i) => ({ sheet, ...filtered[i] }))
      .filter((entry) => entry.count > 0);

    const total = hits.reduce((sum, entry) => sum + entry.count, 0);
    if (!total) {
      return (
        <>
          <p className="count">No match for &ldquo;{search.query}&rdquo;</p>
          <div className="empty">
            Nothing in this file matches. Try a shorter word — the search matches
            anywhere inside a cell.
          </div>
        </>
      );
    }

    return (
      <>
        <p className="count">
          {plural(total, "matching row", "matching rows")} in{" "}
          {plural(hits.length, "sheet", "sheets")}
        </p>
        {hits.map((entry, i) => (
          <div key={i} className="doc">
            <h2>{entry.sheet.name || `Sheet ${i + 1}`}</h2>
            <Groups groups={entry.groups} search={search} />
          </div>
        ))}
      </>
    );
  }

  const sheet = note.sheets[Math.min(active, note.sheets.length - 1)];
  const shown = filtered[Math.min(active, note.sheets.length - 1)];

  return (
    <>
      <div className="tabs" role="tablist">
        {note.sheets.map((entry, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
          >
            {entry.name || `Sheet ${i + 1}`}
          </button>
        ))}
      </div>

      {shown.groups.length ? (
        <>
          <p className="count">{plural(countRows(shown.groups), "row", "rows")}</p>
          <Groups groups={shown.groups} search={search} />
        </>
      ) : (
        <div className="empty">
          <strong>{sheet.name}</strong> is empty. Add rows in LibreOffice, save, then
          rebuild.
        </div>
      )}
    </>
  );
}

function countRows(groups: ReturnType<typeof filterGroups>["groups"]): number {
  return groups.reduce(
    (sum, group) => sum + group.blocks.reduce((n, block) => n + block.rows.length, 0),
    0,
  );
}

/* ---------------------------------------------------------- documents */

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
      <div className="empty">
        Nothing written here yet. Add to the file in LibreOffice, save, then rebuild.
      </div>
    );
  }

  if (search.active) {
    if (!filtered.count) {
      return (
        <>
          <p className="count">No match for &ldquo;{search.query}&rdquo;</p>
          <div className="empty">Nothing in this document matches.</div>
        </>
      );
    }
    return (
      <>
        <p className="count">
          {plural(filtered.count, "matching passage", "matching passages")}
        </p>
        <Document blocks={filtered.blocks} search={search} />
      </>
    );
  }

  return <Document blocks={note.blocks} search={search} />;
}
