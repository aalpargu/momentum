export type ClientDiagnostic = {
  id: string
  kind: 'error' | 'rejection' | 'react'
  message: string
  stack?: string
  path: string
  createdAt: string
}

const diagnosticsKey = 'momentum-diagnostics-v1'
export const analyticsOptOutKey = 'momentum-analytics-disabled-v1'
const maximumDiagnostics = 20
const maximumAgeMs = 14 * 24 * 60 * 60 * 1000

export function sanitizeDiagnosticText(value: unknown, maximum = 1_500) {
  return String(value ?? '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[e-posta]')
    .replace(/\b(?:eyJ|sb_(?:publishable|secret)_)[A-Za-z0-9._-]{12,}\b/g, '[anahtar]')
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/g, match => {
      try { const url = new URL(match); return `${url.origin}${url.pathname}` }
      catch { return '[adres]' }
    })
    .slice(0, maximum)
}

function validDiagnostic(value: unknown): value is ClientDiagnostic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<ClientDiagnostic>
  return typeof item.id === 'string'
    && ['error', 'rejection', 'react'].includes(String(item.kind))
    && typeof item.message === 'string'
    && typeof item.path === 'string'
    && typeof item.createdAt === 'string'
    && Number.isFinite(Date.parse(item.createdAt))
}

export function recentDiagnostics(now = Date.now()): ClientDiagnostic[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(diagnosticsKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(validDiagnostic).filter(item => Date.parse(item.createdAt) >= now - maximumAgeMs).slice(0, maximumDiagnostics)
  } catch { return [] }
}

export function recordDiagnostic(input: { kind: ClientDiagnostic['kind']; message: unknown; stack?: unknown; path?: string }) {
  if (typeof localStorage === 'undefined') return
  const item: ClientDiagnostic = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `diagnostic-${Date.now()}`,
    kind: input.kind,
    message: sanitizeDiagnosticText(input.message, 500),
    ...(input.stack ? { stack: sanitizeDiagnosticText(input.stack) } : {}),
    path: (input.path ?? (typeof location === 'undefined' ? '/' : location.pathname)).slice(0, 200),
    createdAt: new Date().toISOString(),
  }
  try { localStorage.setItem(diagnosticsKey, JSON.stringify([item, ...recentDiagnostics()].slice(0, maximumDiagnostics))) }
  catch { /* Tanılama kaydı ana uygulama verisini hiçbir zaman engellemez. */ }
}

export function clearDiagnostics() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(diagnosticsKey)
}
