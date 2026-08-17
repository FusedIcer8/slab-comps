export * from './types.js';
import type { CertLookupResult, CertQuery } from './types.js';
/**
 * Look up a graded-card cert by number. Dispatches to PSA's public API or
 * CGC's cert-lookup page based on `query.grader`.
 *
 * Transport errors (network failure, unexpected non-2xx) always throw —
 * `found: false` is reserved for a confirmed miss (cert genuinely not on
 * file). Callers needing stale-if-error fallback should catch the throw.
 */
export declare function getCertRecord(query: CertQuery, opts?: {
    psaToken?: string;
    fetchImpl?: typeof fetch;
}): Promise<CertLookupResult>;
