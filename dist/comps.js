import { get130PointComps } from './point130/client.js';
import { getCardPops, searchAltValuations } from './alt/client.js';
import { matchValuation } from './alt/match.js';
const DEFAULT_DISAGREEMENT_RATIO = 3;
const DEFAULT_MIN_SAMPLE = 3;
/** alt doesn't report a comp count the way 130point does (it's a model
 *  estimate, not a median of sales) — population count is the closest
 *  available proxy for "how much data backs this number". Prefer the
 *  bucket for the SPECIFIC queried grader+grade (a card can have pop
 *  50,000 at PSA 9 and pop 3 at PSA 10 — summing across every grade, as
 *  this used to do, made the "thin sample" check nearly meaningless,
 *  since the all-grades total is almost never small). Falls back to the
 *  summed population across all reported grades only when alt doesn't
 *  report the specific bucket, as a coarser proxy. */
export function computeAltSampleSize(pops, slab) {
    const wantedGrade = parseFloat(slab.grade);
    const bucket = pops.find(p => p.gradingCompany === slab.grader && parseFloat(p.gradeNumber) === wantedGrade);
    if (bucket)
        return bucket.count;
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
 * An UNKNOWN alt sample (popsUnavailable) is never treated as thin for
 * this purpose — a fetch failure must never silently flip the source.
 */
export function buildRecommendation(alt, point130, options = {}) {
    // Out-of-range options are ignored in favor of the default, rather than
    // producing a guard that always/never fires.
    const disagreementRatio = options.disagreementRatio != null && options.disagreementRatio > 1
        ? options.disagreementRatio
        : DEFAULT_DISAGREEMENT_RATIO;
    const minSample = options.minSample != null && options.minSample >= 1 ? options.minSample : DEFAULT_MIN_SAMPLE;
    const altSampleKnown = alt != null && !alt.popsUnavailable && alt.sampleSize != null;
    const altThin = altSampleKnown ? alt.sampleSize < minSample : false;
    const pointThin = point130 ? point130.count < minSample : true;
    let recommended = null;
    if (alt && point130 && altThin && !pointThin) {
        recommended = { value: point130.median, source: '130point', sampleSize: point130.count, sampleKind: 'comps' };
    }
    else if (alt) {
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
            if (altSampleKnown && alt.sampleSize < minSample)
                reasons.push('thin_sample');
            // unknown (popsUnavailable) sample: never flagged thin — 'pops_unavailable' already communicates the uncertainty
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
            let popsUnavailable = false;
            if (match.valuation.assetId) {
                try {
                    pops = await getCardPops(match.valuation.assetId);
                }
                catch {
                    popsUnavailable = true;
                }
            }
            return {
                valuation: match.valuation,
                pops,
                sampleSize: popsUnavailable ? undefined : computeAltSampleSize(pops, slab),
                popsUnavailable,
                lowConfidence: match.lowConfidence,
                reasons: match.reasons,
            };
        })(),
        get130PointComps(slab),
    ]);
    const alt = altResult.status === 'fulfilled' ? altResult.value : null;
    if (altResult.status === 'rejected')
        errors.push(`alt: ${altResult.reason}`);
    // A pops-fetch failure must not be cacheable as if nothing went wrong —
    // surface it in errors[] too, alongside the 'pops_unavailable' reason.
    if (alt?.popsUnavailable)
        errors.push('alt: population count fetch failed (sample size unknown)');
    const point130 = point130Result.status === 'fulfilled' ? point130Result.value : null;
    if (point130Result.status === 'rejected')
        errors.push(`130point: ${point130Result.reason}`);
    const { recommended, lowConfidence, reasons } = buildRecommendation(alt, point130, options);
    return { query: slab, alt, point130, recommended, lowConfidence, reasons, errors };
}
