import Link from "next/link";

import { bandOf, levelHref, library } from "@/lib/library";

/**
 * The footer's job is provenance: where these notes come from, and how current
 * they are. The build date is the honest answer to "is this up to date?", since
 * the site is generated from the LibreOffice files at build time.
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Formatted by hand rather than with toLocaleDateString.
 *
 * The footer is rendered both when the page is built and again when React
 * hydrates it, and the two run under different ICU data — which makes the
 * string differ and React discard the whole tree. Building it from UTC parts
 * gives the same answer everywhere.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function SiteFooter() {
  const built = formatDate(library.builtAt);

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <h2>About these notes</h2>
          <p>
            My own notes from German classes, a compilation of content from the books of Hueber Verlag and Goethe.
          </p>
        </div>

        <div>
          <h2>Levels</h2>
          <ul className="footer-links">
            {library.levels.map((level) => (
              <li key={level.slug}>
                <Link href={levelHref(level)} data-band={bandOf(level.level)}>
                  {level.level} — {level.notes.map((note) => note.title).join(", ")}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2>Last updated</h2>
          <p>
            {built}. The pages are rebuilt whenever I commit a change to the
            notes, so this is the date of the most recent one.
          </p>
        </div>
      </div>
    </footer>
  );
}