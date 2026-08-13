import { expect, test } from "bun:test"
import { panelHtml } from "../src/panel"

test("renders safe responsive four-view dashboard", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [{ name: "reviewer", description: "Review", model: "openrouter/x", tools: [], prompt: "local only" }], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("minmax(360px,2fr) minmax(220px,1fr) minmax(220px,1fr)")
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
test("meldet einen Fehler der Verarbeitung sichtbar im Panel", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0, refreshError: "Speichern fehlgeschlagen" })
  expect(html).toContain("Speichern fehlgeschlagen")
  expect(html).toContain("notice error")
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

test("zeigt eine Warnung als Hinweis, nicht als Fehler", () => {
  const html = panelHtml({ snapshots: [{ provider: "opencode-zen", checkedAt: 1, stale: false, offers: [tiered], warning: "Nur 42 statt zuletzt 61 Modelle gelesen" }], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("Nur 42 statt zuletzt 61 Modelle gelesen")
  expect(html).toContain('class="notice warn"')
})
