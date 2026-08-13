# Webview-Umbau, Etappe 2 — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Übersicht zeigt beim Öffnen, wo etwas zu tun ist; der seit Version 0.2.0 erhobene Preisverlauf bekommt endlich eine Oberfläche.

**Architecture:** Die Auswertung, was Handlungsbedarf ist, liegt als zustandslose Domain-Funktion in `src/domain/attention.ts` und wird in `refresh()` berechnet, nicht beim Rendern. Das Panel bekommt die fertige Liste über `DashboardState.attention` und stellt sie nur dar. Die Verlaufsansicht folgt dem Aufbau der Modellansicht: Fragment für die Zeilen, Bedienelemente außerhalb, Filtern über `data-`Attribute ohne Neurendern.

**Tech Stack:** TypeScript 5.6, Bun als Testrunner, esbuild als Bundler, keine Produktionsabhängigkeiten.

Entwurf: `docs/superpowers/specs/2026-08-13-webview-umbau-design.md`
Setzt auf Etappe 1 auf (`docs/superpowers/plans/2026-08-13-webview-etappe-1.md`, auf `main` gemergt).

## Global Constraints

- **Keine Produktionsabhängigkeiten.**
- **Branch:** `webview-etappe-2`. Arbeitsverzeichnis `/Users/dadakbiranvand/Projects/price-watch-vscode`.
- **Alles aus einer Quelle läuft durch `esc()`.** CSP unverändert.
- **Jeder zustandsabhängige Bereich braucht einen `data-fragment`-Container**, sonst friert er nach dem ersten Aufbau ein. Jede neue Kennung gehört in `FragmentId` **und** in `panelHtml`.
- **Aufklappbare Bereiche brauchen `data-key`**, sonst geht ihr Zustand beim Tausch verloren.
- **Kommentare und Nutzertexte auf Deutsch.**
- **Nach jeder Task grün:** `npm run typecheck && npm test && npm run build`.

## File Structure

| Datei | Verantwortung | Task |
|---|---|---|
| `src/domain/attention.ts` | `collectAttention` — was verlangt Aufmerksamkeit | 1 |
| `src/agents/assessment.ts` | toten Status `expensive` entfernen | 1 |
| `src/domain/dashboard.ts` | `attention` im Zustand | 2 |
| `src/extension.ts` | `collectAttention` in `refresh()`, Einstellung lesen | 2 |
| `src/panel/views/overview.ts` | Kopfzeile rendern, Verlaufskarte | 2, 4 |
| `src/panel/views/history.ts` | Verlaufsliste mit Filter | 3 |
| `src/panel/index.ts` | neue Fragmente und die fünfte Ansicht | 2, 3, 4 |
| `src/panel/styles.ts` | Kopfzeile, Verlauf, Vier-Karten-Raster | 2, 3, 4 |
| `package.json` | Einstellung `priceWatch.priceJumpPercent` | 2 |

---

### Task 1: Handlungsbedarf ermitteln

Reine Domain-Logik, unabhängig von HTML. Nimmt zugleich den Status `expensive` heraus, den `assessAgent` nie zurückgibt.

