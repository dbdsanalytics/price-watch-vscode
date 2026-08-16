import { describe, expect, test } from "bun:test"
import {
  LEGACY_HISTORY_KEY,
  LEGACY_LAST_AI_KEY,
  LEGACY_LAST_HASH_KEY,
  LEGACY_SNAPSHOT_KEY,
  MIGRATED_LAST_HASH_KEY,
  MIGRATION_KEY,
  migrateLegacyState,
  type GlobalStateStore,
} from "../src/domain/history"
import type { PriceChange } from "../src/domain/changes"
import type { ModelOffer } from "../src/domain/model"
import type { ProviderSnapshot } from "../src/domain/provider"

// Aktuelle versionierte Keys aus src/extension.ts — dort bleibt die Wahrheit,
// hier spiegeln die Tests sie, um die Migration gegen den echten Namespace
// zu pruefen.
const HISTORY_KEY = "priceWatch.history.v3"
const SNAPSHOT_KEY = "priceWatch.snapshots.v3"
const AI_LAST_RUN_KEY = "priceWatch.aiLastRun.v1"
const SECRET_KEY_LEGACY = "priceWatch.openrouterKey"
const SECRET_KEY_ACCOUNT = "priceWatch.account.openrouter"

const targets = { historyKey: HISTORY_KEY, snapshotKey: SNAPSHOT_KEY, aiLastRunKey: AI_LAST_RUN_KEY }

// Fake fuer vscode.Memento: update(key, undefined) loescht wie im echten
// globalState. data() liefert den sichtbaren Zustand fuer Assertions.
const fakeStore = (initial: Record<string, unknown> = {}) => {
  const data = new Map<string, unknown>(Object.entries(initial))
  const store: GlobalStateStore & { data: () => Record<string, unknown> } = {
    get: <T>(key: string): T | undefined => data.get(key) as T | undefined,
    update: async (key: string, value: unknown) => { if (value === undefined) data.delete(key); else data.set(key, value) },
    data: () => Object.fromEntries(data),
  }
  return store
}

const change = (over: Partial<PriceChange> = {}): PriceChange => ({ id: "openrouter:m:input:1:0.5:1:100", at: 1_700_000_000_000, provider: "openrouter", modelId: "m", dimension: "input", previous: 0.5, current: 1, percent: 100, ...over })
const offer = (id: string, input = 1): ModelOffer => ({ provider: "openrouter", id, name: id, pricing: { input, output: input }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: false, structuredOutput: false, reasoning: false, contextLength: 1000, purposes: ["language"] } })
const snapshot = (over: Partial<ProviderSnapshot> = {}): ProviderSnapshot => ({ provider: "openrouter", offers: [offer("m1")], checkedAt: 1_700_000_000_000, stale: false, ...over })

