import type { CompSummary, SlabQuery, SoldComp } from '../types.js'

/** Tokens that indicate a multi-card lot — never a single-slab comp.
 *  Two independent shapes:
 *   - word/phrase tokens ("lot", "bundle", "collection of", "and others",
 *     "+ more")
 *   - digit-adjacent "x" counts ("4x") — a bare digit count, not
 *     card-mechanic suffixes like "EX"/"GX"/"VMAX"/"Charizard X"/"Mega
 *     Charizard X" (no digit directly glued to the "x") or set names like
 *     "XY Evolutions"/"Pokemon X & Y" (no digit attached either). The
 *     "x then digits" side intentionally requires NO whitespace — "Mega
 *     Charizard X 029 Promo" has a space between the mechanic suffix "X"
 *     and the card number, which must NOT read as an "x029" lot count. */
const LOT_WORD_RE = /\b(lot|bundle|collection of|and others)\b|\+\s*more\b/i
const LOT_COUNT_RE = /\bx\d+\b|\b\d+\s?x\b/i
const isLot = (title: string): boolean => LOT_WORD_RE.test(title) || LOT_COUNT_RE.test(title)

/** A "+ PSA"/"& PSA" marker between two cards — "Pikachu 234/091 + PSA
 *  10 Charizard VMAX 020/189 PSA 10" — is a two-card combo listing, never
 *  a single-slab comp, the same as isLot (minor (e)). */
const MULTI_CARD_MARKER_RE = /[+&]\s*psa\b/i

/** A title carrying TWO OR MORE distinct printed numerator/denominator
 *  numbers is a multi-card listing even without an explicit "+"/"&"
 *  marker — each card in a combo prints its own number. */
function hasMultipleDistinctNumbers(title: string): boolean {
  const matches = Array.from(title.matchAll(/\b\d+\s*\/\s*\d+\b/g)).map(m => m[0].replace(/\s+/g, ''))
  return new Set(matches).size > 1
}

const isMultiCardListing = (title: string): boolean =>
  MULTI_CARD_MARKER_RE.test(title) || hasMultipleDistinctNumbers(title)

/** Generic words that appear in TCGplayer catalog set names but never
 *  meaningfully discriminate an eBay listing title ("Pokemon", "Set",
 *  "Cards", ...). Deliberately conservative — only words this library has
 *  verified are noise, not an exhaustive stopword list. */
const SET_STOPWORDS = new Set(['pokemon', 'the', 'set', 'cards', 'card', 'and', 'tcg'])

/** TCGplayer catalog set-code prefixes ("SV", "SWSH03", "SM", "XY", ...) —
 *  these never appear in eBay listing titles verbatim and must not be
 *  treated as a required/distinctive set-name word. */
const SET_CODE_PREFIX_RE = /^(sv|swsh|sm|xy|bw|dp|hgss|ex)\d*$/i

/** Words that recur across MANY different real set names ("Promo",
 *  "Collection", "Fates" — Hidden Fates vs Shining Fates; "Base" — Base
 *  Set vs Base Set 2; "Vault" — Shining Fates: Shiny Vault vs other
 *  vault-style subsets) and so, alone, cannot discriminate one set from
 *  another. Distinct from SET_STOPWORDS (words that never mean anything
 *  at all) — these DO belong to the set name, they're just not unique
 *  enough on their own to accept a title on. See distinctiveSetTokens'
 *  "require every NON-generic token" rule below.
 *
 *  Also includes ERA words (scarlet, violet, sword, shield, sun, moon,
 *  white — "black" was already here) — minor (b): requiring these as
 *  MANDATORY dropped genuine, correctly-abbreviated titles ("SWSH Promo",
 *  "S&S Promo", "Charizard ex 151 SIR" — none spell the era out), while
 *  accepting them as sufficient on their own let a wrong same-era title
 *  through ("Sword & Shield Promo" turned out to be a different, real
 *  JPN starter-set product, not proof of the SWSH Black Star Promo
 *  subset). See codePrefixEvidence for the positive-evidence fallback
 *  this creates for era-only set names. */
