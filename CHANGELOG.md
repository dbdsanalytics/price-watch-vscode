# Changelog

## 0.2.2 – 2026-08-12

- Behält bei einem Anbieterausfall die zuletzt bekannten Preise samt Zeitstempel, statt Modelle und Vergleichsbasis zu verlieren.
- Wertet `priceWatch.aiEveryHours` tatsächlich aus; automatische KI-Kommentare halten den Abstand ein, manuelles Aktualisieren nicht.
- Meldet Modelle mit unbekanntem Preis nicht mehr als Preissturz und anschließenden Anstieg.
- Nimmt Modelle mit gemessenem Coding-Benchmark auch dann ins Coding-Ranking auf, wenn die Anbieterbeschreibung den Zweck nicht nennt.
- Entfernt den ungenutzten Preis-, KI- und Config-Code aus Version 0.1.

## 0.2.1 – 2026-08-12

- Ergänzt eine getrennte, ausschließlich lesende OpenRouter-Management-Verbindung für Gesamtguthaben und API-Key-Verbrauch.
- Strukturiert Agenten nach Handlungsbedarf, passenden Zuordnungen und fehlenden Bewertungsdaten.
- Gliedert Konten nach Anbieter, Verbindungstyp, Guthaben, Verbrauch, Limit und Reset.
- Kennzeichnet Anbieter, Fähigkeiten sowie kostenlose und kostenpflichtige Modelle mit einem konsistenten zugänglichen Farbsystem.
- Verhindert abgeschnittene wesentliche Konto- und Statustexte in schmalen Ansichten.
- Liest Agenten aus Markdown und `opencode.json(c)`, löst geerbte Standardmodelle auf und entfernt überschattete Duplikate.
- Kennzeichnet lokale LM-Studio-, Ollama- und lokale Provider-Modelle getrennt von fehlenden öffentlichen Katalogdaten.
- Stellt das vereinbarte kompakte 2:1:1-Dashboard mit responsiven Umbrüchen wieder her.
- Begrenzt die Agentenvorschau und verhindert überlaufende Texte in schmalen Karten.
- Behandelt negative OpenRouter-Platzhalter als unbekannte Preise statt als echte Werte.
- Nutzt die tatsächlichen OpenRouter-Benchmarks für belastbare Ranglisten.
- Schließt unbewertete und nicht textfähige Modelle aus Empfehlungen aus.
- Gestaltet Filter, Konten und Detailansichten mit nativen VS-Code-Farben neu.
- Verwirft den fehlerhaften lokalen Preisverlauf aus Version 0.2.0.

## 0.2.0 – 2026-08-12

- Zeigt alle Modelle von OpenRouter, OpenCode Zen und OpenCode Go getrennt an.
- Korrigiert OpenRouter-Preise auf USD pro 1 Mio. Tokens.
- Ergänzt Modellfähigkeiten, transparente Coding-Rankings und kostenlose/Bezahl-Ranglisten.
- Erkennt lokale OpenCode-Agenten, ohne vollständige Prompts zu übertragen.
- Ergänzt ausdrückliche Kontoverbindungen und verfügbare OpenRouter-Nutzungswerte.
- Speichert einen synchronisierbaren 90-Tage-Änderungsverlauf.
- Führt eine kompakte responsive Oberfläche mit Übersicht, Modellen, Agenten und Konten ein.
- Fügt ein neues Preis-Watch-Icon hinzu.
