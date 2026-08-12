import type { PriceRow, PriceState } from "./prices"
import { fmt, klass, time } from "./prices"
import type { AiResult } from "./ai"
import { formatAiText } from "./ai"

const CSS = `
:root { color-scheme: dark; }
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 16px 20px; }
h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
.meta { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
.ok { color: var(--vscode-testing-iconPassed); }
.err { color: var(--vscode-testing-iconFailed); }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
th { text-align: left; color: var(--vscode-descriptionForeground); font-weight: 600; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 13px; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.mine { color: var(--vscode-charts-blue); }
.badge { display: inline-block; padding: 1px 8px; border-radius: 8px; font-size: 11px; }
.badge.free { background: rgba(46,160,67,.18); color: var(--vscode-testing-iconPassed); }
.badge.cheap { background: rgba(56,139,253,.18); color: var(--vscode-charts-blue); }
.badge.mid { background: rgba(209,154,102,.18); color: var(--vscode-charts-yellow); }
.badge.pricey { background: rgba(248,81,73,.18); color: var(--vscode-testing-iconFailed); }
.ai { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; }
.ai b { display: block; margin-bottom: 4px; }
.toolbar { margin-bottom: 12px; }
button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
`

function badgeOf(total: number): string {
  if (total === 0) return '<span class="badge free">kostenlos</span>'
  if (total < 0.5) return '<span class="badge cheap">billig</span>'
  if (total < 2) return '<span class="badge mid">mittel</span>'
  return '<span class="badge pricey">Premium</span>'
}

function table(title: string, rows: PriceRow[], mine: Set<string>): string {
  if (!rows.length) return `<h2>${title}</h2><p class="meta">keine Daten</p>`
  const sorted = rows.slice().sort((a, b) => a.pt + a.ct - (b.pt + b.ct))
  const body = sorted
    .map((r) => {
      const own = mine.has(r.id) ? ' <span class="mine">●</span>' : ""
      const k = klass(r.pt, r.ct)
      return `<tr><td>${esc(r.name)}${own}</td><td class="num">${fmt(r.pt)} $</td><td class="num">${fmt(r.ct)} $</td><td>${badgeOf(k.label === "kostenlos" ? 0 : r.pt + r.ct)}</td></tr>`
    })
    .join("")
  return `<h2>${esc(title)} <span class="meta">(${rows.length})</span></h2>
<table><thead><tr><th>Modell</th><th class="num">Eingabe / 1M</th><th class="num">Ausgabe / 1M</th><th>Klasse</th></tr></thead><tbody>${body}</tbody></table>`
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function panelHtml(state: PriceState, ai: AiResult | null, mineOr: Set<string>, mineZen: Set<string>): string {
  const orFree = state.or.filter((r) => (r.pt || 0) + (r.ct || 0) === 0).length
  const zenFree = state.zen.filter((r) => (r.pt || 0) + (r.ct || 0) === 0).length

  const aiBox = ai
    ? ai.ok && ai.text
      ? `<div class="ai"><b class="ok">KI-Einschätzung (kostenlos via OpenRouter Free)</b>${esc(formatAiText(ai.text))}</div>`
      : `<div class="ai"><b class="err">KI nicht verfügbar</b>${esc(ai.error ?? "unbekannter Fehler")}</div>`
    : '<div class="ai"><b>KI-Einschätzung</b>wird beim nächsten Check erstellt …</div>'

  const status = state.error
    ? `<span class="err">${esc(state.error)}</span>`
    : `<span class="ok">OK</span>`

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<h1>Preis-Watch</h1>
<div class="meta">Stand ${time(state.checkAt)} · OpenRouter ${state.or.length} Modelle (${orFree} kostenlos) · OpenCode Zen ${state.zen.length} Modelle (${zenFree} kostenlos) · ${status}<br>
<span class="meta">● = in deiner opencode-Konfiguration genutzt · Aktualisierung: stündlich · esc schließt</span></div>
<div class="toolbar"><button id="refresh">Jetzt aktualisieren</button></div>
${aiBox}
${table("OpenRouter (deine Modelle)", state.or.filter((r) => mineOr.has(r.id)), mineOr)}
${table("OpenRouter (günstigste bezahlt)", cheapest(state.or), mineOr)}
${table("OpenCode Zen (deine Modelle)", state.zen.filter((r) => mineZen.has(r.id)), mineZen)}
${table("OpenCode Zen (günstigste bezahlt)", cheapest(state.zen), mineZen)}
<script>
const vscode = acquireVsCodeApi();
document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
</script>
</body></html>`
}

function cheapest(rows: PriceRow[]): PriceRow[] {
  return rows
    .filter((r) => (r.pt || 0) + (r.ct || 0) > 0)
    .sort((a, b) => a.pt + a.ct - (b.pt + b.ct))
    .slice(0, 8)
}
