import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { getCertRecord } from '../src/cert/index.js'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/cert/${name}`, import.meta.url), 'utf8')

function mockFetch(body: string, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200
  const ok = init.ok ?? (status >= 200 && status < 300)
  return vi.fn(async () =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch
}

describe('getCertRecord — PSA', () => {
  it('maps a found cert to a CertRecord', async () => {
    const fetchImpl = mockFetch(fixture('psa-found.json'))
    const result = await getCertRecord(
      { grader: 'PSA', certNumber: '82575087' },
      { psaToken: 'test-token', fetchImpl },
    )
    expect(result.found).toBe(true)
    expect(result.source).toBe('psa-api')
    expect(result.errors).toEqual([])
    expect(result.record).not.toBeNull()
    expect(result.record!.cardName).toBe('CHARIZARD')
    expect(result.record!.setName).toBe('2023 POKEMON SCARLET & VIOLET 151')
    expect(result.record!.gradeLabel).toBe('PSA 10')
    expect(result.record!.year).toBe('2023')
    expect(result.record!.raw).toBeTruthy()
  })

  it('parses half grades from CardGrade', async () => {
    const fetchImpl = mockFetch(fixture('psa-found-half-grade.json'))
    const result = await getCertRecord(
      { grader: 'PSA', certNumber: '51102384' },
      { psaToken: 'test-token', fetchImpl },
    )
    expect(result.found).toBe(true)
    expect(result.record!.gradeLabel).toBe('PSA 9.5')
  })

  it('returns found:false for a cert-not-found response', async () => {
    const fetchImpl = mockFetch(fixture('psa-not-found.json'))
    const result = await getCertRecord(
      { grader: 'PSA', certNumber: '00000000' },
      { psaToken: 'test-token', fetchImpl },
    )
    expect(result.found).toBe(false)
    expect(result.record).toBeNull()
    expect(result.source).toBe('psa-api')
  })

  it('treats a 404 response as found:false, not a throw', async () => {
    const fetchImpl = mockFetch('{}', { status: 404, ok: false })
    const result = await getCertRecord(
      { grader: 'PSA', certNumber: '00000000' },
      { psaToken: 'test-token', fetchImpl },
    )
    expect(result.found).toBe(false)
    expect(result.record).toBeNull()
  })

  it('throws when no token is provided', async () => {
    await expect(
      getCertRecord({ grader: 'PSA', certNumber: '82575087' }, {}),
    ).rejects.toThrow('psa token required')
  })

  it('throws on transport errors (distinguishable from not-found)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    await expect(
      getCertRecord(
        { grader: 'PSA', certNumber: '82575087' },
        { psaToken: 'test-token', fetchImpl },
      ),
    ).rejects.toThrow()
  })

  it('throws when the network call itself rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    await expect(
      getCertRecord(
        { grader: 'PSA', certNumber: '82575087' },
        { psaToken: 'test-token', fetchImpl },
      ),
    ).rejects.toThrow('network down')
  })
})

describe('getCertRecord — CGC', () => {
  it('parses a found cert page', async () => {
    const fetchImpl = mockFetch(fixture('cgc-found.html'), { status: 200 })
    const result = await getCertRecord({ grader: 'CGC', certNumber: '4310968001' }, { fetchImpl })
    expect(result.found).toBe(true)
    expect(result.source).toBe('cgc-page')
    expect(result.errors).toEqual([])
    expect(result.record).not.toBeNull()
    expect(result.record!.cardName).toBe('Charizard')
    expect(result.record!.setName).toBe('Scarlet & Violet 151')
    expect(result.record!.gradeLabel).toBe('CGC 9.5')
    expect(result.record!.year).toBe('2023')
    expect(result.record!.raw).toBeTruthy()
  })

  it('returns found:false for a not-found page', async () => {
    const fetchImpl = mockFetch(fixture('cgc-not-found.html'), { status: 200 })
    const result = await getCertRecord({ grader: 'CGC', certNumber: '0000000000' }, { fetchImpl })
    expect(result.found).toBe(false)
    expect(result.record).toBeNull()
    expect(result.source).toBe('cgc-page')
  })

  it('throws on transport errors (distinguishable from not-found)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    await expect(
      getCertRecord({ grader: 'CGC', certNumber: '4310968001' }, { fetchImpl }),
    ).rejects.toThrow()
  })

  it('throws when the network call itself rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    await expect(
      getCertRecord({ grader: 'CGC', certNumber: '4310968001' }, { fetchImpl }),
    ).rejects.toThrow('network down')
  })
})
