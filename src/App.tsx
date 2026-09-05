import { SaveFeedback, useSavedActions } from './components/SaveFeedback'
import { Icon, AreaIcon, HabitRing } from './components/Icon'
import { FocusView } from './components/FocusView'
import { QuickCapture } from './components/QuickCapture'
import { CalendarView } from './components/CalendarView'
import { rememberEntry, saveFailure, validCalendarBlock, conflictsFor } from './lib/experience'
import type { CalendarBlock, ExperienceState } from './lib/domain'
import { TodayInsights } from './components/ProductivityInsights'
import { buildTimedFocusSessions as focusSessionsFromActive, validateFocusTiming, updateFocusSession } from './lib/focusTiming'
import { NumberInput } from './components/NumberInput'
import { HistoricalImportPanel } from './components/HistoricalImportPanel'
import { lazy, Suspense, type FormEvent, useEffect, useMemo, useState, useRef } from 'react'
import { AccessibleModal } from './components/AccessibleModal'
import { CustomizeModal } from './components/CustomizeModal'
import { DayDetailModal } from './components/DayDetailModal'
import { OnboardingModal } from './components/OnboardingModal'
import { GoalForm, ProgressView } from './components/ProgressView'
import { ScreenTimePanel, type WastedEntry } from './components/ScreenTimePanel'
import { calculateDailyScore, type TrackedScreenKind } from './lib/analytics'
import { greetingFor, preferredName } from './lib/greeting'
import { listAutomaticBackups, type AutomaticBackup } from './lib/backupStore'
import { loadMainState, saveMainState } from './lib/stateStore'
import { cloudConfigured } from './lib/cloudConfig'
import { useCloudSync, type CloudSyncController } from './hooks/useCloudSync'
import type { AppState, Area, DailyPlanItem, DailyReflection, FocusCategory, FocusSession, Goal, GoalUnit, Habit, HabitEntry, HabitStatus, ReminderSettings, ScreenTimeEntry, ScreenTimeSource, UserSettings } from './lib/domain'

type ActiveFocusSegment = { startedAt: string; endedAt?: string }
type ActiveFocusSession = { version: 1; id: string; title: string; area: Area; startedAt: string; status: 'running' | 'paused'; segments: ActiveFocusSegment[] }
type BackupCandidate = { state: AppState; formatLabel: string; warnings: string[]; summary: { habits: number; sessions: number; habitEntries: number; plans: number; reflections: number; goals: number; screenTimeEntries: number } }
type StateChangeResult = { ok: boolean; error?: string }
type StorageMode = 'loading' | 'indexeddb' | 'localstorage-fallback'

const storageKey = 'momentum-v1'
const legacyMigrationBackupKey = 'momentum-localstorage-migration-backup-v1'
const fallbackUpdatedAtKey = 'momentum-localstorage-fallback-updated-at-v1'
const activeFocusStorageKey = 'momentum-active-focus-v1'
const importRollbackStorageKey = 'momentum-import-rollback-v1'
const corruptStateStorageKey = 'momentum-corrupt-state-v1'
const backupFormat = 'momentum-backup'
const backupVersion = 2
const defaultHabits: Habit[] = [
  { id: 'reading', icon: '📚', name: 'Okuma', area: 'Bilgi', minimum: '5 sayfa', ideal: '20 sayfa' },
  { id: 'english', icon: '🇬🇧', name: 'İngilizce', area: 'İngilizce', minimum: '5 kelime', ideal: '10 kelime' },
  { id: 'exercise', icon: '💪', name: 'Egzersiz', area: 'Sağlık', minimum: '10 dk', ideal: '100 şınav' },
]
const defaultFocusCategories: FocusCategory[] = [
  { id: 'university', title: 'Üniversite', area: 'Eğitim', icon: '🎓' },
  { id: 'coding', title: 'Coding', area: 'Kariyer', icon: '💻' },
  { id: 'english-focus', title: 'İngilizce', area: 'İngilizce', icon: '🇬🇧' },
  { id: 'internship', title: 'Staj hazırlığı', area: 'Kariyer', icon: '🚀' },
]
const defaultReminders: ReminderSettings = { enabled: false, planTime: '09:00', habitsTime: '19:00', reflectionTime: '22:30', weeklyEnabled: true, weeklyTime: '19:00' }
const defaultSettings: UserSettings = { name: 'Alpargu', dailyFocusMinutes: 240, onboardingComplete: false, compactToday: true, reminders: defaultReminders }
const CloudAccountPanel = lazy(() => import('./components/CloudAccountPanel').then(module => ({ default: module.CloudAccountPanel })))
const areaColors: Record<Area, string> = { Eğitim: '#8b5cf6', Kariyer: '#38bdf8', İngilizce: '#f59e0b', Sağlık: '#34d399', Bilgi: '#fb7185' }
const areas = Object.keys(areaColors) as Area[]
let startupRecoveryNeeded = false

function emptyState(): AppState { return { habits: defaultHabits, focusCategories: defaultFocusCategories, sessions: [], habitLog: {}, dailyPlans: {}, reflections: {}, goals: [], weeklyFocus: {}, screenTimeEntries: [], settings: defaultSettings } }

function dateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
function previousDate(key: string) { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() - 1); return dateKey(date) }
function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const secs = seconds % 60
  return hours > 0 ? `${hours}s ${String(minutes).padStart(2, '0')}d` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
