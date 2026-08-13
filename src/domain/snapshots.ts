import type { ProviderSnapshot } from "./provider"

// Ein Anbieterausfall darf die zuletzt bekannten Preise nicht löschen: sonst
// verschwinden die Modelle aus der Oberfläche und der nächste erfolgreiche
// Abruf hat keine Vergleichsbasis mehr, meldet also keine Preisänderung.
export function carryForwardOffers(previous: ProviderSnapshot[], fresh: ProviderSnapshot[]): ProviderSnapshot[] {
  const known = new Map(previous.map((snapshot) => [snapshot.provider, snapshot]))
  return fresh.map((snapshot) => {
    if (snapshot.offers.length) return snapshot
    const last = known.get(snapshot.provider)
    if (!last?.offers.length) return snapshot
    // Auch ein fehlerfrei gemeldeter, aber leerer Abruf darf die letzten Preise
    // nicht loeschen; er wird als veraltet markiert statt als aktueller Stand.
    return { ...snapshot, offers: last.offers, checkedAt: last.checkedAt, stale: true }
  })
}

/**
 * Ein Fehler verwirft den Abruf, eine Warnung nicht. Beide Faelle hier sind
 * plausible Daten mit unplausibler Herkunft: entweder liest der Parser die
 * Quelle nicht mehr vollstaendig, oder das Preisformat hat sich geaendert.
 */
export function plausibilityWarning(previous: ProviderSnapshot | undefined, fresh: ProviderSnapshot): string | undefined {
  if (fresh.error || !previous || previous.error || !previous.offers.length) return undefined
  if (fresh.offers.length < previous.offers.length * 0.7) {
    return `Nur ${fresh.offers.length} statt zuletzt ${previous.offers.length} Modelle gelesen — hat sich die Dokumentstruktur geändert?`
  }
  const priced = new Set(previous.offers.filter((offer) => !offer.pricing.unknown).map((offer) => offer.id))
  const lost = fresh.offers.filter((offer) => offer.pricing.unknown && priced.has(offer.id)).length
  return lost ? `${lost} Modelle ohne lesbaren Preis, die zuletzt einen hatten — hat sich das Preisformat geändert?` : undefined
}
