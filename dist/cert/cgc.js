import { load } from 'cheerio';
const ENDPOINT = 'https://www.cgccards.com/certlookup';
/**
 * Parse the HTML returned by GET cgccards.com/certlookup/{cert}/. DOM
 * structure is docs-derived (see task-1-report.md — live fetch of the
 * result page is blocked by a Cloudflare managed challenge); the not-found
 * copy and cert-lookup-* class conventions are taken from CGC's own
 * (unblocked) homepage, where the same lookup component is embedded.
 */
function parseCgcCertPage(html) {
    const $ = load(html);
    if ($('.cert-not-found').length > 0)
        return null;
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
 * from "checked and it's not there". A 200 whose DOM matches the
 * not-found shape is a confirmed miss and maps to found:false.
 */
export async function getCgcCertRecord(certNumber, fetchImpl = fetch) {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(certNumber)}/`);
    if (!res.ok) {
        throw new Error(`CGC cert lookup error: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const record = parseCgcCertPage(html);
    if (!record) {
        return { found: false, record: null, source: 'cgc-page', errors: [] };
    }
    return { found: true, record, source: 'cgc-page', errors: [] };
}
