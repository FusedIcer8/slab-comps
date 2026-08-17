import type { CertLookupResult } from './types.js';
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
export declare function getCgcCertRecord(certNumber: string, fetchImpl?: typeof fetch): Promise<CertLookupResult>;
