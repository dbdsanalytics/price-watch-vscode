import { expect, test } from "bun:test"
import { panelHtml } from "../src/panel/index"

test("renders safe responsive four-view dashboard", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [{ name: "reviewer", description: "Review", model: "openrouter/x", tools: [], prompt: "local only" }], accounts: [], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
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
    openRouterManagement: { state: "available", totalCreditsUsd: 100, totalUsageUsd: 25, remainingCreditsUsd: 75, keys: [{ hash: "abc", name: "Coding key", state: "active", reset: "monthly", usageUsd: 10, dailyUsd: 1, weeklyUsd: 4, monthlyUsd: 10 }] }, ai: null, updatedAt: 0,
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
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [{ provider: "opencode-go", state: "exhausted", message: "5 Std 0 % · Woche 100 % · Monat 50 %", resetAt: "2026-08-17T00:00:00.099Z" }], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, refreshError: "Speichern fehlgeschlagen",
    attention: [{ kind: "data", severity: "warn", text: "Aktualisierung fehlgeschlagen: Speichern fehlgeschlagen", view: "models" }] })
  expect(html).toContain("Speichern fehlgeschlagen")
  expect(html).toContain("attention-item warn")
})

test("zeigt keine Fehlerzeile, wenn die Aktualisierung durchlief", () => {
  expect(panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })).not.toContain("notice error")
})

test("beschriftet Arena-Kategorien und zeigt die ELO-Wertung", () => {
  const offer: any = { provider: "openrouter", id: "z-ai/glm-5.2", name: "GLM 5.2", pricing: { input: 0.49, output: 1.54 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: 1000, purposes: ["coding"] },
    benchmarks: { source: "OpenRouter Benchmarks", match: "direct", details: [{ name: "arena_website", score: 59.6, elo: 1332, sampleCount: 4487 }] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("Arena · Website")
  expect(html).not.toContain("arena_website")
  expect(html).toContain("ELO 1332")
})

test("zeigt bei Go-Modellen das Kontingent statt nur den Token-Preis", () => {
  const go: any = { provider: "opencode-go", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", pricing: { input: 0.14, output: 0.28 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: 1000, purposes: ["coding"] },
    quota: { requestsPerMonth: 158_150, includedUsdPerMonth: 60 } }
  const html = panelHtml({ snapshots: [{ provider: "opencode-go", offers: [go], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).not.toContain("Modell 'Alpha'")
  expect(html).toContain("&#39;")
})

test("laesst kein Markup aus Zahlenfeldern der API durch", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1, purposes: ["coding"] },
    benchmarks: { source: "s", match: "direct", intelligence: "<img src=x onerror=alert(1)>" as any,
      details: [{ name: "gpqa_diamond", score: 1, sampleCount: "<b>roh</b>" as any, elo: "<i>roh</i>" as any }] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("5–10 $")
  expect(html).toContain("30–45 $")
  expect(html).toContain("&gt; 272K tokens")
  expect(html).toContain("≤ 272K tokens")
})

// Bei Go entscheidet das Kontingent, nicht der Token-Preis. Fehlt es, ist das
// Modell unvergleichbar — das muss dastehen, statt stumm zu fehlen.
test("benennt ein fehlendes Anfragenkontingent", () => {
  const ohne = { ...tiered, provider: "opencode-go" as const, id: "minimax-m2.5", name: "MiniMax M2.5", pricing: { input: 0.3, output: 1.2 }, quota: { includedUsdPerMonth: 60 } }
  const html = panelHtml({ snapshots: [{ provider: "opencode-go", checkedAt: 1, stale: false, offers: [ohne] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("Anfragen nicht in der Quelle")
})

// Warnung und Hinweis muessen sich optisch unterscheiden: das eine verlangt
// eine Reaktion, das andere ist ein Angebot.
test("unterscheidet Warnung und Hinweis in der Kopfzeile", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered] }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0,
    attention: [{ kind: "data", severity: "warn", text: "Nur 42 statt zuletzt 61 Modelle gelesen", view: "models" },
      { kind: "price", severity: "info", text: "3 deutliche Preisänderungen", view: "history" }] })
  expect(html).toContain("Nur 42 statt zuletzt 61 Modelle gelesen")
  expect(html).toContain("attention-item warn")
  expect(html).toContain("attention-item info")
})

test("zeigt Handlungsbedarf als anklickbare Kopfzeile", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0,
    attention: [{ kind: "account", severity: "warn", text: "openrouter: Guthaben wird knapp", view: "accounts" }] })
  expect(html).toContain("openrouter: Guthaben wird knapp")
  expect(html).toContain('class="attention-item warn"')
  expect(html).toContain('data-view="accounts"')
})

// Zwei Orte fuer dieselbe Meldung waeren ausgerechnet in der Ansicht
// widersinnig, die Handlungsbedarf buendeln soll.
test("zeigt Anbieterfehler nicht mehr als eigenen Streifen", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", offers: [], checkedAt: 1, stale: true, error: { kind: "network", message: "offline" } }],
    history: [], agents: [], accounts: [], ai: null, updatedAt: 0, refreshError: "kaputt" })
  expect(html).not.toContain('class="notice error"')
  expect(html).not.toContain('class="notice warn"')
})

// Accessibility der Webview: Landmarken, Tab-Beschriftung, aria-current,
// Fokuslandeplatz, sichtbarer Fokusring und versteckte Deko-Icons. Ein Modell
// mit Fähigkeits-Badge liefert alle drei Icon-Arten (b, i, span) ins HTML.
test("macht Navigation, Tabs, Filter und Tabellen fuer Screenreader zugaenglich und sperrt Bilder per CSP", () => {
  const offer: any = { provider: "openrouter", id: "m", name: "M", pricing: { input: 1, output: 2 },
    capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["coding"] } }
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [offer], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
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
  const html = panelHtml({ snapshots: [{ provider: "openrouter", offers: [scored, scoredOnly, plain], checkedAt: 0, stale: false }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  // Der Einzelwerte-Block erscheint NUR ohne Dimensions-Scores: Vorhandene
  // Scores gewinnen auch mit details, Modelle ohne Daten zeigen die Missing-Zeile.
  expect(html).toContain("<b>Coding</b> 90")
  expect(html).toContain("<b>Coding</b> 70")
  expect(html).toContain("Keine Daten")
  expect(html).not.toContain("<b>Einzelwerte</b>")
})
