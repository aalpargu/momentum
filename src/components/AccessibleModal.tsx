import { type ReactNode, useEffect, useRef } from 'react'

export function AccessibleModal({ label, className, onClose, children, dismissible = true }: { label: string; className: string; onClose?: () => void; children: ReactNode; dismissible?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])]
    const focusTimer = window.setTimeout(() => (panel?.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0] ?? panel)?.focus(), 0)
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible && onCloseRef.current) { event.preventDefault(); if (!panel?.closest('fieldset[disabled]')) onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); panel?.focus(); return }
      const first = items[0]; const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = originalOverflow
      window.setTimeout(() => { if (!panel?.isConnected && previous?.isConnected) previous.focus() }, 0)
    }
  }, [dismissible])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (dismissible && onCloseRef.current && event.target === event.currentTarget && !panelRef.current?.closest('fieldset[disabled]')) onCloseRef.current() }}><div ref={panelRef} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>
}
