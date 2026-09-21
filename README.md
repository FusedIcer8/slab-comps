# slab-comps

Graded-slab price comps for the games tcg-manager-v3 sells. Two sources,
both unofficial — built standalone so the main app can adopt it later
without carrying scraper churn.

```
npm run cli -- --game onepiece --name "Monkey D. Luffy" --number "OP01-003" --grader PSA --grade 10
npm run cli -- --game pokemon-japan --name "Charizard" --number "008" --set "World Champions Pack" --grader PSA --grade 10 --json
npm run cli -- --game pokemon --name "Charizard" --number "4/102" --year 1999 --grader PSA --grade 9
```

Library entry point: `getSlabComps(slab: SlabQuery, options?: GetSlabCompsOptions): Promise<SlabCompsResult>` from `src/index.ts`.

## Identity matching

`SlabQuery` takes optional `year`, `language` (`'english' | 'japanese'`,
defaults to `'japanese'` when `game` is `'pokemon-japan'` and `'english'`
otherwise) and `variant` (e.g. `"1st Edition"`, `"Unlimited"`,
`"Shadowless"`, `"Holo"`) fields, alongside the existing `setName`. These
disambiguate reprint collisions — the same card name and printed number
reissued in a different set/year, e.g. Base Set Charizard 4/102 (1999)
vs the 2021 Celebrations Classic Collection reprint of the same number.

- **alt.xyz** (`matchValuation` / `pickValuation` in `src/alt/match.ts`):
  a card number, when given, is a hard filter (returns null rather than
  guess when nothing carries it). Among number matches — or the whole
  candidate set when no number was given — candidates are scored on
  set-name token overlap (penalized when the candidate carries an
  unrequested edition marker like "2"/"Shadowless"/"1st" — "Base Set"
  must not score identically against "Base Set 2"), year (exact match
  preferred; ±1 tolerance only when nothing matches exactly), language
  (a tiebreak, deliberately weighted below a genuine set match — a
  Japanese hit never outranks an available English one for an
  English/unspecified query, but a correctly-matched Japan-exclusive set
  also never loses to a same-numbered English card from the wrong set),
  and variety (only when the query specifies one). Ties among
  number-matched candidates that nothing else discriminates (the common
  case — this library's own callers rarely pass year/variant) are
  resolved deterministically: prefer the empty/Unlimited variety over a
  named premium edition, else the LOWEST value — never the highest, and
  never alt's own confidence metric (that's a reporting signal only, see
  below). `matchValuation` additionally reports `lowConfidence` +
  machine-readable `reasons`:
  - `'identity_weak'` — the top candidates tied (regardless of whether a
    card number was given — a number narrows the pool but says nothing
    about which variety within it is right), or the single surviving
    candidate matches neither a given set nor a given year.
  - `'variety_ambiguous'` — tied candidates differ in variety and their
    values spread more than ~1.5×, with no variant given to resolve it.
  - `'alt_low_confidence'` — alt's own `altValueConfidenceMetric` is
    below 50 (observed fixture range: 30 = thin, 60-80 = healthy).
- **130point** (`filterComps` in `src/point130/comps.ts`): every identity
  signal given (number, set name, year) is required independently —
  AND, not OR. Passing more signals only ever narrows the accepted rows.
  The set-name check tokenizes the given set name (handles TCGplayer
  catalog names like `"SV: Scarlet & Violet 151"`, `"SWSH03: Darkness
  Ablaze"`), drops catalog code prefixes (`sv`, `swsh##`, `sm`, `xy`, …)
  and generic stopwords (`pokemon`, `the`, `set`, `cards`, `and`, `tcg`),
  and then requires at least ONE distinctive token in the title — OR a
  printed number matched WITH its denominator (`"199/165"`), which is
  specific enough on its own since eBay titles very often carry the
  number but not the set name. The one documented exception: a known
  reprint-family collision (Base Set 1999 vs the 2021 Celebrations
  Classic Collection reprint, which reuses Base Set's numbering and often
  even the words "Base Set" in its own listing text) is rejected on an
  explicit contradiction check regardless of number/denominator, so a
  shared denominator never rescues the wrong print. Year detection only
  counts a leading year or one immediately adjacent to "Pokemon"/a
  distinctive set word — never an incidental 4-digit run elsewhere in
  the title (PSA cert numbers, serials, …). Rows with no year in the
  title pass through the year filter (that signal is simply absent, not
  contradicted); rows whose title names a different year are rejected.

