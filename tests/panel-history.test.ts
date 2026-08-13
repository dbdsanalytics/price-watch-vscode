import { expect, test } from "bun:test"
import { historyRows } from "../src/panel/views/history"
import type { PriceChange } from "../src/domain/changes"

const change = (over: Partial<PriceChange> = {}): PriceChange => ({ id: "x", at: Date.UTC(2026, 7, 12), provider: "opencode-zen", modelId: "kimi-k3", dimension: "input", previous: 1, current: 2, percent: 100, ...over })

test("zeigt Richtung, Betraege und Prozent", () => {
  const html = historyRows([change()])
  expect(html).toContain("kimi-k3")
  expect(html).toContain("+100")
  expect(html).toContain("change-up")
})

test("kennzeichnet eine Verguenstigung eigens", () => {
  const html = historyRows([change({ previous: 2, current: 1, percent: -50 })])
  expect(html).toContain("−50")
  expect(html).toContain("change-down")
})

test("verkraftet einen unbekannten Prozentsatz", () => {
  expect(historyRows([change({ previous: 0, percent: null })])).toContain("neu bepreist")
})

test("sagt es, wenn nichts aufgezeichnet wurde", () => {
  expect(historyRows([])).toContain("Noch keine Preisänderungen")
})

test("traegt die Filterattribute", () => {
  const html = historyRows([change()])
  expect(html).toContain('data-change="')
  expect(html).toContain('data-provider="opencode-zen"')
  expect(html).toContain('data-at="')
})
