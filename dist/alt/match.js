/** Normalize printed numbers for comparison: "008", "8" and "4/102" → same
 *  form; "OP01-003" and alt's dashless "OP01003" → same form. */
function normalizeNumber(n) {
    const first = n.split('/')[0].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return first.replace(/^0+(?=\d)/, '');
}
/**
 * Pick the valuation that best matches the slab. Card number is the
 * strongest signal when present; otherwise fall back to the first
 * (most recent) hit. Returns null rather than guess when a number was
 * given and nothing carries it.
 */
export function pickValuation(valuations, slab) {
    if (valuations.length === 0)
        return null;
    if (!slab.cardNumber)
        return valuations[0];
    const wanted = normalizeNumber(slab.cardNumber);
    return valuations.find(v => v.cardNumber && normalizeNumber(v.cardNumber) === wanted) ?? null;
}
