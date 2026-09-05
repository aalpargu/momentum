import { NumberInput } from './NumberInput'
import { type FormEvent, useEffect, useState } from 'react'
import type { AppState, Area, DailyReflection, FocusCategory, FocusSession, Habit, HabitEntry, HabitStatus, ScreenTimeEntry } from '../lib/domain'
import { AccessibleModal } from './AccessibleModal'
import { ScreenTimeEntryEditor } from './ScreenTimePanel'

const fallbackCategory: FocusCategory = { id: 'university', title: 'Üniversite', area: 'Eğitim', icon: '🎓' }

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return hours > 0 ? `${hours}s ${String(minutes).padStart(2, '0')}d` : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function DayDetailModal({ date, state, focusCategories, onClose, onAddSession, onUpdateSession, onDeleteSession, onSetHabitEntry, onSaveReflection, onUpdateScreenTime, onDeleteScreenTime }: { date: string; state: AppState; focusCategories: FocusCategory[]; onClose: () => void; onAddSession: (date: string, title: string, area: Area, minutes: number) => Promise<string | null>; onUpdateSession: (id: string, update: Pick<FocusSession, 'title' | 'area' | 'seconds'>) => Promise<string | null>; onDeleteSession: (id: string) => void; onSetHabitEntry: (date: string, id: string, entry: HabitEntry | null) => Promise<boolean>; onSaveReflection: (date: string, reflection: DailyReflection) => Promise<boolean>; onUpdateScreenTime: (id: string, update: Pick<ScreenTimeEntry, 'app' | 'minutes' | 'kind'>) => Promise<string | null>; onDeleteScreenTime: (id: string) => void }) {
  const sessions = state.sessions.filter((session) => session.date === date)
  const screenEntries = state.screenTimeEntries.filter((entry) => entry.date === date)
  const activeCategories = focusCategories.filter((category) => !category.archived)
  const firstCategory = activeCategories[0] ?? fallbackCategory
  const [draftTitle, setDraftTitle] = useState(firstCategory.title)
  const [draftArea, setDraftArea] = useState<Area>(firstCategory.area)
  const [draftMinutes, setDraftMinutes] = useState('')
  const [sessionError, setSessionError] = useState('')
  const handleAdd = async (event: FormEvent) => { event.preventDefault(); const error = await onAddSession(date, draftTitle, draftArea, Number(draftMinutes)); if (error) { setSessionError(error); return }; setDraftMinutes(''); setSessionError('') }
  const handleTitleChange = (value: string) => { setDraftTitle(value); const category = focusCategories.find((item) => item.title === value); if (category) setDraftArea(category.area) }
  return <AccessibleModal label="Gün detayı" className="habit-form card day-detail-modal" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">{new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h2>Gün Detayı</h2></div><button className="modal-close" onClick={onClose} aria-label="Kapat">×</button></div><div className="day-modal-content">
    <section><h3>Odak Oturumları</h3><div className="history-list">{sessions.map((session) => <SessionHistoryEditor key={session.id} session={session} categories={focusCategories} onSave={(update) => onUpdateSession(session.id, update)} onDelete={() => onDeleteSession(session.id)} />)}{sessions.length === 0 && <p className="subtle">Bu tarihte oturum yok.</p>}</div><form className="history-add-form" onSubmit={handleAdd}><select aria-label="Yeni oturum kategorisi" value={draftTitle} onChange={(event) => handleTitleChange(event.target.value)}>{activeCategories.map((category) => <option key={category.id} value={category.title}>{category.icon} {category.title}</option>)}</select><NumberInput aria-label="Yeni oturum dakika" unit="dk" min="1" max="1440" step="1" placeholder="Süre" value={draftMinutes} onChange={(event) => { setDraftMinutes(event.target.value); setSessionError('') }} /><button type="submit" disabled={!draftMinutes}>Ekle</button></form>{sessionError && <p className="form-error" role="alert">{sessionError}</p>}</section>
    <section><h3>Alışkanlıklar</h3><div className="history-list">{state.habits.map((habit) => <HistoricalHabitEditor key={habit.id} habit={habit} entry={state.habitLog[date]?.[habit.id]} onSave={(entry) => onSetHabitEntry(date, habit.id, entry)} />)}</div></section>
    <section><h3>Gün Sonu Notu</h3><HistoryReflectionEditor initial={state.reflections[date]} onSave={(reflection) => onSaveReflection(date, reflection)} /></section>
    <section><h3>Telefon Ekran Süresi · {formatDuration(screenEntries.reduce((sum, entry) => sum + entry.minutes, 0) * 60)}</h3>{screenEntries.length === 0 ? <p className="subtle">Bu tarihte ekran süresi kaydı yok.</p> : <div className="screen-time-list">{screenEntries.map((entry) => <ScreenTimeEntryEditor key={entry.id} entry={entry} onSave={(update) => onUpdateScreenTime(entry.id, update)} onDelete={() => onDeleteScreenTime(entry.id)} />)}</div>}</section>
  </div></AccessibleModal>
}

