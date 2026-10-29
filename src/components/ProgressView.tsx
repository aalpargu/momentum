import { NumberInput } from './NumberInput'
import { type FormEvent, useState, useEffect } from 'react'
import { ProductivityInsights } from './ProductivityInsights'
import type { AppState, Area, FocusCategory, FocusSession, Goal, GoalMilestone, GoalUnit, WeeklyReview } from '../lib/domain'
import { AccessibleModal } from './AccessibleModal'
import { defaultAreas } from '../lib/areas'
import { AreaInput } from './AreaInput'


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



export function ProgressView({ savedSessions, state, today, focusCategories, onSaveGoal, onDeleteGoal, openGoalForm, onDayClick, onSaveFocus, onSaveReview }: { savedSessions: FocusSession[]; state: AppState; today: string; focusCategories: FocusCategory[]; onSaveGoal: (goal: Goal) => Promise<boolean>; onDeleteGoal: (id: string) => void; openGoalForm: () => void; onDayClick: (date: string) => void; onSaveFocus: (focus: string) => Promise<boolean>; onSaveReview: (date: string, review: WeeklyReview) => Promise<boolean> }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  let reviewKey = today
  while (new Date(`${reviewKey}T12:00:00`).getDay() !== 0) reviewKey = previousDate(reviewKey)
  const review = state.weeklyReviews?.[reviewKey]

  return <section className="progress-page">
    <div className="section-heading"><div><p className="eyebrow">LIFE PROGRESS</p><h1>Uzun vadeli ilerlemen</h1><p className="hero-copy">Bunlar sadece sayılar değil; gelecekteki kendine bıraktığın kanıtlar.</p></div><button className="quiet-button" onClick={openGoalForm}>+ Yeni hedef</button></div>
    <nav className="progress-subnav" aria-label="İlerleme bölümleri"><a href="#analysis">Analiz</a><a href="#goals">Hedefler</a><a href="#weekly-review">Değerlendirme</a></nav>
    <div id="analysis" className="progress-anchor"><ProductivityInsights targetMinutes={state.settings.dailyFocusMinutes} sessions={savedSessions} screenEntries={state.screenTimeEntries} today={today} weeklyFocus={state.weeklyFocus} onSaveFocus={onSaveFocus} onDayClick={onDayClick} /></div>
    <section id="goals" className="goals-list progress-anchor" style={{ marginTop: '28px' }}>{state.goals.length === 0 && <article className="card empty-goals"><h2>İlk hedefini belirle</h2><p className="subtle">Örn. 6 ayda 200 saat öğrenme veya 1.000 kelime.</p><button className="timer-button" onClick={openGoalForm}>Hedef ekle</button></article>}{state.goals.map((goal) => <GoalCard key={goal.id} goal={goal} sessions={state.sessions} today={today} focusCategories={focusCategories} onSave={onSaveGoal} onDelete={onDeleteGoal} />)}</section>
    <article id="weekly-review" className="card weekly-review-card progress-anchor"><div><p className="eyebrow">HAFTALIK DEĞERLENDİRME</p><h2>{review ? 'Bu haftanın değerlendirmesi hazır' : 'Haftayı bilinçli kapat'}</h2><p className="subtle">{review ? `Sonraki odak: ${review.nextFocus || 'henüz belirtilmedi'}` : 'Kazanımlarını, sürtünmeleri ve gelecek haftanın tek odağını dört kısa adımda kaydet.'}</p></div><button className="quiet-button" onClick={() => setReviewOpen(true)}>{review ? 'Gözden geçir' : 'Değerlendirmeyi başlat'}</button></article>
    {reviewOpen && <WeeklyReviewWizard initial={review} reviewKey={reviewKey} onClose={() => setReviewOpen(false)} onSave={async (next) => { const ok = await onSaveReview(reviewKey, next); if (ok) setReviewOpen(false); return ok }} />}
  </section>
}

