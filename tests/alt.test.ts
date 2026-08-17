import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mapDocToValuation } from '../src/alt/client.js'
import { pickValuation } from '../src/alt/match.js'
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

  it('rejects documents without a positive altValue', () => {
    expect(mapDocToValuation({})).toBeNull()
    expect(mapDocToValuation({ altValue: 0 })).toBeNull()
  })
})

describe('pickValuation', () => {
  const mk = (cardNumber: string | null, altValue = 100): AltValuation => ({
    altValue,
    lowerBound: null,
    upperBound: null,
    confidence: null,
    assetId: null,
    brand: null,
    subject: 'Charizard',
    cardNumber,
    gradeKey: 'PSA-10',
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

  it('falls back to first hit when no number given', () => {
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
})
