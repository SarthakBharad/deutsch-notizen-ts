<p align="center">
  <img src="public/icon.svg" width="84" alt="Deutsch Notizen">
</p>

<h1 align="center">Deutsch Notizen</h1>

<p align="center">
  My German notes (A2 → B1) as a fast, static website, generated straight from the LibreOffice files I write them in.
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white">
  <img alt="Deployed on Vercel" src="https://img.shields.io/badge/deployed%20on-Vercel-000000?logo=vercel&logoColor=white">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/code-MIT-F48F68"></a>
</p>

<!--
  Uncomment once the live URL is final:
  <p align="center"><a href="https://YOUR-PROJECT.vercel.app"><strong>Open the site →</strong></a></p>
-->

---

The notes live in LibreOffice: a cheatsheet (`.ods`) and a grammar document
(`.odt`) per level. This site is built from those files directly. Nothing is
retyped, exported or copied into a CMS. The `.ods` and `.odt` files are the
source of truth, and the site is generated from whatever is in them.

## Features

- **LibreOffice as the CMS.** Drop a file named like `A2 Grammatik.odt` into
  `notizen/`, push, and it shows up as a page.
- **Tables stay tables.** A cheatsheet tab is usually several tables sharing
  one grid. Each one is pulled back apart with its own headings, `Lektion`
  bands and merged side labels.
- **Grammar documents become real pages.** Headings, nested lists, bold and
  italic all carry over, and Calc tables embedded in a Writer document
  render as HTML tables, not images.
- **Search without umlauts.** `uber` finds `über` and `horen` finds `hören`,
  so you don't need a German keyboard. A search runs across every sheet at
  once and keeps each hit under the `Lektion` it came from.
- **Tints that teach.** Articles are tinted in vocabulary entries (`der Anfang`)
  and the perfect auxiliary is muted (`hat aufgemacht`).
- **Colour means level.** A-levels are coral and B-levels are teal. Yellow is
  used for search hits and nothing else.
- **Light and dark mode.** The theme follows your system setting and remembers
  your choice. It's applied before first paint, so the page never flashes.
- **Fully static.** `output: "export"` means no server and no serverless
  functions. It can be hosted anywhere that serves a folder.

---

## Quick start

You need **Node 22+** and **pnpm 10**. If you don't have pnpm:

```bash
corepack enable        # or: npm install -g pnpm
```

Then:

```bash
git clone https://github.com/SarthakBharad/deutsch-notizen-web.git
cd deutsch-notizen-web

pnpm install
pnpm dev
```

Open <http://localhost:3000>. `pnpm dev` parses the notes before it starts, so
you don't need to remember a separate build step.

| Command | What it does |
| --- | --- |
| `pnpm dev` | parse the notes, then start the dev server on :3000 |
| `pnpm notes` | only re-parse `notizen/` into `src/content/notes.json` |
| `pnpm build` | parse the notes, then export the static site into `out/` |
| `pnpm dlx serve out` | preview the exported build locally |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

> `next start` doesn't apply to a static export. To preview a production build,
> serve the `out/` folder as shown above.

---

## How it works

The Streamlit version of these notes read the LibreOffice files on every
request. Vercel has no filesystem at request time and no Python process waiting
to run, so here the same work happens **once, at build time**:

```
notizen/*.ods, *.odt          ← edited in LibreOffice
        │
        │  pnpm notes  (scripts/build-notes.ts)
        ▼
src/content/notes.json        ← generated, gitignored
        │
        │  next build  (output: "export")
        ▼
out/                          ← static HTML, one page per note
```

`scripts/odf.ts` unzips each file and walks its `content.xml`, and
`src/lib/layout.ts` turns a sheet's cells back into the tables they were drawn
as. Both run in Node during the build. The browser only gets the finished JSON,
so opening a note takes one static page load and no parsing.

This has two consequences:

- **`notes.json` is generated and gitignored.** Don't edit it, and don't expect
  to find it in the repo. It's rebuilt from `notizen/` every time.
