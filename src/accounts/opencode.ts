import type { AccountStatus } from "./types"

/** Ab diesem Verbrauch eines Fensters wird gewarnt, bevor es zuschlägt. */
const WARN_PERCENT = 85

interface Window { status?: unknown; percent?: unknown; resetsAt?: unknown }
interface UsageBody { usage?: { rolling?: Window; weekly?: Window; monthly?: Window } }

const windows = [
  { key: "rolling", label: "5 Std" },
  { key: "weekly", label: "Woche" },
  { key: "monthly", label: "Monat" },
] as const

/**
 * OpenCode Go ist ein Abo mit Limits in Dollarwerten, die in drei Fenstern
 * laufen. Die API nennt nur Prozentwerte, keine Beträge — deshalb bleibt
 * `remainingUsd` leer und der Zustand ergibt sich aus dem engsten Fenster.
 */
export function parseOpenCodeGoUsage(body: UsageBody): AccountStatus {
  const usage = body.usage
  const read = windows
    .map(({ key, label }) => {
      const window = usage?.[key]
      const percent = window?.percent
      if (typeof percent !== "number" || !Number.isFinite(percent)) return null
      return { label, percent, limited: window?.status === "rate-limited", resetsAt: typeof window?.resetsAt === "string" ? window.resetsAt : undefined }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (!read.length) throw new Error("OpenCode Go: Antwort enthält keine Nutzungsdaten")

  const binding = read.filter((item) => item.limited).sort((a, b) => b.percent - a.percent)[0]
    ?? read.slice().sort((a, b) => b.percent - a.percent)[0]
  const state: AccountStatus["state"] = read.some((item) => item.limited)
    ? "exhausted"
    : read.some((item) => item.percent >= WARN_PERCENT)
      ? "low"
      : "available"
  return {
    provider: "opencode-go",
    state,
    resetAt: binding.resetsAt,
    message: read.map((item) => `${item.label} ${item.percent} %`).join(" · "),
  }
}

export async function fetchOpenCodeGoAccount(key: string): Promise<AccountStatus> {
  const response = await fetch("https://opencode.ai/zen/go/v1/usage", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`OpenCode Go HTTP ${response.status}`)
  return parseOpenCodeGoUsage(await response.json() as UsageBody)
}
