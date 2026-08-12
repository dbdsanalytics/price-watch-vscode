import * as vscode from "vscode"
import type { PriceState } from "./prices"
import { checkPrices, hashOf, time } from "./prices"
import type { AiResult } from "./ai"
import { aiComment, aiFailure } from "./ai"
import { opencodeModelRefs } from "./config"
import { panelHtml } from "./panel"

const KEY_STORE = "priceWatch.openrouterKey"
const LAST_HASH = "priceWatch.lastHash"
const LAST_AI = "priceWatch.lastAiAt"
const OPEN_COMMAND = "priceWatch.open"

let statusBar: vscode.StatusBarItem
let panel: vscode.WebviewPanel | undefined
let prices: PriceState = { or: [], zen: [], checkAt: null, error: null }
let ai: AiResult | null = null
let checkRunning = false
let timer: NodeJS.Timeout | undefined

function mineIds(): { or: Set<string>; zen: Set<string> } {
  const or = new Set<string>()
  const zen = new Set<string>()
  for (const ref of opencodeModelRefs()) {
    if (ref.provider === "openrouter") or.add(ref.id)
    else if (ref.provider === "opencode" || ref.provider === "opencode-go") zen.add(ref.id)
  }
  return { or, zen }
}

function updateStatusBar() {
  if (!statusBar) return
  const hasData = prices.checkAt !== null
  const status = prices.error ? "!" : hasData ? "OK" : "…"
  const aiState = ai ? (ai.ok ? "KI ok" : "KI fehlt") : "KI -"
  statusBar.text = `$(pulse) Preise ${time(prices.checkAt)} ${status}`
  statusBar.tooltip = [
    "Preis-Watch",
    `Stand: ${time(prices.checkAt)}`,
    `OpenRouter: ${prices.or.length} Modelle`,
    `OpenCode Zen: ${prices.zen.length} Modelle`,
    aiState,
    prices.error ?? "",
    "Befehl: Preis-Watch öffnen",
  ]
    .filter(Boolean)
    .join("\n")
  if (prices.error) statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground")
  else statusBar.backgroundColor = undefined
  statusBar.show()
}

function refreshPanel() {
  if (!panel) return
  const { or, zen } = mineIds()
  panel.webview.html = panelHtml(prices, ai, or, zen)
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.command = OPEN_COMMAND
  context.subscriptions.push(statusBar)
  updateStatusBar()

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_COMMAND, () => {
      if (panel) {
        panel.reveal()
        refreshPanel()
        return
      }
      panel = vscode.window.createWebviewPanel("priceWatch", "Preis-Watch", vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
      })
      panel.onDidDispose(() => {
        panel = undefined
      })
      panel.webview.onDidReceiveMessage((msg: { type: string }) => {
        if (msg.type === "refresh") void runCheck(context, true)
      })
      refreshPanel()
    }),
    vscode.commands.registerCommand("priceWatch.refresh", () => void runCheck(context, true)),
    vscode.commands.registerCommand("priceWatch.setKey", async () => {
      const current = await context.secrets.get(KEY_STORE)
      const input = await vscode.window.showInputBox({
        title: "OpenRouter-API-Key (für die kostenlose Preis-KI)",
        prompt: "https://openrouter.ai/keys — wird sicher in VS Code Secrets gespeichert",
        password: true,
        placeHolder: "sk-or-…",
        value: current ?? "",
      })
      if (input === undefined) return
      if (!input.trim()) {
        await context.secrets.delete(KEY_STORE)
        void vscode.window.showInformationMessage("OpenRouter-Key entfernt — die KI-Analyse ist jetzt deaktiviert.")
        return
      }
      await context.secrets.store(KEY_STORE, input.trim())
      void vscode.window.showInformationMessage("OpenRouter-Key gespeichert. Preis-KI ist aktiv.")
      void runCheck(context, true)
    }),
  )

  void runCheck(context, false)

  const intervalHours = Math.max(1, vscode.workspace.getConfiguration("priceWatch").get<number>("checkIntervalHours", 1))
  timer = setInterval(() => void runCheck(context, false), intervalHours * 60 * 60 * 1000)
  context.subscriptions.push({ dispose: () => clearInterval(timer) })
}

async function runCheck(context: vscode.ExtensionContext, manual: boolean): Promise<void> {
  if (checkRunning) return
  checkRunning = true
  const prevHash = context.globalState.get<string>(LAST_HASH) ?? null
  try {
    prices = await checkPrices()
    const nextHash = hashOf(prices.or, prices.zen)

    if (prevHash !== null && prevHash !== nextHash) {
      void vscode.window.showInformationMessage(
        "Preisänderung bei OpenRouter/OpenCode Zen — öffne den Preis-Watch für Details.",
      )
    }
    await context.globalState.update(LAST_HASH, nextHash)

    const config = vscode.workspace.getConfiguration("priceWatch")
    const key = await context.secrets.get(KEY_STORE)
    const lastAi = (context.globalState.get<number>(LAST_AI) ?? 0)
    const aiEveryMs = Math.max(1, config.get<number>("aiEveryHours", 6)) * 60 * 60 * 1000
    const aiDue = Date.now() - lastAi >= aiEveryMs
    const changed = prevHash !== null && prevHash !== nextHash
    if (key && (aiDue || changed || manual)) {
      try {
        ai = await aiComment(key, prices.or, prices.zen, changed, config.get<string>("aiModel", "openrouter/free"))
      } catch (error) {
        ai = aiFailure(error)
      }
      await context.globalState.update(LAST_AI, ai.at)
    }
  } catch (error) {
    prices.error = "Check fehlgeschlagen: " + (error instanceof Error ? error.message : String(error))
  } finally {
    checkRunning = false
  }
  updateStatusBar()
  refreshPanel()
}

export function deactivate(): void {
  clearInterval(timer)
}
