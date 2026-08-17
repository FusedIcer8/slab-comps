# slab-comps

Graded-slab price comps for the games tcg-manager-v3 sells. Two sources,
both unofficial — built standalone so the main app can adopt it later
without carrying scraper churn.

```
npm run cli -- --game onepiece --name "Monkey D. Luffy" --number "OP01-003" --grader PSA --grade 10
npm run cli -- --game pokemon-japan --name "Charizard" --number "008" --set "World Champions Pack" --grader PSA --grade 10 --json
```

Library entry point: `getSlabComps(slab: SlabQuery): Promise<SlabCompsResult>` from `src/index.ts`.

## Sources

### alt.xyz (primary — `recommended` when available)
- `SearchServiceConfig` GraphQL (anonymous) mints a short-lived scoped
  Typesense key; cached and auto-refreshed 60s before expiry.
- Typesense `multi_search` over their listing index returns `altValue`
  (site label "LT Value"), lower/upper bounds, and card identity per
  document. Grade filtered via `gradeKey:[PSA-10]`.
- `AssetCardPops` GraphQL adds PSA/BGS/CGC population counts.
- Category map (facet-verified 2026-08): Pokemon EN+JP → `POKEMON_CARDS`,
  One Piece → `ONE_PIECE_CARDS`, YGO → `YUGIOH_CARDS`, MTG → `MAGIC_CARDS`,
  Lorcana/Gundam/Riftbound/DBZ → `TCG_CARDS`.
- Alt models value per asset+grade, so variants (JP vs EN, errata) are
  separated for us.

### 130point.com (secondary — raw eBay solds)
- `POST back.130point.com/sales/` with `query/type=2/subcat=-1` returns
  server-rendered HTML rows; no Cloudflare on this path (the frontend has
  it). Intermittently answers "Error retrieving results" (~1 in 3) —
  retried 3× with backoff.
- Rows filtered by grader+grade, name words, and printed number
  (zero-padding / `#`-prefix / split set-codes like "OP-01 … #003" all
  handled) or set-name words; lots dropped; IQR outlier trim at n≥8;
  median reported.
- Known limitation: when neither number nor set discriminates variants
  in eBay titles, the median can span variants (e.g. JP + EN alt-art
  mixed). Alt's per-asset value doesn't have this problem — hence the
  priority order.

## Reliability posture

Both endpoints are undocumented and can change or block at any time.
Every fetch is throttled (2s between 130point calls), sanity-checked
(tiny page ⇒ explicit "endpoint may have changed" error, never a silent
empty result), and each source fails independently — `SlabCompsResult`
always returns, with `errors[]` and null legs. Downstream flow must keep
manual comp entry as the final fallback.

Intended volume: per-slab lookups at grading intake / occasional
refresh. Do not bulk-harvest catalogs through these endpoints.

## Tests

`npx vitest run` — 22 tests against live-captured fixtures in
`tests/fixtures/` (no network). `tests/fixtures/capture-alt.ts`
re-captures Alt pages via Playwright if their DOM shifts.
