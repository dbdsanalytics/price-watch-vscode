import type { ProviderId } from "../domain/provider"
export type AccountProvider = ProviderId | "claude-code"
export interface AccountStatus { provider: AccountProvider; state: "available" | "low" | "exhausted" | "unavailable" | "disconnected"; label?: string; remainingUsd?: number; dailyUsd?: number; weeklyUsd?: number; monthlyUsd?: number; resetAt?: string; message?: string }

export interface OpenRouterManagedKey {
  hash: string
  name: string
  label?: string
  state: "active" | "disabled" | "expired"
  limitUsd?: number
  remainingUsd?: number
  reset: "daily" | "weekly" | "monthly" | null
  usageUsd: number
  dailyUsd: number
  weeklyUsd: number
  monthlyUsd: number
  expiresAt?: string
}

export interface OpenRouterManagementStatus {
  state: "available" | "unavailable"
  totalCreditsUsd: number
  totalUsageUsd: number
  remainingCreditsUsd: number
  keys: OpenRouterManagedKey[]
  message?: string
}
