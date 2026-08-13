# Datenverlässlichkeit — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die OpenCode-Parser sollen keine falschen oder unvollständigen Preise mehr liefern — gestufte Preise vollständig, unlesbare Zellen als unbekannt statt kostenlos, und eine Warnung, wenn sich die Quelle strukturell ändert.

**Architecture:** `input`/`output` bleiben die günstigste Stufe, damit Ranking, `diffOffers` und Verlauf unverändert weiterlaufen; obere Stufen kommen additiv als `pricing.tiers` dazu. `toUsd` unterscheidet künftig „kostenlos" von „unlesbar" und setzt das bereits vorhandene `unknown`-Flag, das `isFreePricing` und `rankOffers` schon auswerten. Der Plausibilitätswächter ist eine zustandslose Funktion neben `carryForwardOffers`, die in `refresh` aufgerufen wird.

**Tech Stack:** TypeScript 5.6, Bun als Testrunner, esbuild als Bundler, keine Produktionsabhängigkeiten.

Entwurf: `docs/superpowers/specs/2026-08-13-datenverlaesslichkeit-design.md`

## Global Constraints

- **Keine Produktionsabhängigkeiten.** Nichts zu `dependencies` in `package.json` hinzufügen.
- **Branch:** `datenverlaesslichkeit`. Arbeitsverzeichnis `/Users/dadakbiranvand/Projects/price-watch-vscode`.
- **Alles, was im Webview aus einer Quelle stammt, läuft durch `esc()`.**
- **Secrets niemals** in `DashboardState`, ins Webview oder ins Log.
- **Kommentare und Nutzertexte auf Deutsch**, passend zum Bestand. Kommentare begründen das *Warum*, nicht das *Was*.
- **Nach jeder Task grün:** `npm run typecheck && npm test && npm run build`.
- **`tests/fixtures-go.mdx` nicht anfassen** — bereits byte-identisch mit der Live-Quelle.

## File Structure

| Datei | Verantwortung | Task |
|---|---|---|
| `src/providers/opencode-docs.ts` | Markdown → `ModelOffer`; Zellen lesen, Stufen zusammenführen | 1, 2 |
| `src/domain/model.ts` | Datenmodell: `PriceTier`, `ModelPricing.tiers` | 2 |
| `src/domain/provider.ts` | `ProviderSnapshot.warning` | 3 |
| `src/domain/snapshots.ts` | `plausibilityWarning` neben `carryForwardOffers` | 3 |
| `src/extension.ts` | Wächter im Refresh-Zyklus aufrufen | 3 |
| `src/panel.ts` | Preisspanne, fehlendes Kontingent, Warnhinweis | 4 |
| `tests/fixtures-zen.mdx` | eingefrorenes Zen-Dokument vom 2026-08-13 | 2 |

---

### Task 1: Unlesbare Preiszellen als „unbekannt" statt „kostenlos"

`toUsd` gibt bei allem Unparsebaren `0` zurück — dieselbe `0` wie bei `"Free"`. Ein bezahltes Modell mit geänderter Schreibweise erscheint dadurch im *Kostenlos*-Ranking. Nach dieser Task liefert `toUsd` `undefined`, und der Aufrufer setzt `unknown: true`.

**Files:**
- Modify: `src/providers/opencode-docs.ts:9-15` (`toUsd`), `:77-80` (Aufrufer in `parsePricing`)
- Test: `tests/opencode-docs.test.ts:12-19` (bestehende Erwartungen), neuer Block

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: `toUsd(cell: string | undefined): number | undefined` — Task 2 ruft dieselbe Funktion für die Stufenzeilen auf.

- [ ] **Step 1: Bestehende `toUsd`-Erwartungen anpassen und den neuen Fall ergänzen**

Zwei bestehende Zeilen erwarten bisher `0` und müssen umgeschrieben werden. In `tests/opencode-docs.test.ts` den `describe("toUsd", …)`-Block ersetzen durch:

```ts
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
```

- [ ] **Step 2: Test für das `unknown`-Flag am Angebot ergänzen**

Ans Ende von `tests/opencode-docs.test.ts` anfügen:

