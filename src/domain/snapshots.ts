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