const GENERIC_SET_TOKENS = new Set([
  'promo', 'promos', 'collection', 'classic', 'fates', 'base', 'shiny',
  'star', 'black', 'cards', 'series', 'pack', 'premium', 'vault', 'special',
  'scarlet', 'violet', 'sword', 'shield', 'sun', 'moon', 'white',
])

/** Tokenize a catalog set name into the words that could plausibly appear
 *  in an eBay title and actually mean something: split on any non-
 *  alphanumeric run (handles "SV: Scarlet & Violet 151", "SWSH03:
 *  Darkness Ablaze", "Shining Fates: Shiny Vault"), then drop stopwords
 *  and code prefixes. Keeps single-digit tokens ("2" in "Base Set 2") —
 *  short but meaningful, unlike a single stray letter. */
function distinctiveSetTokens(setName: string): string[] {
  return setName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(t => t.length > 1 || /^\d$/.test(t))
    .filter(t => !SET_STOPWORDS.has(t))
    .filter(t => !SET_CODE_PREFIX_RE.test(t))
}

/** The subset of distinctive tokens that actually discriminate this set
 *  from others (see GENERIC_SET_TOKENS). Unlike nonGenericSetTokens
 *  (below), this does NOT fall back to the full token list when nothing
 *  survives — an empty result here is the signal that the set name is
 *  made entirely of era/generic words (e.g. "SWSH: Sword & Shield Promo
 *  Cards") and needs the codePrefixEvidence fallback instead of a
 *  spelled-out word requirement. */
function significantSetTokens(tokens: string[]): string[] {
  return tokens.filter(t => !GENERIC_SET_TOKENS.has(t))
}

/** Same as significantSetTokens but falls back to every distinctive
 *  token when nothing survives — used by the "at least one" rescue path
 *  (a card NUMBER was already given and matched; this is a weaker,
 *  supporting check, not the primary set discriminator), where requiring
 *  literally nothing would be wrong. */
function nonGenericSetTokens(tokens: string[]): string[] {
  const nonGeneric = significantSetTokens(tokens)
  return nonGeneric.length > 0 ? nonGeneric : tokens
}

/** Verified real-world abbreviations for a catalog code prefix that
 *  otherwise wouldn't be recognized in eBay title text ("S&S" for
 *  Sword & Shield). Add further entries only once verified — do not
 *  guess. Every prefix also matches its own bare form as a fallback
 *  (built in codePrefixEvidence), including as a PREFIX of a glued card
 *  number ("SWSH045") — "S&S"/other spelled-out aliases require a full
 *  word boundary since they're never glued to a number that way. */
const CODE_PREFIX_ALIASES: Record<string, RegExp> = {
  swsh: /\bs\s*&\s*s\b/i,
}

/** When a catalog set name is made ENTIRELY of era/generic words (no
 *  distinctive word can discriminate it — see significantSetTokens),
 *  sellers still identify it by its catalog CODE PREFIX ("SWSH", "S&S")
 *  rather than spelling the era out. Returns a regex matching that
 *  prefix (bare, or as the head of a glued card number like "SWSH045")
 *  or a verified alias, or null when the set name has no code prefix at
 *  all to fall back on. */
function codePrefixEvidence(setName: string): RegExp | null {
  const tokens = setName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const prefixToken = tokens.find(t => SET_CODE_PREFIX_RE.test(t))
  const letters = prefixToken?.match(/^[a-z]+/)?.[0]
  if (!letters) return null
  const alias = CODE_PREFIX_ALIASES[letters]
  const escaped = letters.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const base = new RegExp(`\\b${escaped}`, 'i') // no trailing \b — matches "SWSH045" too
  return alias ? new RegExp(`${base.source}|${alias.source}`, 'i') : base
}

function titleContainsToken(titleLower: string, token: string): boolean {
  return new RegExp(`\\b${token}\\b`, 'i').test(titleLower)
}

/** Extract a "numerator/denominator" printed number ("199/165") as two
 *  numbers, tolerant of leading zeros. Null for numerator-only or
 *  dashed set-code numbers ("OP01-003"), which don't carry a denominator. */
function numberDenominator(cardNumber: string | undefined): { num: number; den: number } | null {
  if (!cardNumber) return null
  const m = cardNumber.match(/^0*(\d+)\s*\/\s*0*(\d+)$/)
  if (!m) return null
  return { num: Number(m[1]), den: Number(m[2]) }
}

