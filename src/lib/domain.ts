import type { TrackedScreenKind } from './analytics'

export type Area = string
export type HabitStatus = 'minimum' | 'ideal' | 'partial'
export type HabitEntry = { status: HabitStatus; amount?: number }
export type Habit = { id: string; icon: string; name: string; area: Area; minimum: string; ideal: string; archived?: boolean; scheduleDays?: number[]; pausedUntil?: string }
export type FocusCategory = { id: string; title: string; area: Area; icon: string; archived?: boolean }
export type FocusSegment = { startedAt: string; endedAt: string; offsetMinutes: number }
export type FocusSession = { id: string; title: string; area: Area; seconds: number; startedAt: string; date: string; source?: 'timer' | 'manual'; timerSessionId?: string; segments?: FocusSegment[]; intention?: string; note?: string }
export type DailyPlanItem = { id: string; text: string; completed: boolean; carriedFrom?: string }
export type DailyReflection = { good: string; wasted: string; tomorrow: string }
export type GoalUnit = 'saat' | 'kelime' | 'sayfa' | 'adet'
export type GoalMilestone = { id: string; title: string; target: number }
export type Goal = { id: string; title: string; area: Area; unit: GoalUnit; target: number; deadline?: string; activity: string; manualProgress: number; milestones?: GoalMilestone[] }
export type ReminderSettings = { enabled: boolean; planTime: string; habitsTime: string; reflectionTime: string; weeklyEnabled: boolean; weeklyTime: string }
export type ThemePreference = 'dark' | 'light' | 'system'
export type TimerPreset = { focusMinutes: number; breakMinutes: number; rounds: number; autoStartBreaks: boolean }
export type UserSettings = { name: string; dailyFocusMinutes: number; onboardingComplete: boolean; compactToday: boolean; reminders: ReminderSettings; reduceMotion?: boolean; celebrationSound?: boolean; theme?: ThemePreference; timerPreset?: TimerPreset }
export type CalendarBlock = { id: string; title: string; area: Area; date: string; startMinute: number; minutes: number }
export type RecentEntry = { title: string; area: Area; minutes: number }
export type ExperienceState = { recentEntries: RecentEntry[]; seenMilestones: string[] }
export type WeeklyReview = { wins: string; friction: string; lesson: string; nextFocus: string; createdAt: string }

export type ScreenTimeSource = 'manual' | 'screenshot' | 'legacy'

export type ScreenTimeEntry = {
  id: string
  date: string
  app: string
  minutes: number
  kind: TrackedScreenKind
  source: ScreenTimeSource
  createdAt: string
  screenshotHash?: string
}

export type AppState = {
  habits: Habit[]
  focusCategories: FocusCategory[]
  sessions: FocusSession[]
  habitLog: Record<string, Record<string, HabitEntry>>
  dailyPlans: Record<string, DailyPlanItem[]>
  reflections: Record<string, DailyReflection>
  goals: Goal[]
  weeklyFocus: Record<string, string>
  weeklyReviews?: Record<string, WeeklyReview>
  screenTimeEntries: ScreenTimeEntry[]
  settings: UserSettings
  calendarBlocks?: CalendarBlock[]
  experience?: ExperienceState
}