**Files:**
- Create: `src/domain/attention.ts`
- Modify: `src/agents/assessment.ts:4`, `src/panel/views/agents.ts` (Label „Teuer")
- Test: `tests/attention.test.ts` (neu)

**Interfaces:**
- Consumes: `AgentAssessment`, `AccountStatus`, `PriceChange`, `ProviderSnapshot`.
- Produces: `AttentionItem`, `collectAttention(input): AttentionItem[]`. Task 2 rendert die Liste, Task 4 zählt sie.

- [ ] **Step 1: Failing Test schreiben**

`tests/attention.test.ts`:

```ts
import { expect, test } from "bun:test"
import { collectAttention } from "../src/domain/attention"
import type { AgentAssessment } from "../src/agents/assessment"
import type { ModelOffer } from "../src/domain/model"

const NOW = Date.UTC(2026, 7, 13)
const agent = (name: string, status: AgentAssessment["status"]): AgentAssessment => ({ agent: { name, description: "", model: "m", tools: [], prompt: "" }, status, reason: "r" })
const change = (percent: number, daysAgo: number) => ({ id: `c${percent}-${daysAgo}`, at: NOW - daysAgo * 86_400_000, provider: "opencode-zen" as const, modelId: "m", dimension: "input" as const, previous: 1, current: 2, percent })
const empty = { assessments: [], accounts: [], history: [], snapshots: [], jumpPercent: 20, now: NOW }

test("meldet nichts, wenn alles in Ordnung ist", () => {
  expect(collectAttention({ ...empty, assessments: [agent("a", "suitable")] })).toEqual([])
})

test("nennt einen einzelnen Fall beim Namen", () => {
  const [item] = collectAttention({ ...empty, assessments: [agent("reviewer", "deprecated")] })
  expect(item.text).toContain("reviewer")
  expect(item).toMatchObject({ kind: "agent", severity: "warn", view: "agents" })
})

// Bei vielen Treffern wuerde die Kopfzeile sonst die Seite fuellen.
test("fasst gleichartige Faelle zu einer Zeile zusammen", () => {
  const items = collectAttention({ ...empty, assessments: [agent("a", "deprecated"), agent("b", "deprecated"), agent("c", "deprecated")] })
  expect(items).toHaveLength(1)
  expect(items[0].text).toContain("3")
  expect(items[0].text).not.toContain("a")
})

test("meldet knappe und erschoepfte Konten", () => {
  const items = collectAttention({ ...empty, accounts: [{ provider: "opencode-go", state: "exhausted" }, { provider: "openrouter", state: "low" }] })
  expect(items).toHaveLength(2)
  expect(items[0].text).toContain("opencode-go")
  expect(items.every((item) => item.view === "accounts")).toBe(true)
})

test("meldet Preisspruenge oberhalb der Schwelle", () => {
  const items = collectAttention({ ...empty, history: [change(35, 1), change(5, 1)] })
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ kind: "price", severity: "info", view: "history" })
})

test("laesst Preisspruenge aelter als sieben Tage aus", () => {
  expect(collectAttention({ ...empty, history: [change(35, 9)] })).toEqual([])
})

test("meldet Anbieterfehler und Waechterwarnungen", () => {
  const items = collectAttention({ ...empty,
    refreshError: "Alles kaputt",
    snapshots: [{ provider: "opencode-zen", offers: [] as ModelOffer[], checkedAt: 1, stale: true, error: { kind: "network", message: "offline" } },
      { provider: "opencode-go", offers: [] as ModelOffer[], checkedAt: 1, stale: false, warning: "Nur 42 statt 61" }] })
  expect(items).toHaveLength(3)
  expect(items[0].text).toContain("Alles kaputt")
  expect(items.every((item) => item.kind === "data")).toBe(true)
})

// Warnungen zuerst: ein leeres Guthaben wiegt schwerer als ein Sparvorschlag.
test("sortiert Warnungen vor Hinweisen", () => {
  const items = collectAttention({ ...empty, history: [change(35, 1)], accounts: [{ provider: "openrouter", state: "low" }] })
  expect(items.map((item) => item.severity)).toEqual(["warn", "info"])
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/attention.test.ts`
Expected: FAIL mit „Cannot find module '../src/domain/attention'".

- [ ] **Step 3: `attention.ts` implementieren**

```ts
import type { AgentAssessment } from "../agents/assessment"
import type { AccountStatus } from "../accounts/types"
import type { PriceChange } from "./changes"
import type { ProviderSnapshot } from "./provider"

export interface AttentionItem {
  kind: "agent" | "account" | "price" | "data"
  severity: "warn" | "info"
  text: string
  view: "agents" | "accounts" | "history" | "models"
}

export interface AttentionInput {
  assessments: AgentAssessment[]
  accounts: AccountStatus[]
  history: PriceChange[]
  snapshots: ProviderSnapshot[]
  refreshError?: string | null
  jumpPercent: number
  now?: number
}

const JUMP_WINDOW_DAYS = 7

/** Ein Fall beim Namen, mehrere als Anzahl — sonst fuellt die Kopfzeile die Seite. */
function summarize(names: string[], one: (name: string) => string, many: (count: number) => string): string | undefined {
  if (!names.length) return undefined
  return names.length === 1 ? one(names[0]) : many(names.length)
}

export function collectAttention(input: AttentionInput): AttentionItem[] {
  const now = input.now ?? Date.now()
  const items: AttentionItem[] = []
  const add = (kind: AttentionItem["kind"], severity: AttentionItem["severity"], view: AttentionItem["view"], text?: string) => {
    if (text) items.push({ kind, severity, view, text })
  }

  // Ein Fehler der Verarbeitung betrifft alle Anbieter und steht deshalb zuerst.
  if (input.refreshError) add("data", "warn", "models", `Aktualisierung fehlgeschlagen: ${input.refreshError}`)
  for (const snapshot of input.snapshots) {
    if (snapshot.error) add("data", "warn", "models", `${snapshot.provider}: ${snapshot.error.message}`)
    else if (snapshot.warning) add("data", "warn", "models", `${snapshot.provider}: ${snapshot.warning}`)
  }

  for (const state of ["exhausted", "low"] as const) {
    const providers = input.accounts.filter((account) => account.state === state).map((account) => account.provider)
    add("account", "warn", "accounts", summarize(providers,
      (name) => state === "exhausted" ? `${name}: Guthaben erschöpft` : `${name}: Guthaben wird knapp`,
      (count) => state === "exhausted" ? `${count} Konten erschöpft` : `${count} Konten werden knapp`))
  }

  const named = (status: AgentAssessment["status"]) => input.assessments.filter((item) => item.status === status).map((item) => item.agent.name)
  add("agent", "warn", "agents", summarize([...named("deprecated"), ...named("unsuitable")],
    (name) => `Agent „${name}" braucht ein anderes Modell`,
    (count) => `${count} Agenten brauchen ein anderes Modell`))

  const cutoff = now - JUMP_WINDOW_DAYS * 86_400_000
  const jumps = input.history.filter((change) => change.at >= cutoff && change.percent !== null && Math.abs(change.percent) >= input.jumpPercent)
  add("price", "info", "history", summarize(jumps.map((change) => change.modelId),
    (name) => `Deutliche Preisänderung bei ${name}`,
    (count) => `${count} deutliche Preisänderungen`))

  add("agent", "info", "agents", summarize(named("alternative-available"),
    (name) => `Für „${name}" gibt es eine günstigere Alternative`,
    (count) => `${count} Agenten haben eine günstigere Alternative`))

  return items
}
```

Die Reihenfolge des Einfügens entspricht bereits der gewünschten Sortierung (Warnungen vor Hinweisen); ein zusätzliches Sortieren würde sie nur verschleiern.

- [ ] **Step 4: Toten Status entfernen**

In `src/agents/assessment.ts:4` `"expensive" | ` aus der Statusliste streichen. In `src/panel/views/agents.ts` den Eintrag `expensive:"Teuer", ` aus `statusLabel` entfernen. In `src/panel/styles.ts` bleibt `.status-expensive` stehen — es steht in einer Sammelregel mit `.status-alternative-available` und `.status-low`, deren Entfernen nichts spart.

- [ ] **Step 5: Tests laufen lassen, grün bestätigen**

Run: `npm run typecheck && npm test`
Expected: PASS. Der Typecheck belegt zugleich, dass `expensive` nirgends mehr erwartet wird.

- [ ] **Step 6: Commit**

```bash
git add src/domain/attention.ts src/agents/assessment.ts src/panel/views/agents.ts tests/attention.test.ts
git commit -m "feat: work out what needs attention

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Kopfzeile rendern, Meldungsstreifen ablösen

