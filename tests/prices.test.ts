import { describe, expect, test } from "bun:test"
import { fmt, hashOf, klass, norm, parseZenMdx, summary, toUsd } from "../src/prices"

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

describe("fmt", () => {
  test("formatiert Preise kompakt", () => {
    expect(fmt(0)).toBe("0")
    expect(fmt(0.088)).toBe("0.088")
    expect(fmt(1.2)).toBe("1.2")
    expect(fmt(30)).toBe("30")
    expect(fmt(0.005)).toBe("0.005")
  })
})

describe("klass", () => {
  test("klassifiziert Preisklassen", () => {
    expect(klass(0, 0).label).toBe("kostenlos")
    expect(klass(0.1, 0.2).label).toBe("billig")
    expect(klass(1, 1).label).toBe("mittel")
    expect(klass(5, 30).label).toBe("Premium")
  })
})

describe("parseZenMdx", () => {
  const fixture = `## Endpoints
| Model                  | Model ID               | Endpoint                                                  | AI SDK Package              |
| ---------------------- | ---------------------- | --------------------------------------------------------- | --------------------------- |
| GPT 5.6 Luna           | gpt-5.6-luna           | \`https://opencode.ai/zen/v1/responses\`                    | \`@ai-sdk/openai\`            |
| DeepSeek V4 Flash      | deepseek-v4-flash      | \`https://opencode.ai/zen/v1/chat/completions\`             | \`@ai-sdk/openai-compatible\` |
| Big Pickle             | big-pickle             | \`https://opencode.ai/zen/v1/chat/completions\`             | \`@ai-sdk/openai-compatible\` |

## Pricing

We support a pay-as-you-go model. Below are the prices **per 1M tokens**.

| Model                             | Input  | Output  | Cached Read | Cached Write |
| --------------------------------- | ------ | ------- | ----------- | ------------ |
| Big Pickle                        | Free   | Free    | Free        | -            |
| DeepSeek V4 Flash                 | $0.14  | $0.28   | $0.028      | -            |
| GPT 5.6 Luna (≤ 272K tokens)      | $0.20  | $1.20   | $0.02       | $0.25        |
| GPT 5.6 Luna (> 272K tokens)      | $0.40  | $1.80   | $0.04       | $0.50        |

## Deprecated models

| Model            | Deprecation date |
| ---------------- | ---------------- |
| GPT 5.2 Codex    | July 23, 2026    |
`

  test("parst ID-Tabelle und Preis-Tabelle", () => {
    const rows = parseZenMdx(fixture)
    expect(rows).toHaveLength(3)
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get("big-pickle")).toMatchObject({ pt: 0, ct: 0 })
    expect(byId.get("deepseek-v4-flash")).toMatchObject({ pt: 0.14, ct: 0.28 })
    expect(byId.get("gpt-5.6-luna")).toMatchObject({ pt: 0.2, ct: 1.2 })
  })

  test("liefert leere Liste bei unbekanntem Format (kein Crash)", () => {
    expect(parseZenMdx("keine Tabelle hier\n| nur müll |")).toEqual([])
  })
})

describe("hashOf + summary", () => {
  test("hash unterscheidet Änderungen", () => {
    const a = [{ id: "x", name: "X", pt: 1, ct: 2 }]
    const b = [{ id: "x", name: "X", pt: 1, ct: 3 }]
    expect(hashOf(a, a)).toBe(hashOf(a, a))
    expect(hashOf(a, b)).not.toBe(hashOf(a, a))
  })

  test("summary nennt kostenlose und günstigste", () => {
    const rows = [
      { id: "a", name: "A", pt: 0, ct: 0 },
      { id: "b", name: "B", pt: 5, ct: 30 },
      { id: "c", name: "C", pt: 0.1, ct: 0.2 },
    ]
    const s = summary(rows, "OpenRouter")
    expect(s).toContain("OpenRouter: 3 Modelle, 1 kostenlos")
    expect(s).toContain("c (0.1/0.2$)")
  })
})
