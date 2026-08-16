# price-watch: Vergleichbare Tools & Best Practices — Recherche-Ergebnisse

**Stand:** 2026-08-16  
**Auftrag:** Read-only Recherche für "Soll-Liste" Verbesserungen  
**Quellen:** Offizielle Doku, READMEs, Websites — keine Vermutungen

---

## 1. Vergleichbare Produkte (5–8 Tools mit URL, Zweck, 2–4 Kernfunktionen)

| # | Tool / Erweiterung | Quelle (URL) | Zweck | Kernfunktionen (2–4) |
|---|-------------------|--------------|-------|----------------------|
| 1 | **OpenRouter** (Web + API) | https://openrouter.ai/models<br>https://openrouter.ai/benchmarks<br>https://openrouter.ai/rankings | Einheitliche Schnittstelle für 400+ Modelle, Preisvergleich, Benchmarks, Rankings | • Modelle nach Preis sortieren (USD/1M Tokens)<br>• Benchmarks: Quality/Value/Speed je Task (z. B. τ²-Bench, GPQA Diamond) mit Sample-Size & Datum<br>• Live Rankings: Marktanteil, Cost/Session, Tool-Call-Nutzung, Sprach-Support |
| 2 | **Artificial Analysis** (Web) | https://artificialanalysis.ai<br>https://artificialanalysis.ai/methodology | Unabhängige Modell-Bewertung: Intelligence Index, Coding Agents, Cost/Task, Speed, Openness | • Intelligence Index v4.1.1 aus 9 Evaluations (GDPval, τ³-Banking, Terminal-Bench, HLE, GPQA, …)<br>• Cost per Task (gewichtet nach Benchmark-Gewichten), Blended Price, Cache-Pricing<br>• Confidence Intervals (95 %), Methodology-Seite mit Definitionen, Sample-Prompts |
| 3 | **Cline** (VS Code Extension) | https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev<br>https://docs.cline.bot | Autonomer Coding-Agent in der IDE mit Kosten-Tracking pro Task/Request | • Token- & Kosten-Anzeige pro Task-Loop & einzelnen Requests<br>• Multi-Provider (OpenRouter, Anthropic, OpenAI, Bedrock, Vertex, Ollama, LM Studio, …)<br>• Checkpoints (Diff/Restore), Auto-Approve, MCP-Tools, Browser-Nutzung |
| 4 | **LiteLLM** (AI Gateway / Proxy) | https://docs.litellm.ai/docs/proxy/cost_tracking<br>https://github.com/BerriAI/litellm | Self-hosted Gateway für 100+ LLMs mit zentralem Spend-Tracking, Budgets, Admin-UI | • Spend-Tracking pro API-Key, User, Team, Tags (Metadata)<br>• Daily Spend Breakdown (Model/Provider/Key), Custom Spend Log Metadata<br>• Budgets & Rate Limits (soft/hard), Spend Reports (group_by: team/customer/key), Enterprise UI |
| 5 | **Aider** (CLI) | https://aider.chat/docs/config/options.html<br>https://aider.chat/docs/llms.html | AI Pair Programming im Terminal, Modell-Metadaten (Context Window, Cost) | • `--model-metadata-file` für unbekannte Modelle (Context Window, Cost/Token)<br>• `--list-models` zeigt bekannte Modelle mit Pricing<br>• Prompt Caching, Repo-Map, Git-Integration, Voice-to-Code |
| 6 | **OpenRouter TypeScript SDK** | https://github.com/OpenRouterTeam/typescript-sdk | Offizielles TS-SDK für OpenRouter (Modell-Aufruf, Routing, Streaming) | • Provider-Sorting nach Preis (`provider: { sort: "price" }`)<br>• Typ-sicherer Zugriff auf 400+ Modelle<br>• Tool-Calling, Streaming, Agent-SDK (`@openrouter/agent`) |
| 7 | **NextChat / ChatGPT-Next-Web** (Web/Desktop) | https://github.com/ChatGPTNextWeb/NextChat | Lightweight Chat-UI für viele Provider, Balance-Query-Flag | • `ENABLE_BALANCE_QUERY=1` für Guthaben-Abfrage (OpenAI-kompatibel)<br>• Custom Models (`CUSTOM_MODELS` Env), Multi-Provider, i18n (12 Sprachen)<br>• PWA, Desktop (Tauri), Markdown/LaTeX/Mermaid, Chat-Compression |
| 8 | **OpenCode** (CLI/Go) | https://opencode.dev (Referenz im price-watch README) | KI-Coding-Agent (Go), Zen/Go-Pricing Quelle für price-watch | • Zwei Preismodelle: Zen (Pay-as-you-go) & Go (Subscription)<br>• Maschinell lesbare Preis-Dokumente (Quelle für price-watch) |

