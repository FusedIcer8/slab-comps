import type { CertLookupResult } from './types.js';
/**
 * Look up a cert via PSA's public API. Transport errors (network failure,
 * non-2xx/404 status other than a confirmed-empty cert) THROW — callers that
 * need stale-if-error semantics rely on the throw to distinguish "couldn't
 * check" from "checked and it's not there". A 200 with an empty/absent
 * PSACert, or a 404, is a confirmed miss and maps to found:false.
 */
export declare function getPsaCertRecord(certNumber: string, psaToken: string | undefined, fetchImpl?: typeof fetch): Promise<CertLookupResult>;
