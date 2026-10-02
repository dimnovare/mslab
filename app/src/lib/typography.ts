/**
 * Keeps a run of Title-case Latin words ("Lash Lift") on one line, whatever the language around it: the spaces between
 * them become no-break spaces. Product names are written that way ("Lash Lift BOTOX"); Estonian and Russian sentences
 * almost never have two such words in a row, and an all-caps word ("BOTOX", "MS LAB") is left to wrap (N6).
 */
export function keepNamesTogether(text: string): string {
  return text.replace(/(?<![\p{L}\p{N}])(\p{Lu}\p{Ll}+) (?=\p{Lu}\p{Ll}+(?![\p{L}\p{N}]))/gu, (_, word: string) => (/^[A-Za-z]+$/.test(word) ? `${word} ` : `${word} `));
}
