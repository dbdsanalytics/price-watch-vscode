import type { ModelOffer } from "../../domain/model"
import { rankOffers, type Purpose } from "../../domain/ranking"
import { esc, money } from "../format"
import { labels, purposeIcon } from "./models"

export function renderRanks(offers: ModelOffer[]): string {
  return (Object.entries(labels) as Array<[Purpose,string]>).map(([purpose,label],index) => {
    const column = (mode: "free"|"paid") => {
      const ranked = rankOffers(offers,purpose,mode).filter((item)=>item.rating === "scored").slice(0,3)
      const title = mode === "free" ? "Kostenlos" : "Kostenpflichtig"
      return `<section class="rank-column price-${mode}"><h4><i></i>${title}</h4>${ranked.length ? `<ol>${ranked.map((item)=>`<li><strong>${esc(item.offer.name)}</strong><small>Score ${item.score} · ${money(item.offer.pricing.input)} / ${money(item.offer.pricing.output)}</small></li>`).join("")}</ol>` : `<p class="empty">Keine belastbar bewerteten Modelle</p>`}</section>`
    }
    return `<details class="purpose-block purpose-${purpose}"${index===0 ? " open" : ""}><summary><span>${purposeIcon[purpose]}</span><strong>${label}</strong></summary><div class="rank-columns">${column("free")}${column("paid")}</div></details>`
  }).join("")
}
