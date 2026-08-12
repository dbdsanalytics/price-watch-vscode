import { expect, test } from "bun:test"
import { rankOffers } from "../src/domain/ranking"
import type { ModelOffer } from "../src/domain/model"

const make = (id: string, price: number, coding?: number): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input: price, output: price }, benchmarks: coding === undefined ? undefined : { source: "test", coding }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: true, reasoning: true, contextLength: 128000, purposes: ["coding"] } })

test("ranks scored coding models and labels missing benchmarks unrated", () => {
  const ranked = rankOffers([make("cheap", 0), make("smart", 3, 80)], "coding", "all")
  expect(ranked[0]?.offer.id).toBe("smart")
  expect(ranked[1]?.rating).toBe("unrated")
})

test("includes models with a coding benchmark even when the description hid the purpose", () => {
  const undeclared = { ...make("undeclared", 2, 90), capabilities: { ...make("undeclared", 2).capabilities, purposes: ["language" as const] } }
  expect(rankOffers([undeclared, make("declared", 1, 70)], "coding", "all")[0]?.offer.id).toBe("undeclared")
})

test("keeps purpose filtering intact for models without a benchmark", () => {
  const other = { ...make("other", 1), capabilities: { ...make("other", 1).capabilities, purposes: ["vision" as const] } }
  expect(rankOffers([other], "coding", "all")).toEqual([])
})

test("excludes unknown-price and non-text offers from recommendations", () => {
  const unknown = { ...make("router", 0, 90), pricing: { input: 0, output: 0, unknown: true } }
  const image = { ...make("image", 0, 95), capabilities: { ...make("image", 0).capabilities, outputModalities: ["image"] } }
  expect(rankOffers([unknown, image, make("text", 1, 80)], "coding", "all").map((item) => item.offer.id)).toEqual(["text"])
})
