import { AccessibleModal } from './AccessibleModal'
import { Icon } from './Icon'

export function FocusView({ title, seconds, running, pending, error, onToggle, onFinish, onClose }: { title: string; seconds: number; running: boolean; pending: boolean; error: string; onToggle: () => void; onFinish: () => Promise<void>; onClose: () => void }) {
  const time = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':')
  return <AccessibleModal label="Tam ekran odak" className="focus-immersive" onClose={onClose}><button className="focus-exit" onClick={onClose} aria-label="Odak görünümünden çık"><Icon name="close" /></button><div className="focus-immersive-content"><span className="eyebrow">{running ? 'ŞİMDİ, SADECE BU.' : 'KISA BİR MOLA.'}</span><h1>{title}</h1><div className={'immersive-time ' + (running ? 'running' : '')} role="timer" aria-label="Geçen süre">{time}</div><div className="immersive-controls"><button onClick={onToggle} disabled={pending}><Icon name={running ? 'pause' : 'play'} />{running ? 'Duraklat' : 'Devam et'}</button><button className="primary-action" onClick={onFinish} disabled={pending}><Icon name="stop" />{pending ? 'Kaydediliyor…' : 'Kaydet ve bitir'}</button></div>{error && <p className="form-error" role="alert">{error}</p>}</div></AccessibleModal>
}
