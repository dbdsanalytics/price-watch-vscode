import { isFreePricing, type ModelOffer } from "../../domain/model"
import type { Purpose } from "../../domain/ranking"
import { amount, count, esc, money } from "../format"

export const labels: Record<Purpose,string> = { coding:"Coding", language:"Sprache", reasoning:"Reasoning", vision:"Vision", tools:"Tools", allround:"Allround" }
export const purposeIcon: Record<Purpose,string> = { coding:"⌘", language:"A", reasoning:"◇", vision:"◉", tools:"⚙", allround:"✦" }

export function purposeBadge(purpose: Purpose): string { return `<span class="badge purpose purpose-${purpose}"><b aria-hidden="true">${purposeIcon[purpose]}</b>${labels[purpose]}</span>` }
export function providerBadge(provider: ModelOffer["provider"]): string { return `<span class="badge provider provider-${provider}"><i aria-hidden="true"></i>${esc(provider === "openrouter" ? "OpenRouter" : provider === "opencode-zen" ? "Zen" : "Go")}</span>` }

/** Bei Go entscheidet das Abo-Kontingent, nicht der Token-Preis. */
export function quotaLine(offer: ModelOffer): string {
  const quota = offer.quota
  if (!quota) return ""
  // Fehlt die Anfragenzahl, ist das Modell nicht vergleichbar. Das gehoert
  // hingeschrieben, sonst wirkt der Dollarwert wie die ganze Auskunft.
  const parts = [quota.requestsPerMonth !== undefined ? `${count(quota.requestsPerMonth)} Anfragen/Monat` : "Anfragen nicht in der Quelle",
    quota.includedUsdPerMonth !== undefined ? `${money(quota.includedUsdPerMonth)} enthalten` : ""].filter(Boolean)
  return `<small class="quota">${esc(parts.join(" · "))}</small>`
}

export function priceClass(offer: ModelOffer): string { return isFreePricing(offer.pricing) ? "free" : offer.pricing.unknown ? "unknown" : "paid" }

