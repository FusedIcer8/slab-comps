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

  it('accepts set-name match when the title lacks a number', () => {
    const q = { ...slab, cardNumber: '008', setName: 'World Champions Pack' }
    expect(filterComps([mk('2007 Pokemon World Champions Pack Charizard PSA 10')], q)).toHaveLength(1)
    expect(filterComps([mk('Base Set Charizard PSA 10')], q)).toHaveLength(0)
  })

  it('finds real matches in the live fixture', () => {
    const kept = filterComps(parse130PointSales(fixture), slab)
    expect(kept.length).toBeGreaterThan(10)
    for (const c of kept) expect(c.title).toMatch(/psa[\s:-]*10/i)
  })
})

describe('summarizeComps', () => {
  const mk = (price: number): SoldComp => ({
    title: 't',
    price,
    url: null,
    currency: 'USD',
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
  })

  it('trims IQR outliers on larger sets', () => {
    const prices = [100, 105, 110, 115, 120, 125, 130, 135, 9000]
    const s = summarizeComps(prices.map(mk))
    expect(s?.high).toBeLessThan(9000)
    expect(s?.median).toBeGreaterThan(100)
    expect(s?.median).toBeLessThan(140)
  })
})

describe('buildQuery', () => {
  it('joins every identity signal', () => {
    expect(buildQuery({ ...slab, cardNumber: '4/102', setName: 'Base Set' })).toBe(
      'Base Set Charizard 4/102 PSA 10',
    )
  })
})
