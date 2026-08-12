import type { AgentMetadata } from "./agents/discovery"
import { metadataPayload } from "./agents/discovery"
import type { PriceChange } from "./domain/changes"

export interface AiResult {
  ok: boolean
  at: number
  text?: string
  error?: string
}

const OR_CHAT = "https://openrouter.ai/api/v1/chat/completions"

export function aiFailure(error: unknown): AiResult {
  return { ok: false, at: Date.now(), error: "KI-Fehler: " + (error instanceof Error ? error.message : String(error)) }
}

export async function aiDashboardSummary(apiKey: string, agents: AgentMetadata[], changes: PriceChange[], model = "openrouter/free"): Promise<AiResult> {
  const payload = {
    model,
    messages: [
      { role: "system", content: "Du fasst Modellpreis- und Agenten-Metadaten auf Deutsch in maximal zwei kurzen Sätzen zusammen. Erfinde keine Benchmarks oder Kontingente." },
      { role: "user", content: JSON.stringify({ agents: agents.map(metadataPayload), changes: changes.slice(0, 20) }) },
    ],
    max_tokens: 180,
  }
  const response = await fetch(OR_CHAT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`KI HTTP ${response.status}`)
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const text = body.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error("Leere KI-Antwort")
  return { ok: true, at: Date.now(), text }
}
