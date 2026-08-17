import { parse130PointSales } from './parse.js';
import { filterComps, summarizeComps } from './comps.js';
const ENDPOINT = 'https://back.130point.com/sales/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
/** Minimum ms between requests — 130point is a small free service; be polite. */
const MIN_INTERVAL_MS = 2_000;
let lastRequestAt = 0;
async function throttle() {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0)
        await new Promise(r => setTimeout(r, wait));
    lastRequestAt = Date.now();
}
/** Raw search — returns every sold row 130point has for the query string.
 *  The backend intermittently answers "Error retrieving results" (~1 in 3
 *  observed); retry those with backoff before giving up. */
export async function search130Point(query) {
    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
        await throttle();
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': UA,
            },
            body: new URLSearchParams({ query, type: '2', subcat: '-1' }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok)
            throw new Error(`130point error: ${res.status} ${res.statusText}`);
        const html = await res.text();
        if (html.includes('Error retrieving results')) {
            lastError = '130point transient error page';
            await new Promise(r => setTimeout(r, 3_000 * attempt));
            continue;
        }
        const comps = parse130PointSales(html);
        // Structural sanity check: a served block page or redesign parses to zero
        // rows — distinguish that from a genuinely empty result via page size.
        if (comps.length === 0 && html.length < 2_000) {
            throw new Error('130point returned an unexpectedly small page — endpoint may have changed');
        }
        return comps;
    }
    throw new Error(`130point failed after 3 attempts: ${lastError}`);
}
export function buildQuery(slab) {
    // Include every identity signal; eBay's search quietly drops terms that
    // would zero the results, so a number sellers don't title by ("008")
    // costs nothing while a set-code ("OP01-003") sharpens recall a lot.
    return [slab.setName, slab.cardName, slab.cardNumber, slab.grader, slab.grade]
        .filter(Boolean)
        .join(' ');
}
/** Search, filter to plausible matches, summarize. Null when no usable comps. */
export async function get130PointComps(slab) {
    const rows = await search130Point(buildQuery(slab));
    return summarizeComps(filterComps(rows, slab));
}
