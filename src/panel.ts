import { randomBytes } from "crypto"
import type { AccountStatus, OpenRouterManagedKey, OpenRouterManagementStatus } from "./accounts/types"
import { assessAgent, type AgentAssessment } from "./agents/assessment"
import type { AgentMetadata } from "./agents/discovery"
import type { AiResult } from "./ai"
import type { PriceChange } from "./domain/changes"
import { isFreePricing, type ModelOffer } from "./domain/model"
import type { ProviderSnapshot } from "./domain/provider"
import { rankOffers, type Purpose } from "./domain/ranking"
import { amount, count, esc, money, stamp } from "./panel/format"
import { BENCHMARK_CSS, CSS } from "./panel/styles"

export interface DashboardState { snapshots: ProviderSnapshot[]; history: PriceChange[]; agents: AgentMetadata[]; accounts: AccountStatus[]; openRouterManagement?: OpenRouterManagementStatus | null; ai: AiResult | null; updatedAt: number; refreshError?: string | null }

const labels: Record<Purpose,string> = { coding:"Coding", language:"Sprache", reasoning:"Reasoning", vision:"Vision", tools:"Tools", allround:"Allround" }
const purposeIcon: Record<Purpose,string> = { coding:"⌘", language:"A", reasoning:"◇", vision:"◉", tools:"⚙", allround:"✦" }
const statusLabel: Record<AgentAssessment["status"],string> = { suitable:"Passend", expensive:"Teuer", "alternative-available":"Alternative", unsuitable:"Unpassend", deprecated:"Veraltet", local:"Lokal", unknown:"Nicht bewertbar" }

function purposeBadge(purpose: Purpose): string { return `<span class="badge purpose purpose-${purpose}"><b>${purposeIcon[purpose]}</b>${labels[purpose]}</span>` }
function providerBadge(provider: ModelOffer["provider"]): string { return `<span class="badge provider provider-${provider}"><i></i>${esc(provider === "openrouter" ? "OpenRouter" : provider === "opencode-zen" ? "Zen" : "Go")}</span>` }
/** Bei Go entscheidet das Abo-Kontingent, nicht der Token-Preis. */
function quotaLine(offer: ModelOffer): string {
  const quota = offer.quota
  if (!quota) return ""
  // Fehlt die Anfragenzahl, ist das Modell nicht vergleichbar. Das gehoert
  // hingeschrieben, sonst wirkt der Dollarwert wie die ganze Auskunft.
  const parts = [quota.requestsPerMonth !== undefined ? `${count(quota.requestsPerMonth)} Anfragen/Monat` : "Anfragen nicht in der Quelle",
    quota.includedUsdPerMonth !== undefined ? `${money(quota.includedUsdPerMonth)} enthalten` : ""].filter(Boolean)
  return `<small class="quota">${esc(parts.join(" · "))}</small>`
}

function priceClass(offer: ModelOffer): string { return isFreePricing(offer.pricing) ? "free" : offer.pricing.unknown ? "unknown" : "paid" }

