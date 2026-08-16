import { expect, test } from "bun:test"
import { fragments, panelHtml } from "../src/panel/index"
import { modelRows } from "../src/panel/views/models"

test("renders safe responsive four-view dashboard", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [{ name: "reviewer", description: "Review", model: "openrouter/x", tools: [], prompt: "local only" }], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Vier gleichwertige Karten: keiner der vier Zwecke wird hervorgehoben.
  expect(html).toContain("repeat(auto-fit,minmax(240px,1fr))")
  expect(html).toContain("data-view=\"models\"")
  expect(html).toContain("Konten &amp; Limits")
  expect(html).toContain("Reasoning")
  expect(html).toContain('id="purpose"')
  expect(html).toContain("content-security-policy")
  expect(html).not.toContain("onclick=")
  expect(html).toContain("agent-preview")
  expect(html).toContain("Alle 1")
  expect(html).toContain("var(--vscode-input-background)")
  expect(html).not.toContain("-1000000")
})

// Das Dashboard schaltet ueber MediaQueries zwischen ein und drei Spalten um:
// die Basisregel (auto-fit) gilt fuer schmale Fenster, Medium faellt auf zwei
// Spalten zurueck, Wide zeigt drei Spalten und legt die Verlaufskarte in eine
// eigene Bahn. Weil mediaBlock nur den Inhalt der passenden Klammer zurueckgibt,
// steht eine Regel nur dann gruen, wenn sie wirklich in ihrer MediaQuery steht.
function mediaBlock(html: string, query: string): string {
  const marker = `@media(${query}){`
  const start = html.indexOf(marker)
  if (start < 0) return ""
  let depth = 0
  for (let i = start + marker.length; i < html.length; i++) {
    if (html[i] === "{") depth++
    else if (html[i] === "}") {
      if (depth === 0) return html.slice(start + marker.length, i)
      depth--
    }
  }
  return ""
}

test("stuft das Dashboard ueber die MediaQueries ab", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Wide (ab 1051px): drei Spalten, die Verlaufskarte liegt in der eigenen Bahn.
  expect(mediaBlock(html, "min-width:1051px")).toContain(".dashboard{grid-template-columns:2fr 1fr 1fr}")
  expect(mediaBlock(html, "min-width:1051px")).toContain(".dashboard .history-card{grid-column:1/-1}")
  // Medium (bis 1050px): zwei Spalten.
  expect(mediaBlock(html, "max-width:1050px")).toContain(".dashboard{grid-template-columns:1.6fr 1fr}")
  // Narrow (bis 700px): eine Spalte.
  expect(mediaBlock(html, "max-width:700px")).toContain(".dashboard{grid-template-columns:1fr}")
  // Kein Regellappen zwischen den Queries: Die Basisregel bleibt die einzige
  // auto-fit-Regel, die Overrides stehen nur in ihren MediaQueries.
  expect(mediaBlock(html, "min-width:1051px")).not.toContain("1.6fr")
  expect(mediaBlock(html, "max-width:1050px")).not.toContain("2fr 1fr 1fr")
})

test("renders a semantic color system and structured agent and account sections", () => {
  const offer = (provider: "openrouter"|"opencode-zen"|"opencode-go", id: string, input: number, purposes: Array<"coding"|"language"|"reasoning"|"vision"|"tools"|"allround">) => ({ provider, id, name: id, pricing: { input, output: input }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: purposes.includes("tools"), structuredOutput: false, reasoning: purposes.includes("reasoning"), contextLength: 1000, purposes }, benchmarks: { coding: 90, intelligence: 80, source: "test", details:[{ name:"gpqa_diamond", score:94.2, costPerTaskUsd:.2, sampleCount:198, lastRunAt:"2026-08-01T08:00:00Z" }] } })
  const html = panelHtml({
    snapshots: [{ provider: "openrouter", checkedAt: 1, stale: false, offers: [offer("openrouter","free-code",0,["coding","tools"]), offer("openrouter","paid-reason",1,["language","reasoning","vision","allround"])] }, { provider: "opencode-zen", checkedAt: 1, stale: false, offers: [offer("opencode-zen","zen",1,["language"])] }, { provider: "opencode-go", checkedAt: 1, stale: false, offers: [offer("opencode-go","go",1,["coding"])] }],
    history: [], agents: [{ name: "good", description: "Coding", model: "openrouter/free-code", tools: [], prompt: "local" }, { name: "missing", description: "Unknown", model: "", tools: [], prompt: "local" }], accounts: [],
    openRouterManagement: { state: "available", totalCreditsUsd: 100, totalUsageUsd: 25, remainingCreditsUsd: 75, keys: [{ hash: "abc", name: "Coding key", state: "active", reset: "monthly", usageUsd: 10, dailyUsd: 1, weeklyUsd: 4, monthlyUsd: 10 }] }, ai: null, updatedAt: 0, favorites: [],
  })
  for (const token of ["purpose-coding","purpose-language","purpose-reasoning","purpose-vision","purpose-tools","purpose-allround","provider-openrouter","provider-opencode-zen","provider-opencode-go","price-free","price-paid"]) expect(html).toContain(token)
  expect(html).toContain("agent-group-suitable")
  expect(html).toContain("agent-group-unknown")
  expect(html).toContain("account-provider-section")
  expect(html).toContain("Management Key · Nur Lesen")
  expect(html).toContain("75 $</strong><small>Verfügbar")
  expect(html).toContain("Coding key")
  expect(html).toContain("data-action=\"connect-management\"")
  expect(html).toContain("Benchmark")
  expect(html).toContain("<b>Coding</b> 90")
  expect(html).toContain("Öffentlich bewertet")
  expect(html).toContain("GPQA Diamond")
  expect(html).toContain("94,2 %")
  expect(html).toContain("198 Aufgaben")
  expect(html).toContain("0,2 $/Aufgabe")
})

test("zeigt Kontingentangaben ohne Dollarwert statt der generischen Zeile", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [{ provider: "opencode-go", state: "exhausted", message: "5 Std 0 % · Woche 100 % · Monat 50 %", resetAt: "2026-08-17T00:00:00.099Z" }], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("Woche 100 %")
  expect(html).toContain("Reset")
  expect(html).not.toContain("kein festes Schlüssellimit")
})

// Bisher konnte die Verarbeitung nach dem Abruf werfen, ohne dass irgendetwas
// sichtbar wurde: beide automatischen Aufrufwege nutzen void refresh(...), die
// Rejection blieb unbehandelt und das Panel zeigte weiter den alten Stand.
// Seit Etappe 2 fuehrt der Weg ueber collectAttention: die Domain-Funktion
// erzeugt den Eintrag (siehe attention.test.ts), das Panel stellt ihn dar.
test("meldet einen Fehler der Verarbeitung sichtbar im Panel", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [], refreshError: "Speichern fehlgeschlagen",
    attention: [{ kind: "data", severity: "warn", text: "Aktualisierung fehlgeschlagen: Speichern fehlgeschlagen", view: "models" }] })
  expect(html).toContain("Speichern fehlgeschlagen")
  expect(html).toContain("attention-item warn")
})

