import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mapDocToValuation } from '../src/alt/client.js'
import { matchValuation, pickValuation } from '../src/alt/match.js'
import type { AltValuation, SlabQuery } from '../src/types.js'

const typesenseFixture = JSON.parse(
  readFileSync(new URL('./fixtures/alt-typesense-charizard.json', import.meta.url), 'utf8'),
)

const slab: SlabQuery = {
  game: 'pokemon-japan',
  cardName: 'Charizard',
  cardNumber: '008',
  grader: 'PSA',
  grade: '10',
}

describe('mapDocToValuation', () => {
  it('maps a live typesense document', () => {
    const doc = typesenseFixture.results[0].hits[0].document
    const v = mapDocToValuation(doc)
    expect(v).not.toBeNull()
    expect(v!.altValue).toBeGreaterThan(0)
    expect(v!.gradeKey).toBe('PSA-10')
    expect(v!.subject).toBe('Charizard')
    expect(v!.lowerBound).toBeLessThan(v!.altValue)
    expect(v!.upperBound).toBeGreaterThan(v!.altValue)
  })

  it('maps year, variety and name through for identity scoring', () => {
    const doc = typesenseFixture.results[0].hits[0].document
    const v = mapDocToValuation(doc)
    expect(v!.year).toBe(2007)
    expect(v!.variety).toBe('1st Edition')
    expect(v!.name).toContain('Charizard')
  })

  it('rejects documents without a positive altValue', () => {
    expect(mapDocToValuation({})).toBeNull()
    expect(mapDocToValuation({ altValue: 0 })).toBeNull()
  })
})

