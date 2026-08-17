import { load } from 'cheerio';
const ENDPOINT = 'https://www.cgccards.com/certlookup';
/**
 * Parse the HTML returned by GET cgccards.com/certlookup/{cert}/. DOM
 * structure is docs-derived (see task-1-report.md — live fetch of the
 * result page is blocked by a Cloudflare managed challenge); the not-found
 * copy and cert-lookup-* class conventions are taken from CGC's own
 * (unblocked) homepage, where the same lookup component is embedded.
 */
/** Sentinel distinguishing an explicit not-found marker from an unmappable
 *  page (present but missing/unparseable required fields). */
const CGC_NOT_FOUND = Symbol('cgc-not-found');
function parseCgcCertPage(html) {
    const $ = load(html);
    if ($('.cert-not-found').length > 0)
        return CGC_NOT_FOUND;
    const cardName = $('.card-name-value').first().text().trim();
    const gradeText = $('.grade-value').first().text().trim();
    if (!cardName || !gradeText)
        return null;
    const setName = $('.cert-detail-row')
        .filter((_, el) => $(el).find('.cert-detail-label').text().trim() === 'Set')
        .find('.cert-detail-value')
        .first()
        .text()
        .trim();
    const year = $('.cert-detail-row')
        .filter((_, el) => $(el).find('.cert-detail-label').text().trim() === 'Year')
        .find('.cert-detail-value')
        .first()
        .text()
        .trim();
    return {
        cardName,
        setName: setName || null,
        gradeLabel: `CGC ${gradeText}`,
        year: year || null,
        raw: html,
    };
}
/**
 * Look up a cert via CGC's public cert-lookup page. Transport errors
 * (network failure, non-2xx status) THROW — callers relying on
 * stale-if-error semantics need the throw to distinguish "couldn't check"
 * from "checked and it's not there".
 *
 * found:false is reserved for an EXPLICIT not-found shape only: a 200 page
 * whose DOM contains the `.cert-not-found` marker. Any other 200 that
 * doesn't map cleanly (parsed but neither the not-found marker nor an
 * extractable cardName+grade) is an unrecognized response shape — CGC
 * changed something we don't understand, and reporting that as a confident
 * not-found would let v3 persist a red "not found" verdict on a possibly
 * genuine cert. So it throws instead, and v3's catch turns that into an
 * honest "unavailable" with no stamp.
 */
export async function getCgcCertRecord(certNumber, fetchImpl = fetch) {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(certNumber)}/`);
    if (!res.ok) {
        throw new Error(`CGC cert lookup error: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const parsed = parseCgcCertPage(html);
    if (parsed === CGC_NOT_FOUND) {
        return { found: false, record: null, source: 'cgc-page', errors: [] };
    }
    if (parsed === null) {
        throw new Error('unrecognized CGC response shape');
    }
    return { found: true, record: parsed, source: 'cgc-page', errors: [] };
}
