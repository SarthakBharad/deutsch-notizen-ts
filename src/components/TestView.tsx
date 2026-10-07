"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { blanksOf, grade, score, usedWords, type Verdict } from "@/lib/grade";
import type { Exercise, TestBlank, TestChapter, TestLine, TestNote, TestSegment } from "@/lib/types";

/** What has been typed into one chapter, and how far it has been marked. */
interface Attempt {
  values: string[];
  checked: boolean;
  revealed: boolean;
}

const fresh = (chapter: TestChapter): Attempt => ({
  values: Array.from({ length: chapter.blanks }, () => ""),
  checked: false,
  revealed: false,
});

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One tab per Lektion, like the sheets of a cheatsheet.
 *
 * Each chapter's answers are kept while you switch tabs, and the tab carries
 * its score once checked, so jumping back to Lektion 2 to look something up
 * doesn't cost the half-finished Lektion 3.
 */
export function TestView({ note }: { note: TestNote }) {
  const [active, setActive] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});

  const blanks = useMemo(
    () => note.chapters.map((chapter) => chapter.exercises.flatMap(blanksOf)),
    [note.chapters],
  );

  // #lektion-3 opens that chapter, so a link or a bookmark lands on it. Read
  // after mount: the static HTML can't know the hash, and guessing would make
  // the server and browser render different tabs.
  useEffect(() => {
    const pick = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      const at = note.chapters.findIndex((chapter) => chapter.slug === slug);
      if (at >= 0) setActive(at);
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, [note.chapters]);

  if (!note.chapters.length) {
    return (
      <p className="notice">
        <strong>No tests here yet.</strong> Start a chapter with a Heading 1 such as
        &ldquo;Lektion - 1&rdquo;, write an exercise under it, save, then rebuild.
      </p>
    );
  }

  const index = Math.min(active, note.chapters.length - 1);
  const chapter = note.chapters[index];
  const attempt = attempts[chapter.slug] ?? fresh(chapter);

  const select = (at: number) => {
    setActive(at);
    window.history.replaceState(null, "", `#${note.chapters[at].slug}`);
  };

  return (
    <>
      {note.chapters.length > 1 && (
        <div className="chips" role="tablist" aria-label="Chapters">
          {note.chapters.map((entry, i) => {
            const done = attempts[entry.slug];
            const result = done?.checked ? score(blanks[i], done.values) : null;
            return (
              <button
                key={entry.slug}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => select(i)}
              >
                {entry.title}
                {result && result.checkable > 0 && (
                  <span className="chip-score">
                    {result.right}/{result.checkable}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ChapterTest
        key={chapter.slug}
        chapter={chapter}
        blanks={blanks[index]}
        attempt={attempt}
        onChange={(next) => setAttempts((all) => ({ ...all, [chapter.slug]: next }))}
      />
    </>
  );
}

/* ------------------------------------------------------------- chapter */

function ChapterTest({
  chapter,
  blanks,
  attempt,
  onChange,
}: {
  chapter: TestChapter;
  blanks: TestBlank[];
  attempt: Attempt;
  onChange: (next: Attempt) => void;
}) {
  const root = useRef<HTMLElement>(null);

  const total = score(blanks, attempt.values);
  const open = blanks.length - total.checkable;
  const filled = attempt.values.filter((value) => value.trim()).length;

  const setValue = (id: number, value: string) => {
    const values = [...attempt.values];
    values[id] = value;
    onChange({ ...attempt, values });
  };

  const check = () => onChange({ ...attempt, checked: true });
  const reveal = () => onChange({ ...attempt, checked: true, revealed: true });
  const reset = () => {
    onChange(fresh(chapter));
    root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Enter moves on to the next blank, the way Tab does — and on the last one
  // it checks, so a whole chapter can be done without touching the mouse.
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputs = Array.from(
      root.current?.querySelectorAll<HTMLInputElement>("input[data-blank]") ?? [],
    );
    const next = inputs[inputs.indexOf(event.currentTarget) + 1];
    if (next) next.focus();
    else check();
  };

  return (
    <section className="test" ref={root} aria-label={chapter.title}>
      <div className="test-intro">
        <h2>{chapter.title}</h2>
        <p className="tally">
          {plural(chapter.exercises.length, "exercise", "exercises")} ·{" "}
          {plural(blanks.length, "blank", "blanks")}
        </p>
      </div>

      {open > 0 && (
        <p className="notice test-notice">
          <strong>
            {plural(open, "blank has", "blanks have")} no answer in the file yet.
          </strong>{" "}
          Write the answer in square brackets in place of the underscores —{" "}
          <em>Cousin und [Cousine]</em> — and rebuild to have{" "}
          {open === 1 ? "it" : "them"} checked.
        </p>
      )}

      {chapter.exercises.map((exercise, i) => (
        <ExerciseCard
          key={i}
          number={i + 1}
          exercise={exercise}
          attempt={attempt}
          onValue={setValue}
          onKey={onKey}
        />
      ))}

      <div className="test-bar">
        <p className="test-score" aria-live="polite">
          {attempt.checked && total.checkable > 0 ? (
            <>
              <strong>{total.right}</strong> of {total.checkable} right
              {total.close > 0 && ` · ${total.close} only off by capitals`}
            </>
          ) : (
            `${filled} of ${plural(blanks.length, "blank", "blanks")} filled in`
          )}
        </p>
        <div className="test-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={check}
            disabled={!total.checkable}
          >
            Check
          </button>
          <button type="button" className="btn" onClick={reveal} disabled={!total.checkable}>
            Show answers
          </button>
          <button type="button" className="btn" onClick={reset}>
            Start over
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ exercise */

function ExerciseCard({
  number,
  exercise,
  attempt,
  onValue,
  onKey,
}: {
  number: number;
  exercise: Exercise;
  attempt: Attempt;
  onValue: (id: number, value: string) => void;
  onKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const blanks = blanksOf(exercise);
  const result = score(blanks, attempt.values);

  // Worked examples use up their word before anything is typed.
  const examples = exercise.lines.flatMap((line) =>
    line.segments.flatMap((seg) => (seg.kind === "text" && seg.underline ? [seg.text.trim()] : [])),
  );
  const used = usedWords(exercise.bank, [
    ...examples,
    ...blanks.map((blank) => attempt.values[blank.id] ?? ""),
  ]);

  const renderSegment = (seg: TestSegment, key: number): ReactNode => {
    if (seg.kind === "blank") {
      return (
        <Blank
          key={key}
          blank={seg}
          value={attempt.values[seg.id] ?? ""}
          checked={attempt.checked}
          revealed={attempt.revealed}
          onValue={onValue}
          onKey={onKey}
        />
      );
    }
    if (seg.underline) {
      return (
        <span key={key} className="example" title="Example">
          {seg.text}
        </span>
      );
    }
    let node: ReactNode = seg.text;
    if (seg.bold) node = <strong>{node}</strong>;
    if (seg.italic) node = <em>{node}</em>;
    return <Fragment key={key}>{node}</Fragment>;
  };

  return (
    <article className="exercise">
      <header className="exercise-head">
        <span className="exercise-num" aria-hidden="true">
          {number}
        </span>
        <h3>{exercise.instruction || `Exercise ${number}`}</h3>
        {attempt.checked && result.checkable > 0 && (
          <span
            className="exercise-score"
            data-full={result.right === result.checkable ? "" : undefined}
          >
            {result.right}/{result.checkable}
          </span>
        )}
      </header>

      {exercise.bank.length > 0 && (
        <ul className="bank" aria-label="Words to use">
          {exercise.bank.map((word, i) => (
            <li key={i} data-used={used[i] ? "" : undefined}>
              {word}
            </li>
          ))}
        </ul>
      )}

      <Lines lines={exercise.lines} renderSegment={renderSegment} />
    </article>
  );
}

/**
 * Paragraphs as paragraphs, list items gathered back into lists.
 *
 * Numbered lists (Familie, Possessivartikel) keep their numbers; bulleted ones
 * are the dialogues, and read as dialogue — a dash, not a dot.
 */
function Lines({
  lines,
  renderSegment,
}: {
  lines: TestLine[];
  renderSegment: (seg: TestSegment, key: number) => ReactNode;
}) {
  const groups: Array<{ list: boolean; ordered: boolean; lines: TestLine[] }> = [];
  for (const line of lines) {
    const list = line.depth > 0;
    const last = groups[groups.length - 1];
    if (last && last.list === list && (!list || last.ordered === line.ordered)) {
      last.lines.push(line);
    } else {
      groups.push({ list, ordered: line.ordered, lines: [line] });
    }
  }

  return (
    <>
      {groups.map((group, gi) => {
        if (!group.list) {
          return (
            <Fragment key={gi}>
              {group.lines.map((line, li) => (
                <p key={li} className="test-line">
                  {line.segments.map(renderSegment)}
                </p>
              ))}
            </Fragment>
          );
        }
        const Tag = group.ordered ? "ol" : "ul";
        return (
          <Tag key={gi} className="test-lines">
            {group.lines.map((line, li) => (
              <li key={li} className={line.depth > 1 ? "deeper" : undefined}>
                {line.segments.map(renderSegment)}
              </li>
            ))}
          </Tag>
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------- blank */

const MARK: Partial<Record<Verdict, string>> = {
  right: "✓",
  close: "Aa",
  wrong: "✕",
  empty: "✕",
};

const LABEL: Partial<Record<Verdict, string>> = {
  right: "right",
  close: "right apart from capitals",
  wrong: "wrong",
  empty: "not answered",
};

function Blank({
  blank,
  value,
  checked,
  revealed,
  onValue,
  onKey,
}: {
  blank: TestBlank;
  value: string;
  checked: boolean;
  revealed: boolean;
  onValue: (id: number, value: string) => void;
  onKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const verdict = grade(value, blank.answers);
  // Marked once checked, and live from then on — fixing a mistake turns it
  // green straight away rather than waiting for another press of Check.
  const shown = checked && verdict !== "open" ? verdict : undefined;
  const showKey =
    blank.answers.length > 0 &&
    ((revealed && verdict !== "right") || (checked && verdict === "close"));

  return (
    <span className="blank" data-verdict={shown}>
      <input
        data-blank={blank.id}
        value={value}
        onChange={(event) => onValue(blank.id, event.target.value)}
        onKeyDown={onKey}
        style={{ width: `calc(${blank.width}ch + 1rem)` }}
        aria-label={`Blank ${blank.id + 1}${shown ? `, ${LABEL[shown]}` : ""}`}
        aria-invalid={shown === "wrong" || shown === "empty" ? true : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {shown && MARK[shown] && (
        <span className="blank-mark" aria-hidden="true">
          {MARK[shown]}
        </span>
      )}
      {showKey && <span className="blank-key">{blank.answers.join(" / ")}</span>}
    </span>
  );
}
