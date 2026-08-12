import { expect, test } from "bun:test"
import { carryForwardOffers } from "../src/domain/snapshots"
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
