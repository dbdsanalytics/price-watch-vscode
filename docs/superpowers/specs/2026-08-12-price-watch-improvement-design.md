# Preis-Watch – Verbesserungsdesign

Datum: 2026-08-12

## Ziel

Die bestehende VS-Code-Extension wird von einer reinen Preisübersicht zu einem kompakten Modell-, Agenten- und Verbrauchsassistenten ausgebaut. Sie zeigt alle verfügbaren kostenlosen und kostenpflichtigen Modelle von OpenRouter, OpenCode Zen und OpenCode Go, erkennt Preisänderungen, bewertet Modelle nach Einsatzzweck und prüft, ob die aktuell von OpenCode-Agenten verwendeten Modelle weiterhin sinnvoll sind.

Die Extension bleibt lokal-first und benötigt kein eigenes Backend. Synchronisierbare, nicht geheime Daten werden über VS Code Settings Sync zwischen Geräten geteilt. Zugangsdaten bleiben pro Gerät im VS Code Secret Store.

## Erfolgsbedingungen

- OpenRouter-Preise werden korrekt von USD pro Token auf USD pro 1 Mio. Tokens umgerechnet.
- OpenRouter, OpenCode Zen und OpenCode Go sind eigenständige Datenquellen und Oberflächenbereiche.
- Alle kostenlosen und kostenpflichtigen Modelle sind durchsuchbar und filterbar.
- Modellfähigkeiten und belastbare Benchmarkwerte sind sichtbar und nachvollziehbar.
- Klappbare Bestenlisten unterscheiden kostenlose und kostenpflichtige Empfehlungen nach Einsatzzweck.
- OpenCode-Agenten und ihre zugewiesenen Modelle werden erkannt und bewertet.
- Verfügbare Guthaben-, Verbrauchs- und Limitdaten werden je verbundenem Konto angezeigt.
- Preisänderungen werden in einer einzigen Benachrichtigung zusammengefasst.
- Ein synchronisierter Preisverlauf umfasst 90 Tage.
- Die Oberfläche funktioniert in breiten, mittleren und schmalen VS-Code-Fenstern sowie in hellen und dunklen Themes.

## Nicht-Ziele

- Kein eigener Cloud-Dienst und kein eigenes Benutzerkonto.
- Keine automatische Änderung von Agenten- oder Modellkonfigurationen.
- Keine Schätzung persönlicher Restkontingente, wenn ein Anbieter keine zuverlässige Schnittstelle bereitstellt.
- Kein Versand vollständiger Agenten-Prompts an externe Dienste.
- Kein verstecktes Auslesen von Browser-Cookies oder bestehenden Zugangsdaten anderer Anwendungen.

## Architektur

Die Extension wird in klar getrennte Funktionsbereiche aufgeteilt:

1. Provider-Adapter laden und normalisieren externe Daten.
2. Ein gemeinsames Modellformat beschreibt Preis, Fähigkeiten, Benchmarks und Verfügbarkeit.
3. Eine Vergleichsschicht erkennt Änderungen und pflegt den Verlauf.
4. Eine Ranking-Schicht erstellt nachvollziehbare Bestenlisten.
5. Eine Agentenanalyse ordnet lokale OpenCode-Agenten ihren Modellen und Zwecken zu.
6. Konto-Adapter laden nur offiziell oder lokal zuverlässig verfügbare Guthaben- und Verbrauchswerte.
7. Die Webview rendert vier Ansichten: Übersicht, Modelle, Agenten sowie Konten & Limits.

Provider werden unabhängig abgerufen. Der Ausfall einer Quelle darf die übrigen Quellen nicht blockieren. Der letzte erfolgreiche Stand bleibt mit Zeitstempel sichtbar.

## Datenquellen

### OpenRouter

Die Models API liefert den vollständigen Modellkatalog mit Preisen, Beschreibung, Kontextlänge, Ein- und Ausgabemodalitäten, unterstützten Parametern und verfügbaren Benchmarks. Preise aus `prompt` und `completion` werden mit 1.000.000 multipliziert, bevor sie als Preis pro 1 Mio. Tokens gespeichert werden.