test("zeigt keine Fehlerzeile, wenn die Aktualisierung durchlief", () => {
  expect(panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })).not.toContain("notice error")
})

test("beschriftet Arena-Kategorien und zeigt die ELO-Wertung", () => {
  const offer: any = { provider: "openrouter", id: "z-ai/glm-5.2", name: "GLM 5.2", pricing: { input: 0.49, output: 1.54 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: 1000, purposes: ["coding"] },
    benchmarks: { source: "OpenRouter Benchmarks", match: "direct", details: [{ name: "arena_website", score: 59.6, elo: 1332, sampleCount: 4487 }] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("Arena · Website")
  expect(html).not.toContain("arena_website")
  expect(html).toContain("ELO 1332")
})

test("zeigt bei Go-Modellen das Kontingent statt nur den Token-Preis", () => {
  const go: any = { provider: "opencode-go", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", pricing: { input: 0.14, output: 0.28 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: 1000, purposes: ["coding"] },
    quota: { requestsPerMonth: 158_150, includedUsdPerMonth: 60 } }
  const html = panelHtml({ snapshots: [{ provider: "opencode-go", offers: [go], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("158.150 Anfragen/Monat")
  expect(html).toContain("enthalten")
})

// TypeScript-Typen pruefen zur Laufzeit nichts: Die Zahlenfelder der
// Benchmark-Details kommen ungefiltert aus JSON.parse und wurden roh
// interpoliert. Die CSP faengt eingeschleustes Markup ab — sie ist die zweite
// Verteidigungslinie, nicht die erste.
test("maskiert auch einfache Anfuehrungszeichen", () => {
  const offer: any = { provider: "openrouter", id: "x'y", name: "Modell 'Alpha'", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1, purposes: ["coding"] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).not.toContain("Modell 'Alpha'")
  expect(html).toContain("&#39;")
})

test("laesst kein Markup aus Zahlenfeldern der API durch", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1, purposes: ["coding"] },
    benchmarks: { source: "s", match: "direct", intelligence: "<img src=x onerror=alert(1)>" as any,
      details: [{ name: "gpqa_diamond", score: 1, sampleCount: "<b>roh</b>" as any, elo: "<i>roh</i>" as any }] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).not.toContain("<img src=x")
  expect(html).not.toContain("<b>roh</b>")
  expect(html).not.toContain("<i>roh</i>")
})

const tiered = {
  provider: "opencode-zen" as const, id: "gpt-5.6-sol", name: "GPT 5.6 Sol", tier: "≤ 272K tokens",
  pricing: { input: 5, output: 30, tiers: [{ thresholdTokens: 272_000, label: "> 272K tokens", input: 10, output: 45 }] },
  capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding" as const] },
}

test("zeigt bei gestuften Preisen die Spanne und die Schwellen", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("5–10 $")
  expect(html).toContain("30–45 $")
  expect(html).toContain("&gt; 272K tokens")
  expect(html).toContain("≤ 272K tokens")
})

// Bei Go entscheidet das Kontingent, nicht der Token-Preis. Fehlt es, ist das
// Modell unvergleichbar — das muss dastehen, statt stumm zu fehlen.
test("benennt ein fehlendes Anfragenkontingent", () => {
  const ohne = { ...tiered, provider: "opencode-go" as const, id: "minimax-m2.5", name: "MiniMax M2.5", pricing: { input: 0.3, output: 1.2 }, quota: { includedUsdPerMonth: 60 } }
  const html = panelHtml({ snapshots: [{ provider: "opencode-go", checkedAt: 1, stale: false, offers: [ohne] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("Anfragen nicht in der Quelle")
})

// Warnung und Hinweis muessen sich optisch unterscheiden: das eine verlangt
// eine Reaktion, das andere ist ein Angebot.
test("unterscheidet Warnung und Hinweis in der Kopfzeile", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [],
    attention: [{ kind: "data", severity: "warn", text: "Nur 42 statt zuletzt 61 Modelle gelesen", view: "models" },
      { kind: "price", severity: "info", text: "3 deutliche Preisänderungen", view: "history" }] })
  expect(html).toContain("Nur 42 statt zuletzt 61 Modelle gelesen")
  expect(html).toContain("attention-item warn")
  expect(html).toContain("attention-item info")
})

test("zeigt Handlungsbedarf als anklickbare Kopfzeile", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [],
    attention: [{ kind: "account", severity: "warn", text: "openrouter: Guthaben wird knapp", view: "accounts" }] })
  expect(html).toContain("openrouter: Guthaben wird knapp")
  expect(html).toContain('class="attention-item warn"')
  expect(html).toContain('data-view="accounts"')
})

// Zwei Orte fuer dieselbe Meldung waeren ausgerechnet in der Ansicht
// widersinnig, die Handlungsbedarf buendeln soll.
test("zeigt Anbieterfehler nicht mehr als eigenen Streifen", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", offers: [], checkedAt: 1, stale: true, error: { kind: "network", message: "offline" } }],
    history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [], refreshError: "kaputt" })
  expect(html).not.toContain('class="notice error"')
  expect(html).not.toContain('class="notice warn"')
})

// Accessibility der Webview: Landmarken, Tab-Beschriftung, aria-current,
// Fokuslandeplatz, sichtbarer Fokusring und versteckte Deko-Icons. Ein Modell
// mit Fähigkeits-Badge liefert alle drei Icon-Arten (b, i, span) ins HTML.
test("macht Navigation, Tabs, Filter und Tabellen fuer Screenreader zugaenglich und sperrt Bilder per CSP", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // CSP: Bilder sind komplett gesperrt — das Webview zeigt keine externen Inhalte.
  expect(html).toContain("img-src 'none'")
  // Landmarken: Navigation und Hauptbereich sind benannt.
  expect(html).toContain('<nav role="navigation" aria-label="Ansichten">')
  expect(html).toContain('<main role="main">')
  // Tabs: jeder einzelne beschriftet, der aktive traegt aria-current.
  expect(html).toContain('<button data-view="overview" class="active" aria-current="page" aria-label="Übersicht">Übersicht</button>')
  expect(html).toContain('<button data-view="models" aria-label="Modelle">Modelle</button>')
  expect(html).toContain('<button data-view="agents" aria-label="Agenten">Agenten</button>')
  expect(html).toContain('<button data-view="history" aria-label="Verlauf">Verlauf</button>')
  expect(html).toContain('<button data-view="accounts" aria-label="Konten und Limits">Konten &amp; Limits</button>')
  // Das Skript pflegt aria-current bei jedem View-Wechsel nach; die Fokuslandung
  // greift nur, wenn das Dokument den Fokus schon hat (kein Fokus-Raub beim Laden).
  expect(html).toContain("button.setAttribute('aria-current', 'page')")
  expect(html).toContain("button.removeAttribute('aria-current')")
  expect(html).toContain("if (document.hasFocus())")
  // Sichtbarer Fokusring nur bei Tastatur-Fokus.
  expect(html).toContain("button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible")
  expect(html).toContain("outline:2px solid var(--vscode-focusBorder")
  // Dekorative Icons bleiben Screenreadern verborgen (Badge, Provider-Punkt,
  // Zweck-Symbol — ein Beleg je Variante im gerenderten HTML).
  expect(html).toContain('<b aria-hidden="true">')
  expect(html).toContain('<i aria-hidden="true"></i>')
  expect(html).toContain('<span aria-hidden="true">')
  // Tabelle und Filtertrails sind mit Labels versehen.
  expect(html).toContain('<table aria-label="Modelle mit Preisen, Fähigkeiten und Benchmarks">')
  expect(html).toContain('aria-label="Modelle durchsuchen"')
  expect(html).toContain('aria-label="Anbieter filtern"')
})