function weekdayAndDate(date: Date) { return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date) }
function readActiveFocus(): ActiveFocusSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(activeFocusStorageKey) ?? 'null') as Partial<ActiveFocusSession> | null
    if (!value || value.version !== 1 || typeof value.id !== 'string' || typeof value.title !== 'string' || !areas.includes(value.area as Area) || !['running', 'paused'].includes(String(value.status)) || !Array.isArray(value.segments) || value.segments.length === 0) return null
    const now = Date.now()
    const futureTolerance = 60_000
    const maximumActiveAge = 7 * 24 * 60 * 60 * 1000
    const segments = value.segments.map((segment) => {
      const start = Date.parse(segment?.startedAt)
      const end = segment?.endedAt === undefined ? undefined : Date.parse(segment.endedAt)
      if (!Number.isFinite(start) || start > now + futureTolerance || (end !== undefined && (!Number.isFinite(end) || end < start || end > now + futureTolerance))) throw new Error('invalid focus segment')
      return { startedAt: new Date(start).toISOString(), ...(end === undefined ? {} : { endedAt: new Date(end).toISOString() }) }
    })
    const openSegments = segments.filter((segment) => !segment.endedAt)
    if (openSegments.length > 1 || (openSegments.length === 1 && segments.at(-1)?.endedAt) || (value.status === 'running') !== (openSegments.length === 1)) return null
    const startedAt = Date.parse(String(value.startedAt))
    if (!Number.isFinite(startedAt) || startedAt !== Date.parse(segments[0].startedAt) || startedAt < now - maximumActiveAge) return null
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (index < segments.length - 1 && !segment.endedAt) return null
      if (index > 0) {
        const previousEnd = segments[index - 1].endedAt
        if (!previousEnd || Date.parse(segment.startedAt) < Date.parse(previousEnd)) return null
      }
    }
    const lastBoundary = Date.parse(segments.at(-1)?.endedAt ?? new Date(now).toISOString())
    if (lastBoundary - startedAt > maximumActiveAge) return null
    return { version: 1, id: value.id, title: value.title, area: value.area as Area, startedAt: new Date(startedAt).toISOString(), status: value.status as ActiveFocusSession['status'], segments }
  } catch { return null }
}
function focusSegmentsAt(activeFocus: ActiveFocusSession, nowMs: number) {
  return activeFocus.segments.flatMap((segment) => {
    const start = Date.parse(segment.startedAt)
    const end = Math.min(segment.endedAt ? Date.parse(segment.endedAt) : nowMs, nowMs)
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : []
  })
}
function focusSeconds(activeFocus: ActiveFocusSession | null, nowMs: number) {
  if (!activeFocus) return 0
  return Math.floor(focusSegmentsAt(activeFocus, nowMs).reduce((sum, segment) => sum + segment.end - segment.start, 0) / 1000)
}
function upsertFocusSessions(existing: FocusSession[], incoming: FocusSession[]) {
  if (!incoming.length) return existing
  const incomingById = new Map(incoming.map((session) => [session.id, session]))
  const existingIds = new Set(existing.map((session) => session.id))
  const merged = existing.map((session) => incomingById.get(session.id) ?? session)
  incoming.forEach((session) => { if (!existingIds.has(session.id)) merged.push(session) })
  return merged
}
function normalizedSettings(value?: Partial<UserSettings>): UserSettings {
  const minutes = Number(value?.dailyFocusMinutes)
  const reminders = value?.reminders ?? defaultReminders
  const validTime = (time: unknown, fallback: string) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback
  return {
    name: preferredName(value?.name),
    dailyFocusMinutes: Number.isFinite(minutes) && minutes >= 15 && minutes <= 1_440 ? Math.round(minutes) : defaultSettings.dailyFocusMinutes,
    onboardingComplete: value?.onboardingComplete === true,
    compactToday: value?.compactToday !== false,
    reduceMotion: value?.reduceMotion === true,
    celebrationSound: value?.celebrationSound === true,
    reminders: {
      enabled: reminders.enabled === true,
      planTime: validTime(reminders.planTime, defaultReminders.planTime),
      habitsTime: validTime(reminders.habitsTime, defaultReminders.habitsTime),
      reflectionTime: validTime(reminders.reflectionTime, defaultReminders.reflectionTime),
      weeklyEnabled: reminders.weeklyEnabled !== false,
      weeklyTime: validTime(reminders.weeklyTime, defaultReminders.weeklyTime),
    },
  }
}
function backupEnvelope(state: AppState) {
  return { format: backupFormat, version: backupVersion, exportedAt: new Date().toISOString(), data: state }
}
function writeFallbackState(payload: string) {
  // Payload and recovery timestamp must succeed or fail as a single localStorage write.
  localStorage.setItem(storageKey, JSON.stringify(backupEnvelope(JSON.parse(payload) as AppState)))
}
function importError(path: string, message: string): never { throw new Error(`${path}: ${message}`) }
function importRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) importError(path, 'nesne olmalı')
  return value as Record<string, unknown>
}
function importArray(value: unknown, path: string, maximum: number) {
  if (!Array.isArray(value)) importError(path, 'liste olmalı')
  if (value.length > maximum) importError(path, `en fazla ${maximum} kayıt içerebilir`)
  return value
}
function importString(value: unknown, path: string, maximum: number, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > maximum) importError(path, `${allowEmpty ? '' : 'boş olmayan '}en fazla ${maximum} karakterlik metin olmalı`)
  return value
}
function importId(value: unknown, path: string) {
  const id = importString(value, path, 100)
  if (['__proto__', 'prototype', 'constructor'].includes(id)) importError(path, 'güvenli olmayan kimlik')
  return id
}
function importNumber(value: unknown, path: string, minimum: number, maximum: number, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) importError(path, `${minimum}–${maximum} aralığında ${integer ? 'tam ' : ''}sayı olmalı`)
  return value
}
function importBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') importError(path, 'doğru/yanlış olmalı')
  return value
}
function importDate(value: unknown, path: string, optional = false) {
  if (optional && (value === undefined || value === '')) return undefined
  const key = importString(value, path, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || dateKey(new Date(`${key}T12:00:00`)) !== key) importError(path, 'YYYY-AA-GG biçiminde geçerli tarih olmalı')
  return key
}
function importIso(value: unknown, path: string) {
  const iso = importString(value, path, 50)
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/)
  if (!match) importError(path, 'saat dilimi içeren ISO-8601 tarih-saat olmalı')
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText); const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText)
  const zoneParts = zone === 'Z' ? null : zone.slice(1).split(':').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59 || (zoneParts && (zoneParts[0] > 23 || zoneParts[1] > 59)) || !Number.isFinite(Date.parse(iso))) importError(path, 'geçerli ISO-8601 tarih-saat olmalı')
  return new Date(iso).toISOString()
}
function importHistoricalIso(value: unknown, path: string, legacy: boolean, warnings: string[]) {
  if (legacy && typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?$/)
    if (match) {
      const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
      const year = Number(yearText); const month = Number(monthText); const day = Number(dayText); const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText)
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) importError(path, 'geçerli tarihsel ISO tarih-saat olmalı')
      const warning = 'Eski saat dilimsiz tarih-saat kayıtları bu bilgisayarın yerel saat dilimine göre normalize edilecek.'
      if (!warnings.includes(warning)) warnings.push(warning)
      return new Date(value).toISOString()
    }
  }
  return importIso(value, path)
}
function importArea(value: unknown, path: string) {
  if (!areas.includes(value as Area)) importError(path, 'geçerli hayat alanı olmalı')
  return value as Area
}
function importObjectField(record: Record<string, unknown>, key: string, legacy: boolean) {
  if (record[key] === undefined) {
    if (legacy) return {} as Record<string, unknown>
    importError(`data.${key}`, 'alanı eksik')
  }
  return importRecord(record[key], `data.${key}`)
}
function importArrayField(record: Record<string, unknown>, key: string, legacy: boolean, maximum: number) {
  if (record[key] === undefined) {
    if (legacy) return [] as unknown[]
    importError(`data.${key}`, 'alanı eksik')
  }
  return importArray(record[key], `data.${key}`, maximum)
}
function rejectDuplicateIds(items: Array<{ id: string }>, path: string) {
  const ids = new Set<string>()
  items.forEach((item) => { if (ids.has(item.id)) importError(path, `yinelenen kimlik: ${item.id}`); ids.add(item.id) })
}
function validateBackup(raw: unknown): BackupCandidate {
  const root = importRecord(raw, 'yedek')
  const isEnvelope = root.format !== undefined || root.version !== undefined || root.data !== undefined
  let data: Record<string, unknown>
  let legacy = false
  const warnings: string[] = []
  if (isEnvelope) {
    if (root.format !== backupFormat) importError('yedek.format', `"${backupFormat}" olmalı`)
    if (root.version !== backupVersion) importError('yedek.version', `desteklenmeyen sürüm (${String(root.version)}); bu uygulama sürüm ${backupVersion} bekliyor`)
    importIso(root.exportedAt, 'yedek.exportedAt')
    data = importRecord(root.data, 'yedek.data')
  } else {
    legacy = true
    data = root
    warnings.push('Eski, sürümsüz yedek algılandı; güvenli biçimde güncel şemaya dönüştürülecek.')
  }

  const habits = importArrayField(data, 'habits', false, 200).map((value, index): Habit => {
    const item = importRecord(value, `habits[${index}]`)
    return { id: importId(item.id, `habits[${index}].id`), icon: importString(item.icon, `habits[${index}].icon`, 20), name: importString(item.name, `habits[${index}].name`, 100), area: importArea(item.area, `habits[${index}].area`), minimum: importString(item.minimum, `habits[${index}].minimum`, 100), ideal: importString(item.ideal, `habits[${index}].ideal`, 100), ...(item.archived === undefined ? {} : { archived: importBoolean(item.archived, `habits[${index}].archived`) }) }
  })
  if (!habits.length) importError('habits', 'en az bir alışkanlık içermeli')
  rejectDuplicateIds(habits, 'habits')
  const habitIds = new Set(habits.map((habit) => habit.id))

  const focusCategories = data.focusCategories === undefined ? defaultFocusCategories : importArray(data.focusCategories, 'focusCategories', 100).map((value, index): FocusCategory => {
    const item = importRecord(value, `focusCategories[${index}]`)
    return { id: importId(item.id, `focusCategories[${index}].id`), title: importString(item.title, `focusCategories[${index}].title`, 100), icon: importString(item.icon, `focusCategories[${index}].icon`, 20), area: importArea(item.area, `focusCategories[${index}].area`), ...(item.archived === undefined ? {} : { archived: importBoolean(item.archived, `focusCategories[${index}].archived`) }) }
  })
  if (!focusCategories.some((category) => !category.archived)) importError('focusCategories', 'en az bir etkin focus kategorisi içermeli')
  rejectDuplicateIds(focusCategories, 'focusCategories')

  const sessions = importArrayField(data, 'sessions', legacy, 100_000).map((value, index): FocusSession => {
    const item = importRecord(value, `sessions[${index}]`)
    const session: FocusSession = { id: importId(item.id, `sessions[${index}].id`), title: importString(item.title, `sessions[${index}].title`, 100), area: importArea(item.area, `sessions[${index}].area`), seconds: importNumber(item.seconds, `sessions[${index}].seconds`, 1, 86_400, true), startedAt: importHistoricalIso(item.startedAt, `sessions[${index}].startedAt`, legacy, warnings), date: importDate(item.date, `sessions[${index}].date`)! }
    return { ...session, ...validateFocusTiming(item, session) }
  })
  rejectDuplicateIds(sessions, 'sessions')
  const focusSecondsByDate = new Map<string, number>()
  sessions.forEach((session) => focusSecondsByDate.set(session.date, (focusSecondsByDate.get(session.date) ?? 0) + session.seconds))
  focusSecondsByDate.forEach((seconds, date) => { if (seconds > 86_400) importError(`sessions.${date}`, 'günlük odak toplamı 24 saati aşamaz') })

  const habitLog: AppState['habitLog'] = {}
  Object.entries(importObjectField(data, 'habitLog', legacy)).forEach(([dateValue, logValue]) => {
    const date = importDate(dateValue, `habitLog.${dateValue}`)!
    const log = importRecord(logValue, `habitLog.${date}`)
    const entries: Record<string, HabitEntry> = {}
    Object.entries(log).forEach(([habitIdValue, entryValue]) => {
      const habitId = importId(habitIdValue, `habitLog.${date}.kimlik`)
      if (!habitIds.has(habitId)) importError(`habitLog.${date}.${habitId}`, 'alışkanlık listesinde karşılığı yok')
      const item = importRecord(entryValue, `habitLog.${date}.${habitId}`)
      if (!['minimum', 'ideal', 'partial'].includes(String(item.status))) importError(`habitLog.${date}.${habitId}.status`, 'geçersiz durum')
      entries[habitId] = { status: item.status as HabitStatus, ...(item.amount === undefined ? {} : { amount: importNumber(item.amount, `habitLog.${date}.${habitId}.amount`, 0, 1_000_000) }) }
    })
    habitLog[date] = entries
  })

  const dailyPlans: AppState['dailyPlans'] = {}
  Object.entries(importObjectField(data, 'dailyPlans', legacy)).forEach(([dateValue, planValue]) => {
    const date = importDate(dateValue, `dailyPlans.${dateValue}`)!
    const plan = importArray(planValue, `dailyPlans.${date}`, 3).map((value, index): DailyPlanItem => {
      const item = importRecord(value, `dailyPlans.${date}[${index}]`)
      if (typeof item.completed !== 'boolean') importError(`dailyPlans.${date}[${index}].completed`, 'doğru/yanlış olmalı')
      return { id: importId(item.id, `dailyPlans.${date}[${index}].id`), text: importString(item.text, `dailyPlans.${date}[${index}].text`, 100), completed: item.completed }
    })
    rejectDuplicateIds(plan, `dailyPlans.${date}`)
    dailyPlans[date] = plan
  })

  const reflections: AppState['reflections'] = {}
  Object.entries(importObjectField(data, 'reflections', legacy)).forEach(([dateValue, reflectionValue]) => {
    const date = importDate(dateValue, `reflections.${dateValue}`)!
    const item = importRecord(reflectionValue, `reflections.${date}`)
    reflections[date] = { good: importString(item.good, `reflections.${date}.good`, 2_000, true), wasted: importString(item.wasted, `reflections.${date}.wasted`, 2_000, true), tomorrow: importString(item.tomorrow, `reflections.${date}.tomorrow`, 2_000, true) }
  })

  const goals = importArrayField(data, 'goals', legacy, 1_000).map((value, index): Goal => {
    const item = importRecord(value, `goals[${index}]`)
    if (!['saat', 'kelime', 'sayfa', 'adet'].includes(String(item.unit))) importError(`goals[${index}].unit`, 'geçersiz birim')
    return { id: importId(item.id, `goals[${index}].id`), title: importString(item.title, `goals[${index}].title`, 150), area: importArea(item.area, `goals[${index}].area`), unit: item.unit as GoalUnit, target: importNumber(item.target, `goals[${index}].target`, 0.1, 1_000_000_000), ...(importDate(item.deadline, `goals[${index}].deadline`, true) ? { deadline: importDate(item.deadline, `goals[${index}].deadline`, true) } : {}), activity: importString(item.activity, `goals[${index}].activity`, 100), manualProgress: importNumber(item.manualProgress, `goals[${index}].manualProgress`, 0, 1_000_000_000) }
  })
  rejectDuplicateIds(goals, 'goals')

  const weeklyFocus: AppState['weeklyFocus'] = {}
  Object.entries(importObjectField(data, 'weeklyFocus', legacy)).forEach(([dateValue, focusValue]) => {
    const date = importDate(dateValue, `weeklyFocus.${dateValue}`)!
    weeklyFocus[date] = importString(focusValue, `weeklyFocus.${date}`, 500, true)
  })

  let screenTimeRaw = data.screenTimeEntries
  if (screenTimeRaw === undefined && legacy && data.wastedTime !== undefined) {
    const wastedTime = importRecord(data.wastedTime, 'wastedTime')
    screenTimeRaw = Object.entries(wastedTime).flatMap(([dateValue, minutesValue]) => {
      const date = importDate(dateValue, `wastedTime.${dateValue}`)!
      const minutes = importNumber(minutesValue, `wastedTime.${date}`, 0, 1_440, true)
      return minutes > 0 ? [{ id: `legacy-${date}`, date, app: 'Eski toplam kayıt', minutes, kind: 'unclassified', source: 'legacy', createdAt: new Date(`${date}T12:00:00`).toISOString() }] : []
    })
    warnings.push('Eski toplam ekran süresi kayıtları ayrıntılı kayıt biçimine dönüştürülecek.')
  }
  const screenTimeEntries = importArrayField({ screenTimeEntries: screenTimeRaw }, 'screenTimeEntries', legacy, 100_000).map((value, index): ScreenTimeEntry => {
    const item = importRecord(value, `screenTimeEntries[${index}]`)
    if (!['manual', 'screenshot', 'legacy'].includes(String(item.source))) importError(`screenTimeEntries[${index}].source`, 'geçersiz kaynak')
    const screenshotHash = item.screenshotHash === undefined ? undefined : importString(item.screenshotHash, `screenTimeEntries[${index}].screenshotHash`, 64)
    if (screenshotHash && !/^[a-f\d]{64}$/i.test(screenshotHash)) importError(`screenTimeEntries[${index}].screenshotHash`, '64 karakterlik SHA-256 olmalı')
    if (item.source === 'screenshot' && !screenshotHash) importError(`screenTimeEntries[${index}].screenshotHash`, 'ekran görüntüsü kaynağında zorunlu')
    if (item.source !== 'screenshot' && screenshotHash) importError(`screenTimeEntries[${index}].screenshotHash`, 'yalnız ekran görüntüsü kaynağında kullanılabilir')
    const kind = item.kind === undefined ? 'unclassified' : String(item.kind)
    if (!['passive', 'useful', 'necessary', 'unclassified'].includes(kind)) importError(`screenTimeEntries[${index}].kind`, 'geçersiz ekran süresi türü')
    return { id: importId(item.id, `screenTimeEntries[${index}].id`), date: importDate(item.date, `screenTimeEntries[${index}].date`)!, app: importString(item.app, `screenTimeEntries[${index}].app`, 200), minutes: importNumber(item.minutes, `screenTimeEntries[${index}].minutes`, 1, 1_440, true), kind: kind as TrackedScreenKind, source: item.source as ScreenTimeSource, createdAt: importHistoricalIso(item.createdAt, `screenTimeEntries[${index}].createdAt`, legacy, warnings), ...(screenshotHash ? { screenshotHash } : {}) }
  })
  rejectDuplicateIds(screenTimeEntries, 'screenTimeEntries')
  const screenMinutesByDate = new Map<string, number>()
  screenTimeEntries.forEach((entry) => screenMinutesByDate.set(entry.date, (screenMinutesByDate.get(entry.date) ?? 0) + entry.minutes))
  screenMinutesByDate.forEach((minutes, date) => { if (minutes > 1_440) importError(`screenTimeEntries.${date}`, 'günlük toplam 1440 dakikayı aşamaz') })

  let settings = defaultSettings
  if (data.settings !== undefined) {
    const item = importRecord(data.settings, 'settings')
    const remindersValue = item.reminders === undefined ? defaultReminders : importRecord(item.reminders, 'settings.reminders')
    const time = (value: unknown, path: string, fallback: string) => {
      if (value === undefined) return fallback
      const parsed = importString(value, path, 5)
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(parsed)) importError(path, 'SS:DD biçiminde geçerli saat olmalı')
      return parsed
    }
    settings = {
      name: preferredName(item.name === undefined ? undefined : importString(item.name, 'settings.name', 60, true)),
      dailyFocusMinutes: item.dailyFocusMinutes === undefined ? 240 : importNumber(item.dailyFocusMinutes, 'settings.dailyFocusMinutes', 15, 1_440, true),
      onboardingComplete: item.onboardingComplete === undefined ? true : importBoolean(item.onboardingComplete, 'settings.onboardingComplete'),
      compactToday: item.compactToday === undefined ? true : importBoolean(item.compactToday, 'settings.compactToday'),
      reduceMotion: item.reduceMotion === undefined ? false : importBoolean(item.reduceMotion, 'settings.reduceMotion'),
      celebrationSound: item.celebrationSound === undefined ? false : importBoolean(item.celebrationSound, 'settings.celebrationSound'),
      reminders: {
        enabled: remindersValue.enabled === undefined ? false : importBoolean(remindersValue.enabled, 'settings.reminders.enabled'),
        planTime: time(remindersValue.planTime, 'settings.reminders.planTime', defaultReminders.planTime),
        habitsTime: time(remindersValue.habitsTime, 'settings.reminders.habitsTime', defaultReminders.habitsTime),
        reflectionTime: time(remindersValue.reflectionTime, 'settings.reminders.reflectionTime', defaultReminders.reflectionTime),
        weeklyEnabled: remindersValue.weeklyEnabled === undefined ? true : importBoolean(remindersValue.weeklyEnabled, 'settings.reminders.weeklyEnabled'),
        weeklyTime: time(remindersValue.weeklyTime, 'settings.reminders.weeklyTime', defaultReminders.weeklyTime),
      },
    }
  }

  const calendarBlocks: CalendarBlock[] = data.calendarBlocks === undefined ? [] : importArray(data.calendarBlocks, 'calendarBlocks', 100_000).map((value, index) => {
    const item = importRecord(value, 'calendarBlocks[' + index + ']')
    const block: CalendarBlock = { id: importId(item.id, 'calendarBlocks.id'), title: importString(item.title, 'calendarBlocks.title', 100), area: item.area as Area, date: String(item.date), startMinute: Number(item.startMinute), minutes: Number(item.minutes) }
    if (!validCalendarBlock(block)) importError('calendarBlocks[' + index + ']', 'geçersiz çalışma bloğu')
    return block
  })
  rejectDuplicateIds(calendarBlocks, 'calendarBlocks')
  const experience: ExperienceState = { recentEntries: [], seenMilestones: [] }
  if (data.experience !== undefined) {
    const item = importRecord(data.experience, 'experience')
    experience.seenMilestones = importArray(item.seenMilestones ?? [], 'experience.seenMilestones', 100_000).map(value => importString(value, 'milestone', 150))
    experience.recentEntries = importArray(item.recentEntries ?? [], 'experience.recentEntries', 6).map(value => {
      const entry = importRecord(value, 'recentEntry')
      if (!areas.includes(entry.area as Area)) importError('recentEntry.area', 'geçersiz alan')
      return { title: importString(entry.title, 'recentEntry.title', 100), area: entry.area as Area, minutes: importNumber(entry.minutes, 'recentEntry.minutes', 1, 1440, true) }
    })
  }
  const state = { habits, focusCategories, sessions, habitLog, dailyPlans, reflections, goals, weeklyFocus, screenTimeEntries, settings, calendarBlocks, experience }
  return { state, formatLabel: legacy ? 'Eski sürümsüz yedek' : `Momentum yedeği v${backupVersion}`, warnings, summary: { habits: habits.length, sessions: sessions.length, habitEntries: Object.values(habitLog).reduce((sum, log) => sum + Object.keys(log).length, 0), plans: Object.values(dailyPlans).reduce((sum, plan) => sum + plan.length, 0), reflections: Object.keys(reflections).length, goals: goals.length, screenTimeEntries: screenTimeEntries.length } }
}
function readState(): AppState {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return emptyState()
  try {
    return validateBackup(JSON.parse(raw)).state
  } catch {
    startupRecoveryNeeded = true
    try { localStorage.setItem(corruptStateStorageKey, raw) } catch { /* Bozuk ham kayıt mümkünse inceleme için korunur. */ }
    return emptyState()
  }
}
function getStreak(habitId: string, habitLog: AppState['habitLog'], today: string) {
  const todayEntry = habitLog[today]?.[habitId]
  let count = 0; let cursor = todayEntry && todayEntry.status !== 'partial' ? today : previousDate(today)
  while (habitLog[cursor]?.[habitId] && habitLog[cursor][habitId].status !== 'partial') { count += 1; cursor = previousDate(cursor) }
  return count
}
function parseHabitTarget(text: string) {
  const normalized = text.replace(',', '.')
  const match = normalized.match(/\d+(?:\.\d+)?/)
  const value = match ? Number(match[0]) : 0
  const rawUnit = match ? normalized.replace(match[0], '').trim().toLocaleLowerCase('tr-TR') : normalized.trim().toLocaleLowerCase('tr-TR')
  const unit = /^(dk|dakika)$/.test(rawUnit) ? 'dakika' : rawUnit
  return { value: Number.isFinite(value) ? value : 0, unit, label: rawUnit }
}
function activityDates(state: AppState) {
  const dates = new Set(state.sessions.filter((session) => session.seconds > 0).map((session) => session.date))
  Object.entries(state.habitLog).forEach(([date, log]) => { if (Object.values(log).some((entry) => entry.status === 'minimum' || entry.status === 'ideal')) dates.add(date) })
  return dates
}
function screenTimeMinutesForDate(state: AppState, date: string) {
  return state.screenTimeEntries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.minutes, 0)
}
function minutesNow() { const now = new Date(); return now.getHours() * 60 + now.getMinutes() }
function timeToMinutes(value: string) { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes }

function App() {
  const [today, setToday] = useState(dateKey)
  const [state, setAppState] = useState<AppState>(readState)
  const stateRef = useRef(state)
  const [storageReady, setStorageReady] = useState(false)
  const [storageMode, setStorageMode] = useState<StorageMode>('loading')
  const storageModeRef = useRef<StorageMode>('loading')
  const [recoveryNotice, setRecoveryNotice] = useState(startupRecoveryNeeded ? 'Eski ana veri kaydı bozuk görünüyor; doğrulanmış bir yedek aranıyor…' : '')
  const [activeFocus, setActiveFocus] = useState<ActiveFocusSession | null>(readActiveFocus)
  const initialState = state
  const initialFocusCategories = initialState.focusCategories.filter((category) => !category.archived)
  const [selected, setSelected] = useState(() => activeFocus ? { title: activeFocus.title, area: activeFocus.area, icon: initialState.focusCategories.find((option) => option.title === activeFocus.title)?.icon ?? '⏱️' } : initialFocusCategories[0] ?? defaultFocusCategories[0])
  const [nowMs, setNowMs] = useState(Date.now)
  const greeting = greetingFor(new Date(nowMs))
  const [activeTab, setActiveTab] = useState<'today' | 'habits' | 'journal' | 'progress' | 'calendar'>('today')
  const [isHabitFormOpen, setIsHabitFormOpen] = useState(false)
  const [habitDraft, setHabitDraft] = useState({ name: '', icon: '✨', area: 'Bilgi' as Area, minimum: '', ideal: '' })
  const [planDraft, setPlanDraft] = useState('')
  const [planError, setPlanError] = useState('')
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false)
  const [timerError, setTimerError] = useState('')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isScoreDetailsOpen, setIsScoreDetailsOpen] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const persistStatePayload = async (payload: string) => {
    if (storageModeRef.current === 'indexeddb') {
      try { await saveMainState(payload); return }
      catch {
        writeFallbackState(payload)
        storageModeRef.current = 'localstorage-fallback'
        setStorageMode('localstorage-fallback')
        setRecoveryNotice('IndexedDB bağlantısı kesildi; yeni kayıtlar geçici olarak tarayıcı depolamasında korunuyor.')
        return
      }
    }
    writeFallbackState(payload)
  }

  const actions = useSavedActions(() => stateRef.current, next => { stateRef.current = next; setAppState(next) }, persistStatePayload)
  const setState = actions.mutate
  const [focusViewOpen, setFocusViewOpen] = useState(false)
  const closeFocusView = () => { setFocusViewOpen(false); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined) }
  const openFocusView = () => { setFocusViewOpen(true); if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined) }
  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.reduceMotion ? 'reduced' : 'system'
  }, [state.settings.reduceMotion])
  const selectionRestored = useRef(false)
  const saveCalendarBlock = async (block: CalendarBlock) => {
    if (!validCalendarBlock(block)) return 'Geçerli bir konu, tarih ve 15 dakikadan uzun süre gir. Blok gece yarısını aşamaz.'
    const ok = await setState(current => {
      const conflicts = conflictsFor(block, current.calendarBlocks ?? [])
      if (conflicts.length) throw new Error('Bu saat ' + conflicts.map(item => item.title).join(', ') + ' ile çakışıyor. Başka bir saat seç.')
      return { ...current, calendarBlocks: [...(current.calendarBlocks ?? []).filter(item => item.id !== block.id), block] }
    })
    return ok ? null : saveFailure
  }
  const deleteCalendarBlock = (id: string) => setState(current => ({ ...current, calendarBlocks: (current.calendarBlocks ?? []).filter(item => item.id !== id) }))

  useEffect(() => {
    let midnightTimer = 0
    const refreshDate = () => { const now = new Date(); setToday(dateKey(now)); setNowMs(now.getTime()) }
    const clockTimer = window.setInterval(refreshDate, 30_000)
    const scheduleMidnight = () => {
      window.clearTimeout(midnightTimer)
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
      midnightTimer = window.setTimeout(() => { refreshDate(); scheduleMidnight() }, Math.max(1_000, nextMidnight - now.getTime() + 100))
    }
    scheduleMidnight()
    window.addEventListener('focus', refreshDate)
    document.addEventListener('visibilitychange', refreshDate)
    return () => { window.clearInterval(clockTimer); window.clearTimeout(midnightTimer); window.removeEventListener('focus', refreshDate); document.removeEventListener('visibilitychange', refreshDate) }
  }, [])
  useEffect(() => {
    let active = true
    const activate = (next: AppState, mode: Exclude<StorageMode, 'loading'>, notice = '') => {
      if (!active) return
      stateRef.current = next
      storageModeRef.current = mode
      setAppState(next)
      setStorageMode(mode)
      setRecoveryNotice(notice)
      setStorageReady(true)
      startupRecoveryNeeded = false
    }
    const archiveLegacy = () => {
      const legacyRaw = localStorage.getItem(storageKey)
      if (!legacyRaw) return
      try {
        if (!localStorage.getItem(legacyMigrationBackupKey)) localStorage.setItem(legacyMigrationBackupKey, legacyRaw)
        localStorage.removeItem(storageKey)
        localStorage.removeItem(fallbackUpdatedAtKey)
      } catch { /* IndexedDB ana kayıt olarak çalışır; eski kayıt yerinde kalabilir. */ }
    }
    const recoveryCandidate = async () => {
      for (const raw of [localStorage.getItem(storageKey), localStorage.getItem(legacyMigrationBackupKey)]) {
        if (!raw) continue
        try { return { state: validateBackup(JSON.parse(raw)).state, label: 'eski tarayıcı kaydı' } }
        catch { try { localStorage.setItem(corruptStateStorageKey, raw) } catch { /* Ham kayıt sığmıyorsa mevcut yedekler denenir. */ } }
      }
      try {
        for (const snapshot of await listAutomaticBackups()) {
          try { return { state: validateBackup(JSON.parse(snapshot.payload)).state, label: `${new Date(snapshot.createdAt).toLocaleString('tr-TR')} tarihli otomatik yedek` } }
          catch { /* Bir sonraki doğrulanabilir sürümü dene. */ }
        }
      } catch { /* IndexedDB tamamen kullanılamıyorsa yerel adaylarla devam edilir. */ }
      return null
    }
    const initializeStorage = async () => {
      try {
        const stored = await loadMainState()
        if (stored) {
          try {
            const fallbackRaw = localStorage.getItem(storageKey)
            const storedUpdatedAt = Date.parse(stored.updatedAt)
            let loaded = validateBackup(JSON.parse(stored.payload)).state
            let useFallback = false
            if (fallbackRaw) {
              try {
                const candidate = JSON.parse(fallbackRaw)
                const fallbackUpdatedAt = Date.parse(candidate.exportedAt ?? localStorage.getItem(fallbackUpdatedAtKey) ?? '')
                if (Number.isFinite(fallbackUpdatedAt) && (!Number.isFinite(storedUpdatedAt) || fallbackUpdatedAt > storedUpdatedAt)) {
                  loaded = validateBackup(candidate).state
                  useFallback = true
                }
              } catch { /* Geçersiz geçici kayıt, doğrulanmış ana kaydın yerini alamaz. */ }
            }
            if (useFallback) await saveMainState(JSON.stringify(loaded))
            archiveLegacy()
            activate(loaded, 'indexeddb', useFallback ? 'Geçici depoda bulunan daha yeni kayıt kurtarıldı ve IndexedDB ile birleştirildi.' : '')
            return
          } catch {
            try { localStorage.setItem(corruptStateStorageKey, stored.payload) } catch { /* Bozuk ham veri çok büyükse otomatik yedekler yine denenir. */ }
            throw new Error('IndexedDB ana kaydı doğrulanamadı.')
          }
        }
        const legacyRaw = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyMigrationBackupKey)
        const initial = legacyRaw ? validateBackup(JSON.parse(legacyRaw)).state : stateRef.current
        await saveMainState(JSON.stringify(initial))
        archiveLegacy()
        activate(initial, 'indexeddb', legacyRaw ? 'Mevcut verilerin doğrulandı ve IndexedDB ana veri deposuna güvenle taşındı.' : '')
      } catch {
        const recovered = await recoveryCandidate()
        const next = recovered?.state ?? emptyState()
        try {
          await saveMainState(JSON.stringify(next))
          archiveLegacy()
          activate(next, 'indexeddb', recovered ? `${recovered.label} kurtarıldı ve IndexedDB’ye yazıldı.` : 'Geçerli eski kayıt bulunamadı; yeni ve doğrulanmış IndexedDB deposu oluşturuldu.')
        } catch {
          try {
            writeFallbackState(JSON.stringify(next))
            activate(next, 'localstorage-fallback', recovered ? `${recovered.label} kurtarıldı. IndexedDB kullanılamadığı için geçici tarayıcı deposu kullanılıyor.` : 'IndexedDB kullanılamıyor; uygulama geçici tarayıcı deposuyla açıldı.')
          } catch { if (active) setTimerError('Ana veri deposu açılamadı ve güvenli geri dönüş kaydı oluşturulamadı.') }
        }
      }
    }
    void initializeStorage()
    return () => { active = false }
  }, [])
  useEffect(() => {
    try {
      if (activeFocus) localStorage.setItem(activeFocusStorageKey, JSON.stringify(activeFocus))
      else localStorage.removeItem(activeFocusStorageKey)
    } catch { setTimerError('Zamanlayıcı tarayıcıya kaydedilemedi. Depolama alanını kontrol et.') }
  }, [activeFocus])
  useEffect(() => {
    if (!activeFocus) return
    const refresh = () => setNowMs(Date.now())
    refresh()
    const timer = window.setInterval(refresh, activeFocus.status === 'running' ? 1000 : 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [activeFocus?.status, activeFocus?.id])
  useEffect(() => {
    const reminders = state.settings.reminders
    if (!reminders.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    let disposed = false
    const check = async () => {
      const now = new Date(); const currentMinutes = minutesNow(); const day = dateKey(now)
      const sentKey = 'momentum-reminders-sent-v1'
      let sent: Record<string, boolean> = {}
      try { sent = JSON.parse(localStorage.getItem(sentKey) ?? '{}') as Record<string, boolean> } catch { sent = {} }
      const candidates = [
        { id: 'plan', time: reminders.planTime, due: (state.dailyPlans[day] ?? []).length === 0, title: 'Bugünün yönünü belirle', body: 'Bugünün en önemli 3 işinden ilkini seç.' },
        { id: 'habits', time: reminders.habitsTime, due: activeHabits.some((habit) => !state.habitLog[day]?.[habit.id] || state.habitLog[day][habit.id].status === 'partial'), title: 'Minimum hedef yeterli', body: 'Bugünün alışkanlıklarından en az birini minimum seviyede tamamla.' },
        { id: 'reflection', time: reminders.reflectionTime, due: !state.reflections[day] || !Object.values(state.reflections[day]).some((value) => value.trim()), title: 'Günü 30 saniyede kapat', body: 'Bugünü değerlendir ve yarının en önemli işini yaz.' },
        { id: 'weekly', time: reminders.weeklyTime, due: reminders.weeklyEnabled && now.getDay() === 0, title: 'Haftalık Momentum özeti', body: 'Geçen haftayı incele ve yeni haftanın odağını belirle.' },
      ]
      const due = candidates.find((candidate) => candidate.due && currentMinutes >= timeToMinutes(candidate.time) && !sent[`${day}-${candidate.id}`])
      if (!due || disposed) return
      try {
        const registration = await navigator.serviceWorker?.ready
        if (registration) await registration.showNotification(due.title, { body: due.body, icon: '/icon.svg', badge: '/icon.svg', tag: `momentum-${due.id}` })
        else new Notification(due.title, { body: due.body, icon: '/icon.svg', tag: `momentum-${due.id}` })
        sent[`${day}-${due.id}`] = true
        const retained = Object.fromEntries(Object.entries(sent).filter(([key]) => key.slice(0, 10) >= previousDate(previousDate(day))))
        localStorage.setItem(sentKey, JSON.stringify(retained))
      } catch { /* Permission or platform availability can change at runtime. */ }
    }
    void check()
    const timer = window.setInterval(() => void check(), 30_000)
    window.addEventListener('focus', check)
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [state.settings.reminders, state.dailyPlans, state.habitLog, state.reflections, state.habits, today])
  useEffect(() => {
    const syncActiveFocus = (event: StorageEvent) => {
      if (event.key !== activeFocusStorageKey) return
      const synced = readActiveFocus()
      setActiveFocus(synced)
      if (synced) setSelected({ title: synced.title, area: synced.area, icon: stateRef.current.focusCategories.find((option) => option.title === synced.title)?.icon ?? '⏱️' })
      setNowMs(Date.now())
    }
    window.addEventListener('storage', syncActiveFocus)
    return () => window.removeEventListener('storage', syncActiveFocus)
  }, [])

  const isRunning = activeFocus?.status === 'running'
  const timerSeconds = focusSeconds(activeFocus, nowMs)
  const liveFocusSessions = activeFocus ? focusSessionsFromActive(activeFocus, nowMs) : []
  const effectiveSessions = upsertFocusSessions(state.sessions, liveFocusSessions)
  const reportingState = liveFocusSessions.length ? { ...state, sessions: effectiveSessions } : state
  const activeHabits = state.habits.filter((habit) => !habit.archived)
  const activeFocusCategories = state.focusCategories.filter((category) => !category.archived)

  const todaySessions = effectiveSessions.filter((session) => session.date === today)
  const totalSeconds = todaySessions.reduce((sum, session) => sum + session.seconds, 0)
  const todayLog = state.habitLog[today] ?? {}
  const todayPlan = state.dailyPlans[today] ?? []
  const todayScreenTimeEntries = state.screenTimeEntries.filter((entry) => entry.date === today)
  const completedHabits = activeHabits.filter((habit) => todayLog[habit.id] && todayLog[habit.id].status !== 'partial').length
  const idealHabits = activeHabits.filter((habit) => todayLog[habit.id]?.status === 'ideal').length
  const dailyFocusSeconds = state.settings.dailyFocusMinutes * 60
  const scoreBreakdown = calculateDailyScore({ focusSeconds: totalSeconds, focusTargetMinutes: state.settings.dailyFocusMinutes, idealHabits, minimumHabits: completedHabits - idealHabits, habitCount: activeHabits.length })
  const dailyScore = scoreBreakdown.total
  const activeDates = useMemo(() => activityDates(reportingState), [state, activeFocus?.id, activeFocus?.status, timerSeconds])
  useEffect(() => {
    if (!storageReady) return
    if (!selectionRestored.current && !activeFocus) {
      selectionRestored.current = true
      const recent = state.experience?.recentEntries[0]
      const category = activeFocusCategories.find(item => item.title === recent?.title)
      if (category) { setSelected(category); return }
    }
    if (activeFocus || activeFocusCategories.some((category) => category.title === selected.title)) return
    if (activeFocusCategories[0]) setSelected(activeFocusCategories[0])
  }, [state.focusCategories, activeFocus?.id, selected.title, storageReady])
  const commitActiveFocus = (next: ActiveFocusSession | null) => {
    try {
      if (next) localStorage.setItem(activeFocusStorageKey, JSON.stringify(next))
      else localStorage.removeItem(activeFocusStorageKey)
      setActiveFocus(next)
      return true
    } catch {
      setTimerError('Zamanlayıcı tarayıcıya kaydedilemedi. Depolama alanını kontrol et; mevcut süren korunuyor.')
      return false
    }
  }

  const setHabitEntry = (id: string, entry: HabitEntry | null) => setState((current) => {
    const currentLog = { ...(current.habitLog[today] ?? {}) }
    if (entry === null) delete currentLog[id]
    else currentLog[id] = entry
    return { ...current, habitLog: { ...current.habitLog, [today]: currentLog } }
  })
  const startTimer = () => {
    const startedAt = new Date().toISOString()
    if (!commitActiveFocus({ version: 1, id: crypto.randomUUID(), title: selected.title, area: selected.area, startedAt, status: 'running', segments: [{ startedAt }] })) return
    actions.dismiss(); actions.dismissCelebration()
    setTimerError('')
    setNowMs(Date.now())
  }
  const pauseTimer = () => {
    if (!activeFocus) return
    const endedAt = new Date().toISOString()
    if (!commitActiveFocus({ ...activeFocus, status: 'paused', segments: activeFocus.segments.map((segment, index) => index === activeFocus.segments.length - 1 && !segment.endedAt ? { ...segment, endedAt } : segment) })) return
    setNowMs(Date.now())
  }
  const resumeTimer = () => {
    if (!activeFocus) return
    const startedAt = new Date().toISOString()
    if (!commitActiveFocus({ ...activeFocus, status: 'running', segments: [...activeFocus.segments, { startedAt }] })) return
    setNowMs(Date.now())
  }
  const stopTimer = async () => {
    if (!activeFocus || actions.pending) return
    const stoppedAt = Date.now()
    const finished: ActiveFocusSession = activeFocus.status === 'running'
      ? { ...activeFocus, status: 'paused', segments: activeFocus.segments.map((segment, index) => index === activeFocus.segments.length - 1 && !segment.endedAt ? { ...segment, endedAt: new Date(stoppedAt).toISOString() } : segment) }
      : activeFocus
    const sessions = focusSessionsFromActive(finished, stoppedAt)
    try {
      localStorage.setItem(activeFocusStorageKey, JSON.stringify(finished))
      const current = stateRef.current
      const mergedSessions = upsertFocusSessions(current.sessions, sessions)
      const secondsByDate = new Map<string, number>()
      mergedSessions.forEach((session) => secondsByDate.set(session.date, (secondsByDate.get(session.date) ?? 0) + session.seconds))
      if ([...secondsByDate.values()].some((seconds) => seconds > 86_400)) {
        setActiveFocus(finished)
        setTimerError('Bu oturum bir günün toplam odak süresini 24 saatin üzerine çıkarıyor. İlgili gündeki hatalı manuel kaydı silip tekrar dene; oturumun korunuyor.')
        return
      }
      const saved = await setState(latest => sessions.length ? { ...latest, sessions: upsertFocusSessions(latest.sessions, sessions), experience: rememberEntry(latest, { title: finished.title, area: finished.area, minutes: Math.max(1, Math.round(focusSeconds(finished, stoppedAt) / 60)) }) } : latest)
      if (!saved) { setActiveFocus(finished); setTimerError(saveFailure); return }
    } catch {
      setActiveFocus(finished)
      setTimerError('Oturum tarayıcıya kaydedilemedi. Depolama alanını kontrol edip tekrar dene; süren korunuyor.')
      return
    }
    if (!commitActiveFocus(null)) { setActiveFocus(finished); return }
    setTimerError('')
    setNowMs(stoppedAt)
    closeFocusView()
  }
  const createHabit = async (event: FormEvent) => {
    event.preventDefault()
    if (!habitDraft.name.trim() || !habitDraft.minimum.trim() || !habitDraft.ideal.trim()) return
    const saved = await setState((current) => ({ ...current, habits: [...current.habits, { id: crypto.randomUUID(), icon: habitDraft.icon || '✨', name: habitDraft.name.trim(), area: habitDraft.area, minimum: habitDraft.minimum.trim(), ideal: habitDraft.ideal.trim() }] }))
    if (!saved) return
    setHabitDraft({ name: '', icon: '✨', area: 'Bilgi', minimum: '', ideal: '' }); setIsHabitFormOpen(false)
  }
  const saveHabit = (habit: Habit) => setState((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? { ...habit, name: habit.name.trim(), icon: habit.icon.trim() || '✨', minimum: habit.minimum.trim(), ideal: habit.ideal.trim() } : item) }))
  const archiveHabit = (id: string, archived: boolean) => setState((current) => ({ ...current, habits: current.habits.map((habit) => habit.id === id ? { ...habit, archived } : habit) }))
  const deleteHabit = async (id: string) => {
    const hasHistory = Object.values(state.habitLog).some((log) => Boolean(log[id]))
    if (hasHistory) { if (!await archiveHabit(id, true)) return saveFailure; return 'Geçmiş kayıtları korumak için alışkanlık arşivlendi.' }
    if (!await setState((current) => ({ ...current, habits: current.habits.filter((habit) => habit.id !== id) }))) return saveFailure
    return 'Alışkanlık silindi.'
  }
  const addFocusCategory = (category: Omit<FocusCategory, 'id'>) => setState((current) => ({ ...current, focusCategories: [...current.focusCategories, { ...category, id: crypto.randomUUID(), title: category.title.trim(), icon: category.icon.trim() || '⏱️' }] }))
  const saveFocusCategory = async (category: FocusCategory) => {
    const previous = state.focusCategories.find((item) => item.id === category.id)
    if (!previous) return false
    const saved = await setState((current) => ({ ...current, focusCategories: current.focusCategories.map((item) => item.id === category.id ? { ...category, title: category.title.trim(), icon: category.icon.trim() || '⏱️' } : item), sessions: current.sessions.map((session) => session.title === previous.title ? { ...session, title: category.title.trim(), area: category.area } : session), goals: current.goals.map((goal) => goal.activity === previous.title ? { ...goal, activity: category.title.trim() } : goal) }))
    if (!saved) return false
    if (selected.title === previous.title) setSelected({ title: category.title.trim(), area: category.area, icon: category.icon.trim() || '⏱️' })
    return true
  }
  const archiveFocusCategory = (id: string, archived: boolean) => setState((current) => {
    if (!archived) return { ...current, focusCategories: current.focusCategories.map((category) => category.id === id ? { ...category, archived: false } : category) }
    const activeCount = current.focusCategories.filter((category) => !category.archived).length
    if (activeCount <= 1) return current
    return { ...current, focusCategories: current.focusCategories.map((category) => category.id === id ? { ...category, archived: true } : category) }
  })
  const deleteFocusCategory = (id: string) => setState((current) => {
    const category = current.focusCategories.find((item) => item.id === id)
    if (!category) return current
    const activeCount = current.focusCategories.filter((item) => !item.archived).length
    const hasHistory = current.sessions.some((session) => session.title === category.title) || current.goals.some((goal) => goal.activity === category.title)
    if (hasHistory || (!category.archived && activeCount <= 1)) return { ...current, focusCategories: current.focusCategories.map((item) => item.id === id ? { ...item, archived: true } : item) }
    return { ...current, focusCategories: current.focusCategories.filter((item) => item.id !== id) }
  })
  const saveSettings = (settings: UserSettings) => setState((current) => ({ ...current, settings: normalizedSettings(settings) }))
  const completeOnboarding = (settings: UserSettings, enabledHabitIds: string[], enabledFocusIds: string[]) => setState((current) => ({ ...current, settings: { ...normalizedSettings(settings), onboardingComplete: true }, habits: current.habits.map((habit) => ({ ...habit, archived: !enabledHabitIds.includes(habit.id) })), focusCategories: current.focusCategories.map((category) => ({ ...category, archived: !enabledFocusIds.includes(category.id) })) }))
  const addPlanItem = async (event: FormEvent) => {
    event.preventDefault()
    const text = planDraft.trim()
    if (!text) { setPlanError('Öncelik boş bırakılamaz.'); return }
    if (todayPlan.length >= 3) { setPlanError('Bugün en fazla 3 önemli iş seçebilirsin.'); return }
    const saved = await setState((current) => ({ ...current, dailyPlans: { ...current.dailyPlans, [today]: [...(current.dailyPlans[today] ?? []), { id: crypto.randomUUID(), text, completed: false }] } }))
    if (!saved) { setPlanError(saveFailure); return }
    setPlanDraft(''); setPlanError('')
  }
  const updatePlan = (id: string, update: Partial<DailyPlanItem>) => setState((current) => ({ ...current, dailyPlans: { ...current.dailyPlans, [today]: (current.dailyPlans[today] ?? []).map((item) => item.id === id ? { ...item, ...update } : item) } }))
  const removePlan = (id: string) => setState((current) => ({ ...current, dailyPlans: { ...current.dailyPlans, [today]: (current.dailyPlans[today] ?? []).filter((item) => item.id !== id) } }))
  const saveReflection = (reflection: DailyReflection) => setState((current) => ({ ...current, reflections: { ...current.reflections, [today]: reflection } }))
  const saveGoal = (goal: Goal) => setState((current) => ({ ...current, goals: current.goals.some((item) => item.id === goal.id) ? current.goals.map((item) => item.id === goal.id ? goal : item) : [...current.goals, goal] }))
  const deleteGoal = (id: string) => { return setState((current) => ({ ...current, goals: current.goals.filter((goal) => goal.id !== id) })) }
  const saveWeeklyFocus = (focus: string) => {
    const isSunday = new Date(`${today}T12:00:00`).getDay() === 0
    const sundayKey = isSunday ? today : (() => { let d = today; while (new Date(`${d}T12:00:00`).getDay() !== 0) d = previousDate(d); return d })()
    return setState((current) => ({ ...current, weeklyFocus: { ...current.weeklyFocus, [sundayKey]: focus } }))
  }

  const addManualSession = async (date: string, title: string, area: Area, minutes: number) => {
    if (activeFocus) return 'Manuel kayıt eklemeden önce açık odak oturumunu bitir.'
    if (date > today) return 'Gelecek günlere odak kaydı eklenemez.'
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1_440) return 'Süre 1–1440 arasında tam dakika olmalı.'
    const currentDaySeconds = stateRef.current.sessions.filter((session) => session.date === date).reduce((sum, session) => sum + session.seconds, 0)
    if (currentDaySeconds + minutes * 60 > 86_400) return 'Bu günün toplam odak süresi 24 saati aşamaz.'
    const saved = await setState(current => ({ ...current, sessions: [...current.sessions, { id: crypto.randomUUID(), title, area, seconds: minutes * 60, startedAt: new Date(`${date}T12:00:00`).toISOString(), date, source: 'manual' }], experience: rememberEntry(current, { title, area, minutes }), focusCategories: current.focusCategories.some(category => category.title === title) ? current.focusCategories : [...current.focusCategories, { id: crypto.randomUUID(), title, area, icon: '⏱️' }] }))
    return saved ? null : saveFailure
  }
  const deleteSession = (id: string) => setState(current => ({ ...current, sessions: current.sessions.filter(s => s.id !== id) }))
  const updateSession = async (id: string, update: Pick<FocusSession, 'title' | 'area' | 'seconds'>) => {
    if (!Number.isInteger(update.seconds) || update.seconds < 1 || update.seconds > 86_400) return 'Süre 1–1440 dakika arasında olmalı.'
    const session = state.sessions.find((item) => item.id === id)
    if (!session) return 'Oturum bulunamadı.'
    if (update.seconds !== session.seconds && (update.seconds < 60 || update.seconds % 60 !== 0)) return 'Süre 1–1440 arasında tam dakika olmalı.'
    const otherSeconds = state.sessions.filter((item) => item.date === session.date && item.id !== id).reduce((sum, item) => sum + item.seconds, 0)
    if (otherSeconds + update.seconds > 86_400) return 'Bu günün toplam odak süresi 24 saati aşamaz.'
    const saved = await setState((current) => ({ ...current, sessions: current.sessions.map((item) => item.id === id ? updateFocusSession(item, update) : item) }))
    return saved ? null : saveFailure
  }
  const setHabitEntryForDate = (date: string, id: string, entry: HabitEntry | null) => setState((current) => {
    const log = { ...(current.habitLog[date] ?? {}) }
    if (entry) log[id] = entry
    else delete log[id]
    return { ...current, habitLog: { ...current.habitLog, [date]: log } }
  })
  const saveReflectionForDate = (date: string, reflection: DailyReflection) => setState((current) => ({ ...current, reflections: { ...current.reflections, [date]: reflection } }))

  const yesterday = previousDate(today)
  const yesterdayLog = state.habitLog[yesterday] ?? {}
  const dayBeforeYesterdayLog = state.habitLog[previousDate(yesterday)] ?? {}
  const missedYesterday = activeHabits.filter(h => {
    const yEntry = yesterdayLog[h.id]
    const tEntry = todayLog[h.id]
    const previousEntry = dayBeforeYesterdayLog[h.id]
    const missedY = !yEntry || yEntry.status === 'partial'
    const notDoneT = !tEntry || tEntry.status === 'partial'
    return previousEntry && previousEntry.status !== 'partial' && missedY && notDoneT
  })

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const addScreenTimeEntries = async (entries: WastedEntry[], source: Exclude<ScreenTimeSource, 'legacy'>, kind: TrackedScreenKind = 'unclassified', screenshotHash?: string) => {
    const incomingMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0)
    if (screenTimeMinutesForDate(state, today) + incomingMinutes > 1440) return 'Bugünün toplam ekran süresi 24 saati aşamaz.'
    const now = new Date().toISOString()
    const nextEntries: ScreenTimeEntry[] = entries.map((entry) => ({ id: crypto.randomUUID(), date: today, app: entry.app.trim(), minutes: entry.minutes, kind, source, createdAt: now, screenshotHash }))
    const saved = await setState((current) => ({ ...current, screenTimeEntries: [...current.screenTimeEntries, ...nextEntries] }))
    return saved ? null : saveFailure
  }
  const updateScreenTimeEntry = async (id: string, update: Pick<ScreenTimeEntry, 'app' | 'minutes' | 'kind'>) => {
    const currentEntry = state.screenTimeEntries.find((entry) => entry.id === id)
    if (!currentEntry) return 'Ekran süresi kaydı bulunamadı.'
    const nextDayTotal = screenTimeMinutesForDate(state, currentEntry.date) - currentEntry.minutes + update.minutes
    if (nextDayTotal > 1440) return 'Günün toplam ekran süresi 24 saati aşamaz.'
    const saved = await setState((current) => ({ ...current, screenTimeEntries: current.screenTimeEntries.map((entry) => entry.id === id ? { ...entry, app: update.app.trim(), minutes: update.minutes, kind: update.kind } : entry) }))
    return saved ? null : saveFailure
  }
  const deleteScreenTimeEntry = (id: string) => setState((current) => ({ ...current, screenTimeEntries: current.screenTimeEntries.filter((entry) => entry.id !== id) }))

  const handleImportState = async (newState: AppState): Promise<StateChangeResult> => {
    if (activeFocus) return { ok: false, error: 'İçe aktarmadan önce açık odak oturumunu kaydet veya bitir.' }
    try {
      localStorage.setItem(importRollbackStorageKey, JSON.stringify(backupEnvelope(stateRef.current)))
      const ok = await setState(newState)
      return { ok, error: ok ? undefined : saveFailure }
    } catch { return { ok: false, error: 'Yedek tarayıcıya yazılamadı. Mevcut verilerin değiştirilmedi.' } }
  }
  const cloud = useCloudSync({
    state,
    storageReady,
    disabled: Boolean(activeFocus),
    validatePayload: payload => validateBackup(payload).state,
    replaceState: handleImportState,
  })
  const restoreImportRollback = async (): Promise<StateChangeResult> => {
    if (activeFocus) return { ok: false, error: 'Geri almadan önce açık odak oturumunu kaydet veya bitir.' }
    try {
      const raw = localStorage.getItem(importRollbackStorageKey)
      if (!raw) return { ok: false, error: 'Geri alınabilecek bir içe aktarma bulunamadı.' }
      const previous = validateBackup(JSON.parse(raw)).state
      if (!await setState(previous)) return { ok: false, error: saveFailure }
      localStorage.removeItem(importRollbackStorageKey)
      return { ok: true }
    } catch (error) { return { ok: false, error: error instanceof Error ? `Geri alma yedeği okunamadı: ${error.message}` : 'Geri alma yedeği okunamadı.' } }
  }
  const openDayDetail = (date: string) => { if (date <= today) setSelectedDate(date) }

  if (!storageReady) return <main className="database-loading" aria-busy="true"><div className="brand-mark">M</div><div><p className="eyebrow">MOMENTUM VERİ DEPOSU</p><h1>Verilerin güvenle hazırlanıyor.</h1><p>Mevcut kayıtlar doğrulanıyor ve ana veri deposu açılıyor…</p>{timerError && <p className="form-error" role="alert">{timerError} Sayfayı yenileyerek tekrar deneyebilirsin.</p>}</div><span className="database-loading-bar" /></main>

  return <><fieldset className="app-interactions" disabled={actions.pending}><a className="skip-link" href="#main-content">Ana içeriğe geç</a><main id="main-content" className={`app-shell ${state.settings.compactToday ? 'compact-today' : ''} ${activeFocus ? 'focus-engaged' : ''}`}>
    <header className="topbar"><a className="brand" href="#top" aria-label="Momentum ana sayfa"><span className="brand-mark">M</span> momentum</a><nav className="main-nav" aria-label="Ana bölümler"><button aria-current={activeTab === 'today' ? 'page' : undefined} className={activeTab === 'today' ? 'nav-active' : ''} onClick={() => setActiveTab('today')}>Bugün</button><button aria-current={activeTab === 'habits' ? 'page' : undefined} className={activeTab === 'habits' ? 'nav-active' : ''} onClick={() => setActiveTab('habits')}>Alışkanlıklar</button><button aria-current={activeTab === 'journal' ? 'page' : undefined} className={activeTab === 'journal' ? 'nav-active' : ''} onClick={() => setActiveTab('journal')}>Günlük</button><button aria-current={activeTab === 'progress' ? 'page' : undefined} className={activeTab === 'progress' ? 'nav-active' : ''} onClick={() => setActiveTab('progress')}>İlerleme</button><button aria-current={activeTab === 'calendar' ? 'page' : undefined} className={activeTab === 'calendar' ? 'nav-active' : ''} onClick={() => setActiveTab('calendar')}>Takvim</button></nav><button className="undo-shortcut" onClick={actions.undo} disabled={!actions.canUndo} aria-label="Son değişikliği geri al"><Icon name="undo" /></button><button className="avatar" aria-label="Ayarlar" onClick={() => setIsCustomizeOpen(true)}><Icon name="settings" /></button></header>
    {recoveryNotice && <div className="recovery-banner" role="status"><Icon name="alert" /><p>{recoveryNotice}</p><button aria-label="Kurtarma bildirimini kapat" onClick={() => setRecoveryNotice('')}>×</button></div>}
    <div className="page-transition" key={activeTab}>
    {activeTab === 'today' && <section className="hero" id="top"><div><p className="eyebrow">{weekdayAndDate(new Date(nowMs))}</p><h1>{greeting.message}, {state.settings.name || 'Alpargu'}.</h1><p className="hero-copy">{greeting.copy}</p></div><ScoreRing score={dailyScore} /></section>}
    {activeTab === 'today' ? <>
      {missedYesterday.length > 0 && <section className="never-miss-banner">
        <div className="nmt-icon"><Icon name="alert" /></div>
        <div className="nmt-content">
          <strong>Never Miss Twice</strong>
          <p>Dün <strong>{missedYesterday.map(h => h.name).join(', ')}</strong> kaçtı; bugün minimum hedefi yaparak seriyi yeniden başlat.</p>
        </div>
      </section>}
      <section className="grid primary-grid"><article className="card focus-card"><div className="card-heading"><div><p className="eyebrow">FOCUS</p><h2>Şu an neye yatırım yapıyorsun?</h2></div><span className={`live-dot ${activeFocus?.status === 'paused' ? 'paused' : ''}`}>{isRunning ? 'Canlı' : activeFocus ? 'Duraklatıldı' : 'Hazır'}</span></div><div className="focus-choice-row">{activeFocusCategories.map((option) => <button key={option.id} disabled={Boolean(activeFocus)} onClick={() => setSelected(option)} className={`focus-choice ${selected.title === option.title ? 'selected' : ''}`}><AreaIcon area={option.area} />{option.title}</button>)}</div><div className={`timer ${isRunning ? 'timer-active' : ''} ${activeFocus?.status === 'paused' ? 'timer-paused' : ''}`}><span>{activeFocus ? activeFocus.title : 'Bir odak seç ve başla'}</span><strong>{formatDuration(timerSeconds)}</strong></div>{!activeFocus ? <button className="timer-button" onClick={startTimer}><Icon name="play" />Odak başlat</button> : <div className="timer-actions"><button className="timer-button pause" onClick={isRunning ? pauseTimer : resumeTimer}><Icon name={isRunning ? "pause" : "play"} />{isRunning ? 'Duraklat' : 'Devam et'}</button><button className="timer-button stop" onClick={stopTimer}><Icon name="stop" />Kaydet ve bitir</button></div>}
      {activeFocus ? <><button className="focus-expand" onClick={openFocusView}><Icon name="expand" />Tam ekran odak</button><p className="subtle">{isRunning ? 'Şu an yalnızca bu çalışmaya yer aç.' : 'Mola süresi kaydına eklenmez.'}</p></> : <QuickCapture selected={selected} categories={state.focusCategories} recent={state.experience?.recentEntries ?? []} onSave={addManualSession} />}
      {!activeFocus && state.sessions.filter(s => s.date === today).length > 0 && <div className="recent-log"><span className="eyebrow">BUGÜNKÜ SON KAYITLAR</span>{state.sessions.filter(s => s.date === today).slice(-3).reverse().map(session => <div key={session.id} data-record={session.id}><AreaIcon area={session.area} /><strong>{session.title}</strong><span>{session.seconds < 60 ? session.seconds + ' sn' : Math.round(session.seconds / 60) + ' dk'}</span><button className="delete-action" aria-label={session.title + ' kaydını sil'} onClick={() => deleteSession(session.id)}>Sil</button></div>)}</div>}
      {timerError && <p className="form-error" role="alert">{timerError}</p>}
      </article>
        <div className="today-side-stack"><article className="card today-card"><div className="card-heading"><div><p className="eyebrow">BUGÜN</p><h2>İlerleme özeti</h2></div><span className="date-pill">{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span></div><div className="time-display"><strong>{formatDuration(totalSeconds)}</strong><span>kendine ayrılan odak süresi</span></div><div className="progress-track"><span style={{ width: `${Math.min(100, totalSeconds / dailyFocusSeconds * 100)}%` }} /></div><div className="progress-label"><span>Günlük hedef: {formatDuration(dailyFocusSeconds)}</span><strong>{formatDuration(Math.max(0, dailyFocusSeconds - totalSeconds))} kaldı</strong></div><div className="summary-stats"><div><strong>{completedHabits}/{activeHabits.length}</strong><span>alışkanlık</span></div><div><strong>{todaySessions.length}</strong><span>focus oturumu</span></div><div><strong>+{dailyScore}</strong><span>gün puanı</span></div></div><button className="score-help" aria-expanded={isScoreDetailsOpen} onClick={() => setIsScoreDetailsOpen((open) => !open)}>Skor nasıl hesaplanıyor? {isScoreDetailsOpen ? '↑' : '↓'}</button>{isScoreDetailsOpen && <div className="score-breakdown"><span><strong>{scoreBreakdown.focusPoints}/65</strong> focus hedefi</span><span><strong>{scoreBreakdown.habitPoints}/35</strong> alışkanlıklar</span><p>İdeal alışkanlık tam puan, minimum hedef %60 puan getirir. Focus bölümü günlük süre hedefine ulaştığında 65 puanda durur.</p></div>}</article><DailyPlan plan={todayPlan} draft={planDraft} error={planError} onDraftChange={(value) => { setPlanDraft(value); setPlanError('') }} onAdd={addPlanItem} onUpdate={updatePlan} onRemove={removePlan} /><TodayHabits habits={activeHabits} log={todayLog} onSetEntry={setHabitEntry} onOpenAll={() => setActiveTab('habits')} /></div></section>
      <TodayInsights sessions={state.sessions} screenEntries={state.screenTimeEntries} today={today} onOpenReport={() => setActiveTab('progress')} onOpenJournal={() => setActiveTab('journal')} />

    </> : activeTab === 'habits' ? <section className="tab-page"><section className="section-heading"><div><p className="eyebrow">GÜNLÜK RİTİM</p><h1>Alışkanlıkların</h1><p className="hero-copy">Miktar gir veya minimum/ideal durumunu tek dokunuşla kaydet.</p></div><button className="quiet-button" onClick={() => setIsHabitFormOpen(true)}>+ Yeni alışkanlık</button></section><section className="habit-grid">{activeHabits.map((habit) => <HabitCard key={habit.id} habit={habit} entry={todayLog[habit.id]} streak={getStreak(habit.id, state.habitLog, today)} onSetEntry={setHabitEntry} />)}</section></section> : activeTab === 'journal' ? <section className="tab-page"><section className="section-heading"><div><p className="eyebrow">GÜNÜ KAPAT</p><h1>Günlük ve ekran süresi</h1><p className="hero-copy">Bugünü değerlendir; telefon kullanımını görünür hale getir.</p></div></section><section className="grid journal-grid"><ReflectionCard date={today} initial={state.reflections[today]} onSave={saveReflection} /><article className="card screen-time-card"><div className="card-heading"><div><p className="eyebrow">EKRAN SÜRESİ</p><h2>Bugünün telefon kullanımı</h2></div></div><ScreenTimePanel entries={todayScreenTimeEntries} existingScreenshotHashes={new Set(state.screenTimeEntries.flatMap((entry) => entry.screenshotHash ? [entry.screenshotHash] : []))} onAddManual={(app, minutes, kind) => addScreenTimeEntries([{ app, minutes }], 'manual', kind)} onAddScreenshot={(entries, hash) => addScreenTimeEntries(entries, 'screenshot', 'unclassified', hash)} onUpdate={updateScreenTimeEntry} onDelete={deleteScreenTimeEntry} /></article></section></section> : activeTab === 'calendar' ? <CalendarView today={today} blocks={state.calendarBlocks ?? []} categories={activeFocusCategories} onSave={saveCalendarBlock} onDelete={deleteCalendarBlock} onDayClick={openDayDetail} /> : <ProgressView savedSessions={state.sessions} state={reportingState} activeDates={activeDates} today={today} focusCategories={state.focusCategories} onSaveGoal={saveGoal} onDeleteGoal={deleteGoal} openGoalForm={() => setIsGoalFormOpen(true)} onDayClick={openDayDetail} onSaveFocus={saveWeeklyFocus} />}
    </div>
    {focusViewOpen && activeFocus && <FocusView title={activeFocus.title} seconds={timerSeconds} running={isRunning} pending={actions.pending} error={timerError} onToggle={isRunning ? pauseTimer : resumeTimer} onFinish={stopTimer} onClose={closeFocusView} />}
    {isHabitFormOpen && <HabitForm draft={habitDraft} onChange={setHabitDraft} onClose={() => setIsHabitFormOpen(false)} onSubmit={createHabit} />}
    {isGoalFormOpen && <GoalForm focusCategories={state.focusCategories} onClose={() => setIsGoalFormOpen(false)} onSave={async (goal) => { const ok = await saveGoal(goal); if (ok) setIsGoalFormOpen(false); return ok }} />}
    {selectedDate && <DayDetailModal date={selectedDate} state={state} focusCategories={state.focusCategories} onClose={() => setSelectedDate(null)} onAddSession={addManualSession} onUpdateSession={updateSession} onDeleteSession={deleteSession} onSetHabitEntry={setHabitEntryForDate} onSaveReflection={saveReflectionForDate} onUpdateScreenTime={updateScreenTimeEntry} onDeleteScreenTime={deleteScreenTimeEntry} />}
    {isSettingsOpen && <SettingsModal state={state} today={today} storageMode={storageMode} cloud={cloud} hasActiveFocus={Boolean(activeFocus)} onClose={() => setIsSettingsOpen(false)} onImport={handleImportState} onRestoreRollback={restoreImportRollback} />}
    {isCustomizeOpen && <CustomizeModal state={state} hasActiveFocus={Boolean(activeFocus)} onClose={() => setIsCustomizeOpen(false)} onOpenData={() => { setIsCustomizeOpen(false); setIsSettingsOpen(true) }} onSaveSettings={saveSettings} onSaveHabit={saveHabit} onArchiveHabit={archiveHabit} onDeleteHabit={deleteHabit} onAddFocusCategory={addFocusCategory} onSaveFocusCategory={saveFocusCategory} onArchiveFocusCategory={archiveFocusCategory} onDeleteFocusCategory={deleteFocusCategory} />}
    {!state.settings.onboardingComplete && <OnboardingModal state={state} onComplete={completeOnboarding} />}
  </main></fieldset>{(!focusViewOpen || actions.pending || actions.notice?.kind === 'error') && <SaveFeedback actions={actions} />}</>
}

