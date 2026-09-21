import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse130PointSales } from '../src/point130/parse.js'
import { filterComps, summarizeComps, yearIsConfirmed } from '../src/point130/comps.js'
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

  describe('C2: TCGplayer catalog set names must not collapse recall to zero', () => {
    // Real setNames the consuming app passes — colon-separated, code
    // prefixes (sv/swsh##/sm/xy), and words eBay sellers never title by.
    it('"SV: Scarlet & Violet 151" — title carries only the number+denominator, no set words at all', () => {
      const q = { ...slab, cardNumber: '199/165', setName: 'SV: Scarlet & Violet 151' }
      expect(filterComps([mk('Charizard Ex 199/165 Psa 10')], q)).toHaveLength(1)
    })

    it('"SWSH03: Darkness Ablaze" — title carries a distinctive set word ("darkness")', () => {
      const q = { ...slab, cardName: 'Charizard VMAX', cardNumber: '020/189', setName: 'SWSH03: Darkness Ablaze' }
      expect(
        filterComps([mk('2020 Pokemon Charizard VMAX 020/189 Darkness Ablaze PSA 10')], q),
      ).toHaveLength(1)
    })

    it('"SWSH: Sword & Shield Promo Cards" — title carries "promo", code prefix + stopwords stripped', () => {
      const q = { ...slab, cardNumber: 'SWSH050', setName: 'SWSH: Sword & Shield Promo Cards' }
      expect(filterComps([mk('Pokemon Charizard SWSH050 Black Star Promo PSA 10')], q)).toHaveLength(1)
    })

    it('"Shining Fates: Shiny Vault" — title carries "shiny"/"vault"', () => {
      const q = { ...slab, cardNumber: 'SV107', setName: 'Shining Fates: Shiny Vault' }
      expect(filterComps([mk('Pokemon Charizard SV107 Shiny Vault PSA 10')], q)).toHaveLength(1)
    })

    it('an exact real-world title with denominator but zero set-name words still passes (was fully dropped)', () => {
      const q = { ...slab, cardNumber: '199/165', setName: 'SV: Scarlet & Violet 151' }
      // No "scarlet"/"violet"/"151" anywhere — only the number+denominator.
      expect(filterComps([mk('Charizard Ex 199/165 Psa 10')], q)).toHaveLength(1)
    })

    it('a genuinely unrelated set is still rejected (recall widened, not eliminated)', () => {
      // Bare numerator (no denominator) — the denominator rescue never
      // applies — and no distinctive set word in the title either.
      const q = { ...slab, cardNumber: '4', setName: 'SV: Scarlet & Violet 151' }
      expect(filterComps([mk('Charizard Base Set #4 PSA 10')], q)).toHaveLength(0)
    })

    it('Base Set + 4/102: denominator match does NOT rescue a Celebrations reprint (all 7 rejected)', () => {
      const q = { ...slab, cardNumber: '4/102', setName: 'Base Set' }
      const reprintRows = [
        mk('2021 Pokemon Celebrations Classic Collection Base Set Charizard 4/102 PSA 10'),
        mk('Celebrations Classic Collection Charizard 4/102 PSA 10 Base Set'),
        mk('2021 Charizard 4/102 Celebrations PSA 10'),
        mk('Pokemon 25th Anniversary Celebrations Base Set Charizard 4/102 PSA 10'),
        mk('Charizard Base Set 4/102 Classic Collection PSA 10'),
        mk('2021 Celebrations Charizard 4/102 Base Set PSA 10 Classic Collection'),
        mk('Base Set Charizard 4/102 25th Celebrations PSA 10'),
      ]
      expect(filterComps(reprintRows, q)).toHaveLength(0)
    })

    it('Base Set + 4/102: a genuine 1999 original still passes', () => {
      const q = { ...slab, cardNumber: '4/102', setName: 'Base Set' }
      expect(filterComps([mk('1999 Pokemon Base Set Charizard 4/102 PSA 10')], q)).toHaveLength(1)
    })

    it('Celebrations query rejects a title that reads as pure original (no reprint marker)', () => {
      const q = { ...slab, cardNumber: '4/102', setName: 'Celebrations: Classic Collection' }
      expect(filterComps([mk('1999 Pokemon Base Set Charizard 4/102 PSA 10')], q)).toHaveLength(0)
    })

    it('Celebrations query accepts a title with the reprint marker', () => {
      const q = { ...slab, cardNumber: '4/102', setName: 'Celebrations: Classic Collection' }
      expect(
        filterComps([mk('2021 Pokemon Celebrations Classic Collection Charizard 4/102 PSA 10')], q),
      ).toHaveLength(1)
    })
  })

  describe('I6: lot "x"-count regex must not flag Mega X/Charizard X mechanic suffixes', () => {
    it('does not reject "Charizard X 029 Promo"', () => {
      const q = { ...slab, cardName: 'Charizard X' }
      expect(filterComps([mk('Charizard X 029 Promo PSA 10')], q)).toHaveLength(1)
    })

    it('does not reject "Mega Charizard X 029 Black Star Promo"', () => {
      const q = { ...slab, cardName: 'Mega Charizard X' }
      expect(filterComps([mk('Mega Charizard X 029 Black Star Promo PSA 10')], q)).toHaveLength(1)
    })

    it('does not reject "Mega Charizard X 12/100"', () => {
      const q = { ...slab, cardName: 'Mega Charizard X', cardNumber: '12/100' }
      expect(filterComps([mk('Mega Charizard X 12/100 PSA 10')], q)).toHaveLength(1)
    })

    it('still rejects "and others" and true x-counts alongside "Charizard X"', () => {
      const q = { ...slab, cardName: 'Charizard X' }
      expect(filterComps([mk('Charizard X 029 Promo PSA 10 and others')], q)).toHaveLength(0)
      expect(filterComps([mk('Charizard X 029 Promo PSA 10 x4')], q)).toHaveLength(0)
    })
  })

  describe('M8: year detection ignores incidental digits (cert numbers), only leading/adjacent-to-set-or-Pokemon', () => {
    it('does not reject a row whose only 4-digit token is part of a cert number', () => {
      const q = { ...slab, year: 1999 }
      // "2014" here is a fragment of a PSA cert number, not the print year —
      // the title states no print year at all, so this must pass (ambiguous).
      expect(filterComps([mk('Charizard PSA 10 cert 2014 5531')], q)).toHaveLength(1)
    })

    it('still rejects a leading contradicting year', () => {
      const q = { ...slab, year: 1999 }
      expect(filterComps([mk('2021 Charizard PSA 10')], q)).toHaveLength(0)
    })

    it('still rejects a year adjacent to "Pokemon"', () => {
      const q = { ...slab, year: 1999 }
      expect(filterComps([mk('Charizard Pokemon 2021 PSA 10')], q)).toHaveLength(0)
    })

    it('still rejects a year adjacent to the set name', () => {
      const q = { ...slab, year: 1999, setName: 'Celebrations' }
      expect(filterComps([mk('Charizard Celebrations 2021 PSA 10')], q)).toHaveLength(0)
    })

    it('still keeps a leading confirming year', () => {
      const q = { ...slab, year: 1999 }
      expect(filterComps([mk('1999 Charizard PSA 10')], q)).toHaveLength(1)
    })
  })

  describe('yearIsConfirmed (M8: feeds the year_unconfirmed reason upstream)', () => {
    it('is true when a kept comp states the leading year', () => {
      const rows = [mk('1999 Charizard PSA 10'), mk('Charizard PSA 10')]
      expect(yearIsConfirmed(rows, { ...slab, year: 1999 })).toBe(true)
    })

    it('is false when no kept comp states the year at all (cert-number digits do not count)', () => {
      const rows = [mk('Charizard PSA 10 cert 2014 5531'), mk('Charizard PSA 10')]
      expect(yearIsConfirmed(rows, { ...slab, year: 1999 })).toBe(false)
    })

    it('is true (vacuously) when the query gives no year', () => {
      expect(yearIsConfirmed([mk('Charizard PSA 10')], slab)).toBe(true)
    })
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

  describe('M10: currency is normalized (uppercase+trim); missing/unknown is excluded, not assumed USD', () => {
    it('is case- and whitespace-insensitive for USD', () => {
      const s = summarizeComps([mk(100, ' usd '), mk(200, 'Usd')])
      expect(s?.count).toBe(2)
      expect(s?.excludedNonUsd).toBe(0)
    })

    it('treats an empty/missing currency as unknown, not USD — excluded and counted', () => {
      const s = summarizeComps([mk(100), mk(200, ''), mk(300, '   ')])
      expect(s?.count).toBe(1)
      expect(s?.excludedNonUsd).toBe(2)
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
