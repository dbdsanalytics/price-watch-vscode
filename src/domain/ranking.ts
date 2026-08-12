import type { ModelOffer } from "./model"

export type Purpose = "coding" | "language" | "reasoning" | "vision" | "tools" | "allround"
export type PriceMode = "free" | "paid" | "all"
export interface RankedOffer { offer: ModelOffer; score: number | null; rating: "scored" | "unrated"; reason: string }

export function rankOffers(offers: ModelOffer[], purpose: Purpose, priceMode: PriceMode): RankedOffer[] {
  // Die Zweckzuordnung stammt teils aus der Anbieterbeschreibung. Ein
  // gemessener Coding-Benchmark wiegt schwerer als deren Wortwahl.
  const fitsPurpose = (offer: ModelOffer) => offer.capabilities.purposes.includes(purpose) || (purpose === "coding" && offer.benchmarks?.coding !== undefined)
  return offers.filter((offer) => !offer.pricing.unknown && offer.capabilities.outputModalities.includes("text")).filter(fitsPurpose).filter((offer) => {
    const free = offer.pricing.input + offer.pricing.output === 0
    return priceMode === "all" || (priceMode === "free" ? free : !free)
  }).map((offer) => {
    const score = purpose === "coding" ? offer.benchmarks?.coding ?? null : offer.benchmarks?.intelligence ?? null
    return { offer, score, rating: score === null ? "unrated" as const : "scored" as const, reason: score === null ? "Noch kein belastbarer Benchmark" : `${offer.benchmarks?.source}: ${score}` }
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.offer.pricing.input + a.offer.pricing.output) - (b.offer.pricing.input + b.offer.pricing.output))
}