**Files:**
- Modify: `src/domain/dashboard.ts`, `src/extension.ts`, `src/panel/views/overview.ts`, `src/panel/index.ts`, `src/panel/styles.ts`, `package.json`
- Test: `tests/panel.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `collectAttention`, `AttentionItem` (Task 1).
- Produces: `DashboardState.attention?: AttentionItem[]`, `renderAttention(items): string`. Task 4 nutzt dieselbe Liste für die Kartenreihenfolge nicht — sie ist hier abschließend verarbeitet.

- [ ] **Step 1: Failing Test schreiben**

Ans Ende von `tests/panel.test.ts`:

```ts
test("zeigt Handlungsbedarf als anklickbare Kopfzeile", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0,
    attention: [{ kind: "account", severity: "warn", text: "openrouter: Guthaben wird knapp", view: "accounts" }] })
  expect(html).toContain("openrouter: Guthaben wird knapp")
  expect(html).toContain('class="attention-item warn"')
  expect(html).toContain('data-view="accounts"')
})

// Zwei Orte fuer dieselbe Meldung waeren ausgerechnet in der Ansicht
// widersinnig, die Handlungsbedarf buendeln soll.
test("zeigt Anbieterfehler nicht mehr als eigenen Streifen", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", offers: [], checkedAt: 1, stale: true, error: { kind: "network", message: "offline" } }],
    history: [], agents: [], accounts: [], ai: null, updatedAt: 0, refreshError: "kaputt" })
  expect(html).not.toContain('class="notice error"')
  expect(html).not.toContain('class="notice warn"')
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/panel.test.ts`
Expected: FAIL — die Kopfzeile fehlt, die Streifen sind noch da.

- [ ] **Step 3: Zustand und Einstellung**

In `src/domain/dashboard.ts` das Interface um `attention?: AttentionItem[]` erweitern, mit `import type { AttentionItem } from "./attention"`.

In `package.json` unter `contributes.configuration.properties` ergänzen:

```json
"priceWatch.priceJumpPercent": {
  "type": "number",
  "default": 20,
  "minimum": 1,
  "description": "Ab welcher Preisänderung in Prozent ein Hinweis in der Übersicht erscheint."
}
```

In `src/extension.ts` **eine** Hilfsfunktion, die aus dem aktuellen Zustand neu rechnet. Nicht zwei Stellen mit derselben Rechnung: Auch Kontoänderungen und der Fehlerzweig von `refresh` müssen die Kopfzeile aktualisieren, sonst erschiene ein knappes Guthaben erst nach dem nächsten Preisabruf.

`assessAgent` und `collectAttention` importieren, dann:

```ts
function recomputeAttention(): void {
  const offers = state.snapshots.flatMap((snapshot) => snapshot.offers)
  state.attention = collectAttention({
    assessments: state.agents.map((agent) => assessAgent(agent, offers)),
    accounts: state.accounts, history: state.history, snapshots: state.snapshots, refreshError: state.refreshError,
    jumpPercent: Math.max(1, vscode.workspace.getConfiguration("priceWatch").get<number>("priceJumpPercent", 20)),
  })
}
```

Aufgerufen am Ende von `refresh()` (beide Zweige), am Ende von `refreshConnectedAccounts`, `connectAccount`, `disconnectAccount` und den beiden Management-Funktionen — jeweils vor `refreshPanel()`.

- [ ] **Step 4: Kopfzeile rendern**

In `src/panel/views/overview.ts`:

```ts
import type { AttentionItem } from "../../domain/attention"

