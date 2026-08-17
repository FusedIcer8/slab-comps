import type { SlabCompsResult, SlabQuery } from './types.js';
/**
 * Fetch comps for one slab from both sources. Each source fails
 * independently — both are unofficial endpoints that can break or block
 * at any time, so a result always comes back; check `errors` and fall
 * back to manual entry when both legs are null.
 */
export declare function getSlabComps(slab: SlabQuery): Promise<SlabCompsResult>;
