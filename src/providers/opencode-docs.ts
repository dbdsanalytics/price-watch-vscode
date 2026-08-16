import type { ModelOffer, ModelQuota } from "../domain/model"
import type { ProviderId } from "../domain/provider"
import { fetchWithRetry, type FetchLike } from "./retry"

/** Modellnamen aus der Doku auf eine vergleichbare Form bringen ("GPT 5.6 Luna (≤ 272K)" → "gpt-5.6-luna"). */
export function norm(name: string): string {
  return String(name).toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

/** "GPT 5.6 Sol (> 272K tokens)" → Basisname, Label und Schwelle in Token. */
export function splitTier(name: string): { base: string; label?: string; thresholdTokens?: number; upper?: boolean } {
  const match = String(name).match(/^(.*?)\s*\(\s*(([≤>])\s*([\d.]+)K\s+tokens)\s*\)\s*$/i)
  if (!match) return { base: String(name).trim() }
  return { base: match[1].trim(), label: match[2].trim(), thresholdTokens: Math.round(Number(match[4]) * 1000), upper: match[3] === ">" }
}

/**
 * Dollar-Zelle der Preistabelle lesen. "Free" ist eine Aussage und ergibt 0;
 * alles Unlesbare ergibt undefined, damit es nicht als kostenlos durchgeht.
 */
export function toUsd(cell: string | undefined): number | undefined {
  const value = String(cell ?? "").trim()
  if (/^free$/i.test(value)) return 0
  const match = value.match(/^\$?(\d+(?:\.\d+)?)$/)
  return match ? Number(match[1]) : undefined
}

/** Anzahl aus einer Tabellenzelle; "2,150" darf nicht als 2 ankommen. */
export function toCount(cell: string | undefined): number | undefined {
  const value = String(cell ?? "").trim().replace(/[,\s]/g, "")
  if (!/^\d+$/.test(value)) return undefined
  return Number.parseInt(value, 10)
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

const isRequestHeader = (row: string[]) => /^Model/i.test(row[0] ?? "") && row.some((cell) => /requests per/i.test(cell))

/** Die Anfragen-Tabelle steht im selben Abschnitt wie die Preise, davor. */
function requestQuota(mdx: string): Map<string, ModelQuota> {
  const quota = new Map<string, ModelQuota>()
  let inTable = false
  for (const line of mdx.split("\n")) {
    if (!line.startsWith("|")) continue
    const row = cells(line)
    if (/^Model/i.test(row[0] ?? "")) { inTable = isRequestHeader(row); continue }
    if (!inTable || !row[0] || /^-+$/.test(row[0])) continue
    quota.set(norm(row[0]), { requestsPer5Hours: toCount(row[1]), requestsPerWeek: toCount(row[2]), requestsPerMonth: toCount(row[3]) })
  }
  return quota
}

function parsePricing(mdx: string, provider: ProviderId): ModelOffer[] {
  const ids = idsFromDocument(mdx)
  const offers: ModelOffer[] = []
  const requests = provider === "opencode-go" ? requestQuota(mdx) : new Map<string, ModelQuota>()
  let pricing = false, inPriceTable = false, usageColumn = -1
  for (const line of mdx.split("\n")) {
    if (/^## (Pricing|Usage limits)/i.test(line)) { pricing = true; continue }
    if (pricing && /^## /.test(line)) break
    if (!pricing || !line.startsWith("|")) continue
    const row = cells(line)
    // Der Abschnitt kann mehrere Tabellen enthalten (Anfragen je Zeitraum,
    // dann Preise). Nur Zeilen unter einem Preis-Kopf sind Preise.
    if (/^Model/i.test(row[0] ?? "")) { inPriceTable = isPriceHeader(row); usageColumn = row.findIndex((cell) => /^Usage$/i.test(cell)); continue }
    if (!inPriceTable) continue
    if (!row[0] || /^-+$/.test(row[0])) continue
    const base = norm(row[0])
    const id = ids.get(base) ?? ids.get(base.replace(/-tokens$/, ""))
    if (!id) continue
    const step = splitTier(row[0])
    const input = toUsd(row[1]), output = toUsd(row[2])
    const existing = offers.find((offer) => offer.id === id)
    if (existing) {
      // Gestufte Modelle stehen zweimal in der Tabelle und ergeben nach norm()
      // dieselbe ID. Die obere Stufe wird angehaengt statt verworfen; alles
      // ohne erkennbaren Operator bleibt beim bisherigen Verhalten, erste gewinnt.
      if (step.upper && step.thresholdTokens !== undefined) {
        existing.pricing.tiers = [...(existing.pricing.tiers ?? []), { thresholdTokens: step.thresholdTokens, label: step.label!, input: input ?? 0, output: output ?? 0 }].sort((a, b) => a.thresholdTokens - b.thresholdTokens)
      }
      continue
    }
    const included = usageColumn > 0 ? toUsd(row[usageColumn]) ?? 0 : 0
    const counted = requests.get(base) ?? requests.get(base.replace(/-tokens$/, ""))
    const quota: ModelQuota | undefined = included || counted ? { ...counted, ...(included ? { includedUsdPerMonth: included } : {}) } : undefined
    const unknown = input === undefined || output === undefined
    offers.push({ provider, id, name: step.base, ...(step.label ? { tier: step.label } : {}), ...(quota ? { quota } : {}), pricing: { input: input ?? 0, output: output ?? 0, ...(unknown ? { unknown: true } : {}), cacheRead: toUsd(row[3]) ?? 0, cacheWrite: toUsd(row[4]) ?? 0 }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } })
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

export async function fetchOpenCodeDocument(url: string, fetchImpl?: FetchLike): Promise<string> {
  const response = await fetchWithRetry(url, { signal: AbortSignal.timeout(20_000) }, { fetchImpl })
  if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`)
  return response.text()
}
