import { describe, expect, test } from "bun:test"
import { isFreePricing, offerKey, usdPerMillion } from "../src/domain/model"

describe("model domain", () => {
  test("converts provider per-token prices to USD per million", () => {
    expect(usdPerMillion("0.000003")).toBe(3)
    expect(usdPerMillion(undefined)).toBe(0)
  })

  test("keeps offers from different providers distinct", () => {
    expect(offerKey({ provider: "openrouter", id: "model-x" })).toBe("openrouter:model-x")
    expect(offerKey({ provider: "opencode-zen", id: "model-x" })).toBe("opencode-zen:model-x")
  })

  test("treats an offer as free only when all billable dimensions are zero", () => {
    expect(isFreePricing({ input: 0, output: 0, request: 0 })).toBe(true)
    expect(isFreePricing({ input: 0, output: 0, request: 1 })).toBe(false)
  })
})
