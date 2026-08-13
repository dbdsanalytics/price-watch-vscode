# Webview-Umbau — Entwurf

Stand: 2026-08-13. Betrifft die Oberfläche: Struktur von `panel.ts`, den
Aktualisierungsweg zwischen Extension und Webview, die Übersicht und eine neue
Verlaufsansicht.

Setzt auf dem Stand nach `2026-08-13-datenverlaesslichkeit-design.md` auf
(gestufte Preise, `pricing.tiers`, `ProviderSnapshot.warning`).

## Ausgangslage

### 1 · Jeder Refresh wirft die Bedienung weg

`refreshPanel()` setzt `panel.webview.html = panelHtml(state)` — das Dokument
wird komplett neu geladen. Der Timer läuft stündlich (`checkIntervalHours`,
Vorgabe 1). Bei jedem Durchlauf verlieren sich Scrollposition, Suchfeld, die
drei Filter-Auswahlen, die gewählte Ansicht und jedes aufgeklappte `<details>`.
`acquireVsCodeApi().setState` wird nirgends aufgerufen.

### 2 · `panel.ts` trägt vier Verantwortungen in einer Datei

31 KB: Datenaufbereitung, HTML-Erzeugung für vier Ansichten, das komplette CSS
und das Webview-Skript — alles als Zeichenketten. Escaping ist manuell; Commit
`d47c7b6` musste dort Lücken schließen. Eine Änderung an einer Ansicht zwingt
zum Lesen der ganzen Datei.

### 3 · Der Änderungsverlauf wird erhoben, aber nie gezeigt

`diffOffers` erfasst je Änderung Anbieter, Modell, Preisdimension, vorher,
nachher und Prozentsatz. `mergeHistory` hält 90 Tage vor, `setKeysForSync`
synchronisiert sie zwischen Geräten. Im Panel erscheint davon nur die Zahl
`state.history.length` in der Metrikzeile. Es gibt keine Liste und keinen
Filter — für einen der vier genannten Nutzungszwecke fehlt die Oberfläche
vollständig.

### 4 · Ein Agentenstatus ist unerreichbar

`AgentAssessment["status"]` führt `"expensive"` auf; kein `return` in
`assessAgent` setzt ihn. `statusLabel` in `panel.ts` hält dafür das Label
„Teuer" bereit, das nie erscheint.

## Entscheidungen

**Übersicht nach Variante B.** Eine Kopfzeile „Handlungsbedarf" ganz oben,
darunter vier gleich große Karten. Begründung: Alle vier Nutzungszwecke sind
gleich wichtig, also hebt das Layout keinen hervor — stattdessen zeigt die
Kopfzeile, wo gerade etwas zu tun ist. Verworfen: das heutige 2:1:1-Raster
erweitern (betont Rankings ohne Grund) und eine Trennung
„Entscheiden | Beobachten" (die Zuordnung ist nicht trennscharf — ein
Preissprung kann beides sein).

**Fragmenttausch statt Neuaufbau.** Kein Framework. Begründung: Die
Null-Abhängigkeits-Regel bleibt, das Bundle bleibt klein, die bestehenden
Panel-Tests prüfen weiterhin HTML-Zeichenketten. Preact oder Lit hätten
Reaktivität geschenkt, aber eine neue Build-Kette und den Neuschrieb aller
Panel-Tests gekostet — bei überschaubarem Zustand kein guter Tausch.

**Verlauf als fünfte Ansicht plus Karte in der Übersicht.** Folgt exakt dem
Muster, das Agenten und Konten bereits nutzen (Karte mit „Alle N" → eigene
Ansicht).

**Alle vier Auslöser für die Kopfzeile.** Agenten, Konten, Preissprünge,
Datenprobleme.

## Dateistruktur

`src/panel.ts` wird zu `src/panel/`:

| Datei | Verantwortung |
|---|---|
| `index.ts` | `panelHtml(state)` (einmaliger Aufbau), `fragments(state)` (Updates) |
| `views/overview.ts` | Kopfzeile Handlungsbedarf, vier Karten |
| `views/models.ts` | Tabelle, Filter, Preisspannen, Kontingentzeile |
| `views/agents.ts` | Gruppierung nach Handlungsbedarf |
| `views/accounts.ts` | Anbieterabschnitte, verwaltete Keys |
| `views/history.ts` | **neu** — Verlaufsliste mit Filter |
| `format.ts` | `esc`, `money`, `count`, `amount`, `stamp` |
| `styles.ts` | CSS als Zeichenkette |
| `script.ts` | Webview-Skript als Zeichenkette |

`DashboardState` wandert nach `src/domain/dashboard.ts`, damit `extension.ts`
und die Ansichten es importieren können, ohne dass eine Ansicht die anderen zieht.

## Aktualisierungsweg

### Aufbau

`panelHtml(state)` erzeugt das vollständige Dokument. Jede Ansicht und jede
Übersichtskarte liegt in einem Container mit stabiler Kennung:

```html
<section class="view" id="models" data-fragment="models">…</section>
```

### Update