function titleHasNumberWithDenominator(title: string, num: number, den: number): boolean {
  const re = new RegExp(`(?<!\\d)#?0*${num}\\s*/\\s*0*${den}(?!\\d)`)
  return re.test(title)
}

/** Extract a letter-prefixed printed number ("SWSH050", "TG15", "GG70",
 *  "SV107", "SM210", "XY17", "H4") as a prefix+digits pair, tolerant of
 *  leading zeros. This kind of number identifies its set on its own — no
 *  other card shares "SWSH050". Only the numerator side is used (a
 *  "SV107/SV122"-style range form's denominator is dropped, same as
 *  buildNumberMatcher already does for the NUMBER match itself), so this
 *  also covers that range form via its numerator. */
function prefixedNumberInfo(cardNumber: string | undefined): { prefix: string; digits: number } | null {
  if (!cardNumber) return null
  const printed = cardNumber.split('/')[0].trim()
  const m = printed.match(/^([A-Za-z]+)-?0*(\d+)$/)
  if (!m) return null
  return { prefix: m[1], digits: Number(m[2]) }
}

function titleHasPrefixedNumber(title: string, prefix: string, digits: number): boolean {
  const re = new RegExp(`\\b${prefix}[-\\s]?0*${digits}\\b`, 'i')
  return re.test(title)
}

/** Known reprint families where the SAME printed number+denominator is
 *  reused across two real, differently-valued products — a denominator
 *  match alone must never disambiguate these; only an explicit set-name
 *  marker in the title can. Verified case: Base Set (1999) vs the 2021
 *  Celebrations Classic Collection reprint, which shares Base Set's
 *  numbering (and, per alt.xyz's own brand text, often even the literal
 *  words "Base Set" in its description). Add further verified families
 *  here — do not add unverified ones.
 *
 *  `reprintStrong` (celebrations, classic collection) unambiguously means
 *  this specific reprint. `reprintWeak` ("25th") is too loose to trust
 *  alone — genuine, unrelated JP/KR 25th Anniversary promos also carry
 *  it — so it only counts as evidence for a title when paired with a
 *  matching number+denominator for THAT title (minor (a)). */
const REPRINT_FAMILIES: Array<{ original: RegExp; reprintStrong: RegExp; reprintWeak: RegExp }> = [
  {
    original: /\bbase\s*set\b/i,
    reprintStrong: /\b(celebrations|classic collection)\b/i,
    reprintWeak: /\b25th\b/i,
  },
]

/** A title naming a DIFFERENT known Pokemon product than the plain
 *  original the query asked for — the same idea as the alt matcher's
 *  EDITION_MARKER_TOKENS penalty (src/alt/match.ts), applied to title
 *  text: Base Set 2 (2000) and Legendary Collection (2002) are real,
 *  different, later sets that also carry low card numbers overlapping
 *  Base Set's own. Deliberately does NOT include a "Base ... Unlimited"
 *  pattern — that is ALSO the correct, legitimate way to title a genuine
 *  Base Set Unlimited-print listing, so a blanket rule there would
 *  reject real matches; see minor (d) in CHANGELOG for this call. */
const BASE_SET_TITLE_CONTRADICTION_RE = /\bbase\s*set\s*2\b|\blegendary\s*collection\b/i

/** True when the query's setName matches a known reprint family's REPRINT
 *  side (e.g. "Celebrations: Classic Collection"), by either marker. For
 *  such a query, a title must carry `reprintStrong` outright, or
 *  `reprintWeak` alongside a confirmed matching number — a shared/
 *  matching denominator alone (or even the ORIGINAL side's own wording,
 *  like "Base Set", which the reprint's own listings often also carry)
 *  is never enough on its own; too many genuinely-original, unmarked
 *  titles ("1999 Pokemon Charizard Holo 4/102 PSA 10") otherwise slip
 *  through and push a reprint-price offer up toward the original's far
 *  higher value. */
function reprintFamilyQuery(querySetName: string): (typeof REPRINT_FAMILIES)[number] | null {
  return REPRINT_FAMILIES.find(fam => fam.reprintStrong.test(querySetName) || fam.reprintWeak.test(querySetName)) ?? null
}