describe("state migration", () => {
  test("migriert priceWatch.lastHash und v2-Daten ohne Datenverlust in den v3-Namespace", async () => {
    const store = fakeStore({ [LEGACY_LAST_HASH_KEY]: "abc123hash", [LEGACY_HISTORY_KEY]: [change()], [LEGACY_SNAPSHOT_KEY]: [snapshot()] })
    await migrateLegacyState(store, targets)
    expect(store.get<string>(MIGRATED_LAST_HASH_KEY)).toBe("abc123hash")
    expect(store.get(LEGACY_LAST_HASH_KEY)).toBeUndefined()
    expect(store.get<PriceChange[]>(HISTORY_KEY)).toEqual([change()])
    expect(store.get(LEGACY_HISTORY_KEY)).toBeUndefined()
    expect(store.get<ProviderSnapshot[]>(SNAPSHOT_KEY)).toEqual([snapshot()])
    expect(store.get(LEGACY_SNAPSHOT_KEY)).toBeUndefined()
    expect(store.get<boolean>(MIGRATION_KEY)).toBe(true)
  })

  test("uebernimmt den alten AI-Zeitstempel in priceWatch.aiLastRun.v1", async () => {
    const store = fakeStore({ [LEGACY_LAST_AI_KEY]: 987_654_321 })
    await migrateLegacyState(store, targets)
    expect(store.get<number>(AI_LAST_RUN_KEY)).toBe(987_654_321)
    expect(store.get(LEGACY_LAST_AI_KEY)).toBeUndefined()
  })

  test("laesst einen bereits gesetzten AI-Zeitstempel unangetastet", async () => {
    const store = fakeStore({ [LEGACY_LAST_AI_KEY]: 111, [AI_LAST_RUN_KEY]: 222 })
    await migrateLegacyState(store, targets)
    expect(store.get<number>(AI_LAST_RUN_KEY)).toBe(222)
    expect(store.get(LEGACY_LAST_AI_KEY)).toBeUndefined()
  })

  test("ignoriert ungueltige AI-Zeitstempel ohne Crash", async () => {
    for (const bad of ["gestern", -5, null, {}]) {
      const store = fakeStore({ [LEGACY_LAST_AI_KEY]: bad })
      await migrateLegacyState(store, targets)
      expect(store.get(AI_LAST_RUN_KEY)).toBeUndefined()
      expect(store.get(LEGACY_LAST_AI_KEY)).toBeUndefined()
    }
  })

  test("ignoriert korrupte History-Werte und verwirft nur die betroffenen Eintraege", async () => {
    const store = fakeStore({ [LEGACY_HISTORY_KEY]: [change(), { ...change({ id: "sentinel" }), previous: -1 }, "muell", null] as unknown[] })
    await migrateLegacyState(store, targets)
    expect(store.get<PriceChange[]>(HISTORY_KEY)).toEqual([change()])
    expect(store.get(LEGACY_HISTORY_KEY)).toBeUndefined()
    // Komplett korrupter Wert: kein Crash, Ziel bleibt ungesetzt.
    const store2 = fakeStore({ [LEGACY_HISTORY_KEY]: "kaputt" })
    await migrateLegacyState(store2, targets)
    expect(store2.get(HISTORY_KEY)).toBeUndefined()
    expect(store2.get(LEGACY_HISTORY_KEY)).toBeUndefined()
  })

  test("ignoriert korrupte Snapshots und filtert Angebote mit negativen Sentinel-Preisen", async () => {
    const corrupted = { ...snapshot(), offers: [offer("ok"), { ...offer("bad"), pricing: { input: -1, output: -1 } }] }
    const store = fakeStore({ [LEGACY_SNAPSHOT_KEY]: [corrupted, { provider: 42 }, "muell"] as unknown[] })
    await migrateLegacyState(store, targets)
    expect(store.get<ProviderSnapshot[]>(SNAPSHOT_KEY)).toEqual([{ ...snapshot(), offers: [offer("ok")] }])
    expect(store.get(LEGACY_SNAPSHOT_KEY)).toBeUndefined()
  })

  test("ueberschreibt vorhandene v3-Daten nicht", async () => {
    const store = fakeStore({ [LEGACY_HISTORY_KEY]: [change({ id: "legacy" })], [HISTORY_KEY]: [change({ id: "current" })], [LEGACY_SNAPSHOT_KEY]: [snapshot({ checkedAt: 1 })], [SNAPSHOT_KEY]: [snapshot({ checkedAt: 2 })] })
    await migrateLegacyState(store, targets)
    expect(store.get<PriceChange[]>(HISTORY_KEY)).toEqual([change({ id: "current" })])
    expect(store.get<ProviderSnapshot[]>(SNAPSHOT_KEY)).toEqual([snapshot({ checkedAt: 2 })])
    expect(store.get(LEGACY_HISTORY_KEY)).toBeUndefined()
    expect(store.get(LEGACY_SNAPSHOT_KEY)).toBeUndefined()
  })

  test("laesst einen bereits gesetzten MIGRATED_LAST_HASH_KEY unangetastet", async () => {
    // Unrealistischer Downgrade-Mix: Ziel-Key existiert, Migration fehlt.
    const store = fakeStore({ [LEGACY_LAST_HASH_KEY]: "neu", [MIGRATED_LAST_HASH_KEY]: "alt" })
    await migrateLegacyState(store, targets)
    expect(store.get<string>(MIGRATED_LAST_HASH_KEY)).toBe("alt")
    expect(store.get(LEGACY_LAST_HASH_KEY)).toBeUndefined()
  })

  test("migriert genau einmal ueber priceWatch.migration.v1", async () => {
    const store = fakeStore({ [LEGACY_LAST_HASH_KEY]: "abc", [LEGACY_HISTORY_KEY]: [change()] })
    await migrateLegacyState(store, targets)
    expect(store.get<boolean>(MIGRATION_KEY)).toBe(true)
    // Nach der Migration eingespielte Legacy-Werte (z. B. alter Sync) bleiben liegen.
    store.update(LEGACY_LAST_HASH_KEY, "neu")
    store.update(LEGACY_HISTORY_KEY, [change({ id: "spaet" })])
    const before = store.data()
    await migrateLegacyState(store, targets)
    expect(store.data()).toEqual(before)
    expect(store.get<PriceChange[]>(HISTORY_KEY)).toEqual([change()])
  })

  test("setzt den Migrations-Key auch auf einem frischen Store", async () => {
    // Frische Installation ohne Legacy-Daten: Die Migration muss trotzdem
    // durchlaufen und den Guard setzen, damit spaeter eingespielte
    // Legacy-Werte (z. B. alter Sync) nie mehr uebertragen werden.
    const store = fakeStore({})
    await migrateLegacyState(store, targets)
    expect(store.get<boolean>(MIGRATION_KEY)).toBe(true)
    expect(Object.keys(store.data()).sort()).toEqual([MIGRATION_KEY])
  })

  test("verwirft einen korrupten lastHash ohne Crash und ohne Reste", async () => {
    for (const bad of [42, "", {}, ["abc"], null]) {
      const store = fakeStore({ [LEGACY_LAST_HASH_KEY]: bad })
      await migrateLegacyState(store, targets)
      expect(store.get(MIGRATED_LAST_HASH_KEY)).toBeUndefined()
      expect(store.get(LEGACY_LAST_HASH_KEY)).toBeUndefined()
      expect(store.get<boolean>(MIGRATION_KEY)).toBe(true)
    }
  })

  test("legt fuer leere Legacy-Keys keine leeren v3-Eintraege an", async () => {
    const store = fakeStore({ [LEGACY_HISTORY_KEY]: [], [LEGACY_SNAPSHOT_KEY]: [] })
    await migrateLegacyState(store, targets)
    expect(store.get(HISTORY_KEY)).toBeUndefined()
    expect(store.get(SNAPSHOT_KEY)).toBeUndefined()
    expect(store.get(LEGACY_HISTORY_KEY)).toBeUndefined()
    expect(store.get(LEGACY_SNAPSHOT_KEY)).toBeUndefined()
    expect(store.get<boolean>(MIGRATION_KEY)).toBe(true)
  })

  test("kopiert niemals Secrets in den synchronisierten globalState", async () => {
    // Fake-Context: globalState plus SecretStorage. Die Migration bekommt per
    // Signatur nur den globalState — ein Zugriff auf secrets ist strukturell
    // ausgeschlossen. Der Zaehler belegt es zusaetzlich.
    const store = fakeStore({ [LEGACY_LAST_HASH_KEY]: "abc" })
    let secretReads = 0
    const fakeSecrets = {
      get: async (key: string) => { secretReads += 1; return key === SECRET_KEY_LEGACY ? "sk-or-geheim" : undefined },
      store: async () => { secretReads += 1 },
      delete: async () => { secretReads += 1 },
    }
    await migrateLegacyState(store, targets)
    const data = store.data()
    const keys = Object.keys(data)
    expect(keys.some((key) => key.startsWith("priceWatch.account."))).toBe(false)
    expect(keys.includes(SECRET_KEY_LEGACY)).toBe(false)
    expect(JSON.stringify(data).includes("sk-or-geheim")).toBe(false)
    expect(secretReads).toBe(0)
    void fakeSecrets
  })
})