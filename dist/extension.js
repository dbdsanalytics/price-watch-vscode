"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");

// src/accounts/openrouter.ts
function unavailableAccount(provider, message = "Nicht automatisch abrufbar") {
  return { provider, state: "unavailable", message };
}
function parseOpenRouterKeyStatus(body) {
  const remaining = body.data.limit_remaining ?? void 0;
  return { provider: "openrouter", state: remaining === 0 ? "exhausted" : remaining !== void 0 && body.data.limit && remaining / body.data.limit < 0.15 ? "low" : "available", label: body.data.label, remainingUsd: remaining, dailyUsd: body.data.usage_daily, weeklyUsd: body.data.usage_weekly, monthlyUsd: body.data.usage_monthly };
}
async function fetchOpenRouterAccount(key) {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw new Error(`OpenRouter-Konto HTTP ${response.status}`);
  return parseOpenRouterKeyStatus(await response.json());
}

// src/agents/discovery.ts
function parseAgentMarkdown(filename, source) {
  const front = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const header = front?.[1] ?? "";
  const prompt = front?.[2] ?? source;
  const value = (key) => header.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
  const tools = value("tools").replace(/^\[|\]$/g, "").split(",").map((tool) => tool.trim()).filter(Boolean);
  return { name: filename.replace(/\.(md|jsonc?)$/, ""), description: value("description"), model: value("model"), tools, prompt };
}
function metadataPayload(agent) {
  return { name: agent.name, description: agent.description, model: agent.model, tools: agent.tools };
}

// src/domain/model.ts
function usdPerMillion(value) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed * 1e6 : 0;
}
function offerKey(offer) {
  return `${offer.provider}:${offer.id}`;
}
function isFreePricing(pricing) {
  return pricing.input === 0 && pricing.output === 0 && (pricing.request ?? 0) === 0;
}

// src/domain/changes.ts
function diffOffers(previous, next, at = Date.now()) {
  const before = new Map(previous.map((offer) => [offerKey(offer), offer]));
  const dimensions = ["input", "output", "cacheRead", "cacheWrite", "request"];
  const changes = [];
  for (const offer of next) {
    const old = before.get(offerKey(offer));
    if (!old) continue;
    for (const dimension of dimensions) {
      const prior = old.pricing[dimension] ?? 0;
      const current = offer.pricing[dimension] ?? 0;
      if (prior === current) continue;
      changes.push({ id: `${offerKey(offer)}:${dimension}:${at}:${prior}:${current}`, at, provider: offer.provider, modelId: offer.id, dimension, previous: prior, current, percent: prior === 0 ? null : (current - prior) / prior * 100 });
    }
  }
  return changes;
}
function summarizeChanges(changes) {
  const providers = new Set(changes.map((change) => change.provider)).size;
  return `${changes.length} Preis\xE4nderungen bei ${providers} Anbieter${providers === 1 ? "" : "n"}`;
}

// src/domain/history.ts
function mergeHistory(local, incoming, now = Date.now()) {
  const cutoff = now - 90 * 864e5;
  const merged = /* @__PURE__ */ new Map();
  for (const event of [...local, ...incoming]) if (event.at >= cutoff) merged.set(event.id, event);
  return [...merged.values()].sort((a, b) => b.at - a.at);
}