/** Gestufte Preise als Spanne: der Basispreis allein verschweigt die obere Stufe. */
function priceCell(offer: ModelOffer, side: "input" | "output"): string {
  if (offer.pricing.unknown) return "Preis unbekannt"
  const base = offer.pricing[side], tiers = offer.pricing.tiers ?? []
  if (!tiers.length) return money(base)
  return `${amount(base)}–${money(Math.max(base, ...tiers.map((tier) => tier[side])))}`
}
function tierDetails(offer: ModelOffer): string {
  const tiers = offer.pricing.tiers ?? []
  if (!tiers.length) return ""
  const rows = [`${esc(offer.tier ?? "Basis")} · ${esc(money(offer.pricing.input))} / ${esc(money(offer.pricing.output))}`,
    ...tiers.map((tier) => `${esc(tier.label)} · ${esc(money(tier.input))} / ${esc(money(tier.output))}`)]
  return `<details class="tier-details"><summary>${tiers.length + 1} Preisstufen</summary>${rows.map((row) => `<article>${row}</article>`).join("")}</details>`
}
function benchmarkCell(offer: ModelOffer): string {
  const scores = offer.benchmarks
  if (!scores) return `<div class="benchmark benchmark-missing"><strong>Keine Daten</strong><small>Noch nicht belastbar bewertet</small></div>`
  const values = [["Intelligenz",scores.intelligence],["Coding",scores.coding],["Agentic",scores.agentic]].filter((item):item is [string,number]=>item[1]!==undefined)
  const provenance = scores.match === "base-model" ? "Identisches Basismodell" : scores.match === "local" ? "Lokaler Praxistest" : "Öffentlich bewertet"
  const detailLabel:Record<string,string>={ gpqa_diamond:"GPQA Diamond", tau_bench_verified_airline:"τ²-Bench Airline", search_browsecomp:"BrowseComp", search_dsqa:"DeepSearchQA", search_hle:"Search HLE", search_widesearch:"WideSearch",
    arena_codecategories:"Arena · Code", arena_website:"Arena · Website", arena_uicomponent:"Arena · UI-Komponenten", arena_dataviz:"Arena · Datenvisualisierung", arena_svg:"Arena · SVG", arena_gamedev:"Arena · Spiele", arena_3d:"Arena · 3D", arena_asciiart:"Arena · ASCII-Art", arena_graphicdesign:"Arena · Grafikdesign", arena_logo:"Arena · Logo", arena_image:"Arena · Bild", arena_imageediting:"Arena · Bildbearbeitung" }
  const details=(scores.details ?? []).map((detail)=>`<article><strong>${esc(detailLabel[detail.name] ?? detail.name)}</strong><span>${new Intl.NumberFormat("de-DE",{ maximumFractionDigits:1 }).format(detail.score)} %</span>${detail.elo!==undefined?`<small>ELO ${esc(detail.elo)}</small>`:""}${detail.sampleCount!==undefined?`<small>${esc(detail.sampleCount)} ${detail.elo!==undefined?"Duelle":"Aufgaben"}</small>`:""}${detail.costPerTaskUsd!==undefined?`<small>${money(detail.costPerTaskUsd)}/Aufgabe</small>`:""}</article>`).join("")
  return `<div class="benchmark benchmark-${scores.match ?? "direct"}"><div>${values.map(([label,value])=>`<span><b>${label}</b> ${esc(value)}</span>`).join("")}</div>${details?`<details class="benchmark-details"><summary>${esc(scores.details?.length)} Einzelbenchmarks</summary>${details}</details>`:""}<small>${provenance}</small></div>`
}

function renderRanks(offers: ModelOffer[]): string {
  return (Object.entries(labels) as Array<[Purpose,string]>).map(([purpose,label],index) => {
    const column = (mode: "free"|"paid") => {
      const ranked = rankOffers(offers,purpose,mode).filter((item)=>item.rating === "scored").slice(0,3)
      const title = mode === "free" ? "Kostenlos" : "Kostenpflichtig"
      return `<section class="rank-column price-${mode}"><h4><i></i>${title}</h4>${ranked.length ? `<ol>${ranked.map((item)=>`<li><strong>${esc(item.offer.name)}</strong><small>Score ${item.score} · ${money(item.offer.pricing.input)} / ${money(item.offer.pricing.output)}</small></li>`).join("")}</ol>` : `<p class="empty">Keine belastbar bewerteten Modelle</p>`}</section>`
    }
    return `<details class="purpose-block purpose-${purpose}"${index===0 ? " open" : ""}><summary><span>${purposeIcon[purpose]}</span><strong>${label}</strong></summary><div class="rank-columns">${column("free")}${column("paid")}</div></details>`
  }).join("")
}

function agentPurpose(agent: AgentMetadata): Purpose {
  const text = `${agent.name} ${agent.description}`.toLowerCase()
  if (/translat|sprach|writ/.test(text)) return "language"
  if (/vision|image/.test(text)) return "vision"
  if (/research|reason|orchestrat/.test(text)) return "reasoning"
  if (/tool/.test(text)) return "tools"
  return "coding"
}

