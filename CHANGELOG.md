# Changelog

## 0.3.0 — 2026-09-20 (fix wave 1 + fix wave 2, fable review FIX-THEN-MERGE ×2)

Two further review passes fixing defects found reviewing the fixes
below before they shipped — several opened new gaps of their own,
caught by re-review rather than by any external report. Same branch
(`fix/identity-matching`), never released/pushed, so this stays 0.3.0
rather than bumping again. All changes remain additive; every field
added since 0.1.0 is typed **optional** for backward/cache
compatibility (see README § Backward compatibility) even though this
library's own producer code always sets them.

### Fixed (review pass 2 — the pass-1 130point/alt fixes opened wrong-card paths)

- **N1, Critical, pushed reprint offers UP** (`src/point130/comps.ts`):
  pass 1's set-name AND-narrowing let a matching denominator satisfy a
  REPRINT-family query (e.g. "Celebrations: Classic Collection") on its
  own, with no reprint marker required — so plain ORIGINAL-print titles
  ("1999 Pokemon Charizard Holo 4/102 PSA 10", "Charizard 4/102
  Shadowless PSA 10") got accepted into a reprint quote's comp set,
  pulling its median up toward the original's far higher value. Also
  let unrelated real cards sharing a denominator through ("Umbreon Gold
  Star 17/17 POP Series 5", "Dark Gyarados 8/82 Team Rocket 1st
  Edition"). Fixed: when the query's setName matches a known reprint
  family's REPRINT side, the title must carry the marker itself —
  denominator never rescues it. The original-side symmetric check is
  unchanged.
- **N2** (`src/point130/comps.ts`): with no card number at all, ANY ONE
  distinctive set-name token accepted a row — "promo" alone let 29
  unrelated promos through for "SWSH: Sword & Shield Promo Cards" (true
  median ~$78 vs a wrongly-inflated $227); "fates" alone let a "Shining
  Fates" title through for a "Hidden Fates" query; "base" alone let
  plain "Base Set" through for a "Base Set 2" query. Fixed: a new
  GENERIC_SET_TOKENS list (promo, collection, fates, base, vault, star,
  ...) plus `nonGenericSetTokens` — with no number, EVERY non-generic
  token is required; the same exclusion tightens the weaker "at least
  one" rescue used when a number was given but didn't independently
  confirm the set. Also fixed in the same pass: `nameWords` dropped
  1-character words, so "Charizard V" silently matched any "Charizard"
  including "Charizard VMAX" (V is a substring of VMAX). Short alnum
  name words are now kept and word-boundary matched instead.
- **N3** (`src/point130/comps.ts`): letter-prefixed numbers (SWSH050,
  TG15, GG70, SV107, SM210, XY17, H4) identify their set on their own,
  but only numerator/denominator numbers satisfied the set requirement.
  A literal match on the prefixed number (via its numerator, so
  "SV107/SV122"-range forms work too) now satisfies the set directly.
- **N4** (`src/alt/match.ts`): a `variant` that matched nothing silently
  resolved to whichever candidate the tiebreak landed on, with an empty
  `reasons[]` — no signal the requested edition wasn't actually found.
  Matching also only checked the exact `variety` field requiring every
  token, so shorthand ("1st Ed") never matched "1st Edition" and an
  edition mentioned only in `brand`/`name` text was invisible. Fixed:
  `normalizeVarietyText` folds "first"->"1st"/"ed"->"edition";
  `variantMatches` searches variety+brand+name on an any-token basis;
  `identity_weak` fires when a variant was given and nothing in the pool
  matched it. The edition-marker penalty also now exempts the caller's
  own variant tokens.
- **N6**: verified the edition-marker "2" penalty already correctly
  exempts a query whose own setName contains "2" (e.g. "Base Set 2") via
  the pre-existing token exemption — added a regression test, no code
  change was needed.
- **N5, CONTROLLER RULING** (`src/comps.ts`): population is not a sales
  sample. The alt-thin -> switch-to-130point behavior from pass 1 is
  **removed** — source preference is alt-first, always, whenever alt has
  a valuation; a thin (or entirely unknown) alt population only ever
  adds the `'thin_sample'`/`'pops_unavailable'` reason, never changes
  the source. `computeAltSampleSize` no longer falls back to an
  all-grades sum when the queried grader+grade bucket is missing — it
  returns `undefined` (unknown), matching the same semantics as a
  fetch failure. A new `popsFetchFailed` field distinguishes a genuine
  fetch failure (pushed into `errors[]`) from a merely-missing bucket
  (not an error, not pushed) — both still surface `'pops_unavailable'`
  in `reasons`.

### Fixed (review pass 1)

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

### Retracted dispute — I7's alias table entry was correct

An earlier draft of this changelog disputed I7's proposed "Base Set" ↔
"Pokemon Game" alias, based on two static fixtures
(`alt-api-capture.json`'s `rawName`, `alt-item-charizard.html`'s gallery
caption) that don't reflect the `brand` facet this library's own
`searchAltValuations`/`mapDocToValuation` actually reads. A live CLI
sanity check against alt's real typesense index (2026-09-20, `node
dist/cli.js --game pokemon --name Charizard --number 4/102 --grader PSA
--grade 9 --year 1999`) proved that dispute wrong: alt's real `brand`
field for the genuine 1999 Base Set Charizard is literally `"Pokemon
Game"`. I7 was right. The alias is now implemented
(`SET_NAME_ALIASES` in `src/alt/match.ts`), applied to both sides of the
compare. A second live check (same query with `--set "Base Set"`, no
`--year`, so set-name matching alone has to carry it) also showed the
real reprint's brand text is `"...Celebrations Classic Collection Base
Set"` — it contains "Base Set" too, which the alias alone can't
separate, so `src/alt/match.ts` also gained the same `REPRINT_FAMILIES`
contradiction check already built for the 130point side (title text
there, brand text here) to keep the two apart regardless. Both live
checks are reproduced as fixture tests using the exact real brand
strings observed. No other alias entries could be verified the same
way, so the table has just this one entry — the code comment documents
where to add further verified ones.

### Added (public API, additive; all optional — see § Backward compatibility)

- `CompSummary.yearUnconfirmed?: boolean`
- `SlabCompsResult.alt.popsUnavailable?: boolean`
- `SlabCompsResult.alt.popsFetchFailed?: boolean` (review pass 2 — see N5)
- `SlabCompsResult.recommended.sampleKind?: 'population' | 'comps'`
- New reasons: `'variety_ambiguous'`, `'pops_unavailable'`, `'year_unconfirmed'`
- New exports: `computeAltSampleSize`, `yearIsConfirmed`
- Every field added in 0.2.0 (`AltValuation.year/variety/name`,
  `CompSummary.excludedNonUsd`, `SlabCompsResult.lowConfidence/reasons`,
  `SlabCompsResult.alt.lowConfidence/reasons`,
  `recommended.sampleSize`) is now typed optional (was required)

### Changed (review pass 2 — pre-release, no consumer ever saw pass 1's shape)

- `computeAltSampleSize(pops, slab)` now returns `number | undefined`
  (was `number`, with an all-grades-sum fallback that N5 retracted) —
  `undefined` when the queried grader+grade bucket isn't reported, never
  a sum across other grades.

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
