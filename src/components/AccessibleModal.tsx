import { type ReactNode, useEffect, useRef } from 'react'

const modalStack: HTMLElement[] = []
let originalOverflow = ''

export function AccessibleModal({ label, className, onClose, children, dismissible = true }: { label: string; className: string; onClose?: () => void; children: ReactNode; dismissible?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (!panel) return
    if (!modalStack.length) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    modalStack.push(panel)
    const isTop = () => modalStack.at(-1) === panel
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], [tabindex]')]
      .filter(item => item.tabIndex >= 0 && !item.matches(':disabled') && !item.closest('[hidden], [inert], [aria-hidden="true"]') && item.getClientRects().length > 0)
    const focusTimer = window.setTimeout(() => {
      if (!isTop()) return
      const items = focusable()
      ;(items.find(item => item.matches('[autofocus], [data-autofocus]')) ?? items[0] ?? panel).focus()
    }, 0)
    const keydown = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return
      if (event.key === 'Escape' && dismissible && onCloseRef.current) { event.preventDefault(); if (!panel?.closest('fieldset[disabled]')) onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); panel?.focus(); return }
      const first = items[0]; const last = items[items.length - 1]
      const outside = !items.includes(document.activeElement as HTMLElement)
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', keydown)
      const index = modalStack.indexOf(panel)
      if (index !== -1) modalStack.splice(index, 1)
      if (!modalStack.length) document.body.style.overflow = originalOverflow
      window.setTimeout(() => {
        if (panel.isConnected) return
        const top = modalStack.at(-1)
        if (previous?.isConnected && (!top || top.contains(previous))) previous.focus()
        else top?.focus()
      }, 0)
    }
  }, [dismissible])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (dismissible && onCloseRef.current && event.target === event.currentTarget && !panelRef.current?.closest('fieldset[disabled]')) onCloseRef.current() }}><div ref={panelRef} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>
}
