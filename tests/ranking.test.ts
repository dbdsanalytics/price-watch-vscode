import { expect, test } from "bun:test"
import { rankOffers } from "../src/domain/ranking"
import type { ModelOffer } from "../src/domain/model"

const make = (id: string, price: number, coding?: number): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input: price, output: price }, benchmarks: coding === undefined ? undefined : { source: "test", coding }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: true, reasoning: true, contextLength: 128000, purposes: ["coding"] } })

test("ranks scored coding models and labels missing benchmarks unrated", () => {
  const ranked = rankOffers([make("cheap", 0), make("smart", 3, 80)], "coding", "all")
  expect(ranked[0]?.offer.id).toBe("smart")
  expect(ranked[1]?.rating).toBe("unrated")
})
