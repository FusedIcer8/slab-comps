import type { CertLookupResult, CertRecord } from './types.js'

const ENDPOINT = 'https://api.psacard.com/publicapi/cert/GetByCertNumber'

/** PSA public API shape (documented; not verified against a live token —
 *  see task-1-report.md). */
interface PSACertPayload {
  PSACert?: {
    CertNumber?: string
    Subject?: string
    Brand?: string
    Year?: string
    CardGrade?: string
    CardNumber?: string
    [key: string]: unknown
  } | null
}

/** CardGrade arrives like "GEM MT 10" or "MINT 9.5" — extract the trailing
 *  numeric grade (half grades kept). */
function parseGradeNumber(cardGrade: string): string | null {
  const match = cardGrade.trim().match(/(\d+(?:\.\d+)?)\s*$/)
  return match ? match[1] : null
}

/** Maps a present PSACert to a CertRecord. Returns null only when required
 *  fields (grade) are missing/unparseable — callers must treat that as an
 *  unrecognized shape, NOT a not-found. */
function mapPsaCert(cert: NonNullable<PSACertPayload['PSACert']>): CertRecord | null {
  const gradeNumber = cert.CardGrade ? parseGradeNumber(cert.CardGrade) : null
  if (!gradeNumber) return null
  return {
    cardName: cert.Subject ?? '',
    setName: cert.Brand ?? null,
    gradeLabel: `PSA ${gradeNumber}`,
    year: cert.Year ?? null,
    raw: cert,
  }
}

/**
 * Look up a cert via PSA's public API. Transport errors (network failure,
 * non-2xx status other than 404) THROW — callers that need stale-if-error
 * semantics rely on the throw to distinguish "couldn't check" from "checked
 * and it's not there".
 *
 * found:false is reserved for EXPLICIT not-found shapes only: an HTTP 404,
 * or a 200 whose parsed JSON has PSACert null/absent. Any other 200 that
 * doesn't map cleanly (PSACert present but required fields missing or the
 * grade is unparseable) is an unrecognized response shape — PSA changed
 * something we don't understand, and reporting that as a confident
 * not-found would let v3 persist a red "not found" verdict on a possibly
 * genuine cert. So it throws instead, and v3's catch turns that into an
 * honest "unavailable" with no stamp.
 */
export async function getPsaCertRecord(
  certNumber: string,
  psaToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<CertLookupResult> {
  if (!psaToken) throw new Error('psa token required')

  const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(certNumber)}`, {
    headers: { authorization: `bearer ${psaToken}` },
  })

  if (res.status === 404) {
    return { found: false, record: null, source: 'psa-api', errors: [] }
  }
  if (!res.ok) {
    throw new Error(`PSA API error: ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as PSACertPayload
  if (body.PSACert === null || body.PSACert === undefined) {
    return { found: false, record: null, source: 'psa-api', errors: [] }
  }

  const record = mapPsaCert(body.PSACert)
  if (!record) {
    throw new Error('unrecognized PSA response shape')
  }

  return { found: true, record, source: 'psa-api', errors: [] }
}
