import type { AccountStatus, OpenRouterManagedKey, OpenRouterManagementStatus } from "../../accounts/types"
import { esc, money } from "../format"

function accountValue(account: AccountStatus): string {
  if (account.remainingUsd !== undefined) return `${money(account.remainingUsd)} verfügbar`
  // Kontingentangaben ohne Dollarwert (OpenCode Go) stehen in message und
  // duerfen nicht von der generischen Zeile verdeckt werden.
  if (account.message) return account.message
  if (account.state === "available") return "Verbunden · kein festes Schlüssellimit"
  return "Verbrauch nicht automatisch abrufbar"
}

export function renderAccountSummary(account: AccountStatus): string {
  const usage = [["Heute",account.dailyUsd],["Woche",account.weeklyUsd],["Monat",account.monthlyUsd]].filter((item): item is [string,number]=>item[1] !== undefined).map(([period,value])=>`${period} ${money(value)}`).join(" · ")
  return `<div class="account-summary"><div><strong>${esc(account.provider)}</strong>${account.label ? `<small>${esc(account.label)}</small>` : ""}${usage ? `<small class="account-usage">${esc(usage)}</small>` : ""}${account.resetAt ? `<small class="account-usage">Reset ${esc(new Date(account.resetAt).toLocaleString("de-DE",{ dateStyle:"short", timeStyle:"short" }))}</small>` : ""}</div><span class="status status-${account.state}">${esc(accountValue(account))}</span></div>`
}

function metric(value: string, label: string, tone=""): string { return `<div class="account-metric ${tone}"><strong>${value}</strong><small>${label}</small></div>` }

function renderManagedKey(key: OpenRouterManagedKey): string {
  const limit = key.limitUsd === undefined ? "Kein festes Limit" : `${money(key.remainingUsd ?? 0)} von ${money(key.limitUsd)}`
  const reset = key.reset ? ({daily:"Täglich",weekly:"Wöchentlich",monthly:"Monatlich"} as const)[key.reset] : "Kein Reset"
  return `<article class="managed-key"><div class="key-name"><strong>${esc(key.name)}</strong><small>${esc(key.label ?? key.hash.slice(0,8))}</small></div><span class="key-state key-state-${key.state}">${key.state === "active" ? "Aktiv" : key.state === "disabled" ? "Deaktiviert" : "Abgelaufen"}</span><div><small>Limit</small><strong>${limit}</strong></div><div><small>Verbrauch</small><strong>${money(key.usageUsd)}</strong></div><div><small>Zeitraum</small><strong>${reset}</strong></div></article>`
}

export function renderOpenRouterSection(accounts: AccountStatus[], management?: OpenRouterManagementStatus|null): string {
  const api = accounts.find((item)=>item.provider === "openrouter")
  const managementAvailable = management?.state === "available"
  return `<section class="account-provider-section provider-openrouter"><header><div><span class="provider-title"><i aria-hidden="true"></i>OpenRouter</span><p>API-Zugriff und kontoweite Verbrauchsdaten getrennt verwalten</p></div></header><div class="connection-grid"><article class="connection"><div class="connection-head"><div><h3>API-Key</h3><span>KI-Fazit und Status dieses Schlüssels</span></div><button data-action="connect" aria-label="OpenRouter API-Key ${api ? "erneuern" : "verbinden"}">${api ? "Erneuern" : "Verbinden"}</button>${api ? `<button data-action="disconnect" aria-label="OpenRouter API-Key trennen">Trennen</button>` : ""}</div>${api ? renderAccountSummary(api) : `<p class="empty">Nicht verbunden</p>`}</article><article class="connection"><div class="connection-head"><div><h3>Management Key · Nur Lesen</h3><span>Guthaben und Verbrauch vorhandener Schlüssel</span></div><button data-action="connect-management" aria-label="OpenRouter Management-Key ${management ? "erneuern" : "verbinden"}">${management ? "Erneuern" : "Verbinden"}</button>${management ? `<button data-action="disconnect-management" aria-label="OpenRouter Management-Key trennen">Trennen</button>` : ""}</div>${management ? `<p class="management-state status-${management.state}">${esc(management.state === "available" ? "Verbunden" : management.message ?? "Nicht abrufbar")}</p>` : `<p class="empty">Nicht verbunden</p>`}</article></div>${managementAvailable ? `<div class="account-metrics">${metric(money(management.remainingCreditsUsd),"Verfügbar","metric-good")}${metric(money(management.totalCreditsUsd),"Guthaben gekauft")}${metric(money(management.totalUsageUsd),"Gesamt verbraucht","metric-warn")}${metric(String(management.keys.length),"API-Keys")}</div><div class="managed-keys"><header><h3>API-Key-Verbrauch</h3><span>Heute · Woche · Monat sind pro Schlüssel verfügbar</span></header>${management.keys.map(renderManagedKey).join("")}</div>` : ""}</section>`
}

export function renderProviderSection(provider: "opencode-zen"|"opencode-go", accounts: AccountStatus[]): string {
  const account = accounts.find((item)=>item.provider===provider), name = provider === "opencode-zen" ? "OpenCode Zen" : "OpenCode Go"
  return `<section class="account-provider-section provider-${provider}"><header><div><span class="provider-title"><i aria-hidden="true"></i>${name}</span><p>${provider === "opencode-zen" ? "Pay-as-you-go-Guthaben" : "Abo, Kontingent und Reset"}</p></div><button data-action="connect" aria-label="${name} ${account ? "erneuern" : "verbinden"}">${account ? "Erneuern" : "Verbinden"}</button>${account ? `<button data-action="disconnect" aria-label="${name} trennen">Trennen</button>` : ""}</header>${account ? renderAccountSummary(account) : `<p class="empty">Nicht verbunden</p>`}</section>`
}
