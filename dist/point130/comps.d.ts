import type { CompSummary, SlabQuery, SoldComp } from '../types.js';
/**
 * Keep only rows that plausibly ARE the queried slab:
 * title must mention the grader, the exact grade, every word of the card
 * name, and the card number when one was given. eBay titles are noisy —
 * false positives (wrong grade, lots, different variants) cost real money
 * in a buy offer, so this errs toward dropping rows.
 */
export declare function filterComps(comps: SoldComp[], slab: SlabQuery): SoldComp[];
/**
 * Median-based summary with IQR outlier trim. Trim only when we have
 * enough rows for quartiles to mean anything (>= 8); below that a bad
 * outlier can't hide anyway and the median resists it.
 */
export declare function summarizeComps(comps: SoldComp[]): CompSummary | null;
