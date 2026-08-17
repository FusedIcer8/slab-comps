#!/usr/bin/env node
import { getSlabComps } from './comps.js'
import type { Game, Grader, SlabQuery } from './types.js'

function usage(): never {
  console.error(`Usage: slab-comps --game <game> --name "<card name>" --grader PSA --grade 10 [--number "4/102"] [--set "<set name>"] [--json]

Games: pokemon pokemon-japan onepiece yugioh mtg lorcana gundam riftbound dragonball`)
  process.exit(1)
}

const args = process.argv.slice(2)
function opt(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const game = opt('--game') as Game | undefined
const cardName = opt('--name')
const grader = opt('--grader')?.toUpperCase() as Grader | undefined
const grade = opt('--grade')
if (!game || !cardName || !grader || !grade) usage()

const slab: SlabQuery = {
  game,
  cardName,
  grader,
  grade,
  cardNumber: opt('--number'),
  setName: opt('--set'),
}

const result = await getSlabComps(slab)

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  const { alt, point130, recommended, errors } = result
  console.log(`\n${slab.cardName}${slab.cardNumber ? ` #${slab.cardNumber}` : ''} — ${slab.grader} ${slab.grade} (${slab.game})\n`)
  if (alt) {
    const v = alt.valuation
    console.log(`alt.xyz LT Value : $${v.altValue.toFixed(2)}  (range $${v.lowerBound?.toFixed(0) ?? '?'}–$${v.upperBound?.toFixed(0) ?? '?'})`)
    console.log(`  matched        : ${v.brand ?? ''} ${v.subject ?? ''} #${v.cardNumber ?? '?'} [${v.gradeKey}]`)
    const pop = alt.pops.find(p => p.gradingCompany === slab.grader && parseFloat(p.gradeNumber) === parseFloat(slab.grade))
    if (pop) console.log(`  population     : ${slab.grader} ${slab.grade} pop ${pop.count}`)
  } else {
    console.log('alt.xyz          : no match')
  }
  if (point130) {
    console.log(`130point median  : $${point130.median.toFixed(2)}  (${point130.count} comps, $${point130.low}–$${point130.high})`)
    for (const c of point130.comps.slice(0, 5)) {
      console.log(`  ${c.date?.slice(0, 10) ?? '????-??-??'}  $${String(c.price).padStart(9)}  ${c.saleType ?? ''}  ${c.title.slice(0, 70)}`)
    }
  } else {
    console.log('130point         : no usable comps')
  }
  if (recommended) console.log(`\nrecommended      : $${recommended.value.toFixed(2)} (${recommended.source})`)
  for (const e of errors) console.error(`warning: ${e}`)
}
