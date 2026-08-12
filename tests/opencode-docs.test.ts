import { describe, expect, test } from "bun:test"
import { norm, parseGoDocument, parseZenDocument, requireOffers, toUsd } from "../src/providers/opencode-docs"

describe("norm", () => {
  test("entfernt Klammer-Inhalte und normalisiert", () => {
    expect(norm("GPT 5.6 Luna (≤ 272K tokens)")).toBe("gpt-5.6-luna")
    expect(norm("DeepSeek V4 Flash")).toBe("deepseek-v4-flash")
    expect(norm("Claude Sonnet 4.6")).toBe("claude-sonnet-4.6")
  })
})

describe("toUsd", () => {
  test("parst Dollar-Zellen", () => {
    expect(toUsd("$0.14")).toBe(0.14)
    expect(toUsd("Free")).toBe(0)
    expect(toUsd("-")).toBe(0)
    expect(toUsd(undefined)).toBe(0)
  })
})

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

  test("parses prices when official docs wrap amounts in markdown emphasis", () => {
    const catalog = parseGoDocument("OpenCode Go — **$5 for your first month**, then **$10/month**")
    expect(catalog.subscription).toEqual({ firstMonthUsd: 5, monthlyUsd: 10 })
  })
})

describe("requireOffers", () => {
  // Die Quelle ist der dev-Branch eines fremden Repos. Aendert sich dort die
  // Ueberschrift oder die Endpunkt-Tabelle, lieferte der Parser stumm eine
  // leere Liste — der Abruf galt als erfolgreich und die zuletzt bekannten
  // Preise wurden verworfen. Ein leeres Ergebnis ist ein Fehler, kein Zustand.
  test("meldet einen Fehler mit Anbietername, wenn nichts geparst wurde", () => {
    expect(() => requireOffers("opencode-zen", [])).toThrow(/opencode-zen/)
    expect(() => requireOffers("opencode-go", [])).toThrow(/opencode-go/)
  })

  test("reicht vorhandene Angebote unveraendert durch", () => {
    const offers = parseZenDocument(`${endpoints}\n## Pricing\n| Model | Input | Output |\n|---|---|---|\n| DeepSeek V4 Flash | $0.14 | $0.28 |`)
    expect(requireOffers("opencode-zen", offers)).toBe(offers)
  })

  test("umbenannte Ueberschrift fuehrt ueber requireOffers zum Fehler", () => {
    const umbenannt = `${endpoints}\n## Preise\n| Model | Input | Output |\n|---|---|---|\n| DeepSeek V4 Flash | $0.14 | $0.28 |`
    expect(parseZenDocument(umbenannt)).toHaveLength(0)
    expect(() => requireOffers("opencode-zen", parseZenDocument(umbenannt))).toThrow()
  })
})
