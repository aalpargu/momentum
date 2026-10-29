import { useEffect, useState } from 'react'
import { NumberInput } from './NumberInput'
import type { FocusSession, FocusCategory } from '../lib/domain'

export function SessionHistoryEditor({ session, categories, onSave, onDelete }: { session: FocusSession; categories: FocusCategory[]; onSave: (update: Pick<FocusSession, 'title' | 'area' | 'seconds'>) => Promise<string | null>; onDelete: () => void }) {
  const [title, setTitle] = useState(session.title); const [area, setArea] = useState(session.area); const [minutes, setMinutes] = useState(String(Math.round(session.seconds / 60))); const [error, setError] = useState('')
  useEffect(() => { setTitle(session.title); setArea(session.area); setMinutes(String(Math.round(session.seconds / 60))) }, [session.title, session.area, session.seconds])
  const options = categories.some((category) => category.title === session.title) ? categories : [{ id: `history-${session.id}`, title: session.title, area: session.area, icon: '⏱️', archived: true }, ...categories]
  const changeTitle = (value: string) => { setTitle(value); const category = options.find((item) => item.title === value); if (category) setArea(category.area); setError('') }
  const save = async () => setError(await onSave({ title, area, seconds: minutes === String(Math.round(session.seconds / 60)) ? session.seconds : Number(minutes) * 60 }) ?? '')
  return <div className="history-editor" data-record={session.id}><select aria-label={`${session.title} kategorisi`} value={title} onChange={(event) => changeTitle(event.target.value)}>{options.map((category) => <option key={category.id} value={category.title}>{category.icon} {category.title}{category.archived ? ' (arşiv)' : ''}</option>)}</select><NumberInput aria-label={`${session.title} dakika`} unit="dk" min="1" max="1440" value={minutes} onChange={(event) => { setMinutes(event.target.value); setError('') }} /><button onClick={save}>Kaydet</button><button className="delete-action" onClick={onDelete}>Sil</button>{error && <p className="form-error">{error}</p>}</div>
}

