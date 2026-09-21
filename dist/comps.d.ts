import type { AltValuation, CardPop, CompSummary, GetSlabCompsOptions, SlabCompsResult, SlabQuery } from './types.js';
export interface AltLeg {
    valuation: AltValuation;
    pops: CardPop[];
    /** Population count for the queried grader+grade specifically — see
     *  computeAltSampleSize. `undefined` (never 0, never an all-grades
     *  sum!) whenever it isn't known: the fetch failed, OR alt simply
     *  doesn't report that specific bucket (see popsUnavailable/
     *  popsFetchFailed). A confirmed 0 (alt reported the bucket, it's
     *  genuinely empty) is a real, meaningful number and stays 0. */
    sampleSize: number | undefined;
    /** True when the population-count fetch itself failed (network/API
     *  error). Pushed into the top-level errors[] — a consumer must not
     *  cache this as if nothing went wrong. Distinct from popsUnavailable:
     *  a successful fetch that simply doesn't have the queried bucket is
     *  NOT a failure and does not get pushed to errors[]. */
    popsFetchFailed: boolean;
    /** True whenever sampleSize is unavailable for ANY reason — a fetch
     *  failure (popsFetchFailed) OR alt's fetch succeeding but simply not
     *  reporting the queried grader+grade bucket. Surfaces the
     *  'pops_unavailable' reason either way; see popsFetchFailed for what
     *  additionally reaches errors[]. */
    popsUnavailable: boolean;
    lowConfidence: boolean;
    reasons: string[];
}
/** alt doesn't report a comp count the way 130point does (it's a model
 *  estimate, not a median of sales) — population count for the SPECIFIC
 *  queried grader+grade is the closest available proxy for "how much
 *  data backs this number". Returns undefined (not a sum, not 0) when
 *  alt doesn't report that specific bucket: a card can have pop 50,000
 *  at PSA 9 and pop 3 at PSA 10, so summing across every grade (this
 *  library's own earlier behavior) made the "thin sample" check nearly
 *  meaningless, since the all-grades total is almost never small — and
 *  per the controller ruling (N5), a missing bucket must read as UNKNOWN,
 *  not as some other number entirely. */
export declare function computeAltSampleSize(pops: CardPop[], slab: SlabQuery): number | undefined;
/**
 * Decide the recommended number and the cross-source confidence signal.
 * Pure and fixture-testable — no network. Split out of getSlabComps so
 * the disagreement/thin-sample/identity-weak logic can be unit tested
 * directly against constructed alt/130point legs.
 *
 * CONTROLLER RULING (N5): population is not a sales sample. Source
 * preference is alt-first, always, whenever alt has a valuation — a thin
 * (or entirely unknown) alt population NEVER switches the recommended
 * source to 130point; it only adds the 'thin_sample' (or
 * 'pops_unavailable') reason. An earlier version of this function did
 * switch sources on a thin alt population — that behavior is retracted.
 */
export declare function buildRecommendation(alt: AltLeg | null, point130: CompSummary | null, options?: GetSlabCompsOptions): Pick<SlabCompsResult, 'recommended' | 'lowConfidence' | 'reasons'>;
/**
 * Fetch comps for one slab from both sources. Each source fails
 * independently — both are unofficial endpoints that can break or block
 * at any time, so a result always comes back; check `errors` and fall
 * back to manual entry when both legs are null.
 */
export declare function getSlabComps(slab: SlabQuery, options?: GetSlabCompsOptions): Promise<SlabCompsResult>;
