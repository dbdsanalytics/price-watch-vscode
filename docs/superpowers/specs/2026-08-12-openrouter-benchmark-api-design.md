# OpenRouter Benchmark-API – Design

## Ziel

Preis-Watch ergänzt den Modellkatalog um die kostenlose, authentifizierte OpenRouter-Benchmark-API. Die Extension zeigt für alle eindeutig zuordenbaren Modelle belastbare Einzelbenchmarks und deren Herkunft, ohne fehlende Werte zu schätzen.

## Zugriff und Sicherheit

- Endpoint: `GET https://openrouter.ai/api/v1/benchmarks`.
- Authentifizierung erfolgt mit dem ausdrücklich verbundenen normalen OpenRouter-API-Key aus VS Codes lokalem Secret Store.
- Der Key wird weder im Quellcode, im Cache, in Logs noch in der VSIX gespeichert.
- Management Keys bleiben ausschließlich für Guthaben und Key-Verbrauch zuständig.
- Es werden keine Prompts, Agentenanweisungen oder lokalen Konfigurationsinhalte übertragen.

## Datenfluss

Ein eigener Provideradapter lädt die Benchmarks und normalisiert die unterschiedlichen Response-Formen. Die Ergebnisse werden anhand der exakten OpenRouter-Modell-ID mit dem Katalog verbunden. OpenCode Zen und Go dürfen Werte nur über die bereits abgesicherte eindeutige Basismodell-Zuordnung erben.

Der bestehende Modellkatalog bleibt die Quelle für Preise und Fähigkeiten. Die Benchmark-API ergänzt Einzelwerte wie Genauigkeit, Streuung, Kosten pro Aufgabe, Anzahl ausgeführter Aufgaben und Zeitpunkt des letzten Laufs. Bestehende Artificial-Analysis-Indizes bleiben als Fallback erhalten.

## Aktualisierung und Fehler

- Benchmark-Daten werden höchstens einmal innerhalb von 24 Stunden neu geladen und lokal in `globalState` zwischengespeichert.
- Eine manuelle Aktualisierung darf den Cache erneuern.
- HTTP-, Authentifizierungs- oder Formatfehler entfernen keine vorhandenen Katalogdaten.
- Die Oberfläche unterscheidet API-Benchmark, öffentlichen Index, identisches Basismodell und fehlende Daten textlich.

## Oberfläche

Die Modellansicht erhält kompakte Benchmark-Details. Primär sichtbar sind der für den Einsatzzweck relevante Score, Aktualität und Datenbasis. Weitere Kennzahlen werden platzsparend darunter oder aufgeklappt dargestellt. Kosten-Effizienz wird aus tatsächlicher Benchmark-Genauigkeit und `avg_cost_per_task` gebildet, nicht aus Modellpreisen allein.

## Tests

- Normalisierung eines realistischen Benchmark-Responses.
- Exakte ID-Zuordnung und Ablehnung unsicherer Zuordnungen.
- Fallback auf bestehende Katalogwerte bei Fehlern.
- 24-Stunden-Cache und erzwungene manuelle Aktualisierung.
- Sichere HTML-Ausgabe aller neuen Felder.

