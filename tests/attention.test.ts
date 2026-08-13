import { expect, test } from "bun:test"
import { collectAttention } from "../src/domain/attention"
import type { AgentAssessment } from "../src/agents/assessment"
import type { ModelOffer } from "../src/domain/model"

const NOW = Date.UTC(2026, 7, 13)
const agent = (name: string, status: AgentAssessment["status"]): AgentAssessment => ({ agent: { name, description: "", model: "m", tools: [], prompt: "" }, status, reason: "r" })
const change = (percent: number, daysAgo: number) => ({ id: `c${percent}-${daysAgo}`, at: NOW - daysAgo * 86_400_000, provider: "opencode-zen" as const, modelId: "m", dimension: "input" as const, previous: 1, current: 2, percent })
const empty = { assessments: [], accounts: [], history: [], snapshots: [], jumpPercent: 20, now: NOW }

test("meldet nichts, wenn alles in Ordnung ist", () => {
  expect(collectAttention({ ...empty, assessments: [agent("a", "suitable")] })).toEqual([])
})

test("nennt einen einzelnen Fall beim Namen", () => {
  const [item] = collectAttention({ ...empty, assessments: [agent("reviewer", "deprecated")] })
  expect(item.text).toContain("reviewer")
  expect(item).toMatchObject({ kind: "agent", severity: "warn", view: "agents" })
})

// Bei vielen Treffern wuerde die Kopfzeile sonst die Seite fuellen.
test("fasst gleichartige Faelle zu einer Zeile zusammen", () => {
  const items = collectAttention({ ...empty, assessments: [agent("a", "deprecated"), agent("b", "deprecated"), agent("c", "deprecated")] })
  expect(items).toHaveLength(1)
  expect(items[0].text).toContain("3")
})

test("meldet knappe und erschoepfte Konten", () => {
  const items = collectAttention({ ...empty, accounts: [{ provider: "opencode-go", state: "exhausted" }, { provider: "openrouter", state: "low" }] })
  expect(items).toHaveLength(2)
  expect(items[0].text).toContain("opencode-go")
  expect(items.every((item) => item.view === "accounts")).toBe(true)
})

test("meldet Preisspruenge oberhalb der Schwelle", () => {
  const items = collectAttention({ ...empty, history: [change(35, 1), change(5, 1)] })
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ kind: "price", severity: "info", view: "history" })
})

test("laesst Preisspruenge aelter als sieben Tage aus", () => {
  expect(collectAttention({ ...empty, history: [change(35, 9)] })).toEqual([])
})

test("meldet Anbieterfehler und Waechterwarnungen", () => {
  const items = collectAttention({ ...empty,
    refreshError: "Alles kaputt",
    snapshots: [{ provider: "opencode-zen", offers: [] as ModelOffer[], checkedAt: 1, stale: true, error: { kind: "network", message: "offline" } },
      { provider: "opencode-go", offers: [] as ModelOffer[], checkedAt: 1, stale: false, warning: "Nur 42 statt 61" }] })
  expect(items).toHaveLength(3)
  expect(items[0].text).toContain("Alles kaputt")
  expect(items.every((item) => item.kind === "data")).toBe(true)
})

// Warnungen zuerst: ein leeres Guthaben wiegt schwerer als ein Sparvorschlag.
test("sortiert Warnungen vor Hinweisen", () => {
  const items = collectAttention({ ...empty, history: [change(35, 1)], accounts: [{ provider: "openrouter", state: "low" }] })
  expect(items.map((item) => item.severity)).toEqual(["warn", "info"])
})
