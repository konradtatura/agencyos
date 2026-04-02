/**
 * Transcript similarity — Sprint 8.
 *
 * jaccardSimilarity(a, b)
 *   Normalises both strings (lowercase, strip punctuation, remove filler words)
 *   and returns the Jaccard coefficient of their word sets.
 *
 *   0 = completely different
 *   1 = identical word sets
 *
 * SIMILARITY_THRESHOLD — reels at or above this value are considered the same script.
 */

// Words that add no script-identity signal
const FILLER_WORDS = new Set(['um', 'uh', 'like', 'you', 'know', 'so', 'just', 'okay', 'ok', 'right'])

export const SIMILARITY_THRESHOLD = 0.80

/**
 * Lower-cases the text, strips all non-alphanumeric characters, splits on
 * whitespace, and drops empty tokens and filler words.
 */
function normalise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')   // strip punctuation / special chars
      .split(/\s+/)
      .filter((w) => w.length > 0 && !FILLER_WORDS.has(w)),
  )
}

/**
 * Jaccard similarity on word sets.
 *
 *   J(A, B) = |A ∩ B| / |A ∪ B|
 *
 * Two empty strings are considered identical (returns 1).
 * One empty vs one non-empty returns 0.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = normalise(a)
  const setB = normalise(b)

  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const word of Array.from(setA)) {
    if (setB.has(word)) intersection++
  }

  const union = setA.size + setB.size - intersection
  return intersection / union
}
