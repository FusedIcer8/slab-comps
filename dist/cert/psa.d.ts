import type { CertLookupResult } from './types.js';
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
export declare function getPsaCertRecord(certNumber: string, psaToken: string | undefined, fetchImpl?: typeof fetch): Promise<CertLookupResult>;