/** Leer heisst leer: kein „alles in Ordnung"-Streifen, der nur Platz kostet. */
export function renderAttention(items: AttentionItem[] = []): string {
  if (!items.length) return ""
  return items.map((item) => `<button class="attention-item ${item.severity}" data-view="${item.view}">${esc(item.text)}</button>`).join("")
}
```

In `src/panel/index.ts`: `attention: renderAttention(state.attention)` statt `attention: ""` in `fragments`, in `panelHtml` `${renderAttention(state.attention)}` in den Container, und die drei Konstanten `refreshError`, `providerErrors`, `providerWarnings` samt ihrer Einsetzung im Grundgerüst entfernen — sie sind jetzt Teil der Kopfzeile.

- [ ] **Step 5: CSS ergänzen**

Ans Ende der `BENCHMARK_CSS`-Zeichenkette in `src/panel/styles.ts`:

```
.attention{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.attention:empty{display:none}.attention-item{border:0;border-left:3px solid var(--orange);border-radius:5px;padding:6px 10px;text-align:left;color:var(--vscode-foreground);background:color-mix(in srgb,var(--orange) 12%,var(--vscode-editorWidget-background))}.attention-item.info{border-left-color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,var(--vscode-editorWidget-background))}
```

Die Regel `.notice` bleibt vorerst ungenutzt stehen; sie zu entfernen gehört nicht zu dieser Aufgabe.

- [ ] **Step 6: Verifizieren und committen**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

```bash
git add -A src package.json tests/panel.test.ts
git commit -m "feat: surface what needs attention at the top

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Verlaufsansicht

Die 90 Tage Preisverlauf, die seit Version 0.2.0 anfallen und synchronisiert werden, bekommen eine Oberfläche.

**Files:**
- Create: `src/panel/views/history.ts`
- Modify: `src/panel/index.ts` (fünfte Ansicht, Fragment, Navigation), `src/panel/styles.ts`
- Test: `tests/panel-history.test.ts` (neu)

