import { describe, expect, test } from "bun:test"
import { norm, parseGoDocument, parseZenDocument, requireOffers, toUsd } from "../src/providers/opencode-docs"
import { isFreePricing } from "../src/domain/model"

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
    expect(toUsd("$0.0028")).toBe(0.0028)
    expect(toUsd("Free")).toBe(0)
  })

  // "Free" ist eine Aussage, ein unlesbarer Wert ist keine. Beides als 0 zu
  // lesen liess bezahlte Modelle im Kostenlos-Ranking auftauchen.
  test("meldet Unlesbares als unbekannt statt als kostenlos", () => {
    expect(toUsd("-")).toBeUndefined()
    expect(toUsd(undefined)).toBeUndefined()
    expect(toUsd("")).toBeUndefined()
    expect(toUsd("1,40 $")).toBeUndefined()
    expect(toUsd("$1.40/M")).toBeUndefined()
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
    // Gestufte Modelle behalten die Basisstufe; die Stufe steht in tier, nicht im Namen.
    const luna = offers.find((offer) => offer.id === "gpt-5.6-luna")!
    expect(luna.pricing).toMatchObject({ input: 0.2, output: 1.2 })
    expect(luna.name).toBe("GPT 5.6 Luna")
    expect(luna.tier).toBe("≤ 272K tokens")
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

// Regel 1 aus AGENTS.md galt bisher nur fuer ganze Dokumente. Eine einzelne
// unlesbare Zelle machte aus einem bezahlten Modell ein kostenloses.
describe("unlesbare Preiszellen", () => {
  const doc = (input: string) => `${endpoints}\n## Pricing\n| Model | Input | Output |\n|---|---|---|\n| DeepSeek V4 Flash | ${input} | $0.28 |`

  test("markiert das Angebot als unbekannt und nicht als kostenlos", () => {
    const [offer] = parseZenDocument(doc("1,40 $"))
    expect(offer.pricing.unknown).toBe(true)
    expect(isFreePricing(offer.pricing)).toBe(false)
  })

  test("laesst echte Gratis-Modelle kostenlos", () => {
    const [offer] = parseZenDocument(`${endpoints}\n## Pricing\n| Model | Input | Output |\n|---|---|---|\n| DeepSeek V4 Flash | Free | Free |`)
    expect(offer.pricing.unknown).toBeUndefined()
    expect(isFreePricing(offer.pricing)).toBe(true)
  })

  // toUsd liefert jetzt undefined statt 0; die Kontingent-Berechnung muss das
  // abfangen, sonst verschwindet die enthaltene Monatsnutzung.
  test("laesst die Kontingentwerte unberuehrt", async () => {
    const offers = parseGoDocument(await Bun.file(`${import.meta.dir}/fixtures-go.mdx`).text()).offers
    expect(offers.find((offer) => offer.id === "deepseek-v4-flash")!.quota).toMatchObject({ requestsPerMonth: 158_150, includedUsdPerMonth: 60 })
    // MiniMax M2.5 fehlt in der Anfragen-Tabelle der Quelle: uebrige Werte bleiben.
    expect(offers.find((offer) => offer.id === "minimax-m2.5")!.quota).toEqual({ includedUsdPerMonth: 60 })
  })
})

// Zen und Go fuehren dasselbe Modell zweimal: "(≤ 272K tokens)" und
// "(> 272K tokens)". Da norm() Klammern entfernt, kollidierten die IDs und die
// teure Stufe wurde verworfen — GPT 5.6 Sol erschien mit $5 statt $5–10.
describe("gestufte Preise", () => {
  const zen = async () => parseZenDocument(await Bun.file(`${import.meta.dir}/fixtures-zen.mdx`).text())

  test("fuehrt beide Stufen eines Modells zusammen", async () => {
    const sol = (await zen()).find((offer) => offer.id === "gpt-5.6-sol")!
    expect(sol.name).toBe("GPT 5.6 Sol")
    expect(sol.tier).toBe("≤ 272K tokens")
    expect(sol.pricing).toMatchObject({ input: 5, output: 30 })
    expect(sol.pricing.tiers).toEqual([{ thresholdTokens: 272_000, label: "> 272K tokens", input: 10, output: 45 }])
  })

  test("erkennt auch die 200K-Schwelle", async () => {
    const grok = (await zen()).find((offer) => offer.id === "grok-4.6")!
    expect(grok.pricing).toMatchObject({ input: 2, output: 6 })
    expect(grok.pricing.tiers).toEqual([{ thresholdTokens: 200_000, label: "> 200K tokens", input: 4, output: 12 }])
  })

  test("erzeugt weiterhin genau ein Angebot je Modell", async () => {
    const offers = await zen()
    const ids = offers.map((offer) => offer.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(offers).toHaveLength(61)
    expect(offers.filter((offer) => offer.pricing.tiers?.length)).toHaveLength(9)
  })

  test("Go liest die Stufen ebenso", async () => {
    const offers = parseGoDocument(await Bun.file(`${import.meta.dir}/fixtures-go.mdx`).text()).offers
    const qwen = offers.find((offer) => offer.id === "qwen3.6-plus")!
    expect(qwen.pricing).toMatchObject({ input: 0.5, output: 3 })
    expect(qwen.pricing.tiers).toEqual([{ thresholdTokens: 256_000, label: "> 256K tokens", input: 2, output: 6 }])
    expect(offers).toHaveLength(19)
    expect(offers.filter((offer) => offer.pricing.tiers?.length)).toHaveLength(3)
  })

  test("einstufige Modelle bekommen kein tiers-Feld", async () => {
    expect((await zen()).find((offer) => offer.id === "kimi-k3")!.pricing.tiers).toBeUndefined()
  })
})