`fragments(state)` liefert `Record<FragmentId, string>` — je Kennung den
**inneren** HTML-Inhalt. `FragmentId` umfasst jeden Bereich, dessen Inhalt von
`state` abhängt:

```
"metrics" | "attention" | "insight"
| "overview-ranks" | "overview-agents" | "overview-accounts" | "overview-history"
| "models" | "agents" | "accounts" | "history"
```

Metrikzeile und KI-Fazit gehören ausdrücklich dazu: Beide zeigen Werte aus
`state` (`offers.length`, `state.ai?.text`) und wären sonst nach dem ersten
Aufbau eingefroren.

**Alle Container bestehen dauerhaft**, auch wenn ihr Inhalt leer ist — sonst
fände `replaceFragment` beim nächsten Tausch kein Ziel. Die Kopfzeile
Handlungsbedarf ist also immer im Dokument; ist `collectAttention` leer,
liefert `fragments` dafür eine leere Zeichenkette, und die Umrandung wird per
CSS `:empty` ausgeblendet.

`refreshPanel()` sendet künftig statt `webview.html = …`:

```ts
void panel.webview.postMessage({ type: "fragments", fragments: fragments(state) })
```

Beim Öffnen des Panels wird `webview.html` weiterhin einmal gesetzt.

### Vergleich im Webview

Das Skript hält die zuletzt **empfangenen** Zeichenketten in einer Variablen
(nicht aus dem DOM gelesen — der Browser normalisiert Markup, ein Vergleich
gegen `innerHTML` meldete ständig Unterschiede):

```js
const shown = {}
for (const [id, html] of Object.entries(message.fragments)) {
  if (shown[id] === html) continue
  shown[id] = html
  replaceFragment(id, html)
}
```

Bleibt ein Fragment gleich — der Regelfall bei einem stündlichen Abruf ohne
Preisänderung — wird das DOM nicht angefasst. Scrollposition, Filter und
aufgeklappte Bereiche bleiben damit unberührt, ohne dass sie gerettet werden
müssten.

### Wiederherstellung beim tatsächlichen Tausch

`replaceFragment` sichert vor dem Ersetzen und stellt danach wieder her:

1. **Aufgeklappte `<details>`** — gesammelt über ihr `data-key`-Attribut, das
   die Ansichten künftig setzen (Modell-ID beziehungsweise Zweck).
2. **Scrollposition** — `window.scrollY` sowie `scrollTop` eines etwaigen
   `.table-wrap` im Fragment.
3. **Filter** — nach dem Ersetzen wird `applyFilter()` erneut aufgerufen; die
   Werte der Bedienelemente selbst liegen außerhalb der Fragmente und bleiben
   ohnehin stehen.

Die gewählte Ansicht liegt ebenfalls außerhalb der Fragmente (die
`hidden`-Attribute sitzen an den Containern, nicht in ihrem Inhalt) und
überlebt dadurch jeden Tausch.

### Zustand über einen Neustart hinweg

`acquireVsCodeApi().setState({ view, search, provider, price, purpose })` bei
jeder Bedienung; `getState()` beim Laden stellt Ansicht und Filter wieder her.
Das greift, wenn VS Code das Webview verwirft und neu aufbaut.

## Handlungsbedarf (`src/domain/attention.ts`, neu)

Reine Domain-Logik ohne Kenntnis von HTML, damit unabhängig testbar:

```ts
export interface AttentionItem {
  kind: "agent" | "account" | "price" | "data"
  severity: "warn" | "info"
  text: string
  view: "agents" | "accounts" | "history" | "models"
}

export function collectAttention(input: {
  assessments: AgentAssessment[]
  accounts: AccountStatus[]
  history: PriceChange[]
  snapshots: ProviderSnapshot[]
  refreshError?: string | null
  jumpPercent: number
  now?: number
}): AttentionItem[]
```

Auslöser, in dieser Reihenfolge sortiert (`warn` vor `info`, innerhalb dessen
in der Reihenfolge der Aufzählung):

| Quelle | Bedingung | Schwere |
|---|---|---|
| Daten | `refreshError` gesetzt — betrifft alle Anbieter, steht deshalb zuerst | warn |
| Daten | `snapshot.error` | warn |
| Daten | `snapshot.warning` | warn |
| Konten | `state === "exhausted"` | warn |
| Konten | `state === "low"` | warn |
| Agenten | `status === "deprecated"` oder `"unsuitable"` | warn |
| Preise | `Math.abs(percent) >= jumpPercent`, nur Änderungen der letzten 7 Tage | info |
| Agenten | `status === "alternative-available"` | info |