function agentGroup(status: AgentAssessment["status"]): "attention"|"suitable"|"unknown" { return status === "suitable" ? "suitable" : status === "unknown" || status === "local" ? "unknown" : "attention" }
function renderAgentRow(item: AgentAssessment, compact = false): string {
  const purpose = agentPurpose(item.agent)
  return `<article class="agent-row${compact ? " agent-preview" : ""}"><div class="agent-identity"><strong>${esc(item.agent.name)}</strong>${purposeBadge(purpose)}</div><div class="agent-model"><span>Aktuelles Modell</span><strong>${esc(item.agent.model || "Kein Modell zugewiesen")}</strong></div><div class="agent-result"><span class="status status-${item.status}">${statusLabel[item.status]}</span>${compact ? "" : `<small>${esc(item.reason)}</small>`}${!compact && item.alternative ? `<small>Empfehlung: <strong>${esc(item.alternative.name)}</strong></small>` : ""}</div></article>`
}

function renderAgentGroups(items: AgentAssessment[]): string {
  const groups = [{ key:"attention", title:"Handlungsbedarf", hint:"Prüfen oder optimieren" },{ key:"suitable", title:"Passend", hint:"Derzeit sinnvoll eingesetzt" },{ key:"unknown", title:"Nicht bewertbar", hint:"Modellzuordnung oder Daten fehlen" }] as const
  return groups.map((group)=>{ const rows=items.filter((item)=>agentGroup(item.status)===group.key); return `<section class="agent-group agent-group-${group.key}"><header><div><h2>${group.title}</h2><p>${group.hint}</p></div><span>${rows.length}</span></header>${rows.length ? `<div class="agent-rows">${rows.map((item)=>renderAgentRow(item)).join("")}</div>` : `<p class="empty group-empty">Keine Agenten in dieser Gruppe</p>`}</section>` }).join("")
}

function accountValue(account: AccountStatus): string {
  if (account.remainingUsd !== undefined) return `${money(account.remainingUsd)} verfügbar`
  // Kontingentangaben ohne Dollarwert (OpenCode Go) stehen in message und
  // duerfen nicht von der generischen Zeile verdeckt werden.
  if (account.message) return account.message
  if (account.state === "available") return "Verbunden · kein festes Schlüssellimit"
  return "Verbrauch nicht automatisch abrufbar"
}
function renderAccountSummary(account: AccountStatus): string {
  const usage = [["Heute",account.dailyUsd],["Woche",account.weeklyUsd],["Monat",account.monthlyUsd]].filter((item): item is [string,number]=>item[1] !== undefined).map(([period,value])=>`${period} ${money(value)}`).join(" · ")
  return `<div class="account-summary"><div><strong>${esc(account.provider)}</strong>${account.label ? `<small>${esc(account.label)}</small>` : ""}${usage ? `<small class="account-usage">${esc(usage)}</small>` : ""}${account.resetAt ? `<small class="account-usage">Reset ${esc(new Date(account.resetAt).toLocaleString("de-DE",{ dateStyle:"short", timeStyle:"short" }))}</small>` : ""}</div><span class="status status-${account.state}">${esc(accountValue(account))}</span></div>`
}
function metric(value: string, label: string, tone=""): string { return `<div class="account-metric ${tone}"><strong>${value}</strong><small>${label}</small></div>` }
function renderManagedKey(key: OpenRouterManagedKey): string {
  const limit = key.limitUsd === undefined ? "Kein festes Limit" : `${money(key.remainingUsd ?? 0)} von ${money(key.limitUsd)}`
  const reset = key.reset ? ({daily:"Täglich",weekly:"Wöchentlich",monthly:"Monatlich"} as const)[key.reset] : "Kein Reset"
  return `<article class="managed-key"><div class="key-name"><strong>${esc(key.name)}</strong><small>${esc(key.label ?? key.hash.slice(0,8))}</small></div><span class="key-state key-state-${key.state}">${key.state === "active" ? "Aktiv" : key.state === "disabled" ? "Deaktiviert" : "Abgelaufen"}</span><div><small>Limit</small><strong>${limit}</strong></div><div><small>Verbrauch</small><strong>${money(key.usageUsd)}</strong></div><div><small>Zeitraum</small><strong>${reset}</strong></div></article>`
}

