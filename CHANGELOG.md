# Changelog

## 0.3.0 – 2026-08-13

- Zeigt oben in der Übersicht, was Aufmerksamkeit braucht: leeres Guthaben, Agenten auf abgekündigten Modellen, deutliche Preissprünge, Probleme beim Abruf. Ein Klick springt in die zuständige Ansicht. Ist nichts zu tun, bleibt die Zeile leer.
- Ergänzt eine Verlaufsansicht: Die Preisänderungen der letzten 90 Tage wurden bisher erhoben und zwischen Geräten synchronisiert, aber nie angezeigt — sichtbar war nur ihre Anzahl.
- Behält Filter, Scrollposition, gewählte Ansicht und aufgeklappte Bereiche beim stündlichen Abruf: Das Panel wird nicht mehr neu geladen, sondern tauscht nur die Teile, deren Inhalt sich geändert hat.
- Stellt die Übersicht auf vier gleichwertige Karten um; keiner der vier Zwecke wird mehr hervorgehoben.
- Neue Einstellung `priceWatch.priceJumpPercent` (Vorgabe 20) für die Schwelle, ab der ein Preissprung gemeldet wird.
- Entfernt den Agentenstatus „Teuer": Er war deklariert und beschriftet, wurde aber nie vergeben.

## 0.2.5 – 2026-08-13

- Zeigt gestufte Preise vollständig: Elf Modelle kosten oberhalb einer Kontextschwelle mehr — GPT 5.6 Sol $10 statt $5, Grok 4.6 $4 statt $2. Bisher war nur die günstige Stufe sichtbar, und die Ranglisten sortierten danach.
- Behandelt eine unlesbare Preiszelle als unbekannt statt als kostenlos; ein bezahltes Modell konnte so im Kostenlos-Ranking landen.
- Benennt fehlende Anfragenkontingente bei OpenCode Go, statt nur den enthaltenen Dollarwert zu zeigen.
- Warnt, wenn ein Anbieterdokument deutlich weniger Modelle liefert als zuvor oder Preise unlesbar werden.

## 0.2.4 – 2026-08-13

- Zeigt bei OpenCode Go, wie viele Anfragen das Abo hergibt und wie viel Nutzung enthalten ist — bei Go entscheidet das Kontingent, nicht der Token-Preis: Kimi K3 kostet je Token das Einundzwanzigfache von DeepSeek V4 Flash, liefert aber 323-mal weniger Anfragen.
- Liest Anzahlen mit Tausendertrennzeichen korrekt; „2,150" kam bisher als 2 an.
- Maskiert einfache Anführungszeichen und die Zahlenfelder der Benchmark-Daten in der Oberfläche.
- Ergänzt `AGENTS.md` als geladenen Einstieg mit Wegweiser und den Regeln, deren Verletzung die Fehler dieser und der letzten Version verursacht hat.

## 0.2.3 – 2026-08-13

- Zeigt für OpenCode Go keine erfundenen Preise mehr: Der Abschnitt „Usage limits" enthält zwei Tabellen, und die Anfragen je Zeitraum wurden als Dollarbeträge gelesen — GLM-5.2 erschien mit $880 statt $1.40, Grok 4.5 mit $120 statt $2.
- Führt gestufte Preise nur noch einmal auf und benennt die Stufe im Modellnamen, statt dasselbe Modell mehrfach mit abweichenden Werten zu listen.
- Behandelt ein Preisdokument ohne erkennbare Tabelle als Fehler statt als leeres Ergebnis; die zuletzt bekannten Preise bleiben sichtbar samt Zeitstempel.
- Macht Fehler in der Verarbeitung sichtbar, statt Statusleiste und Panel stumm auf dem alten Stand zu lassen.
- Liest alle drei Benchmark-Quellen statt einer: 1254 statt 233 Messwerte, darunter die kategoriegenauen Arena-Wertungen für Website, UI-Komponenten, Datenvisualisierung, Code und SVG.
- Zeigt das OpenCode-Go-Kontingent mit Fünf-Stunden-, Wochen- und Monatsfenster samt Reset-Zeitpunkt.
- Prüft einen Zugang, bevor er im Secret Store abgelegt wird, und weist Anbieter ohne Usage-Endpunkt als nicht überprüfbar aus, statt sie als verbunden zu melden.

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