// Wenn das Backend die aggregierten Dimensions-Scores noch nicht liefert, aber
// Einzelbenchmarks vorliegen, zeigt benchmarkCell die drei hoechsten davon
// sichtbar (Einzelwerte-Block) — statt der Benchmark-Zelle Leerlauf zu lassen.
// Die vollstaendige Liste bleibt im aufklappbaren details-Block.
test("zeigt bei Details ohne aggregierte Scores die drei hoechsten Einzelwerte sichtbar", () => {
  const offer: any = { provider: "openrouter", id: "z-ai/glm-5.2", name: "GLM 5.2", pricing: { input: 0.49, output: 1.54 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: 1000, purposes: ["coding"] },
    benchmarks: { source: "OpenRouter Benchmarks", match: "direct", details: [
      { name: "arena_website", score: 59.6, elo: 1332, sampleCount: 4487 },
      { name: "arena_codecategories", score: 71.8, sampleCount: 900 },
      { name: "arena_asciiart", score: 44.2, sampleCount: 500 },
      { name: "arena_uicomponent", score: 31.4, sampleCount: 300 },
    ] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Sichtbarer Block: Einzelwerte-Kopf und die drei hoechsten Werte mit
  // Mapping-Label und de-DE-Format (Komma, ein Nachkommawert).
  expect(html).toContain("<b>Einzelwerte</b>")
  expect(html).toContain("<b>Arena · Code</b> 71,8 %")
  expect(html).toContain("<b>Arena · Website</b> 59,6 %")
  expect(html).toContain("<b>Arena · ASCII-Art</b> 44,2 %")
  // Der Block liegt vor dem details-Element: sichtbar statt einklappbar.
  expect(html.indexOf("<b>Einzelwerte</b>")).toBeLessThan(html.indexOf('class="benchmark-details"'))
  // Der vierte Wert ist kein Einzelwert: er steht nur in der vollstaendigen
  // Liste nach dem details-Element.
  expect(html.indexOf("Arena · UI-Komponenten")).toBeGreaterThan(html.indexOf('class="benchmark-details"'))
  // Roh-Namen erscheinen nirgends, nur die Mapping-Labels.
  expect(html).not.toContain("arena_website")
})

test("maskiert Benchmark-Detail-Namen auch im Einzelwerte-Block", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1, purposes: ["coding"] },
    benchmarks: { source: "s", match: "direct", details: [{ name: "arena_vis&<svg", score: 80 }] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Namen außerhalb des Label-Mappings laufen durch esc(): & und < muessen
  // auch in der sichtbaren Pill maskiert sein, nicht nur in der Aufklappliste.
  expect(html).toContain("<b>arena_vis&amp;&lt;svg</b>")
  expect(html).not.toContain("arena_vis&<svg")
})

test("zeigt Modelle mit Scores oder ganz ohne Daten den bisherigen Zustand ohne Einzelwerte", () => {
  const base: any = { provider: "openrouter", pricing: { input: 1, output: 1 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1, purposes: ["coding"] } }
  const scored = { ...base, id: "s", name: "S", benchmarks: { source: "test", match: "direct", coding: 90, intelligence: 80, details: [{ name: "gpqa_diamond", score: 94.2 }] } }
  const scoredOnly = { ...base, id: "so", name: "SO", benchmarks: { source: "test", match: "direct", coding: 70 } }
  const plain = { ...base, id: "k", name: "K", benchmarks: undefined }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [scored, scoredOnly, plain], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Der Einzelwerte-Block erscheint NUR ohne Dimensions-Scores: Vorhandene
  // Scores gewinnen auch mit details, Modelle ohne Daten zeigen die Missing-Zeile.
  expect(html).toContain("<b>Coding</b> 90")
  expect(html).toContain("<b>Coding</b> 70")
  expect(html).toContain("Keine Daten")
  expect(html).not.toContain("<b>Einzelwerte</b>")
})

// Das Live-Badge war bisher immer gruen ("aktuell"), unabhaengig vom Alter der
// Daten. Seit der H1-Runde stuft liveLabel aus updatedAt und refreshError vier
// Zustaende ab; das Fragment "live" wird in der Kopfzeile in den live-slot
// gesetzt. Die Altersgrenzen: < 5 min aktuell, bis 24 h veraltet, danach Fehler.
test("stuft das Live-Badge nach Alter und Abruf-Fehler", () => {
  const state = (updatedAt: number, refreshError?: string) => ({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt, refreshError, favorites: [] })
  // Frisch (< 5 Minuten): gruene Klasse, Label "Daten aktuell", kein title.
  // role="status" liegt nicht auf dem Fragment (das wird beim Austausch
  // ersetzt), sondern auf dem stabilen live-slot-Wrapper in panelHtml.
  const fresh = fragments(state(Date.now() - 60_000)).live
  expect(fresh).toContain('class="live live-live"')
  expect(fresh).not.toContain("role=")
  expect(fresh).toContain('aria-label="Daten aktuell"')
  expect(fresh).toContain(">aktuell</span>")
  expect(fresh).not.toContain("title=")
  // 3 Stunden alt (5 min bis 24 h): gelbe Klasse, gerundete Stundenzahl.
  const stale = fragments(state(Date.now() - 3 * 3_600_000)).live
  expect(stale).toContain('class="live live-stale"')
  expect(stale).toContain('aria-label="Daten vor 3 Stunden aktualisiert"')
  expect(stale).toContain(">vor 3 h</span>")
  // 26 Stunden alt (ueber 24 h): rote Klasse, "veraltet".
  const old = fragments(state(Date.now() - 26 * 3_600_000)).live
  expect(old).toContain('class="live live-error"')
  expect(old).toContain('aria-label="Daten veraltet"')
  expect(old).toContain(">veraltet</span>")
  // Abruf-Fehler: rote Klasse, Label "Aktualisierung fehlgeschlagen" und der
  // Fehlertext als title — auch wenn das Alter selbst frisch waere.
  const error = fragments(state(0, "API offline")).live
  expect(error).toContain('class="live live-error"')
  expect(error).toContain('aria-label="Aktualisierung fehlgeschlagen"')
  expect(error).toContain('title="API offline"')
  expect(error).toContain(">Fehler</span>")
  // updatedAt 0 ohne Fehler: rote Klasse, "nicht aktualisiert".
  const never = fragments(state(0)).live
  expect(never).toContain('class="live live-error"')
  expect(never).toContain('aria-label="Noch nicht aktualisiert"')
  expect(never).toContain(">nicht aktualisiert</span>")
  // panelHtml setzt das Fragment in den live-slot der Kopfzeile; der Wrapper
  // ist stabil und traegt role="status" (damit Screenreader den Austausch des
  // inneren Spans als Live-Region-Update melden).
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: Date.now() - 60_000, favorites: [] })
  expect(html).toContain('<span class="live-slot" data-fragment="live" role="status"><span class="live live-live"')
})

