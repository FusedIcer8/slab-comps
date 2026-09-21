import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_INTERVAL_MS, throttle } from '../src/point130/client.js'

/**
 * defect 8: the original throttle() read `lastRequestAt` before its own
 * `await`, so concurrent callers invoked in the same microtask (no
 * `await` between them) all observed the same stale value and computed
 * `wait <= 0`, skipping the delay entirely — no spacing was enforced
 * between them at all. Fixed via a promise-chain mutex so each caller's
 * throttle logic only starts once the previous caller's has finished
 * (including its wait).
 */
describe('throttle concurrency', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Runs first deliberately: it asserts "no leftover delay" against a
  // fresh module state, which only holds before any other test in this
  // file has advanced the shared `lastRequestAt`.
  it('does not delay a lone caller with no recent request', async () => {
    const start = Date.now()
    const p = throttle()
    await vi.runAllTimersAsync()
    await p
    // first-ever call (or one long after the last) shouldn't wait a full
    // interval — this guards against a mutex fix that over-serializes.
    expect(Date.now() - start).toBeLessThan(MIN_INTERVAL_MS)
  })

  it('serializes concurrent callers at least MIN_INTERVAL_MS apart', async () => {
    const timestamps: number[] = []

    const calls = [1, 2, 3].map(() =>
      throttle().then(() => {
        timestamps.push(Date.now())
      }),
    )

    await vi.runAllTimersAsync()
    await Promise.all(calls)

    expect(timestamps).toHaveLength(3)
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] - timestamps[i - 1]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS)
    }
  })
})
