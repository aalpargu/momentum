import type { AppState, CalendarBlock, DailyPlanItem, FocusCategory, FocusSession, Goal, Habit, ScreenTimeEntry } from './domain'

export type TrashKind = 'session' | 'screen-time' | 'calendar-block' | 'goal' | 'habit' | 'focus-category' | 'plan-item'
export type TrashItem = { id: string; kind: TrashKind; label: string; deletedAt: string; payload: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const stringField = (value: unknown, maximum = 2_000) => typeof value === 'string' && value.length > 0 && value.length <= maximum
const dateField = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const numberField = (value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum

export function createTrashItem(kind: TrashKind, label: string, payload: unknown, now = new Date()): TrashItem {
  return { id: crypto.randomUUID(), kind, label: label.trim().slice(0, 160) || 'Adsız kayıt', deletedAt: now.toISOString(), payload }
}

export function trashKindLabel(kind: TrashKind) {
  return ({ session: 'Odak kaydı', 'screen-time': 'Ekran süresi', 'calendar-block': 'Takvim bloğu', goal: 'Hedef', habit: 'Alışkanlık', 'focus-category': 'Odak kategorisi', 'plan-item': 'Öncelik' } as const)[kind]
}

function unique<T extends { id: string }>(items: T[], item: T, message: string) {
  if (items.some(existing => existing.id === item.id)) throw new Error(message)
  return [...items, item]
}

export function restoreTrashItem(state: AppState, trash: TrashItem): AppState {
  if (!isRecord(trash.payload)) throw new Error('Çöp kutusu kaydı doğrulanamadı.')
  const value = trash.payload
  if (trash.kind !== 'plan-item' && !stringField(value.id, 100)) throw new Error('Kayıt kimliği geçersiz.')

  if (trash.kind === 'session') {
    if (!stringField(value.title, 150) || !stringField(value.area, 40) || !numberField(value.seconds, 1, 86_400) || !dateField(value.date) || !stringField(value.startedAt, 60)) throw new Error('Odak kaydı doğrulanamadı.')
    return { ...state, sessions: unique(state.sessions, value as FocusSession, 'Bu odak kaydı zaten mevcut.') }
  }
  if (trash.kind === 'screen-time') {
    if (!stringField(value.app, 150) || !dateField(value.date) || !numberField(value.minutes, 1, 1_440) || !['passive', 'useful', 'necessary', 'unclassified'].includes(String(value.kind)) || !['manual', 'screenshot', 'legacy'].includes(String(value.source))) throw new Error('Ekran süresi kaydı doğrulanamadı.')
    return { ...state, screenTimeEntries: unique(state.screenTimeEntries, value as ScreenTimeEntry, 'Bu ekran süresi kaydı zaten mevcut.') }
  }
  if (trash.kind === 'calendar-block') {
    if (!stringField(value.title, 100) || !stringField(value.area, 40) || !dateField(value.date) || !numberField(value.startMinute, 0, 1_439) || !numberField(value.minutes, 15, 1_440) || Number(value.startMinute) + Number(value.minutes) > 1_440) throw new Error('Takvim bloğu doğrulanamadı.')
    return { ...state, calendarBlocks: unique(state.calendarBlocks ?? [], value as CalendarBlock, 'Bu takvim bloğu zaten mevcut.') }
  }
  if (trash.kind === 'goal') {
    if (!stringField(value.title, 150) || !stringField(value.area, 40) || !['saat', 'kelime', 'sayfa', 'adet'].includes(String(value.unit)) || !numberField(value.target, 0.1) || !stringField(value.activity, 150) || !numberField(value.manualProgress)) throw new Error('Hedef doğrulanamadı.')
    return { ...state, goals: unique(state.goals, value as Goal, 'Bu hedef zaten mevcut.') }
  }
  if (trash.kind === 'habit') {
    if (!stringField(value.name, 60) || !stringField(value.area, 40) || !stringField(value.minimum, 40) || !stringField(value.ideal, 40)) throw new Error('Alışkanlık doğrulanamadı.')
    return { ...state, habits: unique(state.habits, value as Habit, 'Bu alışkanlık zaten mevcut.') }
  }
  if (trash.kind === 'focus-category') {
    if (!stringField(value.title, 60) || !stringField(value.area, 40) || !stringField(value.icon, 8)) throw new Error('Odak kategorisi doğrulanamadı.')
    return { ...state, focusCategories: unique(state.focusCategories, value as FocusCategory, 'Bu odak kategorisi zaten mevcut.') }
  }
  if (trash.kind === 'plan-item') {
    const item = value.item
    if (!dateField(value.date) || !isRecord(item) || !stringField(item.id, 100) || !stringField(item.text, 100) || typeof item.completed !== 'boolean') throw new Error('Öncelik kaydı doğrulanamadı.')
    const existing = state.dailyPlans[value.date as string] ?? []
    return { ...state, dailyPlans: { ...state.dailyPlans, [value.date as string]: unique(existing, item as DailyPlanItem, 'Bu öncelik zaten mevcut.') } }
  }
  throw new Error('Desteklenmeyen çöp kutusu kaydı.')
}
