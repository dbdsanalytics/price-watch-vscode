import { randomBytes } from "crypto"
import { assessAgent, type AgentAssessment } from "../agents/assessment"
import type { DashboardState } from "../domain/dashboard"
import { isFreePricing, type ModelOffer } from "../domain/model"
import { esc, stamp } from "./format"
import { SCRIPT } from "./script"
import { BENCHMARK_CSS, CSS } from "./styles"
import { renderAgentGroups, renderAgentRow } from "./views/agents"
import { renderAccountSummary, renderOpenRouterSection, renderProviderSection } from "./views/accounts"
import { historyFilters, historyRows } from "./views/history"
import { modelFilters, modelRows } from "./views/models"
import { renderAttention, renderHistoryCard, renderRanks } from "./views/overview"

interface PreparedView { state: DashboardState; offers: ModelOffer[]; free: number; assessments: AgentAssessment[]; preview: AgentAssessment[] }

function prepare(state: DashboardState): PreparedView {
  const offers = state.snapshots.flatMap((snapshot)=>snapshot.offers)
  const assessments = state.agents.map((agent)=>assessAgent(agent,offers))
  return { state, offers, free: offers.filter((offer)=>isFreePricing(offer.pricing)).length, assessments, preview: assessments.slice(0,4) }
}

// Jede *Inner-Funktion liefert genau den Inhalt ihres Containers. panelHtml und
// fragments rufen dieselben Funktionen — liefen sie auseinander, wuerde der
// erste Abruf sichtbar etwas veraendern, obwohl sich keine Daten geaendert haben.
// Der Aenderungszaehler war die einzige Stelle, die den Verlauf erwaehnte, und
// fuehrte nirgendwohin. Jetzt springt er in die Ansicht.
const metricsInner = ({ state, offers, free }: PreparedView) => `<span><strong>${offers.length}</strong>Modelle</span><span><strong>${free}</strong>kostenlos</span><button class="metric-link" data-view="history" aria-label="Alle ${state.history.length} Änderungen im Verlauf öffnen"><strong>${state.history.length}</strong>Änderungen</button><span><strong>${state.agents.length}</strong>Agenten</span>`
const insightInner = ({ state }: PreparedView) => `<strong>✦ KI-Fazit</strong><span>${esc(state.ai?.text ?? "Preis- und Agentendaten werden lokal ausgewertet.")}</span>`
const ranksInner = ({ offers }: PreparedView) => `<h2>Beste Modelle für deinen Zweck</h2>${renderRanks(offers)}`
const overviewAgentsInner = ({ assessments, preview }: PreparedView) => `<div class="card-head"><h2>Deine Agenten</h2><button data-view="agents" aria-label="Alle ${assessments.length} Agenten anzeigen">Alle ${assessments.length}</button></div>${preview.length ? preview.map((item)=>renderAgentRow(item,true)).join("") : `<p class="empty">Keine Agenten erkannt</p>`}${assessments.length>4?`<button class="more" data-view="agents" aria-label="Mehr Agenten anzeigen">Mehr Agenten anzeigen</button>`:""}`
const overviewAccountsInner = ({ state }: PreparedView) => `<div class="card-head"><h2>Konten &amp; Limits</h2><button data-view="accounts" aria-label="Konten und Limits Details öffnen">Details</button></div>${state.accounts.length ? state.accounts.map(renderAccountSummary).join("") : `<p class="empty">Noch kein Konto verbunden</p>`}`
const accountsInner = ({ state }: PreparedView) => `${renderOpenRouterSection(state.accounts,state.openRouterManagement)}${renderProviderSection("opencode-zen",state.accounts)}${renderProviderSection("opencode-go",state.accounts)}`

export type FragmentId = "metrics" | "attention" | "insight" | "overview-ranks" | "overview-agents" | "overview-accounts" | "overview-history" | "models" | "agents" | "accounts" | "history"

export function fragments(state: DashboardState): Record<FragmentId, string> {
  const view = prepare(state)
  return {
    metrics: metricsInner(view),
    attention: renderAttention(state.attention),
    insight: insightInner(view),
    "overview-ranks": ranksInner(view),
    "overview-agents": overviewAgentsInner(view),
    "overview-accounts": overviewAccountsInner(view),
    "overview-history": renderHistoryCard(state.history),
    models: modelRows(view.offers),
    agents: renderAgentGroups(view.assessments),
    accounts: accountsInner(view),
    history: historyRows(state.history),
  }
}

export function panelHtml(state: DashboardState): string {
  // Fehler und Warnungen stehen jetzt in der Kopfzeile Handlungsbedarf statt in
  // eigenen Streifen: zwei Orte fuer dieselbe Meldung waeren ausgerechnet dort
  // widersinnig, wo alles gebuendelt werden soll.
  const nonce = randomBytes(16).toString("base64"), view = prepare(state)
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="content-security-policy" content="default-src 'none'; img-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${CSS}${BENCHMARK_CSS}</style></head><body><header class="topbar"><button class="brand" data-view="overview" aria-label="Preis-Watch Übersicht">Preis-Watch</button><nav role="navigation" aria-label="Ansichten"><button data-view="overview" class="active" aria-current="page" aria-label="Übersicht">Übersicht</button><button data-view="models" aria-label="Modelle">Modelle</button><button data-view="agents" aria-label="Agenten">Agenten</button><button data-view="history" aria-label="Verlauf">Verlauf</button><button data-view="accounts" aria-label="Konten und Limits">Konten &amp; Limits</button></nav><span class="live" aria-label="Daten aktuell"><i aria-hidden="true"></i>aktuell</span></header><main role="main">
  <section class="view" id="overview"><div class="metrics" data-fragment="metrics">${metricsInner(view)}</div><div class="attention" data-fragment="attention">${renderAttention(state.attention)}</div><div class="insight" data-fragment="insight">${insightInner(view)}</div><div class="dashboard"><section class="card rankings" data-fragment="overview-ranks">${ranksInner(view)}</section><section class="card agents-card" data-fragment="overview-agents">${overviewAgentsInner(view)}</section><section class="card accounts-card" data-fragment="overview-accounts">${overviewAccountsInner(view)}</section><section class="card history-card" data-fragment="overview-history">${renderHistoryCard(state.history)}</section></div></section>
  <section class="view" id="models" hidden><div class="page-head"><div><h1>Alle Modelle</h1><p>${view.offers.length} Angebote von OpenRouter, Zen und Go</p></div></div>${modelFilters()}<div class="table-wrap"><table aria-label="Modelle mit Preisen, Fähigkeiten und Benchmarks"><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>Fähigkeiten</th><th>Benchmark</th></tr></thead><tbody data-fragment="models">${modelRows(view.offers)}</tbody></table></div></section>
  <section class="view" id="agents" hidden><div class="page-head"><div><h1>Deine Agenten</h1><p>Nach Handlungsbedarf und Qualität geordnet</p></div></div><div class="agent-groups" data-fragment="agents">${renderAgentGroups(view.assessments)}</div></section>
  <section class="view" id="history" hidden><div class="page-head"><div><h1>Preisverlauf</h1><p>Änderungen der letzten 90 Tage</p></div></div>${historyFilters()}<div class="change-rows" data-fragment="history">${historyRows(state.history)}</div></section>
  <section class="view" id="accounts" hidden><div class="page-head"><div><h1>Konten &amp; Limits</h1><p>Secrets bleiben ausschließlich im lokalen VS Code Secret Store.</p></div></div><div class="provider-sections" data-fragment="accounts">${accountsInner(view)}</div></section></main><script nonce="${nonce}">${SCRIPT}</script></body></html>`
}

