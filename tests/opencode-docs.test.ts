import { describe, expect, test } from "bun:test"
import { parseGoDocument, parseZenDocument } from "../src/providers/opencode-docs"

const endpoints = `| Model | Model ID | Endpoint |
| --- | --- | --- |
| DeepSeek V4 Flash | deepseek-v4-flash | \`https://opencode.ai/zen/v1/chat/completions\` |`

test("parses Zen pay-as-you-go offers", () => {
  const offers = parseZenDocument(`${endpoints}\n## Pricing\n| Model | Input | Output | Cached Read | Cached Write |\n|---|---|---|---|---|\n| DeepSeek V4 Flash | $0.14 | $0.28 | $0.0028 | - |`)
  expect(offers[0]).toMatchObject({ provider: "opencode-zen", id: "deepseek-v4-flash", pricing: { input: 0.14, output: 0.28 } })
})

describe("Go document", () => {
  test("keeps subscription metadata and price tiers", () => {
    const catalog = parseGoDocument(`${endpoints}\n$5 for your first month, then $10/month\n## Usage limits\n| Model | Input | Output | Cached Read | Cached Write | Monthly |\n|---|---|---|---|---|---|\n| DeepSeek V4 Flash | $0.14 | $0.28 | $0.0028 | - | $60 |`)
    expect(catalog.subscription).toEqual({ firstMonthUsd: 5, monthlyUsd: 10 })
    expect(catalog.offers[0]).toMatchObject({ provider: "opencode-go", id: "deepseek-v4-flash" })
  })
})
