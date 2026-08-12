import type { OpenRouterBenchmarkSnapshot } from "../providers/openrouter-benchmarks"

export const BENCHMARK_CACHE_KEY="priceWatch.openrouterBenchmarks.v1"
export const BENCHMARK_CACHE_TTL_MS=86_400_000

export interface BenchmarkStorage {
  get<T>(key:string):T|undefined
  update(key:string,value:unknown):PromiseLike<void>
}

function valid(value:unknown):value is OpenRouterBenchmarkSnapshot {
  if (!value || typeof value !== "object") return false
  const item=value as Partial<OpenRouterBenchmarkSnapshot>
  return typeof item.fetchedAt === "number" && Array.isArray(item.items)
}

export async function loadBenchmarks(storage:BenchmarkStorage,key:string,forceRefresh:boolean,loader:(key:string)=>Promise<OpenRouterBenchmarkSnapshot>,now=Date.now()):Promise<OpenRouterBenchmarkSnapshot|null> {
  const value=storage.get<unknown>(BENCHMARK_CACHE_KEY)
  const cached=valid(value) ? value : null
  if (cached && !forceRefresh && now-cached.fetchedAt < BENCHMARK_CACHE_TTL_MS) return cached
  try {
    const fresh=await loader(key)
    await storage.update(BENCHMARK_CACHE_KEY,fresh)
    return fresh
  } catch {
    return cached
  }
}
