# Webview-Umbau, Etappe 1 — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `panel.ts` in ein Modulverzeichnis aufteilen und den stündlichen Refresh so umbauen, dass Scrollposition, Filter, gewählte Ansicht und aufgeklappte Bereiche erhalten bleiben.

**Architecture:** Das Dokument wird nur noch beim Öffnen gesetzt. Danach sendet die Extension pro Bereich ein gerendertes HTML-Fragment; das Webview vergleicht es mit dem zuletzt empfangenen und ersetzt nur, was sich unterscheidet. Bei einem Abruf ohne Datenänderung wird das DOM überhaupt nicht angefasst. Der Renderer bleibt in TypeScript in der Extension, `esc()` bleibt der eine zentrale Ausgang.

**Tech Stack:** TypeScript 5.6, Bun als Testrunner, esbuild als Bundler, keine Produktionsabhängigkeiten.

Entwurf: `docs/superpowers/specs/2026-08-13-webview-umbau-design.md`

## Global Constraints

- **Keine Produktionsabhängigkeiten.** Nichts zu `dependencies` in `package.json`.
- **Branch:** `webview-umbau`. Arbeitsverzeichnis `/Users/dadakbiranvand/Projects/price-watch-vscode`.
- **Alles, was aus einer Quelle stammt, läuft durch `esc()`.** Die CSP (`default-src 'none'`, Nonce für Skripte) bleibt unverändert.
- **Secrets niemals** in `DashboardState`, ins Webview oder ins Log.
- **Kommentare und Nutzertexte auf Deutsch.** Kommentare begründen das *Warum*.
- **Etappe 1 ändert das Aussehen nicht.** Jede sichtbare Änderung gehört in Etappe 2. Die bestehenden Panel-Tests sind das Sicherheitsnetz: Ihre Zusicherungen dürfen sich nicht ändern, nur Importpfade.
- **Nach jeder Task grün:** `npm run typecheck && npm test && npm run build`.

## File Structure

| Datei | Verantwortung | Task |
|---|---|---|
| `src/domain/dashboard.ts` | `DashboardState` — damit Ansichten es importieren, ohne einander zu ziehen | 2 |
| `src/panel/format.ts` | `esc`, `money`, `amount`, `count`, `stamp` | 1 |
| `src/panel/styles.ts` | `CSS`, `BENCHMARK_CSS` | 1 |
| `src/panel/views/models.ts` | Modelltabelle, Filterleiste, Preiszellen, Benchmarkzelle | 2 |
| `src/panel/views/agents.ts` | Agentenzeilen und -gruppen | 2 |
| `src/panel/views/accounts.ts` | Anbieterabschnitte, verwaltete Keys | 2 |
| `src/panel/views/overview.ts` | Metrikzeile, KI-Fazit, Karten | 2 |
| `src/panel/index.ts` | `panelHtml(state)`, `fragments(state)` | 2, 3 |
| `src/panel/script.ts` | Webview-Skript als Zeichenkette | 4, 5 |
| `src/extension.ts` | `postMessage` statt `webview.html` | 4 |

---

### Task 1: Format und Styles herauslösen

Der kleinste sichere Schnitt: zwei Dateien ohne Abhängigkeit auf den Rest. `panel.ts` bleibt vorerst bestehen und importiert sie.

**Files:**
- Create: `src/panel/format.ts`, `src/panel/styles.ts`
- Modify: `src/panel.ts` (Definitionen entfernen, Importe ergänzen)

**Interfaces:**
- Consumes: nichts.
- Produces: `esc(value: unknown): string`, `money(value: number): string`, `amount(value: number): string`, `count(value: number): string`, `stamp(at: number): string`, `CSS: string`, `BENCHMARK_CSS: string`. Alle folgenden Tasks importieren daraus.

- [ ] **Step 1: `format.ts` anlegen**

`stamp` steht bisher als lokale Konstante in `panelHtml` und wird dabei zur exportierten Funktion.

```ts
export const esc = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")
export const count = (value: number) => new Intl.NumberFormat("de-DE").format(value)
export const amount = (value: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value)
export const money = (value: number) => `${amount(value)} $`
export const stamp = (at: number) => new Date(at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })
```

- [ ] **Step 2: `styles.ts` anlegen**

Die beiden Zeichenketten `CSS` und `BENCHMARK_CSS` unverändert aus `src/panel.ts` übernehmen, jeweils mit `export const` davor. Kein Zeichen am Inhalt ändern — die Panel-Tests prüfen einzelne CSS-Regeln wörtlich.

