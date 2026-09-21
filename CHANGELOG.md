# Changelog

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
