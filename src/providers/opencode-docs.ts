import type { ModelOffer } from "../domain/model"
import type { ProviderId } from "../domain/provider"

/** Modellnamen aus der Doku auf eine vergleichbare Form bringen ("GPT 5.6 Luna (≤ 272K)" → "gpt-5.6-luna"). */
export function norm(name: string): string {
  return String(name).toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

/** Dollar-Zelle der Preistabelle lesen; "Free", "-" und Leerwerte gelten als 0. */
export function toUsd(cell: string | undefined): number {
  const value = String(cell ?? "").trim()
  if (!value || value === "-") return 0
  const parsed = Number.parseFloat(value.replace("$", ""))
  return Number.isNaN(parsed) ? 0 : parsed
}

const cells = (line: string) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/`/g, ""))

function idsFromDocument(mdx: string): Map<string, string> {
  const ids = new Map<string, string>()
  for (const line of mdx.split("\n")) {
    if (!line.startsWith("|")) continue
    const row = cells(line)
    if (row.length >= 3 && /^https?:/.test(row[2] ?? "")) ids.set(norm(row[0] ?? ""), row[1] ?? "")
  }
  return ids
}

/** Kopfzeile einer Preistabelle: fuehrt Modell UND Input/Output-Spalten. */
const isPriceHeader = (row: string[]) => /^Model/i.test(row[0] ?? "") && row.some((cell) => /^Input$/i.test(cell)) && row.some((cell) => /^Output$/i.test(cell))

function parsePricing(mdx: string, provider: ProviderId): ModelOffer[] {
  const ids = idsFromDocument(mdx)
  const offers: ModelOffer[] = []
  let pricing = false, inPriceTable = false
  for (const line of mdx.split("\n")) {
    if (/^## (Pricing|Usage limits)/i.test(line)) { pricing = true; continue }
    if (pricing && /^## /.test(line)) break
    if (!pricing || !line.startsWith("|")) continue
    const row = cells(line)
    // Der Abschnitt kann mehrere Tabellen enthalten (Anfragen je Zeitraum,
    // dann Preise). Nur Zeilen unter einem Preis-Kopf sind Preise.
    if (/^Model/i.test(row[0] ?? "")) { inPriceTable = isPriceHeader(row); continue }
    if (!inPriceTable) continue
    if (!row[0] || /^-+$/.test(row[0])) continue
    const base = norm(row[0])
    const id = ids.get(base) ?? ids.get(base.replace(/-tokens$/, ""))
    if (!id) continue
    // Gestufte Preise ("≤ 272K tokens" / "> 272K tokens") ergeben nach norm()
    // dieselbe ID. Die erste Zeile ist die Basisstufe; ihr Name traegt die
    // Stufe mit, sodass die Oberflaeche sie nicht verschweigt.
    if (offers.some((offer) => offer.id === id)) continue
    offers.push({ provider, id, name: row[0], pricing: { input: toUsd(row[1]), output: toUsd(row[2]), cacheRead: toUsd(row[3]), cacheWrite: toUsd(row[4]) }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } })
  }
  return offers
}

export const parseZenDocument = (mdx: string) => parsePricing(mdx, "opencode-zen")

/**
 * Ein leeres Parse-Ergebnis ist ein Fehler, kein Zustand: Die Dokumente führen
 * immer Modelle. Ohne diesen Wächter gilt ein strukturell geändertes Dokument
 * als erfolgreicher Abruf mit null Angeboten — die zuletzt bekannten Preise
 * werden dann verworfen, ohne dass ein Hinweis erscheint.
 */
export function requireOffers(provider: ProviderId, offers: ModelOffer[]): ModelOffer[] {
  if (!offers.length) throw new Error(`${provider}: keine Preise im Dokument gefunden — Struktur geändert?`)
  return offers
}

export interface GoCatalog { subscription: { firstMonthUsd: number; monthlyUsd: number }; offers: ModelOffer[] }
export function parseGoDocument(mdx: string): GoCatalog {
  const match = mdx.match(/\$(\d+(?:\.\d+)?) for your first month[^$]{0,40}\$(\d+(?:\.\d+)?)\/month/i)
  return { subscription: { firstMonthUsd: Number(match?.[1] ?? 0), monthlyUsd: Number(match?.[2] ?? 0) }, offers: parsePricing(mdx, "opencode-go") }
}

export async function fetchOpenCodeDocument(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`)
  return response.text()
}