**Interfaces:**
- Consumes: `PriceChange` aus `src/domain/changes.ts`.
- Produces: `historyRows(history: PriceChange[]): string`, `historyFilters(): string`. Task 4 nutzt `historyRows` für die Übersichtskarte nicht — die bekommt eine eigene, kürzere Darstellung.

- [ ] **Step 1: Failing Test schreiben**

`tests/panel-history.test.ts`:

```ts
import { expect, test } from "bun:test"
import { historyRows } from "../src/panel/views/history"
import type { PriceChange } from "../src/domain/changes"

const change = (over: Partial<PriceChange> = {}): PriceChange => ({ id: "x", at: Date.UTC(2026, 7, 12), provider: "opencode-zen", modelId: "kimi-k3", dimension: "input", previous: 1, current: 2, percent: 100, ...over })

test("zeigt Richtung, Betraege und Prozent", () => {
  const html = historyRows([change()])
  expect(html).toContain("kimi-k3")
  expect(html).toContain("+100")
  expect(html).toContain("change-up")
})

test("kennzeichnet eine Verguenstigung eigens", () => {
  const html = historyRows([change({ previous: 2, current: 1, percent: -50 })])
  expect(html).toContain("−50")
  expect(html).toContain("change-down")
})

test("verkraftet einen unbekannten Prozentsatz", () => {
  expect(historyRows([change({ previous: 0, percent: null })])).toContain("neu bepreist")
})

test("sagt es, wenn nichts aufgezeichnet wurde", () => {
  expect(historyRows([])).toContain("Noch keine Preisänderungen")
})

test("traegt die Filterattribute", () => {
  const html = historyRows([change()])
  expect(html).toContain('data-change="')
  expect(html).toContain('data-provider="opencode-zen"')
  expect(html).toContain('data-at="')
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/panel-history.test.ts`
Expected: FAIL mit „Cannot find module".

- [ ] **Step 3: `views/history.ts` implementieren**

```ts
import type { PriceChange } from "../../domain/changes"
import { amount, esc, money, stamp } from "../format"

const dimensionLabel: Record<PriceChange["dimension"], string> = { input: "Input", output: "Output", cacheRead: "Cache gelesen", cacheWrite: "Cache geschrieben", request: "je Anfrage" }

/** Teurer und guenstiger tragen dieselben Farben wie die Preisspalten. */
function percentCell(change: PriceChange): string {
  if (change.percent === null) return `<span class="change-new">neu bepreist</span>`
  const up = change.percent > 0
  return `<span class="${up ? "change-up" : "change-down"}">${up ? "+" : "−"}${amount(Math.abs(change.percent))} %</span>`
}

export function historyRows(history: PriceChange[]): string {
  if (!history.length) return `<p class="empty">Noch keine Preisänderungen aufgezeichnet</p>`
  return history.map((change) => `<article class="change-row" data-change="${esc(`${change.modelId} ${change.provider}`.toLowerCase())}" data-provider="${esc(change.provider)}" data-at="${change.at}"><div class="change-when"><strong>${esc(stamp(change.at))}</strong><small>${esc(change.provider)}</small></div><div class="change-what"><strong>${esc(change.modelId)}</strong><small>${dimensionLabel[change.dimension]}</small></div><div class="change-amount"><span>${esc(money(change.previous))} → ${esc(money(change.current))}</span>${percentCell(change)}</div></article>`).join("")
}

export function historyFilters(): string {
  return `<div class="filters"><input id="history-search" placeholder="Modelle durchsuchen"><select id="history-provider"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="history-range"><option value="7">Letzte 7 Tage</option><option value="30">Letzte 30 Tage</option><option value="90" selected>Letzte 90 Tage</option></select></div>`
}
```

- [ ] **Step 4: Fünfte Ansicht einhängen**

In `src/panel/index.ts`:

- `FragmentId` um `"history"` erweitern, in `fragments` `history: historyRows(state.history)` ergänzen.
- In der Navigation nach „Agenten" einfügen: `<button data-view="history">Verlauf</button>`.
- In `metricsInner` den Änderungszähler anklickbar machen — er ist die einzige Stelle, die den Verlauf heute erwähnt, und führte bisher nirgendwohin:
  `<span><strong>${state.history.length}</strong>Änderungen</span>` wird zu
  `<button class="metric-link" data-view="history"><strong>${state.history.length}</strong>Änderungen</button>`.
  Dazu ans Ende der `BENCHMARK_CSS`-Zeichenkette: `.metrics .metric-link{display:flex;align-items:baseline;gap:5px;border:0;padding:0;background:none;color:var(--muted)}`
