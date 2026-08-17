export type Grader = 'PSA' | 'BGS' | 'CGC' | 'SGC' | 'TAG';
/** Game keys match tcg-manager-v3's game identifiers. */
export type Game = 'pokemon' | 'pokemon-japan' | 'onepiece' | 'yugioh' | 'mtg' | 'lorcana' | 'gundam' | 'riftbound' | 'dragonball';
export interface SlabQuery {
    game: Game;
    cardName: string;
    /** Printed number, e.g. "4/102", "OP01-001", "SDK-001" */
    cardNumber?: string;
    setName?: string;
    grader: Grader;
    /** Numeric grade as printed: "10", "9.5", "9" */
    grade: string;
}
/** One sold transaction scraped from 130point (eBay solds). */
export interface SoldComp {
    title: string;
    url: string | null;
    price: number;
    currency: string;
    /** ISO date */
    date: string | null;
    saleType: string | null;
}
export interface CompSummary {
    /** Median of kept comps after outlier trim */
    median: number;
    count: number;
    low: number;
    high: number;
    comps: SoldComp[];
}
/** Alt's model valuation for an asset+grade (shown as "LT Value" on alt.xyz). */
export interface AltValuation {
    altValue: number;
    lowerBound: number | null;
    upperBound: number | null;
    confidence: number | null;
    assetId: string | null;
    brand: string | null;
    subject: string | null;
    cardNumber: string | null;
    gradeKey: string | null;
}
export interface CardPop {
    gradingCompany: string;
    gradeNumber: string;
    count: number;
}
export interface SlabCompsResult {
    query: SlabQuery;
    alt: {
        valuation: AltValuation;
        pops: CardPop[];
    } | null;
    point130: CompSummary | null;
    /** Best available single number: alt.altValue, else 130point median. */
    recommended: {
        value: number;
        source: 'alt' | '130point';
    } | null;
    errors: string[];
}
