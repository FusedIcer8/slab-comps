import type { AltValuation, CardPop, SlabQuery } from '../types.js';
interface SearchConfig {
    host: string;
    apiKey: string;
    collectionName: string;
    /** epoch seconds */
    expiresAt: number;
}
/** Fetch (and cache) a scoped Typesense key for the universal search index.
 *  Keys are short-lived; refresh 60s before expiry. */
export declare function getSearchConfig(): Promise<SearchConfig>;
interface TypesenseDoc {
    altValue?: number;
    altValueLowerBound?: number;
    altValueUpperBound?: number;
    altValueConfidenceMetric?: number;
    assetId?: string;
    brand?: string;
    subject?: string;
    cardNumber?: string;
    gradeKey?: string;
}
export declare function mapDocToValuation(doc: TypesenseDoc): AltValuation | null;
/** Search alt's index for listings of this slab; docs carry the model
 *  valuation (site label "LT Value") directly. */
export declare function searchAltValuations(slab: SlabQuery): Promise<AltValuation[]>;
/** PSA/BGS/CGC population counts for an alt asset. */
export declare function getCardPops(assetId: string): Promise<CardPop[]>;
export {};
