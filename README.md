<img src="public/icon.svg" width="72" align="left" alt="" hspace="14" vspace="2">

# Deutsch Notizen

<br clear="left">

A reader for my German notes. The notes live in LibreOffice — a cheatsheet and
a grammar document per level — and this site is built from those files
directly. Nothing is retyped, exported or copied into a CMS: the `.ods` and
`.odt` files are the source of truth, and the site is generated from whatever
is in them.

Next.js · TypeScript · pnpm · deployed on Vercel.

---

## Quick start

Requires Node 20+ and pnpm. If you don't have pnpm:

```bash
corepack enable
```

Then:

```bash
git clone https://github.com/SarthakBharad/deutsch-notizen-web.git
cd deutsch-notizen-web

pnpm install
pnpm dev
```

Open <http://localhost:3000>. That's it — `pnpm dev` parses the notes first, so
there is no separate build step to remember.

Other commands:

| Command | What it does |
| --- | --- |
| `pnpm dev` | parse notes, then start the dev server on :3000 |
| `pnpm notes` | just re-parse `notizen/` into `src/content/notes.json` |
| `pnpm build` | parse notes, then build the static site into `out/` |
| `pnpm start` | serve a production build locally |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

---

## How it works

The Streamlit version of this read the LibreOffice files on every request.
Vercel has no filesystem at request time and no Python process sitting there,
so the same work happens **once, at build time**:

```
notizen/*.ods, *.odt          ← you edit these in LibreOffice
        │
        │  pnpm notes  (scripts/build-notes.ts)
        ▼
src/content/notes.json        ← generated, gitignored
        │
        │  next build
        ▼
out/                          ← static HTML, one page per note
```

`scripts/odf.ts` unzips each file and walks its `content.xml`; `src/lib/layout.ts`
turns a sheet's cells back into the tables they were drawn as. Both run in Node
during the build. The browser only ever receives the finished JSON, so opening a
note costs one static page load and no parsing at all.

Two consequences worth knowing:

- **`notes.json` is generated and gitignored.** Don't edit it, and don't be
  surprised that it isn't in the repo — it's rebuilt from `notizen/` every time.
- **Editing a note requires a rebuild.** In dev, restart `pnpm dev` (or run
  `pnpm notes` in another terminal and refresh). In production, commit the
  changed `.ods` and push; Vercel rebuilds.

---

## Adding notes

Drop `.ods`, `.odt` or `.pdf` files into `notizen/`. The filename is the
metadata — `<Level>_<Title>`, underscores or spaces, either works:

```
notizen/
  A2 Deutsch Cheatsheet.ods    →  A2 · Deutsch Cheatsheet     /a2/deutsch-cheatsheet
  A2 Grammatik.odt             →  A2 · Grammatik              /a2/grammatik
  B1 Wortschatz Extra.ods      →  B1 · Wortschatz Extra       /b1/wortschatz-extra
  C1 Konjunktiv.odt            →  C1 · Konjunktiv             /c1/konjunktiv
```

Levels A1–C2 each get a card on the front page, in order; anything that doesn't
start with a level code lands under **Sonstige**. Adding a level needs no code
change — the card and its routes appear on their own, because
`generateStaticParams` reads the same JSON.

Close the file in LibreOffice before committing, or you'll have a `.~lock` file
next to it (already gitignored).

---

## How the notes are read

### Cheatsheets (`.ods`)

One tab per sheet. A sheet is rarely one clean table — it's usually several,
laid out side by side or stacked, separated by blank rows and columns. Those get
reconstructed:

| In the sheet | On the page |
| --- | --- |
| 2+ blank columns | separate tables, side by side becomes stacked |
| 2+ blank rows | a new table below |
| a single blank row or column | kept as spacing |
| a row with one filled cell (`Lektion – 1`) | a band across the table |
| a row whose filled cells are mostly bold | a header — the table splits here |
| a bold cell merged down the side (`Akkusativ`) | a label column, not a header cell |
| the first full row of a block | its header, repeated on later tables of the same width |

Bold is what marks a header, which is why stacking `Akkusativ` over `Dativ` in
one grid produces two tables, each under its own headings, and why each `Teil`
of Lokale Präpositionen repeats the column headings instead of losing them off
the top of a long scroll.

*Mostly* bold, not entirely — a column added to a sheet later often misses the
formatting of the ones beside it. Half the filled cells is the bar, which stays
clear of a data row carrying one bold label down its side: `Bestimmt` in Artikel
and `Maskulin` in das Wetter run nearer a third, so those tables stay whole. If
a sheet is bold throughout, the signal means nothing and is ignored.

Merged cells are tracked against a grid rather than trusting each cell's own
flag, because splitting a table can leave a cell whose merge lived in the half
that went elsewhere. Those hold their column instead of collapsing, which keeps
merged blank regions from shifting every row left by one.

### Grammar documents (`.odt`)

Headings, paragraphs, lists and tables in document order, with bold and italic
preserved.

Numbered and bulleted lists keep their own markers, and nesting is preserved.
LibreOffice splits one visual list into several `<text:list>` elements whenever
the indent level changes, so those are stitched back together — which is also
what makes numbering run 1..n rather than restarting at each example sentence.
An indented sub-item renders as a Beispielsatz: italic, quieter, hung off a rule
in teal.

