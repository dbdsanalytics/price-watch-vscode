import { describe, expect, test } from "bun:test"
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

// Die Benchmarks-API fuehrt drei Quellen. design-arena stellt mit Abstand die
// meisten Messwerte und ist die einzige, die kategoriegenau bewertet — aber
// ihre Zeilen tragen elo und win_rate statt accuracy und wurden bisher still
// verworfen.
describe("design-arena", () => {
  const row = {
    source: "design-arena", model_permaslug: "z-ai/glm-5.2-20260616", display_name: "GLM 5.2",
    arena: "models", category: "website", elo: 1332, win_rate: 59.6,
    avg_generation_time_ms: 288_000, tournament_stats: { total: 4487 },
  }

  test("uebernimmt Arena-Zeilen mit Kategorie, ELO und Siegquote", () => {
    const [item] = parseOpenRouterBenchmarks({ data: [row] }).items
    expect(item.modelId).toBe("z-ai/glm-5.2-20260616")
    expect(item.benchmark).toBe("arena_website")
    expect(item.score).toBe(59.6)
    expect(item.elo).toBe(1332)
    expect(item.sampleCount).toBe(4487)
  })

  test("verwirft Arena-Zeilen ohne Kategorie oder ohne Siegquote", () => {
    expect(parseOpenRouterBenchmarks({ data: [{ ...row, category: undefined }] }).items).toHaveLength(0)
    expect(parseOpenRouterBenchmarks({ data: [{ ...row, win_rate: "viel" }] }).items).toHaveLength(0)
  })

  test("laesst die bisherigen accuracy-Zeilen unveraendert", () => {
    const [item] = parseOpenRouterBenchmarks({ data: [{ source: "openrouter", model_permaslug: "x", benchmark_type: "gpqa_diamond", accuracy: 0.883 }] }).items
    expect(item.benchmark).toBe("gpqa_diamond")
    expect(item.score).toBeCloseTo(88.3)
    expect(item.elo).toBeUndefined()
  })
})

// Such-Benchmarks melden primary_score statt accuracy und wurden deshalb
// ebenfalls still verworfen — betrifft 13 Zeilen ueber wenige Modelle.
test("uebernimmt Such-Benchmarks mit primary_score", () => {
  const [item] = parseOpenRouterBenchmarks({ data: [{ source: "openrouter", model_permaslug: "anthropic/claude-opus-5", benchmark_type: "search_browsecomp", primary_metric: "accuracy", primary_score: 0.892, total_tasks: 100 }] }).items
  expect(item.benchmark).toBe("search_browsecomp")
  expect(item.score).toBeCloseTo(89.2)
  expect(item.sampleCount).toBe(100)
})
