import { fetchWithRetry, type FetchLike } from "./retry"

export interface OpenRouterBenchmark {
  modelId: string
  modelName?: string
  benchmark: string
  score: number
  /** Nur bei Arena-Zeilen: Turnierwertung, nach der die Kategorie sortiert wird. */
  elo?: number
  costPerTaskUsd?: number
  sampleCount?: number
  lastRunAt?: string
  source: string
}

export interface OpenRouterBenchmarkSnapshot {
  fetchedAt: number
  asOf?: string
  citation?: string
  items: OpenRouterBenchmark[]
}

interface BenchmarkBody {
  meta?: { as_of?: unknown; citation?: unknown }
  data?: Array<Record<string,unknown>>
}

const finite = (value:unknown):value is number => typeof value === "number" && Number.isFinite(value)

export function parseOpenRouterBenchmarks(body:BenchmarkBody, fetchedAt=Date.now()):OpenRouterBenchmarkSnapshot {
  const items:OpenRouterBenchmark[]=[]
  for (const row of body.data ?? []) {
    if (typeof row.model_permaslug !== "string") continue
    const common = {
      modelId:row.model_permaslug,
      modelName:typeof row.display_name === "string" ? row.display_name : undefined,
      lastRunAt:typeof row.last_run_timestamp === "string" ? row.last_run_timestamp : undefined,
      source:typeof row.source === "string" ? row.source : "openrouter",
    }
    // Arena-Zeilen tragen Kategorie, ELO und Siegquote statt accuracy. Die
    // Siegquote ist bereits ein Prozentwert und damit direkt vergleichbar.
    if (typeof row.category === "string" && finite(row.win_rate)) {
      const stats = row.tournament_stats as { total?: unknown } | undefined
      items.push({ ...common, benchmark:`arena_${row.category}`, score:row.win_rate,
        elo:finite(row.elo) ? row.elo : undefined,
        sampleCount:finite(stats?.total) ? stats.total : undefined })
      continue
    }
    // Such-Benchmarks melden primary_score statt accuracy; beide sind Anteile.
    const share = finite(row.accuracy) ? row.accuracy : finite(row.primary_score) ? row.primary_score : undefined
    if (typeof row.benchmark_type !== "string" || share === undefined) continue
    items.push({ ...common, benchmark:row.benchmark_type, score:share*100,
      costPerTaskUsd:finite(row.avg_cost_per_task) ? row.avg_cost_per_task : undefined,
      sampleCount:finite(row.total_tasks) ? row.total_tasks : undefined })
  }
  return { fetchedAt, asOf:typeof body.meta?.as_of === "string" ? body.meta.as_of : undefined, citation:typeof body.meta?.citation === "string" ? body.meta.citation : undefined, items }
}

export async function fetchOpenRouterBenchmarks(key:string, fetchImpl?:FetchLike):Promise<OpenRouterBenchmarkSnapshot> {
  const response=await fetchWithRetry("https://openrouter.ai/api/v1/benchmarks",{ headers:{ Authorization:`Bearer ${key}` }, signal:AbortSignal.timeout(20_000) }, { fetchImpl })
  if (!response.ok) throw new Error(`OpenRouter Benchmarks HTTP ${response.status}`)
  return parseOpenRouterBenchmarks(await response.json() as BenchmarkBody)
}