- [ ] **Step 3: `panel.ts` auf die Importe umstellen**

Die Definitionen von `esc`, `count`, `money`, `amount`, `CSS`, `BENCHMARK_CSS` aus `src/panel.ts` entfernen und die lokale Konstante `stamp` in `panelHtml` löschen. Am Dateikopf ergänzen:

```ts
import { amount, count, esc, money, stamp } from "./panel/format"
import { BENCHMARK_CSS, CSS } from "./panel/styles"
```

- [ ] **Step 4: Verifizieren, dass sich nichts geändert hat**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS — dieselben 101 Tests wie vor der Task, keine Zusicherung angepasst.

- [ ] **Step 5: Commit**

```bash
git add src/panel/format.ts src/panel/styles.ts src/panel.ts
git commit -m "refactor: extract panel formatting and styles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Ansichten in Module aufteilen

`panel.ts` verschwindet zugunsten von `src/panel/index.ts` und vier Ansichtsmodulen. Reines Verschieben — keine Zeile Ausgabe ändert sich.

**Files:**
- Create: `src/domain/dashboard.ts`, `src/panel/views/models.ts`, `src/panel/views/agents.ts`, `src/panel/views/accounts.ts`, `src/panel/views/overview.ts`, `src/panel/index.ts`
- Delete: `src/panel.ts`
- Modify: `src/extension.ts` (Importpfad), `tests/panel.test.ts` (Importpfad)

**Interfaces:**
- Consumes: alles aus `src/panel/format.ts` und `src/panel/styles.ts` (Task 1).
- Produces:
  - `src/domain/dashboard.ts`: `DashboardState` (unverändertes Interface, aus `panel.ts` verschoben)
  - `views/models.ts`: `modelRows(offers: ModelOffer[]): string`, `modelFilters(): string`, `priceClass(offer: ModelOffer): string`, `purposeBadge(purpose: Purpose): string`, `providerBadge(provider: ModelOffer["provider"]): string`, `labels: Record<Purpose, string>`
  - `views/agents.ts`: `renderAgentRow(item: AgentAssessment, compact?: boolean): string`, `renderAgentGroups(items: AgentAssessment[]): string`
  - `views/accounts.ts`: `renderAccountSummary(account: AccountStatus): string`, `renderOpenRouterSection(accounts, management): string`, `renderProviderSection(provider, accounts): string`
  - `views/overview.ts`: `renderRanks(offers: ModelOffer[]): string`
  - `src/panel/index.ts`: `panelHtml(state: DashboardState): string`
- Task 3 baut `fragments` in `index.ts` auf genau diesen Funktionen auf.

- [ ] **Step 1: `DashboardState` verschieben**

`src/domain/dashboard.ts` anlegen mit dem Interface aus `panel.ts:11`, unverändert, plus den nötigen Typimporten (`ProviderSnapshot`, `PriceChange`, `AgentMetadata`, `AccountStatus`, `OpenRouterManagementStatus`, `AiResult`).

- [ ] **Step 2: Funktionen auf die Module verteilen**

Jede Funktion wandert unverändert in die Datei, die laut Tabelle oben zuständig ist, und bekommt `export`:

- `views/models.ts`: `labels`, `purposeIcon`, `purposeBadge`, `providerBadge`, `quotaLine`, `priceClass`, `priceCell`, `tierDetails`, `benchmarkCell`, sowie `modelRows(offers)` und `modelFilters()` — die beiden entstehen aus den bisher in `panelHtml` inline gebauten Zeichenketten für `<tbody>` und `<div class="filters">`.
- `views/agents.ts`: `statusLabel`, `agentPurpose`, `agentGroup`, `renderAgentRow`, `renderAgentGroups`.
- `views/accounts.ts`: `accountValue`, `renderAccountSummary`, `metric`, `renderManagedKey`, `renderOpenRouterSection`, `renderProviderSection`.
- `views/overview.ts`: `renderRanks`.

`purposeIcon` wird von `views/overview.ts` mitbenutzt und deshalb aus `views/models.ts` exportiert.

- [ ] **Step 3: `src/panel/index.ts` schreiben**

`panelHtml` übernimmt unverändert die Rumpflogik aus `panel.ts:122-138` und ruft die verschobenen Funktionen über Importe auf. Die erzeugte Zeichenkette muss Zeichen für Zeichen dieselbe bleiben.

- [ ] **Step 4: Importpfade nachziehen und alte Datei löschen**

```bash
rm src/panel.ts
```

In `src/extension.ts` Zeile 19:

```ts
import { panelHtml } from "./panel/index"
import type { DashboardState } from "./domain/dashboard"
```

In `tests/panel.test.ts` Zeile 2:

```ts
import { panelHtml } from "../src/panel/index"
```

- [ ] **Step 5: Verifizieren, dass die Ausgabe identisch ist**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS — alle Panel-Tests grün, ohne dass eine Zusicherung angefasst wurde. Schlägt einer fehl, ist beim Verschieben etwas verlorengegangen; nicht den Test anpassen, sondern die Ursache suchen.

- [ ] **Step 6: Commit**

```bash
git add -A src/panel src/domain/dashboard.ts src/extension.ts tests/panel.test.ts
git commit -m "refactor: split the panel into view modules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Fragmente erzeugen

