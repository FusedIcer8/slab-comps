import type { AltValuation, SlabQuery } from '../types.js';
/**
 * Pick the valuation that best matches the slab. Card number is the
 * strongest signal when present; otherwise fall back to the first
 * (most recent) hit. Returns null rather than guess when a number was
 * given and nothing carries it.
 */
export declare function pickValuation(valuations: AltValuation[], slab: SlabQuery): AltValuation | null;
