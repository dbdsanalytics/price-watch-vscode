import type { ProviderId } from "./provider"

export interface ModelPricing {
  input: number
  output: number
  unknown?: boolean
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
  match?: "direct" | "base-model" | "local"
  details?: BenchmarkDetail[]
}

export interface BenchmarkDetail {
  name: string
  score: number
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