function DailyPlan({ plan, draft, error, onDraftChange, onAdd, onUpdate, onRemove }: { plan: DailyPlanItem[]; draft: string; error: string; onDraftChange: (value: string) => void; onAdd: (event: FormEvent) => void; onUpdate: (id: string, update: Partial<DailyPlanItem>) => Promise<boolean>; onRemove: (id: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const startEditing = (item: DailyPlanItem) => { setEditingId(item.id); setEditingText(item.text) }
  const saveEdit = async (id: string) => { const text = editingText.trim(); if (text && await onUpdate(id, { text })) setEditingId(null) }
  return <article className="card plan-card"><div className="card-heading"><div><p className="eyebrow">BUGÜNÜN ÖNCELİKLERİ</p><h2>En önemli 3 iş</h2></div><span className="date-pill">{plan.length}/3</span></div><form className="plan-add" onSubmit={onAdd}><input value={draft} maxLength={100} onChange={(event) => onDraftChange(event.target.value)} placeholder="Örn. Veri Yapıları ödevini bitir" aria-label="Yeni önemli iş" /><button type="submit" disabled={plan.length >= 3}>Ekle</button></form>{error && <p className="form-error" role="alert">{error}</p>}<div className="plan-list">{plan.length === 0 && <p className="empty-state">Bugün için tek bir net iş seçerek başla.</p>}{plan.map((item) => <div className={`plan-item ${item.completed ? 'plan-complete' : ''}`} key={item.id} data-record={item.id}><button className="plan-check" aria-label={`${item.text} tamamlandı`} onClick={() => onUpdate(item.id, { completed: !item.completed })}>{item.completed ? '✓' : ''}</button>{editingId === item.id ? <input className="plan-edit-input" value={editingText} onChange={(event) => setEditingText(event.target.value)} aria-label="İşi düzenle" onKeyDown={(event) => { if (event.key === 'Enter') saveEdit(item.id); if (event.key === 'Escape') setEditingId(null) }} /> : <span>{item.text}</span>}<div className="plan-item-actions">{editingId === item.id ? <><button onClick={() => saveEdit(item.id)}>Kaydet</button><button onClick={() => setEditingId(null)}>Vazgeç</button></> : <><button onClick={() => startEditing(item)}>Düzenle</button><button onClick={() => onRemove(item.id)} className="delete-action">Sil</button></>}</div></div>)}</div></article>
}
function ReflectionCard({ date, initial, onSave }: { date: string; initial?: DailyReflection; onSave: (reflection: DailyReflection) => Promise<boolean> }) {
  const [reflection, setReflection] = useState<DailyReflection>(initial ?? { good: '', wasted: '', tomorrow: '' })
  const [saved, setSaved] = useState(false)
  useEffect(() => { setReflection(initial ?? { good: '', wasted: '', tomorrow: '' }); setSaved(false) }, [date])
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaved(await onSave(reflection)) }
  return <article className="card reflection-card"><div className="card-heading"><div><p className="eyebrow">GÜN SONU</p><h2>30 saniyelik değerlendirme</h2></div><span className={saved ? 'saved-note' : 'date-pill'}>{saved ? 'Kaydedildi ✓' : 'Akşam'}</span></div><form onSubmit={submit} className="reflection-form"><label>Bugün ne iyi gitti?<textarea maxLength={2000} value={reflection.good} onChange={(event) => { setReflection({ ...reflection, good: event.target.value }); setSaved(false) }} placeholder="Örn. Timerı açıp 2 saat odağımı korudum." /></label><label>Bugün nerede zaman kaybettim?<textarea maxLength={2000} value={reflection.wasted} onChange={(event) => { setReflection({ ...reflection, wasted: event.target.value }); setSaved(false) }} placeholder="Örn. Gereğinden fazla sosyal medya kullandım." /></label><label>Yarın en önemli şey ne?<textarea maxLength={2000} value={reflection.tomorrow} onChange={(event) => { setReflection({ ...reflection, tomorrow: event.target.value }); setSaved(false) }} placeholder="Örn. Algoritma ödevini teslim etmek." /></label><button className="reflection-save" type="submit">Değerlendirmeyi kaydet</button></form></article>
}
function ScoreRing({ score }: { score: number }) { return <div className="day-score" aria-label={`Günlük skor yüzde ${score}`}><svg viewBox="0 0 36 36"><path className="ring-bg" d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831" /><path className="ring-value" strokeDasharray={`${score}, 100`} d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831" /></svg><div><strong>{score}</strong><span>günlük skor</span></div></div> }
function TodayHabits({ habits, log, onSetEntry, onOpenAll }: { habits: Habit[]; log: Record<string, HabitEntry>; onSetEntry: (id: string, entry: HabitEntry | null) => Promise<boolean>; onOpenAll: () => void }) {
  return <article className="card today-habits"><div className="card-heading"><div><p className="eyebrow">BUGÜNÜN RİTMİ</p><h2>Alışkanlıklar</h2></div><button className="text-button" onClick={onOpenAll}>Miktar gir →</button></div><div className="today-habit-list">{habits.map((habit) => { const entry = log[habit.id]; return <div className={`today-habit-row ${entry && entry.status !== 'partial' ? 'done' : ''}`} key={habit.id} data-record={habit.id}><span className="today-habit-name"><HabitRing completed={Boolean(entry && entry.status !== 'partial')} value={entry?.status === 'ideal' ? 1 : entry?.status === 'minimum' ? 0.6 : 0} /><span><strong>{habit.name}</strong><small>{habit.minimum} / {habit.ideal}</small></span></span><div className="today-habit-actions"><button className={entry?.status === 'minimum' ? 'selected-min' : ''} onClick={() => onSetEntry(habit.id, entry?.status === 'minimum' && entry.amount === undefined ? null : { status: 'minimum' })}>Min</button><button className={entry?.status === 'ideal' ? 'selected-ideal' : ''} onClick={() => onSetEntry(habit.id, entry?.status === 'ideal' && entry.amount === undefined ? null : { status: 'ideal' })}>İdeal</button></div></div> })}{habits.length === 0 && <p className="empty-state">Etkin alışkanlık yok. Ayarlardan bir alışkanlığı etkinleştir.</p>}</div></article>
}
function HabitCard({ habit, entry, streak, onSetEntry }: { habit: Habit; entry?: HabitEntry; streak: number; onSetEntry: (id: string, entry: HabitEntry | null) => Promise<boolean> }) {
  const [amountDraft, setAmountDraft] = useState(entry?.amount !== undefined ? String(entry.amount) : '')
  const [amountError, setAmountError] = useState('')
  useEffect(() => { setAmountDraft(entry?.amount !== undefined ? String(entry.amount) : ''); setAmountError('') }, [habit.id, entry?.amount])
  const minimumTarget = parseHabitTarget(habit.minimum)
  const idealTarget = parseHabitTarget(habit.ideal)
  const comparableUnits = !minimumTarget.unit || !idealTarget.unit || minimumTarget.unit === idealTarget.unit
  const unit = minimumTarget.label || idealTarget.label
  const handleAmountSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(amountDraft)
    if (!amountDraft.trim() || !Number.isFinite(amount) || amount < 0) { setAmountError('Sıfır veya daha büyük geçerli bir miktar gir.'); return }
    let status: HabitStatus = 'partial'
    if (comparableUnits && idealTarget.value > 0 && amount >= idealTarget.value) status = 'ideal'
    else if (minimumTarget.value > 0 && amount >= minimumTarget.value) status = 'minimum'
    else if (minimumTarget.value === 0 && amount > 0) status = 'minimum'
    const saved = await onSetEntry(habit.id, { status, amount })
    setAmountError(saved ? '' : saveFailure)
  }
  const handleManualStatus = (status: HabitStatus) => {
    if (entry?.status === status && entry.amount === undefined) { onSetEntry(habit.id, null); return }
    onSetEntry(habit.id, { status, amount: status === 'ideal' && !comparableUnits ? undefined : entry?.amount })
    setAmountError('')
  }
  const status = entry?.status
  return <article data-record={habit.id} className={`habit-card ${status ? 'habit-done' : ''} ${status === 'ideal' ? 'habit-ideal' : ''}`}>
    <div className="habit-top"><span className="habit-icon"><AreaIcon area={habit.area} /></span><HabitRing completed={status === 'ideal' || status === 'minimum'} value={status === 'ideal' ? 1 : status === 'minimum' ? 0.6 : 0} /><span className={`status-badge ${status ?? ''}`}>{status === 'ideal' ? 'İdeal' : status === 'minimum' ? 'Minimum' : status === 'partial' ? 'Kısmi' : 'Bekliyor'}{entry?.amount !== undefined ? ` · ${entry.amount} ${unit}` : ''}</span></div>
    <h3>{habit.name}</h3><p>{habit.area}</p>
    <div className="habit-goals"><span><small>Minimum</small>{habit.minimum}</span><span><small>İdeal</small>{habit.ideal}</span></div>
    <form className="habit-amount-form" onSubmit={handleAmountSubmit}>
      <NumberInput unit={unit || 'adet'} min="0" step="1" value={amountDraft} onChange={(e) => { setAmountDraft(e.target.value); setAmountError('') }} placeholder="Miktar" aria-label={`${habit.name} miktarı`} />
      <button type="submit">Kaydet</button>
    </form>
    {!comparableUnits && <p className="habit-unit-note">Minimum ve ideal farklı birimde; miktar minimumu hesaplar, ideal için hızlı düğmeyi kullan.</p>}
    {amountError && <p className="form-error" role="alert">{amountError}</p>}
    <div className="habit-actions"><button onClick={() => handleManualStatus('minimum')} className={status === 'minimum' ? 'selected-min' : ''}>Min. yapıldı</button><button onClick={() => handleManualStatus('ideal')} className={status === 'ideal' ? 'selected-ideal' : ''}>İdeal tamamlandı</button></div>
    <div className="streak"><Icon name="flame" /><strong>{streak} gün</strong><em>aktif seri</em></div>
  </article>
}
function HabitForm({ draft, onChange, onClose, onSubmit }: { draft: { name: string; icon: string; area: Area; minimum: string; ideal: string }; onChange: (draft: { name: string; icon: string; area: Area; minimum: string; ideal: string }) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) { return <AccessibleModal label="Alışkanlık ekle" className="modal-shell" onClose={onClose}><form className="habit-form card" onSubmit={onSubmit}><div className="card-heading"><div><p className="eyebrow">YENİ RİTİM</p><h2>Alışkanlık ekle</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Kapat">×</button></div><label>İsim<input autoFocus value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Örn. Akşam yürüyüşü" /></label><div className="form-grid"><label>Emoji<input value={draft.icon} onChange={(event) => onChange({ ...draft, icon: event.target.value })} placeholder="✨" /></label><label>Alan<select value={draft.area} onChange={(event) => onChange({ ...draft, area: event.target.value as Area })}>{areas.map((area) => <option key={area}>{area}</option>)}</select></label></div><div className="form-grid"><label>Minimum<input value={draft.minimum} onChange={(event) => onChange({ ...draft, minimum: event.target.value })} placeholder="Örn. 5 dakika" /></label><label>İdeal<input value={draft.ideal} onChange={(event) => onChange({ ...draft, ideal: event.target.value })} placeholder="Örn. 30 dakika" /></label></div><p className="subtle">Minimumu yapmak zinciri korur; ideale ulaşmak günü daha güçlü kapatır.</p><button className="timer-button" type="submit">Alışkanlığı ekle</button></form></AccessibleModal> }
function csvCell(value: string | number) {
  const raw = String(value)
  const protectedValue = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${protectedValue.replace(/"/g, '""')}"`
}
function csvRow(values: Array<string | number>) { return `${values.map(csvCell).join(',')}\n` }
function SettingsModal({ state, today, storageMode, cloud, hasActiveFocus, onClose, onImport, onRestoreRollback }: { state: AppState; today: string; storageMode: StorageMode; cloud: CloudSyncController; hasActiveFocus: boolean; onClose: () => void; onImport: (state: AppState) => Promise<StateChangeResult>; onRestoreRollback: () => Promise<StateChangeResult> }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasActiveFocusRef = useRef(hasActiveFocus)
  hasActiveFocusRef.current = hasActiveFocus
  const [geminiKey, setGeminiKey] = useState('')
  const [legacyGeminiKey, setLegacyGeminiKey] = useState(() => localStorage.getItem('momentum-gemini-key') ?? '')
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null)
  const [geminiBusy, setGeminiBusy] = useState(false)
  const [geminiStatus, setGeminiStatus] = useState('')
  const [importCandidate, setImportCandidate] = useState<(BackupCandidate & { fileName: string }) | null>(null)
  const [importStatus, setImportStatus] = useState('')
  const [hasRollback, setHasRollback] = useState(() => Boolean(localStorage.getItem(importRollbackStorageKey)))
  const [automaticBackups, setAutomaticBackups] = useState<AutomaticBackup[]>([])
  const [backupStoreStatus, setBackupStoreStatus] = useState('Otomatik yedekler okunuyor…')
  const refreshAutomaticBackups = () => listAutomaticBackups().then((snapshots) => { setAutomaticBackups(snapshots); setBackupStoreStatus(snapshots.length ? `Son ${snapshots.length} doğrulanabilir sürüm yerel kurtarma deposunda.` : 'Henüz otomatik yedek oluşmadı.') }).catch(() => setBackupStoreStatus('Otomatik yedek deposu bu tarayıcıda kullanılamıyor.'))
  useEffect(() => { void refreshAutomaticBackups() }, [])
  useEffect(() => {
    if (cloudConfigured) { setGeminiConfigured(true); setGeminiStatus('Gemini anahtarı güvenli sunucu ortamında yönetiliyor.'); return }
    let active = true
    fetch('/api/settings/gemini-key').then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
      if (active) setGeminiConfigured(Boolean(data.configured))
    }).catch(() => { if (active) { setGeminiConfigured(false); setGeminiStatus('Yerel güvenli depoya ulaşılamadı. Momentum’u yeniden başlat.') } })
    return () => { active = false }
  }, [])
  const saveKey = async (keyToSave: string) => {
    const key = keyToSave.trim()
    if (!key) { setGeminiStatus('Bir Gemini API anahtarı gir.'); return }
    setGeminiBusy(true); setGeminiStatus('Anahtar Gemini ile doğrulanıyor…')
    try {
      const response = await fetch('/api/settings/gemini-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
      localStorage.removeItem('momentum-gemini-key')
      setLegacyGeminiKey(''); setGeminiKey(''); setGeminiConfigured(true); setGeminiStatus('Bağlantı doğrulandı; anahtar Windows güvenli deposuna kaydedildi.')
    } catch (error) { setGeminiStatus(error instanceof Error ? error.message : String(error)) }
    finally { setGeminiBusy(false) }
  }
  const removeKey = async () => {
    if (!window.confirm('Gemini API anahtarı güvenli depodan kaldırılsın mı?')) return
    setGeminiBusy(true); setGeminiStatus('')
    try {
      const response = await fetch('/api/settings/gemini-key', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
      localStorage.removeItem('momentum-gemini-key')
      setLegacyGeminiKey(''); setGeminiConfigured(false); setGeminiStatus('Gemini API anahtarı kaldırıldı.')
    } catch (error) { setGeminiStatus(error instanceof Error ? error.message : String(error)) }
    finally { setGeminiBusy(false) }
  }
  const handleExportJSON = () => {
    if (hasActiveFocusRef.current) { setImportStatus('Yedek almadan önce açık odak oturumunu bitir.'); return }
    const blob = new Blob([JSON.stringify(backupEnvelope(state), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `momentum-backup-v${backupVersion}-${dateKey()}.json`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
  const handleShareJSON = async () => {
    if (hasActiveFocusRef.current) { setImportStatus('Yedek paylaşmadan önce açık odak oturumunu bitir.'); return }
    const file = new File([JSON.stringify(backupEnvelope(state), null, 2)], `momentum-backup-v${backupVersion}-${dateKey()}.json`, { type: 'application/json' })
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      setImportStatus('Bu tarayıcı dosya paylaşımını desteklemiyor. JSON yedeğini indirip diğer cihazına gönderebilirsin.')
      return
    }
    try {
      await navigator.share({ title: 'Momentum veri yedeği', text: 'Momentum verilerimi başka cihazıma taşı', files: [file] })
      setImportStatus('Yedek güvenli paylaşım ekranına gönderildi.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setImportStatus('Yedek paylaşılamadı. JSON indirme seçeneğini kullanabilirsin.')
    }
  }
  const handleExportCSV = () => {
    if (hasActiveFocusRef.current) { setImportStatus('Dışa aktarmadan önce açık odak oturumunu bitir.'); return }
    let csv = `\uFEFF${csvRow(['Date', 'Type', 'Name', 'Area/Source', 'Value', 'Unit'])}`
    state.sessions.forEach((session) => { csv += csvRow([session.date, 'Focus', session.title, session.area, Math.round(session.seconds / 60), 'minutes']) })
    Object.entries(state.habitLog).forEach(([date, log]) => Object.entries(log).forEach(([id, entry]) => { const habit = state.habits.find((item) => item.id === id); if (habit) csv += csvRow([date, 'Habit', habit.name, habit.area, entry.amount ?? 1, entry.status]) }))
    state.screenTimeEntries.forEach((entry) => { csv += csvRow([entry.date, 'ScreenTime', entry.app, `${entry.kind}/${entry.source}`, entry.minutes, 'minutes']) })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `momentum-export-${dateKey()}.csv`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportCandidate(null); setImportStatus('')
    try {
      if (hasActiveFocusRef.current) throw new Error('İçe aktarmadan önce açık odak oturumunu bitir.')
      if (file.size > 5 * 1024 * 1024) throw new Error('Yedek dosyası en fazla 5 MB olabilir.')
      const contents = await file.text()
      if (hasActiveFocusRef.current) throw new Error('Dosya okunurken bir odak oturumu başladı. Oturumu bitirip yedeği yeniden seç.')
      const candidate = validateBackup(JSON.parse(contents))
      setImportCandidate({ ...candidate, fileName: file.name })
    } catch (error) { setImportStatus(error instanceof Error ? `Yedek doğrulanamadı: ${error.message}` : 'Yedek doğrulanamadı.') }
  }
  const confirmImport = async () => {
    if (!importCandidate) return
    if (hasActiveFocusRef.current) { setImportStatus('İçe aktarmadan önce açık odak oturumunu bitir.'); return }
    if (!window.confirm('Doğrulanmış yedek mevcut verilerin yerini alacak. Önceki veriler otomatik geri alma yedeğinde saklanacak. Devam edilsin mi?')) return
    const result = await onImport(importCandidate.state)
    if (!result.ok) { setImportStatus(result.error ?? 'İçe aktarma tamamlanamadı.'); return }
    setImportCandidate(null); setHasRollback(true); setImportStatus('Yedek başarıyla içe aktarıldı. Önceki verileri aşağıdaki düğmeyle geri alabilirsin.')
  }
  const restoreRollback = async () => {
    if (hasActiveFocusRef.current) { setImportStatus('Geri almadan önce açık odak oturumunu bitir.'); return }
    if (!window.confirm('İçe aktarmadan önceki veriler geri yüklensin mi? İçe aktarılan veriler değiştirilecek.')) return
    const result = await onRestoreRollback()
    if (!result.ok) { setImportStatus(result.error ?? 'Geri alma tamamlanamadı.'); return }
    setHasRollback(false); setImportCandidate(null); setImportStatus('İçe aktarma geri alındı; önceki verilerin yeniden yüklendi.')
  }
  const restoreAutomaticBackup = async (snapshot: AutomaticBackup) => {
    if (hasActiveFocusRef.current) { setImportStatus('Kurtarmadan önce açık odak oturumunu bitir.'); return }
    try {
      const candidate = validateBackup(JSON.parse(snapshot.payload))
      if (!window.confirm(`${new Date(snapshot.createdAt).toLocaleString('tr-TR')} tarihli otomatik yedek geri yüklensin mi? Mevcut durum geri alma yedeğinde korunacak.`)) return
      const result = await onImport(candidate.state)
      if (!result.ok) { setImportStatus(result.error ?? 'Otomatik yedek geri yüklenemedi.'); return }
      setHasRollback(true); setImportStatus('Otomatik yedek doğrulandı ve başarıyla geri yüklendi.'); void refreshAutomaticBackups()
    } catch (error) { setImportStatus(error instanceof Error ? `Otomatik yedek doğrulanamadı: ${error.message}` : 'Otomatik yedek doğrulanamadı.') }
  }
  const downloadCorruptState = () => {
    const raw = localStorage.getItem(corruptStateStorageKey)
    if (!raw) { setImportStatus('Korunmuş bozuk ham kayıt bulunamadı.'); return }
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `momentum-corrupt-recovery-${dateKey()}.json`; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
  return <AccessibleModal label="Veri yönetimi" className="habit-form card settings-modal" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">AYARLAR</p><h2>Veri Yönetimi</h2></div><button className="modal-close" aria-label="Kapat" onClick={onClose}>×</button></div>
    <div className="settings-stack">
      <section className={`database-storage-state ${storageMode === 'indexeddb' ? 'ready' : 'fallback'}`}><span aria-hidden="true">{storageMode === 'indexeddb' ? '◆' : '!'}</span><div><p className="eyebrow">ANA VERİ DEPOSU</p><strong>{storageMode === 'indexeddb' ? 'IndexedDB hazır' : 'Geçici depolama etkin'}</strong><small>{storageMode === 'indexeddb' ? 'Odak, alışkanlık, ekran süresi ve rapor kayıtları işlem güvenli ana depoda saklanıyor.' : 'IndexedDB kullanılamadığı için kayıtlar tarayıcı deposunda tutuluyor. Tarayıcıyı yeniden başlatınca tekrar denenecek.'}</small></div></section>
      <Suspense fallback={<section className="cloud-account cloud-disabled" aria-busy="true"><p>Hesap bağlantısı hazırlanıyor…</p></section>}><CloudAccountPanel cloud={cloud} /></Suspense>
      <hr style={{ borderColor: '#ffffff12', margin: '0', borderStyle: 'solid', borderWidth: '1px 0 0 0' }} />
      {cloudConfigured ? <section className="gemini-settings"><div className="gemini-settings-heading"><label>🤖 GEMINI BAĞLANTISI</label><span className="configured">Sunucu</span></div><p className="gemini-status">{geminiStatus}</p><p className="gemini-help">Ekran görüntüsü analizi yalnızca giriş yapmış kullanıcıların çağırabildiği Edge Function üzerinden yapılır. API anahtarı tarayıcıya gönderilmez.</p></section> : <section className="gemini-settings"><div className="gemini-settings-heading"><label htmlFor="gemini-api-key">🤖 GEMINI BAĞLANTISI</label><span className={geminiConfigured ? 'configured' : ''}>{geminiConfigured === null ? 'Kontrol ediliyor' : geminiConfigured ? 'Bağlı' : 'Bağlı değil'}</span></div><div className="gemini-key-row"><input id="gemini-api-key" type="password" autoComplete="new-password" spellCheck={false} value={geminiKey} onChange={(event) => { setGeminiKey(event.target.value); setGeminiStatus('') }} placeholder="Gemini API anahtarını gir" /><button type="button" disabled={geminiBusy || !geminiKey.trim()} onClick={() => saveKey(geminiKey)}>{geminiBusy ? 'Kontrol…' : 'Doğrula ve kaydet'}</button></div>{legacyGeminiKey && !geminiConfigured && <button type="button" className="legacy-key-button" disabled={geminiBusy} onClick={() => saveKey(legacyGeminiKey)}>Eski tarayıcı anahtarını güvenli depoya taşı</button>}{geminiConfigured && <button type="button" className="remove-key-button" disabled={geminiBusy} onClick={removeKey}>Kayıtlı anahtarı kaldır</button>}{geminiStatus && <p className="gemini-status" role="status">{geminiStatus}</p>}<p className="gemini-help">Anahtar tarayıcıda tutulmaz; Windows kullanıcı hesabına bağlı olarak şifrelenir. Ekran görüntüleri yerel Momentum sunucusu üzerinden Gemini’ye gönderilir.</p></section>}
      <hr style={{ borderColor: '#ffffff12', margin: '0', borderStyle: 'solid', borderWidth: '1px 0 0 0' }} />
      <HistoricalImportPanel state={state} maximumDate={today} disabled={hasActiveFocus} onApply={async (nextState) => { const result = await onImport(nextState); if (result.ok) setHasRollback(true); return result }} />
      <hr style={{ borderColor: '#ffffff12', margin: '0', borderStyle: 'solid', borderWidth: '1px 0 0 0' }} />
      <section className="backup-settings">
        <div><p className="eyebrow">YEDEKLEME</p><h3>Verilerini taşı ve geri yükle</h3><p className="gemini-help">JSON yedeği sürümlüdür ve tüm uygulama verilerini içerir. CSV yalnız okunabilir tablo dışa aktarımıdır.</p></div>
        {hasActiveFocus && <p className="backup-warning" role="status">Açık odak oturumunu bitirdiğinde yedekleme ve geri yükleme açılacak.</p>}
        <div className="backup-export-grid"><button className="timer-button" disabled={hasActiveFocus} onClick={handleExportJSON}>JSON Yedeği İndir</button><button className="timer-button secondary" disabled={hasActiveFocus} onClick={handleExportCSV}>CSV Dışa Aktar</button><button className="timer-button secondary share-backup" disabled={hasActiveFocus} onClick={handleShareJSON}>Başka Cihaza Paylaş</button></div>
        <input type="file" accept="application/json,.json" ref={fileInputRef} className="visually-hidden-file" tabIndex={-1} aria-hidden="true" onChange={handleImport} />
        <button className="timer-button import-button" disabled={hasActiveFocus} onClick={() => fileInputRef.current?.click()}>JSON Yedeğini Seç ve Doğrula</button>
        {importCandidate && <div className="import-preview" aria-live="polite"><div className="import-preview-heading"><div><strong>{importCandidate.fileName}</strong><span>{importCandidate.formatLabel} · şema doğrulandı</span></div><span className="import-valid">Geçerli</span></div><div className="import-summary"><span><strong>{importCandidate.summary.habits}</strong> alışkanlık</span><span><strong>{importCandidate.summary.sessions}</strong> odak kaydı</span><span><strong>{importCandidate.summary.habitEntries}</strong> alışkanlık işlemi</span><span><strong>{importCandidate.summary.plans}</strong> öncelik</span><span><strong>{importCandidate.summary.reflections}</strong> değerlendirme</span><span><strong>{importCandidate.summary.goals}</strong> hedef</span><span><strong>{importCandidate.summary.screenTimeEntries}</strong> ekran süresi kaydı</span></div>{importCandidate.warnings.map((warning) => <p className="backup-warning" key={warning}>{warning}</p>)}<p className="import-overwrite-note">İçe aktarma mevcut verilerin yerini alır. Önceki durum otomatik olarak geri alma yedeğine yazılır.</p><div className="import-actions"><button type="button" onClick={confirmImport}>İçe aktar ve değiştir</button><button type="button" onClick={() => { setImportCandidate(null); setImportStatus('') }}>Vazgeç</button></div></div>}
        {importStatus && <p className="import-status" role="status">{importStatus}</p>}
        {hasRollback && <button className="rollback-button" type="button" disabled={hasActiveFocus} onClick={restoreRollback}>↶ Son içe aktarmayı geri al</button>}
      </section>
      <hr style={{ borderColor: '#ffffff12', margin: '0', borderStyle: 'solid', borderWidth: '1px 0 0 0' }} />
      <section className="backup-settings automatic-backups"><div><p className="eyebrow">OTOMATİK KURTARMA</p><h3>Son güvenli sürümler</h3><p className="gemini-help">Değişikliklerden sonra son yedi sürüm ayrı bir tarayıcı deposunda tutulur. Her sürüm geri yüklenmeden önce şema doğrulamasından geçer.</p></div><p className="backup-store-status" role="status">{backupStoreStatus}</p>{automaticBackups.length > 0 && <div className="automatic-backup-list">{automaticBackups.map((snapshot, index) => <div key={snapshot.id}><span><strong>{index === 0 ? 'En yeni' : `${index + 1}. sürüm`}</strong>{new Date(snapshot.createdAt).toLocaleString('tr-TR')}</span><button type="button" disabled={hasActiveFocus} onClick={() => restoreAutomaticBackup(snapshot)}>Geri yükle</button></div>)}</div>}{localStorage.getItem(corruptStateStorageKey) && <button className="raw-recovery-button" type="button" onClick={downloadCorruptState}>Bozuk ham kaydı incelemek için indir</button>}</section>
    </div>
  </AccessibleModal>
}
export default App
