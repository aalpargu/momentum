import { buildDailySeries, buildMonthlySeries, screenMinutes, type AnalyticsScreenEntry, type AnalyticsSession } from '../lib/analytics'

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60); const remainder = minutes % 60
  return hours ? `${hours}s ${remainder}d` : `${remainder}d`
}

export function AnalyticsCharts({ sessions, screenEntries, today }: { sessions: AnalyticsSession[]; screenEntries: AnalyticsScreenEntry[]; today: string }) {
  const daily = buildDailySeries(sessions, screenEntries, today)
  const monthly = buildMonthlySeries(sessions, screenEntries, today)
  const dailyMaximum = Math.max(1, ...daily.flatMap((day) => [day.focusMinutes, day.passiveMinutes]))
  const monthMaximum = Math.max(1, ...monthly.flatMap((month) => [month.focusMinutes, month.passiveMinutes]))
  const unclassified = screenMinutes(screenEntries, 'unclassified')
  const kinds = [
    { key: 'passive' as const, label: 'Pasif', value: screenMinutes(screenEntries, 'passive') },
    { key: 'useful' as const, label: 'Faydalı', value: screenMinutes(screenEntries, 'useful') },
    { key: 'necessary' as const, label: 'Zorunlu', value: screenMinutes(screenEntries, 'necessary') },
  ]
  return <section className="analytics-charts" aria-label="Zaman grafikleri">
    <article className="card chart-card"><div className="card-heading"><div><p className="eyebrow">SON 7 GÜN</p><h2>Yatırım ve pasif ekran</h2></div><span className="chart-legend"><i className="focus" /> Focus <i className="passive" /> Pasif</span></div><div className="day-bars">{daily.map((day) => <div className="day-bar-row" key={day.date}><span>{new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`))}</span><div><i className="focus" style={{ width: `${day.focusMinutes / dailyMaximum * 100}%` }} title={`${minutesLabel(day.focusMinutes)} focus`} /><i className="passive" style={{ width: `${day.passiveMinutes / dailyMaximum * 100}%` }} title={`${minutesLabel(day.passiveMinutes)} pasif ekran`} /></div><strong>{minutesLabel(day.focusMinutes)}</strong></div>)}</div></article>
    <article className="card chart-card"><div className="card-heading"><div><p className="eyebrow">SON 6 AY</p><h2>Birikimin</h2></div></div><div className="month-bars">{monthly.map((month) => <div className="month-column" key={month.key}><div><i className="focus" style={{ height: `${Math.max(month.focusMinutes ? 4 : 0, month.focusMinutes / monthMaximum * 100)}%` }} title={`${minutesLabel(month.focusMinutes)} focus`} /><i className="passive" style={{ height: `${Math.max(month.passiveMinutes ? 4 : 0, month.passiveMinutes / monthMaximum * 100)}%` }} title={`${minutesLabel(month.passiveMinutes)} pasif ekran`} /></div><span>{new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(new Date(`${month.key}-01T12:00:00`))}</span></div>)}</div><div className="screen-kind-summary">{kinds.map((kind) => <span key={kind.key}><i className={kind.key} />{kind.label}<strong>{minutesLabel(kind.value)}</strong></span>)}</div>{unclassified > 0 && <p className="chart-warning">{minutesLabel(unclassified)} ekran süresi henüz sınıflandırılmadı; doğru “geri kazanılan zaman” hesabı için Günlük sekmesinden türünü seç.</p>}</article>
  </section>
}
