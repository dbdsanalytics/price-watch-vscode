export interface PriceRow {
  id: string
  name: string
  pt: number
  ct: number
}

export interface PriceState {
  or: PriceRow[]
  zen: PriceRow[]
  checkAt: number | null
  error: string | null
}

export const OR_API = "https://openrouter.ai/api/v1/models"
export const ZEN_MDX =
  "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx"

export function norm(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/\(.*\)/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function toUsd(cell: string | undefined): number {
  const v = String(cell ?? "").trim()
  if (!v || v === "-") return 0
  const n = parseFloat(v.replace("$", ""))
  return Number.isNaN(n) ? 0 : n
}

export function fmt(v: number): string {
  const n = Number(v) || 0
  if (n === 0) return "0"
  if (n < 0.01) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
  if (n < 1) return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
  if (n < 100) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return String(Math.round(n))
}

export interface PriceClass {
  label: string
  color: "success" | "info" | "warning" | "error" | "muted"
}

export function klass(pt: number, ct: number): PriceClass {
  const total = (pt || 0) + (ct || 0)
  if (total === 0) return { label: "kostenlos", color: "success" }
  if (total < 0.5) return { label: "billig", color: "info" }
  if (total <= 2) return { label: "mittel", color: "warning" }
  return { label: "Premium", color: "error" }
}

export function time(ts: number | null): string {
  if (!ts) return "–"
  const d = new Date(ts)
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}

const splitCells = (line: string): string[] =>
  line
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean)

export function parseZenMdx(mdx: string): PriceRow[] {
  const idByName = new Map<string, string>()
  for (const line of mdx.split("\n")) {
    if (!line.startsWith("|")) continue
    const cells = splitCells(line)
    if (cells.length < 2 || cells[0] === "Model" || /^-+$/.test(cells[0])) continue
    if (/^https?:\/\//.test(String(cells[2]).replace(/`/g, ""))) {
      idByName.set(norm(cells[0]), cells[1])
    }
  }

  const rows: PriceRow[] = []
  let inPricing = false
  for (const line of mdx.split("\n")) {
    if (line.startsWith("## Pricing")) {
      inPricing = true
      continue
    }
    if (!inPricing) continue
    if (line.startsWith("## ") && !line.startsWith("## Pricing")) break
    if (!line.startsWith("|")) continue
    const cells = splitCells(line)
    if (cells.length < 3 || cells[0] === "Model" || /^-+$/.test(cells[0])) continue
    if (cells[1].toLowerCase().includes("deprecation")) break
    const id = idByName.get(norm(cells[0]))
    if (!id) continue
    rows.push({ id, name: cells[0], pt: toUsd(cells[1]), ct: toUsd(cells[2]) })
  }
  // Bei mehreren Varianten (z. B. ≤/> 272K Tokens) die günstigste Zeile je Modell behalten
  const best = new Map<string, PriceRow>()
  for (const r of rows) {
    const cur = best.get(r.id)
    if (!cur || r.pt + r.ct < cur.pt + cur.ct) best.set(r.id, r)
  }
  return [...best.values()]
}

export async function fetchOpenRouter(): Promise<PriceRow[]> {
  const res = await fetch(OR_API, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error("OpenRouter API: HTTP " + res.status)
  const body = (await res.json()) as { data?: Array<{ id: string; name: string; pricing?: Record<string, string> }> }
  const list: PriceRow[] = []
  for (const m of body.data ?? []) {
    const p = m.pricing ?? {}
    list.push({
      id: m.id,
      name: m.name,
      pt: parseFloat(p.prompt ?? "") || 0,
      ct: parseFloat(p.completion ?? "") || 0,
    })
  }
  return list
}

export async function fetchZen(): Promise<PriceRow[]> {
  const res = await fetch(ZEN_MDX, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error("OpenCode-Zen-Doku: HTTP " + res.status)
  const rows = parseZenMdx(await res.text())
  if (rows.length === 0) throw new Error("Zen-Preisliste leer (Doku-Format geändert?)")
  return rows
}

export function hashOf(or: PriceRow[], zen: PriceRow[]): string {
  const parts: string[] = []
  for (const r of or) parts.push(`${r.id}:${r.pt}/${r.ct}`)
  for (const r of zen) parts.push(`${r.id}:${r.pt}/${r.ct}`)
  return parts.join("|")
}

export function summary(rows: PriceRow[], label: string): string {
  if (!rows.length) return label + ": keine Daten"
  const free = rows.filter((r) => (r.pt || 0) + (r.ct || 0) === 0).length
  const paid = rows
    .filter((r) => (r.pt || 0) + (r.ct || 0) > 0)
    .sort((a, b) => a.pt + a.ct - (b.pt + b.ct))
    .slice(0, 3)
    .map((r) => `${r.id} (${fmt(r.pt)}/${fmt(r.ct)}$)`)
  return `${label}: ${rows.length} Modelle, ${free} kostenlos; günstigste bezahlt: ${paid.join(", ") || "–"}`
}

export async function checkPrices(): Promise<PriceState> {
  const [or, zen] = await Promise.all([fetchOpenRouter(), fetchZen()])
  return { or, zen, checkAt: Date.now(), error: null }
}
