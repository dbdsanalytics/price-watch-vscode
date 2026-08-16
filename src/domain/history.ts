import type { PriceChange } from "./changes"
import type { ProviderId, ProviderError, ProviderSnapshot } from "./provider"
import type { ModelOffer } from "./model"

export function mergeHistory(local: PriceChange[], incoming: PriceChange[], now = Date.now()): PriceChange[] {
  const cutoff = now - 90 * 86_400_000
  const merged = new Map<string, PriceChange>()
  for (const event of [...local, ...incoming]) if (event.at >= cutoff) merged.set(event.id, event)
  return [...merged.values()].sort((a, b) => b.at - a.at)
}

// --- Einmalige Migration aus dem v0.1/v0.2- in den versionierten Namespace ---
//
// v0.1 schrieb priceWatch.lastHash und priceWatch.lastAiAt unversioniert,
// v0.2.0 history/snapshots unter .v2 — inklusive negativer Sentinel-Preise,
// die seit v0.3 in einem frischen Namespace (.v3) ferngehalten werden. Die
// Migration validiert die Legacy-Werte, bevor sie in die v3-Keys wandern, und
// laeuft genau einmal (priceWatch.migration.v1). Secrets (SecretStorage)
// sind kein Teil dieses Stores und werden nie angefasst.

/** Schlankes Interface fuer vscode.Memento — strukturell kompatibel, ohne vscode-Import. */
export interface GlobalStateStore {
  get<T>(key: string): T | undefined
  update(key: string, value: unknown): PromiseLike<void> | void
}

export interface MigrationTargets {
  historyKey: string
  snapshotKey: string
  aiLastRunKey: string
}

export const MIGRATION_KEY = "priceWatch.migration.v1"
export const MIGRATED_LAST_HASH_KEY = "priceWatch.lastHash.v1"
export const LEGACY_LAST_HASH_KEY = "priceWatch.lastHash"
export const LEGACY_LAST_AI_KEY = "priceWatch.lastAiAt"
export const LEGACY_HISTORY_KEY = "priceWatch.history.v2"
export const LEGACY_SNAPSHOT_KEY = "priceWatch.snapshots.v2"

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const isNonNegativeNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0

function validPriceChange(value: unknown): value is PriceChange {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string" || typeof value.at !== "number" || typeof value.provider !== "string" || typeof value.modelId !== "string" || typeof value.dimension !== "string") return false
  // v0.2.0 persistierte negative Sentinel-Preise; die duerfen nicht in v3 wandern.
  if (!isNonNegativeNumber(value.previous) || !isNonNegativeNumber(value.current)) return false
  return value.percent === null || typeof value.percent === "number"
}

function validOffers(value: unknown): ModelOffer[] | null {
  if (!Array.isArray(value)) return null
  const offers: ModelOffer[] = []
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || !isRecord(raw.pricing)) continue
    if (!isNonNegativeNumber(raw.pricing.input) || !isNonNegativeNumber(raw.pricing.output)) continue
    let clean = true
    for (const dimension of ["cacheRead", "cacheWrite", "request", "image", "webSearch"] as const) {
      const price = raw.pricing[dimension]
      if (price !== undefined && !isNonNegativeNumber(price)) { clean = false; break }
    }
    if (clean) offers.push(raw as unknown as ModelOffer)
  }
  return offers
}

function validProviderSnapshot(value: unknown): ProviderSnapshot | null {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.checkedAt !== "number" || typeof value.stale !== "boolean") return null
  const offers = validOffers(value.offers)
  if (!offers) return null
  const snapshot: ProviderSnapshot = { provider: value.provider as ProviderId, offers, checkedAt: value.checkedAt, stale: value.stale }
  if (isRecord(value.error)) snapshot.error = value.error as ProviderError
  if (typeof value.warning === "string") snapshot.warning = value.warning
  return snapshot
}

export async function migrateLegacyState(store: GlobalStateStore, targets: MigrationTargets): Promise<void> {
  if (store.get(MIGRATION_KEY) !== undefined) return
  // lastHash (v0.1): Wert ohne Datenverlust in den versionierten Namespace heben.
  const lastHash = store.get<unknown>(LEGACY_LAST_HASH_KEY)
  if (typeof lastHash === "string" && lastHash.length > 0 && store.get(MIGRATED_LAST_HASH_KEY) === undefined) await store.update(MIGRATED_LAST_HASH_KEY, lastHash)
  await store.update(LEGACY_LAST_HASH_KEY, undefined)
  // AI-Zeitstempel (v0.1): nur uebernehmen, wenn der aktuelle Key noch nie gesetzt wurde.
  const lastAiAt = store.get<unknown>(LEGACY_LAST_AI_KEY)
  if (typeof lastAiAt === "number" && Number.isFinite(lastAiAt) && lastAiAt > 0 && store.get(targets.aiLastRunKey) === undefined) await store.update(targets.aiLastRunKey, lastAiAt)
  await store.update(LEGACY_LAST_AI_KEY, undefined)
  // History v2 -> v3, Eintrag fuer Eintrag validiert.
  const legacyHistory = store.get<unknown>(LEGACY_HISTORY_KEY)
  if (Array.isArray(legacyHistory) && store.get(targets.historyKey) === undefined) {
    const migrated = legacyHistory.filter(validPriceChange)
    if (migrated.length > 0) await store.update(targets.historyKey, migrated)
  }
  await store.update(LEGACY_HISTORY_KEY, undefined)
  // Snapshots v2 -> v3, Angebote mit negativen Sentinel-Preisen einzeln verworfen.
  const legacySnapshots = store.get<unknown>(LEGACY_SNAPSHOT_KEY)
  if (Array.isArray(legacySnapshots) && store.get(targets.snapshotKey) === undefined) {
    const migrated: ProviderSnapshot[] = []
    for (const raw of legacySnapshots) { const item = validProviderSnapshot(raw); if (item) migrated.push(item) }
    if (migrated.length > 0) await store.update(targets.snapshotKey, migrated)
  }
  await store.update(LEGACY_SNAPSHOT_KEY, undefined)
  await store.update(MIGRATION_KEY, true)
}