Calc tables embedded in a Writer document — the `Beispiel Sätze` table in
`A2 Grammatik.odt` — are pulled out of the nested object and rendered as real
tables, not images.

### Books (`.pdf`)

A PDF gets a download button and an inline viewer. It is copied into
`public/books/` at build time and served as a static file.

**No PDFs are in this repository.** Course textbooks are copyrighted by their
publisher, and a public repo or a public deployment is redistribution.
`.gitignore` excludes `notizen/*.pdf` so one can't be committed by accident. The
feature works locally — drop a PDF into `notizen/` and it appears — but the
files stay on the machine that owns them.

---

## Reading aids

**Search ignores umlauts.** `uber` finds `über`, `gruss` finds `Gruß`, so
nothing has to be typed on a German keyboard layout. In a cheatsheet it searches
every sheet at once and keeps the `Lektion` band above each hit; merged labels
like `Dativ` are carried onto the first surviving row, so a match never appears
without the case it belongs to. In a grammar document it keeps the rule above
any example sentence that matches.

**Two tints that carry meaning.** The article is tinted in vocabulary entries
(`der Anfang`) and the perfect auxiliary is muted (`hat aufgemacht`) — gender
and haben/sein being the two things a list like that exists to drill. Two guards
keep it quiet: the entry must be lowercase, so a sentence starting "Das…" is
left alone, and a word must follow, so the Artikel declension table — whose
cells *are* the articles — stays plain.

**Dark mode** is in the sidebar, remembered in `localStorage`, and defaults to
your system setting. A small script in `<head>` applies it before first paint,
so there's no white flash on load.

---

## Design

The Streamlit version of these notes is a reading tool: sidebar, tabs, dense
type. This one is a website — sticky header with the level switcher, a hero, a
footer — and it deliberately looks nothing like it.

**Hue carries information.** Rather than one accent used everywhere, colour is
tied to the CEFR band: every A-level page is coral, every B-level page teal.
The band colour is a single CSS variable set on the page wrapper, so table
headers, chips, list markers and the level badge all follow from it. You can
tell which half of the course you are in before reading a word.

| | Hex | Job |
| --- | --- | --- |
| Cream | `#FFF6DE` | the page in light mode, the text in dark mode |
| Coral | `#F48F68` | A-levels — A1, A2 |
| Teal | `#8BDFDD` | B-levels — B1, B2 |
| Yellow | `#FFE394` | search highlights, and nothing else |

Reserving yellow for highlights means a match is never confusable with the
interface around it.

**Type.** Bricolage Grotesque for display — level codes, the hero, note titles
— and Instrument Sans for everything else including the tables. Two families,
clearly distinct, no monospace.

**The hero is `der die das`.** The three articles are the most characteristic
thing in German, the thing this site exists to help me get right, and the thing
the vocabulary tables already tint. It is the content, not an illustration of
it.

Both palettes live as CSS custom properties at the top of
`src/app/globals.css`; nothing else in the stylesheet names a colour directly.

## Deploying to Vercel

1. Push the repo to GitHub.
2. On [vercel.com/new](https://vercel.com/new), import it. Vercel detects
   Next.js and reads `vercel.json`, so build command and install command are
   already set — nothing to configure.
3. Deploy. Every push to `main` redeploys; pull requests get preview URLs.

The build runs `pnpm notes` before `next build`, so the deployed site always
reflects the `.ods` and `.odt` files in that commit. `next.config.ts` sets
`output: "export"`, so the result is plain static files — no serverless
functions, and it will host anywhere that serves a folder.

If a deploy fails on install, check that `pnpm-lock.yaml` is committed:
`vercel.json` uses `--frozen-lockfile`, which fails deliberately rather than
quietly installing versions you never tested.

---

## Layout

```
scripts/
  xml.ts               small XML reader (keeps text tails, which ODF needs)
  odf.ts               unzip + walk content.xml → cells, spans, blocks
  build-notes.ts       scan notizen/, write src/content/notes.json
src/
  app/
    layout.tsx         document shell, theme script, metadata
    page.tsx           level picker
    [level]/[note]/    one static page per note
    globals.css        both palettes and all styling
  components/
    NotePage.tsx       sidebar, note list, search box
    NoteView.tsx       tabs, result counts, sheet/document/book routing
    Content.tsx        tables, nested lists, highlighting
    ThemeToggle.tsx    light/dark, persisted
  lib/
    types.ts           the shape of a parsed note, shared by build and browser
    layout.ts          table structure recovery
    search.ts          umlaut-folded search and filtering
    inline.ts          article and auxiliary tinting
    library.ts         lookups over notes.json
notizen/               the notes themselves — the only data source
public/icon.svg        favicon
```

`src/lib/` is imported by both the build script and the browser, so a change to
the parser that the UI hasn't kept up with is a type error rather than a blank
page.

---

## Notes

Personal project — the notes in `notizen/` are my own coursework, and any
mistakes in the German are mine. The code is yours to reuse if the same
LibreOffice-as-source-of-truth setup is useful to you.