```ts
// Regel 1 aus AGENTS.md galt bisher nur fuer ganze Dokumente. Eine einzelne
// unlesbare Zelle machte aus einem bezahlten Modell ein kostenloses.
describe("unlesbare Preiszellen", () => {
  const doc = (input: string) => `${endpoints}\n## Pricing\n| Model | Input | Output |\n|---|---|---|\n| DeepSeek V4 Flash | ${input} | $0.28 |`

  test("markiert das Angebot als unbekannt und nicht als kostenlos", () => {
    const [offer] = parseZenDocument(doc("1,40 $"))
    expect(offer.pricing.unknown).toBe(true)
    expect(isFreePricing(offer.pricing)).toBe(false)
  })

  // Beide Spalten muessen "Free" tragen: mit "$0.28" im Output waere das
  // Modell zu Recht nicht kostenlos, und der Test pruefte nichts.
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
```

Den Import in Zeile 2 des Testfiles um `isFreePricing` erweitern:

```ts
import { isFreePricing } from "../src/domain/model"
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/opencode-docs.test.ts`
Expected: FAIL — `toUsd("-")` liefert noch `0`, `offer.pricing.unknown` ist `undefined`.

- [ ] **Step 4: `toUsd` umstellen**

In `src/providers/opencode-docs.ts` die Funktion ersetzen:

```ts
/**
 * Dollar-Zelle der Preistabelle lesen. "Free" ist eine Aussage und ergibt 0;
 * alles Unlesbare ergibt undefined, damit es nicht als kostenlos durchgeht.
 */
export function toUsd(cell: string | undefined): number | undefined {
  const value = String(cell ?? "").trim()
  if (/^free$/i.test(value)) return 0
  const match = value.match(/^\$?(\d+(?:\.\d+)?)$/)
  return match ? Number(match[1]) : undefined
}
```

- [ ] **Step 5: Aufrufer in `parsePricing` anpassen**

Die Zeilen, die `offers.push(...)` vorbereiten (aktuell `:77-80`), ersetzen durch:

```ts
    const included = usageColumn > 0 ? toUsd(row[usageColumn]) ?? 0 : 0
    const counted = requests.get(base) ?? requests.get(base.replace(/-tokens$/, ""))
    const quota: ModelQuota | undefined = included || counted ? { ...counted, ...(included ? { includedUsdPerMonth: included } : {}) } : undefined
    const input = toUsd(row[1]), output = toUsd(row[2])
    const unknown = input === undefined || output === undefined
    offers.push({ provider, id, name: row[0], ...(quota ? { quota } : {}), pricing: { input: input ?? 0, output: output ?? 0, ...(unknown ? { unknown: true } : {}), cacheRead: toUsd(row[3]) ?? 0, cacheWrite: toUsd(row[4]) ?? 0 }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } })
```

Die Cache-Spalten behalten `?? 0`: Dort bedeutet `-` „nicht angeboten", nicht „unbekannt".

- [ ] **Step 6: Tests laufen lassen, grün bestätigen**

Run: `npm run typecheck && npm test`
Expected: PASS, alle Dateien.

- [ ] **Step 7: Commit**

```bash
git add src/providers/opencode-docs.ts tests/opencode-docs.test.ts
git commit -m "fix: treat unreadable price cells as unknown, not free

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Gestufte Preise vollständig lesen

`parsePricing` verwirft jede Zeile mit bereits bekannter ID. Da `norm()` Klammern entfernt, fällt damit die obere Preisstufe weg — bei elf Modellen, teils zum doppelten Preis. Nach dieser Task trägt das Angebot die Basisstufe in `input`/`output` und die obere in `pricing.tiers`.

**Files:**
- Modify: `src/domain/model.ts` (neuer Typ `PriceTier`, Feld `tiers`)
- Modify: `src/providers/opencode-docs.ts` (neue Funktion `splitTier`, Zusammenführung statt `:76`)
- Create: `tests/fixtures-zen.mdx`
- Test: `tests/opencode-docs.test.ts` (neuer Block; **bestehender Test `:99-103` muss angepasst werden**)

**Interfaces:**
- Consumes: `toUsd(cell): number | undefined` aus Task 1.
- Produces: `PriceTier { thresholdTokens: number; label: string; input: number; output: number }`, `ModelPricing.tiers?: PriceTier[]`, `ModelOffer.tier?: string`. Task 4 rendert beides.

- [ ] **Step 1: Zen-Fixture anlegen**

```bash
curl -sS --max-time 25 -o tests/fixtures-zen.mdx \
  "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx"
```

Prüfen, dass das Dokument die erwartete Struktur hat (muss `9` ausgeben):

