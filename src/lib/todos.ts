import type { DailyPlanItem } from './domain'

/** Keep task identity when carrying work so its saved sessions stay attached. */
export function carryableTasks(previous: DailyPlanItem[], current: DailyPlanItem[]) {
  const ids = new Set(current.map(item => item.id))
  const texts = new Set(current.map(item => item.text.trim().toLocaleLowerCase('tr-TR')))
  return previous.filter(item => {
    const text = item.text.trim().toLocaleLowerCase('tr-TR')
    if (item.completed || ids.has(item.id) || texts.has(text)) return false
    ids.add(item.id); texts.add(text)
    return true
  })
}
