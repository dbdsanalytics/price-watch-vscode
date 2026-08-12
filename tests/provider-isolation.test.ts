import { describe, expect, test } from "bun:test"
import { fetchAllProviders } from "../src/providers/fetch-all"

describe("provider isolation", () => {
  test("keeps successful providers when one fails", async () => {
    const snapshots = await fetchAllProviders({
      openrouter: async () => [],
      "opencode-zen": async () => { throw new Error("Zen down") },
      "opencode-go": async () => [],
    })
    expect(snapshots).toHaveLength(3)
    expect(snapshots.find((item) => item.provider === "opencode-zen")?.error?.kind).toBe("network")
    expect(snapshots.filter((item) => !item.error)).toHaveLength(2)
  })
})
