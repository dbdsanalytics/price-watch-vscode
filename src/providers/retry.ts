/**
 * Minimaler, wiederverwendbarer Fetch-Retry. Keine Endlosschleifen: hoechstens
 * `retries` Wiederholungen (Standard 1), kurzer Backoff (250-500 ms) bei
 * Netzwerkfehlern, Respekt des Retry-After-Headers bei 408/429/5xx. Ein
 * bereits abgebrochenes Signal (z. B. AbortSignal.timeout) wird nie erneut
 * versucht — ein Timeout ist kein Flackern, sondern ein Abbruch.
 */

export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export const RETRY_DELAY_MS = 250
export const RETRY_MAX_DELAY_MS = 500

/** Nur der aufrufbare Teil von fetch — Buns `typeof fetch` verlangt zusaetzlich statische Helfer. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface FetchWithRetryOptions {
  /** Zusaetzliche Versuche nach dem ersten — Standard 1, also maximal 2 Requests. */
  retries?: number
  /** Abweichende Fetch-Implementierung fuer Tests. */
  fetchImpl?: FetchLike
  /** Uhr fuer Retry-After als HTTP-Datum — Standard Date.now. */
  now?: () => number
  /** Schlaefunktion fuer Tests, die keine echten Timer nutzen. */
  sleep?: (ms: number) => Promise<void>
}

const sleepDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Retry-After in Millisekunden: Sekundenzahl oder HTTP-Datum, sonst undefined. */
export function retryAfterMs(response: Response, now = Date.now()): number | undefined {
  const header = response.headers.get("retry-after")
  if (!header) return undefined
  const seconds = Number.parseInt(header, 10)
  if (Number.isFinite(seconds) && String(seconds) === header.trim() && seconds >= 0) return seconds * 1000
  const date = Date.parse(header)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export async function fetchWithRetry(input: string | URL | Request, init?: RequestInit, options: FetchWithRetryOptions = {}): Promise<Response> {
  const retries = Math.max(0, options.retries ?? 1)
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const sleep = options.sleep ?? sleepDefault
  const signal = init?.signal
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await doFetch(input, init)
      if (attempt < retries && RETRYABLE_STATUS.has(response.status)) {
        // 408/429/5xx: erst der Retry-After-Header des Servers, sonst kurzer Backoff.
        // Retry-After wird bewusst OHNE Obergrenze respektiert: Der Wert ist die
        // Server-Kontrolle fuer Ratelimits. Ein grosser Wert blockiert den
        // Refresh-Zyklus, aber der laeuft asynchron — bewusste Entscheidung.
        const delay = retryAfterMs(response, options.now?.() ?? Date.now())
        await sleep(delay ?? Math.min(RETRY_MAX_DELAY_MS, RETRY_DELAY_MS * 2 ** attempt))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt >= retries || signal?.aborted) throw error
      await sleep(Math.min(RETRY_MAX_DELAY_MS, RETRY_DELAY_MS * 2 ** attempt))
    }
  }
  throw lastError
}