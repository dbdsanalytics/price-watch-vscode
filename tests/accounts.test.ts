import { expect, test } from "bun:test"
import { parseOpenRouterKeyStatus, unavailableAccount } from "../src/accounts/openrouter"
import { panelHtml } from "../src/panel"

test("maps OpenRouter usage windows", () => {
  expect(parseOpenRouterKeyStatus({ data: { label: "sk-or-abc...xyz", limit: 100, limit_remaining: 74.5, usage: 25.5, usage_daily: 1, usage_weekly: 5, usage_monthly: 20 } })).toMatchObject({ state: "available", remainingUsd: 74.5, dailyUsd: 1, weeklyUsd: 5, monthlyUsd: 20 })
})

test("missing provider usage is unavailable, never zero", () => {
  expect(unavailableAccount("opencode-go").state).toBe("unavailable")
})

test("connected OpenRouter account without a key limit is described concretely", () => {
  const account = parseOpenRouterKeyStatus({ data: { label: "sk-or-v1-example", limit: null, limit_remaining: null, usage_daily: 1.25, usage_weekly: 5.5, usage_monthly: 12 } })
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [account], ai: null, updatedAt: 0 })
  expect(html).toContain("Verbunden · kein festes Schlüssellimit")
  expect(html).toContain("Heute 1,25 $")
  expect(html).not.toContain(">Unklar<")
})
