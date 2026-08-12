import * as vscode from "vscode"
import { readdirSync, readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import type { AccountStatus } from "./accounts/types"
import { fetchOpenRouterAccount, unavailableAccount } from "./accounts/openrouter"
import { fetchOpenRouterManagement } from "./accounts/openrouter-management"
import type { AgentMetadata } from "./agents/discovery"
import { parseAgentMarkdown } from "./agents/discovery"
import { diffOffers, summarizeChanges, type PriceChange } from "./domain/changes"
import { mergeHistory } from "./domain/history"
import type { ModelOffer } from "./domain/model"
import type { ProviderSnapshot } from "./domain/provider"
import { panelHtml, type DashboardState } from "./panel"
import { aiDashboardSummary, aiFailure } from "./ai"
import { fetchAllProviders } from "./providers/fetch-all"
import { fetchOpenCodeDocument, parseGoDocument, parseZenDocument } from "./providers/opencode-docs"
import { fetchOpenRouterCatalog } from "./providers/openrouter"

const ZEN_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx"
const GO_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx"
// v0.2.0 persisted invalid OpenRouter sentinel prices. Keep the corrected data
// in a fresh namespace so those values cannot reappear after an update or sync.
const HISTORY_KEY = "priceWatch.history.v3", SNAPSHOT_KEY = "priceWatch.snapshots.v3"
const secretKey = (provider: string) => `priceWatch.account.${provider}`
let panel: vscode.WebviewPanel | undefined, statusBar: vscode.StatusBarItem, running: Promise<void> | undefined
let state: DashboardState = { snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 }

function localAgents(): AgentMetadata[] {
  const directories = [join(homedir(), ".config", "opencode", "agents"), join(homedir(), ".config", "opencode", "agent"), ...(vscode.workspace.workspaceFolders ?? []).flatMap((folder) => [join(folder.uri.fsPath, ".opencode", "agents"), join(folder.uri.fsPath, ".opencode", "agent")])]
  const agents: AgentMetadata[] = []
  for (const directory of directories) try { for (const file of readdirSync(directory)) if (file.endsWith(".md")) agents.push({ ...parseAgentMarkdown(file, readFileSync(join(directory, file), "utf8")), source: join(directory, file) }) } catch { /* optional directory */ }
  return agents
}

function refreshPanel(): void { if (panel) panel.webview.html = panelHtml(state) }
function updateStatus(): void { statusBar.text = `$(pulse) Preise ${state.snapshots.reduce((sum,s)=>sum+s.offers.length,0)} · ${state.history.length} Δ`; statusBar.tooltip = state.snapshots.map((s)=>`${s.provider}: ${s.error ? s.error.message : `${s.offers.length} Modelle`}`).join("\n"); statusBar.show() }

async function refresh(context: vscode.ExtensionContext, manual: boolean): Promise<void> {
  if (running) return running
  running = (async () => {
    const previous = state.snapshots.flatMap((snapshot) => snapshot.offers)
    const snapshots = await fetchAllProviders({
      openrouter: fetchOpenRouterCatalog,
      "opencode-zen": async () => parseZenDocument(await fetchOpenCodeDocument(ZEN_URL)),
      "opencode-go": async () => parseGoDocument(await fetchOpenCodeDocument(GO_URL)).offers,
    })
    const successful = snapshots.flatMap((snapshot) => snapshot.error ? [] : snapshot.offers)
    const changes = diffOffers(previous, successful)
    state = { ...state, snapshots, history: mergeHistory(state.history, changes), agents: localAgents(), updatedAt: Date.now() }
    const aiKey = await context.secrets.get(secretKey("openrouter"))
    if (aiKey && (manual || changes.length > 0)) try { state.ai = await aiDashboardSummary(aiKey, state.agents, changes, vscode.workspace.getConfiguration("priceWatch").get<string>("aiModel", "openrouter/free")) } catch (error) { state.ai = aiFailure(error) }
    await context.globalState.update(HISTORY_KEY, state.history)
    await context.globalState.update(SNAPSHOT_KEY, snapshots)
    if (changes.length && !manual) void vscode.window.showInformationMessage(`${summarizeChanges(changes)}. Preis-Watch öffnen?`, "Öffnen").then((choice)=>{ if (choice) void vscode.commands.executeCommand("priceWatch.open") })
    updateStatus(); refreshPanel()
  })().finally(() => { running = undefined })
  return running
}

async function connectAccount(context: vscode.ExtensionContext): Promise<void> {
  const provider = await vscode.window.showQuickPick(["openrouter", "opencode-zen", "opencode-go", "claude-code"], { title: "Konto ausdrücklich verbinden" })
  if (!provider) return
  const token = await vscode.window.showInputBox({ title: `${provider} Zugang`, password: true, prompt: "Wird nur im VS Code Secret Store dieses Geräts gespeichert" })
  if (!token) return
  await context.secrets.store(secretKey(provider), token.trim())
  let account: AccountStatus
  try { account = provider === "openrouter" ? await fetchOpenRouterAccount(token.trim()) : unavailableAccount(provider as AccountStatus["provider"], "Verbunden · persönliche Usage-API nicht verfügbar") }
  catch (error) { await context.secrets.delete(secretKey(provider)); void vscode.window.showErrorMessage(`Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); return }
  state.accounts = [...state.accounts.filter((item)=>item.provider!==provider), account]; refreshPanel()
}

async function disconnectAccount(context: vscode.ExtensionContext): Promise<void> {
  const provider = await vscode.window.showQuickPick(state.accounts.map((account)=>account.provider), { title: "Kontoverbindung entfernen" }); if (!provider) return
  await context.secrets.delete(secretKey(provider)); state.accounts = state.accounts.filter((account)=>account.provider!==provider); refreshPanel()
}

async function connectOpenRouterManagement(context: vscode.ExtensionContext): Promise<void> {
  const token = await vscode.window.showInputBox({ title: "OpenRouter Management Key verbinden", password: true, prompt: "Nur Lesezugriff auf Guthaben und vorhandene API-Key-Verbrauchsdaten. Speicherung ausschließlich im lokalen VS Code Secret Store." })
  if (!token) return
  try {
    const management = await fetchOpenRouterManagement(token.trim())
    await context.secrets.store(secretKey("openrouter-management"), token.trim())
    state.openRouterManagement = management
    refreshPanel()
  } catch (error) {
    void vscode.window.showErrorMessage(`Management-Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function disconnectOpenRouterManagement(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(secretKey("openrouter-management"))
  state.openRouterManagement = null
  refreshPanel()
}

async function refreshConnectedAccounts(context: vscode.ExtensionContext): Promise<void> {
  const providers: AccountStatus["provider"][] = ["openrouter","opencode-zen","opencode-go","claude-code"]
  const accounts: AccountStatus[] = []
  for (const provider of providers) { const token = await context.secrets.get(secretKey(provider)); if (!token) continue; try { accounts.push(provider === "openrouter" ? await fetchOpenRouterAccount(token) : unavailableAccount(provider,"Verbunden · persönliche Usage-API nicht verfügbar")) } catch (error) { accounts.push(unavailableAccount(provider,error instanceof Error ? error.message : String(error))) } }
  state.accounts = accounts
  const managementKey = await context.secrets.get(secretKey("openrouter-management"))
  if (!managementKey) state.openRouterManagement = null
  else try { state.openRouterManagement = await fetchOpenRouterManagement(managementKey) }
  catch (error) { state.openRouterManagement = { state: "unavailable", totalCreditsUsd: 0, totalUsageUsd: 0, remainingCreditsUsd: 0, keys: [], message: error instanceof Error ? error.message : String(error) } }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  state.history = context.globalState.get<PriceChange[]>(HISTORY_KEY) ?? []
  state.snapshots = context.globalState.get<ProviderSnapshot[]>(SNAPSHOT_KEY) ?? []
  context.globalState.setKeysForSync([HISTORY_KEY])
  await refreshConnectedAccounts(context)
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100); statusBar.command = "priceWatch.open"; context.subscriptions.push(statusBar)
  context.subscriptions.push(vscode.commands.registerCommand("priceWatch.open", () => { if (!panel) { panel = vscode.window.createWebviewPanel("priceWatch", "Preis-Watch", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true }); panel.onDidDispose(()=>panel=undefined); panel.webview.onDidReceiveMessage((message)=>{ if (message?.type === "connect") void connectAccount(context); if (message?.type === "disconnect") void disconnectAccount(context); if (message?.type === "connect-management") void connectOpenRouterManagement(context); if (message?.type === "disconnect-management") void disconnectOpenRouterManagement(context) }) } else panel.reveal(); refreshPanel() }), vscode.commands.registerCommand("priceWatch.refresh", ()=>refresh(context,true)), vscode.commands.registerCommand("priceWatch.setKey", ()=>connectAccount(context)), vscode.commands.registerCommand("priceWatch.connectAccount", ()=>connectAccount(context)), vscode.commands.registerCommand("priceWatch.disconnectAccount", ()=>disconnectAccount(context)), vscode.commands.registerCommand("priceWatch.connectOpenRouterManagement", ()=>connectOpenRouterManagement(context)))
  const hours = Math.max(1, vscode.workspace.getConfiguration("priceWatch").get<number>("checkIntervalHours",1)); const timer = setInterval(()=>void refresh(context,false),hours*3_600_000); context.subscriptions.push({ dispose:()=>clearInterval(timer) })
  updateStatus(); void refresh(context,false)
}

export function deactivate(): void {}
