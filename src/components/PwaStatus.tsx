import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [updateReady, setUpdateReady] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    const update = () => setUpdateReady(true)
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    window.addEventListener('momentum-sw-update', update)
    window.addEventListener('beforeinstallprompt', install)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('momentum-sw-update', update); window.removeEventListener('beforeinstallprompt', install) }
  }, [])
  if (online && !updateReady && !installPrompt) return null
  const applyUpdate = async () => {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (!registration?.waiting) { window.location.reload(); return }
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; window.location.reload() } }, { once: true })
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }
  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }
  return <aside className={`pwa-status ${online ? '' : 'offline'}`} role="status">
    <span>{!online ? 'Çevrimdışısın · değişiklikler bu cihazda güvende' : updateReady ? 'Momentum’un yeni sürümü hazır' : 'Momentum’u cihazına kurabilirsin'}</span>
    {updateReady && <button type="button" onClick={() => void applyUpdate()}>Güncelle</button>}
    {!updateReady && online && installPrompt && <button type="button" onClick={() => void install()}>Uygulamayı kur</button>}
  </aside>
}
