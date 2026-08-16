import { describe, expect, test } from "bun:test"
import { toggleFavorite } from "../src/domain/favorites"
import type { DashboardState } from "../src/domain/dashboard"

describe("favorites domain", () => {
  test("fuegt einen neuen offerKey hinzu", () => {
    expect(toggleFavorite([], "openrouter:model-x")).toEqual(["openrouter:model-x"])
    expect(toggleFavorite(["openrouter:a"], "opencode-zen:b")).toEqual(["opencode-zen:b", "openrouter:a"])
  })

  test("entfernt einen vorhandenen offerKey", () => {
    expect(toggleFavorite(["openrouter:model-x"], "openrouter:model-x")).toEqual([])
    expect(toggleFavorite(["openrouter:a", "openrouter:b"], "openrouter:a")).toEqual(["openrouter:b"])
  })

  test("ist beidseitig idempotent", () => {
    const base = ["opencode-zen:b", "openrouter:a"]
    // Entfernen-Zweig: zweimal togglen eines vorhandenen Keys.
    expect(toggleFavorite(toggleFavorite(base, "openrouter:a"), "openrouter:a")).toEqual(base)
    // Hinzufuegen-Zweig: zweimal togglen eines neuen Keys.
    expect(toggleFavorite(toggleFavorite(base, "claude-code:c"), "claude-code:c")).toEqual(base)
  })

  test("schuetzt vor Duplikaten in der Eingabe", () => {
    expect(toggleFavorite(["openrouter:a", "openrouter:a"], "openrouter:b")).toEqual(["openrouter:a", "openrouter:b"])
    // Auch ein doppelt vorhandener Ziel-Key wird genau einmal entfernt.
    expect(toggleFavorite(["openrouter:a", "openrouter:a"], "openrouter:a")).toEqual([])
  })

  test("haelt die Reihenfolge stabil sortiert", () => {
    const added = toggleFavorite(["opencode-zen:b", "openrouter:a"], "claude-code:c")
    expect(added).toEqual(["claude-code:c", "opencode-zen:b", "openrouter:a"])
    // Unabhaengig von der Eingabereihenfolge dasselbe Ergebnis.
    expect(added).toEqual(toggleFavorite(["openrouter:a", "opencode-zen:b"], "claude-code:c"))
  })
})

describe("state integration", () => {
  const state = (favorites: string[]): DashboardState => ({
    snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 1_700_000_000_000, favorites,
  })

  test("DashboardState traegt favorites und erhaelt uebrige Felder beim Toggle", () => {
    const before = state(["openrouter:a"])
    const after: DashboardState = { ...before, favorites: toggleFavorite(before.favorites, "openrouter:b") }
    // Spread-Muster aus extension.ts: uebrige Felder bleiben unangetastet.
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(after.snapshots).toEqual([])
    expect(after.favorites).toEqual(["openrouter:a", "openrouter:b"])
  })

  test("favorites ueberstehen den JSON-Roundtrip der globalState-Persistenz", () => {
    const persisted = JSON.parse(JSON.stringify(state(["openrouter:a"]))) as DashboardState
    expect(persisted.favorites).toEqual(["openrouter:a"])
    const toggled = { ...persisted, favorites: toggleFavorite(persisted.favorites, "opencode-zen:b") }
    expect(JSON.parse(JSON.stringify(toggled)) as DashboardState).toEqual(state(["opencode-zen:b", "openrouter:a"]))
  })

  // extension.ts faehrt diesen Zyklus: Laden mit globalState.get(FAVORITES_KEY)
  // ?? [], Toggle ueber toggleFavorite, Speichern mit globalState.update,
  // erneutes Laden beim naechsten Start. Der Mini-Store bildet das
  // vscode.Memento-Verhalten nach (get liefert undefined fuer fehlende
  // Schluessel, update schreibt den Wert). Der Lade-Fallback `?? []` gehoert
  // zum extension.ts-Pfad und ist hier als Vertrag geprueft: eine Sitzung
  // ohne gespeicherte Favoriten startet leer.
  test("favoriten ueberstehen die save/reload-Schleife der extension-Persistenz", async () => {
    const FAVORITES_KEY = "priceWatch.favorites"
    const makeStore = () => {
      const data = new Map<string, unknown>()
      return {
        get: (key: string) => data.get(key) as string[] | undefined,
        update: async (key: string, value: unknown) => { if (value === undefined) data.delete(key); else data.set(key, value) },
      }
    }
    // Sitzung 1: noch nichts gespeichert — der `?? []`-Fallback startet leer.
    const store = makeStore()
    let favorites = store.get(FAVORITES_KEY) ?? []
    expect(favorites).toEqual([])
    // Zwei Toggles, jeweils wie im Message-Handler persistiert.
    favorites = toggleFavorite(favorites, "openrouter:m")
    await store.update(FAVORITES_KEY, favorites)
    favorites = toggleFavorite(favorites, "opencode-zen:b")
    await store.update(FAVORITES_KEY, favorites)
    // Sitzung 2 (Extension-Neustart): der persistierte Stand kommt zurueck —
    // sortiert, dedupliziert, ohne Verlust der ersten Sitzung.
    favorites = store.get(FAVORITES_KEY) ?? []
    expect(favorites).toEqual(["opencode-zen:b", "openrouter:m"])
    // Und weitere Toggles in der neuen Sitzung bleiben konsistent.
    favorites = toggleFavorite(favorites, "openrouter:m")
    expect(favorites).toEqual(["opencode-zen:b"])
  })
})