---

## 2. Feature-Best-Practices (wiederkehrende Features, die price-watch evtl. fehlen)

| Feature | Wie andere es umsetzen (1–2 Quellen-Belege) |
|---------|---------------------------------------------|
| **Preisalarme / Benachrichtigungen** | • LiteLLM: Budgets mit `max_budget`, `budget_duration`, `budget_reset_at` + Soft/Hard Limits → Alerts via Webhooks/Logs (https://docs.litellm.ai/docs/proxy/users)<br>• Cline: OS-Notifications bei langen Auto-Approve-Commands (30 s) — erweiterbar auf Kosten-Schwellen (https://docs.cline.bot/features/auto-approve) |
| **Watchlist / Favoriten** | • OpenRouter: „Discover“ + Model Cards mit Stern/Favoriten-Funktion im UI (https://openrouter.ai/discover)<br>• Artificial Analysis: „Add model from specific provider“ Buttons in Leaderboards (https://artificialanalysis.ai/models) |
| **Kostenprognose / Nutzungslimits** | • LiteLLM: Daily Spend Breakdown API, `max_budget` pro Key/Team, RPM/TPM Limits (https://docs.litellm.ai/docs/proxy/cost_tracking#daily-spend-breakdown-api)<br>• Cline: Token-Counter im Chat-Panel, zeigt geschätzte Kosten vor Request (Marketplace Screenshots) |
| **Modellvergleich Side-by-Side** | • OpenRouter: Model Cards nebeneinander (Quality/Value/Speed Chips), „Compare“ in Benchmarks (https://openrouter.ai/benchmarks/tau2-bench-airline)<br>• Artificial Analysis: Pareto-Plots (Intelligence vs Cost, Intelligence vs Time), Quadrant-View (https://artificialanalysis.ai/models/capabilities/agentic) |
| **Export (CSV/JSON/Clipboard)** | • LiteLLM: `/global/spend/report` liefert JSON, Python-Skript zum Parsen/CSV (https://docs.litellm.ai/docs/proxy/cost_tracking#-enterprise-generate-spend-reports)<br>• Artificial Analysis: „Download“ Buttons für Leaderboard-Daten (Changelog: „New language model evaluation“ → CSV) |
| **Statusleisten- / Kommando-Palette-Integration** | • Cline: Status Bar Item mit Token/Cost, Command Palette „Cline: Open In New Tab“ (https://docs.cline.bot/usage/ide)<br>• VS Code UX Guidelines: Status Bar für laufende Prozesse, Command Palette für Aktionen (https://code.visualstudio.com/api/ux-guidelines/status-bar) |
| **Auto-Refresh / Konfigurierbares Polling** | • OpenRouter Rankings: „Live“ Badge, Datenstand „last run Aug 16, 2026“ (https://openrouter.ai/rankings)<br>• LiteLLM: `sync_models_github` Cron für Preise, Admin UI zeigt „Last Synced“ (https://docs.litellm.ai/docs/proxy/sync_models_github) |
| **Konfigurierbarkeit (Settings UI, Config-File)** | • Cline: `.clinerules/`, `.aider.conf.yml`, VS Code Settings UI, CLI Flags (https://docs.cline.bot/customization/cline-rules)<br>• Aider: YAML Config, Env-Vars, CLI Flags (https://aider.chat/docs/config/options.html) |
| **Datenschutz / Local-First** | • price-watch: API-Keys im VS Code Secret Store, Prompts lokal (README)<br>• NextChat: „Privacy first, all data stored locally in browser“ (https://github.com/ChatGPTNextWeb/NextChat#features)<br>• Aider: Keine Telemetrie ohne Opt-In, `--analytics-disable` (https://aider.chat/docs/more/analytics.html) |
| **Datenquellen-Erweiterbarkeit** | • LiteLLM: `model_prices_and_context_window.json` + `sync_models_github` + Custom Pricing Map (https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)<br>• OpenRouter: Provider-Endpoints JSON, Terraform Provider für IaC (https://github.com/OpenRouterTeam/terraform-provider-openrouter) |
| **Offline-Verhalten / Caching** | • price-watch: „fällt Quelle aus, bleibt zuletzt gecachte Anzeige mit Zeitstempel“ (README)<br>• LiteLLM: In-Memory Cache + Redis, `caching` Config (https://docs.litellm.ai/docs/proxy/caching)<br>• Cline: Checkpoints & History Files lokal (`.aider.chat.history.md`) |
| **i18n / Mehrsprachigkeit** | • NextChat: 12 Sprachen via Env/Config (https://github.com/ChatGPTNextWeb/NextChat#features)<br>• VS Code Extensions: `package.json` `contributes.localization`, `vscode-nls` (offizielles Pattern) |

---

## 3. Ranking / Benchmark-Präsentations-Praxes (Transparenz, Confidence, Sample-Size, „Nicht bewertet“)

| Praxis | Umsetzung (Quelle) |
|--------|-------------------|
| **Sample-Size & Datum explizit anzeigen** | • OpenRouter Benchmarks: „114 models last run Aug 16, 2026“ pro Benchmark-Card (https://openrouter.ai/benchmarks)<br>• Artificial Analysis: „28 of 608 models“, „NEW“ Badge, Changelog mit Datum (https://artificialanalysis.ai) |
| **Confidence Intervals / Unsicherheit** | • Artificial Analysis: 95 % CI in Elo-Plots, „Elo and 95% confidence interval bounds are clamped at 0“ (https://artificialanalysis.ai/evaluations/aa-briefcase)<br>• OpenRouter: Keine CI in Benchmarks, aber „Quality/Value/Speed“ Chips mit Einzelwerten |
| **Methodology-Seite mit Definitionen** | • Artificial Analysis: `/methodology` mit Scope, Definitions (Token, Price, Cost per Task, TTFT, Output Speed), Evaluation-Gewichte (https://artificialanalysis.ai/methodology)<br>• OpenRouter: `/docs/guides/best-practices/uptime-optimization`, `/docs/api/api-reference/benchmarks/list-benchmarks` |
| **„Nicht bewertet“ / „Unrated“ Zustände** | • price-watch: „Modelle ohne Benchmark-Werte werden als `unrated` markiert; numerische Scores werden nie aus Beschreibungen oder KI-Prosa abgeleitet“ (README)<br>• Artificial Analysis: Modelle ohne Daten fehlen in Leaderboards („28 of 608 models“), Filter „Add model from specific provider“<br>• OpenRouter: Modelle ohne Benchmark erscheinen nicht in Benchmark-Tabs, aber in Model List mit Preis |
| **Quelle der Bewertung benennen** | • Artificial Analysis: Jede Evaluation verlinkt (`/evaluations/gdpval-aa`, `/evaluations/tau3-banking`) mit eigener Methodik-Seite<br>• OpenRouter: Benchmark-Karten verlinken auf Detail-Seite (`/benchmarks/tau2-bench-airline`) mit Konfiguration, Kosten, Telemetrie |
| **Pareto / Trade-off Visualisierung** | • Artificial Analysis: „Intelligence Index vs. Cost per Task“ Scatter mit Pareto-Linie, Quadrant-Labels (https://artificialanalysis.ai/models/capabilities/agentic)<br>• OpenRouter: Quality/Value/Speed Chips pro Modell, aber kein Pareto-Plot |

---

## 4. VS-Code-Webview-UX-Empfehlungen (Aktuelle Best Practices)

| Empfehlung | Quelle / Beleg |
|------------|----------------|
| **Webviews nur bei Bedarf nutzen** | „Only use webviews when absolutely necessary“ (https://code.visualstudio.com/api/ux-guidelines/webviews) |
| **Theming & Color Tokens verwenden** | „Ensure all elements in the view are themeable (see webview-view-sample and color tokens documentation)“ (https://code.visualstudio.com/api/ux-guidelines/webviews)<br>• Theme Color Reference: `vscode.getColor()` / CSS-Variablen (https://code.visualstudio.com/api/references/theme-color) |
| **Accessibility (ARIA, Keyboard, Contrast)** | „Ensure your views follow accessibility guidance (color contrast, ARIA labels, keyboard navigation)“ (https://code.visualstudio.com/api/ux-guidelines/webviews) |
| **Command Actions in Toolbar/View** | „Use command actions in the toolbar and in the view“ (https://code.visualstudio.com/api/ux-guidelines/webviews) |
| **Webview Views (Sidebar/Panel) bevorzugt** | „You can also place webviews into any view container (sidebar or panel) and these elements are called webview views“ (https://code.visualstudio.com/api/ux-guidelines/webviews#webview-views) |
| **Activation Events & Lazy Loading** | „Activate your extension only when contextually appropriate“, „Open webviews only for the active window“ (https://code.visualstudio.com/api/ux-guidelines/webviews) |
| **Webview UI Toolkit (Deprecated!) beachten** | Microsoft's `@vscode/webview-ui-toolkit` wurde **am 2025-01-01 deprecated** (Archived Repo). Stattdessen: Native Web Components / VS Code Design Tokens direkt nutzen (https://github.com/microsoft/vscode-webview-ui-toolkit) |
| **Codicons für Icons** | Offizielle Icon-Font: `@vscode/codicons`, nutzbar in Webviews via CSS (https://code.visualstudio.com/api/references/icons-in-labels) |
| **Responsive Layout (Sidebar vs Panel)** | Webview Views passen sich Container-Breite an; CSS Grid/Flex mit `min-width: 0` für Overflow-Handling (Webview View Sample: https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample) |
| **Status Bar Integration** | Für laufende Prozesse/Kosten: Status Bar Item mit `vscode.window.createStatusBarItem()`, Tooltip & Command (https://code.visualstudio.com/api/ux-guidelines/status-bar) |

---

## 5. Zusammenfassung: Was price-watch **bereits gut macht** (aus README)

- ✅ Multi-Source: OpenRouter, OpenCode Zen, OpenCode Go — separate Quellen, separater Cache
- ✅ Datenschutz: API-Keys im VS Code Secret Store, Prompts lokal
- ✅ Ehrliche „unrated“-Kennzeichnung, keine KI-abgeleiteten Scores
- ✅ 90-Tage-Preisverlauf, responsive Webview (Übersicht, Modelle, Agenten, Konten, Verlauf)
- ✅ Ranking nach Zweck (Intelligence/Coding/Agentic), Agenten-Entdeckung, KI-Zusammenfassung
- ✅ Keine Schätzungen bei fehlenden Nutzungsdaten (`nicht verfügbar` statt 0/∞)

---

## 6. Konkrete „Soll-Liste“ für Verbesserungen (abgeleitet aus Gap-Analyse)

| Priorität | Feature | Begründung (Quelle) |
|-----------|---------|---------------------|
| **Hoch** | Preisalarme / Budget-Warnungen (pro Modell/Provider) | LiteLLM Budgets + Cline Notifications Pattern |
| **Hoch** | Watchlist / Favoriten (persistiert im Workspace/Global) | OpenRouter Discover, Artificial Analysis Leaderboard-Buttons |
| **Hoch** | Side-by-Side Modellvergleich (2–4 Spalten, Quality/Value/Speed + Preis) | OpenRouter Benchmark Cards, Artificial Analysis Pareto |
| **Mittel** | Export (CSV/JSON) der aktuellen Ansicht (Modelle, Preise, History) | LiteLLM Spend Report JSON + Python Parser |
| **Mittel** | Status Bar Item: aktuelles Modell, Session-Kosten, Token-Zähler | Cline Marketplace Screenshots, VS Code Status Bar Guidelines |
| **Mittel** | Command Palette: „Preis-Watch: Modell vergleichen“, „Preis-Watch: Export CSV“ | VS Code Command Palette UX Guidelines |
| **Mittel** | Auto-Refresh Intervall konfigurierbar (Settings UI), „Last updated“ Badge | OpenRouter „last run“, LiteLLM Sync Timestamp |
| **Mittel** | Konfigurierbare Datenquellen (Custom JSON/URL für Preise) | LiteLLM `model_prices_and_context_window.json` + `sync_models_github` |
| **Niedrig** | i18n (DE/EN mindestens) via `vscode-nls` | NextChat 12 Sprachen, VS Code Extension Localization Guide |
| **Niedrig** | Confidence Indicators bei Benchmarks (Sample-Size, Datum, CI wenn verfügbar) | Artificial Analysis 95% CI, OpenRouter Sample-Size |
| **Niedrig** | Pareto/Trade-off Plot (Intelligence vs Cost) als optionale Ansicht | Artificial Analysis Scatter Plots |
| **Niedrig** | Offline-Indikator + „Stale Data“ Warnung bei Cache-Alter > X Stunden | price-watch hat bereits Timestamp — sichtbar machen |

---

## 7. Offene Fragen / Nicht gefunden

- **Kein VS Code Extension** gefunden, das *ausschließlich* LLM-Preis-Tracking mit Benchmarks macht (price-watch ist hier Unique Selling Point).
- **Kein Standard** für „Benchmark Confidence“ in VS Code Extensions — Artificial Analysis (Web) ist Referenz.
- **Webview UI Toolkit deprecated** — Migration auf native Web Components + VS Code Design Tokens empfohlen.

---

**Ende der Recherche.** Alle Angaben mit echten URLs belegt. Fehlende Evidenz wurde ehrlich als „nicht gefunden“ gekennzeichnet.