/** True when the query clearly wants the ORIGINAL side of a known reprint
 *  family and the title clearly reads as the reprint — checked regardless
 *  of how the generic token/denominator checks below would otherwise
 *  score the row, because a shared denominator (or shared "Base Set"
 *  wording) is exactly what makes these collisions dangerous. The
 *  reverse direction (query wants the reprint) is handled by
 *  reprintFamilyQuery instead, which requires the marker outright rather
 *  than merely rejecting a contradiction — see N1. */
function isReprintContradiction(querySetName: string, title: string): boolean {
  for (const fam of REPRINT_FAMILIES) {
    const wantsOriginal =
      fam.original.test(querySetName) && !fam.reprintStrong.test(querySetName) && !fam.reprintWeak.test(querySetName)
    if (wantsOriginal && fam.reprintStrong.test(title)) return true
  }
  return false
}

/** Only count a year token that's clearly THE print year, not an
 *  incidental 4-digit run elsewhere in the title (PSA cert numbers,
 *  serials, ...): either leading the title (the overwhelmingly common
 *  eBay convention, "1999 Pokemon Base Set Charizard...") or immediately
 *  adjacent to "Pokemon" or a distinctive set-name word. */
function extractRelevantYears(title: string, setName: string | undefined): string[] {
  const found: string[] = []
  const leading = title.match(/^\s*((?:19|20)\d{2})\b/)
  if (leading) found.push(leading[1])

  const anchors = ['pokemon', ...(setName ? distinctiveSetTokens(setName) : [])]
  for (const anchor of anchors) {
    const re = new RegExp(`\\b((?:19|20)\\d{2})\\s+${anchor}\\b|\\b${anchor}\\s+((?:19|20)\\d{2})\\b`, 'gi')
    for (const m of title.matchAll(re)) {
      const y = m[1] ?? m[2]
      if (y) found.push(y)
    }
  }
  return found
}

/**
 * Keep only rows that plausibly ARE the queried slab:
 * title must mention the grader, the exact grade, every word of the card
 * name, and the card number when one was given. eBay titles are noisy —
 * false positives (wrong grade, lots, different variants) cost real money
 * in a buy offer, so this errs toward dropping rows.
 */
