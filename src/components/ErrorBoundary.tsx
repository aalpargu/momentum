import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Momentum arayüz hatası', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-error" role="alert"><div className="card"><span className="brand-mark">M</span><h1>Momentum görüntülenemedi.</h1><p>Verilerin tarayıcıda korunuyor. Sayfayı yenileyerek tekrar deneyebilirsin; sorun sürerse Veri Yönetimi’ndeki otomatik yedekten kurtarma kullanılabilir.</p><button onClick={() => window.location.reload()}>Sayfayı yenile</button></div></main>
  }
}
