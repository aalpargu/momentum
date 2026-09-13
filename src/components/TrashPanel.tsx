import { useEffect, useState } from 'react'
import { clearTrashItems, listTrashItems, removeTrashItem } from '../lib/trashStore'
import { trashKindLabel, type TrashItem } from '../lib/trash'
import { confirmAction } from './confirmAction'

export function TrashPanel({ onRestore }: { onRestore: (item: TrashItem) => Promise<{ ok: boolean; error?: string }> }) {
  const [items, setItems] = useState<TrashItem[]>([])
  const [status, setStatus] = useState('Çöp kutusu okunuyor…')
  const [busyId, setBusyId] = useState('')
  const refresh = () => listTrashItems().then(next => { setItems(next); setStatus(next.length ? `${next.length} kayıt 30 gün boyunca kurtarılabilir.` : 'Çöp kutusu boş.') }).catch(() => setStatus('Çöp kutusu bu tarayıcıda kullanılamıyor.'))
  useEffect(() => { void refresh() }, [])

  const restore = async (item: TrashItem) => {
    setBusyId(item.id); setStatus('Kayıt geri yükleniyor…')
    const result = await onRestore(item)
    if (result.ok) { await removeTrashItem(item.id); await refresh(); setStatus(`${item.label} geri yüklendi.`) }
    else setStatus(result.error ?? 'Kayıt geri yüklenemedi.')
    setBusyId('')
  }

  const empty = async () => {
    if (!await confirmAction('Çöp kutusundaki kurtarılabilir kayıtlar kalıcı olarak silinecek.', 'Çöp kutusunu boşalt', 'Kayıtları kalıcı sil')) return
    setBusyId('all'); await clearTrashItems(); setItems([]); setStatus('Çöp kutusu boşaltıldı.'); setBusyId('')
  }

  return <section className="trash-panel">
    <div className="trash-heading"><div><p className="eyebrow">ÇÖP KUTUSU</p><h3>Silinen kayıtları geri al</h3><p className="gemini-help">Odak, ekran süresi, öncelik, hedef ve takvim kayıtları bu cihazda 30 gün tutulur.</p></div>{items.length > 0 && <button type="button" className="delete-action" disabled={Boolean(busyId)} onClick={() => void empty()}>Çöp kutusunu boşalt</button>}</div>
    <p className="backup-store-status" role="status">{status}</p>
    {items.length > 0 && <div className="trash-list">{items.map(item => <div key={item.id}><span><strong>{item.label}</strong><small>{trashKindLabel(item.kind)} · {new Date(item.deletedAt).toLocaleString('tr-TR')}</small></span><button type="button" disabled={Boolean(busyId)} onClick={() => void restore(item)}>{busyId === item.id ? 'Yükleniyor…' : 'Geri yükle'}</button></div>)}</div>}
  </section>
}
