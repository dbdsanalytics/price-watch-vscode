import { expect, test } from "bun:test"
import { parseOpenRouterBenchmarks } from "../src/providers/openrouter-benchmarks"

test("normalizes OpenRouter benchmark accuracy, cost, samples and timestamp", () => {
  const result = parseOpenRouterBenchmarks({
    meta: { as_of:"2026-08-11T12:00:02.287Z", citation:"Source: OpenRouter evals" },
    data: [{ source:"openrouter", model_permaslug:"google/gemini-3.1-pro-preview-20260219", display_name:"Google: Gemini 3.1 Pro Preview", benchmark_type:"gpqa_diamond", accuracy:0.942761, accuracy_stddev:null, avg_cost_per_task:0.204265636, total_tasks:198, last_run_timestamp:"2026-08-01T08:55:27.055Z" }],
  })
  expect(result.asOf).toBe("2026-08-11T12:00:02.287Z")
  expect(result.items[0]).toEqual({ modelId:"google/gemini-3.1-pro-preview-20260219", modelName:"Google: Gemini 3.1 Pro Preview", benchmark:"gpqa_diamond", score:94.2761, costPerTaskUsd:0.204265636, sampleCount:198, lastRunAt:"2026-08-01T08:55:27.055Z", source:"openrouter" })
})

test("drops malformed benchmark records instead of inventing values", () => {
  const result = parseOpenRouterBenchmarks({ data:[{ model_permaslug:"valid/model", benchmark_type:"gpqa_diamond", accuracy:null },{ benchmark_type:"gpqa_diamond", accuracy:.5 }] })
  expect(result.items).toEqual([])
})