```bash
grep -cE '^\|.*> *[0-9]+K tokens' tests/fixtures-zen.mdx
```

Weicht die Zahl ab, hat sich die Quelle seit dem Entwurf geändert — dann die Zahlen in Step 2 und Step 3 an das tatsächliche Dokument anpassen, statt den Test zu erzwingen.

- [ ] **Step 2: Failing Test für die Stufen schreiben**

Ans Ende von `tests/opencode-docs.test.ts` anfügen:

```ts
// Zen und Go fuehren dasselbe Modell zweimal: "(≤ 272K tokens)" und
// "(> 272K tokens)". Da norm() Klammern entfernt, kollidierten die IDs und die
// teure Stufe wurde verworfen — GPT 5.6 Sol erschien mit $5 statt $5–10.
describe("gestufte Preise", () => {
  test("fuehrt beide Stufen eines Modells zusammen", async () => {
    const offers = parseZenDocument(await Bun.file(`${import.meta.dir}/fixtures-zen.mdx`).text())
    const sol = offers.find((offer) => offer.id === "gpt-5.6-sol")!
    expect(sol.name).toBe("GPT 5.6 Sol")
    expect(sol.tier).toBe("≤ 272K tokens")
    expect(sol.pricing).toMatchObject({ input: 5, output: 30 })
    expect(sol.pricing.tiers).toEqual([{ thresholdTokens: 272_000, label: "> 272K tokens", input: 10, output: 45 }])
  })

  test("erkennt auch die 200K-Schwelle", async () => {
    const offers = parseZenDocument(await Bun.file(`${import.meta.dir}/fixtures-zen.mdx`).text())
    const grok = offers.find((offer) => offer.id === "grok-4.6")!
    expect(grok.pricing).toMatchObject({ input: 2, output: 6 })
    expect(grok.pricing.tiers).toEqual([{ thresholdTokens: 200_000, label: "> 200K tokens", input: 4, output: 12 }])
  })

  test("erzeugt weiterhin genau ein Angebot je Modell", async () => {
    const offers = parseZenDocument(await Bun.file(`${import.meta.dir}/fixtures-zen.mdx`).text())
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
    const offers = parseZenDocument(await Bun.file(`${import.meta.dir}/fixtures-zen.mdx`).text())
    expect(offers.find((offer) => offer.id === "kimi-k3")!.pricing.tiers).toBeUndefined()
  })
})
```

- [ ] **Step 3: Bestehenden Test anpassen, der den Namen prüft**

`tests/opencode-docs.test.ts:99-103` erwartet die Stufe **im Namen**. Das ist genau das Verhalten, das ersetzt wird. Die beiden Zeilen

```ts
    expect(luna.pricing).toMatchObject({ input: 0.2, output: 1.2 })
    expect(luna.name).toContain("272K")
```

ersetzen durch:

```ts
    expect(luna.pricing).toMatchObject({ input: 0.2, output: 1.2 })
    expect(luna.name).toBe("GPT 5.6 Luna")
    expect(luna.tier).toBe("≤ 272K tokens")
```

Den Kommentar darüber (`// Gestufte Modelle behalten die Basisstufe, und der Name benennt sie.`) ersetzen durch:

```ts
    // Gestufte Modelle behalten die Basisstufe; die Stufe steht in tier, nicht im Namen.
```

- [ ] **Step 4: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/opencode-docs.test.ts`
Expected: FAIL — `sol.pricing.tiers` ist `undefined`, `sol.name` enthält noch die Klammer.

- [ ] **Step 5: Datenmodell erweitern**

In `src/domain/model.ts` vor `ModelPricing` einfügen:

```ts
/** Gestufte Preise: oberhalb der Schwelle gilt ein anderer Tarif. */
export interface PriceTier {
  thresholdTokens: number
  label: string
  input: number
  output: number
}
```

In `ModelPricing` nach `unknown?: boolean` ergänzen:

```ts
  /** Nur die Stufen oberhalb der Basis, aufsteigend nach thresholdTokens. */
  tiers?: PriceTier[]
