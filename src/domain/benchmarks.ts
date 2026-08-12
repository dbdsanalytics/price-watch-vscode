import type { BenchmarkScores, ModelOffer } from "./model"
import type { ProviderSnapshot } from "./provider"
import type { OpenRouterBenchmarkSnapshot } from "../providers/openrouter-benchmarks"

const vendors: Array<[RegExp,string]> = [
  [/^qwen/i,"qwen"],[/^gpt-/i,"openai"],[/^claude-/i,"anthropic"],[/^gemini-/i,"google"],[/^grok-/i,"x-ai"],
  [/^deepseek-/i,"deepseek"],[/^glm-/i,"z-ai"],[/^kimi-/i,"moonshotai"],[/^minimax-/i,"minimax"],[/^mimo-/i,"xiaomi"],
  [/^hy\d/i,"tencent"],[/^nemotron-/i,"nvidia"],[/^laguna-/i,"poolside"],
]
const baseId = (id: string) => id.replace(/:batch$/,"").replace(/:free$/,"").replace(/-free$/,"")
const ownerFor = (id: string) => vendors.find(([pattern])=>pattern.test(baseId(id)))?.[1]
const inherited = (scores: BenchmarkScores): BenchmarkScores => ({ ...scores, source:`${scores.source} · identisches Basismodell`, match:"base-model" })

export function enrichProviderBenchmarks(snapshots: ProviderSnapshot[], api?:OpenRouterBenchmarkSnapshot|null): ProviderSnapshot[] {
  const detailsByModel=new Map<string,NonNullable<BenchmarkScores["details"]>>()
  for (const item of api?.items ?? []) {
    const details=detailsByModel.get(item.modelId) ?? []
    details.push({ name:item.benchmark, score:item.score, elo:item.elo, costPerTaskUsd:item.costPerTaskUsd, sampleCount:item.sampleCount, lastRunAt:item.lastRunAt })
    detailsByModel.set(item.modelId,details)
  }
  const withApi=snapshots.map((snapshot)=>snapshot.provider !== "openrouter" ? snapshot : ({ ...snapshot, offers:snapshot.offers.map((offer):ModelOffer=>{
    const details=detailsByModel.get(offer.benchmarkId ?? offer.id)
    if (!details?.length) return offer
    return { ...offer, benchmarks:{ ...offer.benchmarks, source:offer.benchmarks?.source ?? "OpenRouter Benchmarks", match:"direct", asOf:api?.asOf, details } }
  }) }))
  const openRouter = withApi.find((snapshot)=>snapshot.provider === "openrouter")?.offers ?? []
  return withApi.map((snapshot) => snapshot.provider === "openrouter" ? snapshot : ({ ...snapshot, offers:snapshot.offers.map((offer):ModelOffer => {
    if (offer.benchmarks) return offer
    const base = baseId(offer.id), owner = ownerFor(base)
    const candidates = openRouter.filter((item)=>item.benchmarks && baseId(item.id.split("/").at(-1) ?? item.id) === base).filter((item)=>!owner || item.id.startsWith(`${owner}/`))
    const owners = new Set(candidates.map((item)=>item.id.split("/")[0]))
    if (candidates.length === 0 || (!owner && owners.size !== 1)) return offer
    return { ...offer, benchmarks:inherited(candidates[0].benchmarks!) }
  }) }))
}
