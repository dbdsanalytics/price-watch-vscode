import type { AttentionItem } from "../../domain/attention"
import type { PriceChange } from "../../domain/changes"
import type { ModelOffer } from "../../domain/model"
import { rankOffers, type Purpose } from "../../domain/ranking"
import { esc, money } from "../format"
import { historyRows } from "./history"
import { labels, purposeIcon } from "./models"

/** Leer heisst leer: kein „alles in Ordnung"-Streifen, der nur Platz kostet. */
export function renderAttention(items: AttentionItem[] = []): string {
  if (!items.length) return ""
  return items.map((item) => `<button class="attention-item ${item.severity}" data-view="${item.view}" aria-label="${esc(item.text)} – Ansicht öffnen">${esc(item.text)}</button>`).join("")
}

/** Dasselbe Muster wie bei Agenten und Konten: Anriss plus Sprung in die Ansicht. */
export function renderHistoryCard(history: PriceChange[]): string {
  return `<div class="card-head"><h2>Preisverlauf</h2><button data-view="history" aria-label="Alle ${history.length} Preisänderungen im Verlauf öffnen">Alle ${history.length}</button></div>${history.length ? `<div class="change-rows change-preview">${historyRows(history.slice(0, 3))}</div>` : `<p class="empty">Noch keine Preisänderungen</p>`}`
}

export function renderRanks(offers: ModelOffer[]): string {
  return (Object.entries(labels) as Array<[Purpose,string]>).map(([purpose,label],index) => {
    const column = (mode: "free"|"paid") => {
      const ranked = rankOffers(offers,purpose,mode).filter((item)=>item.rating === "scored").slice(0,3)
      const title = mode === "free" ? "Kostenlos" : "Kostenpflichtig"
      return `<section class="rank-column price-${mode}"><h4><i aria-hidden="true"></i>${title}</h4>${ranked.length ? `<ol>${ranked.map((item)=>`<li><strong>${esc(item.offer.name)}</strong><small>Score ${item.score} · ${money(item.offer.pricing.input)} / ${money(item.offer.pricing.output)}</small></li>`).join("")}</ol>` : `<p class="empty">Keine belastbar bewerteten Modelle</p>`}</section>`
    }
    return `<details class="purpose-block purpose-${purpose}" data-key="purpose-${purpose}"${index===0 ? " open" : ""}><summary><span aria-hidden="true">${purposeIcon[purpose]}</span><strong>${label}</strong></summary><div class="rank-columns">${column("free")}${column("paid")}</div></details>`
  }).join("")
}
