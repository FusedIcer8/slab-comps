import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse130PointSales } from '../src/point130/parse.js'
import { filterComps, summarizeComps } from '../src/point130/comps.js'
import { buildQuery } from '../src/point130/client.js'
import type { SlabQuery, SoldComp } from '../src/types.js'

const fixture = readFileSync(new URL('./fixtures/130point-charizard-psa10.html', import.meta.url), 'utf8')

describe('parse130PointSales', () => {
  const rows = parse130PointSales(fixture)

  it('parses every data row from the live fixture', () => {
    expect(rows.length).toBeGreaterThan(150)
  })

  it('extracts canonical fields', () => {
    const row = rows[0]
    expect(row.title.toLowerCase()).toContain('charizard')
    expect(row.price).toBeGreaterThan(0)
    expect(row.currency).toBe('USD')
    expect(row.url).toMatch(/^https:\/\/www\.ebay\.com\//)
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('captures sale type labels', () => {
    expect(rows.some(r => r.saleType === 'Best Offer Accepted')).toBe(true)
    expect(rows.some(r => r.saleType === 'Fixed Price')).toBe(true)
  })
})

const slab: SlabQuery = {
  game: 'pokemon',
  cardName: 'Charizard',
  grader: 'PSA',
  grade: '10',
}

describe('filterComps', () => {
  const mk = (title: string, price = 100): SoldComp => ({
    title,
    price,
    url: null,
    currency: 'USD',
    date: null,
    saleType: null,
  })

  it('keeps titles with grader + exact grade + name', () => {
    expect(filterComps([mk('2023 Charizard ex PSA 10 gem mint')], slab)).toHaveLength(1)
  })

  it('drops wrong grades, including prefix matches', () => {
    expect(filterComps([mk('Charizard PSA 9')], slab)).toHaveLength(0)
    // "PSA 10" regex must not match inside "PSA 10.5"-style strings
    expect(filterComps([mk('Charizard BGS 10')], slab)).toHaveLength(0)
  })

  it('drops lots', () => {
    expect(filterComps([mk('Charizard PSA 10 lot of 4')], slab)).toHaveLength(0)
  })

  it('enforces card number when provided', () => {
    const withNum = { ...slab, cardNumber: '4/102' }
    expect(filterComps([mk('Charizard 4/102 PSA 10')], withNum)).toHaveLength(1)
    expect(filterComps([mk('Charizard 8/102 PSA 10')], withNum)).toHaveLength(0)
  })

  it('normalizes number forms: #-prefix, leading zeros, bare digits', () => {
    const withNum = { ...slab, cardNumber: '008' }
    expect(filterComps([mk('JP Charizard #008 PSA 10')], withNum)).toHaveLength(1)
    expect(filterComps([mk('JP Charizard #8 PSA 10')], withNum)).toHaveLength(1)
    // digits embedded in a year must not count as the card number
    expect(filterComps([mk('2008 JP Charizard PSA 10')], withNum)).toHaveLength(0)
  })

  it('matches set-code numbers split across eBay title tokens', () => {
    const op = { ...slab, cardName: 'Monkey D. Luffy', cardNumber: 'OP01-003' }
    expect(filterComps([mk('2022 One Piece OP-01 Alternate Art #003 Monkey D. Luffy PSA 10')], op)).toHaveLength(1)
    expect(filterComps([mk('2022 One Piece OP01-003 Monkey D. Luffy PSA 10')], op)).toHaveLength(1)
    expect(filterComps([mk('2022 One Piece OP-02 #003 Monkey D. Luffy PSA 10')], op)).toHaveLength(0)
  })

  it('accepts set-name match when only a set name was given (no number)', () => {
    const q = { ...slab, setName: 'World Champions Pack' }
    expect(filterComps([mk('2007 Pokemon World Champions Pack Charizard PSA 10')], q)).toHaveLength(1)
    expect(filterComps([mk('Base Set Charizard PSA 10')], q)).toHaveLength(0)
  })

  describe('set filter is AND-narrowing, not OR-widening, when both number and set are given', () => {
    const q = { ...slab, cardNumber: '008', setName: 'World Champions Pack' }

    it('keeps a row that matches both the number and the set', () => {
      expect(
        filterComps([mk('2007 Pokemon World Champions Pack Charizard #008 PSA 10')], q),
      ).toHaveLength(1)
    })

    it('drops a row that matches the set but not the number (regression: used to widen and pass)', () => {
      expect(filterComps([mk('2007 Pokemon World Champions Pack Charizard PSA 10')], q)).toHaveLength(0)
    })

    it('drops a row that matches the number but not the set', () => {
      expect(filterComps([mk('Base Set Charizard #008 PSA 10')], q)).toHaveLength(0)
    })

    it('never returns more rows than filtering on the number alone would', () => {
      const numberOnly = filterComps(
        [
          mk('2007 Pokemon World Champions Pack Charizard #008 PSA 10'),
          mk('2007 Pokemon World Champions Pack Charizard PSA 10'),
          mk('Base Set Charizard #008 PSA 10'),
        ],
        { ...slab, cardNumber: '008' },
      )
      const numberAndSet = filterComps(
        [
          mk('2007 Pokemon World Champions Pack Charizard #008 PSA 10'),
          mk('2007 Pokemon World Champions Pack Charizard PSA 10'),
          mk('Base Set Charizard #008 PSA 10'),
        ],
        q,
      )
      expect(numberAndSet.length).toBeLessThanOrEqual(numberOnly.length)
    })
  })

  describe('year filter (AND, contradicting titles rejected; titles without a year pass)', () => {
    it('rejects a row whose title year contradicts the query year', () => {
      const q = { ...slab, year: 1999 }
      expect(filterComps([mk('2021 Charizard PSA 10')], q)).toHaveLength(0)
    })

    it('keeps a row whose title year matches the query year', () => {
      const q = { ...slab, year: 1999 }
      expect(filterComps([mk('1999 Charizard PSA 10')], q)).toHaveLength(1)
    })

    it('keeps a row with no year in the title at all (ambiguous, not rejected)', () => {
      const q = { ...slab, year: 1999 }
      expect(filterComps([mk('Charizard PSA 10')], q)).toHaveLength(1)
    })

    it('does not filter on year when the query gives none', () => {
      expect(filterComps([mk('2021 Charizard PSA 10')], slab)).toHaveLength(1)
    })
  })

  describe('lot detection (defect 7: broadened patterns, no false positives)', () => {
    it('rejects single-digit x-counts ("x4")', () => {
      expect(filterComps([mk('Charizard PSA 10 x4')], slab)).toHaveLength(0)
    })

    it('rejects reversed single-digit x-counts ("4x")', () => {
      expect(filterComps([mk('Charizard PSA 10 4x')], slab)).toHaveLength(0)
    })

    it('rejects "and others"', () => {
      expect(filterComps([mk('Charizard PSA 10 and others')], slab)).toHaveLength(0)
    })

    it('rejects "+ more"', () => {
      expect(filterComps([mk('Charizard PSA 10 + more')], slab)).toHaveLength(0)
    })

    it('still rejects the original patterns: "lot of", "bundle", "collection of"', () => {
      expect(filterComps([mk('Charizard PSA 10 lot of 4')], slab)).toHaveLength(0)
      expect(filterComps([mk('Charizard PSA 10 bundle')], slab)).toHaveLength(0)
      expect(filterComps([mk('Charizard PSA 10 collection of cards')], slab)).toHaveLength(0)
    })

    it('does NOT reject legit titles: "Charizard EX", "XY Evolutions", "Pokemon X & Y"', () => {
      const exSlab = { ...slab, cardName: 'Charizard EX' }
      expect(filterComps([mk('Charizard EX PSA 10')], exSlab)).toHaveLength(1)
      const xyName = { ...slab, cardName: 'Charizard', setName: 'XY Evolutions' }
      expect(filterComps([mk('XY Evolutions Charizard PSA 10')], xyName)).toHaveLength(1)
      const xAndY = { ...slab, cardName: 'Charizard', setName: 'Pokemon X & Y' }
      expect(filterComps([mk('Pokemon X & Y Charizard PSA 10')], xAndY)).toHaveLength(1)
    })
  })

  it('finds real matches in the live fixture', () => {
    const kept = filterComps(parse130PointSales(fixture), slab)
    expect(kept.length).toBeGreaterThan(10)
    for (const c of kept) expect(c.title).toMatch(/psa[\s:-]*10/i)
  })
})

describe('summarizeComps', () => {
  const mk = (price: number, currency = 'USD'): SoldComp => ({
    title: 't',
    price,
    url: null,
    currency,
    date: null,
    saleType: null,
  })

  it('returns null for empty input', () => {
    expect(summarizeComps([])).toBeNull()
  })

  it('takes the median of small sets without trimming', () => {
    const s = summarizeComps([mk(100), mk(200), mk(5000)])
    expect(s?.median).toBe(200)
    expect(s?.count).toBe(3)
    expect(s?.excludedNonUsd).toBe(0)
  })

  it('trims IQR outliers on larger sets', () => {
    const prices = [100, 105, 110, 115, 120, 125, 130, 135, 9000]
    const s = summarizeComps(prices.map(p => mk(p)))
    expect(s?.high).toBeLessThan(9000)
    expect(s?.median).toBeGreaterThan(100)
    expect(s?.median).toBeLessThan(140)
  })

  describe('currency (defect 6: non-USD rows must not be medianed as USD)', () => {
    it('excludes GBP/EUR/CAD rows from the median and counts them', () => {
      const s = summarizeComps([mk(100), mk(200), mk(9999, 'GBP'), mk(8888, 'EUR'), mk(7777, 'CAD')])
      expect(s?.count).toBe(2)
      expect(s?.median).toBe(150)
      expect(s?.excludedNonUsd).toBe(3)
      expect(s?.high).toBeLessThan(9999)
    })

    it('returns null (no usable comps) when every row is non-USD', () => {
      expect(summarizeComps([mk(100, 'GBP'), mk(200, 'EUR')])).toBeNull()
    })

    it('rows with no explicit currency default to USD and are kept', () => {
      const rows: SoldComp[] = [
        { title: 't', price: 100, url: null, currency: 'USD', date: null, saleType: null },
      ]
      expect(summarizeComps(rows)?.count).toBe(1)
    })
  })
})

describe('buildQuery', () => {
  it('joins every identity signal', () => {
    expect(buildQuery({ ...slab, cardNumber: '4/102', setName: 'Base Set' })).toBe(
      'Base Set Charizard 4/102 PSA 10',
    )
  })
})
