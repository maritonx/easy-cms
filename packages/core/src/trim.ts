/**
 * `text` without `char` at its ends (`start` and `end`, both by default). A loop, not a regex such
 * as `/^-+|-+$/`, which can take quadratic time on many repetitions (CodeQL js/polynomial-redos).
 */
export function trimChar(
  text: string,
  char: string,
  ends: { start?: boolean; end?: boolean } = {},
): string {
  let start = 0
  let end = text.length
  if (ends.start !== false) while (start < end && text[start] === char) start++
  if (ends.end !== false) while (end > start && text[end - 1] === char) end--
  return text.slice(start, end)
}