## Result confidence

`SlabCompsResult.recommended` now carries a `sampleSize` + `sampleKind`
(`'population'` for alt — the population count for the queried
grader+grade specifically, falling back to the summed population across
all grades only when alt doesn't report that bucket — or `'comps'` for
130point's literal sold-comp count; never compare the two numbers as if
they were the same unit), and the top-level result carries
`lowConfidence: boolean` + `reasons: string[]`:

- `'sources_disagree'` — alt and 130point differ by more than
  `disagreementRatio` (default 3×; configurable via
  `getSlabComps(slab, { disagreementRatio })`, values ≤1 are ignored in
  favor of the default)
- `'thin_sample'` — the recommended source's sample size is below
  `minSample` (default 3; configurable via `{ minSample }`, values <1
  are ignored). Source preference stays alt-first by default, except
  when alt is thin and 130point is not, in which case 130point is
  preferred. An UNKNOWN alt sample (see `pops_unavailable`) is never
  treated as thin and never triggers this source switch.
- `'pops_unavailable'` — alt's population-count fetch failed (a network
  error, not "alt reported zero population"). `alt.sampleSize` is then
  `undefined`, not `0` — a fetch failure must never be silently treated
  as a confirmed thin (or zero) sample. Also pushed into the top-level
  `errors[]` array so a caching consumer doesn't cache the result as if
  nothing went wrong.
- `'year_unconfirmed'` — a year was given but no surviving 130point comp
  positively states it (passing the year filter only means nothing
  *contradicted* it, which is weaker than confirming it).
- `'identity_weak'` / `'variety_ambiguous'` / `'alt_low_confidence'` —
  see above.

`CompSummary` (130point's per-source result) carries `excludedNonUsd:
number` — non-USD rows, and rows with an empty/unrecognized currency
value (treated as unknown, never assumed USD), are excluded from the
median (no FX conversion is performed anywhere in this library) and
counted there instead. Currency comparison is uppercase+trim-tolerant.

## Backward compatibility

Every field added since 0.1.0 (`SlabQuery.year/language/variant`,
`AltValuation.year/variety/name`, `CompSummary.excludedNonUsd/
yearUnconfirmed`, `SlabCompsResult.lowConfidence/reasons`,
`SlabCompsResult.alt.lowConfidence/reasons/popsUnavailable`,
`recommended.sampleSize/sampleKind`) is typed **optional**, even though
this library's own `getSlabComps` always sets them. This is deliberate:
a consumer that constructs these types directly (tests, mocks) or reads
rows cached from an older version of this library shouldn't be forced
to backfill fields it may not have.

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
Every fetch is throttled (2s between 130point calls, concurrency-safe —
overlapping callers serialize rather than racing past the throttle),
sanity-checked
(tiny page ⇒ explicit "endpoint may have changed" error, never a silent
empty result), and each source fails independently — `SlabCompsResult`
always returns, with `errors[]` and null legs. Downstream flow must keep
manual comp entry as the final fallback.

Intended volume: per-slab lookups at grading intake / occasional
refresh. Do not bulk-harvest catalogs through these endpoints.

## Tests

`npx vitest run` — 135 tests, fixture/constructed-data only (no network).
`tests/fixtures/capture-alt.ts` re-captures Alt pages via Playwright if
their DOM shifts.
