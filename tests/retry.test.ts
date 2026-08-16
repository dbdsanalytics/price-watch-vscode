import { describe, expect, test } from "bun:test"
import { fetchWithRetry, retryAfterMs, type FetchLike } from "../src/providers/retry"
import { fetchOpenRouterCatalog } from "../src/providers/openrouter"
import { fetchOpenRouterBenchmarks } from "../src/providers/openrouter-benchmarks"
import { fetchOpenCodeDocument } from "../src/providers/opencode-docs"

// Schlaefunktion ohne echte Timer: zeichnet die Verzoegerungen auf und loest
// sofort auf, damit kein Test tatsaechlich wartet.
const recordedSleep = () => {
  const delays: number[] = []
  const sleep = async (ms: number) => { delays.push(ms) }
  return { sleep, delays }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })

describe("fetchWithRetry", () => {
  test("retries a 500 once and returns the successful response", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return calls === 1 ? new Response("boom", { status: 500 }) : json({ data: [{ id: "acme/x", name: "X", pricing: { prompt: "0.000003", completion: "0.000015" } }] })
    }
    const { sleep, delays } = recordedSleep()
    const response = await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep })
    expect(calls).toBe(2)
    expect(response.ok).toBe(true)
    // Das Ergebnis des zweiten Versuchs ist das massgebliche: Der Body muss
    // durchkommen, nicht nur der Status.
    expect(await response.json()).toMatchObject({ data: [{ id: "acme/x" }] })
    expect(delays[0]).toBeGreaterThanOrEqual(250)
    expect(delays[0]).toBeLessThanOrEqual(500)
  })

  test("retries a network error once and succeeds", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      if (calls === 1) throw new TypeError("fetch failed")
      return json({ data: [] })
    }
    const { sleep, delays } = recordedSleep()
    const response = await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep })
    expect(calls).toBe(2)
    expect(response.ok).toBe(true)
    // Auch bei Netzwerkfehlern greift der kurze Backoff, keine feste Ratelimit-Pause.
    expect(delays[0]).toBeGreaterThanOrEqual(250)
    expect(delays[0]).toBeLessThanOrEqual(500)
  })

  test("surfaces the error when both attempts fail", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => { calls += 1; throw new TypeError("offline") }
    const { sleep } = recordedSleep()
    await expect(fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep })).rejects.toThrow("offline")
    expect(calls).toBe(2)
  })

  test("does not retry non-retryable status codes like 404", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => { calls += 1; return new Response("not found", { status: 404 }) }
    const response = await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep: async () => {} })
    expect(calls).toBe(1)
    expect(response.status).toBe(404)
  })

  test("does not retry once the signal is aborted (timeout)", async () => {
    const controller = new AbortController()
    controller.abort()
    let calls = 0
    const fetchImpl: FetchLike = async () => { calls += 1; throw new Error("aborted") }
    await expect(fetchWithRetry("https://example.test/models", { signal: controller.signal }, { fetchImpl, sleep: async () => {} })).rejects.toThrow("aborted")
    expect(calls).toBe(1)
  })

  test("does not start another attempt once the signal aborts between failures", async () => {
    const controller = new AbortController()
    let calls = 0
    const fetchImpl: FetchLike = async (_input, init) => {
      calls += 1
      // Wie ein echter fetch: ein abgebrochenes Signal schlaegt sofort fehl.
      if (init?.signal?.aborted) throw new Error("AbortError: offline after abort")
      throw new TypeError("offline")
    }
    // Der Abbruch kommt waehrend des Backoffs — zwischen Versuch 1 und 2.
    const sleep = async () => { controller.abort() }
    await expect(fetchWithRetry("https://example.test/models", { signal: controller.signal }, { fetchImpl, sleep, retries: 2 })).rejects.toThrow("offline after abort")
    // retries: 2 wuerde ohne Abbruch drei Versuche erlauben — der Abbruch stoppt danach.
    expect(calls).toBe(2)
  })

  test("respects retry-after given in seconds", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return calls === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "7" } }) : json({ data: [] })
    }
    const { sleep, delays } = recordedSleep()
    await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep })
    expect(calls).toBe(2)
    expect(delays).toEqual([7_000])
  })

  test("respects retry-after given as HTTP date", async () => {
    const now = Date.parse("2026-08-16T12:00:00Z")
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return calls === 1 ? new Response("later", { status: 503, headers: { "retry-after": new Date(now + 5_000).toUTCString() } }) : json({ data: [] })
    }
    const { sleep, delays } = recordedSleep()
    await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep, now: () => now })
    expect(calls).toBe(2)
    expect(delays).toEqual([5_000])
  })

  test("retries a 429 without a retry-after header using the short backoff", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return calls === 1 ? new Response("slow down", { status: 429 }) : json({ data: [] })
    }
    const { sleep, delays } = recordedSleep()
    const response = await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep })
    expect(calls).toBe(2)
    expect(response.ok).toBe(true)
    // Ohne Header greift der Standard-Backoff statt einer festen Ratelimit-Pause.
    expect(delays[0]).toBeGreaterThanOrEqual(250)
    expect(delays[0]).toBeLessThanOrEqual(500)
  })

  test("caps the backoff at 500 ms even when more retries are configured", async () => {
    const fetchImpl: FetchLike = async () => { throw new TypeError("offline") }
    const { sleep, delays } = recordedSleep()
    await expect(fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep, retries: 3 })).rejects.toThrow("offline")
    // Exponential ohne Deckel waere 250/500/1000 — die Obergrenze ist 500.
    expect(delays).toEqual([250, 500, 500])
  })

  test("respects retry-after above the backoff cap — server control wins over RETRY_MAX_DELAY_MS", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      // 42 Sekunden liegen weit ueber der Backoff-Obergrenze von 500 ms.
      return calls === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "42" } }) : json({ data: [] })
    }
    const { sleep, delays } = recordedSleep()
    const response = await fetchWithRetry("https://example.test/models", {}, { fetchImpl, sleep })
    expect(calls).toBe(2)
    expect(response.ok).toBe(true)
    // Der Retry-After-Header wird nicht auf 500 ms gedeckelt: Der Server
    // bestimmt die Pause, nicht der lokale Backoff.
    expect(delays).toEqual([42_000])
  })
})

