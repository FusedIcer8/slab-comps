import type { CompSummary, SlabQuery, SoldComp } from '../types.js';
/** Raw search — returns every sold row 130point has for the query string.
 *  The backend intermittently answers "Error retrieving results" (~1 in 3
 *  observed); retry those with backoff before giving up. */
export declare function search130Point(query: string): Promise<SoldComp[]>;
export declare function buildQuery(slab: SlabQuery): string;
/** Search, filter to plausible matches, summarize. Null when no usable comps. */
export declare function get130PointComps(slab: SlabQuery): Promise<CompSummary | null>;
