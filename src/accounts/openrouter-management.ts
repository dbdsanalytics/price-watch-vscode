import type { OpenRouterManagedKey, OpenRouterManagementStatus } from "./types"

interface CreditsBody { data: { total_credits: number; total_usage: number } }
interface KeyBody { data: Array<{ hash: string; name?: string; label?: string; disabled: boolean; limit?: number | null; limit_remaining?: number | null; limit_reset?: "daily" | "weekly" | "monthly" | null; usage?: number; usage_daily?: number; usage_weekly?: number; usage_monthly?: number; expires_at?: string | null }> }

export function parseOpenRouterManagement(credits: CreditsBody, keys: KeyBody): OpenRouterManagementStatus {
  const now = Date.now()
  const normalized: OpenRouterManagedKey[] = keys.data.map((key) => ({
    hash: key.hash,
    name: key.name || key.label || "API-Key",
    label: key.label,
    state: key.disabled ? "disabled" : key.expires_at && Date.parse(key.expires_at) <= now ? "expired" : "active",
    limitUsd: key.limit ?? undefined,
    remainingUsd: key.limit_remaining ?? undefined,
    reset: key.limit_reset ?? null,
    usageUsd: key.usage ?? 0,
    dailyUsd: key.usage_daily ?? 0,
    weeklyUsd: key.usage_weekly ?? 0,
    monthlyUsd: key.usage_monthly ?? 0,
    expiresAt: key.expires_at ?? undefined,
  }))
  return { state: "available", totalCreditsUsd: credits.data.total_credits, totalUsageUsd: credits.data.total_usage, remainingCreditsUsd: Math.max(0, credits.data.total_credits - credits.data.total_usage), keys: normalized }
}

async function getJson<T>(url: string, key: string): Promise<T> {
  const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`OpenRouter Management HTTP ${response.status}`)
  return response.json() as Promise<T>
}

export async function fetchOpenRouterManagement(key: string): Promise<OpenRouterManagementStatus> {
  const [credits, keys] = await Promise.all([
    getJson<CreditsBody>("https://openrouter.ai/api/v1/credits", key),
    getJson<KeyBody>("https://openrouter.ai/api/v1/keys", key),
  ])
  return parseOpenRouterManagement(credits, keys)
}
