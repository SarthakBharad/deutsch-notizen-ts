import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { bandOf, levelHref, library } from "@/lib/library";

/**
 * The header carries the level switcher, so moving between A2 and B1 never
 * means going back to the front page. Each level link is tinted its own band
 * colour, which makes the nav double as the legend for the whole site.
 */
export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            ä
          </span>
          <span>Deutsch Notizen</span>
        </Link>

        <nav className="header-nav" aria-label="Levels">
          {library.levels.map((level) => (
            <Link
              key={level.slug}
              className="header-link"
              href={levelHref(level)}
              data-band={bandOf(level.level)}
              aria-current={level.slug === current ? "true" : undefined}
            >
              {level.level}
            </Link>
          ))}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}