```

`ModelOffer.tier?: string` existiert bereits und bleibt unverändert — es wird ab jetzt gesetzt.

- [ ] **Step 6: `splitTier` implementieren**

In `src/providers/opencode-docs.ts` nach `norm` einfügen:

```ts
/** "GPT 5.6 Sol (> 272K tokens)" → Basisname, Label und Schwelle in Token. */
export function splitTier(name: string): { base: string; label?: string; thresholdTokens?: number; upper?: boolean } {
  const match = String(name).match(/^(.*?)\s*\(\s*(([≤>])\s*([\d.]+)K\s+tokens)\s*\)\s*$/i)
  if (!match) return { base: String(name).trim() }
  return { base: match[1].trim(), label: match[2].trim(), thresholdTokens: Math.round(Number(match[4]) * 1000), upper: match[3] === ">" }
}
```

- [ ] **Step 7: Zusammenführung im Parser**

Diese Task verschiebt `input`/`output` **vor** die Duplikatprüfung. Würden die aus Task 1 stammenden Zeilen dort stehen bleiben, wären die Variablen doppelt deklariert. Deshalb den gesamten Abschnitt in `parsePricing` — von `const base = norm(row[0])` bis einschließlich `offers.push(...)` — durch diesen Stand ersetzen:

```ts
    const base = norm(row[0])
    const id = ids.get(base) ?? ids.get(base.replace(/-tokens$/, ""))
    if (!id) continue
    const step = splitTier(row[0])
    const input = toUsd(row[1]), output = toUsd(row[2])
    const existing = offers.find((offer) => offer.id === id)
    if (existing) {
      // Gestufte Modelle stehen zweimal in der Tabelle und ergeben nach norm()
      // dieselbe ID. Die obere Stufe wird angehaengt statt verworfen; alles
      // ohne erkennbaren Operator bleibt beim bisherigen Verhalten, erste gewinnt.
      if (step.upper && step.thresholdTokens !== undefined) {
        existing.pricing.tiers = [...(existing.pricing.tiers ?? []), { thresholdTokens: step.thresholdTokens, label: step.label!, input: input ?? 0, output: output ?? 0 }].sort((a, b) => a.thresholdTokens - b.thresholdTokens)
      }
      continue
    }
    const included = usageColumn > 0 ? toUsd(row[usageColumn]) ?? 0 : 0
    const counted = requests.get(base) ?? requests.get(base.replace(/-tokens$/, ""))
    const quota: ModelQuota | undefined = included || counted ? { ...counted, ...(included ? { includedUsdPerMonth: included } : {}) } : undefined
    const unknown = input === undefined || output === undefined
    offers.push({ provider, id, name: step.base, ...(step.label ? { tier: step.label } : {}), ...(quota ? { quota } : {}), pricing: { input: input ?? 0, output: output ?? 0, ...(unknown ? { unknown: true } : {}), cacheRead: toUsd(row[3]) ?? 0, cacheWrite: toUsd(row[4]) ?? 0 }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } })
```

Der Kommentarblock über der alten `offers.some(...)`-Zeile („Gestufte Preise (`≤ 272K tokens` / `> 272K tokens`) ergeben nach norm() dieselbe ID…") entfällt, da der neue Kommentar ihn ersetzt.

- [ ] **Step 8: Tests laufen lassen, grün bestätigen**

Run: `npm run typecheck && npm test`
Expected: PASS. Schlägt „erzeugt weiterhin genau ein Angebot je Modell" mit anderen Zahlen fehl, hat sich die Quelle geändert — dann Step 1 erneut lesen.

- [ ] **Step 9: Commit**

```bash
git add src/domain/model.ts src/providers/opencode-docs.ts tests/opencode-docs.test.ts tests/fixtures-zen.mdx
git commit -m "fix: keep the upper price tier instead of dropping it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Laufzeit-Wächter für Strukturänderungen

Die OpenCode-Doku hat sich zweimal geändert und beide Male still falsche Preise erzeugt. Der Wächter meldet einen Einbruch der Modellzahl oder neu unlesbare Preise als Hinweis — **nicht** als Fehler, denn die Daten sind vorhanden und ein Fehler würde `carryForwardOffers` den frischen Stand verwerfen lassen.

**Files:**
- Modify: `src/domain/provider.ts:7-13` (`warning?: string`)
- Modify: `src/domain/snapshots.ts` (neue Funktion)
- Modify: `src/extension.ts:68-72` (Aufruf im Refresh)
- Test: `tests/snapshots.test.ts`

**Interfaces:**
- Consumes: `ModelPricing.unknown` (Task 1), `ProviderSnapshot` aus `src/domain/provider.ts`.
- Produces: `plausibilityWarning(previous: ProviderSnapshot | undefined, fresh: ProviderSnapshot): string | undefined` und `ProviderSnapshot.warning?: string`. Task 4 rendert `warning`.

