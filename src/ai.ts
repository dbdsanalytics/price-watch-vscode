import type { PriceRow } from "./prices"
import { fmt, summary } from "./prices"

export interface AiResult {
  ok: boolean
  at: number
  text?: string
  error?: string
}

const OR_CHAT = "https://openrouter.ai/api/v1/chat/completions"

export function buildPrompt(or: PriceRow[], zen: PriceRow[], changed: boolean, model = "openrouter/free"): string {
  const system =
    "Du bist ein Preis-Watchdog für KI-Modellpreise. Antworte auf Deutsch in maximal 2 Sätzen, kompakt und informativ. Nenne konkrete Zahlen, wenn relevant."
  const user = `Aktueller Preisstand (Preise pro 1M Tokens, Eingabe/Ausgabe):
${summary(or, "OpenRouter")}
${summary(zen, "OpenCode Zen")}
${changed ? "Preise haben sich geändert." : "Preise unverändert."}
Fasse zusammen, was interessant oder geändert ist.`
  return JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 240,
  })
}

export async function aiComment(
  apiKey: string,
  or: PriceRow[],
  zen: PriceRow[],
  changed: boolean,
  model = "openrouter/free",
): Promise<AiResult> {
  const res = await fetch(OR_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: buildPrompt(or, zen, changed, model),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error("KI HTTP " + res.status)
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = body.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error("Leere KI-Antwort")
  return { ok: true, at: Date.now(), text }
}

export function aiFailure(error: unknown): AiResult {
  return { ok: false, at: Date.now(), error: "KI-Fehler: " + (error instanceof Error ? error.message : String(error)) }
}

export function formatAiText(text: string): string {
  return text.replace(/\u202f/g, " ").replace(/\u00a0/g, " ")
}

export function exampleCost(or: PriceRow[], zen: PriceRow[]): string {
  const all = [...or, ...zen].filter((r) => (r.pt || 0) + (r.ct || 0) > 0)
  if (!all.length) return "–"
  const best = all.slice().sort((a, b) => a.pt + a.ct - (b.pt + b.ct))[0]
  return `${best.id} · ${fmt(best.pt)}/${fmt(best.ct)}$`
}
