export type Grader = 'PSA' | 'BGS' | 'CGC' | 'SGC' | 'TAG';
/** Game keys match tcg-manager-v3's game identifiers. */
export type Game = 'pokemon' | 'pokemon-japan' | 'onepiece' | 'yugioh' | 'mtg' | 'lorcana' | 'gundam' | 'riftbound' | 'dragonball';
export interface SlabQuery {
    game: Game;
    cardName: string;
    /** Printed number, e.g. "4/102", "OP01-001", "SDK-001" */
    cardNumber?: string;
    setName?: string;
    grader: Grader;
    /** Numeric grade as printed: "10", "9.5", "9" */
    grade: string;
    /** Print year, e.g. 1999. Critical for reprint collisions (same card
     *  name + number reissued in a different set/year — Base Set Charizard
     *  4/102 vs the 2021 Celebrations Classic Collection reprint). */
    year?: number;
    /** Defaults to 'english' when omitted, except for game 'pokemon-japan'
     *  where it defaults to 'japanese'. */
    language?: 'english' | 'japanese';
    /** Print variety, e.g. "1st Edition", "Unlimited", "Shadowless", "Holo",
     *  "Reverse Holo". Matched against alt's `variety` field loosely. */
    variant?: string;
}
/** One sold transaction scraped from 130point (eBay solds). */
export interface SoldComp {
    title: string;
    url: string | null;
    price: number;
    currency: string;
    /** ISO date */
    date: string | null;
    saleType: string | null;
}
export interface CompSummary {
    /** Median of kept comps after outlier trim */
    median: number;
    count: number;
    low: number;
    high: number;
    comps: SoldComp[];
    /** Non-USD (or unrecognized/missing-currency) rows dropped from the
     *  summary — no FX conversion is performed. Optional: absent on rows
     *  produced by a pre-0.2.0 build of this library. */
    excludedNonUsd?: number;
    /** True when a year was given but no SURVIVING comp's title positively
     *  states it (as opposed to merely not contradicting it — see
     *  filterComps/yearIsConfirmed). Optional/producer-set; absent means
     *  either no year was given or this field predates 0.2.1. */
    yearUnconfirmed?: boolean;
}
/** Alt's model valuation for an asset+grade (shown as "LT Value" on alt.xyz). */
export interface AltValuation {
    altValue: number;
    lowerBound: number | null;
    upperBound: number | null;
    /** alt's `altValueConfidenceMetric`, roughly 0-100. */
    confidence: number | null;
    assetId: string | null;
    brand: string | null;
    subject: string | null;
    cardNumber: string | null;
    gradeKey: string | null;
    /** Print year, when alt has it. Optional: absent on values produced by
     *  a pre-0.2.0 build of this library (e.g. rows cached from 0.1.0). */
    year?: number | null;
    /** Print variety, e.g. "1st Edition", "Unlimited". Optional, see `year`. */
    variety?: string | null;
    /** Full item name/description, used for language/edition disambiguation.
     *  Optional, see `year`. */
    name?: string | null;
}
export interface CardPop {
    gradingCompany: string;
    gradeNumber: string;
    count: number;
}
/** Tuning knobs for the cross-source disagreement guard. See getSlabComps.
 *  Out-of-range values (disagreementRatio <= 1, minSample < 1) are
 *  ignored in favor of the default — a ratio at or below 1 or a sample
 *  floor below 1 would make the guard fire nonsensically or not at all. */
export interface GetSlabCompsOptions {
    /** alt-vs-130point ratio beyond which sources are flagged as disagreeing.
     *  Default 3. Must be > 1. */
    disagreementRatio?: number;
    /** Backing sample size below which a source is flagged thin. Default 3.
     *  Must be >= 1. */
    minSample?: number;
}
export interface SlabCompsResult {
    query: SlabQuery;
    alt: {
        valuation: AltValuation;
        pops: CardPop[];
        /** True when the identity match backing this valuation was ambiguous,
         *  alt's own confidence metric was low, or the population fetch
         *  failed (see reasons). Optional/producer-set — always present from
         *  this library's own getSlabComps; absent only on pre-0.2.0 cached
         *  data. */
        lowConfidence?: boolean;
        reasons?: string[];
        /** True when the population-count fetch for this valuation's asset
         *  failed (network/API error, not "zero population"). When true,
         *  `pops` is `[]` as a safe placeholder — NOT a confirmed zero — and
         *  `sampleSize`/thin-sample logic must not treat it as a known small
         *  number. See 'pops_unavailable' in reasons and the top-level
         *  `errors` array. */
        popsUnavailable?: boolean;
    } | null;
    point130: CompSummary | null;
    /** Best available single number: alt.altValue, else 130point median. */
    recommended: {
        value: number;
        source: 'alt' | '130point';
        /** Units depend on `sampleKind`: population count (alt — total across
         *  grades, or a specific grader+grade bucket when alt reports one) or
         *  sold-comp count (130point). NEVER compare the two numbers as if
         *  they were the same unit. Optional/producer-set. */
        sampleSize?: number;
        /** What `sampleSize` counts: alt.xyz population data ('population')
         *  or literal sold 130point comps ('comps'). */
        sampleKind?: 'population' | 'comps';
    } | null;
    /** True when `reasons` is non-empty; see reasons for machine-readable
     *  causes. Optional/producer-set, see `alt.lowConfidence`. */
    lowConfidence?: boolean;
    /** 'sources_disagree' | 'thin_sample' | 'identity_weak' |
     *  'variety_ambiguous' | 'alt_low_confidence' | 'pops_unavailable' |
     *  'year_unconfirmed'. Optional/producer-set, see `alt.lowConfidence`. */
    reasons?: string[];
    errors: string[];
}