describe("retryAfterMs", () => {
  test("reads duration and HTTP dates, ignores missing or unparsable headers", () => {
    expect(retryAfterMs(new Response("", { status: 429, headers: { "retry-after": "30" } }))).toBe(30_000)
    const now = Date.parse("2026-08-16T12:00:00Z")
    const later = retryAfterMs(new Response("", { status: 503, headers: { "retry-after": new Date(now + 120_000).toUTCString() } }), now)
    expect(later).toBe(120_000)
    expect(retryAfterMs(new Response("", { status: 500 }))).toBeUndefined()
    expect(retryAfterMs(new Response("", { status: 500, headers: { "retry-after": "bald" } }))).toBeUndefined()
    // Ein bereits vergangenes HTTP-Datum bedeutet: sofort weitermachen.
    expect(retryAfterMs(new Response("", { status: 503, headers: { "retry-after": new Date(now - 10_000).toUTCString() } }), now)).toBe(0)
  })
})

// Beleg, dass die Produktions-Abrufe die Retry-Hilfe wirklich nutzen.
describe("provider fetches use the retry helper", () => {
  test("fetchOpenRouterCatalog retries a 500 and parses the catalog", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return calls === 1 ? new Response("boom", { status: 500 }) : json({ data: [{ id: "acme/x", name: "X", pricing: { prompt: "0.000003", completion: "0.000015" } }] })
    }
    const offers = await fetchOpenRouterCatalog(fetchImpl)
    expect(calls).toBe(2)
    expect(offers[0]?.id).toBe("acme/x")
  })

  test("fetchOpenRouterBenchmarks retries a network failure", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      if (calls === 1) throw new TypeError("offline")
      return json({ meta: {}, data: [] })
    }
    const result = await fetchOpenRouterBenchmarks("sk-test", fetchImpl)
    expect(calls).toBe(2)
    expect(result.items).toEqual([])
  })

  test("fetchOpenCodeDocument retries a 503 and returns the document", async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return calls === 1 ? new Response("down", { status: 503 }) : new Response("| Model |", { status: 200 })
    }
    const text = await fetchOpenCodeDocument("https://example.test/doc.mdx", fetchImpl)
    expect(calls).toBe(2)
    expect(text).toBe("| Model |")
  })
})