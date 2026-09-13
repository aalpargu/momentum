import type { AppState, Area } from './domain.ts'

export const defaultAreas: Area[] = ['Öğrenme', 'Kariyer', 'Sağlık', 'Kişisel', 'Yaratıcılık']

export function normalizeArea(value: unknown, fallback: Area = 'Kişisel'): Area {
  const area = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return area && area.length <= 40 ? area : fallback
}

export function collectAreas(state: Pick<AppState, 'habits' | 'focusCategories' | 'sessions' | 'goals' | 'calendarBlocks'>): Area[] {
  return [...new Set([
    ...defaultAreas,
    ...state.habits.map(item => normalizeArea(item.area)),
    ...state.focusCategories.map(item => normalizeArea(item.area)),
    ...state.sessions.map(item => normalizeArea(item.area)),
    ...state.goals.map(item => normalizeArea(item.area)),
    ...(state.calendarBlocks ?? []).map(item => normalizeArea(item.area)),
  ])]
}

export function areaPaletteIndex(area: Area) {
  let hash = 0
  for (const character of area.normalize('NFKD')) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0
  return Math.abs(hash) % 5
}
