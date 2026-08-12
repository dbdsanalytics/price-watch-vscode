import type { PriceChange } from "./changes"

export function mergeHistory(local: PriceChange[], incoming: PriceChange[], now = Date.now()): PriceChange[] {
  const cutoff = now - 90 * 86_400_000
  const merged = new Map<string, PriceChange>()
  for (const event of [...local, ...incoming]) if (event.at >= cutoff) merged.set(event.id, event)
  return [...merged.values()].sort((a, b) => b.at - a.at)
}