export function filterComps(comps: SoldComp[], slab: SlabQuery): SoldComp[] {
  const gradeRe = new RegExp(
    `\\b${slab.grader}\\b[\\s:-]*${slab.grade.replace('.', '\\.')}(?!\\.?\\d)`,
    'i',
  )
  // Short alnum suffix words (V, X, GX, EX, ...) are kept (not dropped as
  // "too short") and matched on a word boundary rather than substring —
  // otherwise "Charizard V" silently accepts a "Charizard VMAX" title
  // (V is a substring of VMAX) or a plain "Charizard" title (V dropped
  // entirely). Longer/punctuated words keep simple substring matching.
  const nameWords = slab.cardName.toLowerCase().split(/\s+/).filter(Boolean)
  const nameWordMatches = (t: string, w: string): boolean =>
    w.length <= 2 && /^[a-z0-9]+$/.test(w) ? new RegExp(`\\b${w}\\b`, 'i').test(t) : t.includes(w)

  // "008" must match "#008", "008" and "8", but never digits inside a
  // longer number ("2008"). Set-code numbers ("OP01-003") appear in eBay
  // titles split apart ("OP-01 … #003"), so match prefix and numeric tail
  // independently.
  const numberMatches = buildNumberMatcher(slab.cardNumber)
  const distinctiveTokens = slab.setName ? distinctiveSetTokens(slab.setName) : []
  const denom = numberDenominator(slab.cardNumber)
  const prefixed = prefixedNumberInfo(slab.cardNumber)
  const reprintFam = slab.setName ? reprintFamilyQuery(slab.setName) : null

  return comps.filter(c => {
    const t = c.title.toLowerCase()
    if (isLot(c.title)) return false
    if (isMultiCardListing(c.title)) return false // minor (e)
    if (!gradeRe.test(c.title)) return false
    if (!nameWords.every(w => nameWordMatches(t, w))) return false
    // Each identity signal the caller actually gave is independently
    // required — AND, not OR. Giving both a number and a set name must
    // only ever narrow the accepted rows, never widen them past what
    // either alone would accept.
    if (numberMatches && !numberMatches(c.title)) return false

    if (slab.setName) {
      // The printed number WITH its denominator ("199/165"), or a
      // letter-prefixed number ("SWSH050") matched literally, is
      // specific enough to a set that it satisfies the set requirement
      // on its own — eBay titles very often carry the number but not
      // the set name.
      const numberSatisfiesSet =
        (denom != null && titleHasNumberWithDenominator(c.title, denom.num, denom.den)) ||
        (prefixed != null && titleHasPrefixedNumber(c.title, prefixed.prefix, prefixed.digits))

      if (reprintFam) {
        // The query wants the REPRINT side of a known family (e.g.
        // "Celebrations: Classic Collection") — the title must carry the
        // strong marker outright, or the weak "25th" marker alongside a
        // number that's actually confirmed for THIS title (minor (a) —
        // bare "25th" alone also names real, unrelated 25th Anniversary
        // promos). A shared/matching denominator with no marker at all
        // (or even the ORIGINAL side's own wording, which reprint
        // listings often also carry) is never enough — too many
        // genuinely-original, unmarked titles otherwise slip through and
        // inflate a reprint quote toward the original's far higher value
        // (money moves the wrong way). See N1.
        const hasStrongMarker = reprintFam.reprintStrong.test(c.title)
        const hasWeakMarker = reprintFam.reprintWeak.test(c.title) && numberSatisfiesSet
        if (!hasStrongMarker && !hasWeakMarker) return false
      } else {
        // A known reprint-family contradiction rejects outright (query
        // wants the ORIGINAL side, title reads as the reprint).
        if (isReprintContradiction(slab.setName, c.title)) return false
        // The title names a different known product entirely (minor (d):
        // "Base Set 2", "Legendary Collection") — but only when the QUERY
        // itself isn't ALSO one of those (a query that's genuinely for
        // "Base Set 2" must not reject its own titles).
        if (
          REPRINT_FAMILIES.some(fam => fam.original.test(slab.setName!)) &&
          !BASE_SET_TITLE_CONTRADICTION_RE.test(slab.setName) &&
          BASE_SET_TITLE_CONTRADICTION_RE.test(c.title)
        ) {
          return false
        }

        if (!numberSatisfiesSet) {
          if (slab.cardNumber) {
            // A number WAS given, just not one that (via this title)
            // confirms the set on its own — the independent number-match
            // check above already did real narrowing. Require the MOST
            // distinctive tokens available (every one — era/generic words
            // stripped, minor (b)/(c)): a single coincidentally-matching
            // era word ("scarlet"/"violet") let a wrong same-era, wrong-
            // set title through ("#199 Scarlet Violet Paldea Evolved" for
            // a "151" query) when this used to accept on just one token.
            const rescue = nonGenericSetTokens(distinctiveTokens)
            if (rescue.length > 0 && !rescue.every(tok => titleContainsToken(t, tok))) {
              return false
            }
          } else {
            // No number at all to lean on.
            const required = significantSetTokens(distinctiveTokens)
            if (required.length > 0) {
              // At least one genuinely distinctive word survives era/
              // generic stripping ("151", "Darkness"/"Ablaze", ...) —
              // require every one of them (minor (b)/N2).
              if (!required.every(tok => titleContainsToken(t, tok))) return false
            } else {
              const evidence = distinctiveTokens.length > 0 ? codePrefixEvidence(slab.setName) : null
              if (evidence) {
                // The set name is made ENTIRELY of era/generic words BUT
                // has a recognizable catalog code prefix (e.g. "SWSH:
                // Sword & Shield Promo Cards") — no spelled-out word can
                // discriminate it (sellers abbreviate the era as "SWSH"/
                // "S&S" instead), so use the code prefix as positive
                // evidence, plus "promo" literally when the set name
                // itself says "promo" — the code prefix alone doesn't
                // confirm the PROMO subset specifically vs. a regular
                // numbered set card (minor (b)).
                if (!evidence.test(c.title)) return false
                const wantsPromo = distinctiveTokens.some(tok => tok === 'promo' || tok === 'promos')
                if (wantsPromo && !/\bpromos?\b/i.test(c.title)) return false
              } else if (distinctiveTokens.length > 0) {
                // Entirely generic AND no code prefix to fall back on
                // (e.g. "Special Vault Collection") — require ALL of them
                // together; individually generic, but the combination
                // still discriminates reasonably well, and requiring
                // nothing at all would be worse.
                if (!distinctiveTokens.every(tok => titleContainsToken(t, tok))) return false
              }
            }
          }
        }
      }
    }

    if (slab.year != null) {
      const titleYears = extractRelevantYears(c.title, slab.setName)
      if (titleYears.length > 0 && !titleYears.includes(String(slab.year))) return false
    }
    return true
  })
}

