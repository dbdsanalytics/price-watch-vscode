export type ProviderId = "openrouter" | "opencode-zen" | "opencode-go"

export type ProviderError =
  | { kind: "http"; message: string; status: number }
  | { kind: "network" | "timeout" | "parse" | "empty"; message: string }

export interface ProviderSnapshot {
  provider: ProviderId
  offers: import("./model").ModelOffer[]
  checkedAt: number
  stale: boolean
  error?: ProviderError
  /** Daten sind da, aber verdaechtig — im Gegensatz zu error kein Ausfall. */
  warning?: string
}

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: ProviderError }
