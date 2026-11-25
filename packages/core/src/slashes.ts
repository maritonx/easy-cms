/**
 * A path without its leading and trailing `/` (or only the trailing ones), by loop: the regex
 * `/^\/+|\/+$/` is slow on a long run of `/` (CodeQL js/polynomial-redos).
 */
export function trimSlashes(path: string, side: 'both' | 'end' = 'both'): string {
  let start = 0
  let end = path.length
  if (side === 'both') while (start < end && path[start] === '/') start++
  while (end > start && path[end - 1] === '/') end--
  return path.slice(start, end)
}
