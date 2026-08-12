import { expect, test } from "bun:test"
import { parseOpenRouterManagement } from "../src/accounts/openrouter-management"

test("combines account credits with per-key usage and limits", () => {
  const result = parseOpenRouterManagement(
    { data: { total_credits: 100.5, total_usage: 25.75 } },
    { data: [{ hash: "abc123", name: "Coding", label: "sk-or-v1-abc...123", disabled: false, limit: 50, limit_remaining: 31.5, limit_reset: "monthly", usage: 18.5, usage_daily: 1.25, usage_weekly: 4.5, usage_monthly: 12.5, expires_at: null }] },
  )
  expect(result).toMatchObject({ totalCreditsUsd: 100.5, totalUsageUsd: 25.75, remainingCreditsUsd: 74.75 })
  expect(result.keys[0]).toMatchObject({ hash: "abc123", name: "Coding", state: "active", limitUsd: 50, remainingUsd: 31.5, reset: "monthly", dailyUsd: 1.25, weeklyUsd: 4.5, monthlyUsd: 12.5 })
})

test("keeps missing limits distinct from unlimited and marks disabled keys", () => {
  const result = parseOpenRouterManagement(
    { data: { total_credits: 10, total_usage: 2 } },
    { data: [{ hash: "disabled", label: "Disabled", disabled: true, limit: null, limit_remaining: null, limit_reset: null, usage: 2, usage_daily: 0, usage_weekly: 2, usage_monthly: 2 }] },
  )
  expect(result.keys[0]).toMatchObject({ state: "disabled", limitUsd: undefined, remainingUsd: undefined, reset: null })
})
