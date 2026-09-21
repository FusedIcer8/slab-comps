import { get130PointComps } from './point130/client.js';
import { getCardPops, searchAltValuations } from './alt/client.js';
import { matchValuation } from './alt/match.js';
const DEFAULT_DISAGREEMENT_RATIO = 3;
const DEFAULT_MIN_SAMPLE = 3;
/** alt doesn't report a comp count the way 130point does (it's a model
 *  estimate, not a median of sales) — population count is the closest
 *  available proxy for "how much data backs this number". */
function altSampleSize(pops) {
    return pops.reduce((sum, p) => sum + p.count, 0);
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
export function buildRecommendation(alt, point130, options = {}) {
    const disagreementRatio = options.disagreementRatio ?? DEFAULT_DISAGREEMENT_RATIO;
    const minSample = options.minSample ?? DEFAULT_MIN_SAMPLE;
    const altN = alt ? altSampleSize(alt.pops) : 0;
    const altThin = alt ? altN < minSample : false;
    const pointThin = point130 ? point130.count < minSample : true;
    let recommended = null;
    if (alt && point130 && altThin && !pointThin) {
        recommended = { value: point130.median, source: '130point', sampleSize: point130.count };
    }
    else if (alt) {
        recommended = { value: alt.valuation.altValue, source: 'alt', sampleSize: altN };
    }
    else if (point130) {
        recommended = { value: point130.median, source: '130point', sampleSize: point130.count };
    }
    const reasons = [];
    if (alt?.reasons.length)
        reasons.push(...alt.reasons);
    if (alt && point130) {
        const hi = Math.max(alt.valuation.altValue, point130.median);
        const lo = Math.min(alt.valuation.altValue, point130.median);
        if (lo > 0 && hi / lo > disagreementRatio)
            reasons.push('sources_disagree');
    }
    if (recommended) {
        const chosenN = recommended.source === 'alt' ? altN : (point130?.count ?? 0);
        if (chosenN < minSample)
            reasons.push('thin_sample');
    }
    const uniqueReasons = Array.from(new Set(reasons));
    return { recommended, lowConfidence: uniqueReasons.length > 0, reasons: uniqueReasons };
}
/**
 * Fetch comps for one slab from both sources. Each source fails
 * independently — both are unofficial endpoints that can break or block
 * at any time, so a result always comes back; check `errors` and fall
 * back to manual entry when both legs are null.
 */
export async function getSlabComps(slab, options = {}) {
    const errors = [];
    const [altResult, point130Result] = await Promise.allSettled([
        (async () => {
            const match = matchValuation(await searchAltValuations(slab), slab);
            if (!match.valuation)
                return null;
            const pops = match.valuation.assetId
                ? await getCardPops(match.valuation.assetId).catch(() => [])
                : [];
            return { valuation: match.valuation, pops, lowConfidence: match.lowConfidence, reasons: match.reasons };
        })(),
        get130PointComps(slab),
    ]);
    const alt = altResult.status === 'fulfilled' ? altResult.value : null;
    if (altResult.status === 'rejected')
        errors.push(`alt: ${altResult.reason}`);
    const point130 = point130Result.status === 'fulfilled' ? point130Result.value : null;
    if (point130Result.status === 'rejected')
        errors.push(`130point: ${point130Result.reason}`);
    const { recommended, lowConfidence, reasons } = buildRecommendation(alt, point130, options);
    return { query: slab, alt, point130, recommended, lowConfidence, reasons, errors };
}
