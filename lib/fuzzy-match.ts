/**
 * Lightweight fuzzy matcher for scanner search.
 *
 * Goals:
 *   - Tolerant to tildes (Á = a), case, and surrounding whitespace
 *   - Space-separated query terms must all match somewhere in the target
 *   - Short queries (<=4 chars) also match initials: "jp" matches "Juan Perez"
 *   - Score ranks exact > prefix > word-start > substring > initials
 *
 * Returns:
 *   - matches: boolean — true if query matches target
 *   - score: number — higher is better (used for sorting/highlighting)
 */

const diacriticRe = /\p{Diacritic}/gu
const wordRe = /\s+/

/** Lowercase + strip diacritics + collapse whitespace. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFD')
    .replace(diacriticRe, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Compute initials from a full name ("Juan Perez" → "jp"). */
function initialsOf(normalized: string): string {
  return normalized
    .split(wordRe)
    .map((w) => w[0] || '')
    .join('')
}

export interface FuzzyResult {
  matches: boolean
  score: number
}

/**
 * Match query against target.
 *
 * @param query Raw user query (normalized internally)
 * @param target Raw target string (normalized internally)
 */
export function fuzzyMatch(query: string, target: string | null | undefined): FuzzyResult {
  const q = normalizeText(query)
  const t = normalizeText(target)
  if (!q) return { matches: true, score: 0 }
  if (!t) return { matches: false, score: 0 }

  // Best score wins across strategies.
  let score = 0
  let anyMatch = false

  // 1) Full-string contains (all terms together)
  if (t.includes(q)) {
    anyMatch = true
    if (t === q) score = Math.max(score, 100)
    else if (t.startsWith(q)) score = Math.max(score, 80)
    else score = Math.max(score, 50)
  }

  // 2) Token-based: each query token appears as a substring in target
  const tokens = q.split(wordRe).filter(Boolean)
  if (tokens.length > 0) {
    const allTokensMatch = tokens.every((tok) => t.includes(tok))
    if (allTokensMatch) {
      anyMatch = true
      // Bonus if every token starts a word in the target
      const words = t.split(wordRe)
      const allTokensAreWordStarts = tokens.every((tok) =>
        words.some((w) => w.startsWith(tok)),
      )
      if (allTokensAreWordStarts) score = Math.max(score, 60)
      else score = Math.max(score, 30)
    }
  }

  // 3) Initials match (only for short, single-token queries)
  if (!anyMatch && tokens.length === 1 && q.length <= 4) {
    const initials = initialsOf(t)
    if (initials.startsWith(q)) {
      anyMatch = true
      score = Math.max(score, 20)
    }
  }

  return { matches: anyMatch, score }
}

/** Match query against any of multiple targets, returning best result. */
export function fuzzyMatchAny(
  query: string,
  targets: Array<string | null | undefined>,
): FuzzyResult {
  let best: FuzzyResult = { matches: false, score: 0 }
  for (const t of targets) {
    const r = fuzzyMatch(query, t)
    if (r.matches && r.score > best.score) best = r
  }
  // If none matched with score > 0, still propagate the "matches: true" for
  // empty query from the first call.
  if (!best.matches && !normalizeText(query)) return { matches: true, score: 0 }
  return best
}
