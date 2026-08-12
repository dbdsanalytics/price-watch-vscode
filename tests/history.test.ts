import { expect, test } from "bun:test"
import { mergeHistory } from "../src/domain/history"

test("deduplicates and removes events older than ninety days", () => {
  const now = Date.UTC(2026, 7, 12)
  const recent = { id: "recent", at: now - 1000, provider: "openrouter" as const, modelId: "x", dimension: "input" as const, previous: 1, current: 2, percent: 100 }
  const old = { ...recent, id: "old", at: now - 91 * 86400000 }
  expect(mergeHistory([old, recent], [recent], now)).toEqual([recent])
})
