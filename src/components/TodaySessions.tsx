import { useState } from 'react'
import type { FocusCategory, FocusSession } from '../lib/domain'
import { shortDuration } from '../lib/productivity'
import { SessionHistoryEditor } from './SessionHistoryEditor'

export function TodaySessions({ sessions, categories, onUpdate, onDelete }: {
  sessions: FocusSession[]; categories: FocusCategory[]
  onUpdate: (id: string, update: Pick<FocusSession, 'title' | 'area' | 'seconds'>) => Promise<string | null>
  onDelete: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const ordered = sessions.slice().reverse()
  const visible = expanded ? ordered : ordered.slice(0, 5)
  return <article className="card today-records">
    <div className="card-heading"><div><p className="eyebrow">KAYDEDİLMİŞ ÇALIŞMA</p><h2>Bugünün kayıtları</h2></div><span className="date-pill">{shortDuration(sessions.reduce((sum, item) => sum + item.seconds, 0))}</span></div>
    {visible.length === 0 && <p className="empty-state">Tamamladığın oturumlar ve hızlı kayıtların burada görünecek.</p>}
    <div className="today-record-list">{visible.map(session => <div className="today-record" key={session.id} data-record={session.id}>
      <div className="today-record-summary"><div><strong>{session.intention || session.title}</strong><small>{session.intention ? session.title + ' · ' : ''}{session.source === 'timer' ? 'Zamanlayıcı' : 'Manuel kayıt'}</small>{session.note && <p>{session.note}</p>}</div><span>{shortDuration(session.seconds)}</span><button className="quiet-button" aria-expanded={editingId === session.id} onClick={() => setEditingId(editingId === session.id ? null : session.id)}>{editingId === session.id ? 'Vazgeç' : 'Düzenle'}</button></div>
      {editingId === session.id && <SessionHistoryEditor session={session} categories={categories} onSave={async update => { const error = await onUpdate(session.id, update); if (!error) setEditingId(null); return error }} onDelete={() => onDelete(session.id)} />}
    </div>)}</div>
    {sessions.length > 5 && <button className="analysis-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Daha az göster' : `Tüm kayıtları göster (${sessions.length})`}</button>}
  </article>
}
