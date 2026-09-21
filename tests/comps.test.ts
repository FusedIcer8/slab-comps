import { describe, expect, it } from 'vitest'
import { buildRecommendation, type AltLeg } from '../src/comps.js'
import type { AltValuation, CardPop, CompSummary } from '../src/types.js'

const mkAlt = (altValue: number, pops: CardPop[] = [], overrides: Partial<AltLeg> = {}): AltLeg => ({
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
  pops,
  lowConfidence: false,
  reasons: [],
  ...overrides,
})

const mkPoint130 = (median: number, count: number): CompSummary => ({
  median,
  count,
  low: median,
  high: median,
  comps: [],
  excludedNonUsd: 0,
})

const healthyPops: CardPop[] = [{ gradingCompany: 'PSA', gradeNumber: '9', count: 50 }]

describe('buildRecommendation', () => {
  it('prefers alt by default when both are present and healthy', () => {
    const { recommended, lowConfidence, reasons } = buildRecommendation(
      mkAlt(1000, healthyPops),
      mkPoint130(1050, 10),
    )
    expect(recommended).toEqual({ value: 1000, source: 'alt', sampleSize: 50 })
    expect(lowConfidence).toBe(false)
    expect(reasons).toEqual([])
  })

  it('falls back to 130point when alt is absent', () => {
    const { recommended } = buildRecommendation(null, mkPoint130(500, 10))
    expect(recommended).toEqual({ value: 500, source: '130point', sampleSize: 10 })
  })

  it('falls back to alt when 130point is absent', () => {
    const { recommended } = buildRecommendation(mkAlt(1000, healthyPops), null)
    expect(recommended).toEqual({ value: 1000, source: 'alt', sampleSize: 50 })
  })

  it('returns null when neither source has data', () => {
    const { recommended, lowConfidence } = buildRecommendation(null, null)
    expect(recommended).toBeNull()
    expect(lowConfidence).toBe(false)
  })

  describe('sources_disagree (defect 3)', () => {
    it('flags disagreement beyond the default 3x ratio', () => {
      const { lowConfidence, reasons } = buildRecommendation(mkAlt(1000, healthyPops), mkPoint130(4000, 10))
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('sources_disagree')
    })

    it('does not flag disagreement within the ratio', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, healthyPops), mkPoint130(2500, 10))
      expect(reasons).not.toContain('sources_disagree')
    })

    it('honors a configured disagreementRatio', () => {
      const { reasons } = buildRecommendation(mkAlt(1000, healthyPops), mkPoint130(2500, 10), {
        disagreementRatio: 2,
      })
      expect(reasons).toContain('sources_disagree')
    })

    it('does not change which source is recommended just because they disagree', () => {
      const { recommended } = buildRecommendation(mkAlt(1000, healthyPops), mkPoint130(4000, 10))
      expect(recommended?.source).toBe('alt')
    })
  })

  describe('thin_sample (defect 3)', () => {
    it('flags thin_sample when the chosen source (alt) has n below minSample', () => {
      const { lowConfidence, reasons } = buildRecommendation(
        mkAlt(1000, [{ gradingCompany: 'PSA', gradeNumber: '9', count: 1 }]),
        null,
      )
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

    it('switches the recommendation to 130point when alt is thin and 130point is not', () => {
      const { recommended, reasons } = buildRecommendation(
        mkAlt(1000, [{ gradingCompany: 'PSA', gradeNumber: '9', count: 1 }]),
        mkPoint130(1050, 20),
      )
      expect(recommended?.source).toBe('130point')
      // the CHOSEN source (130point, n=20) is not thin, so no thin_sample flag
      expect(reasons).not.toContain('thin_sample')
    })

    it('keeps alt as recommended when both are thin (no reconciliation possible)', () => {
      const { recommended } = buildRecommendation(
        mkAlt(1000, [{ gradingCompany: 'PSA', gradeNumber: '9', count: 1 }]),
        mkPoint130(1050, 1),
      )
      expect(recommended?.source).toBe('alt')
    })
  })

  describe('identity_weak / alt_low_confidence pass-through (defects 1 & 4)', () => {
    it('surfaces identity_weak from the alt match onto the top-level result', () => {
      const { lowConfidence, reasons } = buildRecommendation(
        mkAlt(1000, healthyPops, { lowConfidence: true, reasons: ['identity_weak'] }),
        null,
      )
      expect(lowConfidence).toBe(true)
      expect(reasons).toContain('identity_weak')
    })

    it('surfaces alt_low_confidence from the alt match onto the top-level result', () => {
      const { reasons } = buildRecommendation(
        mkAlt(1000, healthyPops, { lowConfidence: true, reasons: ['alt_low_confidence'] }),
        null,
      )
      expect(reasons).toContain('alt_low_confidence')
    })
  })

  describe('count/sampleSize is always present per source (defect 5)', () => {
    it('point130 sampleSize mirrors CompSummary.count', () => {
      const { recommended } = buildRecommendation(null, mkPoint130(500, 17))
      expect(recommended?.sampleSize).toBe(17)
    })

    it('alt sampleSize is the total population count', () => {
      const pops: CardPop[] = [
        { gradingCompany: 'PSA', gradeNumber: '9', count: 30 },
        { gradingCompany: 'PSA', gradeNumber: '10', count: 12 },
      ]
      const { recommended } = buildRecommendation(mkAlt(1000, pops), null)
      expect(recommended?.sampleSize).toBe(42)
    })
  })
})