- [ ] **Step 1: Failing Test schreiben**

Ans Ende von `tests/snapshots.test.ts` anfügen:

```ts
import { plausibilityWarning } from "../src/domain/snapshots"

// Zweimal hat eine Strukturaenderung der OpenCode-Doku still falsche Preise
// erzeugt. Der Waechter macht den Verdacht sichtbar, ohne den Abruf zu
// verwerfen — die Daten sind da, sie sind nur verdaechtig.
const many = (count: number, unknown = 0) => Array.from({ length: count }, (_, index) => {
  const item = offer(`m${index}`, 1)
  return index < unknown ? { ...item, pricing: { ...item.pricing, unknown: true } } : item
})

test("meldet einen Einbruch der Modellzahl", () => {
  const warning = plausibilityWarning(ok(many(61), 1_000), ok(many(42), 2_000))
  expect(warning).toContain("42")
  expect(warning).toContain("61")
})

test("schweigt bei einem massvollen Rueckgang", () => {
  expect(plausibilityWarning(ok(many(61), 1_000), ok(many(55), 2_000))).toBeUndefined()
})

test("meldet Modelle, die ihren lesbaren Preis verloren haben", () => {
  const warning = plausibilityWarning(ok(many(10), 1_000), ok(many(10, 3), 2_000))
  expect(warning).toContain("3")
})

test("schweigt ohne vorherigen Stand", () => {
  expect(plausibilityWarning(undefined, ok(many(10), 2_000))).toBeUndefined()
})

test("schweigt, wenn der frische Abruf bereits einen Fehler meldet", () => {
  expect(plausibilityWarning(ok(many(61), 1_000), failed(2_000))).toBeUndefined()
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/snapshots.test.ts`
Expected: FAIL mit „Export named 'plausibilityWarning' not found".

- [ ] **Step 3: `warning` am Snapshot ergänzen**

In `src/domain/provider.ts` das Interface erweitern:

```ts
export interface ProviderSnapshot {
  provider: ProviderId
  offers: import("./model").ModelOffer[]
  checkedAt: number
  stale: boolean
  error?: ProviderError
  /** Daten sind da, aber verdaechtig — im Gegensatz zu error kein Ausfall. */
  warning?: string
}
```

- [ ] **Step 4: `plausibilityWarning` implementieren**

Ans Ende von `src/domain/snapshots.ts` anfügen:

```ts
/**
 * Ein Fehler verwirft den Abruf, eine Warnung nicht. Beide Faelle hier sind
 * plausible Daten mit unplausibler Herkunft: entweder liest der Parser die
 * Quelle nicht mehr vollstaendig, oder das Preisformat hat sich geaendert.
 */
export function plausibilityWarning(previous: ProviderSnapshot | undefined, fresh: ProviderSnapshot): string | undefined {
  if (fresh.error || !previous || previous.error || !previous.offers.length) return undefined
  if (fresh.offers.length < previous.offers.length * 0.7) {
    return `Nur ${fresh.offers.length} statt zuletzt ${previous.offers.length} Modelle gelesen — hat sich die Dokumentstruktur geändert?`
  }
  const priced = new Set(previous.offers.filter((offer) => !offer.pricing.unknown).map((offer) => offer.id))
  const lost = fresh.offers.filter((offer) => offer.pricing.unknown && priced.has(offer.id)).length
  return lost ? `${lost} Modelle ohne lesbaren Preis, die zuletzt einen hatten — hat sich das Preisformat geändert?` : undefined
}
```

- [ ] **Step 5: Test laufen lassen, grün bestätigen**

Run: `npm test -- tests/snapshots.test.ts`
Expected: PASS.

- [ ] **Step 6: Wächter in den Refresh einhängen**

In `src/extension.ts` den Import in Zeile 13 erweitern:

```ts
import { carryForwardOffers, plausibilityWarning } from "./domain/snapshots"
```

Die Zuweisung an `snapshots` (aktuell `:68-72`) ersetzen durch:

```ts
      const previousByProvider = new Map(state.snapshots.map((snapshot) => [snapshot.provider, snapshot]))
      const fresh = enrichProviderBenchmarks(await fetchAllProviders({
        openrouter: fetchOpenRouterCatalog,
        "opencode-zen": async () => requireOffers("opencode-zen", parseZenDocument(await fetchOpenCodeDocument(ZEN_URL))),
        "opencode-go": async () => requireOffers("opencode-go", parseGoDocument(await fetchOpenCodeDocument(GO_URL)).offers),
      }), benchmarkSnapshot).map((snapshot) => {
        // Vor carryForwardOffers: danach stammen die Angebote womoeglich aus
        // dem alten Stand und der Vergleich waere gegen sich selbst.
        const warning = plausibilityWarning(previousByProvider.get(snapshot.provider), snapshot)
        return warning ? { ...snapshot, warning } : snapshot
      })
      const snapshots = carryForwardOffers(state.snapshots, fresh)
```

- [ ] **Step 7: Vollständig verifizieren**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS, Bundle nach `dist/extension.js` geschrieben.

- [ ] **Step 8: Commit**

```bash
git add src/domain/provider.ts src/domain/snapshots.ts src/extension.ts tests/snapshots.test.ts
git commit -m "feat: warn when a source document changes shape

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Preisspanne, fehlendes Kontingent und Warnhinweis anzeigen

Die Ergebnisse der Tasks 1–3 sichtbar machen. Punktuelle Eingriffe in `panel.ts` — der Umbau der Oberfläche ist ein eigenes Vorhaben und findet hier **nicht** statt.

**Files:**
- Modify: `src/panel.ts` (`quotaLine`, neue Funktion `priceCell`, Modellzeile, Hinweisblock)
- Test: `tests/panel.test.ts`

**Interfaces:**
- Consumes: `ModelPricing.tiers` und `ModelOffer.tier` (Task 2), `ProviderSnapshot.warning` (Task 3), `ModelQuota` (Bestand).
- Produces: nichts für spätere Tasks — letzte Task des Plans.

- [ ] **Step 1: Failing Test schreiben**

Ans Ende von `tests/panel.test.ts` anfügen:

```ts
const tiered = {
  provider: "opencode-zen" as const, id: "gpt-5.6-sol", name: "GPT 5.6 Sol", tier: "≤ 272K tokens",
  pricing: { input: 5, output: 30, tiers: [{ thresholdTokens: 272_000, label: "> 272K tokens", input: 10, output: 45 }] },
  capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding" as const] },
}

test("zeigt bei gestuften Preisen die Spanne und die Schwellen", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("5–10 $")
  expect(html).toContain("30–45 $")
  expect(html).toContain("&gt; 272K tokens")
  expect(html).toContain("≤ 272K tokens")
})

// Bei Go entscheidet das Kontingent, nicht der Token-Preis. Fehlt es, ist das
// Modell unvergleichbar — das muss dastehen, statt stumm zu fehlen.
test("benennt ein fehlendes Anfragenkontingent", () => {
  const ohne = { ...tiered, provider: "opencode-go" as const, id: "minimax-m2.5", name: "MiniMax M2.5", pricing: { input: 0.3, output: 1.2 }, quota: { includedUsdPerMonth: 60 } }
  const html = panelHtml({ snapshots: [{ provider: "opencode-go", checkedAt: 1, stale: false, offers: [ohne] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("Anfragen nicht in der Quelle")
})

test("zeigt eine Warnung als Hinweis, nicht als Fehler", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered], warning: "Nur 42 statt zuletzt 61 Modelle gelesen" }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("Nur 42 statt zuletzt 61 Modelle gelesen")
  expect(html).toContain('class="notice warn"')
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/panel.test.ts`
Expected: FAIL — weder Spanne noch Hinweis vorhanden.

- [ ] **Step 3: Preisdarstellung implementieren**

In `src/panel.ts` nach `priceClass` einfügen:

```ts
const amount = (value: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value)
/** Gestufte Preise als Spanne: der Basispreis allein verschweigt die obere Stufe. */
function priceCell(offer: ModelOffer, side: "input" | "output"): string {
  if (offer.pricing.unknown) return "Preis unbekannt"
  const base = offer.pricing[side], tiers = offer.pricing.tiers ?? []
  if (!tiers.length) return money(base)
  return `${amount(base)}–${money(Math.max(base, ...tiers.map((tier) => tier[side])))}`
}
function tierDetails(offer: ModelOffer): string {
  const tiers = offer.pricing.tiers ?? []
  if (!tiers.length) return ""
  const rows = [`${esc(offer.tier ?? "Basis")} · ${esc(money(offer.pricing.input))} / ${esc(money(offer.pricing.output))}`,
    ...tiers.map((tier) => `${esc(tier.label)} · ${esc(money(tier.input))} / ${esc(money(tier.output))}`)]
  return `<details class="tier-details"><summary>${tiers.length + 1} Preisstufen</summary>${rows.map((row) => `<article>${row}</article>`).join("")}</details>`
}
```

In `panelHtml` in der Zeile, die `modelRows` baut, die beiden Preiszellen ersetzen:

```ts
<td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "input"))}</span></td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "output"))}</span>${tierDetails(offer)}</td>
```

- [ ] **Step 4: Fehlendes Kontingent benennen**

In `src/panel.ts` `quotaLine` ersetzen:

```ts
/** Bei Go entscheidet das Abo-Kontingent, nicht der Token-Preis. */
function quotaLine(offer: ModelOffer): string {
  const quota = offer.quota
  if (!quota) return ""
  // Fehlt die Anfragenzahl, ist das Modell nicht vergleichbar. Das gehoert
  // hingeschrieben, sonst wirkt der Dollarwert wie die ganze Auskunft.
  const parts = [quota.requestsPerMonth !== undefined ? `${count(quota.requestsPerMonth)} Anfragen/Monat` : "Anfragen nicht in der Quelle",
    quota.includedUsdPerMonth !== undefined ? `${money(quota.includedUsdPerMonth)} enthalten` : ""].filter(Boolean)
  return `<small class="quota">${esc(parts.join(" · "))}</small>`
}
```

- [ ] **Step 5: Warnhinweis und CSS ergänzen**

In `panelHtml` nach `providerErrors` einfügen:

```ts
  const providerWarnings = state.snapshots.filter((snapshot) => snapshot.warning).map((snapshot) => `<div class="notice warn">${esc(snapshot.provider)}: ${esc(snapshot.warning)}</div>`).join("")
