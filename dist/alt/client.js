const GRAPHQL_BASE = 'https://alt-platform-server.production.internal.onlyalt.com/graphql';
const ORIGIN = 'https://alt.xyz';
/** alt.xyz category enum per game (verified via search-index facets 2026-08).
 *  Lorcana and newer games live under the generic TCG_CARDS bucket. */
const CATEGORY = {
    pokemon: 'POKEMON_CARDS',
    'pokemon-japan': 'POKEMON_CARDS',
    onepiece: 'ONE_PIECE_CARDS',
    yugioh: 'YUGIOH_CARDS',
    mtg: 'MAGIC_CARDS',
    lorcana: 'TCG_CARDS',
    gundam: 'TCG_CARDS',
    riftbound: 'TCG_CARDS',
    dragonball: 'TCG_CARDS',
};
let cachedConfig = null;
async function graphql(operationName, query, variables) {
    const res = await fetch(`${GRAPHQL_BASE}/${operationName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ operationName, variables, query }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok)
        throw new Error(`alt graphql ${operationName}: ${res.status} ${res.statusText}`);
    const body = (await res.json());
    if (!body.data)
        throw new Error(`alt graphql ${operationName}: ${body.errors?.[0]?.message ?? 'no data'}`);
    return body.data;
}
/** Fetch (and cache) a scoped Typesense key for the universal search index.
 *  Keys are short-lived; refresh 60s before expiry. */
export async function getSearchConfig() {
    if (cachedConfig && cachedConfig.expiresAt - 60 > Date.now() / 1000)
        return cachedConfig;
    const data = await graphql('SearchServiceConfig', `query SearchServiceConfig { serviceConfig { search { universalSearch {
       clientConfig { nodes { host port protocol } apiKey } collectionName expiresAt } } } }`, {});
    const cfg = data.serviceConfig.search.universalSearch;
    cachedConfig = {
        host: cfg.clientConfig.nodes[0].host,
        apiKey: cfg.clientConfig.apiKey,
        collectionName: cfg.collectionName,
        expiresAt: cfg.expiresAt,
    };
    return cachedConfig;
}
export function mapDocToValuation(doc) {
    if (typeof doc.altValue !== 'number' || doc.altValue <= 0)
        return null;
    return {
        altValue: doc.altValue,
        lowerBound: doc.altValueLowerBound ?? null,
        upperBound: doc.altValueUpperBound ?? null,
        confidence: doc.altValueConfidenceMetric ?? null,
        assetId: doc.assetId ?? null,
        brand: doc.brand ?? null,
        subject: doc.subject ?? null,
        cardNumber: doc.cardNumber ?? null,
        gradeKey: doc.gradeKey ?? null,
    };
}
/** Search alt's index for listings of this slab; docs carry the model
 *  valuation (site label "LT Value") directly. */
export async function searchAltValuations(slab) {
    const cfg = await getSearchConfig();
    const filters = [`gradeKey:[${slab.grader}-${slab.grade}]`];
    const category = CATEGORY[slab.game];
    if (category)
        filters.push(`category:[${category}]`);
    // Card number in the query text is the strongest recall signal — the
    // index matches it across dashed and dashless forms.
    const q = [slab.cardName, slab.cardNumber, slab.setName].filter(Boolean).join(' ');
    // Popular characters span dozens of cards; fetch enough for
    // pickValuation to find the right number.
    const perPage = slab.cardNumber || slab.setName ? 20 : 50;
    const res = await fetch(`https://${cfg.host}/multi_search?collection=${cfg.collectionName}&x-typesense-api-key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            searches: [
                {
                    q,
                    preset: 'timestamp_desc',
                    filter_by: filters.join('&&'),
                    per_page: perPage,
                    page: 1,
                },
            ],
        }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok)
        throw new Error(`alt search: ${res.status} ${res.statusText}`);
    const body = (await res.json());
    const result = body.results[0];
    if (result.error)
        throw new Error(`alt search: ${result.error}`);
    const seen = new Set();
    const valuations = [];
    for (const hit of result.hits ?? []) {
        const v = mapDocToValuation(hit.document);
        if (!v)
            continue;
        const key = v.assetId ?? `${v.brand}|${v.cardNumber}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        valuations.push(v);
    }
    return valuations;
}
/** PSA/BGS/CGC population counts for an alt asset. */
export async function getCardPops(assetId) {
    const data = await graphql('AssetCardPops', 'query AssetCardPops($id: ID!) { asset(id: $id) { cardPops { gradingCompany gradeNumber count } } }', { id: assetId });
    return data.asset?.cardPops ?? [];
}
