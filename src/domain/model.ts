import type { ProviderId } from "./provider"

/** Gestufte Preise: oberhalb der Schwelle gilt ein anderer Tarif. */
export interface PriceTier {
  thresholdTokens: number
  label: string
  input: number
  output: number
}

export interface ModelPricing {
  input: number
  output: number
  unknown?: boolean
  /** Nur die Stufen oberhalb der Basis, aufsteigend nach thresholdTokens. */
  tiers?: PriceTier[]
  cacheRead?: number
  cacheWrite?: number
  request?: number
  image?: number
  webSearch?: number
}

/** Nur OpenCode Go: Das Abo begrenzt in Dollarwerten, nicht in Token. */
export interface ModelQuota {
  includedUsdPerMonth?: number
  requestsPer5Hours?: number
  requestsPerWeek?: number
  requestsPerMonth?: number
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
  match?: "direct" | "base-model" | "local"
  details?: BenchmarkDetail[]
}

export interface BenchmarkDetail {
  name: string
  score: number
  elo?: number
  costPerTaskUsd?: number
  sampleCount?: number
  lastRunAt?: string
}

export interface ModelOffer {
  provider: ProviderId
  id: string
  benchmarkId?: string
  name: string
  description?: string
  tier?: string
  pricing: ModelPricing
  capabilities: ModelCapabilities
  benchmarks?: BenchmarkScores
  quota?: ModelQuota
  deprecatedAt?: string
}

export function usdPerMillion(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : 0
}

export function offerKey(offer: Pick<ModelOffer, "provider" | "id">): string {
  return `${offer.provider}:${offer.id}`
}

export function isFreePricing(pricing: Pick<ModelPricing, "input" | "output" | "request" | "unknown">): boolean {
  return !pricing.unknown && pricing.input === 0 && pricing.output === 0 && (pricing.request ?? 0) === 0
}
