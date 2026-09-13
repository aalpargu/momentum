import { Component, type ErrorInfo, type ReactNode } from 'react'
import { listAutomaticBackups } from '../lib/backupStore'
import { loadMainState, saveMainState } from '../lib/stateStore'
import { recentDiagnostics, recordDiagnostic } from '../lib/diagnostics'

const safeModeKey = 'momentum-safe-mode-v1'

function download(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; errorId: string; busy: boolean; status: string }> {
  state = { failed: false, errorId: '', busy: false, status: '' }
  private caughtMessage = 'Bilinmeyen arayüz hatası'

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = `MOM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    this.caughtMessage = `${error.name}: ${error.message}`
    this.setState({ errorId })
    recordDiagnostic({ kind: 'react', message: `${errorId} · ${this.caughtMessage}`, stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` })
    console.error('Momentum arayüz hatası', errorId, error, info.componentStack)
  }

  reportError = async () => {
    this.setState({ busy: true, status: 'Hata raporu gönderiliyor…' })
    try {
      const { submitProductFeedback } = await import('../lib/cloud')
      await submitProductFeedback({ category: 'crash', message: `${this.state.errorId} · ${this.caughtMessage}`.slice(0, 2_000), diagnostics: recentDiagnostics() })
      this.setState({ status: 'Hata raporu gönderildi. Üretkenlik verilerin paylaşılmadı.' })
    } catch (error) { this.setState({ status: error instanceof Error ? error.message : 'Hata raporu gönderilemedi.' }) }
    finally { this.setState({ busy: false }) }
  }

  downloadRecovery = async () => {
    this.setState({ busy: true, status: '' })
    try {
      const main = await loadMainState()
      const backups = await listAutomaticBackups()
      download(`momentum-kurtarma-${new Date().toISOString().slice(0, 10)}.json`, main?.payload ?? backups[0]?.payload ?? '{}')
      this.setState({ status: 'Kurtarma dosyası indirildi.' })
    } catch { this.setState({ status: 'Kurtarma dosyası okunamadı.' }) }
    finally { this.setState({ busy: false }) }
  }

  restoreLatest = async () => {
    this.setState({ busy: true, status: '' })
    try {
      const latest = (await listAutomaticBackups())[0]
      if (!latest) throw new Error('Yedek yok')
      const parsed = JSON.parse(latest.payload) as Record<string, unknown>
      if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.habits)) throw new Error('Geçersiz yedek')
      await saveMainState(latest.payload)
      window.location.reload()
    } catch { this.setState({ status: 'Doğrulanabilir otomatik yedek bulunamadı.' }) }
    finally { this.setState({ busy: false }) }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-error" role="alert"><div className="card"><span className="brand-mark">M</span><p className="eyebrow">HATA KİMLİĞİ · {this.state.errorId || 'HAZIRLANIYOR'}</p><h1>Momentum güvenli biçimde durdu.</h1><p>Yerel verilerin silinmedi. Önce sayfayı yenileyebilir, sorun sürerse kurtarma dosyasını indirebilir veya son otomatik yedeğe dönebilirsin.</p><div className="fatal-actions"><button disabled={this.state.busy} onClick={() => window.location.reload()}>Sayfayı yenile</button><button disabled={this.state.busy} onClick={() => void this.downloadRecovery()}>Kurtarma dosyasını indir</button><button disabled={this.state.busy} onClick={() => void this.restoreLatest()}>Son güvenli sürümü yükle</button><button disabled={this.state.busy} onClick={() => { localStorage.setItem(safeModeKey, '1'); window.location.reload() }}>Güvenli modda aç</button><button disabled={this.state.busy} onClick={() => void this.reportError()}>Hata raporunu gönder</button><button onClick={() => void navigator.clipboard?.writeText(this.state.errorId)}>Hata kimliğini kopyala</button></div>{this.state.status && <p role="status">{this.state.status}</p>}</div></main>
  }
}
