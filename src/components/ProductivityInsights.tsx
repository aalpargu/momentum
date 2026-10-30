import { useMemo, useState, useEffect, useRef } from 'react'
import type { FocusSession, ScreenTimeEntry } from '../lib/domain'
import { buildProductivityReport, changeText, durationText, periodLabel, shiftDate, shortDuration, signalNoise, socialAppName, socialAppNames, weeklyReportText, type ProductivityReport, type ReportMode } from '../lib/productivity'

type DataProps = { sessions: FocusSession[]; screenEntries: ScreenTimeEntry[]; today: string }

function AnalysisMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M5 19v-5m7 5V9m7 10V4" /><path d="m4 9 7-5 4 1 5-3" /></svg>
}

export function TodayInsights({ sessions, screenEntries, today, onOpenReport, onOpenJournal }: DataProps & { onOpenReport: () => void; onOpenJournal: () => void }) {
  const report = useMemo(() => buildProductivityReport(sessions, screenEntries, today), [sessions, screenEntries, today])
  const socialEntries = screenEntries.filter((entry) => entry.date === today && socialAppName(entry.app))
  const socialMinutes = socialEntries.reduce((sum, entry) => sum + entry.minutes, 0)
  const todaySessions = sessions.filter((session) => session.date === today)
  const count = new Set(todaySessions.map((session) => session.timerSessionId ?? session.id)).size
  const average = count ? todaySessions.reduce((sum, session) => sum + session.seconds, 0) / count : 0
  const instagram = report.apps.find((app) => app.name === 'Instagram' && app.change !== null)
  return <section className="card today-insights" aria-label="Bugünün verimlilik analizi">
    <div className="insight-heading"><span className="analysis-mark"><AnalysisMark /></span><div><p className="eyebrow">ZAMANIN NE SÖYLÜYOR?</p><h2>Bugünün içgörüsü</h2></div><button className="analysis-link" onClick={onOpenReport}>Haftalık rapor <span aria-hidden="true">↗</span></button></div>
    <div className="today-insight-grid"><div><span className="insight-kicker">SOSYAL MEDYA</span><p className="today-insight-sentence">{socialMinutes ? <>Bugün <strong>{durationText(socialMinutes * 60)}</strong> sosyal medyada geçirdin.</> : 'Bugün henüz sosyal medya süresi kaydedilmedi.'}</p><p className="insight-caption">{socialMinutes ? 'Günlük bölümüne eklediğin uygulama sürelerine göre.' : <button className="analysis-link" onClick={onOpenJournal}>Ekran süresi ekle →</button>}</p></div><div className="today-focus-average"><span className="insight-kicker">ORTALAMA ODAK SÜREN</span><strong>{count ? shortDuration(average) : '—'}</strong><p className="insight-caption">{count ? `Bugünkü ${count} kayıtlı oturumun ortalaması` : 'İlk oturumunu kaydettiğinde burada görünecek.'}</p></div></div>
    {instagram && <p className={`insight-trend ${instagram.change! < 0 ? 'trend-down' : 'trend-up'}`}>Instagram kullanımın önceki haftanın aynı günlerine göre {changeText(instagram.change).toLocaleLowerCase('tr-TR')}. <span>Kaydedilen süreler karşılaştırılır; bugün devam ediyor.</span></p>}
  </section>
}

function Trend({ value, decreasingIsGood = false }: { value: number | null; decreasingIsGood?: boolean }) {
  const positive = value !== null && (decreasingIsGood ? value < 0 : value > 0)
  return <span className={`metric-trend ${value === null || value === 0 ? 'neutral' : positive ? 'positive' : 'negative'}`}>{value === null ? 'Karşılaştırma bekleniyor' : changeText(value)}</span>
}

