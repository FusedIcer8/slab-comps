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

/** Tokens that mark a DIFFERENT edition/printing than what the token they
 *  ride along with implies — "Base Set" and "Base Set 2" share both of the
 *  query's tokens, but "2" names a real, different, later expansion. Also
 *  covers "1st"/"Shadowless" riding along in a candidate's brand text for
 *  the same reason: an unrequested edition marker on the candidate is a
 *  signal it's a more specific (and possibly wrong) product than asked for. */
const EDITION_MARKER_TOKENS = new Set(['1st', 'first', 'shadowless', '2', 'ii'])
const EDITION_TOKEN_PENALTY = 0.5

/** alt's own `brand` facet text sometimes doesn't match the set name a
 *  human (or this library's own README/CLI) would naturally pass.
 *  Verified LIVE against alt's real typesense index (2026-09-20, via
 *  `node dist/cli.js --game pokemon --name Charizard --number 4/102
 *  --grader PSA --grade 9 --year 1999`): the genuine 1999 Base Set
 *  Charizard's `brand` is literally "Pokemon Game", not "Base Set" — a
 *  caller passing setName:"Base Set" would otherwise score 0 overlap
 *  against the CORRECT candidate. Applied to both sides of the compare,
 *  so a query that itself says "Pokemon Game" also still matches. Add
 *  further entries only once verified the same way — do not guess. */
const SET_NAME_ALIASES: Array<[RegExp, string]> = [[/\bpokemon\s*game\b/i, 'base set']]

function applySetAliases(s: string): string {
  return SET_NAME_ALIASES.reduce((out, [re, canonical]) => out.replace(re, canonical), s)
}

/** Known reprint families where token overlap alone CANNOT separate the
 *  two real, differently-valued products — verified live (2026-09-20):
 *  alt's brand text for the 2021 Celebrations Classic Collection reprint
 *  is "...Celebrations Classic Collection Base Set" (contains "Base Set"
 *  itself), so after SET_NAME_ALIASES resolves "Pokemon Game" -> "base
 *  set", a query for the genuine original scores a FULL, tied overlap
 *  against both the real 1999 card and the reprint. Mirrors
 *  REPRINT_FAMILIES in src/point130/comps.ts (title text there, brand
 *  text here) — add further verified families to both. */
const REPRINT_FAMILIES: Array<{ original: RegExp; reprint: RegExp }> = [
  { original: /\bbase\s*set\b/i, reprint: /\b(celebrations|classic collection|25th)\b/i },
]
const REPRINT_CONTRADICTION_PENALTY = 6

/** Fraction (0..1) of the query set-name's tokens found in the candidate's
 *  set/brand text, minus a small penalty per unrequested edition-marker
 *  token on the candidate side (see EDITION_MARKER_TOKENS) — a full token
 *  overlap must not score identically against a same-named-but-different
 *  product ("Base Set" vs "Base Set 2"). Also rejects (heavily penalizes)
 *  a known reprint-family mismatch even when token overlap alone would
 *  tie — see REPRINT_FAMILIES. */
function setOverlapScore(want: string | undefined, candidate: string | null): number {
  if (!want || !candidate) return 0
  const aliasedWant = applySetAliases(want)
  const wantTokens = normalizeTokens(aliasedWant)
  if (wantTokens.length === 0) return 0
  const wantSet = new Set(wantTokens)
  const candTokens = normalizeTokens(applySetAliases(candidate))
  const candSet = new Set(candTokens)
  const hits = wantTokens.filter(t => candSet.has(t)).length
  const overlap = hits / wantTokens.length
  const extraEditionTokens = candTokens.filter(t => EDITION_MARKER_TOKENS.has(t) && !wantSet.has(t))
  let score = overlap - extraEditionTokens.length * EDITION_TOKEN_PENALTY

  for (const fam of REPRINT_FAMILIES) {
    const wantsOriginal = fam.original.test(aliasedWant) && !fam.reprint.test(want)
    const wantsReprint = fam.reprint.test(want)
    if (wantsOriginal && fam.reprint.test(candidate)) score -= REPRINT_CONTRADICTION_PENALTY
    if (wantsReprint && fam.original.test(candidate) && !fam.reprint.test(candidate)) {
      score -= REPRINT_CONTRADICTION_PENALTY
    }
  }
  return score
}

/** alt has no explicit language field; sniff it from the brand/name text.
 *  Good enough for the EN/JP split that actually matters for reprint
 *  collisions — alt's category buckets don't separate them. */
function detectLanguage(v: AltValuation): 'english' | 'japanese' {
  const text = `${v.brand ?? ''} ${v.name ?? ''}`.toLowerCase()
  return /\b(japan(ese)?|jpn|jp)\b/.test(text) ? 'japanese' : 'english'
}

function wantedLanguage(slab: SlabQuery): 'english' | 'japanese' {
  if (slab.language) return slab.language
  return slab.game === 'pokemon-japan' ? 'japanese' : 'english'
}

/** alt's altValueConfidenceMetric is roughly 0-100 in observed fixtures
 *  (30 = thin comp data, 60-80 = healthy). Below this, flag the pick.
 *  NOTE: this is a REPORTING signal only (see 'alt_low_confidence' below)
 *  — it is never used to influence which candidate is picked (see
 *  scoreCandidate: confidence deliberately does not appear there). */
const ALT_CONFIDENCE_LOW_THRESHOLD = 50

/** Score margin below which the top two candidates are considered tied
 *  (i.e. no discriminator meaningfully separated them). */
const TIE_MARGIN = 1

