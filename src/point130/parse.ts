import { load } from 'cheerio'
import type { SoldComp } from '../types.js'

/**
 * Parse the HTML returned by POST back.130point.com/sales/ into sold rows.
 * Row anatomy (one <tr> per sale):
 *   #titleText a          → listing title + eBay URL
 *   #auctionLabel         → "Fixed Price" | "Best Offer Accepted" | "Auction" …
 *   div#dataCol[data-price][data-currency] → canonical numeric sale price
 *   #dateText             → "Date: Mon 17 Aug 2026 01:16:52 GMT"
 */
export function parse130PointSales(html: string): SoldComp[] {
  const $ = load(html)
  const comps: SoldComp[] = []

  $('table tr').each((_, tr) => {
    const row = $(tr)
    const data = row.find('div[data-price]').first()
    if (!data.length) return

    const price = Number(data.attr('data-price'))
    if (!Number.isFinite(price) || price <= 0) return

    const titleEl = row.find('#titleText a').first()
    const title = titleEl.text().trim()
    if (!title) return

    const dateText = row.find('#dateText').text()
    const dateMatch = dateText.match(/Date:\s*(.+?)\s*$/)
    let date: string | null = null
    if (dateMatch) {
      const parsed = new Date(dateMatch[1])
      date = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
    }

    comps.push({
      title,
      url: titleEl.attr('href') ?? null,
      price,
      currency: data.attr('data-currency') ?? 'USD',
      date,
      saleType: row.find('#auctionLabel').first().text().trim() || null,
    })
  })

  return comps
}
