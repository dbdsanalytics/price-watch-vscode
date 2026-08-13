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

// src/accounts/opencode.ts
var WARN_PERCENT = 85;
var windows = [
  { key: "rolling", label: "5 Std" },
  { key: "weekly", label: "Woche" },
  { key: "monthly", label: "Monat" }
];
function parseOpenCodeGoUsage(body) {
  const usage = body.usage;
  const read = windows.map(({ key, label }) => {
    const window2 = usage?.[key];
    const percent = window2?.percent;
    if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
    return { label, percent, limited: window2?.status === "rate-limited", resetsAt: typeof window2?.resetsAt === "string" ? window2.resetsAt : void 0 };
  }).filter((item) => item !== null);
  if (!read.length) throw new Error("OpenCode Go: Antwort enth\xE4lt keine Nutzungsdaten");
  const binding = read.filter((item) => item.limited).sort((a, b) => b.percent - a.percent)[0] ?? read.slice().sort((a, b) => b.percent - a.percent)[0];
  const state2 = read.some((item) => item.limited) ? "exhausted" : read.some((item) => item.percent >= WARN_PERCENT) ? "low" : "available";
  return {
    provider: "opencode-go",
    state: state2,
    resetAt: binding.resetsAt,
    message: read.map((item) => `${item.label} ${item.percent} %`).join(" \xB7 ")
  };
}
async function fetchOpenCodeGoAccount(key) {
  const response = await fetch("https://opencode.ai/zen/go/v1/usage", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw new Error(`OpenCode Go HTTP ${response.status}`);
  return parseOpenCodeGoUsage(await response.json());
}

// src/accounts/openrouter-management.ts
function parseOpenRouterManagement(credits, keys) {
  const now = Date.now();
  const normalized = keys.data.map((key) => ({
    hash: key.hash,
    name: key.name || key.label || "API-Key",
    label: key.label,
    state: key.disabled ? "disabled" : key.expires_at && Date.parse(key.expires_at) <= now ? "expired" : "active",
    limitUsd: key.limit ?? void 0,
    remainingUsd: key.limit_remaining ?? void 0,
    reset: key.limit_reset ?? null,
    usageUsd: key.usage ?? 0,
    dailyUsd: key.usage_daily ?? 0,
    weeklyUsd: key.usage_weekly ?? 0,
    monthlyUsd: key.usage_monthly ?? 0,
    expiresAt: key.expires_at ?? void 0
  }));
  return { state: "available", totalCreditsUsd: credits.data.total_credits, totalUsageUsd: credits.data.total_usage, remainingCreditsUsd: Math.max(0, credits.data.total_credits - credits.data.total_usage), keys: normalized };
}
async function getJson(url, key) {
  const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw new Error(`OpenRouter Management HTTP ${response.status}`);
  return response.json();
}
async function fetchOpenRouterManagement(key) {
  const [credits, keys] = await Promise.all([
    getJson("https://openrouter.ai/api/v1/credits", key),
    getJson("https://openrouter.ai/api/v1/keys", key)
  ]);
  return parseOpenRouterManagement(credits, keys);
}

// src/config.ts
function stripJsoncComments(src) {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
function parseJsonc(src) {
  return JSON.parse(stripJsoncComments(src).replace(/,\s*([}\]])/g, "$1"));
}

// src/agents/discovery.ts
function parseAgentMarkdown(filename, source, defaultModel = "") {
  const front = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const header = front?.[1] ?? "";
  const prompt = front?.[2] ?? source;
  const value = (key) => header.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
  const tools = value("tools").replace(/^\[|\]$/g, "").split(",").map((tool) => tool.trim()).filter(Boolean);
  const explicitModel = value("model");
  return { name: filename.replace(/\.(md|jsonc?)$/, ""), description: value("description"), model: explicitModel || defaultModel, modelSource: explicitModel ? "explicit" : defaultModel ? "inherited" : "missing", tools, prompt };
}
function parseOpenCodeConfigAgents(source, sourceName) {
  const config = parseJsonc(source);
  return Object.entries(config.agent ?? {}).map(([name, agent]) => {
    const model = agent.model || config.model || "";
    const tools = Array.isArray(agent.tools) ? agent.tools : Object.entries(agent.tools ?? {}).filter(([, enabled]) => enabled).map(([tool]) => tool);
    return { name, description: agent.description ?? "", model, modelSource: agent.model ? "explicit" : config.model ? "inherited" : "missing", tools, prompt: "", source: sourceName };
  });
}
function parseOpenCodeDefaultModel(source) {
  return parseJsonc(source).model ?? "";
}
function mergeAgents(...scopes) {
  const merged = /* @__PURE__ */ new Map();
  for (const scope of scopes) for (const agent of scope) {
    const previous = merged.get(agent.name);
    merged.set(agent.name, previous && !agent.model ? { ...agent, model: previous.model, modelSource: previous.modelSource } : agent);
  }
  return [...merged.values()];
}
function metadataPayload(agent) {
  return { name: agent.name, description: agent.description, model: agent.model, tools: agent.tools };
}

// src/domain/model.ts
function usdPerMillion(value) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1e6 : 0;
}
function offerKey(offer) {
  return `${offer.provider}:${offer.id}`;
}
function isFreePricing(pricing) {
  return !pricing.unknown && pricing.input === 0 && pricing.output === 0 && (pricing.request ?? 0) === 0;
}

