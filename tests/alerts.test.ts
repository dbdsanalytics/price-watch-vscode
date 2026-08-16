import { expect, test } from "bun:test"
import { pickLowBalanceAlerts, pickPriceAlerts } from "../src/domain/alerts"
import { diffOffers, type PriceChange } from "../src/domain/changes"
import type { AccountStatus } from "../src/accounts/types"
import type { ModelOffer } from "../src/domain/model"

// PriceChange-Felder (src/domain/changes.ts): id, at, provider, modelId,
// dimension ("input" | "output" | "cacheRead" | "cacheWrite" | "request"),
// previous/current (USD je Einheit) und percent (relative Änderung, null wenn
// der alte Preis 0 war — dann gibt es keine aussagekräftige Prozentbasis).
const change = (id: string, percent: number | null): PriceChange => ({ id, at: 1, provider: "openrouter", modelId: `model-${id}`, dimension: "input", previous: 100, current: percent === null ? 0 : 100 * (1 + percent / 100), percent })

const account = (provider: AccountStatus["provider"], remainingUsd?: number): AccountStatus => ({ provider, state: remainingUsd === undefined ? "unavailable" : "available", remainingUsd })

const offer = (id: string, input: number, output: number): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input, output }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["language"] } })

test("filters out changes below the threshold", () => {
  expect(pickPriceAlerts([change("a", 10), change("b", 19.9)], 20)).toEqual([])
})

test("keeps changes at or above the threshold", () => {
  expect(pickPriceAlerts([change("a", 19.9), change("b", 20), change("c", -25), change("d", 100)], 20).map((item) => item.modelId)).toEqual(["model-d", "model-c", "model-b"])
})

test("limits to the top five by magnitude of change", () => {
  const picks = pickPriceAlerts([change("a", 21), change("b", 30), change("c", 40), change("d", 50), change("e", 60), change("f", 70), change("g", 80)], 20)
  expect(picks).toHaveLength(5)
  expect(picks.map((item) => item.percent)).toEqual([80, 70, 60, 50, 40])
})

test("treats threshold as an absolute value", () => {
  expect(pickPriceAlerts([change("a", -30), change("b", 30)], -20)).toHaveLength(2)
})

test("threshold of zero turns every change with a percentage base into an alert", () => {
  // |percent| >= 0 gilt für jede nicht-null Prozentbasis — auch winzige
  // Schwankungen werden bei Schwelle 0 zu Alerts (sortiert nach |percent|).
  expect(pickPriceAlerts([change("tiny", 0.5), change("tinier", -0.25), change("flat", null)], 0).map((item) => item.percent)).toEqual([0.5, -0.25])
})

test("keeps changes exactly at the threshold with a negative sign", () => {
  // Gegenstück zur positiven Grenze: -20 erreicht |percent| == threshold und
  // ist drin, -19.9 bleibt unter der Schwelle.
  expect(pickPriceAlerts([change("drop", -20), change("dip", -19.9)], 20).map((item) => item.modelId)).toEqual(["model-drop"])
})

test("ignores changes without a percentage base and keeps input order for ties", () => {
  const flat = { ...change("flat", null), id: "flat" }
  expect(pickPriceAlerts([change("low", 21), flat, change("high", 21)], 20)).toEqual([{ ...change("low", 21), id: "low" }, { ...change("high", 21), id: "high" }])
})

test("does not mutate the input changes array", () => {
  const changes = [change("a", 50), change("b", 30)]
  pickPriceAlerts(changes, 20)
  expect(changes.map((item) => item.modelId)).toEqual(["model-a", "model-b"])
})

// Neu hinzugekommene und entfernte Modelle existieren nur auf einer Seite des
// Diffs. diffOffers vergleicht ausschliesslich Angebote, die in beiden Ständen
// vorkommen — für einseitige Modelle gibt es keinen Vorherpreis, also keinen
// PriceChange und damit auch keinen Alarm. Das wird hier direkt belegt.
test("ignores newly added and removed models (no diff baseline)", () => {
  const before = [offer("kept", 1, 2)]
  const after = [offer("kept", 1, 2), offer("added", 5, 5)]
  expect(pickPriceAlerts(diffOffers(before, after), 1)).toEqual([])
  expect(pickPriceAlerts(diffOffers(after, before), 1)).toEqual([])
})

// Wiederholungsfreiheit: Bei unverändertem Zustand liefert diffOffers keine
// Changes, also auch keine Preisalarme — dieselbe Meldung wird nicht erneut
// ausgelöst. Das ist die Voraussetzung dafür, dass der Refresh-Alarm ohne
// eigene Historie auskommt.
test("does not re-fire alerts when the state is unchanged", () => {
  const offers = [offer("kept", 1, 2)]
  expect(diffOffers(offers, offers)).toEqual([])
  expect(pickPriceAlerts(diffOffers(offers, offers), 20)).toEqual([])
})

test("flags accounts below the balance threshold", () => {
  expect(pickLowBalanceAlerts([account("openrouter", 4.2), account("openrouter", 10)], 10)).toEqual([account("openrouter", 4.2)])
})

test("ignores accounts at or above the balance threshold", () => {
  expect(pickLowBalanceAlerts([account("openrouter", 10), account("openrouter", 15)], 10)).toEqual([])
})

test("ignores accounts without a known balance", () => {
  // opencode-go liefert nur Prozentfenster, unavailable-Konten keinen Betrag.
  expect(pickLowBalanceAlerts([account("opencode-go"), account("openrouter", 3)], 10)).toEqual([account("openrouter", 3)])
})

test("ignores available accounts that report no balance", () => {
  // Auch ein verbundenes Konto kann ohne remainingUsd dastehen (Feld optional,
  // z. B. beim ersten Abruf). Ohne Betrag ist kein Schwellenvergleich möglich.
  expect(pickLowBalanceAlerts([{ provider: "openrouter", state: "available" }, account("openrouter", 9.99)], 10)).toEqual([account("openrouter", 9.99)])
})