function WeeklyReviewWizard({ initial, reviewKey, onClose, onSave }: { initial?: WeeklyReview; reviewKey: string; onClose: () => void; onSave: (review: WeeklyReview) => Promise<boolean> }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<WeeklyReview>(initial ?? { wins: '', friction: '', lesson: '', nextFocus: '', createdAt: new Date().toISOString() })
  const [error, setError] = useState('')
  const fields: Array<{ key: keyof Pick<WeeklyReview, 'wins' | 'friction' | 'lesson' | 'nextFocus'>; title: string; prompt: string; placeholder: string }> = [
    { key: 'wins', title: 'Kazanımlar', prompt: 'Bu hafta ne iyi gitti?', placeholder: 'Küçük veya büyük, ilerlediğini gösteren kanıtlar…' },
    { key: 'friction', title: 'Sürtünmeler', prompt: 'Seni en çok ne yavaşlattı?', placeholder: 'Enerji, ortam, planlama veya dikkat…' },
    { key: 'lesson', title: 'Ders', prompt: 'Gelecek haftaya hangi dersi taşıyorsun?', placeholder: 'Tekrarlamak veya değiştirmek istediğin şey…' },
    { key: 'nextFocus', title: 'Tek odak', prompt: 'Gelecek haftanın tek ana odağı ne?', placeholder: 'Net ve uygulanabilir bir cümle…' },
  ]
  const field = fields[step]
  const finish = async () => {
    if (!draft.nextFocus.trim()) { setError('Gelecek haftanın tek odağını yaz.'); return }
    if (!await onSave({ ...draft, createdAt: initial?.createdAt ?? new Date().toISOString() })) setError('Değerlendirme kaydedilemedi. Tekrar dene.')
  }
  return <AccessibleModal label="Haftalık değerlendirme" className="card weekly-review-modal" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">{reviewKey} · ADIM {step + 1}/4</p><h2>{field.title}</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Kapat">×</button></div><div className="review-progress" aria-hidden="true">{fields.map((_, index) => <span key={index} className={index <= step ? 'active' : ''} />)}</div><label>{field.prompt}<textarea autoFocus maxLength={field.key === 'nextFocus' ? 500 : 2000} value={draft[field.key]} onChange={(event) => { setDraft({ ...draft, [field.key]: event.target.value }); setError('') }} placeholder={field.placeholder} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="review-actions"><button type="button" className="quiet-button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>Geri</button>{step < fields.length - 1 ? <button type="button" className="timer-button" onClick={() => setStep(value => value + 1)}>Devam</button> : <button type="button" className="timer-button" onClick={() => void finish()}>Haftayı kaydet</button>}</div></AccessibleModal>
}

