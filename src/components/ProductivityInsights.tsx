import { Icon } from './Icon'
import { useMemo, useState, useEffect } from 'react'
import type { FocusSession, ScreenTimeEntry } from '../lib/domain'
import { buildProductivityReport, buildWorkSeries, changeText, durationText, periodLabel, productivityStreak, shiftDate, shortDuration, signalNoise, socialAppName, socialAppNames, weeklyReportText, type ProductivityReport, type WorkSeriesMode } from '../lib/productivity'

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
  return <article className="card rhythm-card"><div className="card-heading"><div><p className="eyebrow">ODAK RİTMİN</p><h2>En verimli saatlerin</h2></div><span className="analysis-badge">{hourly.measuredCount >= 3 && hourly.measuredDays >= 2 ? 'Ölçülen ritim' : 'İlk gözlemler'}</span></div>
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
  return <article className="card signal-card"><div className="card-heading"><div><p className="eyebrow">SIGNAL-TO-NOISE</p><h2>Faydalı zaman oranı</h2></div><span className="analysis-badge">{periodLabel(report.period.start, report.period.end)}</span></div>
    {hasData ? <><div className="signal-score"><strong>%{Math.round(metric.share!)}</strong><div><span>faydalı pay</span><p>{ratioLabel} signal / noise</p></div></div><div className="signal-track" aria-label={`Faydalı zaman payı yüzde ${Math.round(metric.share!)}`}><span style={{ width: `${metric.share}%` }} /></div><div className="signal-breakdown"><span><i className="signal" />Faydalı<strong>{shortDuration(metric.signalMinutes * 60)}</strong></span><span><i className="noise" />Faydasız<strong>{shortDuration(metric.noiseMinutes * 60)}</strong></span></div></> : <div className="analysis-empty compact"><h3>Oran için sınıflandırılmış zaman gerekli.</h3><p>Odak kayıtları faydalı; “pasif” ekran kayıtları faydasız zaman olarak hesaplanır.</p></div>}
    <details className="analysis-method"><summary>Oran nasıl hesaplanıyor?</summary><p>Faydalı zaman = odak oturumları + faydalı ekran süresi. Faydasız zaman = pasif ekran süresi. Yüzde, faydalı / (faydalı + faydasız) formülüyle hesaplanır. Zorunlu ve sınıflandırılmamış {metric.excludedMinutes ? shortDuration(metric.excludedMinutes * 60) : ''} süre tarafsız bırakılır.</p></details>
  </article>
}

function StreakCard({ activeDates, today }: { activeDates: Set<string>; today: string }) {
  const streak = useMemo(() => productivityStreak(activeDates, today), [activeDates, today])
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6))
  return <article className="card streak-card"><div className="card-heading"><div><p className="eyebrow">SERİ SİSTEMİ</p><h2>Üretken gün zincirin</h2></div><span className="streak-flame"><Icon name="flame" size={26} /></span></div>
    <div className="streak-main"><strong>{streak.current}</strong><div><span>günlük seri</span><p>{streak.activeToday ? 'Bugünün halkası tamamlandı.' : streak.current ? 'Bugün bir odak veya alışkanlık kaydı zinciri uzatır.' : 'Bugünkü ilk faydalı kaydın seriyi başlatır.'}</p></div></div>
    <div className="streak-week" aria-label="Son yedi üretken gün">{days.map((date) => <span key={date} className={activeDates.has(date) ? 'active' : ''} title={periodLabel(date, date)}><i>{new Date(`${date}T12:00:00Z`).toLocaleDateString('tr-TR', { weekday: 'narrow', timeZone: 'UTC' })}</i><b>{activeDates.has(date) ? '✓' : ''}</b></span>)}</div>
    <div className="streak-stats"><span>En uzun seri<strong>{streak.best} gün</strong></span><span>Sonraki eşik<strong>{streak.nextMilestone} gün</strong></span></div>
    <p className="insight-caption">Bir günde en az bir odak oturumu veya tamamlanmış minimum/ideal alışkanlık, o günü üretken gün yapar. Bugün boşsa seri gece bitmeden bozulmuş sayılmaz.</p>
  </article>
}

