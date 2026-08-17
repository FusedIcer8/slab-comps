import type { SlabCompsResult, SlabQuery } from './types.js'
import { get130PointComps } from './point130/client.js'
import { getCardPops, searchAltValuations } from './alt/client.js'
import { pickValuation } from './alt/match.js'

/**
 * Fetch comps for one slab from both sources. Each source fails
 * independently — both are unofficial endpoints that can break or block
 * at any time, so a result always comes back; check `errors` and fall
 * back to manual entry when both legs are null.
 */
export async function getSlabComps(slab: SlabQuery): Promise<SlabCompsResult> {
  const errors: string[] = []

  const [altResult, point130Result] = await Promise.allSettled([
    (async () => {
      const valuation = pickValuation(await searchAltValuations(slab), slab)
      if (!valuation) return null
      const pops = valuation.assetId ? await getCardPops(valuation.assetId).catch(() => []) : []
      return { valuation, pops }
    })(),
    get130PointComps(slab),
  ])

  const alt = altResult.status === 'fulfilled' ? altResult.value : null
  if (altResult.status === 'rejected') errors.push(`alt: ${altResult.reason}`)

  const point130 = point130Result.status === 'fulfilled' ? point130Result.value : null
  if (point130Result.status === 'rejected') errors.push(`130point: ${point130Result.reason}`)

  const recommended = alt
    ? { value: alt.valuation.altValue, source: 'alt' as const }
    : point130
      ? { value: point130.median, source: '130point' as const }
      : null

  return { query: slab, alt, point130, recommended, errors }
}
