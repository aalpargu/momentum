import assert from 'node:assert/strict'
import test from 'node:test'
import type { FocusSession, ScreenTimeEntry } from '../src/lib/domain.ts'
import { buildProductivityReport, buildWorkSeries, changeText, hourlyFocus, percentageChange, productivityStreak, signalNoise, workTargetDates, socialAppName, weekPeriod, monthPeriod, weeklyReportText } from '../src/lib/productivity.ts'

const focus = (partial: Partial<FocusSession> & Pick<FocusSession, 'id' | 'date' | 'seconds'>): FocusSession => ({ title: 'Coding', area: 'Kariyer', startedAt: `${partial.date}T09:00:00.000Z`, ...partial })
const screen = (partial: Partial<ScreenTimeEntry> & Pick<ScreenTimeEntry, 'id' | 'date' | 'app' | 'minutes'>): ScreenTimeEntry => ({ kind: 'passive', source: 'manual', createdAt: `${partial.date}T20:00:00.000Z`, ...partial })

test('monthly periods handle leap years, unequal month lengths and year boundaries', () => {
  const march = monthPeriod('2024-03-31')
  assert.equal(march.days.length, 31)
  assert.equal(march.previousStart, '2024-02-01')
  assert.equal(march.previousEnd, '2024-02-29')
  assert.equal(monthPeriod('2024-03-14').previousEnd, '2024-02-14')
  assert.equal(monthPeriod('2024-03-14', -1).days.length, 29)
  assert.equal(monthPeriod('2024-01-14', -1).end, '2023-12-31')
  assert.equal(monthPeriod('2025-03-31').previousEnd, '2025-02-28')
})

test('one monthly period drives totals, day averages, subjects, screen time and exports', () => {
  const sessions = [focus({ id: 'prev', date: '2024-02-29', seconds: 7200 }), focus({ id: 'current', date: '2024-03-01', seconds: 3600 }), focus({ id: 'later', date: '2024-03-15', seconds: 1800 })]
  const entries = [screen({ id: 'prev-app', date: '2024-02-29', app: 'Instagram', minutes: 10 }), screen({ id: 'current-app', date: '2024-03-15', app: 'Instagram', minutes: 30 })]
  const report = buildProductivityReport(sessions, entries, '2024-03-31', 0, 'month')
  assert.equal(report.focus.seconds, 5400)
  assert.equal(report.dailyAverageSeconds, 5400 / 31)
  assert.equal(report.previousDayCount, 29)
  assert.equal(report.previousFocus.seconds, 7200)
  assert.equal(report.activities[0].seconds, 5400)
  assert.equal(report.days.reduce((sum, day) => sum + day.focusSeconds, 0), 5400)
  assert.equal(report.socialMinutes, 30)
  assert.equal(report.previousSocialMinutes, 10)
  assert.match(weeklyReportText(report), /Aylık verimlilik raporu/)
  assert.match(weeklyReportText(report), /önceki dönem: 1\/29/)
  const previous = buildProductivityReport(sessions, entries, '2024-03-31', -1, 'month')
  assert.equal(previous.focus.seconds, 7200)
  assert.equal(previous.days.length, 29)
})

