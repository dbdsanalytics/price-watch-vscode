export interface AiScheduleInput {
  lastAt: number | null
  now: number
  everyHours: number
  manual: boolean
  hasChanges: boolean
}

// Kostenlose OpenRouter-Modelle haben Tageslimits. Automatische Läufe halten
// deshalb den konfigurierten Abstand ein; ein ausdrücklicher Refresh nicht.
export function shouldRunAi({ lastAt, now, everyHours, manual, hasChanges }: AiScheduleInput): boolean {
  if (manual) return true
  if (!hasChanges) return false
  return lastAt === null || now - lastAt >= Math.max(1, everyHours) * 3_600_000
}