function SessionHistoryEditor({ session, categories, onSave, onDelete }: { session: FocusSession; categories: FocusCategory[]; onSave: (update: Pick<FocusSession, 'title' | 'area' | 'seconds'>) => Promise<string | null>; onDelete: () => void }) {
  const [title, setTitle] = useState(session.title); const [area, setArea] = useState(session.area); const [minutes, setMinutes] = useState(String(Math.round(session.seconds / 60))); const [error, setError] = useState('')
  useEffect(() => { setTitle(session.title); setArea(session.area); setMinutes(String(Math.round(session.seconds / 60))) }, [session.title, session.area, session.seconds])
  const options = categories.some((category) => category.title === session.title) ? categories : [{ id: `history-${session.id}`, title: session.title, area: session.area, icon: '⏱️', archived: true }, ...categories]
  const changeTitle = (value: string) => { setTitle(value); const category = options.find((item) => item.title === value); if (category) setArea(category.area); setError('') }
  const save = async () => setError(await onSave({ title, area, seconds: minutes === String(Math.round(session.seconds / 60)) ? session.seconds : Number(minutes) * 60 }) ?? '')
  return <div className="history-editor" data-record={session.id}><select aria-label={`${session.title} kategorisi`} value={title} onChange={(event) => changeTitle(event.target.value)}>{options.map((category) => <option key={category.id} value={category.title}>{category.icon} {category.title}{category.archived ? ' (arşiv)' : ''}</option>)}</select><NumberInput aria-label={`${session.title} dakika`} unit="dk" min="1" max="1440" value={minutes} onChange={(event) => { setMinutes(event.target.value); setError('') }} /><button onClick={save}>Kaydet</button><button className="delete-action" onClick={onDelete}>Sil</button>{error && <p className="form-error">{error}</p>}</div>
}

function HistoricalHabitEditor({ habit, entry, onSave }: { habit: Habit; entry?: HabitEntry; onSave: (entry: HabitEntry | null) => Promise<boolean> }) {
  const [status, setStatus] = useState<HabitStatus>(entry?.status ?? 'minimum'); const [amount, setAmount] = useState(entry?.amount === undefined ? '' : String(entry.amount)); const [saved, setSaved] = useState(false)
  useEffect(() => { setStatus(entry?.status ?? 'minimum'); setAmount(entry?.amount === undefined ? '' : String(entry.amount)); setSaved(false) }, [habit.id, entry?.status, entry?.amount])
  const commit = async () => { const value = amount.trim() ? Number(amount) : undefined; if (value !== undefined && (!Number.isFinite(value) || value < 0)) return; setSaved(await onSave({ status, ...(value === undefined ? {} : { amount: value }) })) }
  return <div className="history-editor habit-history" data-record={habit.id}><span>{habit.icon} {habit.name}{habit.archived ? ' · arşiv' : ''}</span><select aria-label={`${habit.name} durumu`} value={status} onChange={(event) => { setStatus(event.target.value as HabitStatus); setSaved(false) }}><option value="partial">Kısmi</option><option value="minimum">Minimum</option><option value="ideal">İdeal</option></select><NumberInput aria-label={`${habit.name} geçmiş miktarı`}  min="0" placeholder="Miktar" value={amount} onChange={(event) => { setAmount(event.target.value); setSaved(false) }} /><button onClick={commit}>{saved ? 'Kaydedildi' : 'Kaydet'}</button>{entry && <button className="delete-action" onClick={() => onSave(null)}>Temizle</button>}</div>
}

function HistoryReflectionEditor({ initial, onSave }: { initial?: DailyReflection; onSave: (reflection: DailyReflection) => Promise<boolean> }) {
  const [draft, setDraft] = useState(initial ?? { good: '', wasted: '', tomorrow: '' }); const [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(initial ?? { good: '', wasted: '', tomorrow: '' }); setSaved(false) }, [initial?.good, initial?.wasted, initial?.tomorrow])
  return <form className="reflection-form compact-reflection" onSubmit={async (event) => { event.preventDefault(); setSaved(await onSave(draft)) }}><label>Ne iyi gitti?<textarea maxLength={2000} value={draft.good} onChange={(event) => { setDraft({ ...draft, good: event.target.value }); setSaved(false) }} /></label><label>Zaman kaybı?<textarea maxLength={2000} value={draft.wasted} onChange={(event) => { setDraft({ ...draft, wasted: event.target.value }); setSaved(false) }} /></label><label>Yarın?<textarea maxLength={2000} value={draft.tomorrow} onChange={(event) => { setDraft({ ...draft, tomorrow: event.target.value }); setSaved(false) }} /></label><button className="reflection-save" type="submit">{saved ? 'Kaydedildi ✓' : 'Notu kaydet'}</button></form>
}
