import type { AltValuation, CardPop, CompSummary, GetSlabCompsOptions, SlabCompsResult, SlabQuery } from './types.js';
export interface AltLeg {
    valuation: AltValuation;
    pops: CardPop[];
    lowConfidence: boolean;
    reasons: string[];
}
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
 */
export declare function buildRecommendation(alt: AltLeg | null, point130: CompSummary | null, options?: GetSlabCompsOptions): Pick<SlabCompsResult, 'recommended' | 'lowConfidence' | 'reasons'>;
/**
 * Fetch comps for one slab from both sources. Each source fails
 * independently — both are unofficial endpoints that can break or block
 * at any time, so a result always comes back; check `errors` and fall
 * back to manual entry when both legs are null.
 */
export declare function getSlabComps(slab: SlabQuery, options?: GetSlabCompsOptions): Promise<SlabCompsResult>;