function GoalCard({ goal, sessions, today, focusCategories, onSave, onDelete }: { goal: Goal; sessions: FocusSession[]; today: string; focusCategories: FocusCategory[]; onSave: (goal: Goal) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [manual, setManual] = useState(String(goal.manualProgress))
  useEffect(() => setManual(String(goal.manualProgress)), [goal.manualProgress])
  const automatic = goal.unit === 'saat' && goal.activity !== 'manual' ? sessions.filter((session) => goal.activity === 'all' || session.title === goal.activity).reduce((sum, session) => sum + session.seconds / 3600, 0) : 0
  const value = automatic + goal.manualProgress
  const percent = goal.target > 0 ? Math.max(0, Math.floor(value / goal.target * 100)) : 0
  const deadline = goal.deadline ? calendarDayDifference(today, goal.deadline) : null
  const updateManual = () => { const next = Number(manual); if (Number.isFinite(next) && next >= 0) onSave({ ...goal, manualProgress: next }) }
  return <article data-record={goal.id} className={`card goal-card ${value >= goal.target ? 'goal-complete' : ''}`}><div><p className="eyebrow">{goal.area.toUpperCase()} · {goal.unit}</p><h2>{goal.title}</h2><p className="subtle">{goal.deadline ? deadline! < 0 ? `${Math.abs(deadline!)} gün gecikti` : deadline === 0 ? 'Bugün son gün' : `${deadline} gün kaldı` : 'Bitiş tarihi yok'}</p></div><div className="goal-progress"><strong>{value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span>/ {goal.target.toLocaleString('tr-TR')} {goal.unit}</span></strong><div className="progress-track"><span style={{ width: `${Math.min(100, percent)}%` }} /></div><p>{value >= goal.target ? 'Tamamlandı ✓' : `%${percent} tamamlandı`}{goal.activity !== 'manual' && ` · ${goal.activity === 'all' ? 'Tüm focus kayıtları' : goal.activity} otomatik bağlı`}</p>{Boolean(goal.milestones?.length) && <div className="goal-milestones">{goal.milestones!.slice().sort((a, b) => a.target - b.target).map((milestone) => <span key={milestone.id} className={value >= milestone.target ? 'complete' : ''}><i>{value >= milestone.target ? '✓' : '○'}</i>{milestone.title}<small>{milestone.target} {goal.unit}</small></span>)}</div>}</div><div className="goal-actions">{goal.activity === 'manual' && <div className="manual-goal"><NumberInput aria-label={`${goal.title} mevcut değer`} unit={goal.unit} min="0" step="0.1" value={manual} onChange={(event) => setManual(event.target.value)} /><button onClick={updateManual}>Güncelle</button></div>}<button onClick={() => setEditing(!editing)}>Düzenle</button><button className="delete-action" onClick={() => onDelete(goal.id)}>Sil</button></div>{editing && <GoalFields initial={goal} focusCategories={focusCategories} submitLabel="Değişiklikleri kaydet" onSave={async (updated) => { const ok = await onSave(updated); if (ok) setEditing(false); return ok }} />}</article>
}

export function GoalForm({ focusCategories, onClose, onSave }: { focusCategories: FocusCategory[]; onClose: () => void; onSave: (goal: Goal) => Promise<boolean> }) {
  return <AccessibleModal label="Yeni hedef oluştur" className="habit-form card" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">UZUN VADELİ HEDEF</p><h2>Yeni hedef oluştur</h2></div><button className="modal-close" aria-label="Kapat" onClick={onClose}>×</button></div><GoalFields focusCategories={focusCategories} submitLabel="Hedefi oluştur" onSave={onSave} /></AccessibleModal>
}

function GoalFields({ initial, focusCategories, submitLabel, onSave }: { initial?: Goal; focusCategories: FocusCategory[]; submitLabel: string; onSave: (goal: Goal) => Promise<boolean> }) {
  const areas = [...new Set([...defaultAreas, ...focusCategories.map(category => category.area), ...(initial ? [initial.area] : [])])]
  const [draft, setDraft] = useState<Goal>(initial ?? { id: crypto.randomUUID(), title: '', area: 'Kariyer', unit: 'saat', target: 0, deadline: '', activity: 'manual', manualProgress: 0 })
  const [error, setError] = useState('')
  const updateMilestone = (id: string, update: Partial<GoalMilestone>) => setDraft({ ...draft, milestones: (draft.milestones ?? []).map((item) => item.id === id ? { ...item, ...update } : item) })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim() || !draft.area.trim() || !Number.isFinite(draft.target) || draft.target <= 0) { setError('Başlık, alan ve pozitif hedef değer zorunlu.'); return }
    if ((draft.milestones ?? []).some(item => !item.title.trim() || !Number.isFinite(item.target) || item.target <= 0 || item.target > draft.target)) { setError('Kilometre taşları adlandırılmalı ve ana hedeften büyük olmayan pozitif değerlere sahip olmalı.'); return }
    const goal = { ...draft, title: draft.title.trim(), area: draft.area.trim(), deadline: draft.deadline || undefined, milestones: draft.milestones?.map(item => ({ ...item, title: item.title.trim() })) }
    if (!await onSave(goal)) setError('Kaydedilemedi. Girdiğin değerler korunuyor.')
  }
  return <form className="goal-form" onSubmit={submit}>
    <label>Hedef adı<input maxLength={150} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Örn. 200 saat derin çalışma" /></label>
    <div className="form-grid"><AreaInput label="Hayat alanı" value={draft.area} areas={areas} onChange={(area: Area) => setDraft({ ...draft, area })} /><label>Birim<select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value as GoalUnit, activity: event.target.value === 'saat' ? draft.activity : 'manual' })}>{(['saat', 'kelime', 'sayfa', 'adet'] as GoalUnit[]).map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>
    <div className="form-grid"><label>Hedef değer<NumberInput unit={draft.unit} min="0.1" step="0.1" value={draft.target || ''} onChange={(event) => setDraft({ ...draft, target: Number(event.target.value) })} /></label><label>Bitiş tarihi (isteğe bağlı)<input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label></div>
    {draft.unit === 'saat' && <label>Focus bağlantısı<select value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })}><option value="manual">Manuel ilerleme</option><option value="all">Tüm focus oturumları</option>{focusCategories.filter((option) => !option.archived || option.title === draft.activity).map((option) => <option key={option.id} value={option.title}>{option.title}</option>)}</select></label>}
    <label>Başlangıç / manuel değer<NumberInput unit={draft.unit} min="0" step="0.1" value={draft.manualProgress || ''} onChange={(event) => setDraft({ ...draft, manualProgress: Number(event.target.value) })} /></label>
    <fieldset className="milestone-editor"><legend>Kilometre taşları</legend>{(draft.milestones ?? []).map((item) => <div key={item.id}><input aria-label="Kilometre taşı adı" maxLength={100} value={item.title} onChange={(event) => updateMilestone(item.id, { title: event.target.value })} placeholder="Örn. İlk 25 saat" /><NumberInput aria-label={`${item.title || 'Kilometre taşı'} hedefi`} unit={draft.unit} min="0.1" step="0.1" value={item.target || ''} onChange={(event) => updateMilestone(item.id, { target: Number(event.target.value) })} /><button type="button" aria-label="Kilometre taşını sil" onClick={() => setDraft({ ...draft, milestones: draft.milestones?.filter(milestone => milestone.id !== item.id) })}>×</button></div>)}<button type="button" className="add-milestone" disabled={(draft.milestones?.length ?? 0) >= 20} onClick={() => setDraft({ ...draft, milestones: [...(draft.milestones ?? []), { id: crypto.randomUUID(), title: '', target: 0 }] })}>+ Kilometre taşı ekle</button></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="timer-button" type="submit">{submitLabel}</button>
  </form>
}
