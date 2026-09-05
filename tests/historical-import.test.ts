import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppState } from '../src/lib/domain.ts'
import { mergeHistoricalRecords, parseDelimitedText, parseHistoricalRows, parseHistoricalText } from '../src/lib/historicalImport.ts'

const empty: AppState = {
  habits: [], focusCategories: [], sessions: [], habitLog: {}, dailyPlans: {}, reflections: {}, goals: [], weeklyFocus: {}, screenTimeEntries: [],
  settings: { name: 'Alpargu', dailyFocusMinutes: 240, onboardingComplete: true, compactToday: true, reminders: { enabled: false, planTime: '09:00', habitsTime: '19:00', reflectionTime: '22:30', weeklyEnabled: true, weeklyTime: '19:00' } },
}

test('plain text accepts multiple durations on the same dated line', () => {
  const result = parseHistoricalText('2.09.2026 -> 30 dk kitap 2 saat veri yapıları ve algoritmalar(DSA)\n3.09.2026 -> 35 dk Instagram [faydasız]')
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.records.map(({ date, title, minutes, kind, area }) => ({ date, title, minutes, kind, area })), [
    { date: '2026-09-02', title: 'kitap', minutes: 30, kind: 'focus', area: 'Bilgi' },
    { date: '2026-09-02', title: 'veri yapıları ve algoritmalar(DSA)', minutes: 120, kind: 'focus', area: 'Eğitim' },
    { date: '2026-09-03', title: 'Instagram', minutes: 35, kind: 'passive', area: 'Bilgi' },
  ])
})

test('csv headings and quoted comma fields are parsed for Excel-compatible imports', () => {
  const rows = parseDelimitedText('Tarih,Etkinlik,Süre,Birim,Tür,Alan\n02.09.2026,"Okuma, roman","1,5",saat,Odak,Bilgi')
  assert.equal(rows[1].length, 6)
  const valid = parseHistoricalRows(parseDelimitedText('Tarih;Etkinlik;Süre;Birim;Tür;Alan\n02.09.2026;"Okuma, roman";1,5;saat;Odak;Bilgi'))
  assert.equal(valid.records[0].minutes, 90)
  assert.equal(valid.records[0].title, 'Okuma, roman')
})

test('historical merge is additive and importing the same file again is idempotent', () => {
  const parsed = parseHistoricalText('02.09.2026 -> 30 dk Kitap; 2 saat DSA; 45 dk Instagram [faydasız]')
  const first = mergeHistoricalRecords(empty, parsed.records, '2026-09-30')
  assert.equal(first.sessions.length, 2)
  assert.equal(first.screenEntries.length, 1)
  const second = mergeHistoricalRecords(first.state, parsed.records, '2026-09-30')
  assert.equal(second.sessions.length + second.screenEntries.length, 0)
  assert.equal(second.skipped, 3)
  assert.equal(second.state.sessions.length, 2)
})

test('the app CSV export shape preserves screen-time classifications', () => {
  const result = parseHistoricalRows(parseDelimitedText('Date,Type,Name,Area/Source,Value,Unit\n2026-09-02,ScreenTime,Instagram,passive/manual,45,minutes'))
  assert.equal(result.records[0].kind, 'passive')
})