function WorkHoursChart({ sessions, today, onDayClick }: { sessions: FocusSession[]; today: string; onDayClick: (date: string) => void }) {
  const [mode, setMode] = useState<WorkSeriesMode>('day')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const series = useMemo(() => buildWorkSeries(sessions, today, mode), [sessions, today, mode])
  const selected = series.find((item) => item.key === selectedKey) ?? series.at(-1)!
  const maximum = Math.max(1, ...series.map((item) => item.seconds))
  const setRange = (next: WorkSeriesMode) => { setMode(next); setSelectedKey(null) }
  return <article className="card work-hours-card"><div className="report-heading"><div><p className="eyebrow">ÇALIŞMA SAATLERİ</p><h2>Günlük, haftalık ve aylık birikim</h2></div><div className="chart-range-switcher" role="group" aria-label="Grafik dönemi">{([['day', 'Günlük'], ['week', 'Haftalık'], ['month', 'Aylık']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setRange(value)}>{label}</button>)}</div></div>
    <div className={`work-bars ${mode}`} role="list" aria-label={`${mode === 'day' ? 'Günlük' : mode === 'week' ? 'Haftalık' : 'Aylık'} çalışma saatleri`}>{series.map((item, index) => <button type="button" role="listitem" key={index} aria-pressed={selected.key === item.key} aria-label={`${item.label}: ${durationText(item.seconds)}`} onClick={() => { setSelectedKey(item.key); if (mode === 'day') onDayClick(item.key) }}><span className="work-bar-value">{item.seconds ? shortDuration(item.seconds) : ''}</span><i><b style={{ height: `${Math.max(item.seconds ? 4 : 0, item.seconds / maximum * 100)}%` }} /></i><small>{item.shortLabel}</small></button>)}</div>
    <div className="work-detail"><div className="work-detail-total"><span>{selected.label}</span><strong>{selected.seconds ? durationText(selected.seconds) : 'Kayıt yok'}</strong><p>{selected.activities.length ? `${selected.activities.length} farklı çalışma alanı` : 'Bu dönemde odak kaydı bulunmuyor.'}</p></div>{selected.activities.length > 0 && <ol>{selected.activities.slice(0, 6).map((activity) => <li key={activity.title}><span><strong>{activity.title}</strong><small>Toplamın %{Math.round(activity.seconds / selected.seconds * 100)}’i</small></span><b>{shortDuration(activity.seconds)}</b></li>)}</ol>}</div>
    <p className="insight-caption">Bir sütuna tıklayarak o dönemde Kitap, DSA, Coding gibi etkinliklere ayırdığın toplam süreyi görebilirsin. Manuel ve dosyadan aktarılan odak kayıtları dahildir.</p>
  </article>
}

