# Preis-Watch

Eine VS-Code-Extension zur Beobachtung und Einordnung von KI-Modellpreisen bei OpenRouter sowie OpenCode Zen und Go.

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

## Lizenz

MIT
