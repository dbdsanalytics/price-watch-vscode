# Preis-Watch

Eine VS-Code-Extension zur Beobachtung und Einordnung von KI-Modellpreisen bei OpenRouter sowie OpenCode Zen und Go.

## Installation

Die Extension wird aus dem VSIX installiert:

```bash
code --install-extension price-watch-0.3.0.vsix
```

Alternativ im Release-Verlauf des Repository herunterladen und über *Extensions → … → Install from VSIX* installieren. Anschließend wird der Befehl `Preis-Watch: Preis-Watch öffnen` in der Befehlspalette angeboten.

## Entwicklung

```bash
bun install
bun test tests/
bun run typecheck
bun run build
```

Die Extension kann anschließend mit `F5` in einem Extension Development Host gestartet werden.

## Datenschutz

API-Schlüssel werden ausschließlich im VS Code Secret Store des jeweiligen Geräts gespeichert. Vollständige Agenten-Prompts bleiben lokal. Die Extension greift nicht auf Browser-Cookies oder fremde Anmeldedateien zu.

## Datenverfügbarkeit

Preis- und Modellinformationen werden aus offiziellen Anbieterquellen geladen. Guthaben und persönliche Nutzung werden nur angezeigt, wenn der Anbieter dafür eine zuverlässige Schnittstelle bereitstellt; fehlende Werte werden nicht geschätzt.

## Anbieter

Preis-Watch bezieht Kataloge aus drei unabhängigen Quellen, die als separate Angebote behandelt werden:

- **OpenRouter** – per-Token-Preise, umgerechnet auf USD pro 1 Mio. Tokens; optionaler Management-Key für Guthaben- und Limit-Abfragen.
- **OpenCode Zen** – Pay-as-you-go-Modelle aus dem offiziellen Zen-Dokument.
- **OpenCode Go** – Abonnement-Metadaten inklusive Angebote und veröffentlichter Limits aus dem Go-Dokument.

Jede Quelle wird separat geladen; fällt eine Quelle aus, bleibt die zuletzt gecachte Anzeige der anderen mit Zeitstempel sichtbar.

## Bekannte Einschränkungen

- Anbieter ohne maschinenlesbare Nutzungsschnittstelle zeigen Nutzungswerte als `nicht verfügbar` statt als Null oder unbegrenzt.
- Modelle ohne Benchmark-Werte werden als `unrated` markiert; numerische Scores werden nie aus Beschreibungen oder KI-Prosa abgeleitet.
- Guthaben- und Nutzungswerte fehlen bei Anbietern, die dafür keine zuverlässige Schnittstelle bereitstellen; sie werden nicht geschätzt.
- Kostenlose OpenRouter-Modelle unterliegen täglichen Nutzungslimits, die automatische KI-Kommentare begrenzen.

## Lizenz

MIT
