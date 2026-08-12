import type { AccountProvider, AccountStatus } from "./types"

export function unavailableAccount(provider: AccountProvider, message = "Nicht automatisch abrufbar"): AccountStatus { return { provider, state: "unavailable", message } }
export function parseOpenRouterKeyStatus(body: { data: { label?: string; limit?: number | null; limit_remaining?: number | null; usage?: number; usage_daily?: number; usage_weekly?: number; usage_monthly?: number } }): AccountStatus {
  const remaining = body.data.limit_remaining ?? undefined
  return { provider: "openrouter", state: remaining === 0 ? "exhausted" : remaining !== undefined && body.data.limit && remaining / body.data.limit < 0.15 ? "low" : "available", label: body.data.label, remainingUsd: remaining, dailyUsd: body.data.usage_daily, weeklyUsd: body.data.usage_weekly, monthlyUsd: body.data.usage_monthly }
}
export async function fetchOpenRouterAccount(key: string): Promise<AccountStatus> {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`OpenRouter-Konto HTTP ${response.status}`)
  return parseOpenRouterKeyStatus(await response.json() as Parameters<typeof parseOpenRouterKeyStatus>[0])
}
