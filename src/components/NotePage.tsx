"use client";

import Link from "next/link";
import { useState } from "react";

import { NoteView } from "@/components/NoteView";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { LevelGroup, Note } from "@/lib/types";

const KICKER: Record<Note["kind"], string> = {
  sheet: "Cheatsheet",
  document: "Dokument",
  book: "Buch · PDF",
};

export function NotePage({ level, note }: { level: LevelGroup; note: Note }) {
  const [query, setQuery] = useState("");

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="btn" href="/">
          ← All levels
        </Link>

        <div>
          <Link className="brand" href="/">
            Deutsch Notizen
          </Link>
          <div className="brand-level">{level.level}</div>
        </div>

        <ul className="note-list">
          {level.notes.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={`/${level.slug}/${entry.slug}`}
                aria-current={entry.slug === note.slug ? "page" : undefined}
              >
                <span>{entry.title}</span>
                {entry.kind === "book" && <span className="tag">PDF</span>}
              </Link>
            </li>
          ))}
        </ul>

        {/* Search doesn't apply to a PDF, so the box isn't offered for one. */}
        {note.kind !== "book" && (
          <>
            <hr className="rule" />
            <div>
              <input
                className="field"
                type="search"
                value={query}
                placeholder="Search this note…"
                aria-label="Search this note"
                onChange={(event) => setQuery(event.target.value)}
              />
              <p className="hint">
                Umlauts optional — <em>uber</em> finds <em>über</em>.
              </p>
            </div>
          </>
        )}

        <div className="spacer-grow" />
        <ThemeToggle />
      </aside>

      <main className="main">
        <div className="kicker">
          {level.level} · {KICKER[note.kind]}
        </div>
        <h1 className="note-title">{note.title}</h1>
        <NoteView note={note} query={query} />
      </main>
    </div>
  );
}
