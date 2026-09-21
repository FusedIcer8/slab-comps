import type { CompSummary, SlabQuery, SoldComp } from '../types.js';
/**
 * Keep only rows that plausibly ARE the queried slab:
 * title must mention the grader, the exact grade, every word of the card
 * name, and the card number when one was given. eBay titles are noisy —
 * false positives (wrong grade, lots, different variants) cost real money
 * in a buy offer, so this errs toward dropping rows.
 */
export declare function filterComps(comps: SoldComp[], slab: SlabQuery): SoldComp[];
/** True when at least one of the given (already-filtered) comps' titles
 *  positively states the query's year (see extractRelevantYears) — as
 *  opposed to merely not contradicting it. Vacuously true when the query
 *  gives no year. Feeds the 'year_unconfirmed' reason upstream: passing
 *  the year FILTER only means nothing contradicted it, which is weaker
 *  than confirmation. */
export declare function yearIsConfirmed(comps: SoldComp[], slab: SlabQuery): boolean;
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
export declare function summarizeComps(comps: SoldComp[]): CompSummary | null;