/** True when at least one of the given (already-filtered) comps' titles
 *  positively states the query's year (see extractRelevantYears) — as
 *  opposed to merely not contradicting it. Vacuously true when the query
 *  gives no year. Feeds the 'year_unconfirmed' reason upstream: passing
 *  the year FILTER only means nothing contradicted it, which is weaker
 *  than confirmation. */
export function yearIsConfirmed(comps: SoldComp[], slab: SlabQuery): boolean {
  if (slab.year == null) return true
  return comps.some(c => extractRelevantYears(c.title, slab.setName).includes(String(slab.year)))
}

function buildNumberMatcher(cardNumber: string | undefined): ((title: string) => boolean) | null {
  if (!cardNumber) return null
  const printed = cardNumber.split('/')[0].trim()

  if (/^\d+$/.test(printed)) {
    const re = new RegExp(`(?<!\\d)#?0*${Number(printed)}(?!\\d)`)
    return title => re.test(title)
  }

  // "OP01-003" → prefix "OP01" (dash/space optional between letters and
  // digits) + tail 3 with zero-padding tolerance
  const m = printed.match(/^([A-Za-z]+)[-\s]?0*(\d+)[-\s]0*(\d+)$/)
  if (m) {
    const prefixRe = new RegExp(`${m[1]}[-\\s]?0*${Number(m[2])}(?!\\d)`, 'i')
    const tailRe = new RegExp(`(?<!\\d)#?0*${Number(m[3])}(?!\\d)`)
    return title => prefixRe.test(title) && tailRe.test(title)
  }

  const literal = new RegExp(printed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return title => literal.test(title)
}

/** Uppercase+trim for a tolerant currency compare ("usd", " USD ", "Usd"
 *  all count). An empty/missing value is treated as UNKNOWN, not assumed
 *  USD — see summarizeComps. */
function normalizeCurrency(raw: string): string {
  return (raw ?? '').trim().toUpperCase()
}

/**
 * Median-based summary with IQR outlier trim. Trim only when we have
 * enough rows for quartiles to mean anything (>= 8); below that a bad
 * outlier can't hide anyway and the median resists it.
 *
 * Non-USD rows (GBP/EUR/CAD/...) — and rows with an empty/unrecognized
 * currency value, treated as unknown rather than assumed USD — are
 * excluded from the summary. No FX conversion is performed. They're
 * still counted, via `excludedNonUsd`.
 */
export function summarizeComps(comps: SoldComp[]): CompSummary | null {
  const usd = comps.filter(c => normalizeCurrency(c.currency) === 'USD')
  const excludedNonUsd = comps.length - usd.length
  if (usd.length === 0) return null

  const sorted = [...usd].sort((a, b) => a.price - b.price)
  let kept = sorted
  if (sorted.length >= 8) {
    const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))].price
    const iqr = q(0.75) - q(0.25)
    const lo = q(0.25) - 1.5 * iqr
    const hi = q(0.75) + 1.5 * iqr
    kept = sorted.filter(c => c.price >= lo && c.price <= hi)
  }
  if (kept.length === 0) kept = sorted

  const mid = Math.floor(kept.length / 2)
  const median =
    kept.length % 2 === 1 ? kept[mid].price : (kept[mid - 1].price + kept[mid].price) / 2

  return {
    median,
    count: kept.length,
    low: kept[0].price,
    high: kept[kept.length - 1].price,
    comps: kept,
    excludedNonUsd,
  }
}
