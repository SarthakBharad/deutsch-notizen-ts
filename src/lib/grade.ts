/**
 * Checking a typed answer against the key.
 *
 * Two kinds of difference are treated differently on purpose:
 *
 * - Umlauts typed as ae / oe / ue / ss count as right. That is a keyboard
 *   problem, not a German one — the same reason search ignores umlauts.
 * - A difference in capitals is "close", not right. In German the capital is
 *   part of the answer: "Ihre Blumen" (Herr Kuhnert's) and "ihre Puppen"
 *   (Melanie's) are different words.
 */

import type { Exercise, TestBlank } from "./types";

export type Verdict =
  | "right"
  | "close" // right apart from capitals
  | "wrong"
  | "empty" // nothing typed
  | "open"; // no answer in the .odt, so nothing to check against

/** Same spacing, same quotes — differences nobody means. */
export function tidyAnswer(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’´`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const SPELLED: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

/** Spell umlauts out, so "erzaehlt" and "erzählt" compare equal. */
export function spellOut(text: string): string {
  return tidyAnswer(text).replace(/[äöüÄÖÜß]/g, (ch) => SPELLED[ch] ?? ch);
}

export function grade(typed: string, answers: string[]): Verdict {
  if (!answers.length) return "open";
  const given = spellOut(typed);
  if (!given) return "empty";

  const keys = answers.map(spellOut);
  if (keys.includes(given)) return "right";

  const lower = given.toLowerCase();
  if (keys.some((key) => key.toLowerCase() === lower)) return "close";
  return "wrong";
}

/** Every blank in an exercise, in order. */
export function blanksOf(exercise: Exercise): TestBlank[] {
  return exercise.lines.flatMap((line) =>
    line.segments.filter((seg): seg is TestBlank => seg.kind === "blank"),
  );
}

export interface Score {
  right: number;
  close: number;
  /** blanks that have an answer to check against */
  checkable: number;
}

export function score(blanks: TestBlank[], values: string[]): Score {
  const result: Score = { right: 0, close: 0, checkable: 0 };
  for (const blank of blanks) {
    const verdict = grade(values[blank.id] ?? "", blank.answers);
    if (verdict === "open") continue;
    result.checkable += 1;
    if (verdict === "right") result.right += 1;
    if (verdict === "close") result.close += 1;
  }
  return result;
}

/**
 * Which words of a bank have been used, by position.
 *
 * Counted rather than matched, so a bank holding the same word twice needs it
 * typed twice. The worked example uses its word up front — "geklettert" is
 * crossed off before anything is typed, as it would be on paper.
 */
export function usedWords(bank: string[], taken: string[]): boolean[] {
  const left = new Map<string, number>();
  for (const word of taken) {
    const key = spellOut(word).toLowerCase();
    if (key) left.set(key, (left.get(key) ?? 0) + 1);
  }
  return bank.map((word) => {
    const key = spellOut(word).toLowerCase();
    const n = left.get(key) ?? 0;
    if (n <= 0) return false;
    left.set(key, n - 1);
    return true;
  });
}
