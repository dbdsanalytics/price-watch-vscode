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

// src/panel.ts
var import_crypto = require("crypto");

// src/agents/assessment.ts
function assessAgent(agent, offers) {
  const current = offers.find((offer) => agent.model.endsWith(offer.id));
  if (!current) return { agent, status: "unknown", reason: "Aktuelles Modell nicht im Katalog" };
  if (current.deprecatedAt) return { agent, status: "deprecated", reason: `Abgek\xFCndigt: ${current.deprecatedAt}` };
  const codingAgent = /code|review|build|debug|develop/i.test(`${agent.name} ${agent.description}`);
  if (codingAgent && !current.capabilities.purposes.includes("coding")) return { agent, status: "unsuitable", reason: "Keine belastbaren Coding-F\xE4higkeiten ausgewiesen" };
  const currentCost = current.pricing.input + current.pricing.output;
  const currentScore = current.benchmarks?.coding;
  const alternative = currentScore === void 0 ? void 0 : offers.filter((offer) => offer.id !== current.id && (!codingAgent || offer.capabilities.purposes.includes("coding"))).filter((offer) => offer.benchmarks?.coding !== void 0 && offer.benchmarks.coding >= currentScore * 0.9).filter((offer) => offer.pricing.input + offer.pricing.output < currentCost * 0.7).sort((a, b) => (b.benchmarks?.coding ?? 0) - (a.benchmarks?.coding ?? 0))[0];
  return alternative ? { agent, status: "alternative-available", reason: "Mindestens 30 % g\xFCnstigere Alternative verf\xFCgbar", alternative } : { agent, status: "suitable", reason: "F\xE4higkeiten und Preis weiterhin passend" };
}