- Nach der Agentenansicht eine weitere Sektion:

```html
<section class="view" id="history" hidden><div class="page-head"><div><h1>Preisverlauf</h1><p>Änderungen der letzten 90 Tage</p></div></div>${historyFilters()}<div class="change-rows" data-fragment="history">${historyRows(state.history)}</div></section>
```

- [ ] **Step 5: Filter im Webview**

In `src/panel/script.ts` nach `applyFilter` ergänzen und in `save`/`restore` mitführen:

```js
const applyHistoryFilter = () => {
  const q = document.getElementById('history-search').value.toLowerCase()
  const p = document.getElementById('history-provider').value
  const cutoff = Date.now() - Number(document.getElementById('history-range').value) * 86400000
  document.querySelectorAll('[data-change]').forEach((row) => {
    row.hidden = !(row.dataset.change.includes(q) && (!p || row.dataset.provider === p) && Number(row.dataset.at) >= cutoff)
  })
}
;['history-search', 'history-provider', 'history-range'].forEach((id) => document.getElementById(id).addEventListener(id === 'history-search' ? 'input' : 'change', applyHistoryFilter))
```

Im Nachrichtenempfänger nach `applyFilter()` zusätzlich `applyHistoryFilter()` aufrufen — sonst zeigt ein getauschtes Verlaufsfragment wieder alle Zeilen.

- [ ] **Step 6: CSS ergänzen**

Ans Ende der `BENCHMARK_CSS`-Zeichenkette:

```
.change-rows{display:grid;gap:1px;border:1px solid var(--vscode-panel-border);border-radius:9px;overflow:hidden;background:var(--vscode-panel-border)}.change-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.4fr) minmax(190px,1fr);gap:12px;align-items:center;padding:8px 12px;background:var(--vscode-editorWidget-background)}.change-row[hidden]{display:none}.change-when small,.change-what small{display:block;color:var(--muted);font-size:.82em}.change-what strong{overflow-wrap:anywhere}.change-amount{text-align:right;white-space:nowrap}.change-amount span{display:block}.change-up{color:var(--orange);font-weight:700}.change-down{color:var(--green);font-weight:700}.change-new{color:var(--muted)}
@media(max-width:700px){.change-row{grid-template-columns:1fr;gap:4px}.change-amount{text-align:left}}
```

Die Media-Regel muss **hinter** die Grundregeln, sonst greift sie nicht.

- [ ] **Step 7: Verifizieren und committen**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

```bash
git add -A src tests/panel-history.test.ts
git commit -m "feat: show the price history that was only ever collected

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Vier-Karten-Raster

Die letzte sichtbare Änderung: Die Rankings verlieren ihre doppelte Breite, der Verlauf bekommt seine Karte.

**Files:**
- Modify: `src/panel/index.ts`, `src/panel/views/overview.ts`, `src/panel/styles.ts`
- Test: `tests/panel.test.ts` (bestehende Zusicherung ändern), `tests/panel-fragments.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `historyRows`-Daten (Task 3), `PriceChange`.
- Produces: `renderHistoryCard(history): string`, Fragment `overview-history`. Letzte Task des Plans.

- [ ] **Step 1: Bestehende Zusicherung anpassen und neue schreiben**

`tests/panel.test.ts:6` prüft das alte Raster:

```ts
  expect(html).toContain("minmax(360px,2fr) minmax(220px,1fr) minmax(220px,1fr)")
```

ersetzen durch:

```ts
  // Vier gleichwertige Karten: keiner der vier Zwecke wird hervorgehoben.
  expect(html).toContain("repeat(auto-fit,minmax(240px,1fr))")
```

Ans Ende von `tests/panel-fragments.test.ts`:

```ts
test("die Uebersicht fuehrt eine Verlaufskarte", () => {
  const html = panelHtml(state([offer("a", 1)]))
  expect(html).toContain('data-fragment="overview-history"')
  expect(html).toContain("Preisverlauf")
})
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL in beiden Dateien.

- [ ] **Step 3: Verlaufskarte rendern**

In `src/panel/views/overview.ts`:

```ts
import type { PriceChange } from "../../domain/changes"
import { historyRows } from "./history"