// Edge-Fall Zukunft: updatedAt liegt vor der Systemzeit (z. B. Uhr wurde
// zurueckgestellt). Das Alter ist negativ — das Badge darf nicht "aktuell"
// gruenen, sondern meldet den Zeitkonflikt als Fehler.
test("stuft ein Live-Badge mit Zukunftsupdated als Zeitfehler ein", () => {
  const future = fragments({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: Date.now() + 3_600_000, favorites: [] }).live
  expect(future).toContain('class="live live-error"')
  expect(future).toContain('aria-label="Zeitfehler"')
  expect(future).toContain('title="Systemzeit liegt vor dem Aktualisierungszeitpunkt"')
  expect(future).toContain(">Uhr stimmt nicht</span>")
  // Auch im vollen panelHtml landet der Zeitfehler-Zustand im live-slot.
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: Date.now() + 3_600_000, favorites: [] })
  expect(html).toContain('<span class="live-slot" data-fragment="live" role="status"><span class="live live-error"')
})

// Leerer Katalog: eine Empty-Zeile ueber alle sechs Spalten statt einer leeren
// Tabelle. Ohne Modellzeilen gibt es keinen Filter, der zu streng sein koennte —
// der Filter-Empty-State gehoert deshalb nicht in diesen Fall. (Der Text
// "data-empty-filter" steht trotzdem im Seiten-HTML: als CSS- und JS-Selektor.)
test("zeigt bei leerem Katalog eine Empty-Zeile statt einer leeren Tabelle", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain('<tr class="empty-state"><td colspan="6">Noch keine Angebote geladen</td></tr>')
  expect(html).not.toContain("Keine Modelle gefunden — Filter anpassen")
})

// Mit Modellzeilen liegt die Filter-Empty-Zeile verdeckt bereit (hidden) und
// wird erst vom Script sichtbar, wenn keine [data-model]-Zeile mehr matched.
// Im statischen HTML pruefbar ist nur diese Startbedingung plus der Toggle.
test("legt den Filter-Empty-State verdeckt neben die Modellzeilen", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain('<tr class="empty-state" data-empty-filter hidden><td colspan="6">Keine Modelle gefunden — Filter anpassen</td></tr>')
  expect(html).not.toContain("Noch keine Angebote geladen")
  // Das Script toggelt hidden auf [data-empty-filter] bei null sichtbaren
  // [data-model]-Zeilen.
  expect(html).toContain("emptyFilter.hidden = visible > 0")
})

// H4-Kontrastrunde: Die Akzentfarben des Panels sind fuer helle VS-Code-Designs
// zu blass. Der Light-Override (body.vscode-light / body.vscode-high-contrast-light)
// setzt violet/green/allround auf kontrastreiche Werte und laesst das
// insight strong statt des harten #d8b4fe die (ueberschriebene) --violet-
// Variable verwenden. Dark bleibt unveraendert: :root traegt weiterhin die
// Originalwerte, und die allround-Verwendungen laufen ueber die Variable,
// damit der Override ueberhaupt greifen kann. Das komplette CSS liegt als
// Konstante im <style>-Block, deshalb traegt derselbe HTML-String beide
// Zustaende (Light-Override UND Dark-Originale).
test("legt fuer helle VS-Code-Designs kontrastreiche Akzentfarben ueber die Dark-Werte", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // (a) Light-Override: beide Selektor-Regeln mit allen drei Hexwerten.
  expect(html).toContain("body.vscode-light,body.vscode-high-contrast-light{--violet:#7c3aed;--green:#15803d;--allround:#475569}")
  expect(html).toContain("body.vscode-light .insight strong,body.vscode-high-contrast-light .insight strong{color:var(--violet)}")
  // (b) Dark bleibt: die Originalwerte stehen weiterhin in :root — geprueft
  // auf demselben HTML-String wie der Light-Override.
  expect(html).toContain("--violet:#a78bfa")
  expect(html).toContain("--green:#4ade80")
  expect(html).toContain("--allround:#94a3b8")
  // Auch das insight strong behaelt im Dark den harten Violettton; der
  // Override gilt nur fuer helle Designs.
  expect(html).toContain(".insight strong{white-space:nowrap;color:#d8b4fe}")
  // Die allround-Verwendungen laufen ueber die Variable, sonst wuerde der
  // Light-Override fuer allround ins Leere zielen.
  expect(html).toContain(".purpose-allround{color:var(--allround)}")
  expect(html).toContain(".agent-group-unknown{border-left:3px solid var(--allround)}")
  // Der Override steht in der Kaskade NACH :root: nur so kann er die
  // Dark-Werte ueberschreiben (body.vscode-light ist zwar spezifischer, die
  // Position sichert die Regel zusaetzlich ab).
  expect(html.indexOf("body.vscode-light")).toBeGreaterThan(html.indexOf(":root{"))
})

// Runde 4: Ein verbundenes Konto zeigt neben dem Connect-Button einen
// Trennen-Button — [data-action="disconnect"] fuer die API-Keys,
// [data-action="disconnect-management"] fuer den OpenRouter Management-Key.
// Geprueft werden vollstaendige <button>-Zeilen (nicht nur der Attributname,
// der im CSS/JS-Text des panelHtml ohnehin unschaerfe wäre).
test("zeigt bei verbundenen Konten je einen Trennen-Button mit aria-label", () => {
  const html = panelHtml({
    snapshots: [], history: [], agents: [], ai: null, updatedAt: 0, favorites: [],
    accounts: [
      { provider: "openrouter", state: "available", remainingUsd: 5, dailyUsd: 1, weeklyUsd: 4, monthlyUsd: 10 },
      { provider: "opencode-zen", state: "available", message: "Verbunden" },
      { provider: "opencode-go", state: "low", message: "Kontingent knapp" },
    ],
    openRouterManagement: { state: "available", totalCreditsUsd: 100, totalUsageUsd: 25, remainingCreditsUsd: 75, keys: [] },
  })
  // Beide Verbindungswege von OpenRouter: API-Key und Management-Key.
  expect(html).toContain('<button data-action="disconnect" aria-label="OpenRouter API-Key trennen">Trennen</button>')
  expect(html).toContain('<button data-action="disconnect-management" aria-label="OpenRouter Management-Key trennen">Trennen</button>')
  // Auch die Anbieterkonten (Zen/Go) bekommen im verbundenen Zustand den Trennen-Button.
  expect(html).toContain('<button data-action="disconnect" aria-label="OpenCode Zen trennen">Trennen</button>')
  expect(html).toContain('<button data-action="disconnect" aria-label="OpenCode Go trennen">Trennen</button>')
})

