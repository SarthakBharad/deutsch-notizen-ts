import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { library, splitNotes } from "@/lib/library";

export default function Home() {
  const { levels } = library;
  const all = levels.flatMap((level) => level.notes);
  const { written, books } = splitNotes(all);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <span className="brand">Deutsch Notizen</span>
          <p className="hint">
            {all.length
              ? `${written.length} ${written.length === 1 ? "Notiz" : "Notizen"}` +
                (books.length ? `, ${books.length} ${books.length === 1 ? "Buch" : "Bücher"}` : "")
              : "No notes yet"}
          </p>
        </div>
        <div className="spacer-grow" />
        <ThemeToggle />
      </aside>

      <main className="main">
        <div className="masthead">
          <div className="eyebrow">Meine Notizen</div>
          <h1>Deutsch</h1>
          <p>
            Pick a level to read what&rsquo;s in it. Everything comes straight from the
            LibreOffice files in <code>notizen/</code>.
          </p>
        </div>

        {levels.length ? (
          <div className="levels">
            {levels.map((level) => {
              const split = splitNotes(level.notes);
              const meta =
                `${split.written.length} ${split.written.length === 1 ? "Notiz" : "Notizen"}` +
                (split.books.length
                  ? ` · ${split.books.length} ${split.books.length === 1 ? "Buch" : "Bücher"}`
                  : "");

              return (
                <Link
                  key={level.slug}
                  className="level-card"
                  href={`/${level.slug}/${level.notes[0]?.slug ?? ""}`}
                >
                  <div className="code">{level.level}</div>
                  <div className="meta">{meta}</div>
                  <div className="files">{level.notes.map((n) => n.title).join(" · ")}</div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            No notes found. Put an .ods, .odt or .pdf file in <strong>notizen/</strong>,
            named like <strong>A2 Grammatik.odt</strong>, then run <code>pnpm notes</code>.
          </div>
        )}
      </main>
    </div>
  );
}
