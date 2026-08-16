import type { BenchmarkDetail, BenchmarkScores, ModelOffer } from "./model"
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

type Dimension = "intelligence" | "coding" | "agentic"

// Zuordnung der OpenRouter-Benchmark-Namen zu den drei Dimensions-Scores,
// belegt aus den im Repo vorhandenen Namen (Labels in src/panel/views/models.ts,
// Fixtures in tests/openrouter-benchmarks.test.ts):
//   - gpqa_diamond  ("GPQA Diamond") ist die einzige Wissens-/Reasoning-Messung -> intelligence
//   - arena_codecategories ("Arena · Code") ist die einzige Code-Kategorie der design-arena -> coding
//   - tau_bench_verified_airline ("τ²-Bench Airline") ist der einzige simulierte
//     Tool-/Agenten-Benchmark -> agentic
// Alle übrigen Namen (search_*, arena_website, arena_uicomponent, arena_dataviz,
// arena_svg, arena_gamedev, arena_3d, arena_asciiart, arena_graphicdesign,
// arena_logo, arena_image, arena_imageediting) messen Suche oder Design/Bild und
// sind keiner der drei Dimensionen eindeutig zuordenbar: Sie bleiben nur in
// details sichtbar und fließen in keinen Dimensions-Score.
const dimensionFor = (name: string): Dimension | undefined => {
  switch (name) {
    case "gpqa_diamond": return "intelligence"
    case "arena_codecategories": return "coding"
    case "tau_bench_verified_airline": return "agentic"
    default: return undefined
  }
}

// Aggregationsregel: Dimensions-Score = arithmetisches Mittel der Scores aller
// zugeordneten Einzelbenchmarks, bricht auf eine Nachkommastelle ab
// (Math.round(x*10)/10). Deterministisch: reine Funktion, feste Zuordnung,
// keine Zeit- oder Zufallskomponente. Unzugeordnete Namen und nicht-endliche
// Scores werden uebersprungen; ohne zuordenbare details bleibt das Ergebnis leer.
export function aggregateBenchmarkScores(details: BenchmarkDetail[] | undefined): Pick<BenchmarkScores, Dimension> {
  const sums = new Map<Dimension, { sum: number; count: number }>()
  for (const detail of details ?? []) {
    if (!Number.isFinite(detail.score)) continue
    const dimension = dimensionFor(detail.name)
    if (!dimension) continue
    const entry = sums.get(dimension) ?? { sum: 0, count: 0 }
    entry.sum += detail.score
    entry.count += 1
    sums.set(dimension, entry)
  }
  const scores: Pick<BenchmarkScores, Dimension> = {}
  for (const [dimension, { sum, count }] of sums) {
    scores[dimension] = Math.round((sum / count) * 10) / 10
  }
  return scores
}

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
    // Vorhandene Dimensions-Scores (z. B. Artificial Analysis) gewinnen; die
    // Aggregation fuellt nur Dimensionen, die der Katalog nicht schon bewertet.
    return { ...offer, benchmarks:{ ...aggregateBenchmarkScores(details), ...offer.benchmarks, source:offer.benchmarks?.source ?? "OpenRouter Benchmarks", match:"direct", asOf:api?.asOf, details } }
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
