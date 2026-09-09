/**
 * The two tints that carry meaning in a vocabulary table.
 *
 * The article is tinted in an entry like "der Anfang" and the perfect
 * auxiliary is muted in "hat aufgemacht" — gender and haben/sein being the two
 * things a list like that exists to drill.
 *
 * Both patterns are deliberately narrow. Case-sensitive, because a dictionary
 * entry starts "der Anfang" while a capitalised "Das Buch liegt…" is a
 * sentence, where tinting would be noise. And a word must follow, so the
 * Artikel declension table — whose cells *are* the articles — stays plain.
 */

const WORD_FOLLOWS = "\\s+(?=[A-Za-zÄÖÜäöüß])";

const ARTICLE = new RegExp(
  `^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner)${WORD_FOLLOWS}`,
);
const AUXILIARY = new RegExp(`^(hat|ist|haben|sind)${WORD_FOLLOWS}`);

export type Tint = "article" | "auxiliary";

export interface Lead {
  word: string;
  kind: Tint;
  rest: string;
}

/** Split a leading article or auxiliary off a cell, if there is one. */
export function leadingTint(text: string): Lead | null {
  const article = ARTICLE.exec(text);
  if (article) {
    return { word: article[1], kind: "article", rest: text.slice(article[1].length) };
  }
  const auxiliary = AUXILIARY.exec(text);
  if (auxiliary) {
    return { word: auxiliary[1], kind: "auxiliary", rest: text.slice(auxiliary[1].length) };
  }
  return null;
}