- **Editing a note means rebuilding.** In dev, restart `pnpm dev` (or run
  `pnpm notes` in a second terminal and refresh). In production, commit the
  changed file and push, and Vercel rebuilds.

---

## Adding notes

Drop `.ods`, `.odt` or `.pdf` files into `notizen/`. The filename is the
metadata: `<Level> <Title>`, separated by spaces or underscores.

```
notizen/
  A2 Deutsch Cheatsheet.ods    →  A2 · Deutsch Cheatsheet     /a2/deutsch-cheatsheet/
  A2 Grammatik.odt             →  A2 · Grammatik              /a2/grammatik/
  B1 Wortschatz Extra.ods      →  B1 · Wortschatz Extra       /b1/wortschatz-extra/
  C1 Konjunktiv.odt            →  C1 · Konjunktiv             /c1/konjunktiv/
```

Each level from A1 to C2 gets a tile on the front page and a link in the header,
in order. Anything that doesn't start with a level code goes under
**Sonstige**. Adding a level needs no code change, because
`generateStaticParams` reads the same JSON and the tile and routes appear on
their own.

Close the file in LibreOffice before you commit. Otherwise a `.~lock` file sits
next to it (it's already gitignored).

---

## How the notes are read

### Cheatsheets (`.ods`)

Each sheet becomes a tab. A sheet is rarely one clean table. It's usually
several, placed side by side or stacked, with blank rows and columns between
them. These rules rebuild them:

| In the sheet | On the page |
| --- | --- |
| 2+ blank columns | separate tables (side by side becomes stacked) |
| 2+ blank rows | a new table below |
| a single blank row or column | kept as spacing |
| a row with one filled cell (`Lektion – 1`) | a band across the table |
| a row whose filled cells are mostly bold | a header, and the table splits here |
| a bold cell merged down the side (`Akkusativ`) | a label column, not a header cell |
| the first full row of a block | its header, repeated on later tables of the same width |

Bold is what marks a header. That's why stacking `Akkusativ` over `Dativ` in one
grid gives two tables, each with its own headings. It's also why each `Teil` of
Lokale Präpositionen repeats the column headings, so they don't scroll out of
view on a long table.

The test is *mostly* bold, not all bold, because a column added to a sheet later
often misses the formatting of the ones beside it. The bar is half the filled
cells. That stays clear of a data row with one bold label down its side, which
comes nearer a third (`Bestimmt` in Artikel, `Maskulin` in das Wetter), so
those tables stay whole. If a sheet is bold throughout, the signal is ignored.

Merged cells are tracked on a grid instead of trusting each cell's own flag.
Splitting a table can leave a cell whose merge was in the other half. That cell
keeps its column instead of collapsing, so a merged blank region doesn't shift
every row left by one.

### Grammar documents (`.odt`)

Headings, paragraphs, lists and tables appear in document order, with bold and
italic kept.

Numbered and bulleted lists keep their own markers and their nesting.
LibreOffice splits one visual list into several `<text:list>` elements whenever
the indent level changes. The parser stitches them back together, which also
keeps the numbering running 1..n instead of restarting after each example
sentence. An indented sub-item renders as a *Beispielsatz*: quieter text set
against a rule in the level's colour.

Calc tables embedded in a Writer document, like the `Beispiel Sätze` table in
`A2 Grammatik.odt`, are pulled out of the nested object and rendered as real
tables.

A leading heading that only repeats the file's name (every Grammatik document
opens with "B1 Grammatik") is dropped, because the page title already says it.

### Books (`.pdf`)

A PDF gets a download button and an inline viewer. It's copied into
`public/books/` at build time and served as a static file.

**No PDFs are in this repository.** Course textbooks are copyrighted by their
publishers, and putting them in a public repo or deployment would be
redistribution. `.gitignore` excludes `notizen/*.pdf` so one can't be committed
by accident. The feature works locally: drop a PDF into `notizen/` and it
appears, but the file stays on the machine that owns it.

---

## Design

