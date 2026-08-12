import type { BenchmarkScores, ModelOffer } from "./model"
import type { ProviderSnapshot } from "./provider"

const vendors: Array<[RegExp,string]> = [
  [/^qwen/i,"qwen"],[/^gpt-/i,"openai"],[/^claude-/i,"anthropic"],[/^gemini-/i,"google"],[/^grok-/i,"x-ai"],
  [/^deepseek-/i,"deepseek"],[/^glm-/i,"z-ai"],[/^kimi-/i,"moonshotai"],[/^minimax-/i,"minimax"],[/^mimo-/i,"xiaomi"],
  [/^hy\d/i,"tencent"],[/^nemotron-/i,"nvidia"],[/^laguna-/i,"poolside"],
]
const baseId = (id: string) => id.replace(/:batch$/,"").replace(/:free$/,"").replace(/-free$/,"")
const ownerFor = (id: string) => vendors.find(([pattern])=>pattern.test(baseId(id)))?.[1]
const inherited = (scores: BenchmarkScores): BenchmarkScores => ({ ...scores, source:`${scores.source} · identisches Basismodell`, match:"base-model" })

export function enrichProviderBenchmarks(snapshots: ProviderSnapshot[]): ProviderSnapshot[] {
  const openRouter = snapshots.find((snapshot)=>snapshot.provider === "openrouter")?.offers ?? []
  return snapshots.map((snapshot) => snapshot.provider === "openrouter" ? snapshot : ({ ...snapshot, offers:snapshot.offers.map((offer):ModelOffer => {
    if (offer.benchmarks) return offer
    const base = baseId(offer.id), owner = ownerFor(base)
    const candidates = openRouter.filter((item)=>item.benchmarks && baseId(item.id.split("/").at(-1) ?? item.id) === base).filter((item)=>!owner || item.id.startsWith(`${owner}/`))
    const owners = new Set(candidates.map((item)=>item.id.split("/")[0]))
    if (candidates.length === 0 || (!owner && owners.size !== 1)) return offer
    return { ...offer, benchmarks:inherited(candidates[0].benchmarks!) }
  }) }))
}