`fragments(state)` liefert je Bereich den inneren HTML-Inhalt. Noch ohne Wirkung im Webview — das kommt in Task 4. So bleibt die Fragmenterzeugung für sich testbar.

**Files:**
- Modify: `src/panel/index.ts` (Container-Kennungen, `fragments`)
- Test: `tests/panel-fragments.test.ts` (neu)

**Interfaces:**
- Consumes: alle Renderfunktionen aus Task 2.
- Produces: `type FragmentId`, `fragments(state: DashboardState): Record<FragmentId, string>`. Task 4 sendet dieses Objekt per `postMessage`.

- [ ] **Step 1: Failing Test schreiben**

`tests/panel-fragments.test.ts`:

```ts
import { expect, test } from "bun:test"
import { fragments, panelHtml } from "../src/panel/index"
import type { DashboardState } from "../src/domain/dashboard"
import type { ModelOffer } from "../src/domain/model"

const offer = (id: string, input: number): ModelOffer => ({ provider: "opencode-zen", id, name: id, pricing: { input, output: input },
  capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: null, purposes: ["coding"] } })
const state = (offers: ModelOffer[]): DashboardState => ({ snapshots: [{ provider: "opencode-zen", offers, checkedAt: 1, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })

test("liefert jede Kennung, die im Dokument einen Container hat", () => {
  const html = panelHtml(state([offer("a", 1)]))
  for (const id of Object.keys(fragments(state([offer("a", 1)])))) {
    expect(html).toContain(`data-fragment="${id}"`)
  }
})

// Grundlage des Vergleichs im Webview: gleicher Zustand, gleiche Zeichenkette.
// Ohne diese Zusicherung wuerde jeder Abruf das DOM ersetzen und die Bedienung
// genauso wegwerfen wie der bisherige Neuaufbau.
test("erzeugt bei gleichem Zustand identische Zeichenketten", () => {
  expect(fragments(state([offer("a", 1)]))).toEqual(fragments(state([offer("a", 1)])))
})

test("ein geaenderter Preis beruehrt nur das Modell-Fragment", () => {
  const before = fragments(state([offer("a", 1)])), after = fragments(state([offer("a", 2)]))
  expect(after.models).not.toBe(before.models)
  expect(after.agents).toBe(before.agents)
  expect(after.accounts).toBe(before.accounts)
  expect(after["overview-agents"]).toBe(before["overview-agents"])
})

test("die Metrikzeile folgt der Modellzahl", () => {
  expect(fragments(state([offer("a", 1), offer("b", 2)])).metrics).toContain("2")
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/panel-fragments.test.ts`
Expected: FAIL mit „Export named 'fragments' not found".

- [ ] **Step 3: Container-Kennungen im Dokument ergänzen**

In `panelHtml` bekommt jeder zustandsabhängige Bereich ein `data-fragment`. Die Kennung sitzt am **umschließenden** Element; ersetzt wird später dessen `innerHTML`:

- `<div class="metrics" data-fragment="metrics">`
- `<div class="attention" data-fragment="attention"></div>` — neu, direkt unter der Metrikzeile, in Etappe 1 dauerhaft leer. Der Container entsteht schon jetzt, damit Task 4 einen stabilen Tauschplatz hat und Etappe 2 nur noch füllt.
- `<div class="insight" data-fragment="insight">`
- `<section class="card rankings" data-fragment="overview-ranks">`
- `<section class="card agents-card" data-fragment="overview-agents">`
- `<section class="card accounts-card" data-fragment="overview-accounts">`
- `<tbody data-fragment="models">`
- `<div class="agent-groups" data-fragment="agents">`
- `<div class="provider-sections" data-fragment="accounts">`

