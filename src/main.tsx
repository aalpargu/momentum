import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'
import './styles.css'
import './screen-time.css'
import './progress-calendar.css'
import './settings-security.css'
import './analytics.css'
import './accessibility.css'
import './forms.css'
import './productivity.css'
import './experience.css'
import './product-ready.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { analyticsOptOutKey, recordDiagnostic } from './lib/diagnostics'

window.addEventListener('error', event => recordDiagnostic({ kind: 'error', message: event.message, stack: event.error instanceof Error ? event.error.stack : undefined }))
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason
  recordDiagnostic({ kind: 'rejection', message: reason instanceof Error ? reason.message : reason, stack: reason instanceof Error ? reason.stack : undefined })
})

function privacySafePageView(event: BeforeSendEvent) {
  if (localStorage.getItem(analyticsOptOutKey) === '1') return null
  const url = new URL(event.url)
  const tab = url.searchParams.get('tab')
  url.search = ['habits', 'journal', 'progress', 'calendar'].includes(String(tab)) ? `?tab=${tab}` : ''
  url.hash = ''
  return { ...event, url: url.toString() }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
    <Analytics beforeSend={privacySafePageView} />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      const announceWaiting = () => { if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new Event('momentum-sw-update')) }
      announceWaiting()
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') announceWaiting() })
      })
    }).catch(() => {
      // Uygulama çevrimiçi çalışmaya devam eder; PWA desteği yalnızca devre dışı kalır.
    })
  })
}
