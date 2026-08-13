import { expect, test } from "bun:test"
import { fragments, panelHtml } from "../src/panel/index"
import type { DashboardState } from "../src/domain/dashboard"
import type { ModelOffer } from "../src/domain/model"

const offer = (id: string, input: number): ModelOffer => ({ provider: "opencode-zen", id, name: id, pricing: { input, output: input },
  capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: null, purposes: ["coding"] } })
const state = (offers: ModelOffer[]): DashboardState => ({ snapshots: [{ provider: "opencode-zen", offers, checkedAt: 1, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })

test("liefert jede Kennung, die im Dokument einen Container hat", () => {
  const html = panelHtml(state([offer("a", 1)]))
  for (const id of Object.keys(fragments(state([offer("a", 1)])))) {
    expect(html).toContain(`data-fragment="${id}"`)
  }
})

// Grundlage des Vergleichs im Webview: gleicher Zustand, gleiche Zeichenkette.
// Ohne diese Zusicherung wuerde jeder Abruf das DOM ersetzen und die Bedienung
// genauso wegwerfen wie der bisherige Neuaufbau.
test("erzeugt bei gleichem Zustand identische Zeichenketten", () => {
  expect(fragments(state([offer("a", 1)]))).toEqual(fragments(state([offer("a", 1)])))
})

test("ein geaenderter Preis beruehrt nur das Modell-Fragment", () => {
  const before = fragments(state([offer("a", 1)])), after = fragments(state([offer("a", 2)]))
  expect(after.models).not.toBe(before.models)
  expect(after.agents).toBe(before.agents)
  expect(after.accounts).toBe(before.accounts)
  expect(after["overview-agents"]).toBe(before["overview-agents"])
})

test("die Metrikzeile folgt der Modellzahl", () => {
  expect(fragments(state([offer("a", 1), offer("b", 2)])).metrics).toContain("2")
})

// Das Skript ist eine Zeichenkette und laeuft im Test nicht. Geprueft wird
// deshalb, dass die Bausteine vorhanden sind, ohne die der Tausch die
// Bedienung wieder wegwerfen wuerde.
test("das Webview-Skript tauscht nur geaenderte Fragmente", () => {
  const html = panelHtml(state([offer("a", 1)]))
  expect(html).toContain("addEventListener('message'")
  expect(html).toContain("shown[id] === html")
  expect(html).toContain("data-fragment=")
  expect(html).not.toContain("onclick=")
})
