import assert from 'node:assert/strict'
import test from 'node:test'
import type { Habit } from '../src/lib/domain.ts'
import { habitIsDue } from '../src/lib/habits.ts'

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