Der Modellabruf schließt alle Ausgabemodalitäten ein. Kostenlose Varianten bleiben als eigene Einträge sichtbar, wenn sie eine eigene Modell-ID besitzen.

Bei ausdrücklicher Kontoverbindung werden je nach Schlüsselberechtigung Guthaben, Gesamtverbrauch, täglicher, wöchentlicher und monatlicher Verbrauch sowie Schlüssel-Limits geladen. Ein Management-Key ist nur für Funktionen anzufordern, die ihn tatsächlich benötigen.

Preis-Watch behandelt den normalen API-Key und den Management Key als zwei getrennte Verbindungen. Der normale API-Key bleibt für das kostenlose KI-Fazit und den Status dieses einzelnen Schlüssels zuständig. Der Management Key wird ausschließlich lesend für `GET /api/v1/credits` und `GET /api/v1/keys` verwendet. Damit zeigt die Extension gekauftes Gesamtguthaben, Gesamtverbrauch, berechnetes Restguthaben sowie Limit, Restlimit und Tages-, Wochen- und Monatsverbrauch jedes vorhandenen API-Keys. Schreibende Management-Funktionen zum Erstellen, Ändern, Deaktivieren oder Löschen von Schlüsseln sind ausdrücklich nicht Teil der Extension.

### OpenCode Zen

Die offizielle Zen-Dokumentation liefert Modell-IDs und Pay-as-you-go-Preise pro 1 Mio. Tokens. Zusätzlich werden Cache-Preise und Deprecation-Daten erfasst, soweit vorhanden.

Persönliches Guthaben und Monatslimits werden nur angezeigt, wenn sie über eine offizielle authentifizierte Schnittstelle zuverlässig abrufbar sind. Andernfalls zeigt die Extension den Status „nicht automatisch abrufbar“ und einen Link zur offiziellen Konsole.

### OpenCode Go

Go ist ein eigener Abo-Bereich und wird nicht wie ein gewöhnlicher Pay-as-you-go-Anbieter behandelt. Erfasst werden:

- aktueller Abopreis,
- enthaltene Modelle,
- veröffentlichte Modellpreise,
- veröffentlichte Tages-, Wochen- und Monatsgrenzen,
- Resets und Nutzungswerte, soweit offiziell maschinenlesbar verfügbar.

Fehlt eine persönliche Usage-API, zeigt die Extension keine geschätzten Restprozente. Veröffentlichte Planlimits und persönliche Messwerte werden im Datenmodell getrennt gehalten.

## Gemeinsames Modellformat

Jeder Anbieter-Eintrag wird mindestens auf folgende Felder normalisiert:

- Provider und Provider-Typ,
- stabile Modell-ID und Anzeigename,
- kostenlos oder kostenpflichtig,
- Eingabe-, Ausgabe-, Cache- und sonstige Preise,
- Kontextlänge,
- Ein- und Ausgabemodalitäten,
- Tool-Aufrufe und strukturierte Ausgaben,
- Reasoning-Unterstützung,
- Beschreibung und bekannte Einsatzzwecke,
- Benchmarkwerte samt Quelle und Stand,
- Verfügbarkeit und Deprecation-Datum,
- letzter erfolgreicher Abruf.

Dasselbe Grundmodell darf mehrfach erscheinen, wenn Preis oder Leistungsumfang bei OpenRouter, Zen und Go unterschiedlich ist. Die Oberfläche kann solche Einträge gruppieren, darf sie aber nicht zu einem scheinbar einheitlichen Angebot verschmelzen.

## Modellkatalog und Fähigkeiten

Der Katalog zeigt alle Modelle und unterstützt kombinierbare Filter:

- Anbieter: OpenRouter, Zen, Go,
- kostenlos oder kostenpflichtig,
- Coding,
- Sprache und Text,
- Reasoning,
- Vision und Bilder,
- Tool-Nutzung,
- strukturierte Ausgaben,
- Kontextgröße,
- Verfügbarkeit und Deprecation.

