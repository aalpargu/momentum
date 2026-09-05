import { NumberInput } from './NumberInput'
import { type FormEvent, useState, useEffect } from 'react'
import { ProductivityInsights } from './ProductivityInsights'
import type { AppState, Area, FocusCategory, FocusSession, Goal, GoalUnit } from '../lib/domain'
import { AccessibleModal } from './AccessibleModal'

const areas: Area[] = ['Eğitim', 'Kariyer', 'İngilizce', 'Sağlık', 'Bilgi']

function previousDate(key: string) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() - 1)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function calendarDayDifference(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000)
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return hours > 0 ? `${hours}s ${String(minutes).padStart(2, '0')}d` : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function longestStreak(activeDates: Set<string>, throughDate: string) {
  const ordered = [...activeDates].filter((date) => date <= throughDate).sort()
  let best = 0
  let current = 0
  let previous = ''
  ordered.forEach((date) => {
    current = previous && previousDate(date) === previous ? current + 1 : 1
    best = Math.max(best, current)
    previous = date
  })
  return best
}

export function ProgressView({ savedSessions, state, activeDates, today, focusCategories, onSaveGoal, onDeleteGoal, openGoalForm, onDayClick, onSaveFocus }: { savedSessions: FocusSession[]; state: AppState; activeDates: Set<string>; today: string; focusCategories: FocusCategory[]; onSaveGoal: (goal: Goal) => Promise<boolean>; onDeleteGoal: (id: string) => void; openGoalForm: () => void; onDayClick: (date: string) => void; onSaveFocus: (focus: string) => Promise<boolean> }) {
  const [visibleMonth, setVisibleMonth] = useState(today.slice(0, 7))
  const year = Number(visibleMonth.slice(0, 4))
  const month = Number(visibleMonth.slice(5, 7)) - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const padding = (new Date(year, month, 1).getDay() + 6) % 7
  const monthLabel = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const moveMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1)
    setVisibleMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => {
    const key = `${visibleMonth}-${String(index + 1).padStart(2, '0')}`
    return { key, seconds: state.sessions.filter((session) => session.date === key).reduce((sum, session) => sum + session.seconds, 0) }
  })
  const recentDates = Array.from({ length: 30 }, (_, index) => { let key = today; for (let step = 0; step < index; step += 1) key = previousDate(key); return key })
  const consistentDays = recentDates.filter((date) => activeDates.has(date)).length
  const monthSeconds = monthDays.reduce((sum, day) => sum + day.seconds, 0)

  return <section className="progress-page">
    <div className="section-heading"><div><p className="eyebrow">LIFE PROGRESS</p><h1>Uzun vadeli ilerlemen</h1><p className="hero-copy">Bunlar sadece sayılar değil; gelecekteki kendine bıraktığın kanıtlar.</p></div><button className="quiet-button" onClick={openGoalForm}>+ Yeni hedef</button></div>
    <ProductivityInsights sessions={savedSessions} screenEntries={state.screenTimeEntries} today={today} activeDates={activeDates} weeklyFocus={state.weeklyFocus} onSaveFocus={onSaveFocus} onDayClick={onDayClick} />
    <section className="goals-list" style={{ marginTop: '28px' }}>{state.goals.length === 0 && <article className="card empty-goals"><h2>İlk hedefini belirle</h2><p className="subtle">Örn. 6 ayda 200 saat Coding veya 1.000 İngilizce kelime.</p><button className="timer-button" onClick={openGoalForm}>Hedef ekle</button></article>}{state.goals.map((goal) => <GoalCard key={goal.id} goal={goal} sessions={state.sessions} today={today} focusCategories={focusCategories} onSave={onSaveGoal} onDelete={onDeleteGoal} />)}</section>
    <div className="grid analytics-grid"><article className="card"><p className="eyebrow">TUTARLILIK</p><h2>%{Math.round(consistentDays / 30 * 100)}</h2><p className="subtle">Son 30 günde {consistentDays} aktif gün: minimum alışkanlık veya odak kaydı.</p><div className="mini-stat"><span>En uzun aktif seri</span><strong>{longestStreak(activeDates, today)} gün</strong></div></article><article className="card"><p className="eyebrow">{monthLabel.toLocaleUpperCase('tr-TR')}</p><h2>{formatDuration(monthSeconds)}</h2><p className="subtle">Bu ay kaydettiğin odaklı çalışma.</p><div className="mini-stat"><span>Aktif gün</span><strong>{monthDays.filter((day) => day.seconds > 0 || activeDates.has(day.key)).length}/{daysInMonth}</strong></div></article></div>
    <article className="card heatmap-card"><div className="card-heading"><div><p className="eyebrow">RİTİMİN</p><h2>{monthLabel} yatırım haritası</h2></div><div className="calendar-month-nav"><button type="button" aria-label="Önceki ay" onClick={() => moveMonth(-1)}>‹</button><span>{monthLabel}</span><button type="button" aria-label="Sonraki ay" disabled={visibleMonth >= today.slice(0, 7)} onClick={() => moveMonth(1)}>›</button></div></div><div className="heatmap calendar-grid">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day) => <div key={day} className="cal-head">{day}</div>)}{Array.from({ length: padding }).map((_, index) => <span key={`pad-${index}`} className="cal-pad" />)}{monthDays.map((day, index) => { const hours = day.seconds / 3600; const level = hours === 0 ? 0 : hours < 1 ? 1 : hours < 3 ? 2 : 3; const isActive = day.seconds > 0 || activeDates.has(day.key); const isFuture = day.key > today; return <button key={day.key} disabled={isFuture} className={`heat-${level} ${isActive ? 'heat-active' : ''}`} onClick={() => { if (!isFuture) onDayClick(day.key) }} title={isFuture ? 'Gelecek günlere kayıt eklenemez' : `${index + 1}. gün detayları`}>{index + 1}</button> })}</div><p className="subtle">Bir güne tıklayarak o günün detaylarını görebilir ve eksik kayıtlarını düzenleyebilirsin.</p></article>
  </section>
}

