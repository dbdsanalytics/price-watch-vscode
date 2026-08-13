import type { AgentAssessment } from "../agents/assessment"
import type { AccountStatus } from "../accounts/types"
import type { PriceChange } from "./changes"
import type { ProviderSnapshot } from "./provider"

export interface AttentionItem {
  kind: "agent" | "account" | "price" | "data"
  severity: "warn" | "info"
  text: string
  view: "agents" | "accounts" | "history" | "models"
}

export interface AttentionInput {
  assessments: AgentAssessment[]
  accounts: AccountStatus[]
  history: PriceChange[]
  snapshots: ProviderSnapshot[]
  refreshError?: string | null
  jumpPercent: number
  now?: number
}

const JUMP_WINDOW_DAYS = 7

/** Ein Fall beim Namen, mehrere als Anzahl — sonst fuellt die Kopfzeile die Seite. */
function summarize(names: string[], one: (name: string) => string, many: (count: number) => string): string | undefined {
  if (!names.length) return undefined
  return names.length === 1 ? one(names[0]) : many(names.length)
}

export function collectAttention(input: AttentionInput): AttentionItem[] {
  const now = input.now ?? Date.now()
  const items: AttentionItem[] = []
  const add = (kind: AttentionItem["kind"], severity: AttentionItem["severity"], view: AttentionItem["view"], text?: string) => {
    if (text) items.push({ kind, severity, view, text })
  }

  // Ein Fehler der Verarbeitung betrifft alle Anbieter und steht deshalb zuerst.
  if (input.refreshError) add("data", "warn", "models", `Aktualisierung fehlgeschlagen: ${input.refreshError}`)
  for (const snapshot of input.snapshots) {
    if (snapshot.error) add("data", "warn", "models", `${snapshot.provider}: ${snapshot.error.message}`)
    else if (snapshot.warning) add("data", "warn", "models", `${snapshot.provider}: ${snapshot.warning}`)
  }

  for (const state of ["exhausted", "low"] as const) {
    const providers = input.accounts.filter((account) => account.state === state).map((account) => account.provider)
    add("account", "warn", "accounts", summarize(providers,
      (name) => state === "exhausted" ? `${name}: Guthaben erschöpft` : `${name}: Guthaben wird knapp`,
      (count) => state === "exhausted" ? `${count} Konten erschöpft` : `${count} Konten werden knapp`))
  }

  const named = (status: AgentAssessment["status"]) => input.assessments.filter((item) => item.status === status).map((item) => item.agent.name)
  add("agent", "warn", "agents", summarize([...named("deprecated"), ...named("unsuitable")],
    (name) => `Agent „${name}" braucht ein anderes Modell`,
    (count) => `${count} Agenten brauchen ein anderes Modell`))

  const cutoff = now - JUMP_WINDOW_DAYS * 86_400_000
  const jumps = input.history.filter((change) => change.at >= cutoff && change.percent !== null && Math.abs(change.percent) >= input.jumpPercent)
  add("price", "info", "history", summarize(jumps.map((change) => change.modelId),
    (name) => `Deutliche Preisänderung bei ${name}`,
    (count) => `${count} deutliche Preisänderungen`))

  add("agent", "info", "agents", summarize(named("alternative-available"),
    (name) => `Für „${name}" gibt es eine günstigere Alternative`,
    (count) => `${count} Agenten haben eine günstigere Alternative`))

  return items
}