describe('pickValuation', () => {
  const mk = (
    cardNumber: string | null,
    altValue = 100,
    extra: Partial<AltValuation> = {},
  ): AltValuation => ({
    altValue,
    lowerBound: null,
    upperBound: null,
    confidence: null,
    assetId: null,
    brand: null,
    subject: 'Charizard',
    cardNumber,
    gradeKey: 'PSA-10',
    year: null,
    variety: null,
    name: null,
    ...extra,
  })

  it('matches on normalized card number', () => {
    const hit = pickValuation([mk('4'), mk('008')], slab)
    expect(hit?.cardNumber).toBe('008')
  })

  it('normalizes leading zeros and set-size suffixes', () => {
    const v = pickValuation([mk('8')], { ...slab, cardNumber: '008' })
    expect(v).not.toBeNull()
    const v2 = pickValuation([mk('4')], { ...slab, cardNumber: '4/102' })
    expect(v2).not.toBeNull()
  })

  it('returns null when a number is given but nothing matches', () => {
    expect(pickValuation([mk('12')], slab)).toBeNull()
  })

  it('falls back to the best-scored hit when no number given', () => {
    const noNum = { ...slab, cardNumber: undefined }
    expect(pickValuation([mk('12', 55)], noNum)?.altValue).toBe(55)
  })

  it('resolves the live fixture to the World Champions Pack card', () => {
    const valuations = typesenseFixture.results[0].hits
      .map((h: { document: object }) => mapDocToValuation(h.document))
      .filter(Boolean) as AltValuation[]
    const v = pickValuation(valuations, slab)
    expect(v).not.toBeNull()
    expect(v!.brand).toContain('World Champions')
    expect(v!.altValue).toBeGreaterThan(1000)
  })

  describe('reprint collisions (same card number, different set/year)', () => {
    // Base Set Charizard 4/102 (1999) vs Celebrations Classic Collection
    // 4/102 (2021) — same printed number, wildly different values.
    const baseSet: SlabQuery = {
      game: 'pokemon',
      cardName: 'Charizard',
      cardNumber: '4/102',
      grader: 'PSA',
      grade: '9',
    }
    const baseSetHolder = mk('4', 15000, { brand: 'Base Set', year: 1999, variety: 'Unlimited' })
    const celebrationsHolder = mk('4', 400, {
      brand: 'Celebrations Classic Collection',
      year: 2021,
      variety: null,
    })

    it('a query with year 1999 never resolves to the Celebrations reprint', () => {
      const v = pickValuation([celebrationsHolder, baseSetHolder], { ...baseSet, year: 1999 })
      expect(v?.brand).toBe('Base Set')
      expect(v?.altValue).toBe(15000)
    })

    it('a query with year 2021 never resolves to the Base Set original', () => {
      const v = pickValuation([celebrationsHolder, baseSetHolder], { ...baseSet, year: 2021 })
      expect(v?.brand).toBe('Celebrations Classic Collection')
      expect(v?.altValue).toBe(400)
    })

    it('a query with setName "Base Set" resolves to the original, no year given', () => {
      const v = pickValuation([celebrationsHolder, baseSetHolder], {
        ...baseSet,
        setName: 'Base Set',
      })
      expect(v?.brand).toBe('Base Set')
    })

    it('a query with setName "Celebrations" resolves to the reprint, no year given', () => {
      const v = pickValuation([celebrationsHolder, baseSetHolder], {
        ...baseSet,
        setName: 'Celebrations',
      })
      expect(v?.brand).toBe('Celebrations Classic Collection')
    })

    it('same pattern holds for Blastoise 2/102', () => {
      const blastoiseBase = mk('2', 12000, { brand: 'Base Set', year: 1999 })
      const blastoiseReprint = mk('2', 300, { brand: 'Celebrations Classic Collection', year: 2021 })
      const q: SlabQuery = { ...baseSet, cardName: 'Blastoise', cardNumber: '2/102', year: 1999 }
      const v = pickValuation([blastoiseReprint, blastoiseBase], q)
      expect(v?.brand).toBe('Base Set')
    })

    it('same pattern holds for Venusaur 15/102', () => {
      const venusaurBase = mk('15', 9000, { brand: 'Base Set', year: 1999 })
      const venusaurReprint = mk('15', 250, { brand: 'Celebrations Classic Collection', year: 2021 })
      const q: SlabQuery = { ...baseSet, cardName: 'Venusaur', cardNumber: '15/102', year: 2021 }
      const v = pickValuation([venusaurReprint, venusaurBase], q)
      expect(v?.brand).toBe('Celebrations Classic Collection')
    })
  })

  describe('language disambiguation', () => {
    const enHolder = mk('4', 500, { brand: 'Base Set', name: 'Base Set Charizard' })
    const jpHolder = mk('4', 5000, { brand: 'Japanese Base Set', name: 'Japanese Base Set Charizard' })

    it('an unspecified-language query prefers the English candidate when one exists', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '4/102',
        grader: 'PSA',
        grade: '9',
      }
      const v = pickValuation([jpHolder, enHolder], q)
      expect(v?.brand).toBe('Base Set')
    })

    it('an explicit language:"japanese" query picks the Japanese candidate', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '4/102',
        grader: 'PSA',
        grade: '9',
        language: 'japanese',
      }
      const v = pickValuation([enHolder, jpHolder], q)
      expect(v?.brand).toBe('Japanese Base Set')
    })

    it('game "pokemon-japan" defaults the wanted language to japanese', () => {
      const q: SlabQuery = {
        game: 'pokemon-japan',
        cardName: 'Charizard',
        cardNumber: '4/102',
        grader: 'PSA',
        grade: '9',
      }
      const v = pickValuation([enHolder, jpHolder], q)
      expect(v?.brand).toBe('Japanese Base Set')
    })
  })

  describe('variety/variant matching', () => {
    const firstEd = mk('4', 20000, { brand: 'Base Set', variety: '1st Edition' })
    const unlimited = mk('4', 8000, { brand: 'Base Set', variety: 'Unlimited' })

    it('an explicit variant "1st Edition" prefers the 1st Edition holder', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '4/102',
        grader: 'PSA',
        grade: '9',
        variant: '1st Edition',
      }
      expect(pickValuation([unlimited, firstEd], q)?.altValue).toBe(20000)
    })

    it('an explicit variant "Unlimited" prefers the Unlimited holder', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '4/102',
        grader: 'PSA',
        grade: '9',
        variant: 'Unlimited',
      }
      expect(pickValuation([firstEd, unlimited], q)?.altValue).toBe(8000)
    })
  })
})

