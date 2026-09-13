import { type FormEvent, useMemo, useState } from 'react'
import type { AppState, FocusCategory, Habit, UserSettings } from '../lib/domain'
import { AccessibleModal } from './AccessibleModal'
import { AreaIcon } from './Icon'
import { NumberInput } from './NumberInput'

type StarterTemplate = {
  id: string
  title: string
  description: string
  habits: Habit[]
  focusCategories: FocusCategory[]
}

const templates: StarterTemplate[] = [
  {
    id: 'balanced', title: 'Dengeli başlangıç', description: 'Odak, öğrenme ve sağlık için sade bir temel.',
    habits: [
      { id: 'starter-reading', icon: '📚', name: 'Okuma', area: 'Öğrenme', minimum: '5 sayfa', ideal: '20 sayfa' },
      { id: 'starter-movement', icon: '🏃', name: 'Hareket', area: 'Sağlık', minimum: '10 dakika', ideal: '30 dakika' },
      { id: 'starter-plan', icon: '🧭', name: 'Günü planla', area: 'Kişisel', minimum: '1 öncelik', ideal: '3 öncelik' },
    ],
    focusCategories: [
      { id: 'starter-deep-work', title: 'Derin çalışma', area: 'Kariyer', icon: '🎯' },
      { id: 'starter-learning', title: 'Öğrenme', area: 'Öğrenme', icon: '🧠' },
      { id: 'starter-reading-focus', title: 'Okuma', area: 'Kişisel', icon: '📚' },
    ],
  },
  {
    id: 'student', title: 'Öğrenci', description: 'Ders, sınav ve araştırma ritmi.',
    habits: [
      { id: 'student-review', icon: '📝', name: 'Ders tekrarı', area: 'Eğitim', minimum: '10 dakika', ideal: '45 dakika' },
      { id: 'student-questions', icon: '✅', name: 'Soru çözümü', area: 'Eğitim', minimum: '5 soru', ideal: '30 soru' },
      { id: 'student-reading', icon: '📚', name: 'Okuma', area: 'Öğrenme', minimum: '5 sayfa', ideal: '20 sayfa' },
    ],
    focusCategories: [
      { id: 'student-course', title: 'Ders çalışma', area: 'Eğitim', icon: '🎓' },
      { id: 'student-exam', title: 'Sınav hazırlığı', area: 'Eğitim', icon: '📝' },
      { id: 'student-research', title: 'Araştırma', area: 'Öğrenme', icon: '🔎' },
    ],
  },
  {
    id: 'developer', title: 'Yazılımcı', description: 'Üretim, öğrenme ve kod kalitesi odağı.',
    habits: [
      { id: 'dev-code', icon: '💻', name: 'Kod yaz', area: 'Kariyer', minimum: '15 dakika', ideal: '90 dakika' },
      { id: 'dev-learn', icon: '🧠', name: 'Teknik öğrenme', area: 'Öğrenme', minimum: '10 dakika', ideal: '30 dakika' },
      { id: 'dev-review', icon: '🔍', name: 'Günün kodunu gözden geçir', area: 'Kariyer', minimum: '1 değişiklik', ideal: 'Tüm değişiklikler' },
    ],
    focusCategories: [
      { id: 'dev-build', title: 'Geliştirme', area: 'Kariyer', icon: '💻' },
      { id: 'dev-review-focus', title: 'Kod inceleme', area: 'Kariyer', icon: '🔍' },
      { id: 'dev-docs', title: 'Dokümantasyon', area: 'Öğrenme', icon: '📖' },
    ],
  },
  {
    id: 'wellbeing', title: 'İyi yaşam', description: 'Enerji, hareket ve sakinlik odağı.',
    habits: [
      { id: 'well-move', icon: '🏃', name: 'Hareket', area: 'Sağlık', minimum: '10 dakika', ideal: '45 dakika' },
      { id: 'well-water', icon: '💧', name: 'Su iç', area: 'Sağlık', minimum: '4 bardak', ideal: '8 bardak' },
      { id: 'well-mindful', icon: '🧘', name: 'Bilinçli mola', area: 'Kişisel', minimum: '2 dakika', ideal: '10 dakika' },
    ],
    focusCategories: [
      { id: 'well-personal', title: 'Kişisel gelişim', area: 'Kişisel', icon: '🌱' },
      { id: 'well-movement', title: 'Egzersiz', area: 'Sağlık', icon: '🏃' },
      { id: 'well-creative', title: 'Yaratıcı zaman', area: 'Yaratıcılık', icon: '✨' },
    ],
  },
]

export function OnboardingModal({ state, onComplete }: { state: AppState; onComplete: (settings: UserSettings, habits: Habit[], focusCategories: FocusCategory[]) => void }) {
  const [name, setName] = useState(state.settings.name)
  const [minutes, setMinutes] = useState(String(state.settings.dailyFocusMinutes))
  const [templateId, setTemplateId] = useState(templates[0].id)
  const [error, setError] = useState('')
  const template = useMemo(() => templates.find(item => item.id === templateId) ?? templates[0], [templateId])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const target = Number(minutes)
    if (!Number.isFinite(target) || target < 15 || target > 1_440) { setError('Günlük odak hedefi 15–1440 dakika arasında olmalı.'); return }
    onComplete({ ...state.settings, name: name.trim(), dailyFocusMinutes: Math.round(target), onboardingComplete: true }, template.habits, template.focusCategories)
  }
  return <div className="onboarding-backdrop"><AccessibleModal label="Momentum ilk kurulumu" className="modal-shell" dismissible={false}><form className="card onboarding-modal" onSubmit={submit}><div className="onboarding-intro"><span className="brand-mark">M</span><div><p className="eyebrow">İLK KURULUM</p><h2>Momentum’unu kendine göre kur.</h2><p>Bir başlangıç seç; her şeyi daha sonra değiştirebilirsin.</p></div></div><div className="onboarding-profile"><label>Adın (isteğe bağlı)<input autoFocus value={name} maxLength={60} onChange={(event) => { setName(event.target.value); setError('') }} placeholder="Sana nasıl hitap edelim?" autoComplete="name" /></label><label>Günlük odak hedefi<NumberInput unit="dakika" min="15" max="1440" step="1" value={minutes} onChange={(event) => { setMinutes(event.target.value); setError('') }} /></label></div><fieldset><legend>Başlangıç düzenin</legend><div className="setup-options setup-templates">{templates.map(item => <button type="button" className={templateId === item.id ? 'selected' : ''} aria-pressed={templateId === item.id} key={item.id} onClick={() => { setTemplateId(item.id); setError('') }}><strong>{item.title}</strong><small>{item.description}</small></button>)}</div></fieldset><div className="onboarding-preview"><div><span>Odak alanları</span>{template.focusCategories.map(category => <small key={category.id}><AreaIcon area={category.area} />{category.title}</small>)}</div><div><span>Başlangıç alışkanlıkları</span>{template.habits.map(habit => <small key={habit.id}><AreaIcon area={habit.area} />{habit.name}</small>)}</div></div>{error && <p className="form-error onboarding-error" role="alert">{error}</p>}<button className="timer-button" type="submit">Momentum’u başlat</button></form></AccessibleModal></div>
}