Jede Modellzeile oder Modellkarte zeigt die wichtigsten Fähigkeiten, Preise, Kontextlänge, Anbieter und Preisentwicklung. Weitere Details sind aufklappbar.

## Rankings und KI-Erklärung

Klappbare Bestenlisten zeigen mindestens:

- beste kostenlose Modelle,
- beste kostenpflichtige Modelle,
- Coding,
- allgemeine Sprache und Text,
- Reasoning,
- Vision,
- Tool-Nutzung,
- Allround.

Die Rangfolge nutzt nur nachvollziehbare Daten: verfügbare Benchmarks, passende Fähigkeiten, Kontext und Preis-Leistung. Benchmarkquellen und Datenstand sind sichtbar. Modelle ohne belastbare Leistungswerte erscheinen als „noch nicht bewertet“ und erhalten keine erfundene Punktzahl.

Die konfigurierte OpenRouter-KI darf Rankings erklären und Alternativen zusammenfassen. Sie darf fehlende Leistungsdaten weder erfinden noch als Fakten darstellen. Die regelbasierte Rangfolge bleibt auch ohne KI-Key nutzbar.

## Preisänderungen und Verlauf

Nach jedem Abruf wird ein stabil sortierter Preisstand je Provider mit dem letzten Stand verglichen. Eine Änderung enthält:

- Provider und Modell-ID,
- alten und neuen Wert,
- betroffene Preisart,
- absolute und prozentuale Differenz,
- Erkennungszeitpunkt.

Alle Änderungen eines Abrufs werden in einer einzigen VS-Code-Benachrichtigung zusammengefasst. Details öffnen die Extension.

Der 90-Tage-Verlauf speichert nur Änderungen und höchstens einen kompakten täglichen Messpunkt pro relevantem Modell. Alte Daten werden automatisch entfernt. Anbieteränderungen an Abo- und Nutzungslimits werden als eigener Ereignistyp gespeichert.

## Synchronisierung

Über VS Code Settings Sync werden geteilt:

- Watchlist,
- 90-Tage-Verlauf in kompakter Form,
- letzter normalisierter Preisstand, soweit für geräteübergreifende Vergleiche erforderlich,
- UI-Einstellungen und Filter,
- nicht geheime Agenten-Metadaten und Bewertungen.

Nicht synchronisiert werden:

- API- und Management-Keys,
- OAuth-Tokens,
- vollständige Agenten-Prompts,
- andere geheime Kontodaten.

Konflikte zwischen Geräten werden deterministisch über Zeitstempel und stabile Ereignis-IDs zusammengeführt. Duplikate werden entfernt.

## OpenCode-Agenten

Die Extension liest globale und projektbezogene OpenCode-Agentenkonfigurationen lokal. Sie erkennt mindestens:

- Agentenname,
- Beschreibung,
- Tools,
- aktuelles Modell und Provider,
- Projektbezug.

Vollständige Prompts bleiben lokal. Für die automatische Zweckbestimmung dürfen ausschließlich Agentenname, Beschreibung, Tools und aktuelles Modell an die konfigurierte OpenRouter-KI gesendet werden.

Jeder Agent erhält eine der folgenden Bewertungen:

- weiterhin passend,
- gute, aber teure Wahl,
- günstigere vergleichbare Alternative verfügbar,
- funktional unpassend,
- veraltet oder nicht mehr verfügbar,
- mangels Daten nicht sicher bewertbar.

Empfehlungen vergleichen nur Modelle, die die für den Agentenzweck erforderlichen Fähigkeiten besitzen. Eine mögliche spätere Übernahme zeigt immer eine Vorschau und verlangt ausdrückliche Bestätigung; automatische Änderungen sind nicht Teil dieses Designs.

## Konten und Limits

Jeder Anbieter wird innerhalb der Extension ausdrücklich und getrennt verbunden. Die Extension übernimmt keine bestehenden Zugangsdaten automatisch.