Die Meldungsstreifen (`refreshError`, `providerErrors`, `providerWarnings`) bleiben in Etappe 1 unverändert außerhalb der Fragmente — sie verschwinden in Etappe 2 zugunsten der Kopfzeile.

- [ ] **Step 4: `fragments` implementieren**

In `src/panel/index.ts`. Die Funktion ruft dieselben Renderfunktionen wie `panelHtml`; beide teilen sich die Vorbereitung, damit keine zwei Wahrheiten entstehen:

```ts
export type FragmentId = "metrics" | "attention" | "insight" | "overview-ranks" | "overview-agents" | "overview-accounts" | "models" | "agents" | "accounts"

export function fragments(state: DashboardState): Record<FragmentId, string> {
  const view = prepare(state)
  return {
    metrics: metricsInner(view),
    // In Etappe 1 dauerhaft leer; Etappe 2 fuellt die Kopfzeile.
    attention: "",
    insight: insightInner(view),
    "overview-ranks": ranksInner(view),
    "overview-agents": overviewAgentsInner(view),
    "overview-accounts": overviewAccountsInner(view),
    models: modelRows(view.offers),
    agents: renderAgentGroups(view.assessments),
    accounts: accountsInner(view),
  }
}
```

`prepare(state)` bündelt, was heute am Kopf von `panelHtml` steht:

```ts
interface PreparedView { state: DashboardState; offers: ModelOffer[]; free: number; assessments: AgentAssessment[]; preview: AgentAssessment[] }
function prepare(state: DashboardState): PreparedView
```

Die `*Inner`-Funktionen sind private Helfer in `index.ts`. Jede liefert genau den **inneren** Inhalt ihres Containers — also das, was heute zwischen den Tags der jeweiligen Zeile in `panelHtml` steht, ohne das umschließende Element selbst:

| Funktion | Inhalt (heute inline in `panelHtml`) |
|---|---|
| `metricsInner` | die vier `<span><strong>…</strong>…</span>` der Metrikzeile |
| `insightInner` | `<strong>✦ KI-Fazit</strong><span>…</span>` |
| `ranksInner` | `<h2>Beste Modelle für deinen Zweck</h2>` plus `renderRanks(offers)` |
| `overviewAgentsInner` | Kartenkopf, Vorschauzeilen, „Mehr Agenten anzeigen" |
| `overviewAccountsInner` | Kartenkopf plus `renderAccountSummary` je Konto |
| `accountsInner` | die drei Anbieterabschnitte |

`panelHtml` ruft dieselben Funktionen und setzt ihre Rückgaben in das Grundgerüst ein. Dadurch können die Ausgabe beim Aufbau und die beim Tausch nicht auseinanderlaufen — täten sie es, würde der erste Refresh sichtbar etwas verändern, obwohl sich keine Daten geändert haben.

- [ ] **Step 5: Tests laufen lassen, grün bestätigen**

Run: `npm run typecheck && npm test`
Expected: PASS, einschließlich der unveränderten Panel-Tests.

- [ ] **Step 6: Commit**

```bash
git add src/panel/index.ts tests/panel-fragments.test.ts
git commit -m "feat: render the panel as replaceable fragments

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Fragmenttausch im Webview

Der eigentliche Zweck der Etappe: Der Refresh lädt die Seite nicht mehr neu.

**Files:**
- Create: `src/panel/script.ts`
- Modify: `src/panel/index.ts` (Skript einbinden), `src/extension.ts:56` (`refreshPanel`)
- Test: `tests/panel-fragments.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `fragments(state)` und `FragmentId` aus Task 3.
- Produces: `SCRIPT: string`. Die Extension sendet `{ type: "fragments", fragments }`; das Webview beantwortet nichts.

- [ ] **Step 1: Failing Test für die Skript-Zusicherungen schreiben**

Ans Ende von `tests/panel-fragments.test.ts` anfügen:

