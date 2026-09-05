import test from 'node:test'
import assert from 'node:assert/strict'
import { conflictsFor, createCommitQueue, newMilestones, parseQuickEntry, rememberEntry, validCalendarBlock, validateStateTotals } from '../src/lib/experience.ts'
import type { AppState, CalendarBlock } from '../src/lib/domain.ts'

const empty = (): AppState => ({ habits: [], focusCategories: [], sessions: [], habitLog: {}, dailyPlans: {}, reflections: {}, goals: [], weeklyFocus: {}, screenTimeEntries: [], settings: { name: 'Alpargu', dailyFocusMinutes: 240, onboardingComplete: true, compactToday: true, reminders: { enabled: false, planTime: '09:00', habitsTime: '19:00', reflectionTime: '22:00', weeklyEnabled: false, weeklyTime: '19:00' } } })
test('quick entry parses compound durations and matches existing Turkish activity names', () => {
  assert.deepEqual(parseQuickEntry('30 dk kitap', [], 'Kariyer'), { title: 'Kitap', minutes: 30, area: 'Bilgi' })
  assert.deepEqual(parseQuickEntry('1 saat 20 dk DSA', [{ title: 'DSA', area: 'Eğitim' }], 'Kariyer'), { title: 'DSA', minutes: 80, area: 'Eğitim' })
  assert.equal(parseQuickEntry('1,5 saat İngilizce', [], 'Bilgi').minutes, 90)
  for (const invalid of ['kitap', '0 dk kitap', '25 saat DSA', '-30 dk kitap', '30 dk', '30 dk kitap; 2 saat DSA', '30 dk 20 dk kitap', '0,01 saat kitap']) assert.throws(() => parseQuickEntry(invalid, [], 'Bilgi'), invalid)
})
test('recent entries deduplicate while keeping distinct durations and are bounded', () => {
  let state = empty()
  for (let i = 1; i <= 10; i++) state = { ...state, experience: rememberEntry(state, { title: 'Kitap', area: 'Bilgi', minutes: i * 15 }) }
  state.experience = rememberEntry(state, { title: 'Kitap', area: 'Bilgi', minutes: 150 })
  assert.equal(state.experience.recentEntries.length, 6)
  assert.equal(state.experience.recentEntries[0].minutes, 150)
})
test('calendar catches overlaps, permits adjacent blocks, and rejects invalid dates and midnight overflow', () => {
  const block: CalendarBlock = { id: '1', title: 'DSA', area: 'Eğitim', date: '2026-09-02', startMinute: 600, minutes: 60 }
  assert.equal(validCalendarBlock(block), true)
  assert.equal(conflictsFor({ ...block, id: '2', startMinute: 660 }, [block]).length, 0)
  assert.equal(conflictsFor({ ...block, id: '2', startMinute: 645 }, [block]).length, 1)
  assert.equal(conflictsFor(block, [block]).length, 0)
  assert.equal(conflictsFor({ ...block, id: '2', date: '2026-09-03' }, [block]).length, 0)
  assert.equal(validCalendarBlock({ ...block, startMinute: 1410 }), false)
  assert.equal(validCalendarBlock({ ...block, date: '2026-02-30' }), false)
  assert.equal(validCalendarBlock({ ...block, minutes: 0 }), false)
})
test('failed persistence never publishes, and subsequent queued updates use the durable state', async () => {
  let value = 0
  let fail = true
  const published: number[] = []
  const commit = createCommitQueue(() => value, async () => { if (fail) { fail = false; throw new Error('quota') } }, next => { value = next; published.push(next) })
  await assert.rejects(commit(current => current + 10), /quota/)
  assert.equal(value, 0)
  await Promise.all([commit(current => current + 1), commit(current => current + 2)])
  assert.deepEqual(published, [1, 3])
})
test('acknowledgement and publication wait until persistence resolves', async () => {
  let value = 0
  let release!: () => void
  const disk = new Promise<void>(resolve => { release = resolve })
  const commit = createCommitQueue(() => value, () => disk, next => { value = next })
  let done = false
  const task = commit(() => 10).then(() => { done = true })
  await Promise.resolve()
  assert.equal(value, 0); assert.equal(done, false)
  release(); await task
  assert.equal(value, 10); assert.equal(done, true)
})
test('milestones fire only on new crossings; undo and retry cannot repeat acknowledged awards', () => {
  const before = empty()
  const after = { ...before, sessions: [{ id: 'focus', title: 'Kitap', area: 'Bilgi' as const, date: '2026-09-02', startedAt: '2026-09-02T09:00:00Z', seconds: 36000 }] }
  assert.deepEqual(newMilestones(before, after).map(([id]) => id), ['hours:10'])
  assert.equal(newMilestones(after, after).length, 0)
  assert.equal(newMilestones({ ...before, experience: { recentEntries: [], seenMilestones: ['hours:10'] } }, after).length, 0)
  const streak = empty()
  for (let day = 1; day <= 7; day++) streak.habitLog['2026-09-0' + day] = { reading: { status: 'minimum' } }
  assert.deepEqual(newMilestones(before, streak).map(([id]) => id), ['streak:7'])
  assert.deepEqual(newMilestones(before, { ...before, goals: [{ id: 'goal', title: 'Kitap', area: 'Bilgi', unit: 'sayfa', target: 20, activity: 'manual', manualProgress: 20 }] }).map(([id]) => id), ['goal:goal'])
})
test('daily time limits are checked against the final state of an operation', () => {
  const state = empty()
  state.sessions = [{ id: '1', title: 'DSA', area: 'Eğitim', date: '2026-09-02', startedAt: '2026-09-02T09:00:00Z', seconds: 86400 }]
  assert.doesNotThrow(() => validateStateTotals(state))
  state.sessions.push({ ...state.sessions[0], id: '2', seconds: 60 })
  assert.throws(() => validateStateTotals(state), /24 saat/)
})