Verbindungen können getestet, erneuert und entfernt werden. Secrets liegen ausschließlich im VS Code Secret Store. Die Oberfläche zeigt nur maskierte Kennungen, Berechtigungsumfang und Zeitpunkt des letzten erfolgreichen Abrufs.

OpenRouter bietet in diesem Bereich getrennte Aktionen für „API-Key verbinden“ und „Management Key verbinden“. Die Management-Verbindung zeigt ihren Nur-Lesen-Zweck vor der Eingabe eindeutig an. Ein fehlender individueller Key-Grenzwert wird als „kein festes Schlüssellimit“ bezeichnet und niemals als „unklar“, null oder unbegrenzt interpretiert.

Der Bereich unterstützt:

- OpenRouter-Guthaben und verfügbare Usage-Werte,
- OpenCode-Zen-Guthaben und Monatslimit, soweit offiziell verfügbar,
- OpenCode-Go-Planlimits und persönliche Nutzung, soweit offiziell verfügbar,
- Claude-Code-Abo- oder API-Nutzung, soweit über offizielle oder lokal zuverlässige Schnittstellen verfügbar.

Claude-Code-Nutzung wird nicht aus Browser-Sitzungen extrahiert. Lokal verfügbare Sitzungswerte und offizielle `/usage`- oder `/cost`-Daten dürfen über einen expliziten Integrationsweg erfasst werden. Nicht abrufbare Abo-Restwerte werden als solche gekennzeichnet.

Jede Kontoanzeige verwendet einen eindeutigen Zustand: verfügbar, fast verbraucht, verbraucht, Reset-Zeit bekannt oder nicht automatisch abrufbar. Fehlende Daten bedeuten weder null noch unbegrenzt.

## Oberfläche

Die visuelle Richtung ist modern und lebendig, bleibt aber mit VS-Code-Themes kompatibel. Vier Ansichten trennen die Aufgaben:

1. Übersicht
2. Modelle
3. Agenten
4. Konten & Limits

Die Ansichten verwenden ein gemeinsames funktionales Farbsystem. Kostenlos und gesund werden grün, kostenpflichtig und Limit-bezogen orange, KI und Reasoning violett, Coding blau, Sprache türkis, Vision rosa, Tools gelb und Allround graublau dargestellt. Anbieter-Badges sind davon unterscheidbar: OpenRouter violett, OpenCode Zen türkis und OpenCode Go blau. Farbe ist nie das einzige Unterscheidungsmerkmal; Text, Symbol oder Form ergänzen sie.

Zwecküberschriften sind typografisch deutlich größer als Modellnamen, Bewertungen und Preise. Abstände folgen einer kompakten 4/8/12/16-Pixel-Skala. Wesentliche Status-, Guthaben- und Hinweistexte dürfen umbrechen und werden nicht mit Auslassungszeichen abgeschnitten.

Die Agentenansicht verwendet keine gleichförmige Kachelwand. Sie gruppiert Agenten nach „Handlungsbedarf“, „Passend“ und „Nicht bewertbar“. Innerhalb jeder Gruppe bleiben Agent, aktuelles Modell, Zweck, Status und Empfehlung in stabilen Spalten ausgerichtet. Auf schmalen Fenstern werden diese Spalten zu einer hierarchischen Zeile untereinander angeordnet.

Die Kontenansicht zeigt je Anbieter einen eigenen strukturierten Bereich. Dessen Kopf enthält Anbieter, Verbindungstyp und Verbindungsstatus. Darunter folgen verfügbare Kennzahlen für Guthaben, heutigen, wöchentlichen und monatlichen Verbrauch sowie Limit und Reset. Aktionen gehören zum jeweiligen Anbieter. OpenRouter API-Key und Management Key werden innerhalb des OpenRouter-Bereichs getrennt dargestellt.

### Bestätigtes Übersichtsdesign

