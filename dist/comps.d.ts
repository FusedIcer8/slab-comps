import type { AltValuation, CardPop, CompSummary, GetSlabCompsOptions, SlabCompsResult, SlabQuery } from './types.js';
export interface AltLeg {
    valuation: AltValuation;
    pops: CardPop[];
    /** Population count backing this valuation — see computeAltSampleSize.
     *  `undefined` (never 0!) when the population fetch failed; see
     *  popsUnavailable. A confirmed 0 (alt reported the bucket, it's
     *  genuinely empty) is a real, meaningful number and stays 0. */
    sampleSize: number | undefined;
    /** True when the population-count fetch itself failed (network/API
     *  error) — distinct from alt genuinely reporting zero population.
     *  When true, `pops` is `[]` as a safe placeholder, not a confirmed
     *  empty result, and `sampleSize` is `undefined`. */
    popsUnavailable: boolean;
    lowConfidence: boolean;
    reasons: string[];
}
/** alt doesn't report a comp count the way 130point does (it's a model
 *  estimate, not a median of sales) — population count is the closest
 *  available proxy for "how much data backs this number". Prefer the
 *  bucket for the SPECIFIC queried grader+grade (a card can have pop
 *  50,000 at PSA 9 and pop 3 at PSA 10 — summing across every grade, as
 *  this used to do, made the "thin sample" check nearly meaningless,
 *  since the all-grades total is almost never small). Falls back to the
 *  summed population across all reported grades only when alt doesn't
 *  report the specific bucket, as a coarser proxy. */
export declare function computeAltSampleSize(pops: CardPop[], slab: SlabQuery): number;
/**
 * Decide the recommended number and the cross-source confidence signal.
 * Pure and fixture-testable — no network. Split out of getSlabComps so
 * the disagreement/thin-sample/identity-weak logic can be unit tested
 * directly against constructed alt/130point legs.
 *
 * Default source preference stays alt-first (unchanged from before this
 * fix) UNLESS alt's sample is thin and 130point's is not, per the audit:
 * "do not change which number is recommended unless the preferred source
 * is n<min and the other is n>=min with agreement otherwise impossible."
 * An UNKNOWN alt sample (popsUnavailable) is never treated as thin for
 * this purpose — a fetch failure must never silently flip the source.
 */
export declare function buildRecommendation(alt: AltLeg | null, point130: CompSummary | null, options?: GetSlabCompsOptions): Pick<SlabCompsResult, 'recommended' | 'lowConfidence' | 'reasons'>;
/**
 * Fetch comps for one slab from both sources. Each source fails
 * independently — both are unofficial endpoints that can break or block
 * at any time, so a result always comes back; check `errors` and fall
 * back to manual entry when both legs are null.
 */
export declare function getSlabComps(slab: SlabQuery, options?: GetSlabCompsOptions): Promise<SlabCompsResult>;
