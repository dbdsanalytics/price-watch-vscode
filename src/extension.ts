import * as vscode from "vscode"
import { readdirSync, readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import type { AccountStatus } from "./accounts/types"
import { fetchOpenRouterAccount, unavailableAccount } from "./accounts/openrouter"
import { fetchOpenCodeGoAccount } from "./accounts/opencode"
import { fetchOpenRouterManagement } from "./accounts/openrouter-management"
import { assessAgent } from "./agents/assessment"
import type { AgentMetadata } from "./agents/discovery"
import { mergeAgents, parseAgentMarkdown, parseOpenCodeConfigAgents, parseOpenCodeDefaultModel } from "./agents/discovery"
import { collectAttention } from "./domain/attention"
import { diffOffers, summarizeChanges, type PriceChange } from "./domain/changes"
import { mergeHistory, migrateLegacyState } from "./domain/history"
import { carryForwardOffers, plausibilityWarning } from "./domain/snapshots"
import { shouldRunAi } from "./domain/ai-schedule"
import { enrichProviderBenchmarks } from "./domain/benchmarks"
import { BENCHMARK_CACHE_KEY, loadBenchmarks } from "./domain/benchmark-cache"
import type { ModelOffer } from "./domain/model"
import type { ProviderSnapshot } from "./domain/provider"
import type { DashboardState } from "./domain/dashboard"
import { sanitizeErrorText } from "./domain/sanitize"
import { fragments, panelHtml } from "./panel/index"
import { aiDashboardSummary, aiFailure } from "./ai"
import { fetchAllProviders } from "./providers/fetch-all"
import { fetchOpenCodeDocument, parseGoDocument, parseZenDocument, requireOffers } from "./providers/opencode-docs"
import { fetchOpenRouterCatalog } from "./providers/openrouter"
import { fetchOpenRouterBenchmarks, type OpenRouterBenchmarkSnapshot } from "./providers/openrouter-benchmarks"

const ZEN_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx"
const GO_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx"
// v0.2.0 persisted invalid OpenRouter sentinel prices. Keep the corrected data
// in a fresh namespace so those values cannot reappear after an update or sync.
const HISTORY_KEY = "priceWatch.history.v3", SNAPSHOT_KEY = "priceWatch.snapshots.v3", AI_LAST_RUN_KEY = "priceWatch.aiLastRun.v1"
const secretKey = (provider: string) => `priceWatch.account.${provider}`
let panel: vscode.WebviewPanel | undefined, statusBar: vscode.StatusBarItem, running: Promise<void> | undefined
let state: DashboardState = { snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 }

function localAgents(): AgentMetadata[] {
  const readScope = (root: string, configNames: string[], fallbackModel = ""): { agents: AgentMetadata[]; defaultModel: string } => {
    let defaultModel = fallbackModel
    const configAgents: AgentMetadata[] = []
    for (const name of configNames) try {
      const file = join(root,name), source = readFileSync(file,"utf8")
      defaultModel = parseOpenCodeDefaultModel(source) || defaultModel
      configAgents.push(...parseOpenCodeConfigAgents(source,file))
    } catch { /* optional or invalid config */ }
    const markdownAgents: AgentMetadata[] = []
    for (const directory of [join(root,"agents"),join(root,"agent")]) try {
      for (const file of readdirSync(directory)) if (file.endsWith(".md")) markdownAgents.push({ ...parseAgentMarkdown(file,readFileSync(join(directory,file),"utf8"),defaultModel), source:join(directory,file) })
    } catch { /* optional directory */ }
    return { agents:mergeAgents(configAgents,markdownAgents), defaultModel }
  }
  const globalRoot = join(homedir(),".config","opencode")
  const globalScope = readScope(globalRoot,["opencode.json","opencode.jsonc"])
  const projectScopes = (vscode.workspace.workspaceFolders ?? []).map((folder)=>readScope(join(folder.uri.fsPath,".opencode"),["opencode.json","opencode.jsonc"],globalScope.defaultModel).agents)
  return mergeAgents(globalScope.agents,...projectScopes)
}

// Das Dokument wird nur beim Oeffnen gesetzt. Ein erneutes Zuweisen von
// webview.html laedt die Seite neu und verwirft Filter, Scrollposition und die
// gewaehlte Ansicht — genau das soll der Fragmenttausch verhindern.
function refreshPanel(): void { if (panel) void panel.webview.postMessage({ type: "fragments", fragments: fragments(state) }) }
function buildPanel(): void { if (panel) panel.webview.html = panelHtml(state) }

// Aus dem aktuellen Zustand neu rechnen. Auch Kontoaenderungen und der
// Fehlerzweig muessen die Kopfzeile auffrischen, sonst erschiene ein knappes
// Guthaben erst nach dem naechsten Preisabruf.
function recomputeAttention(): void {
  const offers = state.snapshots.flatMap((snapshot) => snapshot.offers)
  state.attention = collectAttention({
    assessments: state.agents.map((agent) => assessAgent(agent, offers)),
    accounts: state.accounts, history: state.history, snapshots: state.snapshots, refreshError: state.refreshError,
    jumpPercent: Math.max(1, vscode.workspace.getConfiguration("priceWatch").get<number>("priceJumpPercent", 20)),
  })
}
function updateStatus(): void { statusBar.text = `$(pulse) Preise ${state.snapshots.reduce((sum,s)=>sum+s.offers.length,0)} · ${state.history.length} Δ`; statusBar.tooltip = state.snapshots.map((s)=>`${s.provider}: ${s.error ? s.error.message : `${s.offers.length} Modelle`}`).join("\n"); statusBar.show() }

async function refresh(context: vscode.ExtensionContext, manual: boolean): Promise<void> {
  if (running) return running
  running = (async () => {
    try {
      const previous = state.snapshots.flatMap((snapshot) => snapshot.offers)
      const openRouterKey=await context.secrets.get(secretKey("openrouter"))
      const benchmarkSnapshot=openRouterKey
        ? await loadBenchmarks(context.globalState,openRouterKey,manual,fetchOpenRouterBenchmarks)
        : context.globalState.get<OpenRouterBenchmarkSnapshot>(BENCHMARK_CACHE_KEY) ?? null
      const previousByProvider = new Map(state.snapshots.map((snapshot) => [snapshot.provider, snapshot]))
      // Abrufe sind pro Anbieter isoliert: fetchAllProviders faengt jeden Loader
      // einzeln, ein Ausfall faellt nur den eigenen Snapshot, nie den Zyklus.
      const fetched = await fetchAllProviders({
        openrouter: fetchOpenRouterCatalog,
        "opencode-zen": async () => requireOffers("opencode-zen", parseZenDocument(await fetchOpenCodeDocument(ZEN_URL))),
        "opencode-go": async () => requireOffers("opencode-go", parseGoDocument(await fetchOpenCodeDocument(GO_URL)).offers),
      })
      // Auch die reine Verarbeitung danach darf den Zyklus nie brechen: Jeder
      // Schritt hat einen Rueckfall (letzter Stand bzw. roher Abruf), der
      // Fehler wandert in refreshError und wird als Attention-Streifen und in
      // der StatusBar sichtbar — persistiert und gerendert wird trotzdem.
      let fresh = fetched
      let snapshots = state.snapshots
      let history = state.history
      let changes: PriceChange[] = []
      let agents = state.agents
      let processingError: unknown
      try {
        fresh = enrichProviderBenchmarks(fetched, benchmarkSnapshot).map((snapshot) => {
          // Vor carryForwardOffers: danach stammen die Angebote womoeglich aus
          // dem alten Stand und der Vergleich waere gegen sich selbst.
          const warning = plausibilityWarning(previousByProvider.get(snapshot.provider), snapshot)
          return warning ? { ...snapshot, warning } : snapshot
        })
      } catch (error) { processingError = error }
      try {
        snapshots = carryForwardOffers(state.snapshots, fresh)
        const successful = snapshots.flatMap((snapshot) => snapshot.error ? [] : snapshot.offers)
        changes = diffOffers(previous, successful)
        agents = localAgents()
        history = mergeHistory(state.history, changes)
      } catch (error) { processingError = processingError ?? error }
      state = { ...state, snapshots, history, agents, updatedAt: Date.now(), refreshError: processingError ? sanitizeErrorText(processingError instanceof Error ? processingError.message : String(processingError)) : null }
      const settings = vscode.workspace.getConfiguration("priceWatch")
      const aiKey = openRouterKey
      if (aiKey && shouldRunAi({ lastAt: context.globalState.get<number>(AI_LAST_RUN_KEY) ?? null, now: Date.now(), everyHours: settings.get<number>("aiEveryHours", 6), manual, hasChanges: changes.length > 0 })) {
        // Der KI-Aufruf darf den Zyklus ebenfalls nie abbrechen: aiFailure
        // landet im Zustand, Persistenz und Panel-Update laufen danach weiter.
        try { state.ai = await aiDashboardSummary(aiKey, state.agents, changes, settings.get<string>("aiModel", "openrouter/free")) } catch (error) { state.ai = aiFailure(sanitizeErrorText(error instanceof Error ? error.message : String(error))) }
        await context.globalState.update(AI_LAST_RUN_KEY, Date.now())
      }
      await context.globalState.update(HISTORY_KEY, state.history)
      await context.globalState.update(SNAPSHOT_KEY, snapshots)
      if (changes.length && !manual) void vscode.window.showInformationMessage(`${summarizeChanges(changes)}. Preis-Watch öffnen?`, "Öffnen").then((choice)=>{ if (choice) void vscode.commands.executeCommand("priceWatch.open") })
      recomputeAttention(); updateStatus(); refreshPanel()
    } catch (error) {
      // Providerfehler fangen die Loader ab; was hier ankommt, sind Ausfaelle
      // der Umgebung (Secret-Store, Persistenz, Webview). Auch dann wird der
      // Zustand sichtbar aktualisiert, statt eine Rejection zu verlieren.
      state = { ...state, refreshError: sanitizeErrorText(error instanceof Error ? error.message : String(error)) }
      recomputeAttention(); updateStatus(); refreshPanel()
    }
  })().finally(() => { running = undefined })
  return running
}

// Nur OpenRouter und OpenCode Go bieten eine persoenliche Usage-API. Fuer die
// uebrigen Anbieter laesst sich ein Token nicht verifizieren; das wird benannt,
// statt "Verbunden" zu behaupten.
const VERIFIABLE: Partial<Record<AccountStatus["provider"], (token: string) => Promise<AccountStatus>>> = {
  openrouter: fetchOpenRouterAccount,
  "opencode-go": fetchOpenCodeGoAccount,
}

async function verifyAccount(provider: AccountStatus["provider"], token: string): Promise<AccountStatus> {
  const check = VERIFIABLE[provider]
  return check ? await check(token) : unavailableAccount(provider, "Verbunden · nicht überprüfbar, kein Usage-Endpunkt")
}

async function connectAccount(context: vscode.ExtensionContext): Promise<void> {
  const provider = await vscode.window.showQuickPick(["openrouter", "opencode-zen", "opencode-go", "claude-code"], { title: "Konto ausdrücklich verbinden" })
  if (!provider) return
  const token = await vscode.window.showInputBox({ title: `${provider} Zugang`, password: true, prompt: "Wird nur im VS Code Secret Store dieses Geräts gespeichert" })
  if (!token) return
  let account: AccountStatus
  try { account = await verifyAccount(provider as AccountStatus["provider"], token.trim()) }
  catch (error) { void vscode.window.showErrorMessage(`Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); return }
  await context.secrets.store(secretKey(provider), token.trim())
  state.accounts = [...state.accounts.filter((item)=>item.provider!==provider), account]; recomputeAttention(); refreshPanel()
}

async function disconnectAccount(context: vscode.ExtensionContext): Promise<void> {
  const provider = await vscode.window.showQuickPick(state.accounts.map((account)=>account.provider), { title: "Kontoverbindung entfernen" }); if (!provider) return
  await context.secrets.delete(secretKey(provider)); state.accounts = state.accounts.filter((account)=>account.provider!==provider); recomputeAttention(); refreshPanel()
}

async function connectOpenRouterManagement(context: vscode.ExtensionContext): Promise<void> {
  const token = await vscode.window.showInputBox({ title: "OpenRouter Management Key verbinden", password: true, prompt: "Nur Lesezugriff auf Guthaben und vorhandene API-Key-Verbrauchsdaten. Speicherung ausschließlich im lokalen VS Code Secret Store." })
  if (!token) return
  try {
    const management = await fetchOpenRouterManagement(token.trim())
    await context.secrets.store(secretKey("openrouter-management"), token.trim())
    state.openRouterManagement = management
    recomputeAttention(); refreshPanel()
  } catch (error) {
    void vscode.window.showErrorMessage(`Management-Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function disconnectOpenRouterManagement(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(secretKey("openrouter-management"))
  state.openRouterManagement = null
  recomputeAttention(); refreshPanel()
}

async function refreshConnectedAccounts(context: vscode.ExtensionContext): Promise<void> {
  const providers: AccountStatus["provider"][] = ["openrouter","opencode-zen","opencode-go","claude-code"]
  const accounts: AccountStatus[] = []
  for (const provider of providers) { const token = await context.secrets.get(secretKey(provider)); if (!token) continue; try { accounts.push(await verifyAccount(provider, token)) } catch (error) { accounts.push(unavailableAccount(provider,sanitizeErrorText(error instanceof Error ? error.message : String(error)))) } }
  state.accounts = accounts
  const managementKey = await context.secrets.get(secretKey("openrouter-management"))
  if (!managementKey) state.openRouterManagement = null
  else try { state.openRouterManagement = await fetchOpenRouterManagement(managementKey) }
  catch (error) { state.openRouterManagement = { state: "unavailable", totalCreditsUsd: 0, totalUsageUsd: 0, remainingCreditsUsd: 0, keys: [], message: sanitizeErrorText(error instanceof Error ? error.message : String(error)) } }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Einmalige Ueberfuehrung der v0.1/v0.2-State-Keys in den versionierten
  // v3-Namespace (idempotent ueber priceWatch.migration.v1); Secrets fasst
  // die Migration nicht an, sie laufen ausschliesslich ueber SecretStorage.
  await migrateLegacyState(context.globalState, { historyKey: HISTORY_KEY, snapshotKey: SNAPSHOT_KEY, aiLastRunKey: AI_LAST_RUN_KEY })
  state.history = context.globalState.get<PriceChange[]>(HISTORY_KEY) ?? []
  state.snapshots = context.globalState.get<ProviderSnapshot[]>(SNAPSHOT_KEY) ?? []
  context.globalState.setKeysForSync([HISTORY_KEY])
  await refreshConnectedAccounts(context)
  recomputeAttention()
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100); statusBar.command = "priceWatch.open"; context.subscriptions.push(statusBar)
  context.subscriptions.push(vscode.commands.registerCommand("priceWatch.open", () => { if (!panel) { panel = vscode.window.createWebviewPanel("priceWatch", "Preis-Watch", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true }); panel.onDidDispose(()=>panel=undefined); panel.webview.onDidReceiveMessage((message)=>{ if (message?.type === "connect") void connectAccount(context); if (message?.type === "disconnect") void disconnectAccount(context); if (message?.type === "connect-management") void connectOpenRouterManagement(context); if (message?.type === "disconnect-management") void disconnectOpenRouterManagement(context); if (message?.type === "ready") refreshPanel() }); buildPanel() } else { panel.reveal(); refreshPanel() } }), vscode.commands.registerCommand("priceWatch.refresh", ()=>refresh(context,true)), vscode.commands.registerCommand("priceWatch.setKey", ()=>connectAccount(context)), vscode.commands.registerCommand("priceWatch.connectAccount", ()=>connectAccount(context)), vscode.commands.registerCommand("priceWatch.disconnectAccount", ()=>disconnectAccount(context)), vscode.commands.registerCommand("priceWatch.connectOpenRouterManagement", ()=>connectOpenRouterManagement(context)))
  const hours = Math.max(1, vscode.workspace.getConfiguration("priceWatch").get<number>("checkIntervalHours",1)); const timer = setInterval(()=>void refresh(context,false),hours*3_600_000); context.subscriptions.push({ dispose:()=>clearInterval(timer) })
  updateStatus(); void refresh(context,false)
}

export function deactivate(): void {}
