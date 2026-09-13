import { createRoot } from 'react-dom/client'
import { AccessibleModal } from './AccessibleModal'

export function confirmAction(message: string, confirmLabel = 'Devam et', title = 'Bu işlemi onayla') {
  return new Promise<boolean>((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const settle = (answer: boolean) => {
      resolve(answer)
      window.setTimeout(() => { root.unmount(); host.remove() }, 0)
    }
    root.render(<AccessibleModal label={title} className="card confirm-dialog" onClose={() => settle(false)}><p className="eyebrow">ONAY GEREKİYOR</p><h2>{title}</h2><p>{message}</p><div><button type="button" className="quiet-button" onClick={() => settle(false)}>Vazgeç</button><button type="button" className="confirm-danger" onClick={() => settle(true)}>{confirmLabel}</button></div></AccessibleModal>)
  })
}