// src/domain/ranking.ts
function rankOffers(offers2, purpose, priceMode) {
  return offers2.filter((offer) => offer.capabilities.purposes.includes(purpose)).filter((offer) => {
    const free = offer.pricing.input + offer.pricing.output === 0;
    return priceMode === "all" || (priceMode === "free" ? free : !free);
  }).map((offer) => {
    const score = purpose === "coding" ? offer.benchmarks?.coding ?? null : offer.benchmarks?.intelligence ?? null;
    return { offer, score, rating: score === null ? "unrated" : "scored", reason: score === null ? "Noch kein belastbarer Benchmark" : `${offer.benchmarks?.source}: ${score}` };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.offer.pricing.input + a.offer.pricing.output - (b.offer.pricing.input + b.offer.pricing.output));
}

// src/agents/assessment.ts
function assessAgent(agent, offers2) {
  const current = offers2.find((offer) => agent.model.endsWith(offer.id));
  if (!current) return { agent, status: "unknown", reason: "Aktuelles Modell nicht im Katalog" };
  if (current.deprecatedAt) return { agent, status: "deprecated", reason: `Abgek\xFCndigt: ${current.deprecatedAt}` };
  const codingAgent = /code|review|build|debug|develop/i.test(`${agent.name} ${agent.description}`);
  if (codingAgent && !current.capabilities.purposes.includes("coding")) return { agent, status: "unsuitable", reason: "Keine belastbaren Coding-F\xE4higkeiten ausgewiesen" };
  const currentCost = current.pricing.input + current.pricing.output;
  const alternative = offers2.filter((offer) => offer.id !== current.id && (!codingAgent || offer.capabilities.purposes.includes("coding"))).filter((offer) => offer.pricing.input + offer.pricing.output < currentCost * 0.7).sort((a, b) => (b.benchmarks?.coding ?? 0) - (a.benchmarks?.coding ?? 0))[0];
  return alternative ? { agent, status: "alternative-available", reason: "Mindestens 30 % g\xFCnstigere Alternative verf\xFCgbar", alternative } : { agent, status: "suitable", reason: "F\xE4higkeiten und Preis weiterhin passend" };
}

// src/panel.ts
var import_crypto = require("crypto");
var esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var offers = (state2) => state2.snapshots.flatMap((snapshot) => snapshot.offers);
function panelHtml(state2) {
  const nonce = (0, import_crypto.randomBytes)(16).toString("base64");
  const all = offers(state2), free = all.filter((offer) => isFreePricing(offer.pricing)).length;
  const modelRows = all.slice().sort((a, b) => a.pricing.input + a.pricing.output - (b.pricing.input + b.pricing.output)).map((offer) => `<tr data-model="${esc(`${offer.name} ${offer.provider} ${offer.capabilities.purposes.join(" ")}`.toLowerCase())}" data-provider="${esc(offer.provider)}" data-price="${isFreePricing(offer.pricing) ? "free" : "paid"}"><td>${esc(offer.name)}</td><td>${esc(offer.provider)}</td><td>${offer.pricing.input}</td><td>${offer.pricing.output}</td><td>${esc(offer.capabilities.purposes.join(", "))}</td></tr>`).join("");
  const assessments = state2.agents.map((agent) => assessAgent(agent, all));
  const agents = assessments.length ? assessments.map(({ agent, status, reason, alternative }) => `<div class="row"><span>${esc(agent.name)} \xB7 ${esc(agent.model)}<small class="muted"> ${esc(reason)}</small></span><b>${esc(status)}${alternative ? ` \u2192 ${esc(alternative.name)}` : ""}</b></div>`).join("") : `<div class="muted">Keine Agenten erkannt</div>`;
  const accounts = state2.accounts.map((account) => `<div class="row"><span>${esc(account.provider)}</span><b>${esc(account.remainingUsd ?? account.message ?? account.state)}</b></div>`).join("") + `<div><button data-action="connect">Konto verbinden</button> <button data-action="disconnect">Verbindung entfernen</button></div>`;
  const ranks = (items) => items.length ? items.slice(0, 3).map((item, index) => `${index + 1}. ${esc(item.offer.name)}${item.score === null ? " \xB7 noch nicht bewertet" : ` \xB7 ${item.score}`}`).join("<br>") : "Keine bewertbaren Modelle";
  const purposeLabels = { coding: "Coding", language: "Sprache", reasoning: "Reasoning", vision: "Vision", tools: "Tools", allround: "Allround" };
  const rankingSections = Object.entries(purposeLabels).map(([purpose, label], index) => `<details${index === 0 ? " open" : ""}><summary>${label}</summary><div class="row"><span><b>Kostenlos</b><br>${ranks(rankOffers(all, purpose, "free"))}</span><span><b>Bezahlt</b><br>${ranks(rankOffers(all, purpose, "paid"))}</span></div></details>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);margin:0;padding:10px;background:linear-gradient(145deg,var(--vscode-editor-background),color-mix(in srgb,var(--vscode-editor-background) 88%,#4c1d95))}.nav{display:flex;gap:16px;align-items:center;border-bottom:1px solid var(--vscode-panel-border);padding:3px 2px 7px}.nav button{background:none;color:inherit;border:0;padding:0;cursor:pointer}.metrics{display:flex;gap:28px;padding:7px 2px;flex-wrap:wrap}.metrics b{font-size:1.35em}.insight{border-left:2px solid #a78bfa;background:#8b5cf61a;padding:4px 7px;margin-bottom:5px}.grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:5px;align-items:start}.card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:7px;padding:5px 7px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:2px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 45%,transparent)}.view[hidden]{display:none}.muted{color:var(--vscode-descriptionForeground)}table{width:100%;border-collapse:collapse}td,th{padding:4px;border-bottom:1px solid var(--vscode-panel-border);text-align:left}@media(max-width:1000px){.grid{grid-template-columns:1.5fr 1fr}.accounts{grid-column:2}}@media(max-width:700px){.grid{grid-template-columns:1fr}.accounts{grid-column:auto}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}}
  </style></head><body><nav class="nav"><b>Preis-Watch</b><button data-view="overview">\xDCbersicht</button><button data-view="models">Modelle</button><button data-view="agents">Agenten</button><button data-view="accounts">Konten &amp; Limits</button><span style="margin-left:auto">\u25CF aktuell</span></nav>
  <section class="view" id="overview"><div class="metrics"><span><b>${all.length}</b> Modelle</span><span><b>${free}</b> kostenlos</span><span><b>${state2.history.length}</b> \xC4nderungen</span><span><b>${state2.agents.length}</b> Agenten</span></div><div class="insight"><b>\u2726 KI-Fazit</b> ${esc(state2.ai?.text ?? "Rankings und Preis\xE4nderungen werden lokal ausgewertet.")}</div><div class="grid"><div class="card"><b>Beste Modelle f\xFCr deinen Zweck</b>${rankingSections}</div><div class="card"><b>Deine Agenten</b>${agents}</div><div class="card accounts"><b>Konten &amp; Limits</b>${accounts}</div></div></section>
  <section class="view" id="models" hidden><h2>Alle Modelle</h2><input id="search" placeholder="Modelle durchsuchen"> <select id="provider"><option value="">Alle Anbieter</option><option>openrouter</option><option>opencode-zen</option><option>opencode-go</option></select> <select id="price"><option value="">Kostenlos &amp; bezahlt</option><option value="free">Kostenlos</option><option value="paid">Bezahlt</option></select> <select id="purpose"><option value="">Alle F\xE4higkeiten</option>${Object.entries(purposeLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select><table><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>F\xE4higkeiten</th></tr></thead><tbody>${modelRows}</tbody></table></section>
  <section class="view" id="agents" hidden><h2>Deine Agenten</h2>${agents}</section><section class="view" id="accounts" hidden><h2>Konten &amp; Limits</h2>${accounts}</section>
  <script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view)}));document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:b.dataset.action})));const filter=()=>{const q=document.getElementById('search').value.toLowerCase(),p=document.getElementById('provider').value,c=document.getElementById('price').value,u=document.getElementById('purpose').value;document.querySelectorAll('[data-model]').forEach(r=>r.hidden=!(r.dataset.model.includes(q)&&(!p||r.dataset.provider===p)&&(!c||r.dataset.price===c)&&(!u||r.dataset.model.includes(u))))};['search','provider','price','purpose'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',filter));</script></body></html>`;
}

// src/prices.ts
function norm(name) {
  return String(name).toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function toUsd(cell) {
  const v = String(cell ?? "").trim();
  if (!v || v === "-") return 0;
  const n = parseFloat(v.replace("$", ""));
  return Number.isNaN(n) ? 0 : n;
}

// src/ai.ts
var OR_CHAT = "https://openrouter.ai/api/v1/chat/completions";
function aiFailure(error) {
  return { ok: false, at: Date.now(), error: "KI-Fehler: " + (error instanceof Error ? error.message : String(error)) };
}
async function aiDashboardSummary(apiKey, agents, changes, model = "openrouter/free") {
  const payload = {
    model,
    messages: [
      { role: "system", content: "Du fasst Modellpreis- und Agenten-Metadaten auf Deutsch in maximal zwei kurzen S\xE4tzen zusammen. Erfinde keine Benchmarks oder Kontingente." },
      { role: "user", content: JSON.stringify({ agents: agents.map(metadataPayload), changes: changes.slice(0, 20) }) }
    ],
    max_tokens: 180
  };
  const response = await fetch(OR_CHAT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(3e4) });
  if (!response.ok) throw new Error(`KI HTTP ${response.status}`);
  const body = await response.json();
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Leere KI-Antwort");
  return { ok: true, at: Date.now(), text };
}

// src/providers/fetch-all.ts
async function fetchAllProviders(loaders) {
  const providers = Object.keys(loaders);
  return Promise.all(providers.map(async (provider) => {
    try {
      return { provider, offers: await loaders[provider](), checkedAt: Date.now(), stale: false };
    } catch (error) {
      return { provider, offers: [], checkedAt: Date.now(), stale: true, error: { kind: "network", message: error instanceof Error ? error.message : String(error) } };
    }
  }));
}

// src/providers/opencode-docs.ts
var cells = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/`/g, ""));
function idsFromDocument(mdx) {
  const ids = /* @__PURE__ */ new Map();
  for (const line of mdx.split("\n")) {
    if (!line.startsWith("|")) continue;
    const row = cells(line);
    if (row.length >= 3 && /^https?:/.test(row[2] ?? "")) ids.set(norm(row[0] ?? ""), row[1] ?? "");
  }
  return ids;
}
function parsePricing(mdx, provider) {
  const ids = idsFromDocument(mdx);
  const offers2 = [];
  let pricing = false;
  for (const line of mdx.split("\n")) {
    if (/^## (Pricing|Usage limits)/i.test(line)) {
      pricing = true;
      continue;
    }
    if (pricing && /^## /.test(line)) break;
    if (!pricing || !line.startsWith("|")) continue;
    const row = cells(line);
    if (!row[0] || /^(Model|-+)/i.test(row[0])) continue;
    const base = norm(row[0]);
    const id = ids.get(base) ?? ids.get(base.replace(/-tokens$/, ""));
    if (!id) continue;
    offers2.push({ provider, id, name: row[0], pricing: { input: toUsd(row[1]), output: toUsd(row[2]), cacheRead: toUsd(row[3]), cacheWrite: toUsd(row[4]) }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } });
  }
  return offers2;
}
var parseZenDocument = (mdx) => parsePricing(mdx, "opencode-zen");
function parseGoDocument(mdx) {
  const match = mdx.match(/\$(\d+(?:\.\d+)?) for your first month[^$]{0,40}\$(\d+(?:\.\d+)?)\/month/i);
  return { subscription: { firstMonthUsd: Number(match?.[1] ?? 0), monthlyUsd: Number(match?.[2] ?? 0) }, offers: parsePricing(mdx, "opencode-go") };
}
async function fetchOpenCodeDocument(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2e4) });
  if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`);
  return response.text();
}