// Negativprobe zum Runde-4-Verhalten: Nur verbundene Zustaende duerfen den
// Trennen-Button tragen. Dieser Test schlaegt fehl, sobald die Buttons
// unkonditional gerendert wuerden.
test("zeigt bei nicht verbundenen Konten keinen Trennen-Button", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).not.toContain('<button data-action="disconnect"')
  expect(html).not.toContain('<button data-action="disconnect-management"')
  // Der Connect-Button bleibt der einzige Weg — er heisst weiterhin "verbinden".
  expect(html).toContain('<button data-action="connect" aria-label="OpenRouter API-Key verbinden">Verbinden</button>')
  expect(html).toContain('<button data-action="connect-management" aria-label="OpenRouter Management-Key verbinden">Verbinden</button>')
})

// Runde-4-Refactoring in script.ts: [data-action]-Klicks laufen jetzt ueber
// bindActions — initial fuer das Dokument und im replaceFragment direkt nach
// host.innerHTML = html, weil der Tausch die alten Elemente samt Listenern
// verwirft. Vorher blieben die Buttons nach dem Fragment-Tausch stumm.
// Geprueft auf dem eingebetteten SCRIPT-Text des vollen panelHtml.
test("bindet [data-action]-Buttons initial und nach jedem Fragment-Tausch neu", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Definition: bindActions klickt genau den [data-action]-Wert als Nachricht.
  expect(html).toContain("const bindActions = (root) => root.querySelectorAll('[data-action]')")
  expect(html).toContain("vscode.postMessage({ type: button.dataset.action })")
  // Initiale Bindung fuer die beim Laden vorhandenen Buttons.
  expect(html).toContain("bindActions(document)")
  // Die Neubindung im Tauschpfad steht NACH dem Ersetzen des Inhalts: erst
  // host.innerHTML = html, dann bindActions(host). Vorher wuerde die Bindung
  // mit dem Tausch wieder verworfen.
  expect(html.indexOf("bindActions(host)")).toBeGreaterThan(html.indexOf("host.innerHTML = html"))
})

// Runde 5: Jede Modellzeile traegt neben data-model/data-provider/data-price
// jetzt auch data-name/data-input/data-output/data-benchmark — die Sortierwerte
// fuer die drei-Stufen-Sortierung der Tabelle. Geprueft wird die vollstaendige
// Zeilenoefnung mit konkreten Werten (die blossen Attributnamen staenden sonst
// auch im eingebetteten Script-Text).
test("markiert Modellzeilen mit den Sortier-Daten name, input, output und benchmark", () => {
  // Preise und Benchmark-Details: die Zeile soll beide Quellen abbilden.
  const offer: any = { provider: "openrouter", id: "m", name: "Alpha", pricing: { input: 1.5, output: 3 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] },
    benchmarks: { source: "test", match: "direct", coding: 90, intelligence: 80, details: [{ name: "gpqa_diamond", score: 94.2 }] } }
  // Direkt im modelRows-Fragment: exakte Attributfolge einer Modellzeile.
  const rows = modelRows([offer])
  expect(rows).toContain('<tr data-model="alpha openrouter coding" data-name="Alpha" data-provider="openrouter" data-price="paid" data-input="1.5" data-output="3" data-benchmark="90"><td>')
  // Derselbe Renderpfad im vollen panelHtml (das Fragment wird dort eingebettet).
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain('data-name="Alpha" data-provider="openrouter" data-price="paid" data-input="1.5" data-output="3" data-benchmark="90">')
  // Ohne aggregierte Scores liefert das hoechste Einzel-Benchmark den Sortierwert.
  const detailsOnly: any = { provider: "openrouter", id: "d", name: "Details", pricing: { input: 0.5, output: 1 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] },
    benchmarks: { source: "test", match: "direct", details: [{ name: "gpqa_diamond", score: 94.2 }] } }
  expect(modelRows([detailsOnly])).toContain('data-benchmark="94.2">')
})

// Die Helper priceSortValue/benchmarkSortValue legen unbekannte Preise und
// fehlende Benchmarks absichtlich ans Ende der aufsteigenden Sortierung:
// beide liefern einheitlich Number.MAX_VALUE (SORT_UNKNOWN), das als
// 1.7976931348623157e+308 im data-Attribut erscheint.
test("legt unbekannte Preise und fehlende Benchmarks ans Ende der Sortierwerte", () => {
  const offer: any = { provider: "openrouter", id: "u", name: "Unbekannt", pricing: { input: 1, output: 2, unknown: true },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const rows = modelRows([offer])
  expect(rows).toContain('data-price="unknown" data-input="1.7976931348623157e+308" data-output="1.7976931348623157e+308" data-benchmark="1.7976931348623157e+308">')
})

// Runde 5, Skript: Die Modelle-Tabelle blaettert statt alle Zeilen zu rendern.
// PAGE_SIZE=100, pro Seite werden nur die passenden Zeilen sichtbar geschaltet,
// der Seitenzahler ist eine aria-live-Region, die Blätter-Buttons tragen
// aria-Labels und sind an den Raendern deaktiviert.
test("bettet Pagination mit Seitenzahler, aria-live und Rand-Disabling ins Skript ein", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("const PAGE_SIZE = 100")
  // Seitenberechnung und Sichtbarkeitsfenster der Seite.
  expect(html).toContain("pages = Math.max(1, Math.ceil(visible / PAGE_SIZE))")
  expect(html).toContain("row.hidden = i < start || i >= start + PAGE_SIZE")
  // Seitenzähler als Live-Region, Blaettern waagerecht benannt.
  expect(html).toContain("info.textContent = 'Seite ' + page + ' von ' + pages")
  expect(html).toContain("info.setAttribute('aria-live', 'polite')")
  expect(html).toContain("bar.setAttribute('role', 'navigation')")
  expect(html).toContain("bar.setAttribute('aria-label', 'Modell-Seiten Navigation')")
  expect(html).toContain("prev.setAttribute('aria-label', 'Vorherige Modellseite')")
  expect(html).toContain("next.setAttribute('aria-label', 'Nächste Modellseite')")
  // disabled an den Raendern: vorne kein Zurück, hinten kein Weiter.
  expect(html).toContain("prev.disabled = page <= 1")
  expect(html).toContain("next.disabled = page >= pages")
  // Bei hoechstens einer Seite bleibt die Leiste verdeckt.
  expect(html).toContain("if (total <= PAGE_SIZE) { bar.hidden = true; bar.replaceChildren(); return }")
})