Gleichartige Einträge werden zu einer Zeile zusammengefasst („3 Agenten auf
abgekündigten Modellen"), damit die Kopfzeile bei vielen Treffern nicht die
Seite füllt. Ist die Liste leer, bleibt die Kopfzeile sichtbar leer — kein
„alles in Ordnung"-Streifen, der nur Platz kostet.

Jeder Eintrag ist anklickbar und wechselt in die Ansicht aus `view`.

**Die bisherigen `.notice`-Streifen entfallen.** `refreshError`,
`snapshot.error` und `snapshot.warning` erscheinen künftig ausschließlich als
Einträge der Kopfzeile — mitsamt dem Zusatz, den die Fehlerzeile heute trägt
(„zeigt weiterhin die Preise vom …"). Zwei Orte für dieselbe Meldung wären
gerade in der Ansicht, die Handlungsbedarf bündeln soll, widersinnig. Damit
entfällt auch das in der vorigen Version eingeführte `.notice.warn`.

**Neue Einstellung** `priceWatch.priceJumpPercent`, Typ `number`, Vorgabe `20`,
Minimum `1`, Beschreibung: „Ab welcher Preisänderung in Prozent ein Hinweis in
der Übersicht erscheint."

**Aufräumen:** `"expensive"` entfällt aus `AgentAssessment["status"]` und das
Label „Teuer" aus dem Panel. Der Status ist unerreichbar und wäre in der neuen
Kopfzeile eine Zeile, die nie erscheint.

## Verlaufsansicht (`src/panel/views/history.ts`, neu)

Liste der `PriceChange`-Einträge, neueste zuerst: Zeitpunkt, Anbieter, Modell,
Preisdimension, `vorher → nachher`, Prozentsatz mit Vorzeichen und Farbe
(teurer = orange, günstiger = grün, entsprechend dem bestehenden Farbsystem).

Filter analog zur Modellansicht: Freitext über Modellnamen, Auswahl über
Anbieter, Auswahl über Zeitraum (7 / 30 / 90 Tage). Die Filter arbeiten wie in
der Modellansicht über `data-`Attribute und `hidden`, ohne Neurendern.

Fehlt Verlauf (`history.length === 0`), steht dort „Noch keine Preisänderungen
aufgezeichnet" statt einer leeren Tabelle.

In der Übersicht: Karte mit den jüngsten drei Änderungen und „Alle N".

## Übersicht (`src/panel/views/overview.ts`)

Von oben nach unten:

1. Metrikzeile (unverändert), ergänzt um „Änderungen" als Verweis auf den Verlauf.
2. Kopfzeile Handlungsbedarf — entfällt, wenn `collectAttention` leer ist.
3. KI-Fazit (unverändert).
4. Vier gleich große Karten im Raster `repeat(auto-fit, minmax(240px, 1fr))`:
   Beste Modelle, Agenten, Konten, Verlauf. Unter 1050 px zwei Spalten, unter
   700 px eine — passend zu den bestehenden Umbruchpunkten.

Die Rankings verlieren dadurch ihre doppelte Breite. Die Zweck-Blöcke
(`purpose-block`) klappen künftig einzeln auf, statt alle sechs untereinander
zu stehen; offen ist beim ersten Aufbau nur „Coding".

## Tests

Neu:

- `tests/attention.test.ts` — jeder Auslöser einzeln, die Sortierung, das
  Zusammenfassen gleichartiger Einträge, leere Liste bei fehlerfreiem Zustand,
  Preissprünge älter als 7 Tage bleiben außen vor.
- `tests/panel-fragments.test.ts` — `fragments(state)` liefert alle Kennungen;
  identischer Zustand liefert identische Zeichenketten (Grundlage des
  Vergleichs); eine geänderte Preisangabe verändert genau das Fragment
  `models` und keines der übrigen.
- `tests/panel-history.test.ts` — Darstellung einer Änderung mit Vorzeichen und
  Richtung, leerer Verlauf, Filterattribute.

Bestehend: `tests/panel.test.ts` wird auf die neuen Modulpfade gezogen. Die
Zusicherungen bleiben inhaltlich — sie prüfen erzeugtes HTML, und das erzeugt
weiterhin dieselben Funktionen, nur an anderer Stelle.

## Umsetzung in zwei Etappen

Der Umfang ist etwa doppelt so groß wie beim vorigen Vorhaben. Deshalb zwei
Pläne, jeder für sich lauffähig:

**Etappe 1 — Unterbau.** Aufteilung in `src/panel/`, `fragments(state)`,
Fragmenttausch mit Vergleich und Wiederherstellung, `setState`/`getState`.
Danach ist die Bedienung repariert, das Aussehen unverändert.

**Etappe 2 — Oberfläche.** `attention.ts`, Kopfzeile, Vier-Karten-Raster,
Verlaufsansicht, Einstellung `priceJumpPercent`, Entfernen von `expensive`.

## Nicht im Umfang

- Änderungen an Parsern, Anbietern, Ranking oder Benchmark-Logik.
- Neue Datenquellen oder zusätzliche Anbieter.
- Eine Rendering-Bibliothek im Webview.
- Diagramme oder Preiskurven im Verlauf — die Liste genügt; eine Zeitreihe
  über 90 Tage mit fünf Preisdimensionen je Modell wäre ein eigenes Vorhaben.

## Verifikation

Nach jeder Änderung, bis grün:

```bash
npm run typecheck
npm test
npm run build
```

Zusätzlich von Hand nach Etappe 1: Panel öffnen, in der Modellansicht filtern
und scrollen, `Preise jetzt aktualisieren` ausführen und prüfen, dass Filter,
Scrollposition und Ansicht stehen bleiben.
