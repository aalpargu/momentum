import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './screen-time.css'
import './progress-calendar.css'
import './settings-security.css'
import './analytics.css'
import './accessibility.css'
import './forms.css'
import './productivity.css'
import './experience.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Uygulama çevrimiçi çalışmaya devam eder; PWA desteği yalnızca devre dışı kalır.
    })
  })
}