// Debounce: ein input-Event pro Tastendruck iteriert sonst bei hunderten Zeilen
// — 150 ms Pause, und jeder neue Filterlauf startet wieder auf Seite 1.
test("entprellt die Suche mit 150ms und startet Filter- und Change-Wechsel auf Seite 1", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain("clearTimeout(filterTimer); filterTimer = setTimeout(() => { page = 1; applyFilter() }, 150)")
  // Nur die Suche laeuft ueber den Debounce; die Selects filtern sofort.
  expect(html).toContain("document.getElementById('search').addEventListener('input', scheduleFilter)")
  expect(html).toContain("addEventListener('change', () => { page = 1; applyFilter() })")
})

// Runde 5: Die Sortierkoepfe der Modelle-Tabelle — drei Stufen (aufsteigend,
// absteigend, zurueck zur Default-Name-Sortierung), aria-sort-Pflege und
// Tastaturbedienung. Jeder Sortierwechsel beginnt wieder auf Seite 1.
test("sortiert ueber drei Stufen mit aria-sort und Tastatur, immer zurueck auf Seite 1", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Spaltenwahl: Modell(0), Input(2), Output(3), Benchmark(5).
  expect(html).toContain("const SORT_COLUMNS = [['name', 0], ['input', 2], ['output', 3], ['benchmark', 5]]")
  expect(html).toContain("th.setAttribute('data-sort', key)")
  expect(html).toContain("th.setAttribute('tabindex', '0')")
  expect(html).toContain("e.key === 'Enter' || e.key === ' '")
  // aria-sort: nur die aktive Spalte traegt den Wert, alle anderen nicht.
  expect(html).toContain("th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending')")
  expect(html).toContain("th.removeAttribute('aria-sort')")
  // Drei Stufen: asc -> desc -> Default (Name aufsteigend).
  expect(html).toContain("if (sortKey === key && sortDir === 'asc') sortDir = 'desc'")
  expect(html).toContain("else if (sortKey === key && sortDir === 'desc') { sortKey = 'name'; sortDir = 'asc' }")
  expect(html).toContain("else { sortKey = key; sortDir = 'asc' }")
  // Nach dem Umschalten beginnt die neue Ansicht auf Seite 1.
  expect(html).toContain("page = 1\n  updateSortAria()")
  // Pipeline-Reihenfolge: erst filtern, dann sortieren, dann paginieren.
  expect(html.indexOf("row._m = m")).toBeLessThan(html.indexOf("sortValue(a, sortKey)"))
  expect(html.indexOf("sortValue(a, sortKey)")).toBeLessThan(html.indexOf("row.hidden = i < start"))
})

// Runde 5: minimales Layout fuer die Blaetterleiste und Der Cursor auf den
// sortierbaren Kopfzeilen — von außen sichtbare Zeichen der neuen Steuerung.
test("gestaltet Seitenleiste und sortierbare Kopfzeilen", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain(".pagination{display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0 4px}")
  expect(html).toContain(".pagination[hidden]{display:none}")
  expect(html).toContain(".pagination button:disabled{opacity:.5;cursor:default}")
  expect(html).toContain("#models thead th[data-sort]{cursor:pointer}")
  expect(html).toContain("#models thead th[data-sort]:hover{color:var(--violet)}")
})

// Runde 7: Der Stern-Button einer Modellzeile spiegelt den Zustand der
// Watchlist. Favorisiert: aria-pressed="true" und gefuellter Stern ★, Label
// "aus Watchlist entfernen". Nicht favorisiert: aria-pressed="false", hohler
// Stern ☆, Label "in Watchlist aufnehmen". data-offer-key traegt exakt den
// offerKey (provider:id) — die Extension togglet damit state.favorites.
test("rendert den Stern-Button einer Modellzeile nach dem Favoritenstatus", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  // Favorisiert: der exakte Button-String aus dem modelRows-Fragment.
  const favorite = modelRows([offer], ["openrouter:m"])
  expect(favorite).toContain('<button class="favorite" data-action="toggle-favorite" data-offer-key="openrouter:m" data-favorite="true"')
  expect(favorite).toContain('aria-label="M aus Watchlist entfernen" aria-pressed="true">★</button>')
  // Nicht favorisiert: Press-Zustand false und das Aufnehmen-Label.
  const plain = modelRows([offer])
  expect(plain).toContain('<button class="favorite" data-action="toggle-favorite" data-offer-key="openrouter:m" data-favorite="false"')
  expect(plain).toContain('aria-label="M in Watchlist aufnehmen" aria-pressed="false">☆</button>')
  // Derselbe Renderpfad im vollen panelHtml: state.favorites (nicht der
  // Default) entscheidet. Beide Zustaende koexistieren im selben Dokument,
  // wenn zwei Modellzeilen unterschiedlich favorisiert sind.
  const second: any = { provider: "opencode-zen", id: "z", name: "Z", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }, { provider: "opencode-zen", offers: [second], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: ["openrouter:m"] })
  expect(html).toContain('data-offer-key="openrouter:m" data-favorite="true" aria-label="M aus Watchlist entfernen" aria-pressed="true">★')
  expect(html).toContain('data-offer-key="opencode-zen:z" data-favorite="false" aria-label="Z in Watchlist aufnehmen" aria-pressed="false">☆')
})

// Runde 7: Der "Nur Favoriten"-Umschalter liegt in der Filterleiste, ist ein
// Toggle-Button (aria-pressed, nicht aria-checked) und startet beim Klick
// wieder auf Seite 1. aria-pressed wird per setAttribute umgeschaltet — der
// Zustand fuehrt durch applyFilter in die UND-Verknuepfung der Zeilen.
test("bettet den Nur-Favoriten-Umschalter mit Toggle- und Seitenlogik ins Skript ein", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Exakter Button-String: id und data-testid, initial aus (aria-pressed="false").
  expect(html).toContain('<button type="button" id="favorites-only" data-testid="favorites-only" aria-pressed="false" aria-label="Nur Favoriten anzeigen">Nur Favoriten</button>')
  // Klick: aria-pressed umschalten und ab Seite 1 neu filtern.
  expect(html).toContain("favToggle.setAttribute('aria-pressed', on ? 'false' : 'true')")
  expect(html).toContain("if (favToggle) favToggle.addEventListener('click', () => {")
  // Der Toggle-Zustand ueberlebt Persistenz und Reload ueber setState/getState.
  expect(html).toContain("favoritesOnly: document.getElementById('favorites-only')?.getAttribute('aria-pressed') ?? 'false'")
  expect(html).toContain("if (favEl && saved.favoritesOnly === 'true') favEl.setAttribute('aria-pressed', 'true')")
})