/** Dasselbe Muster wie bei Agenten und Konten: Anriss plus Sprung in die Ansicht. */
export function renderHistoryCard(history: PriceChange[]): string {
  return `<div class="card-head"><h2>Preisverlauf</h2><button data-view="history">Alle ${history.length}</button></div>${history.length ? `<div class="change-rows change-preview">${historyRows(history.slice(0, 3))}</div>` : `<p class="empty">Noch keine Preisänderungen</p>`}`
}
```

- [ ] **Step 4: Karte einhängen**

In `src/panel/index.ts`: `FragmentId` um `"overview-history"` erweitern, in `fragments` `"overview-history": renderHistoryCard(state.history)` ergänzen, und im Grundgerüst nach der Kontenkarte:

```html
<section class="card history-card" data-fragment="overview-history">${renderHistoryCard(state.history)}</section>
```

- [ ] **Step 5: Raster umstellen**

In `src/panel/styles.ts` in der Hauptregel `.dashboard{display:grid;grid-template-columns:minmax(360px,2fr) minmax(220px,1fr) minmax(220px,1fr);gap:8px;align-items:start}` die Spaltenangabe ersetzen durch `repeat(auto-fit,minmax(240px,1fr))`.

In der Regel `@media(max-width:1050px)` die Angaben `.dashboard{grid-template-columns:minmax(340px,1.5fr) minmax(240px,1fr)}.accounts-card{grid-column:2}` entfernen — `auto-fit` regelt den Umbruch selbst. In `@media(max-width:700px)` `.dashboard{grid-template-columns:1fr}` behalten und `.accounts-card{grid-column:auto}` entfernen.

Ans Ende der `BENCHMARK_CSS`-Zeichenkette für die Vorschau in der Karte:

```
.change-preview{border:0;background:none;gap:0}.change-preview .change-row{grid-template-columns:1fr;gap:2px;padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 50%,transparent)}.change-preview .change-when small{display:none}.change-preview .change-amount{text-align:left}
```

- [ ] **Step 6: Verifizieren**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Von Hand prüfen**

`F5` startet den Extension Development Host. Prüfen: vier gleich breite Karten in der Übersicht, die Verlaufskarte gefüllt oder mit Hinweis, die fünfte Ansicht über die Navigation erreichbar, Filter dort wirksam, und bei knappem Guthaben eine anklickbare Kopfzeile, die in die Kontenansicht springt.

- [ ] **Step 8: Changelog, Version und Commit**

`package.json` auf `0.3.0` (die Oberfläche ändert sich sichtbar), `CHANGELOG.md` als neuen obersten Abschnitt:

```markdown
## 0.3.0 – 2026-08-13

- Zeigt oben in der Übersicht, was Aufmerksamkeit braucht: leeres Guthaben, Agenten auf abgekündigten Modellen, deutliche Preissprünge, Probleme beim Abruf. Ein Klick springt in die zuständige Ansicht.
- Ergänzt eine Verlaufsansicht: Die Preisänderungen der letzten 90 Tage wurden bisher erhoben und zwischen Geräten synchronisiert, aber nie angezeigt.
- Stellt die Übersicht auf vier gleichwertige Karten um; keiner der vier Zwecke wird mehr hervorgehoben.
- Behält Filter, Scrollposition und aufgeklappte Bereiche beim stündlichen Abruf: Das Panel wird nicht mehr neu geladen, sondern tauscht nur die Teile, deren Inhalt sich geändert hat.
- Neue Einstellung `priceWatch.priceJumpPercent` (Vorgabe 20) für die Schwelle, ab der ein Preissprung gemeldet wird.
```

```bash
git add -A src tests CHANGELOG.md package.json
git commit -m "feat: give the overview four equal cards and a history card

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifikation der Etappe

```bash
npm run typecheck && npm test && npm run build
```

Der Beleg, dass die Etappe ihren Zweck erfüllt, ist der Handgriff aus Task 4, Schritt 7 — insbesondere, dass die Kopfzeile bei fehlerfreiem Zustand **nicht** erscheint und der Verlauf tatsächlich Einträge zeigt.
