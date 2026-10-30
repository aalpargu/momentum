import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTimedFocusSessions, updateFocusSession, validateFocusTiming } from '../src/lib/focusTiming.ts'

test('timed sessions persist measured intervals and ignore pauses', () => {
  const sessions = buildTimedFocusSessions({ id: 'timer-1', title: 'Coding', area: 'Kariyer', segments: [
    { startedAt: '2026-09-02T06:30:00.000Z', endedAt: '2026-09-02T07:00:00.000Z' },
    { startedAt: '2026-09-02T07:15:00.000Z', endedAt: '2026-09-02T07:30:00.000Z' },
  ] }, Date.parse('2026-09-02T07:30:00.000Z'))
  assert.equal(sessions.reduce((sum, session) => sum + session.seconds, 0), 2700)
  assert.ok(sessions.every((session) => session.source === 'timer' && session.timerSessionId === 'timer-1'))
  assert.equal(sessions.flatMap((session) => session.segments ?? []).length, 2)
})

test('timing metadata round-trips through validation', () => {
  const segment = { startedAt: '2026-08-20T06:30:00.000Z', endedAt: '2026-08-20T07:00:00.000Z', offsetMinutes: -180 }
  assert.deepEqual(validateFocusTiming({ source: 'timer', timerSessionId: 'timer-1', segments: [segment] }, { date: '2026-08-20', seconds: 1800, startedAt: segment.startedAt }), { source: 'timer', timerSessionId: 'timer-1', segments: [segment] })
})

test('old backups remain valid without optional timing metadata', () => {
  assert.deepEqual(validateFocusTiming({}, { date: '2026-08-20', seconds: 1800, startedAt: '2026-08-20T06:30:00.000Z' }), {})
})

test('duration edits safely turn measured sessions into manual records', () => {
  const session = { id: 'one', title: 'Coding', area: 'Kariyer' as const, seconds: 1800, startedAt: '2026-09-02T06:30:00.000Z', date: '2026-09-02', source: 'timer' as const, timerSessionId: 'timer-1', segments: [{ startedAt: '2026-09-02T06:30:00.000Z', endedAt: '2026-09-02T07:00:00.000Z', offsetMinutes: -180 }] }
  assert.equal(updateFocusSession(session, { title: 'Coding', area: 'Kariyer', seconds: 2400 }).source, 'manual')
  assert.equal(updateFocusSession(session, { title: 'Üniversite', area: 'Eğitim', seconds: 1800 }).source, 'timer')
})

test('crossing local midnight preserves date totals and excludes the overnight pause', () => {
  const start = new Date(2026, 7, 20, 23, 30).toISOString()
  const pause = new Date(2026, 7, 21, 0, 30).toISOString()
  const resume = new Date(2026, 7, 21, 1, 0).toISOString()
  const end = new Date(2026, 7, 21, 1, 30).toISOString()
  const sessions = buildTimedFocusSessions({ id: 'midnight', title: 'Kodlama', area: 'Kariyer', segments: [{ startedAt: start, endedAt: pause }, { startedAt: resume, endedAt: end }] }, Date.parse(end))
  assert.deepEqual(sessions.map(s => [s.date, s.seconds]), [['2026-08-20', 1800], ['2026-08-21', 3600]])
  for (const session of sessions) assert.doesNotThrow(() => validateFocusTiming(session, session))
})
test('fractional seconds across several days remain valid when the timer is finally saved', () => {
  const segments = [1, 2, 3, 4].map(day => ({ startedAt: new Date(2026, 7, day, 12, 0, 0, 0).toISOString(), endedAt: new Date(2026, 7, day, 12, 0, 0, 800).toISOString() }))
  const sessions = buildTimedFocusSessions({ id: 'fractions', title: 'Kodlama', area: 'Kariyer', segments }, Date.parse(segments.at(-1)!.endedAt))
  assert.equal(sessions.reduce((sum, s) => sum + s.seconds, 0), 3)
  for (const session of sessions) assert.doesNotThrow(() => validateFocusTiming(session, session))
})
