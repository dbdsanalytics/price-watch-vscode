# Datenverlässlichkeit — Entwurf

Stand: 2026-08-13. Betrifft Parser, Datenmodell und die Preisdarstellung.
Der Umbau der Oberfläche ist ausdrücklich **nicht** Teil dieses Entwurfs; er
folgt als eigenes Vorhaben.

## Ausgangslage

Die Parser wurden am 2026-08-13 gegen die Live-Quellen geprüft. Alle drei
Anbieter antworten (Zen 24.923 B, Go 14.162 B, OpenRouter 539 Modelle). Drei
Befunde, die falsche oder unvollständige Preise erzeugen:

### 1 · Gestufte Preise werden zur Hälfte verworfen

`parsePricing` überspringt jede Zeile, deren `norm()`-ID schon vorkam
(`opencode-docs.ts:76`). Da `norm()` Klammern entfernt, ergeben
„GPT 5.6 Sol (≤ 272K tokens)" und „GPT 5.6 Sol (> 272K tokens)" dieselbe ID —
die teurere Stufe fällt weg. Die Zen-Preistabelle hat 70 Datenzeilen, davon 9
obere Stufen; der Parser liefert 61 Angebote. In der Go-Tabelle sind es 3 von 22.

Betroffen sind unter anderem:

| Modell | Quelle | angezeigt | verworfen |
|---|---|---|---|
| GPT 5.6 Sol | Zen | $5 / $30 | $10 / $45 ab 272K |
| GPT 5.6 Terra | Zen | $2 / $12 | $4 / $18 ab 272K |
| GPT 5.5 | Zen | $5 / $30 | $10 / $45 ab 272K |
| GPT 5.4 | Zen | $2.50 / $15 | $5 / $22.50 ab 272K |
| Claude Sonnet 4.5 | Zen | $3 / $15 | $6 / $22.50 ab 200K |
| Gemini 3.1 Pro | Zen | $2 / $12 | $4 / $18 ab 200K |
| Grok 4.6 | Zen | $2 / $6 | $4 / $12 ab 200K |
| Grok 4.5 | Zen | $2 / $6 | $4 / $12 ab 200K |
| GPT 5.6 Luna | Zen + Go | $0.20 / $1.20 | $0.40 / $1.80 ab 272K |
| Qwen3.7 Plus | Go | $0.40 / $1.60 | $1.20 / $4.80 ab 256K |
| Qwen3.6 Plus | Go | $0.50 / $3 | $2 / $6 ab 256K |

