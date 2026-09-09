import Link from "next/link";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { bandOf, levelHref, library, splitNotes } from "@/lib/library";

function countSheets(level: (typeof library.levels)[number]) {
  return level.notes.reduce(
    (sum, note) => sum + (note.kind === "sheet" ? note.sheets.length : 0),
    0,
  );
}

export default function Home() {
  const { levels } = library;

  return (
    <div className="page" data-band="a">
      <SiteHeader />

      <main>
        <section className="hero wrap">
          {/* The three articles are the thing this site exists to help me get
              right, so they are the page rather than an illustration on it. */}
          <h1 className="hero-articles">
            <span>der</span>
            <span>die</span>
            <span>das</span>
          </h1>
          <p>
            Everything I have written down for German, in one place I can search
            — vocabulary, verb tables, and the prepositions I never remember.
          </p>
        </section>

        <section className="wrap">
          <div className="section-head">
            <h2>Choose a level</h2>
          </div>

          <div className="levels">
            {levels.map((level) => {
              const { written, books } = splitNotes(level.notes);
              const sheets = countSheets(level);

              return (
                <Link
                  key={level.slug}
                  className="level-tile"
                  href={levelHref(level)}
                  data-band={bandOf(level.level)}
                >
                  <span className="code">{level.level}</span>
                  <span className="inside">
                    {written.map((note) => (
                      <span key={note.slug}>{note.title}</span>
                    ))}
                    {books.map((note) => (
                      <span key={note.slug}>{note.title}</span>
                    ))}
                    <em>
                      {sheets > 0
                        ? `${sheets} ${sheets === 1 ? "table" : "tables"}`
                        : "Notes and grammar"}
                    </em>
                  </span>
                </Link>
              );
            })}

            {levels.length === 0 && (
              <div className="notice">
                <strong>No notes yet.</strong> Put an .ods, .odt or .pdf file in the{" "}
                <strong>notizen</strong> folder, named like{" "}
                <strong>A2 Grammatik.odt</strong>, then run <strong>pnpm notes</strong>.
              </div>
            )}
          </div>
        </section>

        <section className="wrap blurbs">
          <div>
            <h3>Search without the umlauts</h3>
            <p>
              Type <strong>uber</strong> and you will find <strong>über</strong>.
              A search runs across every sheet at once and keeps each result under
              the Lektion it came from.
            </p>
          </div>
          <div>
            <h3>The tables stay tables</h3>
            <p>
              A cheatsheet page is usually several tables sharing one grid. Each
              one is pulled back apart and given its own headings, so nothing
              loses its column when you scroll.
            </p>
          </div>
          <div>
            <h3>Written in LibreOffice</h3>
            <p>
              Nothing here is retyped. The .ods and .odt files are the notes, and
              the pages are built from them — so what I write in class is what
              appears here.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}