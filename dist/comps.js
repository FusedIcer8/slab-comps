import { get130PointComps } from './point130/client.js';
import { getCardPops, searchAltValuations } from './alt/client.js';
import { matchValuation } from './alt/match.js';
const DEFAULT_DISAGREEMENT_RATIO = 3;
const DEFAULT_MIN_SAMPLE = 3;
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
export function computeAltSampleSize(pops, slab) {
    const wantedGrade = parseFloat(slab.grade);
    const bucket = pops.find(p => p.gradingCompany === slab.grader && parseFloat(p.gradeNumber) === wantedGrade);
    return bucket?.count;
}
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
export function buildRecommendation(alt, point130, options = {}) {
    // Out-of-range options are ignored in favor of the default, rather than
    // producing a guard that always/never fires.
    const disagreementRatio = options.disagreementRatio != null && options.disagreementRatio > 1
        ? options.disagreementRatio
        : DEFAULT_DISAGREEMENT_RATIO;
    const minSample = options.minSample != null && options.minSample >= 1 ? options.minSample : DEFAULT_MIN_SAMPLE;
    let recommended = null;
    if (alt) {
        recommended = {
            value: alt.valuation.altValue,
            source: 'alt',
            sampleSize: alt.sampleSize,
            sampleKind: 'population',
        };
    }
    else if (point130) {
        recommended = { value: point130.median, source: '130point', sampleSize: point130.count, sampleKind: 'comps' };
    }
    const reasons = [];
    if (alt?.reasons.length)
        reasons.push(...alt.reasons);
    if (alt?.popsUnavailable)
        reasons.push('pops_unavailable');
    if (alt && point130) {
        const hi = Math.max(alt.valuation.altValue, point130.median);
        const lo = Math.min(alt.valuation.altValue, point130.median);
        if (lo > 0 && hi / lo > disagreementRatio)
            reasons.push('sources_disagree');
    }
    if (recommended) {
        if (recommended.source === 'alt') {
            if (alt.sampleSize != null && alt.sampleSize < minSample)
                reasons.push('thin_sample');
            // unavailable sample: never flagged thin — 'pops_unavailable' already communicates the uncertainty
        }
        else if (point130 && point130.count < minSample) {
            reasons.push('thin_sample');
        }
    }
    if (point130?.yearUnconfirmed)
        reasons.push('year_unconfirmed');
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
            let pops = [];
            let popsFetchFailed = false;
            if (match.valuation.assetId) {
                try {
                    pops = await getCardPops(match.valuation.assetId);
                }
                catch {
                    popsFetchFailed = true;
                }
            }
            const sampleSize = popsFetchFailed ? undefined : computeAltSampleSize(pops, slab);
            return {
                valuation: match.valuation,
                pops,
                sampleSize,
                popsFetchFailed,
                // Unavailable for either reason — a failed fetch OR a successful
                // fetch that simply doesn't have the queried grader+grade bucket.
                popsUnavailable: popsFetchFailed || sampleSize == null,
                lowConfidence: match.lowConfidence,
                reasons: match.reasons,
            };
        })(),
        get130PointComps(slab),
    ]);
    const alt = altResult.status === 'fulfilled' ? altResult.value : null;
    if (altResult.status === 'rejected')
        errors.push(`alt: ${altResult.reason}`);
    // A genuine fetch FAILURE must not be cacheable as if nothing went
    // wrong — surface it in errors[] too, alongside the 'pops_unavailable'
    // reason. A merely-missing bucket (fetch succeeded, alt just doesn't
    // report that grade) is not an error — do not push it.
    if (alt?.popsFetchFailed)
        errors.push('alt: population count fetch failed (sample size unknown)');
    const point130 = point130Result.status === 'fulfilled' ? point130Result.value : null;
    if (point130Result.status === 'rejected')
        errors.push(`130point: ${point130Result.reason}`);
    const { recommended, lowConfidence, reasons } = buildRecommendation(alt, point130, options);
    return { query: slab, alt, point130, recommended, lowConfidence, reasons, errors };
}
