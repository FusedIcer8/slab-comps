export type Grader = 'PSA' | 'BGS' | 'CGC' | 'SGC' | 'TAG'

/** Game keys match tcg-manager-v3's game identifiers. */
export type Game =
  | 'pokemon'
  | 'pokemon-japan'
  | 'onepiece'
  | 'yugioh'
  | 'mtg'
  | 'lorcana'
  | 'gundam'
  | 'riftbound'
  | 'dragonball'

export interface SlabQuery {
  game: Game
  cardName: string
  /** Printed number, e.g. "4/102", "OP01-001", "SDK-001" */
  cardNumber?: string
  setName?: string
  grader: Grader
  /** Numeric grade as printed: "10", "9.5", "9" */
  grade: string
  /** Print year, e.g. 1999. Critical for reprint collisions (same card
   *  name + number reissued in a different set/year — Base Set Charizard
   *  4/102 vs the 2021 Celebrations Classic Collection reprint). */
  year?: number
  /** Defaults to 'english' when omitted, except for game 'pokemon-japan'
   *  where it defaults to 'japanese'. */
  language?: 'english' | 'japanese'
  /** Print variety, e.g. "1st Edition", "Unlimited", "Shadowless", "Holo",
   *  "Reverse Holo". Matched against alt's `variety` field loosely. */
  variant?: string
}

/** One sold transaction scraped from 130point (eBay solds). */
export interface SoldComp {
  title: string
  url: string | null
  price: number
  currency: string
  /** ISO date */
  date: string | null
  saleType: string | null
}

export interface CompSummary {
  /** Median of kept comps after outlier trim */
  median: number
  count: number
  low: number
  high: number
  comps: SoldComp[]
  /** Non-USD rows dropped from the summary (no FX conversion is performed). */
  excludedNonUsd: number
}

/** Alt's model valuation for an asset+grade (shown as "LT Value" on alt.xyz). */
export interface AltValuation {
  altValue: number
  lowerBound: number | null
  upperBound: number | null
  /** alt's `altValueConfidenceMetric`, roughly 0-100. */
  confidence: number | null
  assetId: string | null
  brand: string | null
  subject: string | null
  cardNumber: string | null
  gradeKey: string | null
  /** Print year, when alt has it. */
  year: number | null
  /** Print variety, e.g. "1st Edition", "Unlimited". */
  variety: string | null
  /** Full item name/description, used for language/edition disambiguation. */
  name: string | null
}

export interface CardPop {
  gradingCompany: string
  gradeNumber: string
  count: number
}

/** Tuning knobs for the cross-source disagreement guard. See getSlabComps. */
export interface GetSlabCompsOptions {
  /** alt-vs-130point ratio beyond which sources are flagged as disagreeing. Default 3. */
  disagreementRatio?: number
  /** Backing sample size below which a source is flagged thin. Default 3. */
  minSample?: number
}

export interface SlabCompsResult {
  query: SlabQuery
  alt: {
    valuation: AltValuation
    pops: CardPop[]
    /** True when the identity match backing this valuation was ambiguous
     *  or alt's own confidence metric was low. See `reasons`. */
    lowConfidence: boolean
    reasons: string[]
  } | null
  point130: CompSummary | null
  /** Best available single number: alt.altValue, else 130point median. */
  recommended: { value: number; source: 'alt' | '130point'; sampleSize: number } | null
  /** True when `reasons` is non-empty; see reasons for machine-readable causes. */
  lowConfidence: boolean
  /** e.g. 'sources_disagree', 'thin_sample', 'identity_weak', 'alt_low_confidence'. */
  reasons: string[]
  errors: string[]
}