/** A candidate's variety "tier" for the no-variant-given tiebreak: an
 *  unmarked/"Unlimited" print is the common, lower-value default (tier 0);
 *  anything with a specific named edition (1st Edition, Shadowless, ...)
 *  is a more specific, usually pricier product (tier 1). Never guess
 *  toward the pricier tier when nothing asked for it. */
function varietyTier(v: AltValuation): 0 | 1 {
  const norm = (v.variety ?? '').trim().toLowerCase()
  return norm === '' || norm === 'unlimited' ? 0 : 1
}

function scoreCandidate(
  v: AltValuation,
  slab: SlabQuery,
  anyExactYear: boolean,
  wantLang: 'english' | 'japanese',
): number {
  let score = 0

  // Set name: token overlap (minus edition-marker penalty), weighted
  // heavily — this is the primary reprint-collision discriminator
  // alongside year, and must outweigh language (see language, below).
  const SET_WEIGHT = 4
  score += setOverlapScore(slab.setName, v.brand) * SET_WEIGHT

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
  // says otherwise. Deliberately capped well below SET_WEIGHT — this is a
  // tiebreak, not a real identity signal, so it must never be able to
  // outweigh a genuine set match (a Japan-exclusive set correctly matched
  // must not lose to a same-numbered English card from the wrong set).
  const LANGUAGE_WEIGHT = 1
  score += detectLanguage(v) === wantLang ? LANGUAGE_WEIGHT : -LANGUAGE_WEIGHT

  // Variety: 1st Edition vs Unlimited, Shadowless, Holo/Reverse — only
  // scored when the query actually specifies one; otherwise varieties are
  // resolved by the deterministic tiebreak in matchValuation, never here.
  if (slab.variant) {
    const wantTokens = normalizeTokens(slab.variant)
    const candTokens = v.variety ? normalizeTokens(v.variety) : []
    const overlap = wantTokens.length > 0 && wantTokens.every(t => candTokens.includes(t))
    if (overlap) score += 2
    else if (v.variety) score -= 1
  }

  return score
}

export interface AltMatchResult {
  valuation: AltValuation | null
  lowConfidence: boolean
  /** 'identity_weak' | 'variety_ambiguous' | 'alt_low_confidence' */
  reasons: string[]
}

/** Deterministic, conservative tiebreak among candidates that scored
 *  within TIE_MARGIN of each other (real identity signals didn't separate
 *  them): when no variant was requested, prefer the empty/Unlimited
 *  variety tier over a named premium edition; failing that (or when a
 *  variant WAS requested but candidates still tie), take the LOWEST
 *  value — overpaying is the costly direction of a wrong guess, never
 *  the highest. A final, stable fallback (assetId, then array order)
 *  keeps the result reproducible across input order. */
function pickFromTieGroup(
  group: Array<{ v: AltValuation; score: number }>,
  slab: SlabQuery,
): AltValuation {
  if (group.length === 1) return group[0].v
  const sorted = [...group].sort((a, b) => {
    if (!slab.variant) {
      const tierDiff = varietyTier(a.v) - varietyTier(b.v)
      if (tierDiff !== 0) return tierDiff
    }
    if (a.v.altValue !== b.v.altValue) return a.v.altValue - b.v.altValue
    return (a.v.assetId ?? '').localeCompare(b.v.assetId ?? '')
  })
  return sorted[0].v
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

  const topScore = scored[0].score
  // Everyone within TIE_MARGIN of the top score — real identity signals
  // (set/year/language/variant) didn't meaningfully separate them. This
  // check applies regardless of whether a card number was given: a
  // number narrows the pool but says nothing about which VARIETY within
  // that number is correct (the live-path bug this fixes — the
  // consuming app rarely passes year/variant, so this tie is common).
  const tieGroup = scored.filter(s => topScore - s.score < TIE_MARGIN)

  const best = pickFromTieGroup(tieGroup, slab)

  const reasons: string[] = []
  if (tieGroup.length > 1) {
    reasons.push('identity_weak')
    if (!slab.variant) {
      const varieties = new Set(tieGroup.map(s => (varietyTier(s.v) === 0 ? '' : (s.v.variety ?? '').trim().toLowerCase())))
      const values = tieGroup.map(s => s.v.altValue)
      const spread = Math.max(...values) / Math.max(Math.min(...values), 1e-9)
      if (varieties.size > 1 && spread > 1.5) reasons.push('variety_ambiguous')
    }
  }

  // The picked candidate itself may simply be wrong even with no tie —
  // e.g. it's the only number match, but it contradicts every other
  // discriminator the query actually supplied (wrong set AND wrong year).
  const givenChecks: boolean[] = []
  if (slab.setName) givenChecks.push(setOverlapScore(slab.setName, best.brand) <= 0)
  if (slab.year != null) givenChecks.push(best.year !== slab.year)
  if (givenChecks.length > 0 && givenChecks.every(Boolean)) reasons.push('identity_weak')

  if (best.confidence != null && best.confidence < ALT_CONFIDENCE_LOW_THRESHOLD) {
    reasons.push('alt_low_confidence')
  }

  const uniqueReasons = Array.from(new Set(reasons))
  return { valuation: best, lowConfidence: uniqueReasons.length > 0, reasons: uniqueReasons }
}

/** Convenience wrapper over matchValuation for callers that only need the
 *  picked valuation. See matchValuation for confidence signals. */
export function pickValuation(valuations: AltValuation[], slab: SlabQuery): AltValuation | null {
  return matchValuation(valuations, slab).valuation
}
