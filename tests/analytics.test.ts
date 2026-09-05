import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDailySeries, buildMonthlySeries, calculateDailyScore, screenMinutes } from '../src/lib/analytics.ts'

test('daily score caps focus at 65 and weighs minimum habits at sixty percent', () => {
  assert.deepEqual(calculateDailyScore({ focusSeconds: 4 * 3600, focusTargetMinutes: 240, idealHabits: 1, minimumHabits: 1, habitCount: 2 }), { total: 93, focusPoints: 65, habitPoints: 28, focusMaximum: 65, habitMaximum: 35 })
})

test('daily series separates focus and passive screen time', () => {
  const result = buildDailySeries([{ date: '2026-08-29', seconds: 1500 }], [{ date: '2026-08-29', minutes: 45, kind: 'passive' }, { date: '2026-08-29', minutes: 30, kind: 'useful' }], '2026-08-29', 2)
  assert.deepEqual(result, [{ date: '2026-08-28', focusMinutes: 0, passiveMinutes: 0 }, { date: '2026-08-29', focusMinutes: 25, passiveMinutes: 45 }])
})

test('monthly series crosses year boundary safely', () => {
  const result = buildMonthlySeries([{ date: '2025-12-31', seconds: 3600 }, { date: '2026-01-01', seconds: 1800 }], [], '2026-01-20', 2)
  assert.deepEqual(result.map((item) => [item.key, item.focusMinutes]), [['2025-12', 60], ['2026-01', 30]])
})

test('unclassified screen entries remain separate from passive time', () => {
  const entries = [{ date: '2026-08-29', minutes: 20 }, { date: '2026-08-29', minutes: 35, kind: 'passive' as const }]
  assert.equal(screenMinutes(entries, 'passive'), 35)
  assert.equal(screenMinutes(entries, 'unclassified'), 20)
})