```

und im Template `${refreshError}${providerErrors}` zu `${refreshError}${providerErrors}${providerWarnings}` erweitern.

Ans Ende der `BENCHMARK_CSS`-Zeichenkette anfügen:

```
.notice.warn{border-left-color:var(--yellow);background:color-mix(in srgb,var(--yellow) 12%,transparent)}.tier-details{margin-top:4px}.tier-details summary{color:var(--cyan);cursor:pointer;font-size:.82em}.tier-details article{padding:2px 0;color:var(--muted);font-size:.8em;white-space:nowrap}
```

- [ ] **Step 6: Vollständig verifizieren**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS, alle Testdateien.

- [ ] **Step 7: Von Hand prüfen**

`F5` startet den Extension Development Host. Dort „Preis-Watch öffnen", zur Ansicht *Modelle* wechseln und bestätigen: GPT 5.6 Sol zeigt `5–10 $` / `30–45 $`, das Aufklappen nennt beide Stufen, MiniMax M2.5 nennt das fehlende Kontingent.

- [ ] **Step 8: Changelog und Commit**

In `CHANGELOG.md` als neuen obersten Abschnitt einfügen (Version in `package.json` auf `0.2.5` erhöhen):

```markdown
## 0.2.5 – 2026-08-13

- Zeigt gestufte Preise vollständig: Elf Modelle kosten oberhalb einer Kontextschwelle mehr — GPT 5.6 Sol $10 statt $5, Grok 4.6 $4 statt $2. Bisher war nur die günstige Stufe sichtbar, und die Ranglisten sortierten danach.
- Behandelt eine unlesbare Preiszelle als unbekannt statt als kostenlos; ein bezahltes Modell konnte so im Kostenlos-Ranking landen.
- Benennt fehlende Anfragenkontingente bei OpenCode Go, statt nur den enthaltenen Dollarwert zu zeigen.
- Warnt, wenn ein Anbieterdokument deutlich weniger Modelle liefert als zuvor oder Preise unlesbar werden.
```

```bash
git add src/panel.ts tests/panel.test.ts CHANGELOG.md package.json
git commit -m "feat: show price ranges, missing quotas and source warnings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifikation des Gesamtplans

Nach Task 4 einmal vollständig:

```bash
npm run typecheck && npm test && npm run build
```

Erwartung: alle Tests grün, `dist/extension.js` gebaut. Die Zen-Fixture belegt 61 Angebote mit 9 gestuften; die Go-Fixture 19 Angebote mit 3 gestuften.
