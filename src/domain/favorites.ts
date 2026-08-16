/**
 * Einen offerKey (Format `provider:id`, siehe offerKey in domain/model.ts) in
 * der Favoritenliste umschalten: vorhandene Eintraege werden entfernt, neue
 * hinzugefuegt. Das Ergebnis ist dedupliziert und stabil sortiert, damit die
 * Anzeige unabhaengig von der Toggle-Reihenfolge deterministisch bleibt.
 * Idempotent in beide Richtungen: zweimal hintereinander togglen liefert den
 * Ausgangszustand, vorhandene Duplikate in der Eingabe werden bereinigt.
 */
export function toggleFavorite(favorites: string[], offerKey: string): string[] {
  const set = new Set(favorites)
  if (set.has(offerKey)) set.delete(offerKey)
  else set.add(offerKey)
  return [...set].sort()
}