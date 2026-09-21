import { describe, expect, it } from 'vitest'
import { buildRecommendation, computeAltSampleSize, type AltLeg } from '../src/comps.js'
import type { AltValuation, CardPop, CompSummary, SlabQuery } from '../src/types.js'

const mkAlt = (
  altValue: number,
  sampleSize: number | undefined,
  overrides: Partial<AltLeg> = {},
): AltLeg => ({
  valuation: {
    altValue,
    lowerBound: null,
    upperBound: null,
    confidence: null,
    assetId: 'asset-1',
    brand: null,
    subject: 'Charizard',
    cardNumber: '4',
    gradeKey: 'PSA-9',
    year: null,
    variety: null,
    name: null,
  } satisfies AltValuation,
  pops: [],
  sampleSize,
  popsFetchFailed: false,
  popsUnavailable: sampleSize == null,
  lowConfidence: false,
  reasons: [],
  ...overrides,
})

const mkPoint130 = (median: number, count: number, overrides: Partial<CompSummary> = {}): CompSummary => ({
  median,
  count,
  low: median,
  high: median,
  comps: [],
  excludedNonUsd: 0,
  ...overrides,
})

const HEALTHY_N = 50

describe('buildRecommendation', () => {
  it('prefers alt by default when both are present and healthy', () => {
    const { recommended, lowConfidence, reasons } = buildRecommendation(
      mkAlt(1000, HEALTHY_N),
      mkPoint130(1050, 10),
    )
    expect(recommended).toEqual({ value: 1000, source: 'alt', sampleSize: 50, sampleKind: 'population' })
    expect(lowConfidence).toBe(false)
    expect(reasons).toEqual([])
  })

  it('falls back to 130point when alt is absent', () => {
    const { recommended } = buildRecommendation(null, mkPoint130(500, 10))
    expect(recommended).toEqual({ value: 500, source: '130point', sampleSize: 10, sampleKind: 'comps' })
  })

  it('falls back to alt when 130point is absent', () => {
    const { recommended } = buildRecommendation(mkAlt(1000, HEALTHY_N), null)
    expect(recommended?.source).toBe('alt')
    expect(recommended?.sampleSize).toBe(50)
  })

  it('returns null when neither source has data', () => {
    const { recommended, lowConfidence } = buildRecommendation(null, null)
    expect(recommended).toBeNull()
    expect(lowConfidence).toBe(false)
  })

  describe('sources_disagree (defect 3)', () => {
    it('flags disagreement beyond the default 3x ratio', () => {
      const { lowConfidence, reasons } = buildRecommendation(mkAlt(1000, HEALTHY_N), mkPoint130(4000, 10))
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('sources_disagree')
    })

    it('does not flag disagreement within the ratio', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, HEALTHY_N), mkPoint130(2500, 10))
      expect(reasons).not.toContain('sources_disagree')
    })

    it('honors a configured disagreementRatio', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, HEALTHY_N), mkPoint130(2500, 10), {
        disagreementRatio: 2,
      })
      expect(reasons).toContain('sources_disagree')
    })

    it('does not change which source is recommended just because they disagree', () => {
      const { recommended } = buildRecommendation(mkAlt(1000, HEALTHY_N), mkPoint130(4000, 10))
      expect(recommended?.source).toBe('alt')
    })
  })

  describe('thin_sample (defect 3)', () => {
    it('flags thin_sample when the chosen source (alt) has n below minSample', () => {
      const { lowConfidence, reasons } = buildRecommendation(mkAlt(1000, 1), null)
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('thin_sample')
    })

    it('flags thin_sample when the chosen source (130point) has n below minSample', () => {
      const { reasons } = buildRecommendation(null, mkPoint130(500, 2))
      expect(reasons).toContain('thin_sample')
    })

    it('honors a configured minSample', () => {
      const { reasons } = buildRecommendation(null, mkPoint130(500, 5), { minSample: 6 })
      expect(reasons).toContain('thin_sample')
    })
  })

  describe('N5 (CONTROLLER RULING): population is not a sales sample — alt-first always, thin alt only flags, never switches', () => {
    it('stays on alt even when alt is thin and 130point is healthy — flags thin_sample instead of switching', () => {
      const { recommended, reasons } = buildRecommendation(mkAlt(1000, 1), mkPoint130(1050, 20))
      expect(recommended?.source).toBe('alt')
      expect(recommended?.value).toBe(1000)
      expect(reasons).toContain('thin_sample')
    })

    it('stays on alt even when alt sample is 0 (a confirmed, genuinely tiny population) and 130point has hundreds', () => {
      const { recommended, reasons } = buildRecommendation(mkAlt(1000, 0), mkPoint130(1050, 500))
      expect(recommended?.source).toBe('alt')
      expect(reasons).toContain('thin_sample')
    })

    it('stays on alt when both are thin', () => {
      const { recommended } = buildRecommendation(mkAlt(1000, 1), mkPoint130(1050, 1))
      expect(recommended?.source).toBe('alt')
    })

    it('never flags thin_sample for an alt sample that is merely UNKNOWN (no bucket, not a fetch failure)', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, undefined), mkPoint130(1050, 20))
      expect(reasons).not.toContain('thin_sample')
      expect(reasons).toContain('pops_unavailable')
    })

    it('never switches to 130point for an unknown alt sample either', () => {
      const { recommended } = buildRecommendation(mkAlt(1000, undefined), mkPoint130(1050, 20))
      expect(recommended?.source).toBe('alt')
    })
  })

  describe('identity_weak / alt_low_confidence pass-through (defects 1 & 4)', () => {
    it('surfaces identity_weak from the alt match onto the top-level result', () => {
      const { lowConfidence, reasons } = buildRecommendation(
        mkAlt(1000, HEALTHY_N, { lowConfidence: true, reasons: ['identity_weak'] }),
        null,
      )
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('identity_weak')
    })

    it('surfaces alt_low_confidence from the alt match onto the top-level result', () => {
      const { reasons } = buildRecommendation(
        mkAlt(1000, HEALTHY_N, { lowConfidence: true, reasons: ['alt_low_confidence'] }),
        null,
      )
      expect(reasons).toContain('alt_low_confidence')
    })
  })

  describe('count/sampleSize is always present per source (defect 5)', () => {
    it('point130 sampleSize mirrors CompSummary.count, sampleKind is "comps"', () => {
      const { recommended } = buildRecommendation(null, mkPoint130(500, 17))
      expect(recommended?.sampleSize).toBe(17)
      expect(recommended?.sampleKind).toBe('comps')
    })

    it('alt sampleSize is whatever computeAltSampleSize produced, sampleKind is "population"', () => {
      const { recommended } = buildRecommendation(mkAlt(1000, 42), null)
      expect(recommended?.sampleSize).toBe(42)
      expect(recommended?.sampleKind).toBe('population')
    })
  })

  describe('N5: pops_unavailable — fetch failure vs merely-missing bucket', () => {
    it('flags pops_unavailable for a genuine fetch failure', () => {
      const { lowConfidence, reasons } = buildRecommendation(
        mkAlt(1000, undefined, { popsFetchFailed: true, popsUnavailable: true }),
        null,
      )
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('pops_unavailable')
    })

    it('flags pops_unavailable for a merely-missing grader+grade bucket too (fetch succeeded)', () => {
      const { reasons } = buildRecommendation(
        mkAlt(1000, undefined, { popsFetchFailed: false, popsUnavailable: true }),
        null,
      )
      expect(reasons).toContain('pops_unavailable')
    })

    it('reports an undefined sampleSize (not 0, not a sum) when pops are unavailable', () => {
      const { recommended } = buildRecommendation(mkAlt(1000, undefined, { popsUnavailable: true }), null)
      expect(recommended?.sampleSize).toBeUndefined()
    })
  })

  describe('M8: year_unconfirmed passes through from point130.yearUnconfirmed', () => {
    it('flags year_unconfirmed when point130 reports it', () => {
      const { lowConfidence, reasons } = buildRecommendation(
        null,
        mkPoint130(500, 10, { yearUnconfirmed: true }),
      )
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('year_unconfirmed')
    })

    it('does not flag year_unconfirmed when absent/false', () => {
      const { reasons } = buildRecommendation(null, mkPoint130(500, 10))
      expect(reasons).not.toContain('year_unconfirmed')
    })
  })

  describe('M9: options are clamped to sane ranges, else defaults are used', () => {
    it('ignores a disagreementRatio <= 1 and falls back to the default (3)', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, HEALTHY_N), mkPoint130(1500, 10), {
        disagreementRatio: 1,
      })
      // 1500/1000 = 1.5x, below the default 3x — must NOT flag despite the
      // caller passing a degenerate ratio of 1 (would otherwise always fire)
      expect(reasons).not.toContain('sources_disagree')
    })

    it('ignores a negative disagreementRatio', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, HEALTHY_N), mkPoint130(1500, 10), {
        disagreementRatio: -5,
      })
      expect(reasons).not.toContain('sources_disagree')
    })

    it('ignores a minSample < 1 and falls back to the default (3)', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, 2), null, { minSample: 0 })
      // n=2 is still below the default floor of 3
      expect(reasons).toContain('thin_sample')
    })
  })
})