// src/providers/openrouter.ts
function parseOpenRouterModels(body) {
  return (body.data ?? []).map((model) => {
    const parameters = new Set(model.supported_parameters ?? []);
    const inputModalities = model.architecture?.input_modalities ?? ["text"];
    const description = model.description?.toLowerCase() ?? "";
    const coding = /cod(e|ing|program|software)/.test(description);
    return {
      provider: "openrouter",
      id: model.id,
      name: model.name,
      description: model.description,
      pricing: {
        input: usdPerMillion(model.pricing?.prompt),
        output: usdPerMillion(model.pricing?.completion),
        request: Number.parseFloat(model.pricing?.request ?? "") || 0,
        cacheRead: usdPerMillion(model.pricing?.input_cache_read),
        cacheWrite: usdPerMillion(model.pricing?.input_cache_write),
        image: Number.parseFloat(model.pricing?.image ?? "") || 0,
        webSearch: Number.parseFloat(model.pricing?.web_search ?? "") || 0
      },
      capabilities: {
        inputModalities,
        outputModalities: model.architecture?.output_modalities ?? ["text"],
        tools: parameters.has("tools"),
        structuredOutput: parameters.has("structured_outputs") || parameters.has("response_format"),
        reasoning: parameters.has("reasoning") || parameters.has("include_reasoning"),
        contextLength: model.context_length ?? null,
        purposes: [.../* @__PURE__ */ new Set(["language", "allround", ...coding ? ["coding", "tools"] : [], ...inputModalities.includes("image") ? ["vision"] : [], ...parameters.has("reasoning") ? ["reasoning"] : []])]
      },
      benchmarks: model.benchmarks ? { source: "OpenRouter / Artificial Analysis", intelligence: model.benchmarks.intelligence_index, coding: model.benchmarks.coding_index, agentic: model.benchmarks.agentic_index } : void 0
    };
  });
}
async function fetchOpenRouterCatalog() {
  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=all", { signal: AbortSignal.timeout(2e4) });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  return parseOpenRouterModels(await response.json());
}

