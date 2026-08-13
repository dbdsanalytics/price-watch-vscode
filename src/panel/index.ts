import { randomBytes } from "crypto"
import { assessAgent, type AgentAssessment } from "../agents/assessment"
import type { DashboardState } from "../domain/dashboard"
import { isFreePricing, type ModelOffer } from "../domain/model"
import { esc, stamp } from "./format"
import { BENCHMARK_CSS, CSS } from "./styles"
import { renderAgentGroups, renderAgentRow } from "./views/agents"
import { renderAccountSummary, renderOpenRouterSection, renderProviderSection } from "./views/accounts"
import { modelFilters, modelRows } from "./views/models"
import { renderRanks } from "./views/overview"

interface PreparedView { state: DashboardState; offers: ModelOffer[]; free: number; assessments: AgentAssessment[]; preview: AgentAssessment[] }

function prepare(state: DashboardState): PreparedView {
  const offers = state.snapshots.flatMap((snapshot)=>snapshot.offers)
  const assessments = state.agents.map((agent)=>assessAgent(agent,offers))
  return { state, offers, free: offers.filter((offer)=>isFreePricing(offer.pricing)).length, assessments, preview: assessments.slice(0,4) }
}

// Jede *Inner-Funktion liefert genau den Inhalt ihres Containers. panelHtml und
// fragments rufen dieselben Funktionen — liefen sie auseinander, wuerde der
// erste Abruf sichtbar etwas veraendern, obwohl sich keine Daten geaendert haben.
const metricsInner = ({ state, offers, free }: PreparedView) => `<span><strong>${offers.length}</strong>Modelle</span><span><strong>${free}</strong>kostenlos</span><span><strong>${state.history.length}</strong>Änderungen</span><span><strong>${state.agents.length}</strong>Agenten</span>`
const insightInner = ({ state }: PreparedView) => `<strong>✦ KI-Fazit</strong><span>${esc(state.ai?.text ?? "Preis- und Agentendaten werden lokal ausgewertet.")}</span>`
const ranksInner = ({ offers }: PreparedView) => `<h2>Beste Modelle für deinen Zweck</h2>${renderRanks(offers)}`
const overviewAgentsInner = ({ assessments, preview }: PreparedView) => `<div class="card-head"><h2>Deine Agenten</h2><button data-view="agents">Alle ${assessments.length}</button></div>${preview.length ? preview.map((item)=>renderAgentRow(item,true)).join("") : `<p class="empty">Keine Agenten erkannt</p>`}${assessments.length>4?`<button class="more" data-view="agents">Mehr Agenten anzeigen</button>`:""}`
const overviewAccountsInner = ({ state }: PreparedView) => `<div class="card-head"><h2>Konten &amp; Limits</h2><button data-view="accounts">Details</button></div>${state.accounts.length ? state.accounts.map(renderAccountSummary).join("") : `<p class="empty">Noch kein Konto verbunden</p>`}`
const accountsInner = ({ state }: PreparedView) => `${renderOpenRouterSection(state.accounts,state.openRouterManagement)}${renderProviderSection("opencode-zen",state.accounts)}${renderProviderSection("opencode-go",state.accounts)}`

export type FragmentId = "metrics" | "attention" | "insight" | "overview-ranks" | "overview-agents" | "overview-accounts" | "models" | "agents" | "accounts"

export function fragments(state: DashboardState): Record<FragmentId, string> {
  const view = prepare(state)
  return {
    metrics: metricsInner(view),
    // In Etappe 1 dauerhaft leer; Etappe 2 fuellt die Kopfzeile Handlungsbedarf.
    attention: "",
    insight: insightInner(view),
    "overview-ranks": ranksInner(view),
    "overview-agents": overviewAgentsInner(view),
    "overview-accounts": overviewAccountsInner(view),
    models: modelRows(view.offers),
    agents: renderAgentGroups(view.assessments),
    accounts: accountsInner(view),
  }
}

export function panelHtml(state: DashboardState): string {
  const nonce = randomBytes(16).toString("base64"), view = prepare(state)
  // Ein Fehler in der Verarbeitung betrifft alle Anbieter und steht deshalb vor
  // den einzelnen Anbietermeldungen.
  const refreshError = state.refreshError ? `<div class="notice error">Aktualisierung fehlgeschlagen: ${esc(state.refreshError)}</div>` : ""
  const providerErrors = state.snapshots.filter((snapshot)=>snapshot.error).map((snapshot)=>`<div class="notice error">${esc(snapshot.provider)}: ${esc(snapshot.error?.message)}${snapshot.offers.length ? ` · zeigt weiterhin die Preise vom ${esc(stamp(snapshot.checkedAt))}` : ""}</div>`).join("")
  // Verdaechtige Daten, kein Ausfall: eigene Farbe, nicht die Fehlerdarstellung.
  const providerWarnings = state.snapshots.filter((snapshot)=>snapshot.warning).map((snapshot)=>`<div class="notice warn">${esc(snapshot.provider)}: ${esc(snapshot.warning)}</div>`).join("")
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${CSS}${BENCHMARK_CSS}</style></head><body><header class="topbar"><button class="brand" data-view="overview">Preis-Watch</button><nav><button data-view="overview" class="active">Übersicht</button><button data-view="models">Modelle</button><button data-view="agents">Agenten</button><button data-view="accounts">Konten &amp; Limits</button></nav><span class="live"><i></i>aktuell</span></header>${refreshError}${providerErrors}${providerWarnings}<main>
  <section class="view" id="overview"><div class="metrics" data-fragment="metrics">${metricsInner(view)}</div><div class="attention" data-fragment="attention"></div><div class="insight" data-fragment="insight">${insightInner(view)}</div><div class="dashboard"><section class="card rankings" data-fragment="overview-ranks">${ranksInner(view)}</section><section class="card agents-card" data-fragment="overview-agents">${overviewAgentsInner(view)}</section><section class="card accounts-card" data-fragment="overview-accounts">${overviewAccountsInner(view)}</section></div></section>
  <section class="view" id="models" hidden><div class="page-head"><div><h1>Alle Modelle</h1><p>${view.offers.length} Angebote von OpenRouter, Zen und Go</p></div></div>${modelFilters()}<div class="table-wrap"><table><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>Fähigkeiten</th><th>Benchmark</th></tr></thead><tbody data-fragment="models">${modelRows(view.offers)}</tbody></table></div></section>
  <section class="view" id="agents" hidden><div class="page-head"><div><h1>Deine Agenten</h1><p>Nach Handlungsbedarf und Qualität geordnet</p></div></div><div class="agent-groups" data-fragment="agents">${renderAgentGroups(view.assessments)}</div></section>
  <section class="view" id="accounts" hidden><div class="page-head"><div><h1>Konten &amp; Limits</h1><p>Secrets bleiben ausschließlich im lokalen VS Code Secret Store.</p></div></div><div class="provider-sections" data-fragment="accounts">${accountsInner(view)}</div></section></main><script nonce="${nonce}">${SCRIPT}</script></body></html>`
}

const SCRIPT = `const vscode=acquireVsCodeApi();const show=id=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));scrollTo(0,0)};document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:b.dataset.action})));const filter=()=>{const q=search.value.toLowerCase(),p=provider.value,c=price.value,u=purpose.value;document.querySelectorAll('[data-model]').forEach(r=>r.hidden=!(r.dataset.model.includes(q)&&(!p||r.dataset.provider===p)&&(!c||r.dataset.price===c)&&(!u||r.dataset.model.includes(u))))};['search','provider','price','purpose'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',filter));`
