type FocusDialProps = {
  roundStartSeconds?: number
  seconds: number
  targetSeconds: number
  active: boolean
  running: boolean
  breakActive: boolean
  round: number
  rounds: number
  label: string
}

export function FocusDial({ seconds, targetSeconds, active, running, breakActive, round, rounds, label, roundStartSeconds }: FocusDialProps) {
  const displaySeconds = active ? seconds : targetSeconds
  const minutes = Math.floor(displaySeconds / 60)
  const time = `${String(minutes).padStart(2, '0')}:${String(displaySeconds % 60).padStart(2, '0')}`
  const roundSeconds = breakActive ? seconds : seconds - (roundStartSeconds ?? (round - 1) * targetSeconds)
  const progress = active ? Math.min(1, Math.max(0, roundSeconds / Math.max(1, targetSeconds))) : 0
  return <div className={`focus-dial ${running ? 'is-running' : ''} ${active && !running ? 'is-paused' : ''} ${breakActive ? 'is-break' : ''}`}>
    <div className="dial-halo" aria-hidden="true" />
    <svg className="dial-rings" viewBox="0 0 260 260" aria-hidden="true">
      <circle className="dial-ticks" cx="130" cy="130" r="124" pathLength="60" strokeDasharray=".1 .9" />
      <circle className="dial-track" cx="130" cy="130" r="111" />
      <circle className="dial-progress" cx="130" cy="130" r="111" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100} />
    </svg>
    <div className="dial-content">
      <span className="dial-label">{active ? breakActive ? 'MOLA ZAMANI' : running ? 'AKIŞTASIN' : 'KÜÇÜK BİR ARA' : 'KENDİNE ZAMAN AYIR'}</span>
      <strong role="timer" aria-label={active ? breakActive ? 'Kalan mola süresi' : 'Geçen odak süresi' : 'Planlanan odak süresi'}>{time}</strong>
      <span className="dial-caption">{label}</span>
      <span className="dial-status"><i />{active ? breakActive ? 'Yenilen, sonra devam et' : `Tur ${round}/${rounds} · %${Math.round(progress * 100)} tamamlandı` : 'Bir küçük başlangıç yeter'}</span>
      {active && !breakActive && <span className="dial-total-label">Toplam odak süresi</span>}
    </div>
  </div>
}
