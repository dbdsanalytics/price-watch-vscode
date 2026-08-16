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

test("adds detailed API benchmarks only to the exact OpenRouter model", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro"),offer("openrouter","google/gemini-flash")] }]
  const enriched=enrichProviderBenchmarks(snapshots,{ fetchedAt:2, asOf:"2026-08-11T12:00:00Z", items:[{ modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:94.2, costPerTaskUsd:.2, sampleCount:198, lastRunAt:"2026-08-01T08:00:00Z", source:"openrouter" }] })
  expect(enriched[0].offers[0].benchmarks?.details?.[0]).toMatchObject({ name:"gpqa_diamond", score:94.2, costPerTaskUsd:.2, sampleCount:198 })
  expect(enriched[0].offers[1].benchmarks?.details).toBeUndefined()
})

test("matches OpenRouter's exact canonical slug without fuzzy names", () => {
  const canonical={ ...offer("openrouter","google/gemini-pro"), benchmarkId:"google/gemini-pro-20260801" }
  const enriched=enrichProviderBenchmarks([{ provider:"openrouter",checkedAt:1,stale:false,offers:[canonical] }],{ fetchedAt:2,items:[{ modelId:"google/gemini-pro-20260801",benchmark:"gpqa_diamond",score:90,source:"openrouter" }] })
  expect(enriched[0].offers[0].benchmarks?.details?.[0]?.score).toBe(90)
})

test("aggregates detail benchmarks into the three dimension scores", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:94.2, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"arena_codecategories", score:71.8, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"tau_bench_verified_airline", score:58.4, source:"openrouter" },
  ]})
  expect(enriched[0].offers[0].benchmarks).toMatchObject({ intelligence:94.2, coding:71.8, agentic:58.4 })
  expect(enriched[0].offers[0].benchmarks?.details).toHaveLength(3)
  expect(enriched[0].offers[0].benchmarks?.details?.[0]).toMatchObject({ name:"gpqa_diamond", score:94.2 })
})

test("averages multiple entries of the same dimension, rounded to one decimal", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:90, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:92.16, source:"openrouter" },
  ]})
  expect(enriched[0].offers[0].benchmarks?.intelligence).toBe(91.1)
})

test("keeps unassigned benchmarks out of dimension scores but visible in details", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"arena_website", score:59.6, elo:1332, sampleCount:4487, source:"design-arena" },
  ]})
  expect(enriched[0].offers[0].benchmarks?.intelligence).toBeUndefined()
  expect(enriched[0].offers[0].benchmarks?.coding).toBeUndefined()
  expect(enriched[0].offers[0].benchmarks?.agentic).toBeUndefined()
  expect(enriched[0].offers[0].benchmarks?.details?.[0]).toMatchObject({ name:"arena_website", score:59.6 })
})

test("keeps existing dimension scores untouched when details are added", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro",true)] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:94.2, source:"openrouter" },
  ]})
  expect(enriched[0].offers[0].benchmarks).toMatchObject({ intelligence:58.1, coding:71.8, agentic:58.4 })
  expect(enriched[0].offers[0].benchmarks?.details?.[0]?.score).toBe(94.2)
})

test("aggregation is deterministic and tolerates empty details", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const api = { fetchedAt:2, items:[{ modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:94.2, source:"openrouter" }] }
  expect(enrichProviderBenchmarks(snapshots, api)[0].offers[0].benchmarks)
    .toEqual(enrichProviderBenchmarks(snapshots, api)[0].offers[0].benchmarks)
  expect(enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[] })[0].offers[0].benchmarks).toBeUndefined()
})

test("wins per dimension: existing catalog scores stay, missing ones are aggregated in", () => {
  // Der Katalog kennt nur intelligence, die API liefert dazu Details fuer
  // intelligence UND coding: der Katalogwert gewinnt je Dimension einzeln,
  // die unbelegte Dimension wird aus den Details gefuellt.
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[{ ...offer("openrouter","google/gemini-pro"), benchmarks:{ intelligence:58.1, source:"Artificial Analysis", match:"direct" as const } }] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:94.2, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"arena_codecategories", score:71.8, source:"openrouter" },
  ]})
  expect(enriched[0].offers[0].benchmarks?.intelligence).toBe(58.1)
  expect(enriched[0].offers[0].benchmarks?.coding).toBe(71.8)
  expect(enriched[0].offers[0].benchmarks?.agentic).toBeUndefined()
  expect(enriched[0].offers[0].benchmarks?.source).toBe("Artificial Analysis")
})

test("catalog score wins even when it is lower than the aggregated details", () => {
  // Gegenprobe zu "wins per dimension": Der Katalog traegt intelligence 50,
  // die API liefert 94.2 — der Katalogwert gewinnt IMMER, auch wenn er
  // niedriger ist; es wird kein Mittelwert (50 + 94.2) / 2 = 72.1 gebildet.
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[{ ...offer("openrouter","google/gemini-pro"), benchmarks:{ intelligence:50, source:"Artificial Analysis", match:"direct" as const } }] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:94.2, source:"openrouter" },
  ]})
  expect(enriched[0].offers[0].benchmarks?.intelligence).toBe(50)
  expect(enriched[0].offers[0].benchmarks?.intelligence).not.toBe(72.1)
  expect(enriched[0].offers[0].benchmarks?.details?.[0]?.score).toBe(94.2)
})

test("skips non-finite scores instead of poisoning the average", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:90, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:Number.NaN, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:92.16, source:"openrouter" },
  ]})
  // NaN zaehlt weder in die Summe noch in den Nenner: (90 + 92.16) / 2.
  expect(enriched[0].offers[0].benchmarks?.intelligence).toBe(91.1)
})

test("skips infinite scores instead of poisoning the average", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:90, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:Infinity, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:-Infinity, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:92.16, source:"openrouter" },
  ]})
  // Infinity und -Infinity zaehlen weder in Summe noch Nenner:
  // (90 + 92.16) / 2 = 91.08 -> 91.1, das Ergebnis bleibt endlich.
  const intelligence = enriched[0].offers[0].benchmarks?.intelligence
  expect(intelligence).toBe(91.1)
  expect(Number.isFinite(intelligence ?? Number.NaN)).toBe(true)
})

test("rounds downward to one decimal as well", () => {
  const snapshots = [{ provider:"openrouter" as const, checkedAt:1, stale:false, offers:[offer("openrouter","google/gemini-pro")] }]
  const enriched = enrichProviderBenchmarks(snapshots, { fetchedAt:2, items:[
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:90.01, source:"openrouter" },
    { modelId:"google/gemini-pro", benchmark:"gpqa_diamond", score:90.02, source:"openrouter" },
  ]})
  // (90.01 + 90.02) / 2 = 90.015 -> 90.0, nicht 90.1.
  expect(enriched[0].offers[0].benchmarks?.intelligence).toBe(90)
})
