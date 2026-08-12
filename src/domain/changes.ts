import type { ModelOffer, ModelPricing } from "./model"
import { offerKey } from "./model"
import type { ProviderId } from "./provider"

export type PriceDimension = keyof Pick<ModelPricing, "input" | "output" | "cacheRead" | "cacheWrite" | "request">
export interface PriceChange { id: string; at: number; provider: ProviderId; modelId: string; dimension: PriceDimension; previous: number; current: number; percent: number | null }

export function diffOffers(previous: ModelOffer[], next: ModelOffer[], at = Date.now()): PriceChange[] {
  const before = new Map(previous.map((offer) => [offerKey(offer), offer]))
  const dimensions: PriceDimension[] = ["input", "output", "cacheRead", "cacheWrite", "request"]
  const changes: PriceChange[] = []
  for (const offer of next) {
    const old = before.get(offerKey(offer)); if (!old) continue
    for (const dimension of dimensions) {
      const prior = old.pricing[dimension] ?? 0; const current = offer.pricing[dimension] ?? 0
      if (prior === current) continue
      changes.push({ id: `${offerKey(offer)}:${dimension}:${at}:${prior}:${current}`, at, provider: offer.provider, modelId: offer.id, dimension, previous: prior, current, percent: prior === 0 ? null : ((current - prior) / prior) * 100 })
    }
  }
  return changes
}

export function summarizeChanges(changes: PriceChange[]): string {
  const providers = new Set(changes.map((change) => change.provider)).size
  return `${changes.length} Preisänderungen bei ${providers} Anbieter${providers === 1 ? "" : "n"}`
}
