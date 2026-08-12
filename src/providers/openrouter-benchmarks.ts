export interface OpenRouterBenchmark {
  modelId: string
  modelName?: string
  benchmark: string
  score: number
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
    if (typeof row.model_permaslug !== "string" || typeof row.benchmark_type !== "string" || !finite(row.accuracy)) continue
    items.push({
      modelId:row.model_permaslug,
      modelName:typeof row.display_name === "string" ? row.display_name : undefined,
      benchmark:row.benchmark_type,
      score:row.accuracy*100,
      costPerTaskUsd:finite(row.avg_cost_per_task) ? row.avg_cost_per_task : undefined,
      sampleCount:finite(row.total_tasks) ? row.total_tasks : undefined,
      lastRunAt:typeof row.last_run_timestamp === "string" ? row.last_run_timestamp : undefined,
      source:typeof row.source === "string" ? row.source : "openrouter",
    })
  }
  return { fetchedAt, asOf:typeof body.meta?.as_of === "string" ? body.meta.as_of : undefined, citation:typeof body.meta?.citation === "string" ? body.meta.citation : undefined, items }
}

export async function fetchOpenRouterBenchmarks(key:string):Promise<OpenRouterBenchmarkSnapshot> {
  const response=await fetch("https://openrouter.ai/api/v1/benchmarks?source=openrouter",{ headers:{ Authorization:`Bearer ${key}` }, signal:AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`OpenRouter Benchmarks HTTP ${response.status}`)
  return parseOpenRouterBenchmarks(await response.json() as BenchmarkBody)
}
