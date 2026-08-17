const ENDPOINT = 'https://api.psacard.com/publicapi/cert/GetByCertNumber';
/** CardGrade arrives like "GEM MT 10" or "MINT 9.5" — extract the trailing
 *  numeric grade (half grades kept). */
function parseGradeNumber(cardGrade) {
    const match = cardGrade.trim().match(/(\d+(?:\.\d+)?)\s*$/);
    return match ? match[1] : null;
}
function mapPsaCert(cert) {
    const gradeNumber = cert.CardGrade ? parseGradeNumber(cert.CardGrade) : null;
    if (!gradeNumber)
        return null;
    return {
        cardName: cert.Subject ?? '',
        setName: cert.Brand ?? null,
        gradeLabel: `PSA ${gradeNumber}`,
        year: cert.Year ?? null,
        raw: cert,
    };
}
/**
 * Look up a cert via PSA's public API. Transport errors (network failure,
 * non-2xx/404 status other than a confirmed-empty cert) THROW — callers that
 * need stale-if-error semantics rely on the throw to distinguish "couldn't
 * check" from "checked and it's not there". A 200 with an empty/absent
 * PSACert, or a 404, is a confirmed miss and maps to found:false.
 */
export async function getPsaCertRecord(certNumber, psaToken, fetchImpl = fetch) {
    if (!psaToken)
        throw new Error('psa token required');
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(certNumber)}`, {
        headers: { authorization: `bearer ${psaToken}` },
    });
    if (res.status === 404) {
        return { found: false, record: null, source: 'psa-api', errors: [] };
    }
    if (!res.ok) {
        throw new Error(`PSA API error: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json());
    if (!body.PSACert) {
        return { found: false, record: null, source: 'psa-api', errors: [] };
    }
    const record = mapPsaCert(body.PSACert);
    if (!record) {
        return { found: false, record: null, source: 'psa-api', errors: [] };
    }
    return { found: true, record, source: 'psa-api', errors: [] };
}