// src/domain/ranking.ts
function rankOffers(offers, purpose, priceMode) {
  return offers.filter((offer) => !offer.pricing.unknown && offer.capabilities.outputModalities.includes("text")).filter((offer) => offer.capabilities.purposes.includes(purpose)).filter((offer) => {
    const free = offer.pricing.input + offer.pricing.output === 0;
    return priceMode === "all" || (priceMode === "free" ? free : !free);
  }).map((offer) => {
    const score = purpose === "coding" ? offer.benchmarks?.coding ?? null : offer.benchmarks?.intelligence ?? null;
    return { offer, score, rating: score === null ? "unrated" : "scored", reason: score === null ? "Noch kein belastbarer Benchmark" : `${offer.benchmarks?.source}: ${score}` };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.offer.pricing.input + a.offer.pricing.output - (b.offer.pricing.input + b.offer.pricing.output));
}

// src/panel.ts
var esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var price = (value, unknown) => unknown ? "\u2013" : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value);
var labels = { coding: "Coding", language: "Sprache", reasoning: "Reasoning", vision: "Vision", tools: "Tools", allround: "Allround" };
var statusLabel = { suitable: "Passend", expensive: "Teuer", "alternative-available": "Alternative", unsuitable: "Unpassend", deprecated: "Veraltet", unknown: "Unklar" };
var ACCOUNT_CSS = `.account-main{min-width:0}.account-main>*{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-usage{color:var(--vscode-descriptionForeground);font-size:.82em}.account-item .status{max-width:220px}`;
function renderAgent(assessment, compact = false) {
  const { agent, status, reason, alternative } = assessment;
  return `<article class="agent-item ${compact ? "agent-preview" : ""}"><div class="agent-main"><strong>${esc(agent.name)}</strong><span class="agent-model">${esc(agent.model || "Kein Modell zugewiesen")}</span>${compact ? "" : `<span class="subtle">${esc(reason)}</span>`}</div><span class="status status-${status}">${esc(statusLabel[status])}</span>${!compact && alternative ? `<div class="agent-alt">Empfehlung: <strong>${esc(alternative.name)}</strong></div>` : ""}</article>`;
}
function renderAccount(account) {
  const value = account.remainingUsd !== void 0 ? `${price(account.remainingUsd)} $ verf\xFCgbar` : account.state === "available" ? "Verbunden \xB7 kein festes Schl\xFCssellimit" : account.message ?? "Verbrauch nicht abrufbar";
  const usage = [["Heute", account.dailyUsd], ["Woche", account.weeklyUsd], ["Monat", account.monthlyUsd]].filter((item) => item[1] !== void 0).map(([period, amount]) => `${period} ${price(amount)} $`).join(" \xB7 ");
  return `<article class="account-item"><div class="account-main"><strong>${esc(account.provider)}</strong>${account.label ? `<span class="subtle">${esc(account.label)}</span>` : ""}${usage ? `<span class="account-usage">${esc(usage)}</span>` : ""}</div><span class="status status-${account.state === "available" ? "suitable" : account.state}">${esc(value)}</span></article>`;
}
function renderRanks(offers) {
  return Object.entries(labels).map(([purpose, label], index) => {
    const list = (mode) => {
      const ranked = rankOffers(offers, purpose, mode).filter((item) => item.rating === "scored").slice(0, 3);
      return ranked.length ? `<ol>${ranked.map((item) => `<li><span>${esc(item.offer.name)}</span><small>${item.score} \xB7 ${price(item.offer.pricing.input)}/${price(item.offer.pricing.output)} $</small></li>`).join("")}</ol>` : `<p class="empty">Noch keine belastbar bewerteten Modelle</p>`;
    };
    return `<details${index === 0 ? " open" : ""}><summary>${label}</summary><div class="rank-columns"><div><h4>Kostenlos</h4>${list("free")}</div><div><h4>Kostenpflichtig</h4>${list("paid")}</div></div></details>`;
  }).join("");
}
function panelHtml(state2) {
  const nonce = (0, import_crypto.randomBytes)(16).toString("base64");
  const offers = state2.snapshots.flatMap((snapshot) => snapshot.offers);
  const free = offers.filter((offer) => isFreePricing(offer.pricing)).length;
  const assessments = state2.agents.map((agent) => assessAgent(agent, offers));
  const previews = assessments.slice(0, 4).map((item) => renderAgent(item, true)).join("") || `<p class="empty">Keine Agenten erkannt</p>`;
  const allAgents = assessments.map((item) => renderAgent(item)).join("") || `<p class="empty">Keine Agenten erkannt</p>`;
  const accounts = state2.accounts.map(renderAccount).join("") || `<p class="empty">Noch kein Konto verbunden</p>`;
  const rows = offers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((offer) => `<tr data-model="${esc(`${offer.name} ${offer.provider} ${offer.capabilities.purposes.join(" ")}`.toLowerCase())}" data-provider="${offer.provider}" data-price="${isFreePricing(offer.pricing) ? "free" : offer.pricing.unknown ? "unknown" : "paid"}"><td><strong>${esc(offer.name)}</strong><small>${esc(offer.id)}</small></td><td><span class="provider provider-${offer.provider}">${esc(offer.provider.replace("opencode-", ""))}</span></td><td>${price(offer.pricing.input, offer.pricing.unknown)}</td><td>${price(offer.pricing.output, offer.pricing.unknown)}</td><td><div class="tags">${offer.capabilities.purposes.map((tag) => `<span>${esc(labels[tag])}</span>`).join("")}</div></td></tr>`).join("");
  const providerErrors = state2.snapshots.filter((snapshot) => snapshot.error).map((snapshot) => `<div class="notice error">${esc(snapshot.provider)}: ${esc(snapshot.error?.message)}</div>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${CSS}${ACCOUNT_CSS}</style></head><body>
  <header class="topbar"><button class="brand" data-view="overview">Preis-Watch</button><nav><button data-view="overview" class="active">\xDCbersicht</button><button data-view="models">Modelle</button><button data-view="agents">Agenten</button><button data-view="accounts">Konten &amp; Limits</button></nav><span class="live"><i></i> aktuell</span></header>${providerErrors}
  <main><section class="view" id="overview"><div class="metrics"><span><strong>${offers.length}</strong> Modelle</span><span><strong>${free}</strong> kostenlos</span><span><strong>${state2.history.length}</strong> \xC4nderungen</span><span><strong>${state2.agents.length}</strong> Agenten</span></div><div class="insight"><strong>\u2726 KI-Fazit</strong><span>${esc(state2.ai?.text ?? "Preis- und Agentendaten werden lokal ausgewertet.")}</span></div><div class="dashboard"><section class="card rankings"><h2>Beste Modelle f\xFCr deinen Zweck</h2>${renderRanks(offers)}</section><section class="card agents-card"><div class="card-head"><h2>Deine Agenten</h2><button data-view="agents">Alle ${assessments.length}</button></div>${previews}${assessments.length > 4 ? `<button class="more" data-view="agents">Mehr Agenten anzeigen</button>` : ""}</section><section class="card accounts-card"><div class="card-head"><h2>Konten &amp; Limits</h2><button data-view="accounts">Details</button></div>${accounts}</section></div></section>
  <section class="view" id="models" hidden><div class="page-head"><div><h1>Alle Modelle</h1><p>${offers.length} Angebote von OpenRouter, Zen und Go</p></div></div><div class="filters"><input id="search" placeholder="Modelle durchsuchen"><select id="provider"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="price"><option value="">Alle Preise</option><option value="free">Kostenlos</option><option value="paid">Kostenpflichtig</option><option value="unknown">Preis auf Anfrage</option></select><select id="purpose"><option value="">Alle F\xE4higkeiten</option>${Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>F\xE4higkeiten</th></tr></thead><tbody>${rows}</tbody></table></div></section>
  <section class="view" id="agents" hidden><div class="page-head"><div><h1>Deine Agenten</h1><p>Aktuelle Modellzuordnung und nachvollziehbare Empfehlungen</p></div></div><div class="agent-list">${allAgents}</div></section>
  <section class="view" id="accounts" hidden><div class="page-head"><div><h1>Konten &amp; Limits</h1><p>Verbindungen werden ausschlie\xDFlich im lokalen VS Code Secret Store gespeichert.</p></div><div><button class="primary" data-action="connect">Konto verbinden</button><button data-action="disconnect">Verbindung entfernen</button></div></div><div class="account-grid">${accounts}</div></section></main>
  <script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
var SCRIPT = `const vscode=acquireVsCodeApi();const show=id=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));scrollTo(0,0)};document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:b.dataset.action})));const filter=()=>{const q=search.value.toLowerCase(),p=provider.value,c=price.value,u=purpose.value;document.querySelectorAll('[data-model]').forEach(r=>r.hidden=!(r.dataset.model.includes(q)&&(!p||r.dataset.provider===p)&&(!c||r.dataset.price===c)&&(!u||r.dataset.model.includes(u))))};['search','provider','price','purpose'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',filter));`;
var CSS = `:root{color-scheme:light dark;--accent:#a78bfa;--mint:#4ade80;--warn:#fbbf24;--danger:#fb7185}*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:var(--vscode-font-size)/1.4 var(--vscode-font-family)}button,input,select{font:inherit}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:22px;min-height:44px;padding:0 16px;border-bottom:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-editor-background) 94%,transparent);backdrop-filter:blur(12px)}button{border:1px solid var(--vscode-button-border,transparent);border-radius:5px;padding:5px 10px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}.topbar button{border:0;padding:11px 0;background:none;color:var(--vscode-descriptionForeground)}.topbar .brand{font-weight:700;color:var(--vscode-foreground)}.topbar nav{display:flex;gap:20px}.topbar nav button.active{color:var(--accent);box-shadow:inset 0 -2px var(--accent)}.live{margin-left:auto;color:var(--vscode-descriptionForeground)}.live i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--mint)}main{padding:12px 16px}.metrics{display:flex;flex-wrap:wrap;gap:10px 30px;padding:3px 2px 10px;color:var(--vscode-descriptionForeground)}.metrics strong{font-size:1.35em;color:var(--vscode-foreground)}.insight{display:flex;gap:8px;padding:7px 10px;margin-bottom:7px;border-left:3px solid var(--accent);border-radius:4px;background:color-mix(in srgb,var(--accent) 14%,var(--vscode-editorWidget-background))}.insight strong{white-space:nowrap;color:#d8b4fe}.dashboard{display:grid;grid-template-columns:minmax(360px,2fr) minmax(220px,1fr) minmax(220px,1fr);gap:7px;align-items:start}.card{min-width:0;padding:8px 10px;border:1px solid var(--vscode-panel-border);border-radius:8px;background:var(--vscode-editorWidget-background)}h1,h2,h4,p{margin:0}h1{font-size:1.5em}h2{font-size:1em;margin-bottom:5px}h4{font-size:.9em;color:var(--vscode-descriptionForeground)}details{border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 55%,transparent)}details:first-of-type{border-top:0}summary{padding:4px 0;cursor:pointer}.rank-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px 0 6px}.rank-columns ol{margin:2px 0 0;padding-left:20px}.rank-columns li{padding:2px 0}.rank-columns li span,.rank-columns li small{display:block}.rank-columns li small,.subtle,.agent-model,.empty,.page-head p{color:var(--vscode-descriptionForeground);font-size:.88em}.card-head,.page-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.card-head button{padding:2px 6px;background:none;color:var(--accent)}.agent-item,.account-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center;padding:5px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 45%,transparent)}.agent-item:last-of-type,.account-item:last-of-type{border-bottom:0}.agent-main{min-width:0}.agent-main>*{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82em;font-weight:600}.status-suitable,.status-available{color:var(--mint)}.status-alternative-available,.status-low{color:var(--warn)}.status-deprecated,.status-unsuitable,.status-exhausted{color:var(--danger)}.status-unknown,.status-unavailable,.status-disconnected{color:var(--vscode-descriptionForeground)}.agent-alt{grid-column:1/-1;color:var(--vscode-descriptionForeground);font-size:.88em}.more{width:100%;margin-top:5px;background:none;color:var(--accent)}.page-head{margin:5px 0 12px}.page-head>div:last-child{display:flex;gap:6px}.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.filters{display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,minmax(130px,auto));gap:6px;margin-bottom:8px}.filters input,.filters select{min-width:0;padding:6px 8px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:5px;color:var(--vscode-input-foreground);background:var(--vscode-input-background)}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:7px}table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border-bottom:1px solid var(--vscode-panel-border);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--vscode-editorWidget-background);color:var(--vscode-descriptionForeground)}td small{display:block;color:var(--vscode-descriptionForeground)}.provider,.tags span{display:inline-block;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--accent) 15%,transparent);font-size:.82em}.tags{display:flex;flex-wrap:wrap;gap:3px}.agent-list,.account-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:7px}.agent-list .agent-item,.account-grid .account-item{padding:9px 10px;border:1px solid var(--vscode-panel-border);border-radius:7px;background:var(--vscode-editorWidget-background)}.notice{margin:8px 16px;padding:7px 10px;border-radius:5px}.notice.error{border-left:3px solid var(--danger);background:color-mix(in srgb,var(--danger) 12%,transparent)}.view[hidden],[data-model][hidden]{display:none}@media(max-width:1050px){.dashboard{grid-template-columns:minmax(340px,1.5fr) minmax(240px,1fr)}.accounts-card{grid-column:2}.filters{grid-template-columns:1fr 1fr}}@media(max-width:700px){.topbar{gap:12px;overflow-x:auto}.topbar nav{gap:12px}.dashboard{grid-template-columns:1fr}.accounts-card{grid-column:auto}.insight{display:block}.insight strong{display:block;margin-bottom:2px}.filters{grid-template-columns:1fr}.rank-columns{grid-template-columns:1fr}.metrics{gap:6px 16px}.table-wrap{border-left:0;border-right:0}.agent-list,.account-grid{grid-template-columns:1fr}}`;

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
  const offers = [];
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
    offers.push({ provider, id, name: row[0], pricing: { input: toUsd(row[1]), output: toUsd(row[2]), cacheRead: toUsd(row[3]), cacheWrite: toUsd(row[4]) }, capabilities: { inputModalities: ["text"], outputModalities: ["text"], tools: true, structuredOutput: false, reasoning: true, contextLength: null, purposes: ["coding", "tools"] } });
  }
  return offers;
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
    const promptPrice = Number.parseFloat(model.pricing?.prompt ?? "");
    const completionPrice = Number.parseFloat(model.pricing?.completion ?? "");
    const unknown = !Number.isFinite(promptPrice) || !Number.isFinite(completionPrice) || promptPrice < 0 || completionPrice < 0;
    return {
      provider: "openrouter",
      id: model.id,
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
      benchmarks: model.benchmarks?.artificial_analysis ? { source: "OpenRouter / Artificial Analysis", intelligence: model.benchmarks.artificial_analysis.intelligence_index, coding: model.benchmarks.artificial_analysis.coding_index, agentic: model.benchmarks.artificial_analysis.agentic_index } : void 0
    };
  });
}
async function fetchOpenRouterCatalog() {
  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=all&sort=intelligence-high-to-low", { signal: AbortSignal.timeout(2e4) });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  return parseOpenRouterModels(await response.json());
}

// src/extension.ts
var ZEN_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx";
var GO_URL = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx";
var HISTORY_KEY = "priceWatch.history.v3";
var SNAPSHOT_KEY = "priceWatch.snapshots.v3";
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
