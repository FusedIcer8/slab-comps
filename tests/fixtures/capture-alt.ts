// One-off fixture capture: renders alt.xyz pages and saves final HTML.
// Run: npx tsx tests/fixtures/capture-alt.ts
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const PAGES: Array<[string, string]> = [
  ['https://alt.xyz/exchange?query=charizard%20world%20champions%20psa%2010', 'alt-search-charizard.html'],
  ['https://alt.xyz/itm/575242f2-f6bf-40b0-ae70-56ed355aab55', 'alt-item-charizard.html'],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [url, file] of PAGES) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('a[href*="/itm/"], h1', { timeout: 30_000 }).catch(() => {})
  if (url.includes('/itm/')) {
    // LT Value / pops / transactions lazy-load; scroll to trigger, then wait for them
    await page.mouse.wheel(0, 2000)
    await page.getByText('LT Value').waitFor({ timeout: 20_000 }).catch(() => {})
    await page.getByText('Recent transactions').waitFor({ timeout: 20_000 }).catch(() => {})
  }
  await page.waitForTimeout(5000)
  writeFileSync(new URL(file, import.meta.url), await page.content())
  console.log(`saved ${file}`)
}
await browser.close()
