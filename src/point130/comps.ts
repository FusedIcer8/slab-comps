import type { CompSummary, SlabQuery, SoldComp } from '../types.js'

/** Tokens that indicate a multi-card lot — never a single-slab comp. */
const LOT_RE = /\b(lot|bundle|collection of|x\d{2,})\b/i

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
  const nameWords = slab.cardName
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1)
  // "008" must match "#008", "008" and "8", but never digits inside a
  // longer number ("2008"). Set-code numbers ("OP01-003") appear in eBay
  // titles split apart ("OP-01 … #003"), so match prefix and numeric tail
  // independently.
  const numberMatches = buildNumberMatcher(slab.cardNumber)
  const setWords = (slab.setName ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2)

  return comps.filter(c => {
    const t = c.title.toLowerCase()
    if (LOT_RE.test(c.title)) return false
    if (!gradeRe.test(c.title)) return false
    if (!nameWords.every(w => t.includes(w))) return false
    // Identity beyond the name: the printed number, or failing that every
    // set-name word. When the caller gave neither, name+grade is all we have.
    const numberOk = numberMatches ? numberMatches(c.title) : false
    const setOk = setWords.length > 0 && setWords.every(w => t.includes(w))
    if ((numberMatches || setWords.length > 0) && !numberOk && !setOk) return false
    return true
  })
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

/**
 * Median-based summary with IQR outlier trim. Trim only when we have
 * enough rows for quartiles to mean anything (>= 8); below that a bad
 * outlier can't hide anyway and the median resists it.
 */
export function summarizeComps(comps: SoldComp[]): CompSummary | null {
  if (comps.length === 0) return null

  const sorted = [...comps].sort((a, b) => a.price - b.price)
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
  }
}