describe('computeAltSampleSize (N5: only the queried grader+grade bucket counts — never an all-grades sum)', () => {
  const slab: SlabQuery = { game: 'pokemon', cardName: 'Charizard', grader: 'PSA', grade: '9', cardNumber: '4' }

  it('uses the queried grader+grade bucket when alt reports one', () => {
    const pops: CardPop[] = [
      { gradingCompany: 'PSA', gradeNumber: '9', count: 5 },
      { gradingCompany: 'PSA', gradeNumber: '10', count: 5000 },
    ]
    expect(computeAltSampleSize(pops, slab)).toBe(5)
  })

  it('is undefined (NOT a sum) when the specific bucket is absent', () => {
    const pops: CardPop[] = [
      { gradingCompany: 'PSA', gradeNumber: '8', count: 10 },
      { gradingCompany: 'PSA', gradeNumber: '10', count: 20 },
    ]
    expect(computeAltSampleSize(pops, slab)).toBeUndefined()
  })

  it('does not match a different grader\'s bucket for the same grade number', () => {
    const pops: CardPop[] = [{ gradingCompany: 'BGS', gradeNumber: '9', count: 9999 }]
    expect(computeAltSampleSize(pops, slab)).toBeUndefined()
  })

  it('is undefined for an empty pops array', () => {
    expect(computeAltSampleSize([], slab)).toBeUndefined()
  })

  it('a confirmed zero-count bucket is a real 0, not undefined', () => {
    const pops: CardPop[] = [{ gradingCompany: 'PSA', gradeNumber: '9', count: 0 }]
    expect(computeAltSampleSize(pops, slab)).toBe(0)
  })
})
