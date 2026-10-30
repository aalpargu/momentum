import { type FormEvent, useState } from 'react'
import type { DailyPlanItem, FocusSession, FocusCategory } from '../lib/domain'
import { shortDuration } from '../lib/productivity'
import { saveFailure } from '../lib/experience'
import { AccessibleModal } from './AccessibleModal'

type PlanProps = {
  plan: DailyPlanItem[]; categories: FocusCategory[]; defaultCategoryId: string; sessions: FocusSession[]
  activeTaskId?: string; hasActiveFocus: boolean; onStart: (item: DailyPlanItem) => void
  carryCount: number; draft: string; error: string; onCarry: () => void; onDraftChange: (value: string) => void
  onAdd: (event: FormEvent) => Promise<void>; onUpdate: (id: string, update: Partial<DailyPlanItem>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean>
}

export function DailyPlan({ plan, categories, defaultCategoryId, sessions, activeTaskId, hasActiveFocus, onStart, carryCount, draft, error, onCarry, onDraftChange, onAdd, onUpdate, onRemove }: PlanProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState('')
  const completed = plan.filter(item => item.completed).length
  const visible = plan.filter(item => filter === 'all' || (filter === 'done' ? item.completed : !item.completed))
  const taskSeconds = new Map<string, number>()
  for (const session of sessions) if (session.taskId) taskSeconds.set(session.taskId, (taskSeconds.get(session.taskId) ?? 0) + session.seconds)
  const commit = async (operation: () => Promise<boolean>) => {
    if (pending) return false
    setPending(true); setLocalError('')
    try { const ok = await operation(); if (!ok) setLocalError(saveFailure); return ok }
    catch { setLocalError(saveFailure); return false }
    finally { setPending(false) }
  }
  const saveEdit = async (id: string) => { const text = editingText.trim(); if (text && await commit(() => onUpdate(id, { text }))) setEditingId(null) }
  return <article className="card plan-card todo-card">
    <div className="card-heading"><div><p className="eyebrow">BUGÜNÜN İŞLERİ</p><h2>Yapılacaklar</h2></div><span className="date-pill" role="status">{completed}/{plan.length} tamamlandı</span></div>
    <div className="todo-progress" aria-hidden="true"><span style={{ width: (plan.length ? completed / plan.length * 100 : 0) + '%' }} /></div>
    {carryCount > 0 && <button type="button" className="carry-plans" onClick={onCarry}>↪ Dünden kalan {carryCount} işi bugüne taşı</button>}
    <form className="plan-add" onSubmit={async event => { if (pending) { event.preventDefault(); return }; setPending(true); setFilter('all'); try { await onAdd(event) } finally { setPending(false) } }}><input id="daily-plan-input" value={draft} maxLength={100} onChange={event => onDraftChange(event.target.value)} placeholder="Yeni bir iş ekle…" aria-label="Yeni önemli iş" /><button type="submit" disabled={pending || !draft.trim()}>Ekle</button></form>
    {(error || localError) && <p className="form-error" role="alert">{error || localError}</p>}
    {plan.length > 0 && <div className="todo-filters" role="group" aria-label="Yapılacakları filtrele">{([['all', 'Tümü', plan.length], ['open', 'Yapılacak', plan.length - completed], ['done', 'Tamamlanan', completed]] as const).map(([value, label, count]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} <span>{count}</span></button>)}</div>}
    <div className="plan-list">{visible.length === 0 && <p className="empty-state">{plan.length === 0 ? 'Aklındaki işleri buraya bırak. Hazır olduğunda birini seç ve başla.' : filter === 'open' ? 'Bugünün bütün işleri tamamlandı. ✓' : 'Henüz tamamlanan iş yok.'}</p>}
      {visible.map(item => <div className={'plan-item ' + (item.completed ? 'plan-complete' : '')} key={item.id} data-record={item.id}>
        <button className="plan-check" disabled={pending} aria-pressed={item.completed} aria-label={item.text + ' tamamlandı'} onClick={() => void commit(() => onUpdate(item.id, { completed: !item.completed }))}>{item.completed ? <span key="checked">✓</span> : ''}</button>
        <div className="todo-content">{editingId === item.id ? <input autoFocus maxLength={100} className="plan-edit-input" value={editingText} onChange={event => setEditingText(event.target.value)} aria-label="İşi düzenle" onKeyDown={event => { if (event.key === 'Enter') void saveEdit(item.id); if (event.key === 'Escape') setEditingId(null) }} /> : <span className="todo-text">{item.text}</span>}
          {(item.carriedFrom || taskSeconds.has(item.id)) && <div className="todo-meta">{item.carriedFrom && <small>Dünden taşındı</small>}{taskSeconds.has(item.id) && <small>{shortDuration(taskSeconds.get(item.id)!)} kayıtlı çalışma</small>}</div>}
          {!item.completed && <div className="todo-focus-actions"><select aria-label={item.text + ' çalışma kategorisi'} disabled={pending || activeTaskId === item.id} value={categories.some(category => category.id === item.categoryId) ? item.categoryId : defaultCategoryId} onChange={event => void commit(() => onUpdate(item.id, { categoryId: event.target.value }))}>{categories.map(category => <option key={category.id} value={category.id}>{category.icon} {category.title}</option>)}</select><button className="todo-start" disabled={pending || hasActiveFocus} title={hasActiveFocus ? 'Yeni işe başlamadan önce açık oturumu bitir veya sıfırla.' : undefined} onClick={() => onStart(item)}>{activeTaskId === item.id ? '◷ Oturum açık' : '▷ Bu işe çalış'}</button></div>}
        </div>
        <div className="plan-item-actions">{editingId === item.id ? <><button disabled={pending || !editingText.trim()} onClick={() => void saveEdit(item.id)}>Kaydet</button><button onClick={() => setEditingId(null)}>Vazgeç</button></> : <><button onClick={() => { setEditingId(item.id); setEditingText(item.text) }}>Düzenle</button><button disabled={pending} onClick={() => void commit(() => onRemove(item.id))} className="delete-action">Sil</button></>}</div>
      </div>)}
    </div>
  </article>
}

export function FocusNoteModal({ session, onClose, onSave }: { session?: FocusSession; onClose: () => void; onSave: (id: string, note: string) => Promise<boolean> }) {
  const [note, setNote] = useState(session?.note ?? '')
  const [error, setError] = useState('')
  if (!session) return null
  return <AccessibleModal label="Odak oturumu notu" className="card focus-note-modal" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">OTURUM TAMAMLANDI</p><h2>{session.title}</h2></div><button type="button" className="modal-close" aria-label="Kapat" onClick={onClose}>×</button></div>{session.intention && <p className="focus-note-intention">Niyet: {session.intention}</p>}<label>Ne başardın veya sıradaki adım ne?<textarea autoFocus maxLength={1000} value={note} onChange={(event) => { setNote(event.target.value); setError('') }} placeholder="Kısa bir kapanış notu…" /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="focus-note-actions"><button type="button" className="timer-button" onClick={async () => { if (!await onSave(session.id, note)) setError(saveFailure) }}>Notu kaydet</button><button type="button" className="quiet-button" onClick={onClose}>Şimdi değil</button></div></AccessibleModal>
}
