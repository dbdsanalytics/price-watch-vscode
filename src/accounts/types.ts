import type { ProviderId } from "../domain/provider"
export type AccountProvider = ProviderId | "claude-code"
export interface AccountStatus { provider: AccountProvider; state: "available" | "low" | "exhausted" | "unavailable" | "disconnected"; label?: string; remainingUsd?: number; dailyUsd?: number; weeklyUsd?: number; monthlyUsd?: number; resetAt?: string; message?: string }
