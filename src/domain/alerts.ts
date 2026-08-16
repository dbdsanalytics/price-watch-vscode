import type { PriceChange } from "./changes"
import type { AccountStatus } from "../accounts/types"

/** Obergrenze fuer Preisänderungs-Alarme pro Refresh (Top-N nach |Änderung|). */
export const MAX_PRICE_ALERTS = 5

/**
 * Waehlt die Alarm-wuerdigen Preisänderungen aus einem Diff. Relevant ist eine
 * Änderung, wenn ihre betragsmäßige prozentuale Abweichung die Schwelle
 * erreicht (>=, negativ bedeutet Preissturz) und eine Prozentbasis existiert:
 * Changes mit percent === null (alter Preis war 0, ein Sentinel/Unbekannt-
 * Platzhalter) haben keine aussagekraeftige Basis und fallen heraus.
 *
 * Neu hinzugekommene oder entfernte Modelle tauchen hier nie auf: diffOffers
 * vergleicht nur Angebote, die in beiden Staenden vorkommen — einseitige
 * Modelle haben keinen Vorherpreis, also keinen PriceChange.
 *
 * Zurueck kommen hoechstens MAX_PRICE_ALERTS Treffer, betragsmaessig
 * absteigend sortiert nach der relativen Änderung (groesste Abweichung zuerst).
 */
export function pickPriceAlerts(changes: PriceChange[], thresholdPercent: number): PriceChange[] {
  const threshold = Math.abs(thresholdPercent)
  return changes
    .filter((change) => change.percent !== null && Math.abs(change.percent) >= threshold)
    // Der filter oben entfernt percent === null — das ! ist hier garantiert sicher.
    .sort((a, b) => Math.abs(b.percent!) - Math.abs(a.percent!))
    .slice(0, MAX_PRICE_ALERTS)
}

/**
 * Waehlt verbundene Konten aus, deren bekanntes Guthaben unter der USD-Schwelle
 * liegt. Konten ohne Guthabenangabe (remainingUsd fehlt, z. B. opencode-go,
 * dessen API nur Prozentfenster nennt) werden ignoriert: Ohne Betrag laesst
 * sich kein Schwellenvergleich fuehren.
 */
export function pickLowBalanceAlerts(accounts: AccountStatus[], thresholdUsd: number): AccountStatus[] {
  return accounts.filter((account) => account.remainingUsd != null && account.remainingUsd < thresholdUsd)
}