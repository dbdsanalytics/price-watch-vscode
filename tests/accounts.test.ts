import { expect, test } from "bun:test"
import { parseOpenRouterKeyStatus, unavailableAccount } from "../src/accounts/openrouter"

test("maps OpenRouter usage windows", () => {
  expect(parseOpenRouterKeyStatus({ data: { label: "sk-or-abc...xyz", limit: 100, limit_remaining: 74.5, usage: 25.5, usage_daily: 1, usage_weekly: 5, usage_monthly: 20 } })).toMatchObject({ state: "available", remainingUsd: 74.5, dailyUsd: 1, weeklyUsd: 5, monthlyUsd: 20 })
})

test("missing provider usage is unavailable, never zero", () => {
  expect(unavailableAccount("opencode-go").state).toBe("unavailable")
})
