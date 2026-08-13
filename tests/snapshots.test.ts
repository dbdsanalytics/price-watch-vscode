import { expect, test } from "bun:test"
import { carryForwardOffers, plausibilityWarning } from "../src/domain/snapshots"
import type { ModelOffer } from "../src/domain/model"
import type { ProviderSnapshot } from "../src/domain/provider"

const offer = (id: string, input: number): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input, output: input }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["language"] } })
const ok = (offers: ModelOffer[], checkedAt: number): ProviderSnapshot => ({ provider: "openrouter", offers, checkedAt, stale: false })
const failed = (checkedAt: number): ProviderSnapshot => ({ provider: "openrouter", offers: [], checkedAt, stale: true, error: { kind: "network", message: "offline" } })

test("keeps the last known offers when a provider fails", () => {
  const [snapshot] = carryForwardOffers([ok([offer("a", 1)], 1_000)], [failed(2_000)])
  expect(snapshot.offers).toEqual([offer("a", 1)])
  expect(snapshot.stale).toBe(true)
  expect(snapshot.error?.message).toBe("offline")
})

test("reports the age of the carried-over data, not the failed attempt", () => {
  expect(carryForwardOffers([ok([offer("a", 1)], 1_000)], [failed(2_000)])[0].checkedAt).toBe(1_000)
})

test("replaces offers on a successful fetch", () => {
  const [snapshot] = carryForwardOffers([ok([offer("a", 1)], 1_000)], [ok([offer("a", 2)], 2_000)])
  expect(snapshot.offers).toEqual([offer("a", 2)])
  expect(snapshot.stale).toBe(false)
})

test("leaves a failed provider empty when nothing is known yet", () => {
  expect(carryForwardOffers([], [failed(2_000)])[0].offers).toEqual([])
})

// Zweiter Weg in denselben Fehler: ein Anbieter antwortet erfolgreich, liefert
// aber nichts (leeres data-Array). Ohne error griff die Rettung bisher nicht.
const empty = (checkedAt: number): ProviderSnapshot => ({ provider: "openrouter", offers: [], checkedAt, stale: false })

test("rettet die letzten Preise auch bei leerem Ergebnis ohne Fehler", () => {
  const [snapshot] = carryForwardOffers([ok([offer("a", 1)], 1_000)], [empty(2_000)])
  expect(snapshot.offers).toEqual([offer("a", 1)])
  expect(snapshot.checkedAt).toBe(1_000)
  expect(snapshot.stale).toBe(true)
})

// Zweimal hat eine Strukturaenderung der OpenCode-Doku still falsche Preise
// erzeugt. Der Waechter macht den Verdacht sichtbar, ohne den Abruf zu
// verwerfen — die Daten sind da, sie sind nur verdaechtig.
const many = (count: number, unknown = 0) => Array.from({ length: count }, (_, index) => {
  const item = offer(`m${index}`, 1)
  return index < unknown ? { ...item, pricing: { ...item.pricing, unknown: true } } : item
})

test("meldet einen Einbruch der Modellzahl", () => {
  const warning = plausibilityWarning(ok(many(61), 1_000), ok(many(42), 2_000))
  expect(warning).toContain("42")
  expect(warning).toContain("61")
})

test("schweigt bei einem massvollen Rueckgang", () => {
  expect(plausibilityWarning(ok(many(61), 1_000), ok(many(55), 2_000))).toBeUndefined()
})

test("meldet Modelle, die ihren lesbaren Preis verloren haben", () => {
  const warning = plausibilityWarning(ok(many(10), 1_000), ok(many(10, 3), 2_000))
  expect(warning).toContain("3")
})

test("schweigt ohne vorherigen Stand", () => {
  expect(plausibilityWarning(undefined, ok(many(10), 2_000))).toBeUndefined()
})

test("schweigt, wenn der frische Abruf bereits einen Fehler meldet", () => {
  expect(plausibilityWarning(ok(many(61), 1_000), failed(2_000))).toBeUndefined()
})
