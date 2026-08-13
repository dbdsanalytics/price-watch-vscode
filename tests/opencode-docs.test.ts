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

// Der Abschnitt "Usage limits" im Go-Dokument enthaelt ZWEI Tabellen: erst die
// Anfragen pro Zeitraum, dann die Preise. Der Parser las beide als Preise —
// "120 Anfragen pro 5 Stunden" wurde zu 120 Dollar je Million Token, und
// "2,150" verstuemmelte parseFloat zu 2.
describe("Go: zwei Tabellen im selben Abschnitt", () => {
  const doc = `${endpoints}
$5 for your first month, then $10/month
## Usage limits
| Model | requests per 5 hour | requests per week | requests per month |
| --- | --- | --- | --- |
| DeepSeek V4 Flash | 31,650 | 79,050 | 158,150 |
| GPT 5.6 Luna | 2,050 | 5,100 | 10,250 |

| Model | Input | Output | Cached Read | Cached Write | Usage |
| --- | --- | --- | --- | --- | --- |
| DeepSeek V4 Flash | $0.14 | $0.28 | $0.0028 | - | $60 |
`

  test("liest nur die Preistabelle, nicht die Anfragen-Tabelle", () => {
    const offers = parseGoDocument(doc).offers
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ id: "deepseek-v4-flash", pricing: { input: 0.14, output: 0.28 } })
  })

  test("erzeugt keine doppelten Eintraege je Modell", () => {
    const ids = parseGoDocument(doc).offers.map((offer) => offer.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("am echten Dokument: keine Duplikate und keine Fantasiepreise", async () => {
    const offers = parseGoDocument(await Bun.file(`${import.meta.dir}/fixtures-go.mdx`).text()).offers
    const ids = offers.map((offer) => offer.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(offers.filter((offer) => offer.pricing.input > 50)).toHaveLength(0)
    // Gestufte Modelle behalten die Basisstufe, und der Name benennt sie.
    const luna = offers.find((offer) => offer.id === "gpt-5.6-luna")!
    expect(luna.pricing).toMatchObject({ input: 0.2, output: 1.2 })
    expect(luna.name).toContain("272K")
  })
})

// Bei OpenCode Go entscheidet nicht der Token-Preis, sondern wie viele
// Anfragen das Abo hergibt: Qwen3.8 Max erlaubt 810 im Monat, DeepSeek V4
// Flash 158.150 — Faktor 195 bei nur 25-fachem Preis.
describe("Go: Kontingent", () => {
  test("liest Anfragen je Zeitraum und die enthaltene Monatsnutzung", async () => {
    const offers = parseGoDocument(await Bun.file(`${import.meta.dir}/fixtures-go.mdx`).text()).offers
    const flash = offers.find((offer) => offer.id === "deepseek-v4-flash")!
    expect(flash.quota).toMatchObject({ requestsPerMonth: 158_150, requestsPerWeek: 79_050, requestsPer5Hours: 31_650, includedUsdPerMonth: 60 })
    const max = offers.find((offer) => offer.id === "qwen3.8-max")!
    expect(max.quota).toMatchObject({ requestsPerMonth: 810, includedUsdPerMonth: 15 })
  })

  test("verkraftet Tausendertrennzeichen", async () => {
    const offers = parseGoDocument(await Bun.file(`${import.meta.dir}/fixtures-go.mdx`).text()).offers
    // "2,150" darf nicht als 2 ankommen.
    expect(offers.find((offer) => offer.id === "gpt-5.6-luna")!.quota?.requestsPerWeek).toBe(5_100)
  })

  test("Zen kennt kein Kontingent", () => {
    const zen = parseZenDocument(`${endpoints}\n## Pricing\n| Model | Input | Output |\n|---|---|---|\n| DeepSeek V4 Flash | $0.14 | $0.28 |`)
    expect(zen[0].quota).toBeUndefined()
  })
})