// Runde 7: Der Favoritenfilter ist keine eigene Sicht, sondern die UND-
// Verknuepfung mit den bestehenden Filtern: Nur Zeilen mit
// data-favorite="true" (der Stern-Button ist Kind der Zeile, deshalb
// querySelector statt row.dataset) bleiben sichtbar, wenn aria-pressed auf
// true steht. Anbieter/Preis/Faehigkeit/Suche wirken weiterhin.
test("verknuepft den Favoritenfilter per UND mit den bestehenden Zeilenfiltern", () => {
  // Ein Modell ohne Benchmarks, damit die Zeilenoefnung mit dem
  // SORT_UNKNOWN-Wert endet und direkt in den Stern-Button des ersten <td>.
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // favOnly liest denselben aria-pressed-Zustand wie der Toggle-Listener.
  expect(html).toContain("const favOnly = document.getElementById('favorites-only')?.getAttribute('aria-pressed') === 'true'")
  // UND-Verzweigung am Ende der matchRow-Bedingung: ohne favOnly bleibt alles
  // wie bisher, mit favOnly zaehlt nur data-favorite="true"-Zeilen.
  expect(html).toContain("(!favOnly || row.querySelector('[data-favorite=\"true\"]') !== null)")
  // Das Attribut liegt auf dem Stern-Button (Kind der Zeile), nicht auf dem
  // tr: sonst bliebe der Filter immer leer. Der Button folgt unmittelbar auf
  // die gepruefte Zeilenoefnung — das tr selbst traegt kein data-favorite.
  expect(html).toContain('data-benchmark="1.7976931348623157e+308"><td><button class="favorite" data-action="toggle-favorite"')
})

// Runde 7: [data-action]-Buttons schicken ihren Typ als Nachricht an die
// Extension — Buttons mit data-offer-key (der Stern) legen den offerKey
// (provider:id) mit in die Nachricht, alle anderen senden unveraendert nur
// den Typ. Die if/else-Form ersetzt die Spread-Variante bewusst, damit der
// gepruefte Substring postMessage({ type: ... }) intakt bleibt.
test("haengt den offerKey nur an Nachrichten von Buttons mit data-offer-key an", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Beide Zweige existieren direkt im else.
  expect(html).toContain("if (button.dataset.offerKey) vscode.postMessage({ type: button.dataset.action, offerKey: button.dataset.offerKey })")
  expect(html).toContain("else vscode.postMessage({ type: button.dataset.action })")
  // Der bisher gepruefte Substring bleibt bestehen (Regression auf Runde 2).
  expect(html).toContain("vscode.postMessage({ type: button.dataset.action })")
})

// Runde 8 + Escaping-Fix: Der Modellvergleich. Jede Modellzeile traegt in der
// ersten Zelle (nach dem Stern-Button) einen Vergleichs-Button: <button
// class="compare" type="button" data-compare-toggle ...>. data-offer-key
// traegt exakt den offerKey (provider:id), data-offer die fertig formatierten
// Vergleichswerte als JSON — bewusst KEIN data-action, damit bindActions()
// den Button nicht als Extension-Nachricht behandelt.
//
// Seit dem Escaping-Fix enthaelt comparePayload ROHE Werte (kein esc() mehr):
// Die Maskierung passiert getrennt an zwei Stellen — (a) beim Schreiben
// sichert esc(JSON.stringify(payload)) das Attribut (die JSON-Schluessel
// erscheinen als &quot;, ein rohes data-offer="{" darf nie auftauchen),
// (b) beim Rendern esc()'t renderCompareView jeden Wert erneut (eigener
// Test unten). Im Attribut steht deshalb GENAU EIN &amp; pro & des
// Modellnamens — nie &amp;amp; (Doppel-Escaping wuerde auf ein esc() im
// Payload selbst hindeuten).
test("rendert je Modellzeile einen Vergleichs-Button mit maskiertem JSON-Payload", () => {
  // Der Modellname mit & trennt die beiden Maskierungsebenen scharf: nur bei
  // rohem Payload steht im Attribut &amp; (einmal esc), bei Payload-internem
  // esc() stüende dort &amp;amp;.
  const offer: any = { provider: "openrouter", id: "m", name: "M & Co", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const rows = modelRows([offer])
  // Button-Anfang: class, type und data-compare-toggle direkt hintereinander —
  // kein data-action dazwischen, der Vergleich laeuft komplett im Webview.
  expect(rows).toContain('<button class="compare" type="button" data-compare-toggle data-offer-key="openrouter:m" data-offer="')
  // (a) Attribut-Maskierung: die JSON-Schluessel sind &quot;-maskiert, die
  // Payload-Felder ctx und input sind im maskierten JSON-Text nachweisbar.
  expect(rows).toContain('data-offer="{&quot;name&quot;:&quot;M &amp; Co&quot;')
  expect(rows).toContain("&quot;ctx&quot;:&quot;1.000 Token&quot;")
  expect(rows).toContain("&quot;input&quot;:&quot;1 $&quot;")
  // Die JSON-Klammern { } bleiben unescaped, aber direkt nach dem { muss
  // bereits &quot; folgen — ein rohes data-offer="{"name" wuerde das Attribut
  // zerbrechen.
  expect(rows).not.toContain('data-offer="{"name"')
  // (b) Rohwerte im JSON-Payload: der Name liegt mit EINEM &amp; im Attribut
  // (einmal esc), nie doppelt — &amp;amp; wuerde auf esc() im Payload selbst
  // hindeuten.
  expect(rows).not.toContain("&amp;amp;")
  // Hart-Beweis fuer (b): Attributwert rueck-deskodiert und per JSON.parse
  // gelesen — das Skript bekommt so den ROHEn Namen "M & Co", nicht "M &amp; Co".
  const match = rows.match(/data-offer="([^"]*)"/)
  expect(match).not.toBeNull()
  const json = match![1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  const payload = JSON.parse(json) as Record<string, string>
  expect(payload.name).toBe("M & Co")
  expect(payload.provider).toBe("OpenRouter")
  expect(payload.ctx).toBe("1.000 Token")
  // Button-Ende: gerenderter Grundzustand aria-pressed="false" plus Label
  // (das Label esc()'t weiterhin wie ueblich).
  expect(rows).toContain('aria-pressed="false" aria-label="M &amp; Co zum Vergleich auswählen">⚖</button>')
  // Der Button ist Kind der ersten Zelle: nach dem Stern-Button, vor dem Namen.
  expect(rows.indexOf('<button class="favorite"')).toBeLessThan(rows.indexOf('<button class="compare"'))
  expect(rows.indexOf('<button class="compare"')).toBeLessThan(rows.indexOf("<strong>M &amp; Co</strong>"))
})

// Runde 8: Vergleichsleiste und Vergleichsansicht liegen als stabile Container
// ausserhalb des models-Fragments (des tbody): der Fragment-Tausch ersetzt nur
// den tbody-Inhalt, Leiste und Ansicht ueberleben unveraendert. Die Index-
// Pruefung auf dem vollen panelHtml belegt die Position: compare-bar VOR dem
// Fragment (zwischen Filterleiste und Tabelle), compare-view NACH der Tabelle.
test("legt Vergleichsleiste und Vergleichsansicht ausserhalb des models-Fragments an", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  expect(html).toContain('<div id="compare-bar" data-compare-bar hidden></div>')
  expect(html).toContain('<div id="compare-view" data-compare-view hidden></div>')
  expect(html.indexOf('id="compare-bar"')).toBeLessThan(html.indexOf('data-fragment="models"'))
  expect(html.indexOf('id="compare-view"')).toBeGreaterThan(html.indexOf('data-fragment="models"'))
})

