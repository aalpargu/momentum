import assert from 'node:assert/strict'
import test from 'node:test'
import { carryableTasks } from '../src/lib/todos.ts'
import { buildTimedFocusSessions, updateFocusSession } from '../src/lib/focusTiming.ts'

test('carry keeps every unfinished task and its category/identity without duplicates', () => {
  const previous = Array.from({ length: 12 }, (_, i) => ({ id: `task-${i}`, text: `İş ${i}`, categoryId: 'learning', completed: i === 0 }))
  const current = [{ ...previous[1], text: 'Yeniden adlandırıldı' }, { id: 'different', text: 'iş 2', completed: false }]
  const carried = carryableTasks(previous, current)
  assert.equal(carried.length, 9)
  assert.deepEqual(carried[0], previous[3])
  assert.equal(carryableTasks(previous, [...current, ...carried]).length, 0)
})

test('linked work preserves task identity through midnight splits and duration edits', () => {
  const sessions = buildTimedFocusSessions({ id: 'timer', taskId: 'todo', title: 'Coding', area: 'Kariyer', intention: 'Testleri tamamla', segments: [{ startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-03T00:00:00Z' }] }, Date.parse('2026-09-03T00:00:00Z'))
  assert.ok(sessions.length >= 2)
  assert.ok(sessions.every(session => session.taskId === 'todo' && session.intention === 'Testleri tamamla'))
  const edited = updateFocusSession(sessions[0], { title: 'Learning', area: 'Öğrenme', seconds: 60 })
  assert.equal(edited.taskId, 'todo')
  assert.equal(edited.source, 'manual')
  assert.equal(edited.timerSessionId, undefined)
})