```ts
// Das Skript ist eine Zeichenkette und laeuft im Test nicht. Geprueft wird
// deshalb, dass die Bausteine vorhanden sind, ohne die der Tausch die
// Bedienung wieder wegwerfen wuerde.
test("das Webview-Skript tauscht nur geaenderte Fragmente", () => {
  const html = panelHtml(state([offer("a", 1)]))
  expect(html).toContain("addEventListener('message'")
  expect(html).toContain("shown[id] === html")
  expect(html).toContain("data-fragment=")
  expect(html).not.toContain("onclick=")
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/panel-fragments.test.ts`
Expected: FAIL — der Nachrichtenempfänger fehlt noch.

- [ ] **Step 3: `src/panel/script.ts` anlegen**

Das bisherige Skript aus `panel.ts` mehrzeilig übernommen und um den Empfänger erweitert. Es bleibt eine Zeichenkette, weil es unter der CSP mit Nonce inline eingebettet wird.

```ts
export const SCRIPT = `
const vscode = acquireVsCodeApi()
const shown = {}

const show = (id) => {
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== id })
  document.querySelectorAll('[data-view]').forEach((button) => { button.classList.toggle('active', button.dataset.view === id) })
  scrollTo(0, 0)
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => show(button.dataset.view)))
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action })))

const applyFilter = () => {
  const q = search.value.toLowerCase(), p = provider.value, c = price.value, u = purpose.value
  document.querySelectorAll('[data-model]').forEach((row) => {
    row.hidden = !(row.dataset.model.includes(q) && (!p || row.dataset.provider === p) && (!c || row.dataset.price === c) && (!u || row.dataset.model.includes(u)))
  })
}
;['search', 'provider', 'price', 'purpose'].forEach((id) => document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', applyFilter))

// Ein Tausch verwirft den Inhalt samt aufgeklappten Bereichen und der
// Scrollposition der Tabelle. Beides wird um den Tausch herum gerettet.
const replaceFragment = (id, html) => {
  const host = document.querySelector('[data-fragment="' + id + '"]')
  if (!host) return
  const open = new Set()
  host.querySelectorAll('details[open][data-key]').forEach((item) => open.add(item.dataset.key))
  const wrap = host.closest('.table-wrap'), wrapTop = wrap ? wrap.scrollTop : 0
  const pageTop = window.scrollY
  host.innerHTML = html
  host.querySelectorAll('details[data-key]').forEach((item) => { if (open.has(item.dataset.key)) item.open = true })
  if (wrap) wrap.scrollTop = wrapTop
  window.scrollTo(0, pageTop)
}

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'fragments') return
  for (const [id, html] of Object.entries(event.data.fragments)) {
    // Gleicher Inhalt heisst: nichts anfassen. Das ist der Regelfall beim
    // stuendlichen Abruf und der Grund, warum die Bedienung stehen bleibt.
    if (shown[id] === html) continue
    shown[id] = html
    replaceFragment(id, html)
  }
  applyFilter()
})
`
```

- [ ] **Step 4: `data-key` an den aufklappbaren Bereichen ergänzen**

Damit die Wiederherstellung greift, brauchen die `<details>` eine stabile Kennung:

- `src/panel/views/models.ts`, in `tierDetails`: `<details class="tier-details" data-key="tier-${esc(offer.id)}">`
- `src/panel/views/models.ts`, in `benchmarkCell`: `<details class="benchmark-details" data-key="bench-${esc(offer.id)}">`
- `src/panel/views/overview.ts`, in `renderRanks`: `<details class="purpose-block purpose-${purpose}" data-key="purpose-${purpose}"${index === 0 ? " open" : ""}>`

- [ ] **Step 5: Skript einbinden und `refreshPanel` umstellen**

In `src/panel/index.ts` den Import auf `import { SCRIPT } from "./script"` umstellen; die bisherige lokale `SCRIPT`-Konstante entfällt.

In `src/extension.ts` die Funktion `refreshPanel` ersetzen:

```ts
// Das Dokument wird nur beim Oeffnen gesetzt. Ein erneutes Zuweisen von
// webview.html laedt die Seite neu und verwirft Filter, Scrollposition und
// die gewaehlte Ansicht — genau das soll der Fragmenttausch verhindern.
function refreshPanel(): void { if (panel) void panel.webview.postMessage({ type: "fragments", fragments: fragments(state) }) }
function buildPanel(): void { if (panel) panel.webview.html = panelHtml(state) }
```

Import in Zeile 19 ergänzen: `import { fragments, panelHtml } from "./panel/index"`.