// Runde 8, Skript: Der Modellvergleich lebt komplett im Webview. MAX_COMPARE=3
// begrenzt die Auswahl; bei voller Auswahl wird der Warn-Hinweis sichtbar und
// weitere Klicks auf nicht ausgewaehlte Modelle werden ignoriert. Die Leiste
// erscheint ab einer Auswahl, der Oeffnen-Button ist unter zwei Auswahlen
// deaktiviert (title erklaert warum), ✕ leert die Auswahl. COMPARE_ROWS fuehrt
// die Zeilen der Vergleichstabelle: Anbieter, Kontextlaenge, Preise,
// Modalitaeten, Tools, Reasoning und die Benchmark-Dimensionen.
test("bettet den Modellvergleich (MAX 3, Leiste, Warn-Hinweis, COMPARE_ROWS) ins Skript ein", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Begrenzung und Bindungslogik: Klicks wandern ueber [data-compare-toggle].
  expect(html).toContain("const MAX_COMPARE = 3")
  expect(html).toContain("const selectedKeys = []")
  expect(html).toContain("root.querySelectorAll('[data-compare-toggle]')")
  // Volle Auswahl: weitere Klicks werden ignoriert (kein Verdraengen), der
  // Warn-Hinweis in der Leiste erklaert den Zustand.
  expect(html).toContain("else if (selectedKeys.length < MAX_COMPARE) selectedKeys.push(key)")
  expect(html).toContain("'Maximal 3 Modelle vergleichbar — zuerst eine Auswahl aufheben.'")
  // Leiste ab einer Auswahl, Oeffnen erst ab zwei, ✕ leert die Auswahl.
  expect(html).toContain("if (n === 0) { bar.hidden = true; bar.replaceChildren(); return }")
  expect(html).toContain("open.disabled = n < 2")
  expect(html).toContain("open.title = n < 2 ? 'Mindestens 2 Modelle auswählen' : 'Vergleich öffnen'")
  expect(html).toContain("clear.setAttribute('aria-label', 'Vergleichsauswahl leeren')")
  // COMPARE_ROWS mit den exakten Zeilenanfuehrungen: Kontextlaenge (ctx) und
  // die Top-Benchmarks (details) als Anker der Zeilenliste.
  expect(html).toContain("['Kontextlänge', 'ctx']")
  expect(html).toContain("['Top-Benchmarks', 'details']")
  // Die Vergleichstabelle ist eine eigene Tabelle mit Label; Schliessen blendet
  // nur die Ansicht aus, die Auswahl (selectedKeys) bleibt erhalten.
  expect(html).toContain('<table class="compare-table" aria-label="Modellvergleich">')
  expect(html).toContain("close.addEventListener('click', () => { compareOpen = false; renderCompareView() })")
})

// Runde 8 + Escaping-Fix: Die Vergleichstabelle fuellt renderCompareView aus
// den ROHEn data-offer-Payloads (comparePayload esc()'t nicht mehr) — deshalb
// esc()'t das Skript JEDEN dynamischen Wert beim Einfuegen: c.name und
// c.provider im Kopf, c[row[1]] in jeder Zeile. Nur so bleibt ein Modellname
// wie "a<b" ein harmloser Text statt ein XSS-Vektor. Parallel ist der
// Payload-Parse in bindCompareToggles abgesichert: JSON.parse liegt in
// try/catch, ein defekter/verstümmelter data-offer-Wert ruft console.warn
// und bricht das Skript nicht ab.
test("sichert die Vergleichstabelle ab: esc() an allen dynamischen Werten und try/catch um den Payload-Parse", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Kopf: beide dynamischen Werte der Spalte sind esc()'t.
  expect(html).toContain("+ esc(c.name) +")
  expect(html).toContain("+ esc(c.provider) +")
  // Zeilenkoerper: jeder Zellwert c[row[1]] ist esc()'t.
  expect(html).toContain("+ esc(c[row[1]]) +")
  // Die alte ungesicherte Form (rohe Konkatenation ohne esc) existiert nicht mehr.
  expect(html).not.toContain("+ c.name + '<br><small>' + c.provider +")
  // JSON.parse liegt in try/catch — try { und catch kommen im Skript genau
  // einmal vor (eindeutige Zuordnung); console.warn meldet den Fehler samt
  // offerKey, statt das Skript abbrechen zu lassen.
  expect(html).toContain("try {")
  expect(html).toContain("offersData[btn.dataset.offerKey] = JSON.parse(btn.dataset.offer)")
  expect(html).toContain("} catch (e) { console.warn('compare payload unparseable', btn.dataset.offerKey, e) }")
})

// Runde 8: Der Vergleichszustand lebt auf dem offerKey und wird nach jedem
// models-Fragment-Tausch wiederhergestellt — die Buttons liegen im Fragment
// und werden mit dem Tausch verworfen. replaceFragment bindet deshalb fuer
// das models-Fragment die Toggles neu und ruft applyCompare: das setzt
// aria-pressed und die .selected-Markierung aus selectedKeys und pflegt
// Leiste/Ansicht (die ausserhalb des Fragments liegen und den Tausch
// ueberleben).
test("bindet Vergleichs-Buttons nach dem models-Fragment-Tausch neu und stellt die Auswahl wieder her", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, favorites: [] })
  // Neubindung NUR fuer das models-Fragment und NACH dem Ersetzen des Inhalts
  // (der Tausch verwirft die alten Elemente samt Listener).
  expect(html).toContain("if (id === 'models') { bindCompareToggles(host); applyCompare() }")
  expect(html.indexOf("bindCompareToggles(host)")).toBeGreaterThan(html.indexOf("host.innerHTML = html"))
  // applyCompare traegt aria-pressed und die .selected-Zeilenmarkierung nach.
  expect(html).toContain("btn.setAttribute('aria-pressed', on ? 'true' : 'false')")
  expect(html).toContain("row.classList.toggle('selected', on)")
  // Die Payloads werden frisch aus dem DOM gelesen (data-offer -> JSON.parse),
  // weil die getauschten Buttons ihre alten Payloads mitnehmen. Der Parse ist
  // try/catch-abgesichert: ein defekter Payload meldet console.warn statt das
  // Skript abbrechen zu lassen.
  expect(html).toContain("offersData[btn.dataset.offerKey] = JSON.parse(btn.dataset.offer)")
  expect(html).toContain("} catch (e) { console.warn('compare payload unparseable', btn.dataset.offerKey, e) }")
})
