import type { AltValuation, SlabQuery } from '../types.js';
export interface AltMatchResult {
    valuation: AltValuation | null;
    lowConfidence: boolean;
    /** 'identity_weak' | 'variety_ambiguous' | 'alt_low_confidence' */
    reasons: string[];
}
/**
 * Pick the valuation that best matches the slab, and report how
 * confident that pick is. Card number is a hard filter when given
 * (returns null rather than guess if nothing carries it); among number
 * matches — or the whole set when no number was given — candidates are
 * scored on set name, year, language and variety to resolve reprint
 * collisions (same name+number reissued under a different set/year).
 */
export declare function matchValuation(valuations: AltValuation[], slab: SlabQuery): AltMatchResult;
/** Convenience wrapper over matchValuation for callers that only need the
 *  picked valuation. See matchValuation for confidence signals. */
export declare function pickValuation(valuations: AltValuation[], slab: SlabQuery): AltValuation | null;
