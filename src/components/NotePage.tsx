"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { NoteView } from "@/components/NoteView";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Search } from "@/lib/search";
import type { Band } from "@/lib/library";
import type { LevelGroup, Note } from "@/lib/types";

export function NotePage({
  level,
  note,
  band,
}: {
  level: LevelGroup;
  note: Note;
  band: Band;
}) {
  const [query, setQuery] = useState("");
  const search = useMemo(() => new Search(query), [query]);

  return (
    <div className="page" data-band={band}>
      <SiteHeader current={level.slug} />

      <main>
        <div className="note-head">
          <div className="wrap">
            <span className="note-band">{level.level}</span>
            <h1 className="note-title">{note.title}</h1>

            <div className="note-controls">
              {/* Two or three notes per level, so a switcher beats a menu. */}
              {level.notes.length > 1 && (
                <div className="switch">
                  {level.notes.map((entry) => (
                    <Link
                      key={entry.slug}
                      href={`/${level.slug}/${entry.slug}`}
                      aria-current={entry.slug === note.slug ? "page" : undefined}
                    >
                      {entry.title}
                    </Link>
                  ))}
                </div>
              )}

              {note.kind !== "book" && (
                <div className="search">
                  <input
                    type="search"
                    value={query}
                    placeholder="Search this note — umlauts optional"
                    aria-label={`Search ${note.title}`}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="note-body wrap">
          <NoteView note={note} search={search} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}