Die Kopfzeile enthält Navigation und Aktualitätsstatus. Darunter stehen die Kennzahlen ohne eigene Kacheln, beispielsweise `418 Modelle · 37 kostenlos · 12 Änderungen · 9 Agenten`.

Das KI-Fazit erscheint als schmale Hinweiszeile. Der Inhaltsbereich verwendet bei breiten Fenstern ein Verhältnis von 2:1:1:

- etwa 50 % für Bestenlisten,
- etwa 25 % für Agenten,
- etwa 25 % für Konten und Limits.

Agenten- und Kontolisten sind besonders kompakt: ungefähr 5–7 px Karten-Innenabstand und niedrige Zeilen ohne unnötige Leerflächen. Kartenhöhen folgen ausschließlich ihrem Inhalt.

### Responsives Verhalten

- Breit: drei Spalten im Verhältnis 2:1:1.
- Mittel: zwei Spalten; der Modellbereich erhält mehr Raum.
- Schmal: eine Spalte in der Reihenfolge Modelle, KI-Fazit, Agenten, Konten.
- Kennzahlen brechen bei Bedarf in ein 2×2-Raster um.
- Navigation reduziert sich auf schmalen Fenstern auf die wesentlichen Elemente.
- Kleine Fenster erhalten ausreichende Trefferflächen, ohne die Desktop-Dichte zu übernehmen.

Schriftgrößen und Abstände skalieren begrenzt mit `clamp()`. Es gibt keine schmale globale Maximalbreite, die auf großen Fenstern übermäßige Außenränder erzeugt.

## Fehlerbehandlung

- Jede Quelle hat einen eigenen Lade-, Erfolgs- und Fehlerzustand.
- Der letzte erfolgreiche Stand bleibt bei Fehlern sichtbar und wird als veraltet markiert.
- Fehlertexte nennen Provider, Zeitpunkt und eine sichere nächste Aktion.
- Parsing-Fehler durch geänderte Dokumentformate werden von Netzwerk- und Authentifizierungsfehlern unterschieden.
- Secrets, vollständige Prompts und Authorization-Header erscheinen nie in Logs oder Fehlermeldungen.
- Teilweise verfügbare Konto- oder Modelldaten werden nicht als vollständige Daten dargestellt.
- Gleichzeitige manuelle und automatische Aktualisierungen werden zusammengeführt, nicht parallel doppelt ausgeführt.

## Tests und Verifikation

Automatische Tests decken mindestens ab:

- OpenRouter-Umrechnung auf Preise pro 1 Mio. Tokens,
- Parsing von Zen- und Go-Dokumenten einschließlich Formatabweichungen,
- unabhängige Providerfehler,
- stabilen Hash und modellweisen Änderungsvergleich,
- zusammengefasste Benachrichtigungen,
- tägliche Messpunkte und 90-Tage-Bereinigung,
- Sync-Zusammenführung und Deduplizierung,
- Agentenerkennung aus globalen und projektbezogenen Konfigurationen,
- Datenschutzgrenze zwischen Metadaten und vollständigem Prompt,
- Rankingregeln und Behandlung fehlender Benchmarks,
- Konto-Verbindungszustände und Secret-Verarbeitung,
- HTML-Escaping und sichere Webview-Nachrichten.

UI-Prüfungen erfolgen mindestens bei breiter, mittlerer und schmaler Webview sowie in hellem und dunklem Theme. Dabei werden Überlauf, Fokusreihenfolge, Tastaturbedienung, Kontrast und responsive Reihenfolge geprüft.

## Einführung in Etappen

1. Datenmodell, korrekte OpenRouter-Preise und unabhängige Provideradapter.
2. Änderungsvergleich, Verlauf und Synchronisierung.
3. Responsiver Modellkatalog und bestätigte Übersicht.
4. Benchmarks, Fähigkeiten und regelbasierte Rankings.
5. Agentenerkennung und KI-gestützte Zweckbestimmung.
6. Ausdrückliche Konto-Verbindungen und verfügbare Verbrauchsdaten.

Jede Etappe bleibt ohne die späteren Etappen nutzbar und testbar.
