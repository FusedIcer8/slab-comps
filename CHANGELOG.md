# Changelog

## 0.3.0 — 2026-09-20 (fix wave, fable review FIX-THEN-MERGE)

A second pass fixing defects found reviewing 0.2.0 before it shipped —
several of the 0.2.0 fixes above had live-path gaps. Same branch
(`fix/identity-matching`). All changes remain additive; every field
added since 0.1.0 is now typed **optional** for backward/cache
compatibility (see README § Backward compatibility) even though this
library's own producer code always sets them.

### Fixed

- **alt: ties among number-matched candidates were unflagged**
  (`src/alt/match.ts`): `identity_weak` only fired when no card number
  was given, so a real 1st-Edition-vs-Shadowless-vs-Unlimited tie (same
  #4, no year/variant passed — the actual live path, since this
  library's own callers rarely pass those) went unflagged and silently
  picked whichever candidate had the highest `confidence` — which
  correlated with the highest-value listing, i.e. exactly backwards. The
  card-number gate on the tie check is gone; confidence is no longer a
  tiebreak at all; ties are resolved by preferring the empty/Unlimited
  variety, else the LOWEST value; a new `'variety_ambiguous'` reason
  fires when tied candidates differ in variety with >1.5× value spread.
- **alt: language could outweigh a genuine set match**
  (`src/alt/match.ts`): the ±3 language weight (swing 6) could beat a
  full ±4 set-overlap match, so a correctly-matched Japan-exclusive set
  could lose to a same-numbered English card from the wrong set, with no
  low-confidence flag. Language weight cut to ±1 (a true tiebreak, well
  below set/year/variant); added `'identity_weak'` when the sole
  surviving candidate matches neither a given set nor year; language
  regex widened to catch "JP"/"JPN" alongside "Japan(ese)".
- **alt: set-overlap scored a different product identically**
  (`src/alt/match.ts`): "Base Set" scored a full match against a
  candidate literally named "Base Set 2" (a real, different, later
  expansion) since both query tokens were present. Extra unrequested
  edition-marker tokens ("2", "1st", "Shadowless") on the candidate side
  now penalize the overlap score.
- **130point: set filter required EVERY raw word of a TCGplayer catalog
  set name** (`src/point130/comps.ts`): names like `"SV: Scarlet &
  Violet 151"` or `"SWSH03: Darkness Ablaze"` collapsed recall to zero
  because code-prefix tokens ("SV", "SWSH03") and punctuation never
  appear in eBay titles. Set names are now tokenized (splitting on any
  non-alphanumeric run), code prefixes and generic stopwords are
  dropped, and only ONE distinctive token is required — OR the printed
  number matched WITH its denominator ("199/165"), which is specific
  enough alone. The one guarded exception: Base Set vs the 2021
  Celebrations Classic Collection reprint share Base Set's exact
  numbering (and often even the words "Base Set" in the reprint's own
  listing text), so a denominator match no longer rescues that specific
  collision — an explicit contradiction check still rejects it.
- **130point: lot "x"-count regex flagged mechanic suffixes**
  (`src/point130/comps.ts`): `\bx\s?\d+\b` allowed a space between "x"
  and the digits, so "Charizard X 029 Promo" / "Mega Charizard X
  12/100" (the mechanic suffix "X", not a lot count) were incorrectly
  rejected. Tightened to `\bx\d+\b` (no whitespace) on that side; the
  reverse "digits-then-x" side (true x-counts like "4x") is unchanged.
- **130point: year detection counted any 4-digit token** (e.g. a PSA
  cert-number fragment like "cert 2014 5531"), which could wrongly
  reject an otherwise-valid comp that simply didn't restate the print
  year. Tightened to only count a leading year or one immediately
  adjacent to "Pokemon"/a distinctive set-name word. New
  `'year_unconfirmed'` reason (surfaced on `SlabCompsResult`) fires when
  a year was given but no surviving comp positively confirms it —
  passing the filter only means nothing contradicted it.
- **alt: population fetch failure was indistinguishable from zero
  population** (`src/comps.ts`): a failed `getCardPops` call was
  swallowed to `[]`, which could look like a confirmed thin sample and
  silently flip the recommended source to 130point with no error
  surfaced — a caching consumer would never know. Failures now set
  `sampleSize: undefined` (never `0`) and `popsUnavailable: true`, never
  contribute to the thin-sample/source-switch logic, and are pushed into
  both `reasons` (`'pops_unavailable'`) and the top-level `errors[]`.
- **alt: sample size was summed across every grade** (`src/comps.ts`):
  totaling population across all grader+grade buckets made the
  thin-sample check nearly meaningless (the all-grades total is almost
  never small). `computeAltSampleSize` now prefers the bucket for the
  SPECIFIC queried grader+grade, falling back to the all-grades sum only
  when alt doesn't report that bucket.
- **currency comparison was case/whitespace-sensitive and treated
  missing as USD** (`src/point130/comps.ts`): normalized to
  uppercase+trim; an empty/missing currency value is now excluded as
  unknown (counted in `excludedNonUsd`) rather than assumed USD.
- **options were unclamped** (`src/comps.ts`): a degenerate
  `disagreementRatio` (≤1, e.g. `1` or negative) or `minSample` (<1)
  passed by a caller is now ignored in favor of the documented default,
  rather than making the guard fire nonsensically or never.
- **package-lock.json was still 0.1.0** — resynced via `npm install
  --package-lock-only`.

### Disputed (fixed differently than proposed, or not implemented — with reasoning)

- **I7's proposed alias table entry ("Base Set" ↔ "Pokemon Game")** —
  disputed and not added: no fixture evidence supports alt calling Base
  Set "Pokemon Game". The available fixture evidence
  (`tests/fixtures/alt-api-capture.json`'s `rawName` field, and
  `tests/fixtures/alt-item-charizard.html`'s gallery caption) shows alt
  actually describes the genuine 1999 card as `"1999 Pokemon Base Set
  1st Edition Shadowless Holo Charizard #4..."` and the 2021 Celebrations
  reprint as `"...Celebrations Classic Collection Base Set..."` — i.e.
  BOTH sides of this exact collision contain the literal words "Base
  Set", which token-overlap alone cannot separate (this is worse than
  I7's original hypothesis, not better). This is handled instead by the
  year/reprint-family-contradiction logic (see "alt: set-overlap scored
  a different product identically" above and the `REPRINT_FAMILIES`
  table added to `src/point130/comps.ts` for the 130point side); the
  edition-marker-token penalty I7 also requested (verified reasonable
  independent of the alias claim) is implemented. No other alias
  entries could be verified from the fixtures on hand, so the alias
  table itself was not built out — the code comment above
  `REPRINT_FAMILIES` documents this and where to add a verified entry.

### Added (public API, additive; all optional — see § Backward compatibility)

- `CompSummary.yearUnconfirmed?: boolean`
- `SlabCompsResult.alt.popsUnavailable?: boolean`
- `SlabCompsResult.recommended.sampleKind?: 'population' | 'comps'`
- New reasons: `'variety_ambiguous'`, `'pops_unavailable'`, `'year_unconfirmed'`
- New exports: `computeAltSampleSize`, `yearIsConfirmed`
- Every field added in 0.2.0 (`AltValuation.year/variety/name`,
  `CompSummary.excludedNonUsd`, `SlabCompsResult.lowConfidence/reasons`,
  `SlabCompsResult.alt.lowConfidence/reasons`,
  `recommended.sampleSize`) is now typed optional (was required)

## 0.2.0 — 2026-09-20

Fixes for identity-matching and data-quality defects found in an audit
(branch `fix/identity-matching`). All changes are additive to the public
API — existing callers are unaffected.

### Fixed

- **alt identity matching** (`src/alt/match.ts`): `pickValuation` matched
  on card number only and fell back to the most-recently-listed
  valuation (not the best match) when no number was given, so reprint
  collisions (e.g. Base Set Charizard 4/102 1999 vs the 2021
  Celebrations Classic Collection reprint of the same number) could
  resolve to the wrong card. Number match is still a hard filter when
  given; among matches, candidates are now scored on set-name overlap,
  year, language, and variety.
- **130point set filter was OR, not AND** (`src/point130/comps.ts`):
  passing both a card number and a set name let a set-only match rescue
  a row that failed the number check, widening acceptance instead of
  narrowing it. Each identity signal given (number, set name, year) is
  now required independently.
- **`recommended` had no cross-check** (`src/comps.ts`): it always
  preferred alt with no sanity check against 130point, and alt's own
  `altValueConfidenceMetric` was parsed and never read. Both now feed a
  `lowConfidence` + `reasons[]` signal on the top-level result.
- **non-USD rows medianed as USD** (`src/point130/comps.ts`): GBP/EUR/CAD
  rows are now excluded from the summary (no FX conversion is performed
  anywhere in this library) and counted in `excludedNonUsd`.
- **lot-detection regex gaps** (`src/point130/comps.ts`): single-digit
  x-counts ("x4", "4x"), "and others", and "+ more" now correctly mark a
  row as a multi-card lot; legit titles like "Charizard EX", "XY
  Evolutions", and "Pokemon X & Y" are unaffected.
- **130point throttle was not concurrency-safe** (`src/point130/client.ts`):
  concurrent callers invoked without an `await` between them (e.g. inside
  `Promise.all`) could all read a stale `lastRequestAt` and fire with no
  spacing at all. Replaced with a promise-chain mutex.

### Added (public API, additive)

- `SlabQuery.year?: number`, `SlabQuery.language?: 'english' | 'japanese'`,
  `SlabQuery.variant?: string`
- `AltValuation.year: number | null`, `AltValuation.variety: string | null`,
  `AltValuation.name: string | null`
- `CompSummary.excludedNonUsd: number`
- `SlabCompsResult.recommended.sampleSize: number`
- `SlabCompsResult.lowConfidence: boolean`, `SlabCompsResult.reasons: string[]`
- `SlabCompsResult.alt.lowConfidence: boolean`, `SlabCompsResult.alt.reasons: string[]`
- `GetSlabCompsOptions` (`disagreementRatio?`, `minSample?`) as an
  optional second argument to `getSlabComps(slab, options?)`
- New exports: `matchValuation`, `AltMatchResult`, `buildRecommendation`, `AltLeg`
- CLI: `--year`, `--language`, `--variant` flags; low-confidence reasons
  printed in human-readable output

## 0.1.0

Initial standalone extraction — alt.xyz + 130point comps, cert lookup.
