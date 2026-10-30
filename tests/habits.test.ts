import assert from 'node:assert/strict'
import test from 'node:test'
import type { Habit } from '../src/lib/domain.ts'
import { habitIsDue, habitStreak, updateHabitPause } from '../src/lib/habits.ts'

const habit = (update: Partial<Habit> = {}): Habit => ({ id: 'habit-1', icon: '✨', name: 'Test', area: 'Kişisel', minimum: '1', ideal: '2', ...update })

test('habits without a schedule are due every day', () => {
  assert.equal(habitIsDue(habit(), '2026-09-13'), true)
  assert.equal(habitIsDue(habit(), '2026-09-14'), true)
})

test('scheduled habits are due only on selected weekdays', () => {
  const weekdays = habit({ scheduleDays: [1, 3, 5] })
  assert.equal(habitIsDue(weekdays, '2026-09-14'), true)
  assert.equal(habitIsDue(weekdays, '2026-09-15'), false)
})

test('paused and archived habits do not become due', () => {
  assert.equal(habitIsDue(habit({ pausedUntil: '2026-09-15' }), '2026-09-15'), false)
  assert.equal(habitIsDue(habit({ pausedUntil: '2026-09-15' }), '2026-09-16'), true)
  assert.equal(habitIsDue(habit({ archived: true }), '2026-09-16'), false)
})

test('scheduled habit streak skips rest days, grants today grace, and breaks on a missed due day', () => {
  const habit = { id: 'h', name: 'Oku', icon: '📖', area: 'Bilgi', minimum: '1', ideal: '2', scheduleDays: [1, 3, 5] }
  const log = { '2026-09-07': { h: { status: 'minimum' } }, '2026-09-09': { h: { status: 'ideal' } }, '2026-09-11': { h: { status: 'ideal' } } }
  assert.equal(habitStreak(habit, log, '2026-09-14'), 3)
  assert.equal(habitStreak(habit, log, '2026-09-15'), 0)
  assert.equal(habitStreak(habit, log, '2026-09-13'), 3)
})

test('explicit pause days preserve prior streak and early resumption closes the pause', () => {
  const habit = { id: 'h', name: 'Oku', icon: '📖', area: 'Bilgi', minimum: '1', ideal: '2' }
  const paused = updateHabitPause(habit, { ...habit, pausedUntil: '2026-09-12' }, '2026-09-10')
  const log = { '2026-09-08': { h: { status: 'minimum' } }, '2026-09-09': { h: { status: 'ideal' } }, '2026-09-13': { h: { status: 'ideal' } } }
  assert.equal(habitStreak(paused, log, '2026-09-13'), 3)
  assert.equal(habitIsDue(paused, '2026-09-09'), true)
  assert.equal(habitIsDue(paused, '2026-09-11'), false)
  const resumed = updateHabitPause(paused, { ...paused, pausedUntil: undefined }, '2026-09-11')
  assert.equal(habitIsDue(resumed, '2026-09-11'), true)
  assert.deepEqual(resumed.pauseHistory, [{ start: '2026-09-10', end: '2026-09-10' }])
})
