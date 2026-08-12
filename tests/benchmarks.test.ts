import { expect, test } from "bun:test"
import { enrichProviderBenchmarks } from "../src/domain/benchmarks"
import type { ModelOffer } from "../src/domain/model"

const offer = (provider: ModelOffer["provider"], id: string, benchmarked = false): ModelOffer => ({
  provider, id, name: id, pricing: { input: 1, output: 1 },
  capabilities: { inputModalities:["text"],outputModalities:["text"],tools:true,structuredOutput:false,reasoning:true,contextLength:1000,purposes:["coding"] },
  benchmarks: benchmarked ? { intelligence:58.1,coding:71.8,agentic:58.4,source:"OpenRouter / Artificial Analysis",match:"direct" } : undefined,
})

test("copies a benchmark only from a unique identical base model", () => {
  const snapshots = enrichProviderBenchmarks([
    { provider:"openrouter",checkedAt:1,stale:false,offers:[offer("openrouter","qwen/qwen3.8-max",true)] },
    { provider:"opencode-go",checkedAt:1,stale:false,offers:[offer("opencode-go","qwen3.8-max")] },
  ])
  expect(snapshots[1].offers[0].benchmarks).toMatchObject({ coding:71.8, match:"base-model", source:"OpenRouter / Artificial Analysis · identisches Basismodell" })
})

test("maps free variants to their unique base model but rejects ambiguous suffixes", () => {
  const snapshots = enrichProviderBenchmarks([
    { provider:"openrouter",checkedAt:1,stale:false,offers:[offer("openrouter","deepseek/deepseek-v4-flash",true),offer("openrouter","vendor-a/shared",true),offer("openrouter","vendor-b/shared",true)] },
    { provider:"opencode-zen",checkedAt:1,stale:false,offers:[offer("opencode-zen","deepseek-v4-flash-free"),offer("opencode-zen","shared")] },
  ])
  expect(snapshots[1].offers[0].benchmarks?.match).toBe("base-model")
  expect(snapshots[1].offers[1].benchmarks).toBeUndefined()
})
