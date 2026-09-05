import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../lib/domain'
import { createCommitQueue, milestoneLabels, newMilestones, saveFailure, validateStateTotals } from '../lib/experience'
import { saveAutomaticBackup } from '../lib/backupStore'
import { Icon } from './Icon'

type Notice = { kind: 'saving' | 'saved' | 'error'; text: string }
type Celebration = { label: string; big: boolean } | null
function chime() {
  try {
    const context = new AudioContext()
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.025, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5)
    gain.connect(context.destination)
    for (const [index, frequency] of [523.25, 659.25].entries()) {
      const oscillator = context.createOscillator()
      oscillator.frequency.value = frequency; oscillator.connect(gain)
      oscillator.start(context.currentTime + index * 0.09); oscillator.stop(context.currentTime + 0.5)
    }
    window.setTimeout(() => void context.close(), 700)
  } catch { /* Ses desteği kaydetme akışını etkilemez. */ }
}
function highlightChanges(before: AppState, after: AppState) {
  const ids = new Set<string>()
  for (const key of ['sessions', 'goals', 'habits', 'focusCategories', 'screenTimeEntries', 'calendarBlocks'] as const) {
    const previous = new Map((before[key] ?? []).map(item => [item.id, JSON.stringify(item)]))
    for (const item of after[key] ?? []) if (previous.get(item.id) !== JSON.stringify(item)) ids.add(item.id)
  }
  for (const [date, log] of Object.entries(after.habitLog)) for (const [id, entry] of Object.entries(log)) if (JSON.stringify(before.habitLog[date]?.[id]) !== JSON.stringify(entry)) ids.add(id)
  for (const [date, plan] of Object.entries(after.dailyPlans)) for (const item of plan) if (JSON.stringify(before.dailyPlans[date]?.find(p => p.id === item.id)) !== JSON.stringify(item)) ids.add(item.id)
  window.requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('[data-record]').forEach(node => {
      if (!ids.has(node.dataset.record!)) return
      node.classList.remove('record-saved'); void node.offsetWidth; node.classList.add('record-saved')
      window.setTimeout(() => node.classList.remove('record-saved'), 1100)
    })
  })
}
export function useSavedActions(read: () => AppState, publish: (next: AppState) => void, persist: (raw: string) => Promise<void>) {
  const callbacks = useRef({ read, publish, persist })
  callbacks.current = { read, publish, persist }
  const queue = useRef(createCommitQueue(
    () => callbacks.current.read(),
    next => callbacks.current.persist(JSON.stringify(next)),
    next => callbacks.current.publish(next),
  ))
  const busyRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [celebration, setCelebration] = useState<Celebration>(null)
  const [undoState, setUndoState] = useState<AppState | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const mutate = async (update: AppState | ((current: AppState) => AppState), undoing = false) => {
    if (busyRef.current) return false
    busyRef.current = true; setPending(true); setDismissed(false); setNotice({ kind: 'saving', text: 'Kaydediliyor…' })
    let milestones: [string, string][] = []
    try {
      const { previous, next } = await queue.current(current => {
        const changed = typeof update === 'function' ? update(current) : update
        validateStateTotals(changed)
        if (changed === current) return current
        milestones = undoing ? [] : newMilestones(current, changed)
        return { ...changed, experience: {
          recentEntries: changed.experience?.recentEntries ?? [],
          seenMilestones: [...new Set([...(current.experience?.seenMilestones ?? []), ...(changed.experience?.seenMilestones ?? []), ...milestoneLabels(current).keys(), ...milestones.map(([id]) => id)])],
        } }
      })
      if (next !== previous) {
        setUndoState(undoing ? null : previous)
        highlightChanges(previous, next)
        void saveAutomaticBackup(JSON.stringify(previous)).then(() => saveAutomaticBackup(JSON.stringify(next))).catch(() => undefined)
      }
      setNotice({ kind: 'saved', text: undoing ? 'Geri alındı ve kaydedildi.' : 'Kaydedildi' })
      if (milestones.length) {
        const [id, label] = milestones.at(-1)!
        setCelebration({ label, big: ['hours:100', 'hours:500', 'streak:30', 'streak:100'].includes(id) })
        if (next.settings.celebrationSound) chime()
      } else if (undoing) setCelebration(null)
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error && /24 saat|öncelik|çakış|geçerli/.test(error.message) ? error.message : saveFailure })
      return false
    } finally { busyRef.current = false; setPending(false) }
  }
  useEffect(() => {
    if (notice?.kind !== 'saved') return
    const timer = window.setTimeout(() => setDismissed(true), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!celebration) return
    const timer = window.setTimeout(() => setCelebration(null), 6500)
    return () => window.clearTimeout(timer)
  }, [celebration])
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (busyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [])
  return { mutate, pending, notice: dismissed ? null : notice, dismiss: () => setDismissed(true), undo: () => undoState ? mutate(undoState, true) : Promise.resolve(false), canUndo: Boolean(undoState), celebration, dismissCelebration: () => setCelebration(null) }
}
export function SaveFeedback({ actions }: { actions: ReturnType<typeof useSavedActions> }) {
  return <><div className="save-feedback" aria-live="polite" aria-atomic="true">{actions.notice && <div className={'save-toast ' + actions.notice.kind}><Icon name={actions.notice.kind === 'error' ? 'alert' : actions.notice.kind === 'saving' ? 'clock' : 'check'} /><span>{actions.notice.text}</span>{actions.canUndo && !actions.pending && <button onClick={actions.undo}>Geri al</button>}{!actions.pending && <button className="toast-close" onClick={actions.dismiss} aria-label="Bildirimi kapat"><Icon name="close" size={16} /></button>}</div>}</div>{actions.celebration && <aside className={'milestone-toast ' + (actions.celebration.big ? 'milestone-big' : '')} role="status"><Icon name="spark" /><div><small>EMEĞİN BİRİKİYOR</small><strong>{actions.celebration.label}</strong></div><button onClick={actions.dismissCelebration} aria-label="Kutlamayı kapat"><Icon name="close" size={16} /></button>{actions.celebration.big && <div className="celebration-particles" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>}</aside>}</>
}