/** Gestufte Preise als Spanne: der Basispreis allein verschweigt die obere Stufe. */
export function priceCell(offer: ModelOffer, side: "input" | "output"): string {
  if (offer.pricing.unknown) return "Preis unbekannt"
  const base = offer.pricing[side], tiers = offer.pricing.tiers ?? []
  if (!tiers.length) return money(base)
  return `${amount(base)}–${money(Math.max(base, ...tiers.map((tier) => tier[side])))}`
}
export function tierDetails(offer: ModelOffer): string {
  const tiers = offer.pricing.tiers ?? []
  if (!tiers.length) return ""
  const rows = [`${esc(offer.tier ?? "Basis")} · ${esc(money(offer.pricing.input))} / ${esc(money(offer.pricing.output))}`,
    ...tiers.map((tier) => `${esc(tier.label)} · ${esc(money(tier.input))} / ${esc(money(tier.output))}`)]
  return `<details class="tier-details" data-key="tier-${esc(offer.id)}"><summary>${tiers.length + 1} Preisstufen</summary>${rows.map((row) => `<article>${row}</article>`).join("")}</details>`
}
export function benchmarkCell(offer: ModelOffer): string {
  const scores = offer.benchmarks
  if (!scores) return `<div class="benchmark benchmark-missing"><strong>Keine Daten</strong><small>Noch nicht belastbar bewertet</small></div>`
  const values = [["Intelligenz",scores.intelligence],["Coding",scores.coding],["Agentic",scores.agentic]].filter((item):item is [string,number]=>item[1]!==undefined)
  const provenance = scores.match === "base-model" ? "Identisches Basismodell" : scores.match === "local" ? "Lokaler Praxistest" : "Öffentlich bewertet"
  const detailLabel:Record<string,string>={ gpqa_diamond:"GPQA Diamond", tau_bench_verified_airline:"τ²-Bench Airline", search_browsecomp:"BrowseComp", search_dsqa:"DeepSearchQA", search_hle:"Search HLE", search_widesearch:"WideSearch",
    arena_codecategories:"Arena · Code", arena_website:"Arena · Website", arena_uicomponent:"Arena · UI-Komponenten", arena_dataviz:"Arena · Datenvisualisierung", arena_svg:"Arena · SVG", arena_gamedev:"Arena · Spiele", arena_3d:"Arena · 3D", arena_asciiart:"Arena · ASCII-Art", arena_graphicdesign:"Arena · Grafikdesign", arena_logo:"Arena · Logo", arena_image:"Arena · Bild", arena_imageediting:"Arena · Bildbearbeitung" }
  const details=(scores.details ?? []).map((detail)=>`<article><strong>${esc(detailLabel[detail.name] ?? detail.name)}</strong><span>${new Intl.NumberFormat("de-DE",{ maximumFractionDigits:1 }).format(detail.score)} %</span>${detail.elo!==undefined?`<small>ELO ${esc(detail.elo)}</small>`:""}${detail.sampleCount!==undefined?`<small>${esc(detail.sampleCount)} ${detail.elo!==undefined?"Duelle":"Aufgaben"}</small>`:""}${detail.costPerTaskUsd!==undefined?`<small>${money(detail.costPerTaskUsd)}/Aufgabe</small>`:""}</article>`).join("")
  // Aggregierte Scores fehlen noch (Backend aggregiert details→Scores), aber
  // Einzelwerte liegen vor: zeige die aussagekraeftigsten sichtbar, statt die
  // Zelle leer zu lassen. Sobald Scores vorhanden sind, gelten diese wie bisher.
  const singleValues = values.length === 0 && (scores.details ?? []).length > 0
    ? [...(scores.details ?? [])].sort((a,b)=>b.score-a.score).slice(0,3)
    : []
  const valuesBlock = values.length > 0
    ? values.map(([label,value])=>`<span><b>${label}</b> ${esc(value)}</span>`).join("")
    : singleValues.length > 0
      ? `<span><b>Einzelwerte</b></span>${singleValues.map((detail)=>`<span><b>${esc(detailLabel[detail.name] ?? detail.name)}</b> ${new Intl.NumberFormat("de-DE",{ maximumFractionDigits:1 }).format(detail.score)} %</span>`).join("")}`
      : ""
  return `<div class="benchmark benchmark-${scores.match ?? "direct"}"><div>${valuesBlock}</div>${details?`<details class="benchmark-details" data-key="bench-${esc(offer.id)}"><summary>${esc(scores.details?.length)} Einzelbenchmarks</summary>${details}</details>`:""}<small>${provenance}</small></div>`
}

/** Der innere Inhalt von <tbody> — das Fragment, das bei Preisaenderungen tauscht. */
export function modelRows(offers: ModelOffer[]): string {
  return offers.slice().sort((a,b)=>a.name.localeCompare(b.name)).map((offer)=>`<tr data-model="${esc(`${offer.name} ${offer.provider} ${offer.capabilities.purposes.join(" ")}`.toLowerCase())}" data-provider="${offer.provider}" data-price="${priceClass(offer)}"><td><strong>${esc(offer.name)}</strong><small>${esc(offer.id)}</small>${quotaLine(offer)}</td><td>${providerBadge(offer.provider)}</td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "input"))}</span></td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "output"))}</span>${tierDetails(offer)}</td><td><div class="capabilities">${offer.capabilities.purposes.map(purposeBadge).join("")}</div></td><td>${benchmarkCell(offer)}</td></tr>`).join("")
}

/** Die Bedienelemente liegen ausserhalb der Fragmente und ueberleben jeden Tausch. */
export function modelFilters(): string {
  return `<div class="filters"><input id="search" placeholder="Modelle durchsuchen" aria-label="Modelle durchsuchen"><select id="provider" aria-label="Anbieter filtern"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="price" aria-label="Preis filtern"><option value="">Alle Preise</option><option value="free">Kostenlos</option><option value="paid">Kostenpflichtig</option><option value="unknown">Preis unbekannt</option></select><select id="purpose" aria-label="Fähigkeit filtern"><option value="">Alle Fähigkeiten</option>${Object.entries(labels).map(([value,label])=>`<option value="${value}">${label}</option>`).join("")}</select></div>`
}
