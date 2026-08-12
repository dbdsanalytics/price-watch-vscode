import { expect, test } from "bun:test"
import { assessAgent } from "../src/agents/assessment"
import type { ModelOffer } from "../src/domain/model"

const offer = (id: string, cost: number, coding?: number): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input: cost, output: cost }, benchmarks: coding === undefined ? undefined : { source: "test", coding }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: true, reasoning: true, contextLength: 100000, purposes: ["coding"] } })

test("does not recommend an unrated model as a cheaper equivalent", () => {
  const result = assessAgent({ name: "reviewer", description: "Reviews code", model: "openrouter/current", tools: [], prompt: "local" }, [offer("current", 10, 80), offer("cheap-unrated", 1)])
  expect(result.status).toBe("suitable")
  expect(result.alternative).toBeUndefined()
})

test("describes local models separately from missing public catalog data", () => {
  const result = assessAgent({ name: "translate", description: "Translation", model: "lmstudio/qwen", modelSource: "explicit", tools: [], prompt: "local" }, [])
  expect(result).toMatchObject({ status: "local", reason: "Lokales Modell · keine öffentlichen Preis- oder Benchmarkdaten" })
})
