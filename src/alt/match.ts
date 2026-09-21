import type { AltValuation, SlabQuery } from '../types.js'

/** Normalize printed numbers for comparison: "008", "8" and "4/102" → same
 *  form; "OP01-003" and alt's dashless "OP01003" → same form. */
function normalizeNumber(n: string): string {
  const first = n.split('/')[0].trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return first.replace(/^0+(?=\d)/, '')
}

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/** Fraction (0..1) of the query set-name's tokens found in the candidate's
 *  set/brand text. Token-overlap rather than exact string match so "Base
 *  Set" matches a candidate brand of "1999 Pokemon Base Set Unlimited". */
function setOverlapScore(want: string | undefined, candidate: string | null): number {
  if (!want || !candidate) return 0
  const wantTokens = normalizeTokens(want)
  if (wantTokens.length === 0) return 0
  const candTokens = new Set(normalizeTokens(candidate))
  const hits = wantTokens.filter(t => candTokens.has(t)).length
  return hits / wantTokens.length
}

/** alt has no explicit language field; sniff it from the brand/name text.
 *  Good enough for the EN/JP split that actually matters for reprint
 *  collisions — alt's category buckets don't separate them. */
function detectLanguage(v: AltValuation): 'english' | 'japanese' {
  const text = `${v.brand ?? ''} ${v.name ?? ''}`.toLowerCase()
  return /japan/.test(text) ? 'japanese' : 'english'
}

function wantedLanguage(slab: SlabQuery): 'english' | 'japanese' {
  if (slab.language) return slab.language
  return slab.game === 'pokemon-japan' ? 'japanese' : 'english'
}

/** alt's altValueConfidenceMetric is roughly 0-100 in observed fixtures
 *  (30 = thin comp data, 60-80 = healthy). Below this, flag the pick. */
const ALT_CONFIDENCE_LOW_THRESHOLD = 50

/** Score margin below which the top two candidates are considered tied
 *  (i.e. no discriminator meaningfully separated them). */
const TIE_MARGIN = 1

function scoreCandidate(
  v: AltValuation,
  slab: SlabQuery,
  anyExactYear: boolean,
  wantLang: 'english' | 'japanese',
): number {
  let score = 0

  // Set name: token overlap, weighted heavily — this is the primary
  // reprint-collision discriminator alongside year.
  score += setOverlapScore(slab.setName, v.brand) * 4

  // Year: exact match is strong; a contradicting year is a strong
  // negative (this is what keeps Base Set '99 and Celebrations '21 apart).
  // ±1 tolerance only applies when no candidate in the pool matches
  // exactly — a reissue a year off is more plausible than a reprint 20+
  // years off, but never let sloppy tolerance beat an exact hit.
  if (slab.year != null && v.year != null) {
    if (v.year === slab.year) score += 5
    else if (!anyExactYear && Math.abs(v.year - slab.year) === 1) score += 2
    else score -= 5
  }

  // Language: default English unless the query (or game='pokemon-japan')
  // says otherwise. A Japanese candidate must not outrank an English one
  // for an English/unspecified query when an English candidate exists —
  // achieved by scoring language match/mismatch symmetrically.
  score += detectLanguage(v) === wantLang ? 3 : -3

  // Variety: 1st Edition vs Unlimited, Shadowless, Holo/Reverse.
  if (slab.variant) {
    const wantTokens = normalizeTokens(slab.variant)
    const candTokens = v.variety ? normalizeTokens(v.variety) : []
    const overlap = wantTokens.length > 0 && wantTokens.every(t => candTokens.includes(t))
    if (overlap) score += 2
    else if (v.variety) score -= 1
  }

  // Small tiebreak nudge from alt's own confidence metric — never enough
  // to override an identity signal above.
  if (v.confidence != null) score += v.confidence / 1000

  return score
}

export interface AltMatchResult {
  valuation: AltValuation | null
  lowConfidence: boolean
  /** e.g. 'identity_weak', 'alt_low_confidence' */
  reasons: string[]
}

/**
 * Pick the valuation that best matches the slab, and report how
 * confident that pick is. Card number is a hard filter when given
 * (returns null rather than guess if nothing carries it); among number
 * matches — or the whole set when no number was given — candidates are
 * scored on set name, year, language and variety to resolve reprint
 * collisions (same name+number reissued under a different set/year).
 */
export function matchValuation(valuations: AltValuation[], slab: SlabQuery): AltMatchResult {
  if (valuations.length === 0) return { valuation: null, lowConfidence: false, reasons: [] }

  let pool = valuations
  if (slab.cardNumber) {
    const wanted = normalizeNumber(slab.cardNumber)
    pool = valuations.filter(v => v.cardNumber && normalizeNumber(v.cardNumber) === wanted)
    if (pool.length === 0) return { valuation: null, lowConfidence: false, reasons: [] }
  }

  const anyExactYear = slab.year != null && pool.some(v => v.year === slab.year)
  const wantLang = wantedLanguage(slab)

  const scored = pool
    .map(v => ({ v, score: scoreCandidate(v, slab, anyExactYear, wantLang) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const runnerUp = scored[1]

  const reasons: string[] = []
  const hasDiscriminator = Boolean(slab.setName || slab.year != null || slab.variant)
  const closeCall = runnerUp != null && best.score - runnerUp.score < TIE_MARGIN
  if (!slab.cardNumber && (!hasDiscriminator || closeCall)) reasons.push('identity_weak')
  if (best.v.confidence != null && best.v.confidence < ALT_CONFIDENCE_LOW_THRESHOLD) {
    reasons.push('alt_low_confidence')
  }

  return { valuation: best.v, lowConfidence: reasons.length > 0, reasons }
}

/** Convenience wrapper over matchValuation for callers that only need the
 *  picked valuation. See matchValuation for confidence signals. */
export function pickValuation(valuations: AltValuation[], slab: SlabQuery): AltValuation | null {
  return matchValuation(valuations, slab).valuation
}