export function ProductivityInsights({ sessions, screenEntries, today, activeDates, weeklyFocus, onSaveFocus, onDayClick }: DataProps & { activeDates: Set<string>; weeklyFocus: Record<string, string>; onSaveFocus: (value: string) => Promise<boolean>; onDayClick: (date: string) => void }) {
  const [offset, setOffset] = useState(0)
  const report = useMemo(() => buildProductivityReport(sessions, screenEntries, today, offset), [sessions, screenEntries, today, offset])
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const focusKey = shiftDate(today, -weekday)
  const comparison = report.apps.find((app) => app.name === 'Instagram' && app.change !== null) ?? report.apps.find((app) => app.social && app.change !== null)
  const downloadReport = () => {
    const text = weeklyReportText(report)
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `momentum-haftalik-rapor-${report.period.start}.md`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="productivity-section" aria-label="Verimlilik analizi">
    <article className="card productivity-overview"><div className="report-heading"><div className="insight-heading"><span className="analysis-mark"><AnalysisMark /></span><div><p className="eyebrow">VERİMLİLİK ANALİZİ</p><h2>Haftalık raporun</h2></div></div><button className="report-download" onClick={downloadReport}><span aria-hidden="true">↓</span> Raporu indir</button></div>
      <div className="report-period"><div><strong>{offset === 0 ? 'Bu hafta · bugüne kadar' : offset === -1 ? 'Geçen hafta' : 'Geçmiş hafta'}</strong><p>{periodLabel(report.period.start, report.period.end)}</p></div><div className="week-switcher"><button aria-label="Önceki hafta" onClick={() => setOffset(offset - 1)}>‹</button><button onClick={() => setOffset(0)} disabled={offset === 0}>Bu hafta</button><button aria-label="Sonraki hafta" disabled={offset === 0} onClick={() => setOffset(offset + 1)}>›</button></div></div>
      <div className="productivity-metrics"><div><span>Toplam odak</span><strong>{shortDuration(report.focus.seconds)}</strong><Trend value={report.focusChange} /></div><div><span>Ortalama odak</span><strong>{report.focus.count ? shortDuration(report.focus.averageSeconds) : '—'}</strong><small>{report.focus.count} kayıtlı oturum</small></div><div><span>Sosyal medya</span><strong>{report.socialMinutes ? shortDuration(report.socialMinutes * 60) : '—'}</strong><Trend value={report.socialChange} decreasingIsGood /></div><div><span>Odaklandığın gün</span><strong>{report.focus.activeDays}<em> / {report.period.days.length}</em></strong><small>Odak kaydı bulunan günler</small></div></div>
      <div className="weekly-narrative"><span aria-hidden="true">✦</span><p>{comparison ? <><strong>{comparison.name}</strong> kullanımın önceki haftanın aynı günlerine göre <strong>{changeText(comparison.change).toLocaleLowerCase('tr-TR')}</strong>.</> : report.focus.count ? <>Bu dönemde <strong>{durationText(report.focus.seconds)}</strong> odak kaydettin. Oturum başına ortalaman <strong>{durationText(report.focus.averageSeconds)}</strong>.</> : 'Küçük kayıtlar, zamanla anlamlı bir resme dönüşür. İlk odak veya ekran süresi kaydınla başlayabilirsin.'}</p></div>
      <p className="report-coverage">Ekran kaydı: bu dönem <strong>{report.screenDays}/{report.period.days.length} gün</strong>, önceki dönem <strong>{report.previousScreenDays}/{report.period.days.length} gün</strong>. {offset === 0 ? 'Bugün devam ediyor; önceki haftanın aynı günleriyle karşılaştırılır.' : 'İki tam hafta karşılaştırılır.'} Kayıt olmayan günler sıfır kullanım anlamına gelmez.</p>
      <details className="analysis-method"><summary>Odak ortalamasına neler dahil?</summary><p>Seçili dönemde kaydedilen odak süresi oturum sayısına bölünür. Manuel kayıtlar dahildir; açık zamanlayıcı dahil değildir. Gece yarısında iki güne bölünen aynı zamanlayıcı tek oturum sayılır. Dönem sınırını aşan oturumun yalnızca bu dönemdeki süresi hesaba katılır.</p></details>
    </article>
    <div className="product-systems-grid"><SignalNoiseCard sessions={sessions} screenEntries={screenEntries} report={report} /><StreakCard activeDates={activeDates} today={today} /></div>
    <WorkHoursChart sessions={sessions} today={today} onDayClick={onDayClick} />
    <div className="productivity-chart-grid"><HourlyRhythm report={report} /><WeeklyBalance report={report} onDayClick={onDayClick} /></div>
    <AppComparison key={report.period.start} report={report} />
    {offset === 0 && <WeeklyIntention key={focusKey} initial={weeklyFocus[focusKey] ?? ''} onSave={onSaveFocus} />}
  </section>
}

function WeeklyIntention({ initial, onSave }: { initial: string; onSave: (value: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  useEffect(() => setDraft(initial), [initial])
  return <article className="card weekly-intention"><div><p className="eyebrow">BİR SONRAKİ KÜÇÜK ADIM</p><h2>Bu haftanın odağı</h2><p className="insight-caption">Raporundan bir karar çıkar. Bu hafta neye daha fazla alan açacaksın?</p></div><form onSubmit={async event => { event.preventDefault(); setError(await onSave(draft) ? '' : 'Kaydedilemedi. Girdiğin değer korunuyor.') }}><label htmlFor="weekly-focus" className="visually-hidden-label">Bu haftanın odağı</label><input id="weekly-focus" maxLength={500} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Örn. Her akşam 25 dakika kitap." /><button type="submit">Kaydet</button>{error && <p className="form-error" role="alert">{error}</p>}</form></article>
}
