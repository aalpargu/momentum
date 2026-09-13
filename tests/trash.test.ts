import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppState } from '../src/lib/domain.ts'
import { restoreTrashItem, type TrashItem, type TrashKind } from '../src/lib/trash.ts'

function emptyState(): AppState {
  return {
    habits: [], focusCategories: [], sessions: [], habitLog: {}, dailyPlans: {}, reflections: {}, goals: [], weeklyFocus: {}, weeklyReviews: {}, screenTimeEntries: [], calendarBlocks: [],
    settings: { name: '', dailyFocusMinutes: 120, onboardingComplete: true, compactToday: true, reminders: { enabled: false, planTime: '09:00', habitsTime: '19:00', reflectionTime: '22:30', weeklyEnabled: true, weeklyTime: '19:00' } },
  }
}

function trash(kind: TrashKind, payload: unknown): TrashItem {
  return { id: `trash-${kind}`, kind, label: 'Test kaydı', deletedAt: '2026-09-13T10:00:00.000Z', payload }
}

test('restores every supported deleted record without changing its original id', () => {
  let state = emptyState()
  state = restoreTrashItem(state, trash('session', { id: 'session-1', title: 'Derin çalışma', area: 'Kariyer', seconds: 1_500, startedAt: '2026-09-13T09:00:00.000Z', date: '2026-09-13', source: 'timer' }))
  state = restoreTrashItem(state, trash('screen-time', { id: 'screen-1', app: 'Tarayıcı', date: '2026-09-13', minutes: 20, kind: 'useful', source: 'manual', createdAt: '2026-09-13T09:00:00.000Z' }))
  state = restoreTrashItem(state, trash('calendar-block', { id: 'block-1', title: 'Planlama', area: 'Kişisel', date: '2026-09-14', startMinute: 540, minutes: 30 }))
  state = restoreTrashItem(state, trash('goal', { id: 'goal-1', title: 'Oku', area: 'Öğrenme', unit: 'sayfa', target: 100, activity: 'Okuma', manualProgress: 5 }))
  state = restoreTrashItem(state, trash('habit', { id: 'habit-1', icon: '📚', name: 'Okuma', area: 'Öğrenme', minimum: '5 sayfa', ideal: '20 sayfa' }))
  state = restoreTrashItem(state, trash('focus-category', { id: 'category-1', icon: '🎯', title: 'Derin çalışma', area: 'Kariyer' }))
  state = restoreTrashItem(state, trash('plan-item', { date: '2026-09-13', item: { id: 'plan-1', text: 'En önemli iş', completed: false } }))

  assert.deepEqual(state.sessions.map(item => item.id), ['session-1'])
  assert.deepEqual(state.screenTimeEntries.map(item => item.id), ['screen-1'])
  assert.deepEqual(state.calendarBlocks?.map(item => item.id), ['block-1'])
  assert.deepEqual(state.goals.map(item => item.id), ['goal-1'])
  assert.deepEqual(state.habits.map(item => item.id), ['habit-1'])
  assert.deepEqual(state.focusCategories.map(item => item.id), ['category-1'])
  assert.deepEqual(state.dailyPlans['2026-09-13'].map(item => item.id), ['plan-1'])
})

test('rejects duplicate and malformed trash records', () => {
  const state = restoreTrashItem(emptyState(), trash('habit', { id: 'habit-1', icon: '📚', name: 'Okuma', area: 'Öğrenme', minimum: '5', ideal: '20' }))
  assert.throws(() => restoreTrashItem(state, trash('habit', { id: 'habit-1', icon: '📚', name: 'Okuma', area: 'Öğrenme', minimum: '5', ideal: '20' })), /zaten mevcut/)
  assert.throws(() => restoreTrashItem(emptyState(), trash('calendar-block', { id: 'bad', title: 'Gece', area: 'Kişisel', date: '2026-09-13', startMinute: 1_430, minutes: 30 })), /doğrulanamadı/)
})