Im `priceWatch.open`-Befehl (`extension.ts:163`) den Aufruf am Ende von `refreshPanel()` auf `buildPanel()` ändern — beim Öffnen und beim erneuten Anzeigen wird das Dokument gesetzt, danach nie wieder. In `connectAccount`, `disconnectAccount`, `connectOpenRouterManagement` und `disconnectOpenRouterManagement` bleibt `refreshPanel()` stehen: Dort ändern sich nur Daten.

- [ ] **Step 6: Verifizieren**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Von Hand prüfen — der eigentliche Beleg**

`F5` startet den Extension Development Host. Dort:

1. Panel öffnen, zur Ansicht *Modelle* wechseln.
2. Ins Suchfeld `claude` eintippen, einen Anbieter wählen, nach unten scrollen, eine Benchmark-Aufklappung öffnen.
3. `Preise jetzt aktualisieren` ausführen.
4. Erwartet: Ansicht, Suchtext, Filterauswahl, Scrollposition und die geöffnete Aufklappung stehen unverändert.

- [ ] **Step 8: Commit**

```bash
git add src/panel/script.ts src/panel/index.ts src/panel/views src/extension.ts tests/panel-fragments.test.ts
git commit -m "feat: refresh the panel by swapping fragments

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Zustand über einen Neuaufbau hinweg

Verwirft VS Code das Webview (Tab lange im Hintergrund, Fenster neu geladen), baut es die Seite von vorn auf. `retainContextWhenHidden: true` hilft nur innerhalb einer Sitzung.

**Files:**
- Modify: `src/panel/script.ts`
- Test: `tests/panel-fragments.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `SCRIPT` aus Task 4.
- Produces: nichts für spätere Tasks — letzte Task der Etappe.

- [ ] **Step 1: Failing Test schreiben**

```ts
test("sichert Ansicht und Filter im Webview-Zustand", () => {
  const html = panelHtml(state([offer("a", 1)]))
  expect(html).toContain("vscode.setState")
  expect(html).toContain("vscode.getState")
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test -- tests/panel-fragments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Sichern und Wiederherstellen ergänzen**

In `src/panel/script.ts` vor dem Nachrichtenempfänger einfügen und `show` sowie `applyFilter` um den Aufruf von `save()` erweitern:

```ts
const save = () => vscode.setState({
  view: [...document.querySelectorAll('.view')].find((view) => !view.hidden)?.id ?? 'overview',
  search: search.value, provider: provider.value, price: price.value, purpose: purpose.value,
})

const restore = () => {
  const saved = vscode.getState()
  if (!saved) return
  search.value = saved.search ?? ''
  provider.value = saved.provider ?? ''
  price.value = saved.price ?? ''
  purpose.value = saved.purpose ?? ''
  applyFilter()
  if (saved.view) show(saved.view)
}
restore()
```

Dazu zwei gezielte Änderungen am Skript aus Task 4:

- In `show` vor der schließenden Klammer `save()` ergänzen — aber **nicht** in `restore`, sonst schreibt das Wiederherstellen den Zustand direkt zurück.
- Der Horcher der Filterelemente bekommt eine Lambda statt der blanken Funktionsreferenz:

```js
;['search', 'provider', 'price', 'purpose'].forEach((id) => document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', () => { applyFilter(); save() }))
```

Der Aufruf `restore()` steht **nach** den Ereignishorchern und **vor** dem Nachrichtenempfänger: vorher gäbe es die Horcher noch nicht, nachher würde ein bereits eingetroffenes Fragment überschrieben.

- [ ] **Step 4: Verifizieren**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Von Hand prüfen**

Im Extension Development Host: Filter setzen, Ansicht *Agenten* wählen, das VS-Code-Fenster über die Befehlspalette neu laden (`Developer: Reload Window`), Panel erneut öffnen. Erwartet: Ansicht und Filter stehen wieder.

- [ ] **Step 6: Commit**

```bash
git add src/panel/script.ts tests/panel-fragments.test.ts
git commit -m "feat: keep view and filters across a webview rebuild

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifikation der Etappe

```bash
npm run typecheck && npm test && npm run build
```

Erwartung: alle Tests grün, `dist/extension.js` gebaut. Das Aussehen ist unverändert — Etappe 1 ändert ausschließlich Struktur und Aktualisierungsweg. Der Beleg, dass sie ihren Zweck erfüllt, ist der Handgriff aus Task 4, Schritt 7: Filter und Scrollposition überleben ein `Preise jetzt aktualisieren`.