The Streamlit version is a reading tool with a sidebar, tabs and dense type.
This one is a website with a sticky header, a hero and a footer, and it's meant
to look nothing like the Streamlit one.

**Hue carries information.** Instead of one accent used everywhere, colour is
tied to the CEFR band. Every A-level page is coral and every B-level page is
teal. The band colour is one CSS variable (`--accent`) set on the page wrapper,
and table headers, tabs, list markers and the level badge all follow from it,
so you can tell which half of the course you're in before reading a word.

| | Hex | Job |
| --- | --- | --- |
| Cream | `#FFF6DE` | the page in light mode, the text in dark mode |
| Coral | `#F48F68` | A-levels (A1, A2) |
| Teal | `#8BDFDD` | B-levels (B1, B2) |
| Yellow | `#FFE394` | search highlights, and nothing else |

C-levels and *Sonstige* fall back to the ink colour until they have a hue of
their own. Because yellow is only used for highlights, a match can't be confused
with the interface around it.

**Type.** Bricolage Grotesque is the display face (level codes, the hero, note
titles) and Instrument Sans is used for everything else, tables included. Two
clearly different families, and no monospace.

**The hero is `der die das`.** The three articles are the most characteristic
thing in German, the thing this site exists to help me get right, and what the
vocabulary tables already tint. They are the page's content, not decoration.

Both palettes are CSS custom properties at the top of `src/app/globals.css`.
Nothing else in the stylesheet names a colour directly.

---

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new). Vercel detects Next.js
   and reads `vercel.json`, where the build and install commands are already
   set, so there's nothing to configure.
3. Deploy. Every push to `main` redeploys, and pull requests get preview URLs.

The build runs `pnpm notes` before `next build`, so the deployed site always
matches the `.ods` and `.odt` files in that commit.

If a deploy fails at install, check that `pnpm-lock.yaml` is committed.
`vercel.json` uses `--frozen-lockfile`, which fails on purpose instead of
quietly installing versions you never tested.

---

## Project structure

```
notizen/                  the notes themselves, the only data source
scripts/
  xml.ts                  small XML reader (keeps text tails, which ODF needs)
  odf.ts                  unzip + walk content.xml → cells, spans, blocks
  build-notes.ts          scan notizen/, write src/content/notes.json
src/
  app/
    layout.tsx            document shell, theme script, metadata
    page.tsx              home: hero and level tiles
    [level]/[note]/       one static page per note
    globals.css           both palettes and all styling
  components/
    SiteHeader.tsx        brand, level switcher, theme toggle
    SiteFooter.tsx        about, level links, build date
    NotePage.tsx          note heading, switcher between a level's notes, search
    NoteView.tsx          sheet tabs, result counts, sheet/document/book views
    Content.tsx           tables, nested lists, highlighting
    ThemeToggle.tsx       light/dark, persisted in localStorage
  lib/
    types.ts              the shape of a parsed note, shared by build and browser
    layout.ts             table structure recovery
    search.ts             umlaut-folded search and filtering
    inline.ts             article and auxiliary tinting
    library.ts            lookups over notes.json, CEFR band
  content/notes.json      generated by pnpm notes (gitignored)
public/icon.svg           favicon
vercel.json               build and install commands for Vercel
```

`src/lib/` is imported by both the build script and the browser. If the parser
changes and the UI hasn't caught up, you get a type error instead of a blank
page.

---

## Roadmap

- [ ] **Chapter tests.** One test per Lektion, built from `A2 Tests.odt`. The
      answers are written in the document as `[Antwort]` where the blanks go.
      Fill-in-the-blank comes first, and other exercise types will follow.

---

## License

The **code** is released under the [MIT License](LICENSE). If the same
LibreOffice-as-source-of-truth setup is useful to you, reuse it freely.

The **notes** in `notizen/`, and the text generated from them, are **not**
covered by that license. They're my own study notes, compiled from my German
classes and from course books by Hueber Verlag and the Goethe-Institut, whose
material stays the property of its publishers. They're here to be read, so
please don't republish them.

Any mistakes in the German are mine.