import type { PriceChange } from "../../domain/changes"
import { amount, esc, money, stamp } from "../format"

const dimensionLabel: Record<PriceChange["dimension"], string> = { input: "Input", output: "Output", cacheRead: "Cache gelesen", cacheWrite: "Cache geschrieben", request: "je Anfrage" }

/** Teurer und guenstiger tragen dieselben Farben wie die Preisspalten. */
function percentCell(change: PriceChange): string {
  if (change.percent === null) return `<span class="change-new">neu bepreist</span>`
  const up = change.percent > 0
  return `<span class="${up ? "change-up" : "change-down"}">${up ? "+" : "−"}${amount(Math.abs(change.percent))} %</span>`
}

export function historyRows(history: PriceChange[]): string {
  if (!history.length) return `<p class="empty">Noch keine Preisänderungen aufgezeichnet</p>`
  return history.map((change) => `<article class="change-row" data-change="${esc(`${change.modelId} ${change.provider}`.toLowerCase())}" data-provider="${esc(change.provider)}" data-at="${change.at}"><div class="change-when"><strong>${esc(stamp(change.at))}</strong><small>${esc(change.provider)}</small></div><div class="change-what"><strong>${esc(change.modelId)}</strong><small>${dimensionLabel[change.dimension]}</small></div><div class="change-amount"><span>${esc(money(change.previous))} → ${esc(money(change.current))}</span>${percentCell(change)}</div></article>`).join("")
}

export function historyFilters(): string {
  return `<div class="filters"><input id="history-search" placeholder="Modelle durchsuchen"><select id="history-provider"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="history-range"><option value="7">Letzte 7 Tage</option><option value="30">Letzte 30 Tage</option><option value="90" selected>Letzte 90 Tage</option></select></div>`
}