function renderOpenRouterSection(accounts: AccountStatus[], management?: OpenRouterManagementStatus|null): string {
  const api = accounts.find((item)=>item.provider === "openrouter")
  const managementAvailable = management?.state === "available"
  return `<section class="account-provider-section provider-openrouter"><header><div><span class="provider-title"><i></i>OpenRouter</span><p>API-Zugriff und kontoweite Verbrauchsdaten getrennt verwalten</p></div></header><div class="connection-grid"><article class="connection"><div class="connection-head"><div><h3>API-Key</h3><span>KI-Fazit und Status dieses Schlüssels</span></div><button data-action="connect">${api ? "Erneuern" : "Verbinden"}</button></div>${api ? renderAccountSummary(api) : `<p class="empty">Nicht verbunden</p>`}</article><article class="connection"><div class="connection-head"><div><h3>Management Key · Nur Lesen</h3><span>Guthaben und Verbrauch vorhandener Schlüssel</span></div><button data-action="connect-management">${management ? "Erneuern" : "Verbinden"}</button></div>${management ? `<p class="management-state status-${management.state}">${esc(management.state === "available" ? "Verbunden" : management.message ?? "Nicht abrufbar")}</p>` : `<p class="empty">Nicht verbunden</p>`}</article></div>${managementAvailable ? `<div class="account-metrics">${metric(money(management.remainingCreditsUsd),"Verfügbar","metric-good")}${metric(money(management.totalCreditsUsd),"Guthaben gekauft")}${metric(money(management.totalUsageUsd),"Gesamt verbraucht","metric-warn")}${metric(String(management.keys.length),"API-Keys")}</div><div class="managed-keys"><header><h3>API-Key-Verbrauch</h3><span>Heute · Woche · Monat sind pro Schlüssel verfügbar</span></header>${management.keys.map(renderManagedKey).join("")}</div>` : ""}</section>`
}

function renderProviderSection(provider: "opencode-zen"|"opencode-go", accounts: AccountStatus[]): string {
  const account = accounts.find((item)=>item.provider===provider), name = provider === "opencode-zen" ? "OpenCode Zen" : "OpenCode Go"
  return `<section class="account-provider-section provider-${provider}"><header><div><span class="provider-title"><i></i>${name}</span><p>${provider === "opencode-zen" ? "Pay-as-you-go-Guthaben" : "Abo, Kontingent und Reset"}</p></div><button data-action="connect">${account ? "Erneuern" : "Verbinden"}</button></header>${account ? renderAccountSummary(account) : `<p class="empty">Nicht verbunden</p>`}</section>`
}

