import { describe, expect, test } from "bun:test"
import { fetchAllProviders } from "../src/providers/fetch-all"
import { carryForwardOffers, plausibilityWarning } from "../src/domain/snapshots"
import { collectAttention } from "../src/domain/attention"
import type { ModelOffer } from "../src/domain/model"
import type { ProviderSnapshot } from "../src/domain/provider"

const offer = (id: string): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input: 1, output: 1 }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["language"] } })
const snapshot = (provider: ProviderSnapshot["provider"], offers: ModelOffer[], checkedAt: number): ProviderSnapshot => ({ provider, offers, checkedAt, stale: false })

describe("provider isolation", () => {
  test("keeps successful providers when one fails", async () => {
    const snapshots = await fetchAllProviders({
      openrouter: async () => [],
      "opencode-zen": async () => { throw new Error("Zen down") },
      "opencode-go": async () => [],
    })
    expect(snapshots).toHaveLength(3)
    expect(snapshots.find((item) => item.provider === "opencode-zen")?.error?.kind).toBe("network")
    expect(snapshots.filter((item) => !item.error)).toHaveLength(2)
  })

  // F10: Der komplette Refresh-Pfad (Abruf, Plausibilitaet, carryForward,
  // Attention) muss trotz eines werfenden Providers durchlaufen. Der Fehler
  // bleibt sichtbar — als Snapshot-Fehler und als Attention-Streifen.
  test("refresh pipeline runs through a failing provider and surfaces the error", async () => {
    const previous: ProviderSnapshot[] = [
      snapshot("openrouter", [offer("r1"), offer("r2")], 1_000),
      snapshot("opencode-zen", [offer("z1")], 1_000),
      snapshot("opencode-go", [offer("g1")], 1_000),
    ]
    const fresh = await fetchAllProviders({
      openrouter: async () => [offer("r1"), offer("r2")],
      "opencode-zen": async () => { throw new TypeError("network down") },
      "opencode-go": async () => [offer("g1")],
    })
    // Kein Schritt der Kette darf werfen — genau das ist die Zyklus-Garantie.
    const previousByProvider = new Map(previous.map((item) => [item.provider, item]))
    const checked = fresh.map((item) => {
      const warning = plausibilityWarning(previousByProvider.get(item.provider), item)
      return warning ? { ...item, warning } : item
    })
    const carried = carryForwardOffers(previous, checked)
    const zen = carried.find((item) => item.provider === "opencode-zen")
    expect(zen?.offers).toEqual([offer("z1")]) // letzte bekannte Preise bleiben
    expect(zen?.stale).toBe(true)
    expect(zen?.error?.message).toBe("network down")
    expect(carried.find((item) => item.provider === "openrouter")?.offers).toHaveLength(2)
    expect(carried.find((item) => item.provider === "opencode-go")?.offers).toHaveLength(1)
    const attention = collectAttention({ assessments: [], accounts: [], history: [], snapshots: carried, jumpPercent: 20 })
    expect(attention.some((item) => item.kind === "data" && item.text.includes("opencode-zen") && item.text.includes("network down"))).toBe(true)
  })

  // Abbildung der zwei abgesicherten Bloecke aus src/extension.ts refresh():
  // Block 1 (Anreicherung) und Block 2 (carryForward + Folge-Schritte) sind
  // getrennt gefangen; jeder Teilfehler landet in refreshError (= erster
  // Attention-Streifen), nie in einer Rejection des Zyklus.
  test("an enriching step that throws keeps the raw fetch and records refreshError", async () => {
    const previous = [
      snapshot("openrouter", [offer("r1"), offer("r2")], 1_000),
      snapshot("opencode-zen", [offer("z1")], 1_000),
      snapshot("opencode-go", [offer("g1")], 1_000),
    ]
    const fetched = await fetchAllProviders({
      openrouter: async () => [offer("r1"), offer("r2"), offer("r3")],
      "opencode-zen": async () => [offer("z1")],
      "opencode-go": async () => [offer("g1")],
    })
    // Block 1 ohne Rueckfall: Ein Fehler in der Anreicherung (hier absichtlich
    // ausgeloest) verwirft nur die Anzeicherung, nicht den rohen Abruf.
    const previousByProvider = new Map(previous.map((item) => [item.provider, item]))
    let fresh = fetched
    let processingError: unknown
    try {
      fresh = fetched.map((item) => {
        if (item.provider === "opencode-zen") throw new Error("Anreicherung explodiert")
        const warning = plausibilityWarning(previousByProvider.get(item.provider), item)
        return warning ? { ...item, warning } : item
      })
    } catch (error) { processingError = error }
    // Block 2 laeuft trotzdem: Der rohe Abruf wird carryForward uebergeben.
    const carried = carryForwardOffers(previous, fresh)
    expect(processingError instanceof Error ? processingError.message : String(processingError)).toBe("Anreicherung explodiert")
    expect(carried).toHaveLength(3)
    // Die neuen Daten von openrouter sind trotz Teilfehler angekommen ...
    expect(carried.find((item) => item.provider === "openrouter")?.offers).toHaveLength(3)
    // ... und zen behaelt die letzten bekannten Preise.
    expect(carried.find((item) => item.provider === "opencode-zen")?.offers).toEqual([offer("z1")])
    // refreshError ist gesetzt und erscheint sichtbar als erster Streifen.
    const attention = collectAttention({ assessments: [], accounts: [], history: [], snapshots: carried, refreshError: processingError instanceof Error ? processingError.message : String(processingError), jumpPercent: 20 })
    expect(attention[0]?.text.startsWith("Aktualisierung fehlgeschlagen: Anreicherung explodiert")).toBe(true)
  })

  test("a failing later step keeps the previous state intact and still surfaces refreshError", async () => {
    const previous = [
      snapshot("openrouter", [offer("r1"), offer("r2")], 1_000),
      snapshot("opencode-zen", [offer("z1")], 1_000),
      snapshot("opencode-go", [offer("g1")], 1_000),
    ]
    const fetched = await fetchAllProviders({
      openrouter: async () => [offer("r1"), offer("r2"), offer("r3")],
      "opencode-zen": async () => [offer("z1")],
      "opencode-go": async () => [offer("g1")],
    })
    // Block 2 von extension.ts: carryForward gelingt, aber ein spaeterer
    // Schritt (in extension.ts diffOffers/mergeHistory/Persistenz) wirft.
    // Die Zustandsuebernahme passiert dort erst NACH dem Block — ein Wurf
    // verwirft die lokalen Ergebnisse, der letzte Stand bleibt stehen.
    let snapshots: ProviderSnapshot[] = previous
    let processingError: unknown
    try {
      const carried = carryForwardOffers(previous, fetched)
      const laterStep = (input: ProviderSnapshot[]) => { if (input.length) throw new Error("Verlauf schreiben schlug fehl") }
      laterStep(carried)
    } catch (error) { processingError = processingError ?? error }
    expect(processingError instanceof Error ? processingError.message : String(processingError)).toBe("Verlauf schreiben schlug fehl")
    // Nichts wurde uebernommen — die zuletzt bekannten Daten bleiben (kein
    // Teilzustand, kein Verlust der Angebote).
    expect(snapshots).toEqual(previous)
    expect(snapshots.find((item) => item.provider === "openrouter")?.offers).toEqual([offer("r1"), offer("r2")])
    const attention = collectAttention({ assessments: [], accounts: [], history: [], snapshots, refreshError: processingError instanceof Error ? processingError.message : String(processingError), jumpPercent: 20 })
    expect(attention.some((item) => item.text.startsWith("Aktualisierung fehlgeschlagen") && item.text.includes("Verlauf schreiben schlug fehl"))).toBe(true)
  })
})
