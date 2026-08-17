import type { CertLookupResult } from './types.js';
/**
 * Look up a cert via CGC's public cert-lookup page. Transport errors
 * (network failure, non-2xx status) THROW — callers relying on
 * stale-if-error semantics need the throw to distinguish "couldn't check"
 * from "checked and it's not there". A 200 whose DOM matches the
 * not-found shape is a confirmed miss and maps to found:false.
 */
export declare function getCgcCertRecord(certNumber: string, fetchImpl?: typeof fetch): Promise<CertLookupResult>;
