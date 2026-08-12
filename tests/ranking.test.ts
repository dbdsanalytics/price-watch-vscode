import { expect, test } from "bun:test"
import { rankOffers } from "../src/domain/ranking"
import type { ModelOffer } from "../src/domain/model"

const make = (id: string, price: number, coding?: number): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input: price, output: price }, benchmarks: coding === undefined ? undefined : { source: "test", coding }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: true, reasoning: true, contextLength: 128000, purposes: ["coding"] } })

test("ranks scored coding models and labels missing benchmarks unrated", () => {
  const ranked = rankOffers([make("cheap", 0), make("smart", 3, 80)], "coding", "all")
  expect(ranked[0]?.offer.id).toBe("smart")
  expect(ranked[1]?.rating).toBe("unrated")
})

test("excludes unknown-price and non-text offers from recommendations", () => {
  const unknown = { ...make("router", 0, 90), pricing: { input: 0, output: 0, unknown: true } }
  const image = { ...make("image", 0, 95), capabilities: { ...make("image", 0).capabilities, outputModalities: ["image"] } }
  expect(rankOffers([unknown, image, make("text", 1, 80)], "coding", "all").map((item) => item.offer.id)).toEqual(["text"])
})
