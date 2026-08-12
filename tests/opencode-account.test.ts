import { describe, expect, test } from "bun:test"
import { parseOpenCodeGoUsage } from "../src/accounts/opencode"

const body = (rolling: number, weekly: number, monthly: number, weeklyStatus = "ok") => ({
  usage: {
    rolling: { status: "ok", percent: rolling, resetsAt: "2026-08-12T21:12:32.099Z" },
    weekly: { status: weeklyStatus, percent: weekly, resetsAt: "2026-08-17T00:00:00.099Z" },
    monthly: { status: "ok", percent: monthly, resetsAt: "2026-09-08T20:06:23.099Z" },
  },
})

describe("parseOpenCodeGoUsage", () => {
  test("meldet erschöpft, sobald ein Fenster rate-limited ist", () => {
    const account = parseOpenCodeGoUsage(body(0, 100, 50, "rate-limited"))
    expect(account.provider).toBe("opencode-go")
    expect(account.state).toBe("exhausted")
    // Das bindende Fenster bestimmt, wann es weitergeht — nicht das Monatslimit.
    expect(account.resetAt).toBe("2026-08-17T00:00:00.099Z")
    expect(account.message).toContain("Woche 100 %")
  })

  test("warnt, bevor ein Fenster voll ist", () => {
    expect(parseOpenCodeGoUsage(body(0, 88, 40)).state).toBe("low")
  })

  test("meldet verfügbar bei ruhiger Lage und nennt alle drei Fenster", () => {
    const account = parseOpenCodeGoUsage(body(10, 20, 30))
    expect(account.state).toBe("available")
    expect(account.message).toContain("5 Std 10 %")
    expect(account.message).toContain("Woche 20 %")
    expect(account.message).toContain("Monat 30 %")
  })

  test("verweigert eine Antwort ohne verwertbare Nutzungsdaten", () => {
    expect(() => parseOpenCodeGoUsage({})).toThrow()
    expect(() => parseOpenCodeGoUsage({ usage: {} })).toThrow()
  })
})