export function panelHtml(state: DashboardState): string {
  const nonce = randomBytes(16).toString("base64"), offers = state.snapshots.flatMap((snapshot)=>snapshot.offers), free = offers.filter((offer)=>isFreePricing(offer.pricing)).length
  const assessments = state.agents.map((agent)=>assessAgent(agent,offers)), preview = assessments.slice(0,4)
  const modelRows = offers.slice().sort((a,b)=>a.name.localeCompare(b.name)).map((offer)=>`<tr data-model="${esc(`${offer.name} ${offer.provider} ${offer.capabilities.purposes.join(" ")}`.toLowerCase())}" data-provider="${offer.provider}" data-price="${priceClass(offer)}"><td><strong>${esc(offer.name)}</strong><small>${esc(offer.id)}</small>${quotaLine(offer)}</td><td>${providerBadge(offer.provider)}</td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "input"))}</span></td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "output"))}</span>${tierDetails(offer)}</td><td><div class="capabilities">${offer.capabilities.purposes.map(purposeBadge).join("")}</div></td><td>${benchmarkCell(offer)}</td></tr>`).join("")
  // Ein Fehler in der Verarbeitung betrifft alle Anbieter und steht deshalb vor
  // den einzelnen Anbietermeldungen.
  const refreshError = state.refreshError ? `<div class="notice error">Aktualisierung fehlgeschlagen: ${esc(state.refreshError)}</div>` : ""
  const providerErrors = state.snapshots.filter((snapshot)=>snapshot.error).map((snapshot)=>`<div class="notice error">${esc(snapshot.provider)}: ${esc(snapshot.error?.message)}${snapshot.offers.length ? ` · zeigt weiterhin die Preise vom ${esc(stamp(snapshot.checkedAt))}` : ""}</div>`).join("")
  // Verdaechtige Daten, kein Ausfall: eigene Farbe, nicht die Fehlerdarstellung.
  const providerWarnings = state.snapshots.filter((snapshot)=>snapshot.warning).map((snapshot)=>`<div class="notice warn">${esc(snapshot.provider)}: ${esc(snapshot.warning)}</div>`).join("")
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${CSS}${BENCHMARK_CSS}</style></head><body><header class="topbar"><button class="brand" data-view="overview">Preis-Watch</button><nav><button data-view="overview" class="active">Übersicht</button><button data-view="models">Modelle</button><button data-view="agents">Agenten</button><button data-view="accounts">Konten &amp; Limits</button></nav><span class="live"><i></i>aktuell</span></header>${refreshError}${providerErrors}${providerWarnings}<main>
  <section class="view" id="overview"><div class="metrics"><span><strong>${offers.length}</strong>Modelle</span><span><strong>${free}</strong>kostenlos</span><span><strong>${state.history.length}</strong>Änderungen</span><span><strong>${state.agents.length}</strong>Agenten</span></div><div class="insight"><strong>✦ KI-Fazit</strong><span>${esc(state.ai?.text ?? "Preis- und Agentendaten werden lokal ausgewertet.")}</span></div><div class="dashboard"><section class="card rankings"><h2>Beste Modelle für deinen Zweck</h2>${renderRanks(offers)}</section><section class="card agents-card"><div class="card-head"><h2>Deine Agenten</h2><button data-view="agents">Alle ${assessments.length}</button></div>${preview.length ? preview.map((item)=>renderAgentRow(item,true)).join("") : `<p class="empty">Keine Agenten erkannt</p>`}${assessments.length>4?`<button class="more" data-view="agents">Mehr Agenten anzeigen</button>`:""}</section><section class="card accounts-card"><div class="card-head"><h2>Konten &amp; Limits</h2><button data-view="accounts">Details</button></div>${state.accounts.length ? state.accounts.map(renderAccountSummary).join("") : `<p class="empty">Noch kein Konto verbunden</p>`}</section></div></section>
  <section class="view" id="models" hidden><div class="page-head"><div><h1>Alle Modelle</h1><p>${offers.length} Angebote von OpenRouter, Zen und Go</p></div></div><div class="filters"><input id="search" placeholder="Modelle durchsuchen"><select id="provider"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="price"><option value="">Alle Preise</option><option value="free">Kostenlos</option><option value="paid">Kostenpflichtig</option><option value="unknown">Preis unbekannt</option></select><select id="purpose"><option value="">Alle Fähigkeiten</option>${Object.entries(labels).map(([value,label])=>`<option value="${value}">${label}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>Fähigkeiten</th><th>Benchmark</th></tr></thead><tbody>${modelRows}</tbody></table></div></section>
  <section class="view" id="agents" hidden><div class="page-head"><div><h1>Deine Agenten</h1><p>Nach Handlungsbedarf und Qualität geordnet</p></div></div><div class="agent-groups">${renderAgentGroups(assessments)}</div></section>
  <section class="view" id="accounts" hidden><div class="page-head"><div><h1>Konten &amp; Limits</h1><p>Secrets bleiben ausschließlich im lokalen VS Code Secret Store.</p></div></div><div class="provider-sections">${renderOpenRouterSection(state.accounts,state.openRouterManagement)}${renderProviderSection("opencode-zen",state.accounts)}${renderProviderSection("opencode-go",state.accounts)}</div></section></main><script nonce="${nonce}">${SCRIPT}</script></body></html>`
}

const SCRIPT = `const vscode=acquireVsCodeApi();const show=id=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));scrollTo(0,0)};document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:b.dataset.action})));const filter=()=>{const q=search.value.toLowerCase(),p=provider.value,c=price.value,u=purpose.value;document.querySelectorAll('[data-model]').forEach(r=>r.hidden=!(r.dataset.model.includes(q)&&(!p||r.dataset.provider===p)&&(!c||r.dataset.price===c)&&(!u||r.dataset.model.includes(u))))};['search','provider','price','purpose'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',filter));`