test('current week compares Monday-to-today with the same weekdays last week', () => {
  assert.deepEqual(weekPeriod('2026-09-02'), {
    start: '2026-08-31', end: '2026-09-02', days: ['2026-08-31', '2026-09-01', '2026-09-02'],
    previousStart: '2026-08-24', previousEnd: '2026-08-26',
  })
  assert.deepEqual(weekPeriod('2026-09-02', -1).days, ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'])
})

test('social aliases aggregate and missing periods do not pretend to be zero usage', () => {
  assert.equal(socialAppName('  İNSTAGRAM Lite '), 'Instagram')
  assert.equal(socialAppName('Sosyal Medya'), 'Sosyal medya')
  assert.equal(socialAppName('Notion'), null)
  assert.equal(percentageChange(77, 100), -23)
  assert.equal(changeText(percentageChange(77, 100)), '%23 azaldı')
  assert.equal(percentageChange(0, 100), null)
  assert.equal(percentageChange(100, 0), null)
})

test('report groups split timer entries as one session and compares app usage', () => {
  const sessions = [
    focus({ id: 'timer-1-a', timerSessionId: 'timer-1', source: 'timer', date: '2026-09-01', seconds: 1800 }),
    focus({ id: 'timer-1-b', timerSessionId: 'timer-1', source: 'timer', date: '2026-09-02', seconds: 900 }),
    focus({ id: 'manual-1', source: 'manual', date: '2026-09-02', seconds: 900 }),
  ]
  const entries = [
    screen({ id: 'c1', date: '2026-09-02', app: 'Instagram', minutes: 77 }),
    screen({ id: 'p1', date: '2026-08-26', app: 'instagram lite', minutes: 100 }),
    screen({ id: 'c2', date: '2026-09-02', app: 'TikTok', minutes: 30 }),
  ]
  const report = buildProductivityReport(sessions, entries, '2026-09-02')
  assert.equal(report.focus.seconds, 3600)
  assert.equal(report.focus.count, 2)
  assert.equal(report.focus.averageSeconds, 1800)
  assert.equal(report.socialMinutes, 107)
  assert.equal(report.apps.find((app) => app.name === 'Instagram')?.change, -23)
  assert.match(weeklyReportText(report), /Instagram: 1 saat 17 dakika/)
})

test('productive hours use only measured timer intervals and preserve pauses', () => {
  const sessions = [
    focus({ id: 'measured', timerSessionId: 'timer-1', source: 'timer', date: '2026-09-02', seconds: 2700, startedAt: '2026-09-02T06:30:00.000Z', segments: [
      { startedAt: '2026-09-02T06:30:00.000Z', endedAt: '2026-09-02T07:00:00.000Z', offsetMinutes: -180 },
      { startedAt: '2026-09-02T07:15:00.000Z', endedAt: '2026-09-02T07:30:00.000Z', offsetMinutes: -180 },
    ] }),
    focus({ id: 'manual', source: 'manual', date: '2026-09-02', seconds: 7200 }),
  ]
  const hourly = hourlyFocus(sessions)
  assert.equal(hourly.hours[9].seconds, 1800)
  assert.equal(hourly.hours[10].seconds, 900)
  assert.equal(hourly.measuredCount, 1)
  assert.equal(hourly.excludedCount, 1)
})

test('signal-to-noise excludes necessary time and includes useful screen time', () => {
  const metric = signalNoise(
    [focus({ id: 'f1', date: '2026-09-02', seconds: 120 * 60 })],
    [screen({ id: 'useful', date: '2026-09-02', app: 'Docs', minutes: 30, kind: 'useful' }), screen({ id: 'noise', date: '2026-09-02', app: 'Instagram', minutes: 50 }), screen({ id: 'bank', date: '2026-09-02', app: 'Banka', minutes: 10, kind: 'necessary' })],
    '2026-09-01', '2026-09-02',
  )
  assert.equal(metric.signalMinutes, 30)
  assert.equal(metric.noiseMinutes, 50)
  assert.equal(metric.share, 37.5)
  assert.equal(metric.ratio, 0.6)
  assert.equal(metric.excludedMinutes, 10)
})

test('work series aggregates titles for daily, weekly and monthly detail', () => {
  const sessions = [
    focus({ id: 'book', title: 'Kitap', date: '2026-09-01', seconds: 1800 }),
    focus({ id: 'dsa', title: 'DSA', date: '2026-09-02', seconds: 7200 }),
  ]
  const daily = buildWorkSeries(sessions, '2026-09-02', 'day').at(-1)!
  assert.equal(daily.seconds, 7200)
  assert.equal(daily.activities[0].title, 'DSA')
  const weekly = buildWorkSeries(sessions, '2026-09-02', 'week').at(-1)!
  assert.equal(weekly.seconds, 9000)
  assert.equal(buildWorkSeries(sessions, '2026-09-02', 'month').at(-1)!.seconds, 9000)
})

test('current streak waits until today ends before breaking', () => {
  assert.deepEqual(productivityStreak(new Set(['2026-08-30', '2026-08-31', '2026-09-01']), '2026-09-02'), { current: 3, best: 3, activeToday: false, nextMilestone: 7 })
  assert.equal(productivityStreak(new Set(['2026-09-01', '2026-09-02']), '2026-09-02').current, 2)
})

test('eight-hour work chain requires saved target totals, including split manual entries', () => {
  const sessions = [focus({ id: 'a', date: '2026-09-01', seconds: 4 * 3600 }), focus({ id: 'b', date: '2026-09-01', seconds: 4 * 3600 }), focus({ id: 'c', date: '2026-09-02', seconds: 8 * 3600 - 1 })]
  assert.deepEqual([...workTargetDates(sessions, 480)], ['2026-09-01'])
  assert.equal(signalNoise(sessions, [], '2026-09-01', '2026-09-02').share, null)
})
test('a year of ten-hour work days keeps exact month/week totals across year and leap boundaries', () => {
  const sessions = Array.from({ length: 366 }, (_, i) => { const d = new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10); return focus({ id: String(i), date: d, seconds: 36000 }) })
  const months = buildWorkSeries(sessions, '2024-12-31', 'month')
  assert.equal(months.reduce((sum, m) => sum + m.seconds, 0), 366 * 36000)
  assert.equal(months.find(m => m.key === '2024-02')!.seconds, 29 * 36000)
  assert.equal(buildWorkSeries(sessions, '2024-12-31', 'week').at(-1)!.seconds, 2 * 36000)
  assert.equal(productivityStreak(workTargetDates(sessions, 480), '2024-12-31').current, 366)
})