function HourlyRhythm({ report }: { report: ProductivityReport }) {
  const { hourly } = report
  const [selected, setSelected] = useState<number | null>(null)
  const current = hourly.hours[selected ?? hourly.ranked[0]?.hour ?? 0]
  const maximum = Math.max(1, ...hourly.hours.map((hour) => hour.seconds))
  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`
  return <article className="card rhythm-card"><div className="card-heading"><div><p className="eyebrow">ODAK RİTMİN</p><h2>En çok çalıştığın saatler</h2></div><span className="analysis-badge">{hourly.measuredCount >= 3 && hourly.measuredDays >= 2 ? 'Ölçülen ritim' : 'İlk gözlemler'}</span></div>
    {hourly.ranked.length ? <>
      <div className="rhythm-summary"><strong>{hourLabel(hourly.ranked[0].hour)}</strong><p>En çok odak süresi biriktirdiğin saat aralığı.</p></div>
      <div className="hour-grid" role="group" aria-label="Saatlere göre odak süresi">{hourly.hours.map((hour) => <button type="button" key={hour.hour} aria-label={`${hourLabel(hour.hour)} · ${durationText(hour.seconds)} odak`} aria-pressed={current.hour === hour.hour} onClick={() => setSelected(hour.hour)}><span className="hour-meter"><i style={{ height: `${hour.seconds / maximum * 100}%` }} /></span><span>{String(hour.hour).padStart(2, '0')}</span></button>)}</div>
      <div className="hour-readout" aria-live="polite"><span>{hourLabel(current.hour)}</span><strong>{durationText(current.seconds)}</strong><span>{current.days} farklı gün</span></div>
      <ol className="peak-hours">{hourly.ranked.slice(0, 3).map((hour, index) => <li key={hour.hour}><span>{index + 1}</span><strong>{hourLabel(hour.hour)}</strong><small>{shortDuration(hour.seconds)}</small></li>)}</ol>
    </> : <div className="analysis-empty"><span className="empty-clock" aria-hidden="true">◷</span><h3>Ritmini birlikte keşfedelim.</h3><p>Birkaç zamanlayıcı oturumunu tamamladığında en çok odaklandığın saatler burada belirecek.</p></div>}
    <p className="insight-caption">{hourly.measuredCount} zamanlayıcı oturumu · {hourly.measuredDays} gün. Mola süreleri çıkarılır; saatler kaydın alındığı yerel saate göredir.{hourly.excludedCount > 0 && ` Saat ayrıntısı olmayan ${hourly.excludedCount} manuel/eski kayıt bu grafiğe dahil edilmedi.`}</p>
  </article>
}

function WeeklyBalance({ report, onDayClick }: { report: ProductivityReport; onDayClick: (date: string) => void }) {
  const maximum = Math.max(1, ...report.days.flatMap((day) => [day.focusSeconds / 60, day.socialMinutes]))
  const dayName = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' })
  return <article className="card weekly-balance"><div className="card-heading"><div><p className="eyebrow">GÜN GÜN DENGE</p><h2>Odak ve sosyal medya</h2></div></div><div className="balance-legend"><span><i />Odak</span><span><i />Sosyal medya</span></div><div className="balance-days">{report.days.map((day, index) => <button key={index} onClick={() => onDayClick(day.date)} aria-label={`${periodLabel(day.date, day.date)} · odak ${durationText(day.focusSeconds)} · sosyal medya ${day.socialMinutes ? durationText(day.socialMinutes * 60) : 'kayıt yok'} · gün detayını aç`}><span className="balance-day-label">{dayName(day.date)}<small>{day.date.slice(8)}</small></span><span className="balance-tracks"><i style={{ width: `${day.focusSeconds / 60 / maximum * 100}%` }} /><i style={{ width: `${day.socialMinutes / maximum * 100}%` }} /></span><span className="balance-values"><strong>{day.focusSeconds ? shortDuration(day.focusSeconds) : '—'}</strong><small>{day.socialMinutes ? shortDuration(day.socialMinutes * 60) : '—'}</small></span></button>)}</div>
    <p className="insight-caption">{report.bestDay ? <>En çok odak kaydettiğin gün: <strong>{dayName(report.bestDay.date)}, {shortDuration(report.bestDay.focusSeconds)}</strong>.</> : 'Odak kayıtların eklendikçe haftanın öne çıkan günü görünür.'} Gün detayını açmak için bir satıra dokun.</p>
  </article>
}

function AppComparison({ report }: { report: ProductivityReport }) {
  const [showAll, setShowAll] = useState(false)
  const apps = showAll ? report.apps : report.apps.slice(0, 5)
  return <article className="card app-comparison"><div className="card-heading"><div><p className="eyebrow">EKRAN ALIŞKANLIKLARIN</p><h2>Uygulama bazında değişim</h2></div><span className="analysis-badge">{report.apps.length} uygulama</span></div>
    <p className="insight-caption">{periodLabel(report.period.start, report.period.end)} ile {periodLabel(report.period.previousStart, report.period.previousEnd)} karşılaştırılıyor.</p>
    {apps.length ? <><div className="app-comparison-head" aria-hidden="true"><span>Uygulama</span><span>Bu dönem</span><span>Önceki dönem</span><span>Değişim</span></div><ul className="app-comparison-list">{apps.map((app) => <li key={app.name}><div className="app-identity"><span className={`app-initial ${app.social ? 'social' : ''}`} aria-hidden="true">{app.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</span><div><strong>{app.name}</strong><small>{app.social ? 'Sosyal medya' : 'Diğer uygulama'}</small></div></div><div><span className="mobile-cell-label">Bu dönem</span><strong>{app.current ? shortDuration(app.current * 60) : 'Kayıt yok'}</strong><small>{app.currentDays} kayıt günü</small></div><div><span className="mobile-cell-label">Önceki dönem</span><strong>{app.previous ? shortDuration(app.previous * 60) : 'Kayıt yok'}</strong><small>{app.previousDays} kayıt günü</small></div><div className="app-change"><span className="mobile-cell-label">Değişim</span><Trend value={app.change} decreasingIsGood={app.social} /></div></li>)}</ul>{report.apps.length > 5 && <button className="analysis-expand" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'Daha az göster' : `Tüm uygulamaları göster (${report.apps.length})`}</button>}</> : <div className="analysis-empty"><h3>İlk karşılaştırman burada olacak.</h3><p>Günlük bölümünden uygulama sürelerini ekle. İki dönemde de kayıt olduğunda değişimi hesaplayacağız.</p></div>}
    <details className="analysis-method"><summary>Bu karşılaştırma nasıl hesaplanıyor?</summary><p>Yüzde değişimi, kaydedilen toplam sürelerin farkının önceki dönem toplamına bölünmesiyle bulunur. Bir dönemde uygulama kaydı yoksa yüzde hesaplanmaz. Kayıt günü sayıları farklıysa düşüş veya artış eksik girişlerden kaynaklanabilir.</p><p>Uygulama adına göre sosyal medya olarak tanınanlar: {socialAppNames.join(', ')}. Faydalı işaretlediğin kullanım da uygulamanın süresine dahildir. Tanınmayan adlar “Diğer uygulama” altında karşılaştırılır.</p></details>
  </article>
}

function SignalNoiseCard({ sessions, screenEntries, report }: { sessions: FocusSession[]; screenEntries: ScreenTimeEntry[]; report: ProductivityReport }) {
  const metric = useMemo(() => signalNoise(sessions, screenEntries, report.period.start, report.period.end), [sessions, screenEntries, report.period.start, report.period.end])
  const hasData = metric.share !== null
  const ratioLabel = metric.ratio === Infinity ? '∞ : 1' : metric.ratio === null ? '—' : `${metric.ratio.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} : 1`
  return <article className="card signal-card"><div className="card-heading"><div><p className="eyebrow">EKRAN SÜRESİ DAĞILIMI</p><h2>Faydalı ekran payı</h2></div><span className="analysis-badge">{periodLabel(report.period.start, report.period.end)}</span></div>
    {hasData ? <><div className="signal-score"><strong>%{Math.round(metric.share!)}</strong><div><span>faydalı pay</span><p>{ratioLabel} faydalı / pasif</p></div></div><div className="signal-track" aria-label={`Faydalı zaman payı yüzde ${Math.round(metric.share!)}`}><span style={{ width: `${metric.share}%` }} /></div><div className="signal-breakdown"><span><i className="signal" />Faydalı<strong>{shortDuration(metric.signalMinutes * 60)}</strong></span><span><i className="noise" />Pasif<strong>{shortDuration(metric.noiseMinutes * 60)}</strong></span></div></> : <div className="analysis-empty compact"><h3>Oran için sınıflandırılmış zaman gerekli.</h3><p>Günlük bölümünden ekran kayıtlarını faydalı veya pasif olarak sınıflandır.</p></div>}
    <details className="analysis-method"><summary>Oran nasıl hesaplanıyor?</summary><p>Yalnızca kaydedilmiş ekran süresi kullanılır: faydalı / (faydalı + pasif). Aynı süreyi iki kez saymamak için odak oturumları eklenmez. Bu oran genel üretkenliği veya tüm gününü ölçmez. Zorunlu ve sınıflandırılmamış {metric.excludedMinutes ? shortDuration(metric.excludedMinutes * 60) : ''} süre tarafsız bırakılır.</p></details>
  </article>
}

function PeriodWorkChart({ report, onDayClick, targetMinutes }: { report: ProductivityReport; targetMinutes: number; onDayClick: (date: string) => void }) {
  const maximum = Math.max(targetMinutes * 60, ...report.days.map(day => day.focusSeconds))
  const barsRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (barsRef.current) barsRef.current.scrollLeft = barsRef.current.scrollWidth }, [report.period.start, report.period.end])
  return <article className="card work-hours-card">
    <div className="card-heading"><div><p className="eyebrow">ÇALIŞMA SAATLERİ</p><h2>Gün gün birikimin</h2></div><span className="analysis-badge">{report.period.days.length} gün</span></div>
    <div ref={barsRef} className="period-work-bars" role="group" aria-label="Seçili dönemin günlük çalışma saatleri">{report.days.map(day => <button type="button" key={day.date} aria-label={periodLabel(day.date, day.date) + ': ' + durationText(day.focusSeconds) + ' · gün detayını aç'} onClick={() => onDayClick(day.date)}><span className="period-bar-value">{day.focusSeconds ? shortDuration(day.focusSeconds) : '—'}</span><span className="period-bar-track"><i style={{ bottom: (targetMinutes * 60 / maximum * 100) + '%' }} /><b className={day.focusSeconds >= targetMinutes * 60 ? 'target-met' : ''} style={{ height: (day.focusSeconds / maximum * 100) + '%' }} /></span><small>{new Date(day.date + 'T12:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</small></button>)}</div>
    <p className="insight-caption">Çizgi: günlük {shortDuration(targetMinutes * 60)} hedefin. Bir güne dokunarak kayıtlarını düzenle. Açık sayaç dahil edilmez.{report.days.length > 7 && ' Diğer günleri görmek için grafiği yana kaydır.'}</p>
    <div className="work-detail"><div className="work-detail-total"><h3>Konu dağılımı</h3><p>{periodLabel(report.period.start, report.period.end)}</p><strong>{shortDuration(report.focus.seconds)}</strong></div>{report.activities.length ? <ol>{report.activities.map(activity => <li key={activity.title}><span><strong>{activity.title}</strong><small>Toplamın %{Math.round(activity.seconds / report.focus.seconds * 100)}’i</small></span><b>{shortDuration(activity.seconds)}</b></li>)}</ol> : <p className="empty-state">Bu dönemde kayıtlı çalışma yok.</p>}</div>
  </article>
}

export function ProductivityInsights({ sessions, screenEntries, today, targetMinutes, weeklyFocus, onSaveFocus, onDayClick }: DataProps & { targetMinutes: number; weeklyFocus: Record<string, string>; onSaveFocus: (value: string) => Promise<boolean>; onDayClick: (date: string) => void }) {
  const [offset, setOffset] = useState(0)
  const [mode, setMode] = useState<ReportMode>('week')
  const report = useMemo(() => buildProductivityReport(sessions, screenEntries, today, offset, mode), [sessions, screenEntries, today, offset, mode])
  const focusKey = shiftDate(today, -new Date(today + 'T12:00:00Z').getUTCDay())
  const targetDays = report.days.filter(day => day.focusSeconds >= targetMinutes * 60).length
  const periodName = mode === 'week' ? 'hafta' : 'ay'
  const downloadReport = () => {
    const text = weeklyReportText(report) + '\nHedefe ulaşılan gün: ' + targetDays + '/' + report.days.length + ' · günlük hedef ' + shortDuration(targetMinutes * 60)
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'multiplife-' + (mode === 'week' ? 'haftalik' : 'aylik') + '-rapor-' + report.period.start + '.md'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="productivity-section" aria-label="Verimlilik analizi">
    <article className="card productivity-overview"><div className="report-heading"><div className="insight-heading"><span className="analysis-mark"><AnalysisMark /></span><div><p className="eyebrow">VERİMLİLİK ANALİZİ</p><h2>{mode === 'week' ? 'Haftalık raporun' : 'Aylık raporun'}</h2></div></div><button className="report-download" onClick={downloadReport}><span aria-hidden="true">↓</span> Raporu indir</button></div>
      <div className="report-controls"><div className="chart-range-switcher" role="group" aria-label="Rapor dönemi">{([['week', 'Haftalık'], ['month', 'Aylık']] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setOffset(0) }}>{label}</button>)}</div><div className="week-switcher"><button aria-label={'Önceki ' + periodName} onClick={() => setOffset(value => value - 1)}>‹</button><button onClick={() => setOffset(0)} disabled={offset === 0}>Bu {periodName}</button><button aria-label={'Sonraki ' + periodName} disabled={offset === 0} onClick={() => setOffset(value => Math.min(0, value + 1))}>›</button></div></div>
      <div className="report-period" aria-live="polite"><div><strong>{offset === 0 ? 'Bu ' + periodName + ' · bugüne kadar' : offset === -1 ? 'Geçen ' + periodName : 'Geçmiş ' + periodName}</strong><p>{periodLabel(report.period.start, report.period.end)}</p></div></div>
      <div className="productivity-metrics"><div><span>Toplam çalışma</span><strong>{shortDuration(report.focus.seconds)}</strong><small>{report.focus.count} kayıtlı oturum</small></div><div><span>Günlük ortalama</span><strong>{shortDuration(report.dailyAverageSeconds)}</strong><small>{report.days.length} takvim günü üzerinden</small></div><div><span>Hedefe ulaşılan gün</span><strong>{targetDays} / {report.days.length}</strong><small>Günlük {shortDuration(targetMinutes * 60)} hedefine göre</small></div><div><span>Çalışılan gün</span><strong>{report.focus.activeDays} / {report.days.length}</strong><small>Kayıtlı süre bulunan günler</small></div></div>
      <p className="insight-caption">Tüm grafikler ve indirilen rapor aynı dönemi gösterir. Günlük ortalama, kayıt olmayan günler dahil geçen takvim günlerine bölünür; gerçek çalışma yalnızca eklediğin kayıtlar kadar bilinir.</p>
    </article>
    <PeriodWorkChart report={report} targetMinutes={targetMinutes} onDayClick={onDayClick} />
    <details className="report-details"><summary><span>Ekran süresi ve ayrıntılı analizler</span><small>Uygulamalar, odak saatleri ve önceki dönemle karşılaştırma</small></summary><div className="report-details-body">
      <article className="card"><h2>Dönem karşılaştırması</h2><p className="insight-caption">{periodLabel(report.period.start, report.period.end)} ({report.days.length} gün) / {periodLabel(report.period.previousStart, report.period.previousEnd)} ({report.previousDayCount} gün)</p><div className="productivity-metrics"><div><span>Çalışma süresi değişimi</span><Trend value={report.focusChange} /><small>Kaydedilmiş toplam süreler</small></div><div><span>Oturum başına ortalama</span><strong>{report.focus.count ? shortDuration(report.focus.averageSeconds) : '—'}</strong></div><div><span>Sosyal medya</span><strong>{report.screenDays ? shortDuration(report.socialMinutes * 60) : 'Kayıt yok'}</strong><Trend value={report.socialChange} decreasingIsGood /></div><div><span>Ekran kaydı olan gün</span><strong>{report.screenDays}/{report.days.length}</strong><small>Önceki dönem: {report.previousScreenDays}/{report.previousDayCount}</small></div></div><p className="insight-caption">Dönemlerin uzunluğu ve kayıt sayısı farklı olabilir. Yüzdeler toplam süreleri karşılaştırır; eksik kayıtlar değişimi etkiler.</p></article>
      <SignalNoiseCard sessions={sessions} screenEntries={screenEntries} report={report} />
      <div className="productivity-grid"><HourlyRhythm key={report.period.start + mode} report={report} /><WeeklyBalance report={report} onDayClick={onDayClick} /></div>
      <AppComparison key={report.period.start + mode} report={report} />
    </div></details>
    {mode === 'week' && offset === 0 && <WeeklyIntention key={focusKey} initial={weeklyFocus[focusKey] ?? ''} onSave={onSaveFocus} />}
  </section>
}

function WeeklyIntention({ initial, onSave }: { initial: string; onSave: (value: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  useEffect(() => setDraft(initial), [initial])
  return <article className="card weekly-intention"><div><p className="eyebrow">BİR SONRAKİ KÜÇÜK ADIM</p><h2>Bu haftanın odağı</h2><p className="insight-caption">Raporundan bir karar çıkar. Bu hafta neye daha fazla alan açacaksın?</p></div><form onSubmit={async event => { event.preventDefault(); setError(await onSave(draft) ? '' : 'Kaydedilemedi. Girdiğin değer korunuyor.') }}><label htmlFor="weekly-focus" className="visually-hidden-label">Bu haftanın odağı</label><input id="weekly-focus" maxLength={500} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Örn. Her akşam 25 dakika kitap." /><button type="submit">Kaydet</button>{error && <p className="form-error" role="alert">{error}</p>}</form></article>
}