Der Modellname trägt die Stufe zwar mit („GPT 5.6 Sol (≤ 272K tokens)"), die
obere Stufe steht aber nirgends — auch nicht im Ranking, das folglich mit dem
halben Preis sortiert. Für eine Preis-Watch ist das der teuerste Fehler: Genau
die langen Kontexte, ab denen der andere Tarif greift, sind bei Coding-Agenten
der Regelfall.

### 2 · Unlesbare Preiszellen werden zu „kostenlos"

`toUsd` (`opencode-docs.ts:10-15`) gibt bei `NaN` eine `0` zurück — dieselbe `0`
wie bei `"Free"`. Heute trifft das nur echte Gratis-Modelle. Ändert OpenCode die
Schreibweise (`"$1.40/M"`, `"1,40 $"`, Fußnotenzeichen), werden bezahlte Modelle
als kostenlos ausgewiesen und erscheinen im *Kostenlos*-Ranking oben. Dies ist
dieselbe Fehlerklasse wie `$880` statt `$1.40` (0.2.3) und `"2,150"` → `2`
(0.2.4). Regel 1 aus `AGENTS.md` — ein leeres Ergebnis ist ein Fehler — gilt
bisher nur für ganze Dokumente, nicht für einzelne Zellen.

### 3 · Fehlende Kontingente sind unsichtbar

MiniMax M2.5 steht in der Go-Preistabelle, aber nicht in der Anfragen-Tabelle;
die Quelle führt den Wert schlicht nicht. Der Parser reagiert korrekt, doch die
Oberfläche zeigt dann nur „$60 enthalten". Bei Go entscheidet laut `AGENTS.md`
das Kontingent und nicht der Token-Preis — dieses Modell ist damit
unvergleichbar, ohne dass es sichtbar wird.

## Entscheidungen

**Gestufte Preise als eine Zeile mit Preisspanne.** Ein Modell bleibt eine
Zeile; die Spanne (`$5–10 / $30–45`) macht die obere Stufe sichtbar, die
Schwellen stehen im Detail. Verworfen wurden: eine Zeile je Stufe (dasselbe
Modell erscheint mehrfach, die Rangliste füllt sich mit Dubletten) und die
teuerste Stufe als Leitwert (günstige Modelle wirken teurer, als sie im Alltag
sind).

**Sortiert wird nach der Basisstufe.** Sie ist der Preis, der im Regelfall
gilt. Dass eine teurere Stufe existiert, ist an der Spanne erkennbar.

**Absicherung zur Laufzeit statt im Testlauf.** Ein Prüfskript gegen die
Live-Quellen wäre wirksam, aber das Repository hat kein CI, das es ausführt.
Der Wächter läuft deshalb bei jedem Abruf beim Nutzer.

## Datenmodell (`src/domain/model.ts`)

`input`/`output` bleiben **unverändert die günstigste Stufe**. Ranking,
Preisvergleich (`diffOffers`) und Verlauf arbeiten dadurch ohne Anpassung weiter.

```ts
export interface PriceTier {
  thresholdTokens: number   // ab dieser Tokenzahl gilt die Stufe: 272000
  label: string             // "> 272K tokens", unverändert aus der Quelle
  input: number
  output: number
}
```

`ModelPricing` erhält `tiers?: PriceTier[]` — **nur die Stufen oberhalb der
Basis**, aufsteigend nach `thresholdTokens`. Fehlt das Feld, ist der Preis
einstufig.

`ModelOffer.tier?: string` existiert bereits (`model.ts:57`), wird aber nirgends
gesetzt oder gelesen. Es nimmt künftig die Bezeichnung der Basisstufe auf
(`"≤ 272K tokens"`), sodass `name` wieder der reine Modellname ist
(`"GPT 5.6 Sol"`).

## Parser (`src/providers/opencode-docs.ts`)

**Stufen zusammenführen.** Ein Modellname der Form `Basis (≤ 272K tokens)` oder
`Basis (> 272K tokens)` wird in Basisname, Label und Schwelle zerlegt; `272K`
ergibt `272000`. Trifft eine Zeile auf eine bereits bekannte ID, wird sie nicht
mehr verworfen, sondern einsortiert.

Maßgeblich ist der **Vergleichsoperator**, nicht die Zahl: Beide Stufen eines
Modells nennen dieselbe Schwelle (`≤ 272K` und `> 272K`), nur die Richtung
unterscheidet sie.

- Die `≤`-Stufe ist die Basis (`input`/`output`, `tier` = ihr Label).
- Jede `>`-Stufe wandert nach `pricing.tiers`.
- Trägt keine der Zeilen einen erkennbaren Operator, oder nur eine von mehreren,
  bleibt es beim bisherigen Verhalten: die erste Zeile gewinnt, weitere werden
  verworfen. Kein Angebot darf dabei stillschweigend gemischte Stufen führen.

**Unlesbare Zellen kenntlich machen.** `toUsd` liefert künftig
`number | undefined`:

| Zellinhalt | Ergebnis |
|---|---|
| `"$1.40"` | `1.4` |
| `"Free"` | `0` |
| alles andere (inkl. leer) | `undefined` |

Ist `input` oder `output` `undefined`, wird das Angebot mit `unknown: true`
aufgenommen; `input`/`output` erhalten `0`. Das bestehende `isFreePricing`
(`model.ts:74`) prüft `unknown` bereits und wertet solche Modelle damit
automatisch nicht mehr als kostenlos. `rankOffers` schließt sie über dieselbe
Prüfung aus (`ranking.ts:11`).

Die Cache-Spalten behalten `"-"` → `0`; dort bedeutet der Strich „nicht
angeboten", nicht „unbekannt". Für Anzahlen bleibt `toCount` unverändert.

## Laufzeit-Wächter (`src/domain/snapshots.ts`)

Neue zustandslose Funktion neben `carryForwardOffers`:

```ts
export function plausibilityWarning(
  previous: ProviderSnapshot | undefined,
  fresh: ProviderSnapshot,
): string | undefined
```

Sie meldet — in dieser Reihenfolge, die erste zutreffende Meldung gewinnt:

1. **Einbruch der Modellzahl:** `fresh.offers.length < previous.offers.length * 0.7`,
   sofern `previous` fehlerfrei war und Angebote hatte. Meldung nennt beide Zahlen.
2. **Neue unbekannte Preise:** Angebote mit `unknown: true`, deren ID im
   vorherigen Stand einen bekannten Preis hatte. Meldung nennt die Anzahl.

Das Ergebnis wandert als `warning?: string` in den `ProviderSnapshot`
(`src/domain/provider.ts`) und wird in `refresh` (`extension.ts:68`) gesetzt,
bevor `carryForwardOffers` läuft. Den Vorgänger sucht der Aufrufer über
`provider` aus `state.snapshots`; existiert keiner, entfällt die Prüfung.

**Warnung, nicht Fehler.** Die Daten sind vorhanden, nur verdächtig. Ein Fehler
würde `carryForwardOffers` auslösen und den frischen Stand durch den alten
ersetzen — das wäre hier falsch.

## Oberfläche (`src/panel.ts`) — nur das Nötige

Drei punktuelle Änderungen; der Umbau bleibt dem nächsten Vorhaben vorbehalten.

- **Preisspanne.** Bei vorhandenen `tiers` zeigt die Zelle `$5–10` statt `$5`.
  Die Schwellen erscheinen im bereits genutzten `<details>`-Muster
  (wie `benchmark-details`), Format: `≤ 272K tokens · $5.00 / $30.00`.
- **Fehlendes Kontingent benennen.** Führt ein Go-Angebot `quota`, aber keine
  `requestsPerMonth`, steht dort „Anfragen nicht in der Quelle" statt einer
  leeren Zeile.
- **Wächter-Hinweis.** `snapshot.warning` erscheint über der Tabelle in der
  vorhandenen `.notice`-Darstellung, optisch abgesetzt von `.notice.error`.

Alle neuen Werte laufen durch `esc()`.

## Tests

Neue Fixture `tests/fixtures-zen.mdx` — das am 2026-08-13 abgerufene Dokument,
eingefroren. `tests/fixtures-go.mdx` ist bereits mit der Live-Quelle identisch
und bleibt unverändert. Die Kriterien beziehen sich auf die Fixtures, nicht auf
die Live-Quellen.

In `tests/opencode-docs.test.ts`:

- `parseZenDocument(fixtures-zen)` liefert 61 Angebote, davon 9 mit `tiers`.
- GPT 5.6 Sol: `input: 5`, `output: 30`, `tier: "≤ 272K tokens"`,
  `tiers[0] = { thresholdTokens: 272000, label: "> 272K tokens", input: 10, output: 45 }`.
- Grok 4.6: Basis `2 / 6`, Stufe `4 / 12` ab 200000.
- `parseGoDocument(fixtures-go).offers` liefert 19 Angebote, davon 3 mit `tiers`;
  Qwen3.6 Plus: Basis `0.5 / 3`, Stufe `2 / 6` ab 256000.
- `name` enthält keine Klammer mehr; `tier` trägt sie.
- Eine Preiszelle `"1,40 $"` ergibt `unknown: true` und **nicht** `isFreePricing`.
- `"Free"` ergibt weiterhin `0` und `isFreePricing === true`.
- Ein Angebot ohne `requestsPerMonth` behält seine übrigen Kontingentwerte.

In `tests/snapshots.test.ts`:

- Rückgang von 61 auf 42 Angebote meldet eine Warnung, von 61 auf 55 nicht.
- Ein zuvor bepreistes Modell, das neu `unknown` ist, meldet eine Warnung.
- Ohne vorherigen Stand meldet die Funktion nichts.
- `carryForwardOffers` bleibt unverändert; eine Warnung ersetzt keinen Fehler.

In `tests/panel.test.ts`:

- Ein Angebot mit `tiers` erzeugt die Spanne und die Schwellenzeile.
- `snapshot.warning` erscheint als `.notice`, nicht als `.notice.error`.

## Nicht im Umfang

- Umbau von `panel.ts` (Struktur, Optik, Zustand) — eigenes Vorhaben.
- Prüfskript gegen die Live-Quellen; verworfen mangels CI.
- Änderungen an der Benchmark-Logik, am Ranking-Algorithmus oder an den
  OpenRouter-Parsern. Dass ohne verbundenen Key nur 159 von 539 Modellen
  Benchmarks tragen und die Ranglisten dadurch je nach Kontostand unterschiedlich
  lang sind, ist bekannt und bleibt hier unberührt.

## Verifikation

Nach jeder Änderung, bis grün:

```bash
npm run typecheck
npm test
npm run build
```

Zusätzlich einmal von Hand: Extension mit `F5` starten, Panel öffnen und prüfen,
dass GPT 5.6 Sol eine Spanne zeigt und die Schwellen im Detail stehen.
