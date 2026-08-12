import { expect, test } from "bun:test"
import { diffOffers } from "../src/domain/changes"
import type { ModelOffer } from "../src/domain/model"

const offer = (input: number, output: number): ModelOffer => ({ provider: "openrouter", id: "x", name: "X", pricing: { input, output }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["language"] } })

const unknownOffer = (): ModelOffer => ({ ...offer(0, 0), pricing: { input: 0, output: 0, unknown: true } })

test("diffs changed price dimensions", () => {
  expect(diffOffers([offer(1, 2)], [offer(2, 2)])).toMatchObject([{ dimension: "input", previous: 1, current: 2, percent: 100 }])
})

test("ignores offers whose price is currently unknown", () => {
  expect(diffOffers([offer(5, 5)], [unknownOffer()])).toEqual([])
})

test("ignores offers whose previous price was unknown", () => {
  expect(diffOffers([unknownOffer()], [offer(5, 5)])).toEqual([])
})