function GoalCard({ goal, sessions, today, focusCategories, onSave, onDelete }: { goal: Goal; sessions: FocusSession[]; today: string; focusCategories: FocusCategory[]; onSave: (goal: Goal) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [manual, setManual] = useState(String(goal.manualProgress))
  useEffect(() => setManual(String(goal.manualProgress)), [goal.manualProgress])
  const automatic = goal.unit === 'saat' && goal.activity !== 'manual' ? sessions.filter((session) => goal.activity === 'all' || session.title === goal.activity).reduce((sum, session) => sum + session.seconds / 3600, 0) : 0
  const value = automatic + goal.manualProgress
  const percent = goal.target > 0 ? Math.max(0, Math.round(value / goal.target * 100)) : 0
  const deadline = goal.deadline ? calendarDayDifference(today, goal.deadline) : null
  const updateManual = () => { const next = Number(manual); if (Number.isFinite(next) && next >= 0) onSave({ ...goal, manualProgress: next }) }
  return <article data-record={goal.id} className={`card goal-card ${percent >= 100 ? 'goal-complete' : ''}`}><div><p className="eyebrow">{goal.area.toUpperCase()} · {goal.unit}</p><h2>{goal.title}</h2><p className="subtle">{goal.deadline ? deadline! < 0 ? `${Math.abs(deadline!)} gün gecikti` : deadline === 0 ? 'Bugün son gün' : `${deadline} gün kaldı` : 'Bitiş tarihi yok'}</p></div><div className="goal-progress"><strong>{value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span>/ {goal.target.toLocaleString('tr-TR')} {goal.unit}</span></strong><div className="progress-track"><span style={{ width: `${Math.min(100, percent)}%` }} /></div><p>{percent >= 100 ? 'Tamamlandı ✓' : `%${percent} tamamlandı`}{goal.activity !== 'manual' && ` · ${goal.activity === 'all' ? 'Tüm focus kayıtları' : goal.activity} otomatik bağlı`}</p></div><div className="goal-actions">{goal.activity === 'manual' && <div className="manual-goal"><NumberInput aria-label={`${goal.title} mevcut değer`} unit={goal.unit} min="0" step="0.1" value={manual} onChange={(event) => setManual(event.target.value)} /><button onClick={updateManual}>Güncelle</button></div>}<button onClick={() => setEditing(!editing)}>Düzenle</button><button className="delete-action" onClick={() => onDelete(goal.id)}>Sil</button></div>{editing && <GoalFields initial={goal} focusCategories={focusCategories} submitLabel="Değişiklikleri kaydet" onSave={async (updated) => { const ok = await onSave(updated); if (ok) setEditing(false); return ok }} />}</article>
}

export function GoalForm({ focusCategories, onClose, onSave }: { focusCategories: FocusCategory[]; onClose: () => void; onSave: (goal: Goal) => Promise<boolean> }) {
  return <AccessibleModal label="Yeni hedef oluştur" className="habit-form card" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">UZUN VADELİ HEDEF</p><h2>Yeni hedef oluştur</h2></div><button className="modal-close" aria-label="Kapat" onClick={onClose}>×</button></div><GoalFields focusCategories={focusCategories} submitLabel="Hedefi oluştur" onSave={onSave} /></AccessibleModal>
}

function GoalFields({ initial, focusCategories, submitLabel, onSave }: { initial?: Goal; focusCategories: FocusCategory[]; submitLabel: string; onSave: (goal: Goal) => Promise<boolean> }) {
  const [draft, setDraft] = useState<Goal>(initial ?? { id: crypto.randomUUID(), title: '', area: 'Kariyer', unit: 'saat', target: 0, deadline: '', activity: 'manual', manualProgress: 0 })
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!draft.title.trim() || !Number.isFinite(draft.target) || draft.target <= 0) { setError('Başlık ve pozitif hedef değer zorunlu.'); return }; if (!await onSave({ ...draft, title: draft.title.trim(), deadline: draft.deadline || undefined })) setError('Kaydedilemedi. Girdiğin değerler korunuyor.') }
  return <form className="goal-form" onSubmit={submit}><label>Hedef adı<input maxLength={150} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Örn. 200 saat Coding" /></label><div className="form-grid"><label>Hayat alanı<select value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value as Area })}>{areas.map((area) => <option key={area}>{area}</option>)}</select></label><label>Birim<select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value as GoalUnit, activity: event.target.value === 'saat' ? draft.activity : 'manual' })}>{(['saat', 'kelime', 'sayfa', 'adet'] as GoalUnit[]).map((unit) => <option key={unit}>{unit}</option>)}</select></label></div><div className="form-grid"><label>Hedef değer<NumberInput unit={draft.unit} min="0.1" step="0.1" value={draft.target || ''} onChange={(event) => setDraft({ ...draft, target: Number(event.target.value) })} /></label><label>Bitiş tarihi (isteğe bağlı)<input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label></div>{draft.unit === 'saat' && <label>Focus bağlantısı<select value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })}><option value="manual">Manuel ilerleme</option><option value="all">Tüm focus oturumları</option>{focusCategories.filter((option) => !option.archived || option.title === draft.activity).map((option) => <option key={option.id} value={option.title}>{option.title}</option>)}</select></label>}<label>Başlangıç / manuel değer<NumberInput unit={draft.unit} min="0" step="0.1" value={draft.manualProgress || ''} onChange={(event) => setDraft({ ...draft, manualProgress: Number(event.target.value) })} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="timer-button" type="submit">{submitLabel}</button></form>
}