// src/domain/changes.ts
function diffOffers(previous, next, at = Date.now()) {
  const before = new Map(previous.map((offer) => [offerKey(offer), offer]));
  const dimensions = ["input", "output", "cacheRead", "cacheWrite", "request"];
  const changes = [];
  for (const offer of next) {
    const old = before.get(offerKey(offer));
    if (!old) continue;
    if (offer.pricing.unknown || old.pricing.unknown) continue;
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

// src/domain/snapshots.ts
function carryForwardOffers(previous, fresh) {
  const known = new Map(previous.map((snapshot) => [snapshot.provider, snapshot]));
  return fresh.map((snapshot) => {
    if (snapshot.offers.length) return snapshot;
    const last = known.get(snapshot.provider);
    if (!last?.offers.length) return snapshot;
    return { ...snapshot, offers: last.offers, checkedAt: last.checkedAt, stale: true };
  });
}
function plausibilityWarning(previous, fresh) {
  if (fresh.error || !previous || previous.error || !previous.offers.length) return void 0;
  if (fresh.offers.length < previous.offers.length * 0.7) {
    return `Nur ${fresh.offers.length} statt zuletzt ${previous.offers.length} Modelle gelesen \u2014 hat sich die Dokumentstruktur ge\xE4ndert?`;
  }
  const priced = new Set(previous.offers.filter((offer) => !offer.pricing.unknown).map((offer) => offer.id));
  const lost = fresh.offers.filter((offer) => offer.pricing.unknown && priced.has(offer.id)).length;
  return lost ? `${lost} Modelle ohne lesbaren Preis, die zuletzt einen hatten \u2014 hat sich das Preisformat ge\xE4ndert?` : void 0;
}

// src/domain/ai-schedule.ts
function shouldRunAi({ lastAt, now, everyHours, manual, hasChanges }) {
  if (manual) return true;
  if (!hasChanges) return false;
  return lastAt === null || now - lastAt >= Math.max(1, everyHours) * 36e5;
}

// src/domain/benchmarks.ts
var vendors = [
  [/^qwen/i, "qwen"],
  [/^gpt-/i, "openai"],
  [/^claude-/i, "anthropic"],
  [/^gemini-/i, "google"],
  [/^grok-/i, "x-ai"],
  [/^deepseek-/i, "deepseek"],
  [/^glm-/i, "z-ai"],
  [/^kimi-/i, "moonshotai"],
  [/^minimax-/i, "minimax"],
  [/^mimo-/i, "xiaomi"],
  [/^hy\d/i, "tencent"],
  [/^nemotron-/i, "nvidia"],
  [/^laguna-/i, "poolside"]
];
var baseId = (id) => id.replace(/:batch$/, "").replace(/:free$/, "").replace(/-free$/, "");
var ownerFor = (id) => vendors.find(([pattern]) => pattern.test(baseId(id)))?.[1];
var inherited = (scores) => ({ ...scores, source: `${scores.source} \xB7 identisches Basismodell`, match: "base-model" });
function enrichProviderBenchmarks(snapshots, api) {
  const detailsByModel = /* @__PURE__ */ new Map();
  for (const item of api?.items ?? []) {
    const details = detailsByModel.get(item.modelId) ?? [];
    details.push({ name: item.benchmark, score: item.score, elo: item.elo, costPerTaskUsd: item.costPerTaskUsd, sampleCount: item.sampleCount, lastRunAt: item.lastRunAt });
    detailsByModel.set(item.modelId, details);
  }
  const withApi = snapshots.map((snapshot) => snapshot.provider !== "openrouter" ? snapshot : { ...snapshot, offers: snapshot.offers.map((offer) => {
    const details = detailsByModel.get(offer.benchmarkId ?? offer.id);
    if (!details?.length) return offer;
    return { ...offer, benchmarks: { ...offer.benchmarks, source: offer.benchmarks?.source ?? "OpenRouter Benchmarks", match: "direct", asOf: api?.asOf, details } };
  }) });
  const openRouter = withApi.find((snapshot) => snapshot.provider === "openrouter")?.offers ?? [];
  return withApi.map((snapshot) => snapshot.provider === "openrouter" ? snapshot : { ...snapshot, offers: snapshot.offers.map((offer) => {
    if (offer.benchmarks) return offer;
    const base = baseId(offer.id), owner = ownerFor(base);
    const candidates = openRouter.filter((item) => item.benchmarks && baseId(item.id.split("/").at(-1) ?? item.id) === base).filter((item) => !owner || item.id.startsWith(`${owner}/`));
    const owners = new Set(candidates.map((item) => item.id.split("/")[0]));
    if (candidates.length === 0 || !owner && owners.size !== 1) return offer;
    return { ...offer, benchmarks: inherited(candidates[0].benchmarks) };
  }) });
}

// src/domain/benchmark-cache.ts
var BENCHMARK_CACHE_KEY = "priceWatch.openrouterBenchmarks.v1";
var BENCHMARK_CACHE_TTL_MS = 864e5;
function valid(value) {
  if (!value || typeof value !== "object") return false;
  const item = value;
  return typeof item.fetchedAt === "number" && Array.isArray(item.items);
}
async function loadBenchmarks(storage, key, forceRefresh, loader, now = Date.now()) {
  const value = storage.get(BENCHMARK_CACHE_KEY);
  const cached = valid(value) ? value : null;
  if (cached && !forceRefresh && now - cached.fetchedAt < BENCHMARK_CACHE_TTL_MS) return cached;
  try {
    const fresh = await loader(key);
    await storage.update(BENCHMARK_CACHE_KEY, fresh);
    return fresh;
  } catch {
    return cached;
  }
}

// src/panel/index.ts
var import_crypto = require("crypto");

// src/agents/assessment.ts
function assessAgent(agent, offers) {
  if (/^(lmstudio|ollama|local)[/:]/i.test(agent.model)) return { agent, status: "local", reason: "Lokales Modell \xB7 keine \xF6ffentlichen Preis- oder Benchmarkdaten" };
  const current = offers.find((offer) => agent.model.endsWith(offer.id));
  if (!current) return { agent, status: "unknown", reason: agent.model ? "Modell nicht im \xF6ffentlichen Katalog gefunden" : "Keine Modellzuordnung gefunden" };
  if (current.deprecatedAt) return { agent, status: "deprecated", reason: `Abgek\xFCndigt: ${current.deprecatedAt}` };
  const codingAgent = /code|review|build|debug|develop/i.test(`${agent.name} ${agent.description}`);
  if (codingAgent && !current.capabilities.purposes.includes("coding")) return { agent, status: "unsuitable", reason: "Keine belastbaren Coding-F\xE4higkeiten ausgewiesen" };
  const currentCost = current.pricing.input + current.pricing.output;
  const currentScore = current.benchmarks?.coding;
  const alternative = currentScore === void 0 ? void 0 : offers.filter((offer) => offer.id !== current.id && (!codingAgent || offer.capabilities.purposes.includes("coding"))).filter((offer) => offer.benchmarks?.coding !== void 0 && offer.benchmarks.coding >= currentScore * 0.9).filter((offer) => offer.pricing.input + offer.pricing.output < currentCost * 0.7).sort((a, b) => (b.benchmarks?.coding ?? 0) - (a.benchmarks?.coding ?? 0))[0];
  return alternative ? { agent, status: "alternative-available", reason: "Mindestens 30 % g\xFCnstigere Alternative verf\xFCgbar", alternative } : { agent, status: "suitable", reason: "F\xE4higkeiten und Preis weiterhin passend" };
}

// src/panel/format.ts
var esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var count = (value) => new Intl.NumberFormat("de-DE").format(value);
var amount = (value) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value);
var money = (value) => `${amount(value)} $`;
var stamp = (at) => new Date(at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

// src/panel/script.ts
var SCRIPT = `
const vscode = acquireVsCodeApi()
const shown = {}

// Verwirft VS Code das Webview \u2014 Tab lange im Hintergrund, Fenster neu geladen \u2014,
// baut es die Seite von vorn auf. retainContextWhenHidden hilft nur innerhalb
// einer Sitzung, dieser Zustand ueberdauert sie.
const save = () => vscode.setState({
  view: [...document.querySelectorAll('.view')].find((view) => !view.hidden)?.id ?? 'overview',
  search: search.value, provider: provider.value, price: price.value, purpose: purpose.value,
})

const show = (id) => {
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== id })
  document.querySelectorAll('[data-view]').forEach((button) => { button.classList.toggle('active', button.dataset.view === id) })
  scrollTo(0, 0)
  save()
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => show(button.dataset.view)))
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action })))

const applyFilter = () => {
  const q = search.value.toLowerCase(), p = provider.value, c = price.value, u = purpose.value
  document.querySelectorAll('[data-model]').forEach((row) => {
    row.hidden = !(row.dataset.model.includes(q) && (!p || row.dataset.provider === p) && (!c || row.dataset.price === c) && (!u || row.dataset.model.includes(u)))
  })
}
;['search', 'provider', 'price', 'purpose'].forEach((id) => document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', () => { applyFilter(); save() }))

// Ein Tausch verwirft den Inhalt samt aufgeklappten Bereichen und der
// Scrollposition der Tabelle. Beides wird um den Tausch herum gerettet.
const replaceFragment = (id, html) => {
  const host = document.querySelector('[data-fragment="' + id + '"]')
  if (!host) return
  const open = new Set()
  host.querySelectorAll('details[open][data-key]').forEach((item) => open.add(item.dataset.key))
  const wrap = host.closest('.table-wrap'), wrapTop = wrap ? wrap.scrollTop : 0
  const pageTop = window.scrollY
  host.innerHTML = html
  host.querySelectorAll('details[data-key]').forEach((item) => { if (open.has(item.dataset.key)) item.open = true })
  if (wrap) wrap.scrollTop = wrapTop
  window.scrollTo(0, pageTop)
}

window.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'fragments') return
  for (const [id, html] of Object.entries(event.data.fragments)) {
    // Gleicher Inhalt heisst: nichts anfassen. Das ist der Regelfall beim
    // stuendlichen Abruf und der Grund, warum die Bedienung stehen bleibt.
    if (shown[id] === html) continue
    shown[id] = html
    replaceFragment(id, html)
  }
  applyFilter()
})

const restore = () => {
  const saved = vscode.getState()
  if (!saved) return
  search.value = saved.search ?? ''
  provider.value = saved.provider ?? ''
  price.value = saved.price ?? ''
  purpose.value = saved.purpose ?? ''
  applyFilter()
  if (saved.view) show(saved.view)
}
restore()

// Ohne diese Meldung bliebe "shown" bis zum ersten Abruf leer \u2014 der wuerde
// dann alle Fragmente tauschen, obwohl ihr Inhalt schon im Dokument steht,
// und die Bedienung genau einmal doch wegwerfen.
vscode.postMessage({ type: 'ready' })
`;

// src/panel/styles.ts
var BENCHMARK_CSS = `.quota{color:var(--blue)}.benchmark{min-width:190px}.benchmark>div{display:flex;flex-wrap:wrap;gap:3px}.benchmark>div>span{padding:1px 5px;border-radius:5px;background:color-mix(in srgb,var(--violet) 12%,transparent);font-size:.78em;white-space:nowrap}.benchmark>small{display:block;margin-top:3px;color:var(--muted)}.benchmark-base-model>small{color:var(--cyan)}.benchmark-local>small{color:var(--yellow)}.benchmark-missing strong{color:var(--muted)}.benchmark-details{margin-top:4px}.benchmark-details summary{color:var(--cyan);cursor:pointer;font-size:.82em}.benchmark-details article{display:grid;grid-template-columns:1fr auto;gap:0 8px;padding:3px 0;border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 50%,transparent)}.benchmark-details article>small{grid-column:1/-1;color:var(--muted);font-size:.75em}.notice.warn{border-left-color:var(--yellow);background:color-mix(in srgb,var(--yellow) 12%,transparent)}.tier-details{margin-top:4px}.tier-details summary{color:var(--cyan);cursor:pointer;font-size:.82em}.tier-details article{padding:2px 0;color:var(--muted);font-size:.8em;white-space:nowrap}`;
var CSS = `
:root{color-scheme:light dark;--violet:#a78bfa;--blue:#60a5fa;--cyan:#2dd4bf;--pink:#f472b6;--yellow:#facc15;--green:#4ade80;--orange:#fb923c;--muted:var(--vscode-descriptionForeground)}*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:var(--vscode-font-size)/1.4 var(--vscode-font-family)}button,input,select{font:inherit}button{border:1px solid var(--vscode-button-border,var(--vscode-panel-border));border-radius:6px;padding:5px 9px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:24px;min-height:44px;padding:0 16px;border-bottom:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-editor-background) 94%,transparent);backdrop-filter:blur(12px)}.topbar button{border:0;padding:11px 0;background:none;color:var(--muted)}.topbar .brand{font-weight:750;color:var(--vscode-foreground)}.topbar nav{display:flex;gap:20px}.topbar nav button.active{color:var(--violet);box-shadow:inset 0 -2px var(--violet)}.live{display:flex;align-items:center;gap:6px;margin-left:auto;color:var(--muted)}.live i{width:8px;height:8px;border-radius:50%;background:var(--green)}main{padding:12px 16px}.view[hidden],[data-model][hidden]{display:none}h1,h2,h3,h4,p{margin:0}h1{font-size:1.55em}h2{font-size:1.05em}.page-head{margin:5px 0 12px}.page-head p,.empty{color:var(--muted)}.metrics{display:flex;flex-wrap:wrap;gap:8px 28px;padding:2px 2px 10px;color:var(--muted)}.metrics span{display:flex;align-items:baseline;gap:5px}.metrics strong{font-size:1.4em;color:var(--vscode-foreground)}.insight{display:flex;gap:8px;padding:7px 10px;margin-bottom:8px;border-left:3px solid var(--violet);border-radius:5px;background:color-mix(in srgb,var(--violet) 15%,var(--vscode-editorWidget-background))}.insight strong{white-space:nowrap;color:#d8b4fe}.dashboard{display:grid;grid-template-columns:minmax(360px,2fr) minmax(220px,1fr) minmax(220px,1fr);gap:8px;align-items:start}.card{min-width:0;padding:10px;border:1px solid var(--vscode-panel-border);border-radius:9px;background:var(--vscode-editorWidget-background)}.card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}.card-head button,.more{color:var(--violet);background:none}.purpose-block{border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 60%,transparent)}.purpose-block:first-of-type{border-top:0}.purpose-block summary{display:flex;align-items:center;gap:8px;padding:7px 2px;cursor:pointer}.purpose-block summary span{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:color-mix(in srgb,currentColor 16%,transparent);font-weight:800}.purpose-block summary strong{font-size:1.12em}.purpose-coding{color:var(--blue)}.purpose-language{color:var(--cyan)}.purpose-reasoning{color:var(--violet)}.purpose-vision{color:var(--pink)}.purpose-tools{color:var(--yellow)}.purpose-allround{color:#94a3b8}.rank-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 0 8px 30px;color:var(--vscode-foreground)}.rank-column{padding:7px 8px;border-radius:7px;background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)}.rank-column h4{display:flex;align-items:center;gap:6px}.rank-column h4 i{width:8px;height:8px;border-radius:50%}.price-free h4{color:var(--green)}.price-free h4 i{background:var(--green)}.price-paid h4{color:var(--orange)}.price-paid h4 i{background:var(--orange)}.rank-column ol{margin:4px 0 0;padding-left:20px}.rank-column li{padding:2px 0}.rank-column li strong,.rank-column li small{display:block}.rank-column li small{color:var(--muted)}.badge{display:inline-flex;align-items:center;gap:4px;width:max-content;border:1px solid color-mix(in srgb,currentColor 32%,transparent);border-radius:999px;padding:1px 6px;background:color-mix(in srgb,currentColor 13%,transparent);font-size:.8em}.badge b{font-size:.85em}.provider i{width:6px;height:6px;border-radius:2px;background:currentColor}.provider-openrouter{color:var(--violet)}.provider-opencode-zen{color:var(--cyan)}.provider-opencode-go{color:var(--blue)}.agent-preview{padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 50%,transparent)}.agent-preview .agent-model span,.agent-preview .agent-identity .badge{display:none}.agent-preview .agent-result small{display:none}.more{width:100%;margin-top:6px}.agent-groups{display:grid;gap:12px}.agent-group{overflow:hidden;border:1px solid var(--vscode-panel-border);border-radius:10px;background:var(--vscode-editorWidget-background)}.agent-group>header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border)}.agent-group>header p{color:var(--muted);font-size:.88em}.agent-group>header>span{min-width:28px;padding:3px 8px;border-radius:999px;text-align:center;background:var(--vscode-badge-background)}.agent-group-attention{border-left:3px solid var(--orange)}.agent-group-suitable{border-left:3px solid var(--green)}.agent-group-unknown{border-left:3px solid #94a3b8}.agent-row{display:grid;grid-template-columns:minmax(170px,.8fr) minmax(240px,1.3fr) minmax(190px,1fr);gap:12px;align-items:center;min-width:0;padding:8px 12px;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 55%,transparent)}.agent-row:last-child{border-bottom:0}.agent-identity,.agent-model,.agent-result{min-width:0}.agent-identity{display:flex;align-items:center;gap:8px}.agent-model span,.agent-result small{display:block;color:var(--muted);font-size:.82em}.agent-model strong{display:block;overflow-wrap:anywhere}.agent-result{text-align:right}.status{font-weight:700}.status-suitable,.status-available,.key-state-active{color:var(--green)}.status-alternative-available,.status-expensive,.status-low{color:var(--orange)}.status-deprecated,.status-unsuitable,.status-exhausted,.key-state-disabled,.key-state-expired{color:var(--vscode-errorForeground)}.status-unknown,.status-unavailable,.status-disconnected{color:var(--muted)}.group-empty{padding:12px}.filters{display:grid;grid-template-columns:minmax(190px,1fr) repeat(3,minmax(130px,auto));gap:6px;margin-bottom:8px}.filters input,.filters select{min-width:0;padding:7px 8px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background)}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:9px}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);text-align:left;vertical-align:middle}th{position:sticky;top:44px;z-index:2;background:var(--vscode-editorWidget-background);color:var(--muted)}td>strong,td>small{display:block}td>small{color:var(--muted)}.capabilities{display:flex;flex-wrap:wrap;gap:4px}.price{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.price:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.price-free{color:var(--green)}.price-paid{color:var(--orange)}.price-unknown{color:var(--muted)}.provider-sections{display:grid;gap:12px}.account-provider-section{overflow:hidden;border:1px solid var(--vscode-panel-border);border-left:3px solid currentColor;border-radius:10px;background:var(--vscode-editorWidget-background);color:var(--vscode-foreground)}.account-provider-section>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-bottom:1px solid var(--vscode-panel-border)}.account-provider-section>header p{color:var(--muted)}.provider-title{display:flex;align-items:center;gap:8px;font-size:1.18em;font-weight:750}.provider-title i{width:10px;height:10px;border-radius:3px;background:currentColor}.account-provider-section.provider-openrouter{border-left-color:var(--violet)}.account-provider-section.provider-opencode-zen{border-left-color:var(--cyan)}.account-provider-section.provider-opencode-go{border-left-color:var(--blue)}.account-provider-section.provider-openrouter .provider-title{color:var(--violet)}.account-provider-section.provider-opencode-zen .provider-title{color:var(--cyan)}.account-provider-section.provider-opencode-go .provider-title{color:var(--blue)}.connection-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 12px}.connection{min-width:0;padding:9px 10px;border:1px solid var(--vscode-panel-border);border-radius:8px;background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)}.connection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.connection-head span{display:block;color:var(--muted);font-size:.84em}.account-summary{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:8px}.account-summary small{display:block;color:var(--muted)}.account-summary .status{max-width:55%;text-align:right;overflow-wrap:anywhere}.management-state{margin-top:8px}.account-metrics{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;padding:0 12px 10px}.account-metric{padding:9px 10px;border-radius:8px;background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)}.account-metric strong,.account-metric small{display:block}.account-metric strong{font-size:1.25em}.account-metric small{color:var(--muted)}.metric-good strong{color:var(--green)}.metric-warn strong{color:var(--orange)}.managed-keys{padding:0 12px 12px}.managed-keys>header{display:flex;align-items:end;justify-content:space-between;gap:8px;padding:4px 0 7px}.managed-keys>header span{color:var(--muted);font-size:.84em}.managed-key{display:grid;grid-template-columns:minmax(170px,1.4fr) auto repeat(3,minmax(120px,1fr));gap:12px;align-items:center;padding:8px 10px;border-top:1px solid var(--vscode-panel-border)}.managed-key small,.managed-key strong{display:block}.managed-key small{color:var(--muted)}.managed-key strong{overflow-wrap:anywhere}.notice{margin:8px 16px;padding:7px 10px;border-left:3px solid var(--vscode-errorForeground);border-radius:5px;background:color-mix(in srgb,var(--vscode-errorForeground) 12%,transparent)}
@media(max-width:1050px){.dashboard{grid-template-columns:minmax(340px,1.5fr) minmax(240px,1fr)}.accounts-card{grid-column:2}.filters{grid-template-columns:1fr 1fr}.account-metrics{grid-template-columns:1fr 1fr}.managed-key{grid-template-columns:1fr auto 1fr 1fr}.managed-key>div:last-child{display:none}}
@media(max-width:700px){.topbar{gap:12px;overflow-x:auto}.topbar nav{gap:12px}.dashboard{grid-template-columns:1fr}.accounts-card{grid-column:auto}.insight{display:block}.insight strong{display:block}.rank-columns,.connection-grid{grid-template-columns:1fr}.rank-columns{padding-left:0}.filters,.account-metrics{grid-template-columns:1fr}.agent-row{grid-template-columns:1fr;gap:5px}.agent-identity{justify-content:space-between}.agent-result{text-align:left}.managed-key{grid-template-columns:1fr auto}.managed-key>div{display:none}.managed-key>.key-name{display:block}.account-provider-section>header{align-items:flex-start}.account-summary{display:block}.account-summary .status{display:block;max-width:none;margin-top:4px;text-align:left}.managed-keys>header span{display:none}}
`;

// src/panel/views/models.ts
var labels = { coding: "Coding", language: "Sprache", reasoning: "Reasoning", vision: "Vision", tools: "Tools", allround: "Allround" };
var purposeIcon = { coding: "\u2318", language: "A", reasoning: "\u25C7", vision: "\u25C9", tools: "\u2699", allround: "\u2726" };
function purposeBadge(purpose) {
  return `<span class="badge purpose purpose-${purpose}"><b>${purposeIcon[purpose]}</b>${labels[purpose]}</span>`;
}
function providerBadge(provider) {
  return `<span class="badge provider provider-${provider}"><i></i>${esc(provider === "openrouter" ? "OpenRouter" : provider === "opencode-zen" ? "Zen" : "Go")}</span>`;
}
function quotaLine(offer) {
  const quota = offer.quota;
  if (!quota) return "";
  const parts = [
    quota.requestsPerMonth !== void 0 ? `${count(quota.requestsPerMonth)} Anfragen/Monat` : "Anfragen nicht in der Quelle",
    quota.includedUsdPerMonth !== void 0 ? `${money(quota.includedUsdPerMonth)} enthalten` : ""
  ].filter(Boolean);
  return `<small class="quota">${esc(parts.join(" \xB7 "))}</small>`;
}
function priceClass(offer) {
  return isFreePricing(offer.pricing) ? "free" : offer.pricing.unknown ? "unknown" : "paid";
}
function priceCell(offer, side) {
  if (offer.pricing.unknown) return "Preis unbekannt";
  const base = offer.pricing[side], tiers = offer.pricing.tiers ?? [];
  if (!tiers.length) return money(base);
  return `${amount(base)}\u2013${money(Math.max(base, ...tiers.map((tier) => tier[side])))}`;
}
function tierDetails(offer) {
  const tiers = offer.pricing.tiers ?? [];
  if (!tiers.length) return "";
  const rows = [
    `${esc(offer.tier ?? "Basis")} \xB7 ${esc(money(offer.pricing.input))} / ${esc(money(offer.pricing.output))}`,
    ...tiers.map((tier) => `${esc(tier.label)} \xB7 ${esc(money(tier.input))} / ${esc(money(tier.output))}`)
  ];
  return `<details class="tier-details" data-key="tier-${esc(offer.id)}"><summary>${tiers.length + 1} Preisstufen</summary>${rows.map((row) => `<article>${row}</article>`).join("")}</details>`;
}
function benchmarkCell(offer) {
  const scores = offer.benchmarks;
  if (!scores) return `<div class="benchmark benchmark-missing"><strong>Keine Daten</strong><small>Noch nicht belastbar bewertet</small></div>`;
  const values = [["Intelligenz", scores.intelligence], ["Coding", scores.coding], ["Agentic", scores.agentic]].filter((item) => item[1] !== void 0);
  const provenance = scores.match === "base-model" ? "Identisches Basismodell" : scores.match === "local" ? "Lokaler Praxistest" : "\xD6ffentlich bewertet";
  const detailLabel = {
    gpqa_diamond: "GPQA Diamond",
    tau_bench_verified_airline: "\u03C4\xB2-Bench Airline",
    search_browsecomp: "BrowseComp",
    search_dsqa: "DeepSearchQA",
    search_hle: "Search HLE",
    search_widesearch: "WideSearch",
    arena_codecategories: "Arena \xB7 Code",
    arena_website: "Arena \xB7 Website",
    arena_uicomponent: "Arena \xB7 UI-Komponenten",
    arena_dataviz: "Arena \xB7 Datenvisualisierung",
    arena_svg: "Arena \xB7 SVG",
    arena_gamedev: "Arena \xB7 Spiele",
    arena_3d: "Arena \xB7 3D",
    arena_asciiart: "Arena \xB7 ASCII-Art",
    arena_graphicdesign: "Arena \xB7 Grafikdesign",
    arena_logo: "Arena \xB7 Logo",
    arena_image: "Arena \xB7 Bild",
    arena_imageediting: "Arena \xB7 Bildbearbeitung"
  };
  const details = (scores.details ?? []).map((detail) => `<article><strong>${esc(detailLabel[detail.name] ?? detail.name)}</strong><span>${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(detail.score)} %</span>${detail.elo !== void 0 ? `<small>ELO ${esc(detail.elo)}</small>` : ""}${detail.sampleCount !== void 0 ? `<small>${esc(detail.sampleCount)} ${detail.elo !== void 0 ? "Duelle" : "Aufgaben"}</small>` : ""}${detail.costPerTaskUsd !== void 0 ? `<small>${money(detail.costPerTaskUsd)}/Aufgabe</small>` : ""}</article>`).join("");
  return `<div class="benchmark benchmark-${scores.match ?? "direct"}"><div>${values.map(([label, value]) => `<span><b>${label}</b> ${esc(value)}</span>`).join("")}</div>${details ? `<details class="benchmark-details" data-key="bench-${esc(offer.id)}"><summary>${esc(scores.details?.length)} Einzelbenchmarks</summary>${details}</details>` : ""}<small>${provenance}</small></div>`;
}
function modelRows(offers) {
  return offers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((offer) => `<tr data-model="${esc(`${offer.name} ${offer.provider} ${offer.capabilities.purposes.join(" ")}`.toLowerCase())}" data-provider="${offer.provider}" data-price="${priceClass(offer)}"><td><strong>${esc(offer.name)}</strong><small>${esc(offer.id)}</small>${quotaLine(offer)}</td><td>${providerBadge(offer.provider)}</td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "input"))}</span></td><td><span class="price price-${priceClass(offer)}">${esc(priceCell(offer, "output"))}</span>${tierDetails(offer)}</td><td><div class="capabilities">${offer.capabilities.purposes.map(purposeBadge).join("")}</div></td><td>${benchmarkCell(offer)}</td></tr>`).join("");
}
function modelFilters() {
  return `<div class="filters"><input id="search" placeholder="Modelle durchsuchen"><select id="provider"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="price"><option value="">Alle Preise</option><option value="free">Kostenlos</option><option value="paid">Kostenpflichtig</option><option value="unknown">Preis unbekannt</option></select><select id="purpose"><option value="">Alle F\xE4higkeiten</option>${Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>`;
}

// src/panel/views/agents.ts
var statusLabel = { suitable: "Passend", expensive: "Teuer", "alternative-available": "Alternative", unsuitable: "Unpassend", deprecated: "Veraltet", local: "Lokal", unknown: "Nicht bewertbar" };
function agentPurpose(agent) {
  const text = `${agent.name} ${agent.description}`.toLowerCase();
  if (/translat|sprach|writ/.test(text)) return "language";
  if (/vision|image/.test(text)) return "vision";
  if (/research|reason|orchestrat/.test(text)) return "reasoning";
  if (/tool/.test(text)) return "tools";
  return "coding";
}
function agentGroup(status) {
  return status === "suitable" ? "suitable" : status === "unknown" || status === "local" ? "unknown" : "attention";
}
function renderAgentRow(item, compact = false) {
  const purpose = agentPurpose(item.agent);
  return `<article class="agent-row${compact ? " agent-preview" : ""}"><div class="agent-identity"><strong>${esc(item.agent.name)}</strong>${purposeBadge(purpose)}</div><div class="agent-model"><span>Aktuelles Modell</span><strong>${esc(item.agent.model || "Kein Modell zugewiesen")}</strong></div><div class="agent-result"><span class="status status-${item.status}">${statusLabel[item.status]}</span>${compact ? "" : `<small>${esc(item.reason)}</small>`}${!compact && item.alternative ? `<small>Empfehlung: <strong>${esc(item.alternative.name)}</strong></small>` : ""}</div></article>`;
}
function renderAgentGroups(items) {
  const groups = [{ key: "attention", title: "Handlungsbedarf", hint: "Pr\xFCfen oder optimieren" }, { key: "suitable", title: "Passend", hint: "Derzeit sinnvoll eingesetzt" }, { key: "unknown", title: "Nicht bewertbar", hint: "Modellzuordnung oder Daten fehlen" }];
  return groups.map((group) => {
    const rows = items.filter((item) => agentGroup(item.status) === group.key);
    return `<section class="agent-group agent-group-${group.key}"><header><div><h2>${group.title}</h2><p>${group.hint}</p></div><span>${rows.length}</span></header>${rows.length ? `<div class="agent-rows">${rows.map((item) => renderAgentRow(item)).join("")}</div>` : `<p class="empty group-empty">Keine Agenten in dieser Gruppe</p>`}</section>`;
  }).join("");
}

// src/panel/views/accounts.ts
function accountValue(account) {
  if (account.remainingUsd !== void 0) return `${money(account.remainingUsd)} verf\xFCgbar`;
  if (account.message) return account.message;
  if (account.state === "available") return "Verbunden \xB7 kein festes Schl\xFCssellimit";
  return "Verbrauch nicht automatisch abrufbar";
}
function renderAccountSummary(account) {
  const usage = [["Heute", account.dailyUsd], ["Woche", account.weeklyUsd], ["Monat", account.monthlyUsd]].filter((item) => item[1] !== void 0).map(([period, value]) => `${period} ${money(value)}`).join(" \xB7 ");
  return `<div class="account-summary"><div><strong>${esc(account.provider)}</strong>${account.label ? `<small>${esc(account.label)}</small>` : ""}${usage ? `<small class="account-usage">${esc(usage)}</small>` : ""}${account.resetAt ? `<small class="account-usage">Reset ${esc(new Date(account.resetAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }))}</small>` : ""}</div><span class="status status-${account.state}">${esc(accountValue(account))}</span></div>`;
}
function metric(value, label, tone = "") {
  return `<div class="account-metric ${tone}"><strong>${value}</strong><small>${label}</small></div>`;
}
function renderManagedKey(key) {
  const limit = key.limitUsd === void 0 ? "Kein festes Limit" : `${money(key.remainingUsd ?? 0)} von ${money(key.limitUsd)}`;
  const reset = key.reset ? { daily: "T\xE4glich", weekly: "W\xF6chentlich", monthly: "Monatlich" }[key.reset] : "Kein Reset";
  return `<article class="managed-key"><div class="key-name"><strong>${esc(key.name)}</strong><small>${esc(key.label ?? key.hash.slice(0, 8))}</small></div><span class="key-state key-state-${key.state}">${key.state === "active" ? "Aktiv" : key.state === "disabled" ? "Deaktiviert" : "Abgelaufen"}</span><div><small>Limit</small><strong>${limit}</strong></div><div><small>Verbrauch</small><strong>${money(key.usageUsd)}</strong></div><div><small>Zeitraum</small><strong>${reset}</strong></div></article>`;
}
function renderOpenRouterSection(accounts, management) {
  const api = accounts.find((item) => item.provider === "openrouter");
  const managementAvailable = management?.state === "available";
  return `<section class="account-provider-section provider-openrouter"><header><div><span class="provider-title"><i></i>OpenRouter</span><p>API-Zugriff und kontoweite Verbrauchsdaten getrennt verwalten</p></div></header><div class="connection-grid"><article class="connection"><div class="connection-head"><div><h3>API-Key</h3><span>KI-Fazit und Status dieses Schl\xFCssels</span></div><button data-action="connect">${api ? "Erneuern" : "Verbinden"}</button></div>${api ? renderAccountSummary(api) : `<p class="empty">Nicht verbunden</p>`}</article><article class="connection"><div class="connection-head"><div><h3>Management Key \xB7 Nur Lesen</h3><span>Guthaben und Verbrauch vorhandener Schl\xFCssel</span></div><button data-action="connect-management">${management ? "Erneuern" : "Verbinden"}</button></div>${management ? `<p class="management-state status-${management.state}">${esc(management.state === "available" ? "Verbunden" : management.message ?? "Nicht abrufbar")}</p>` : `<p class="empty">Nicht verbunden</p>`}</article></div>${managementAvailable ? `<div class="account-metrics">${metric(money(management.remainingCreditsUsd), "Verf\xFCgbar", "metric-good")}${metric(money(management.totalCreditsUsd), "Guthaben gekauft")}${metric(money(management.totalUsageUsd), "Gesamt verbraucht", "metric-warn")}${metric(String(management.keys.length), "API-Keys")}</div><div class="managed-keys"><header><h3>API-Key-Verbrauch</h3><span>Heute \xB7 Woche \xB7 Monat sind pro Schl\xFCssel verf\xFCgbar</span></header>${management.keys.map(renderManagedKey).join("")}</div>` : ""}</section>`;
}
function renderProviderSection(provider, accounts) {
  const account = accounts.find((item) => item.provider === provider), name = provider === "opencode-zen" ? "OpenCode Zen" : "OpenCode Go";
  return `<section class="account-provider-section provider-${provider}"><header><div><span class="provider-title"><i></i>${name}</span><p>${provider === "opencode-zen" ? "Pay-as-you-go-Guthaben" : "Abo, Kontingent und Reset"}</p></div><button data-action="connect">${account ? "Erneuern" : "Verbinden"}</button></header>${account ? renderAccountSummary(account) : `<p class="empty">Nicht verbunden</p>`}</section>`;
}

// src/domain/ranking.ts
function rankOffers(offers, purpose, priceMode) {
  const fitsPurpose = (offer) => offer.capabilities.purposes.includes(purpose) || purpose === "coding" && offer.benchmarks?.coding !== void 0;
  return offers.filter((offer) => !offer.pricing.unknown && offer.capabilities.outputModalities.includes("text")).filter(fitsPurpose).filter((offer) => {
    const free = offer.pricing.input + offer.pricing.output === 0;
    return priceMode === "all" || (priceMode === "free" ? free : !free);
  }).map((offer) => {
    const score = purpose === "coding" ? offer.benchmarks?.coding ?? null : offer.benchmarks?.intelligence ?? null;
    return { offer, score, rating: score === null ? "unrated" : "scored", reason: score === null ? "Noch kein belastbarer Benchmark" : `${offer.benchmarks?.source}: ${score}` };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.offer.pricing.input + a.offer.pricing.output - (b.offer.pricing.input + b.offer.pricing.output));
}

// src/panel/views/overview.ts
function renderRanks(offers) {
  return Object.entries(labels).map(([purpose, label], index) => {
    const column = (mode) => {
      const ranked = rankOffers(offers, purpose, mode).filter((item) => item.rating === "scored").slice(0, 3);
      const title = mode === "free" ? "Kostenlos" : "Kostenpflichtig";
      return `<section class="rank-column price-${mode}"><h4><i></i>${title}</h4>${ranked.length ? `<ol>${ranked.map((item) => `<li><strong>${esc(item.offer.name)}</strong><small>Score ${item.score} \xB7 ${money(item.offer.pricing.input)} / ${money(item.offer.pricing.output)}</small></li>`).join("")}</ol>` : `<p class="empty">Keine belastbar bewerteten Modelle</p>`}</section>`;
    };
    return `<details class="purpose-block purpose-${purpose}" data-key="purpose-${purpose}"${index === 0 ? " open" : ""}><summary><span>${purposeIcon[purpose]}</span><strong>${label}</strong></summary><div class="rank-columns">${column("free")}${column("paid")}</div></details>`;
  }).join("");
}

// src/panel/index.ts
function prepare(state2) {
  const offers = state2.snapshots.flatMap((snapshot) => snapshot.offers);
  const assessments = state2.agents.map((agent) => assessAgent(agent, offers));
  return { state: state2, offers, free: offers.filter((offer) => isFreePricing(offer.pricing)).length, assessments, preview: assessments.slice(0, 4) };
}
var metricsInner = ({ state: state2, offers, free }) => `<span><strong>${offers.length}</strong>Modelle</span><span><strong>${free}</strong>kostenlos</span><span><strong>${state2.history.length}</strong>\xC4nderungen</span><span><strong>${state2.agents.length}</strong>Agenten</span>`;
var insightInner = ({ state: state2 }) => `<strong>\u2726 KI-Fazit</strong><span>${esc(state2.ai?.text ?? "Preis- und Agentendaten werden lokal ausgewertet.")}</span>`;
var ranksInner = ({ offers }) => `<h2>Beste Modelle f\xFCr deinen Zweck</h2>${renderRanks(offers)}`;
var overviewAgentsInner = ({ assessments, preview }) => `<div class="card-head"><h2>Deine Agenten</h2><button data-view="agents">Alle ${assessments.length}</button></div>${preview.length ? preview.map((item) => renderAgentRow(item, true)).join("") : `<p class="empty">Keine Agenten erkannt</p>`}${assessments.length > 4 ? `<button class="more" data-view="agents">Mehr Agenten anzeigen</button>` : ""}`;
var overviewAccountsInner = ({ state: state2 }) => `<div class="card-head"><h2>Konten &amp; Limits</h2><button data-view="accounts">Details</button></div>${state2.accounts.length ? state2.accounts.map(renderAccountSummary).join("") : `<p class="empty">Noch kein Konto verbunden</p>`}`;
var accountsInner = ({ state: state2 }) => `${renderOpenRouterSection(state2.accounts, state2.openRouterManagement)}${renderProviderSection("opencode-zen", state2.accounts)}${renderProviderSection("opencode-go", state2.accounts)}`;
function fragments(state2) {
  const view = prepare(state2);
  return {
    metrics: metricsInner(view),
    // In Etappe 1 dauerhaft leer; Etappe 2 fuellt die Kopfzeile Handlungsbedarf.
    attention: "",
    insight: insightInner(view),
    "overview-ranks": ranksInner(view),
    "overview-agents": overviewAgentsInner(view),
    "overview-accounts": overviewAccountsInner(view),
    models: modelRows(view.offers),
    agents: renderAgentGroups(view.assessments),
    accounts: accountsInner(view)
  };
}
function panelHtml(state2) {
  const nonce = (0, import_crypto.randomBytes)(16).toString("base64"), view = prepare(state2);
  const refreshError = state2.refreshError ? `<div class="notice error">Aktualisierung fehlgeschlagen: ${esc(state2.refreshError)}</div>` : "";
  const providerErrors = state2.snapshots.filter((snapshot) => snapshot.error).map((snapshot) => `<div class="notice error">${esc(snapshot.provider)}: ${esc(snapshot.error?.message)}${snapshot.offers.length ? ` \xB7 zeigt weiterhin die Preise vom ${esc(stamp(snapshot.checkedAt))}` : ""}</div>`).join("");
  const providerWarnings = state2.snapshots.filter((snapshot) => snapshot.warning).map((snapshot) => `<div class="notice warn">${esc(snapshot.provider)}: ${esc(snapshot.warning)}</div>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${CSS}${BENCHMARK_CSS}</style></head><body><header class="topbar"><button class="brand" data-view="overview">Preis-Watch</button><nav><button data-view="overview" class="active">\xDCbersicht</button><button data-view="models">Modelle</button><button data-view="agents">Agenten</button><button data-view="accounts">Konten &amp; Limits</button></nav><span class="live"><i></i>aktuell</span></header>${refreshError}${providerErrors}${providerWarnings}<main>
  <section class="view" id="overview"><div class="metrics" data-fragment="metrics">${metricsInner(view)}</div><div class="attention" data-fragment="attention"></div><div class="insight" data-fragment="insight">${insightInner(view)}</div><div class="dashboard"><section class="card rankings" data-fragment="overview-ranks">${ranksInner(view)}</section><section class="card agents-card" data-fragment="overview-agents">${overviewAgentsInner(view)}</section><section class="card accounts-card" data-fragment="overview-accounts">${overviewAccountsInner(view)}</section></div></section>
  <section class="view" id="models" hidden><div class="page-head"><div><h1>Alle Modelle</h1><p>${view.offers.length} Angebote von OpenRouter, Zen und Go</p></div></div>${modelFilters()}<div class="table-wrap"><table><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>F\xE4higkeiten</th><th>Benchmark</th></tr></thead><tbody data-fragment="models">${modelRows(view.offers)}</tbody></table></div></section>
  <section class="view" id="agents" hidden><div class="page-head"><div><h1>Deine Agenten</h1><p>Nach Handlungsbedarf und Qualit\xE4t geordnet</p></div></div><div class="agent-groups" data-fragment="agents">${renderAgentGroups(view.assessments)}</div></section>
  <section class="view" id="accounts" hidden><div class="page-head"><div><h1>Konten &amp; Limits</h1><p>Secrets bleiben ausschlie\xDFlich im lokalen VS Code Secret Store.</p></div></div><div class="provider-sections" data-fragment="accounts">${accountsInner(view)}</div></section></main><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
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
function norm(name) {
  return String(name).toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function splitTier(name) {
  const match = String(name).match(/^(.*?)\s*\(\s*(([≤>])\s*([\d.]+)K\s+tokens)\s*\)\s*$/i);
  if (!match) return { base: String(name).trim() };
  return { base: match[1].trim(), label: match[2].trim(), thresholdTokens: Math.round(Number(match[4]) * 1e3), upper: match[3] === ">" };
}
function toUsd(cell) {
  const value = String(cell ?? "").trim();
  if (/^free$/i.test(value)) return 0;
  const match = value.match(/^\$?(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) : void 0;
}
function toCount(cell) {
  const value = String(cell ?? "").trim().replace(/[,\s]/g, "");
  if (!/^\d+$/.test(value)) return void 0;
  return Number.parseInt(value, 10);
}
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
var isPriceHeader = (row) => /^Model/i.test(row[0] ?? "") && row.some((cell) => /^Input$/i.test(cell)) && row.some((cell) => /^Output$/i.test(cell));
var isRequestHeader = (row) => /^Model/i.test(row[0] ?? "") && row.some((cell) => /requests per/i.test(cell));
function requestQuota(mdx) {
  const quota = /* @__PURE__ */ new Map();
  let inTable = false;
  for (const line of mdx.split("\n")) {
    if (!line.startsWith("|")) continue;
    const row = cells(line);
    if (/^Model/i.test(row[0] ?? "")) {
      inTable = isRequestHeader(row);
      continue;
    }
    if (!inTable || !row[0] || /^-+$/.test(row[0])) continue;
    quota.set(norm(row[0]), { requestsPer5Hours: toCount(row[1]), requestsPerWeek: toCount(row[2]), requestsPerMonth: toCount(row[3]) });
  }
  return quota;
}
function parsePricing(mdx, provider) {
  const ids = idsFromDocument(mdx);
  const offers = [];
  const requests = provider === "opencode-go" ? requestQuota(mdx) : /* @__PURE__ */ new Map();
  let pricing = false, inPriceTable = false, usageColumn = -1;
  for (const line of mdx.split("\n")) {
    if (/^## (Pricing|Usage limits)/i.test(line)) {
      pricing = true;
      continue;
    }
    if (pricing && /^## /.test(line)) break;
    if (!pricing || !line.startsWith("|")) continue;
    const row = cells(line);
    if (/^Model/i.test(row[0] ?? "")) {
      inPriceTable = isPriceHeader(row);
      usageColumn = row.findIndex((cell) => /^Usage$/i.test(cell));
      continue;
    }
    if (!inPriceTable) continue;
    if (!row[0] || /^-+$/.test(row[0])) continue;
    const base = norm(row[0]);
    const id = ids.get(base) ?? ids.get(base.replace(/-tokens$/, ""));
    if (!id) continue;
    const step = splitTier(row[0]);
    const input = toUsd(row[1]), output = toUsd(row[2]);
    const existing = offers.find((offer) => offer.id === id);
    if (existing) {
      if (step.upper && step.thresholdTokens !== void 0) {
        existing.pricing.tiers = [...existing.pricing.tiers ?? [], { thresholdTokens: step.thresholdTokens, label: step.label, input: input ?? 0, output: output ?? 0 }].sort((a, b) => a.thresholdTokens - b.thresholdTokens);
      }
      continue;
    }
    const included = usageColumn > 0 ? toUsd(row[usageColumn]) ?? 0 : 0;
    const counted = requests.get(base) ?? requests.get(base.replace(/-tokens$/, ""));
    const quota = included || counted ? { ...counted, ...included ? { includedUsdPerMonth: included } : {} } : void 0;
    const unknown = input === void 0 || output === void 0;
    offers.push({ provider, id, name: step.base, ...step.label ? { tier: step.label } : {}, ...quota ? { quota } : {}, pricing: { input: input ?? 0, output: output ?? 0, ...unknown ? { unknown: true } : {}, cacheRead: toUsd(row[3]) ?? 0, cacheWrite: toUsd(row[4]) ?? 0 }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } });
  }
  return offers;
}
var parseZenDocument = (mdx) => parsePricing(mdx, "opencode-zen");
function requireOffers(provider, offers) {
  if (!offers.length) throw new Error(`${provider}: keine Preise im Dokument gefunden \u2014 Struktur ge\xE4ndert?`);
  return offers;
}
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
    const promptPrice = Number.parseFloat(model.pricing?.prompt ?? "");
    const completionPrice = Number.parseFloat(model.pricing?.completion ?? "");
    const unknown = !Number.isFinite(promptPrice) || !Number.isFinite(completionPrice) || promptPrice < 0 || completionPrice < 0;
    return {
      provider: "openrouter",
      id: model.id,
      benchmarkId: model.canonical_slug,
      name: model.name,
      description: model.description,
      pricing: {
        input: usdPerMillion(model.pricing?.prompt),
        output: usdPerMillion(model.pricing?.completion),
        unknown,
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
      benchmarks: model.benchmarks?.artificial_analysis ? { source: "OpenRouter / Artificial Analysis", match: "direct", intelligence: model.benchmarks.artificial_analysis.intelligence_index, coding: model.benchmarks.artificial_analysis.coding_index, agentic: model.benchmarks.artificial_analysis.agentic_index } : void 0
    };
  });
}
async function fetchOpenRouterCatalog() {
  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=all&sort=intelligence-high-to-low", { signal: AbortSignal.timeout(2e4) });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  return parseOpenRouterModels(await response.json());
}

// src/providers/openrouter-benchmarks.ts
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function parseOpenRouterBenchmarks(body, fetchedAt = Date.now()) {
  const items = [];
  for (const row of body.data ?? []) {
    if (typeof row.model_permaslug !== "string") continue;
    const common = {
      modelId: row.model_permaslug,
      modelName: typeof row.display_name === "string" ? row.display_name : void 0,
      lastRunAt: typeof row.last_run_timestamp === "string" ? row.last_run_timestamp : void 0,
      source: typeof row.source === "string" ? row.source : "openrouter"
    };
    if (typeof row.category === "string" && finite(row.win_rate)) {
      const stats = row.tournament_stats;
      items.push({
        ...common,
        benchmark: `arena_${row.category}`,
        score: row.win_rate,
        elo: finite(row.elo) ? row.elo : void 0,
        sampleCount: finite(stats?.total) ? stats.total : void 0
      });
      continue;
    }
    const share = finite(row.accuracy) ? row.accuracy : finite(row.primary_score) ? row.primary_score : void 0;
    if (typeof row.benchmark_type !== "string" || share === void 0) continue;
    items.push({
      ...common,
      benchmark: row.benchmark_type,
      score: share * 100,
      costPerTaskUsd: finite(row.avg_cost_per_task) ? row.avg_cost_per_task : void 0,
      sampleCount: finite(row.total_tasks) ? row.total_tasks : void 0
    });
  }
  return { fetchedAt, asOf: typeof body.meta?.as_of === "string" ? body.meta.as_of : void 0, citation: typeof body.meta?.citation === "string" ? body.meta.citation : void 0, items };
}
async function fetchOpenRouterBenchmarks(key) {
  const response = await fetch("https://openrouter.ai/api/v1/benchmarks", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2e4) });
  if (!response.ok) throw new Error(`OpenRouter Benchmarks HTTP ${response.status}`);
  return parseOpenRouterBenchmarks(await response.json());
}

// src/extension.ts
var ZEN_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx";
var GO_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx";
var HISTORY_KEY = "priceWatch.history.v3";
var SNAPSHOT_KEY = "priceWatch.snapshots.v3";
var AI_LAST_RUN_KEY = "priceWatch.aiLastRun.v1";
var secretKey = (provider) => `priceWatch.account.${provider}`;
var panel;
var statusBar;
var running;
var state = { snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 };
function localAgents() {
  const readScope = (root, configNames, fallbackModel = "") => {
    let defaultModel = fallbackModel;
    const configAgents = [];
    for (const name of configNames) try {
      const file = (0, import_path.join)(root, name), source = (0, import_fs.readFileSync)(file, "utf8");
      defaultModel = parseOpenCodeDefaultModel(source) || defaultModel;
      configAgents.push(...parseOpenCodeConfigAgents(source, file));
    } catch {
    }
    const markdownAgents = [];
    for (const directory of [(0, import_path.join)(root, "agents"), (0, import_path.join)(root, "agent")]) try {
      for (const file of (0, import_fs.readdirSync)(directory)) if (file.endsWith(".md")) markdownAgents.push({ ...parseAgentMarkdown(file, (0, import_fs.readFileSync)((0, import_path.join)(directory, file), "utf8"), defaultModel), source: (0, import_path.join)(directory, file) });
    } catch {
    }
    return { agents: mergeAgents(configAgents, markdownAgents), defaultModel };
  };
  const globalRoot = (0, import_path.join)((0, import_os.homedir)(), ".config", "opencode");
  const globalScope = readScope(globalRoot, ["opencode.json", "opencode.jsonc"]);
  const projectScopes = (vscode.workspace.workspaceFolders ?? []).map((folder) => readScope((0, import_path.join)(folder.uri.fsPath, ".opencode"), ["opencode.json", "opencode.jsonc"], globalScope.defaultModel).agents);
  return mergeAgents(globalScope.agents, ...projectScopes);
}
function refreshPanel() {
  if (panel) void panel.webview.postMessage({ type: "fragments", fragments: fragments(state) });
}
function buildPanel() {
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
    try {
      const previous = state.snapshots.flatMap((snapshot) => snapshot.offers);
      const openRouterKey = await context.secrets.get(secretKey("openrouter"));
      const benchmarkSnapshot = openRouterKey ? await loadBenchmarks(context.globalState, openRouterKey, manual, fetchOpenRouterBenchmarks) : context.globalState.get(BENCHMARK_CACHE_KEY) ?? null;
      const previousByProvider = new Map(state.snapshots.map((snapshot) => [snapshot.provider, snapshot]));
      const fresh = enrichProviderBenchmarks(await fetchAllProviders({
        openrouter: fetchOpenRouterCatalog,
        "opencode-zen": async () => requireOffers("opencode-zen", parseZenDocument(await fetchOpenCodeDocument(ZEN_URL))),
        "opencode-go": async () => requireOffers("opencode-go", parseGoDocument(await fetchOpenCodeDocument(GO_URL)).offers)
      }), benchmarkSnapshot).map((snapshot) => {
        const warning = plausibilityWarning(previousByProvider.get(snapshot.provider), snapshot);
        return warning ? { ...snapshot, warning } : snapshot;
      });
      const snapshots = carryForwardOffers(state.snapshots, fresh);
      const successful = snapshots.flatMap((snapshot) => snapshot.error ? [] : snapshot.offers);
      const changes = diffOffers(previous, successful);
      state = { ...state, snapshots, history: mergeHistory(state.history, changes), agents: localAgents(), updatedAt: Date.now(), refreshError: null };
      const settings = vscode.workspace.getConfiguration("priceWatch");
      const aiKey = openRouterKey;
      if (aiKey && shouldRunAi({ lastAt: context.globalState.get(AI_LAST_RUN_KEY) ?? null, now: Date.now(), everyHours: settings.get("aiEveryHours", 6), manual, hasChanges: changes.length > 0 })) {
        try {
          state.ai = await aiDashboardSummary(aiKey, state.agents, changes, settings.get("aiModel", "openrouter/free"));
        } catch (error) {
          state.ai = aiFailure(error);
        }
        await context.globalState.update(AI_LAST_RUN_KEY, Date.now());
      }
      await context.globalState.update(HISTORY_KEY, state.history);
      await context.globalState.update(SNAPSHOT_KEY, snapshots);
      if (changes.length && !manual) void vscode.window.showInformationMessage(`${summarizeChanges(changes)}. Preis-Watch \xF6ffnen?`, "\xD6ffnen").then((choice) => {
        if (choice) void vscode.commands.executeCommand("priceWatch.open");
      });
      updateStatus();
      refreshPanel();
    } catch (error) {
      state = { ...state, refreshError: error instanceof Error ? error.message : String(error) };
      updateStatus();
      refreshPanel();
    }
  })().finally(() => {
    running = void 0;
  });
  return running;
}
var VERIFIABLE = {
  openrouter: fetchOpenRouterAccount,
  "opencode-go": fetchOpenCodeGoAccount
};
async function verifyAccount(provider, token) {
  const check = VERIFIABLE[provider];
  return check ? await check(token) : unavailableAccount(provider, "Verbunden \xB7 nicht \xFCberpr\xFCfbar, kein Usage-Endpunkt");
}
async function connectAccount(context) {
  const provider = await vscode.window.showQuickPick(["openrouter", "opencode-zen", "opencode-go", "claude-code"], { title: "Konto ausdr\xFCcklich verbinden" });
  if (!provider) return;
  const token = await vscode.window.showInputBox({ title: `${provider} Zugang`, password: true, prompt: "Wird nur im VS Code Secret Store dieses Ger\xE4ts gespeichert" });
  if (!token) return;
  let account;
  try {
    account = await verifyAccount(provider, token.trim());
  } catch (error) {
    void vscode.window.showErrorMessage(`Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  await context.secrets.store(secretKey(provider), token.trim());
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
async function connectOpenRouterManagement(context) {
  const token = await vscode.window.showInputBox({ title: "OpenRouter Management Key verbinden", password: true, prompt: "Nur Lesezugriff auf Guthaben und vorhandene API-Key-Verbrauchsdaten. Speicherung ausschlie\xDFlich im lokalen VS Code Secret Store." });
  if (!token) return;
  try {
    const management = await fetchOpenRouterManagement(token.trim());
    await context.secrets.store(secretKey("openrouter-management"), token.trim());
    state.openRouterManagement = management;
    refreshPanel();
  } catch (error) {
    void vscode.window.showErrorMessage(`Management-Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function disconnectOpenRouterManagement(context) {
  await context.secrets.delete(secretKey("openrouter-management"));
  state.openRouterManagement = null;
  refreshPanel();
}
async function refreshConnectedAccounts(context) {
  const providers = ["openrouter", "opencode-zen", "opencode-go", "claude-code"];
  const accounts = [];
  for (const provider of providers) {
    const token = await context.secrets.get(secretKey(provider));
    if (!token) continue;
    try {
      accounts.push(await verifyAccount(provider, token));
    } catch (error) {
      accounts.push(unavailableAccount(provider, error instanceof Error ? error.message : String(error)));
    }
  }
  state.accounts = accounts;
  const managementKey = await context.secrets.get(secretKey("openrouter-management"));
  if (!managementKey) state.openRouterManagement = null;
  else try {
    state.openRouterManagement = await fetchOpenRouterManagement(managementKey);
  } catch (error) {
    state.openRouterManagement = { state: "unavailable", totalCreditsUsd: 0, totalUsageUsd: 0, remainingCreditsUsd: 0, keys: [], message: error instanceof Error ? error.message : String(error) };
  }
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
        if (message?.type === "connect-management") void connectOpenRouterManagement(context);
        if (message?.type === "disconnect-management") void disconnectOpenRouterManagement(context);
        if (message?.type === "ready") refreshPanel();
      });
      buildPanel();
    } else {
      panel.reveal();
      refreshPanel();
    }
  }), vscode.commands.registerCommand("priceWatch.refresh", () => refresh(context, true)), vscode.commands.registerCommand("priceWatch.setKey", () => connectAccount(context)), vscode.commands.registerCommand("priceWatch.connectAccount", () => connectAccount(context)), vscode.commands.registerCommand("priceWatch.disconnectAccount", () => disconnectAccount(context)), vscode.commands.registerCommand("priceWatch.connectOpenRouterManagement", () => connectOpenRouterManagement(context)));
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