describe('matchValuation', () => {
  const mk = (
    cardNumber: string | null,
    altValue = 100,
    extra: Partial<AltValuation> = {},
  ): AltValuation => ({
    altValue,
    lowerBound: null,
    upperBound: null,
    confidence: null,
    assetId: null,
    brand: null,
    subject: 'Charizard',
    cardNumber,
    gradeKey: 'PSA-10',
    year: null,
    variety: null,
    name: null,
    ...extra,
  })

  it('flags identity_weak when no number given and nothing else discriminates', () => {
    const q: SlabQuery = { game: 'pokemon', cardName: 'Charizard', grader: 'PSA', grade: '9' }
    const result = matchValuation([mk('4', 100), mk('7', 100)], q)
    expect(result.lowConfidence).toBe(true)
    expect(result.reasons).toContain('identity_weak')
  })

  it('does not flag identity_weak when a number is given and uniquely resolves', () => {
    const q: SlabQuery = { game: 'pokemon', cardName: 'Charizard', cardNumber: '4', grader: 'PSA', grade: '9' }
    const result = matchValuation([mk('4', 100)], q)
    expect(result.reasons).not.toContain('identity_weak')
  })

  it('flags alt_low_confidence when the picked valuation has a low confidence metric', () => {
    const q: SlabQuery = { game: 'pokemon', cardName: 'Charizard', cardNumber: '4', grader: 'PSA', grade: '9' }
    const result = matchValuation([mk('4', 100, { confidence: 30 })], q)
    expect(result.reasons).toContain('alt_low_confidence')
  })

  it('does not flag alt_low_confidence for a healthy confidence metric', () => {
    const q: SlabQuery = { game: 'pokemon', cardName: 'Charizard', cardNumber: '4', grader: 'PSA', grade: '9' }
    const result = matchValuation([mk('4', 100, { confidence: 80 })], q)
    expect(result.reasons).not.toContain('alt_low_confidence')
  })

  it('returns null valuation with no reasons when nothing carries the given number', () => {
    const q: SlabQuery = { game: 'pokemon', cardName: 'Charizard', cardNumber: '99', grader: 'PSA', grade: '9' }
    const result = matchValuation([mk('4', 100)], q)
    expect(result.valuation).toBeNull()
    expect(result.lowConfidence).toBe(false)
  })

  describe('C1: ties among NUMBER-matched candidates (the live path — app never passes variant/year)', () => {
    const q: SlabQuery = { game: 'pokemon', cardName: 'Charizard', cardNumber: '4', grader: 'PSA', grade: '9' }
    // Real-world shape: 1st Edition / Shadowless / Unlimited Base Set
    // Charizard, all #4, no query discriminator tells them apart.
    const firstEd = mk('4', 250_000, { brand: 'Base Set', variety: '1st Edition', confidence: 90 })
    const shadowless = mk('4', 40_000, { brand: 'Base Set', variety: 'Shadowless', confidence: 60 })
    const unlimited = mk('4', 12_000, { brand: 'Base Set', variety: 'Unlimited', confidence: 40 })

    it('flags identity_weak even though a card number WAS given (gate dropped)', () => {
      const result = matchValuation([firstEd, shadowless, unlimited], q)
      expect(result.lowConfidence).toBe(true)
      expect(result.reasons).toContain('identity_weak')
    })

    it('flags variety_ambiguous when tied candidates differ in variety and value spreads > 1.5x', () => {
      const result = matchValuation([firstEd, shadowless, unlimited], q)
      expect(result.reasons).toContain('variety_ambiguous')
    })

    it('never picks the highest-value tied candidate — prefers the empty/Unlimited variety', () => {
      const result = matchValuation([firstEd, shadowless, unlimited], q)
      expect(result.valuation?.variety).toBe('Unlimited')
      expect(result.valuation?.altValue).toBe(12_000)
    })

    it('ignores confidence as a tiebreak (the priciest variety having the highest confidence must not win)', () => {
      // firstEd has the highest confidence (90) of the three — under the old
      // `confidence/1000` nudge this decided the tie and picked firstEd.
      const result = matchValuation([firstEd, shadowless, unlimited], q)
      expect(result.valuation?.variety).not.toBe('1st Edition')
    })

    it('falls back to the LOWEST value when no tied candidate has an empty/Unlimited variety', () => {
      const result = matchValuation([firstEd, shadowless], q)
      expect(result.valuation?.variety).toBe('Shadowless')
      expect(result.valuation?.altValue).toBe(40_000)
    })

    it('is deterministic across input order', () => {
      const a = matchValuation([firstEd, shadowless, unlimited], q)
      const b = matchValuation([unlimited, firstEd, shadowless], q)
      const c = matchValuation([shadowless, unlimited, firstEd], q)
      expect(a.valuation?.altValue).toBe(b.valuation?.altValue)
      expect(b.valuation?.altValue).toBe(c.valuation?.altValue)
    })
  })

  describe('I5: language is a tiebreak, never enough to beat a genuine set match', () => {
    it('a correct-set Japanese candidate beats a wrong-set English candidate', () => {
      // game:'pokemon' (not 'pokemon-japan') and no explicit language, so the
      // default wanted language is English — but the query's own setName is
      // Japan-exclusive. Under the old ±3 (swing 6) language weight this
      // picked the wrong-set English card; set overlap (weight 4) must win.
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '8',
        setName: 'Japanese VMAX Climax',
        grader: 'PSA',
        grade: '10',
      }
      const correctSetJp = mk('8', 3000, { brand: 'Japanese VMAX Climax' })
      const wrongSetEn = mk('8', 50, { brand: 'Sword and Shield Base Set' })
      const result = matchValuation([wrongSetEn, correctSetJp], q)
      expect(result.valuation?.brand).toBe('Japanese VMAX Climax')
    })

    it('flags identity_weak when the lone surviving candidate matches neither the given set nor year', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '4',
        setName: 'Celebrations',
        year: 2021,
        grader: 'PSA',
        grade: '9',
      }
      // Only one candidate carries #4 — alt data quality issue, or a genuine
      // miss — but it's neither the given set nor the given year.
      const wrong = mk('4', 15_000, { brand: 'Base Set', year: 1999 })
      const result = matchValuation([wrong], q)
      expect(result.valuation).not.toBeNull()
      expect(result.lowConfidence).toBe(true)
      expect(result.reasons).toContain('identity_weak')
    })

    it('widened language regex recognizes "JP"/"JPN" alongside "Japan(ese)"', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '8',
        language: 'japanese',
        grader: 'PSA',
        grade: '10',
      }
      const jpAbbrev = mk('8', 3000, { brand: 'JP World Champions Pack' })
      const jpnAbbrev = mk('8', 10, { brand: 'Something Unrelated', name: null })
      const result = matchValuation([jpnAbbrev, jpAbbrev], q)
      expect(result.valuation?.brand).toBe('JP World Champions Pack')
    })
  })

  describe('I7: set-overlap penalizes a different-edition candidate, no false full-score tie', () => {
    it('"Base Set" scores higher against "Base Set" than against "Base Set 2" (extra edition token "2")', () => {
      const q: SlabQuery = {
        game: 'pokemon',
        cardName: 'Charizard',
        cardNumber: '4',
        setName: 'Base Set',
        grader: 'PSA',
        grade: '9',
      }
      const correct = mk('4', 15_000, { brand: 'Base Set' })
      // "Base Set 2" is a real, different, much later expansion — same two
      // query tokens ("base","set") both present, but it's not a match.
      const differentSet = mk('4', 5, { brand: 'Pokemon Base Set 2' })
      const result = matchValuation([differentSet, correct], q)
      expect(result.valuation?.brand).toBe('Base Set')
    })
  })
})
