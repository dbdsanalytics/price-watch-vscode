import type { ProviderId } from "./provider"

export interface ModelPricing {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  request?: number
  image?: number
  webSearch?: number
}

export interface ModelCapabilities {
  inputModalities: string[]
  outputModalities: string[]
  tools: boolean
  structuredOutput: boolean
  reasoning: boolean
  contextLength: number | null
  purposes: Array<"coding" | "language" | "reasoning" | "vision" | "tools" | "allround">
}

export interface BenchmarkScores {
  intelligence?: number
  coding?: number
  agentic?: number
  source: string
  asOf?: string
}

export interface ModelOffer {
  provider: ProviderId
  id: string
  name: string
  description?: string
  tier?: string
  pricing: ModelPricing
  capabilities: ModelCapabilities
  benchmarks?: BenchmarkScores
  deprecatedAt?: string
}

export function usdPerMillion(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0
}

export function offerKey(offer: Pick<ModelOffer, "provider" | "id">): string {
  return `${offer.provider}:${offer.id}`
}

export function isFreePricing(pricing: Pick<ModelPricing, "input" | "output" | "request">): boolean {
  return pricing.input === 0 && pricing.output === 0 && (pricing.request ?? 0) === 0
}
