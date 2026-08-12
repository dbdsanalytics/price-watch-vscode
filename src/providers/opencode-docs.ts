import type { ModelOffer } from "../domain/model"
import type { ProviderId } from "../domain/provider"
import { norm, toUsd } from "../prices"

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

function parsePricing(mdx: string, provider: ProviderId): ModelOffer[] {
  const ids = idsFromDocument(mdx)
  const offers: ModelOffer[] = []
  let pricing = false
  for (const line of mdx.split("\n")) {
    if (/^## (Pricing|Usage limits)/i.test(line)) { pricing = true; continue }
    if (pricing && /^## /.test(line)) break
    if (!pricing || !line.startsWith("|")) continue
    const row = cells(line)
    if (!row[0] || /^(Model|-+)/i.test(row[0])) continue
    const base = norm(row[0])
    const id = ids.get(base) ?? ids.get(base.replace(/-tokens$/, ""))
    if (!id) continue
    offers.push({ provider, id, name: row[0], pricing: { input: toUsd(row[1]), output: toUsd(row[2]), cacheRead: toUsd(row[3]), cacheWrite: toUsd(row[4]) }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } })
  }
  return offers
}

export const parseZenDocument = (mdx: string) => parsePricing(mdx, "opencode-zen")

export interface GoCatalog { subscription: { firstMonthUsd: number; monthlyUsd: number }; offers: ModelOffer[] }
export function parseGoDocument(mdx: string): GoCatalog {
  const match = mdx.match(/\$(\d+(?:\.\d+)?) for your first month, then \$(\d+(?:\.\d+)?)\/month/i)
  return { subscription: { firstMonthUsd: Number(match?.[1] ?? 0), monthlyUsd: Number(match?.[2] ?? 0) }, offers: parsePricing(mdx, "opencode-go") }
}

export async function fetchOpenCodeDocument(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`)
  return response.text()
}