// src/extension.ts
var ZEN_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx";
var GO_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx";
var HISTORY_KEY = "priceWatch.history.v2";
var SNAPSHOT_KEY = "priceWatch.snapshots.v2";
var secretKey = (provider) => `priceWatch.account.${provider}`;
var panel;
var statusBar;
var running;
var state = { snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 };
function localAgents() {
  const directories = [(0, import_path.join)((0, import_os.homedir)(), ".config", "opencode", "agents"), (0, import_path.join)((0, import_os.homedir)(), ".config", "opencode", "agent"), ...(vscode.workspace.workspaceFolders ?? []).flatMap((folder) => [(0, import_path.join)(folder.uri.fsPath, ".opencode", "agents"), (0, import_path.join)(folder.uri.fsPath, ".opencode", "agent")])];
  const agents = [];
  for (const directory of directories) try {
    for (const file of (0, import_fs.readdirSync)(directory)) if (file.endsWith(".md")) agents.push({ ...parseAgentMarkdown(file, (0, import_fs.readFileSync)((0, import_path.join)(directory, file), "utf8")), source: (0, import_path.join)(directory, file) });
  } catch {
  }
  return agents;
}
function refreshPanel() {
  if (panel) panel.webview.html = panelHtml(state);
}
function updateStatus() {
  statusBar.text = `$(pulse) Preise ${state.snapshots.reduce((sum, s) => sum + s.offers.length, 0)} \xB7 ${state.history.length} \u0394`;
  statusBar.tooltip = state.snapshots.map((s) => `${s.provider}: ${s.error ? s.error.message : `${s.offers.length} Modelle`}`).join("\n");
  statusBar.show();
}
async function refresh(context, manual) {
  if (running) return running;
  running = (async () => {
    const previous = state.snapshots.flatMap((snapshot) => snapshot.offers);
    const snapshots = await fetchAllProviders({
      openrouter: fetchOpenRouterCatalog,
      "opencode-zen": async () => parseZenDocument(await fetchOpenCodeDocument(ZEN_URL)),
      "opencode-go": async () => parseGoDocument(await fetchOpenCodeDocument(GO_URL)).offers
    });
    const successful = snapshots.flatMap((snapshot) => snapshot.error ? [] : snapshot.offers);
    const changes = diffOffers(previous, successful);
    state = { ...state, snapshots, history: mergeHistory(state.history, changes), agents: localAgents(), updatedAt: Date.now() };
    const aiKey = await context.secrets.get(secretKey("openrouter"));
    if (aiKey && (manual || changes.length > 0)) try {
      state.ai = await aiDashboardSummary(aiKey, state.agents, changes, vscode.workspace.getConfiguration("priceWatch").get("aiModel", "openrouter/free"));
    } catch (error) {
      state.ai = aiFailure(error);
    }
    await context.globalState.update(HISTORY_KEY, state.history);
    await context.globalState.update(SNAPSHOT_KEY, snapshots);
    if (changes.length && !manual) void vscode.window.showInformationMessage(`${summarizeChanges(changes)}. Preis-Watch \xF6ffnen?`, "\xD6ffnen").then((choice) => {
      if (choice) void vscode.commands.executeCommand("priceWatch.open");
    });
    updateStatus();
    refreshPanel();
  })().finally(() => {
    running = void 0;
  });
  return running;
}
async function connectAccount(context) {
  const provider = await vscode.window.showQuickPick(["openrouter", "opencode-zen", "opencode-go", "claude-code"], { title: "Konto ausdr\xFCcklich verbinden" });
  if (!provider) return;
  const token = await vscode.window.showInputBox({ title: `${provider} Zugang`, password: true, prompt: "Wird nur im VS Code Secret Store dieses Ger\xE4ts gespeichert" });
  if (!token) return;
  await context.secrets.store(secretKey(provider), token.trim());
  let account;
  try {
    account = provider === "openrouter" ? await fetchOpenRouterAccount(token.trim()) : unavailableAccount(provider, "Verbunden \xB7 pers\xF6nliche Usage-API nicht verf\xFCgbar");
  } catch (error) {
    await context.secrets.delete(secretKey(provider));
    void vscode.window.showErrorMessage(`Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  state.accounts = [...state.accounts.filter((item) => item.provider !== provider), account];
  refreshPanel();
}
async function disconnectAccount(context) {
  const provider = await vscode.window.showQuickPick(state.accounts.map((account) => account.provider), { title: "Kontoverbindung entfernen" });
  if (!provider) return;
  await context.secrets.delete(secretKey(provider));
  state.accounts = state.accounts.filter((account) => account.provider !== provider);
  refreshPanel();
}
async function refreshConnectedAccounts(context) {
  const providers = ["openrouter", "opencode-zen", "opencode-go", "claude-code"];
  const accounts = [];
  for (const provider of providers) {
    const token = await context.secrets.get(secretKey(provider));
    if (!token) continue;
    try {
      accounts.push(provider === "openrouter" ? await fetchOpenRouterAccount(token) : unavailableAccount(provider, "Verbunden \xB7 pers\xF6nliche Usage-API nicht verf\xFCgbar"));
    } catch (error) {
      accounts.push(unavailableAccount(provider, error instanceof Error ? error.message : String(error)));
    }
  }
  state.accounts = accounts;
}
async function activate(context) {
  state.history = context.globalState.get(HISTORY_KEY) ?? [];
  state.snapshots = context.globalState.get(SNAPSHOT_KEY) ?? [];
  context.globalState.setKeysForSync([HISTORY_KEY]);
  await refreshConnectedAccounts(context);
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "priceWatch.open";
  context.subscriptions.push(statusBar);
  context.subscriptions.push(vscode.commands.registerCommand("priceWatch.open", () => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel("priceWatch", "Preis-Watch", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
      panel.onDidDispose(() => panel = void 0);
      panel.webview.onDidReceiveMessage((message) => {
        if (message?.type === "connect") void connectAccount(context);
        if (message?.type === "disconnect") void disconnectAccount(context);
      });
    } else panel.reveal();
    refreshPanel();
  }), vscode.commands.registerCommand("priceWatch.refresh", () => refresh(context, true)), vscode.commands.registerCommand("priceWatch.setKey", () => connectAccount(context)), vscode.commands.registerCommand("priceWatch.connectAccount", () => connectAccount(context)), vscode.commands.registerCommand("priceWatch.disconnectAccount", () => disconnectAccount(context)));
  const hours = Math.max(1, vscode.workspace.getConfiguration("priceWatch").get("checkIntervalHours", 1));
  const timer = setInterval(() => void refresh(context, false), hours * 36e5);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  updateStatus();
  void refresh(context, false);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
