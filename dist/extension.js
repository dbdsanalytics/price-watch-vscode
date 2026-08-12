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
var money = (value) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value)} $`;
var labels = { coding: "Coding", language: "Sprache", reasoning: "Reasoning", vision: "Vision", tools: "Tools", allround: "Allround" };
var purposeIcon = { coding: "\u2318", language: "A", reasoning: "\u25C7", vision: "\u25C9", tools: "\u2699", allround: "\u2726" };
var statusLabel = { suitable: "Passend", expensive: "Teuer", "alternative-available": "Alternative", unsuitable: "Unpassend", deprecated: "Veraltet", local: "Lokal", unknown: "Nicht bewertbar" };
function purposeBadge(purpose) {
  return `<span class="badge purpose purpose-${purpose}"><b>${purposeIcon[purpose]}</b>${labels[purpose]}</span>`;
}
function providerBadge(provider) {
  return `<span class="badge provider provider-${provider}"><i></i>${esc(provider === "openrouter" ? "OpenRouter" : provider === "opencode-zen" ? "Zen" : "Go")}</span>`;
}
function priceClass(offer) {
  return isFreePricing(offer.pricing) ? "free" : offer.pricing.unknown ? "unknown" : "paid";
}
function renderRanks(offers) {
  return Object.entries(labels).map(([purpose, label], index) => {
    const column = (mode) => {
      const ranked = rankOffers(offers, purpose, mode).filter((item) => item.rating === "scored").slice(0, 3);
      const title = mode === "free" ? "Kostenlos" : "Kostenpflichtig";
      return `<section class="rank-column price-${mode}"><h4><i></i>${title}</h4>${ranked.length ? `<ol>${ranked.map((item) => `<li><strong>${esc(item.offer.name)}</strong><small>Score ${item.score} \xB7 ${money(item.offer.pricing.input)} / ${money(item.offer.pricing.output)}</small></li>`).join("")}</ol>` : `<p class="empty">Keine belastbar bewerteten Modelle</p>`}</section>`;
    };
    return `<details class="purpose-block purpose-${purpose}"${index === 0 ? " open" : ""}><summary><span>${purposeIcon[purpose]}</span><strong>${label}</strong></summary><div class="rank-columns">${column("free")}${column("paid")}</div></details>`;
  }).join("");
}
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
function accountValue(account) {
  if (account.remainingUsd !== void 0) return `${money(account.remainingUsd)} verf\xFCgbar`;
  if (account.state === "available") return "Verbunden \xB7 kein festes Schl\xFCssellimit";
  return account.message ?? "Verbrauch nicht automatisch abrufbar";
}
function renderAccountSummary(account) {
  const usage = [["Heute", account.dailyUsd], ["Woche", account.weeklyUsd], ["Monat", account.monthlyUsd]].filter((item) => item[1] !== void 0).map(([period, value]) => `${period} ${money(value)}`).join(" \xB7 ");
  return `<div class="account-summary"><div><strong>${esc(account.provider)}</strong>${account.label ? `<small>${esc(account.label)}</small>` : ""}${usage ? `<small class="account-usage">${esc(usage)}</small>` : ""}</div><span class="status status-${account.state}">${esc(accountValue(account))}</span></div>`;
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
function panelHtml(state2) {
  const nonce = (0, import_crypto.randomBytes)(16).toString("base64"), offers = state2.snapshots.flatMap((snapshot) => snapshot.offers), free = offers.filter((offer) => isFreePricing(offer.pricing)).length;
  const assessments = state2.agents.map((agent) => assessAgent(agent, offers)), preview = assessments.slice(0, 4);
  const modelRows = offers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((offer) => `<tr data-model="${esc(`${offer.name} ${offer.provider} ${offer.capabilities.purposes.join(" ")}`.toLowerCase())}" data-provider="${offer.provider}" data-price="${priceClass(offer)}"><td><strong>${esc(offer.name)}</strong><small>${esc(offer.id)}</small></td><td>${providerBadge(offer.provider)}</td><td><span class="price price-${priceClass(offer)}">${offer.pricing.unknown ? "Preis unbekannt" : money(offer.pricing.input)}</span></td><td><span class="price price-${priceClass(offer)}">${offer.pricing.unknown ? "Preis unbekannt" : money(offer.pricing.output)}</span></td><td><div class="capabilities">${offer.capabilities.purposes.map(purposeBadge).join("")}</div></td></tr>`).join("");
  const providerErrors = state2.snapshots.filter((snapshot) => snapshot.error).map((snapshot) => `<div class="notice error">${esc(snapshot.provider)}: ${esc(snapshot.error?.message)}</div>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${CSS}</style></head><body><header class="topbar"><button class="brand" data-view="overview">Preis-Watch</button><nav><button data-view="overview" class="active">\xDCbersicht</button><button data-view="models">Modelle</button><button data-view="agents">Agenten</button><button data-view="accounts">Konten &amp; Limits</button></nav><span class="live"><i></i>aktuell</span></header>${providerErrors}<main>
  <section class="view" id="overview"><div class="metrics"><span><strong>${offers.length}</strong>Modelle</span><span><strong>${free}</strong>kostenlos</span><span><strong>${state2.history.length}</strong>\xC4nderungen</span><span><strong>${state2.agents.length}</strong>Agenten</span></div><div class="insight"><strong>\u2726 KI-Fazit</strong><span>${esc(state2.ai?.text ?? "Preis- und Agentendaten werden lokal ausgewertet.")}</span></div><div class="dashboard"><section class="card rankings"><h2>Beste Modelle f\xFCr deinen Zweck</h2>${renderRanks(offers)}</section><section class="card agents-card"><div class="card-head"><h2>Deine Agenten</h2><button data-view="agents">Alle ${assessments.length}</button></div>${preview.length ? preview.map((item) => renderAgentRow(item, true)).join("") : `<p class="empty">Keine Agenten erkannt</p>`}${assessments.length > 4 ? `<button class="more" data-view="agents">Mehr Agenten anzeigen</button>` : ""}</section><section class="card accounts-card"><div class="card-head"><h2>Konten &amp; Limits</h2><button data-view="accounts">Details</button></div>${state2.accounts.length ? state2.accounts.map(renderAccountSummary).join("") : `<p class="empty">Noch kein Konto verbunden</p>`}</section></div></section>
  <section class="view" id="models" hidden><div class="page-head"><div><h1>Alle Modelle</h1><p>${offers.length} Angebote von OpenRouter, Zen und Go</p></div></div><div class="filters"><input id="search" placeholder="Modelle durchsuchen"><select id="provider"><option value="">Alle Anbieter</option><option value="openrouter">OpenRouter</option><option value="opencode-zen">OpenCode Zen</option><option value="opencode-go">OpenCode Go</option></select><select id="price"><option value="">Alle Preise</option><option value="free">Kostenlos</option><option value="paid">Kostenpflichtig</option><option value="unknown">Preis unbekannt</option></select><select id="purpose"><option value="">Alle F\xE4higkeiten</option>${Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Modell</th><th>Anbieter</th><th>Input / 1M</th><th>Output / 1M</th><th>F\xE4higkeiten</th></tr></thead><tbody>${modelRows}</tbody></table></div></section>
  <section class="view" id="agents" hidden><div class="page-head"><div><h1>Deine Agenten</h1><p>Nach Handlungsbedarf und Qualit\xE4t geordnet</p></div></div><div class="agent-groups">${renderAgentGroups(assessments)}</div></section>
  <section class="view" id="accounts" hidden><div class="page-head"><div><h1>Konten &amp; Limits</h1><p>Secrets bleiben ausschlie\xDFlich im lokalen VS Code Secret Store.</p></div></div><div class="provider-sections">${renderOpenRouterSection(state2.accounts, state2.openRouterManagement)}${renderProviderSection("opencode-zen", state2.accounts)}${renderProviderSection("opencode-go", state2.accounts)}</div></section></main><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
var SCRIPT = `const vscode=acquireVsCodeApi();const show=id=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));scrollTo(0,0)};document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:b.dataset.action})));const filter=()=>{const q=search.value.toLowerCase(),p=provider.value,c=price.value,u=purpose.value;document.querySelectorAll('[data-model]').forEach(r=>r.hidden=!(r.dataset.model.includes(q)&&(!p||r.dataset.provider===p)&&(!c||r.dataset.price===c)&&(!u||r.dataset.model.includes(u))))};['search','provider','price','purpose'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',filter));`;
var CSS = `
:root{color-scheme:light dark;--violet:#a78bfa;--blue:#60a5fa;--cyan:#2dd4bf;--pink:#f472b6;--yellow:#facc15;--green:#4ade80;--orange:#fb923c;--muted:var(--vscode-descriptionForeground)}*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:var(--vscode-font-size)/1.4 var(--vscode-font-family)}button,input,select{font:inherit}button{border:1px solid var(--vscode-button-border,var(--vscode-panel-border));border-radius:6px;padding:5px 9px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:24px;min-height:44px;padding:0 16px;border-bottom:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-editor-background) 94%,transparent);backdrop-filter:blur(12px)}.topbar button{border:0;padding:11px 0;background:none;color:var(--muted)}.topbar .brand{font-weight:750;color:var(--vscode-foreground)}.topbar nav{display:flex;gap:20px}.topbar nav button.active{color:var(--violet);box-shadow:inset 0 -2px var(--violet)}.live{display:flex;align-items:center;gap:6px;margin-left:auto;color:var(--muted)}.live i{width:8px;height:8px;border-radius:50%;background:var(--green)}main{padding:12px 16px}.view[hidden],[data-model][hidden]{display:none}h1,h2,h3,h4,p{margin:0}h1{font-size:1.55em}h2{font-size:1.05em}.page-head{margin:5px 0 12px}.page-head p,.empty{color:var(--muted)}.metrics{display:flex;flex-wrap:wrap;gap:8px 28px;padding:2px 2px 10px;color:var(--muted)}.metrics span{display:flex;align-items:baseline;gap:5px}.metrics strong{font-size:1.4em;color:var(--vscode-foreground)}.insight{display:flex;gap:8px;padding:7px 10px;margin-bottom:8px;border-left:3px solid var(--violet);border-radius:5px;background:color-mix(in srgb,var(--violet) 15%,var(--vscode-editorWidget-background))}.insight strong{white-space:nowrap;color:#d8b4fe}.dashboard{display:grid;grid-template-columns:minmax(360px,2fr) minmax(220px,1fr) minmax(220px,1fr);gap:8px;align-items:start}.card{min-width:0;padding:10px;border:1px solid var(--vscode-panel-border);border-radius:9px;background:var(--vscode-editorWidget-background)}.card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}.card-head button,.more{color:var(--violet);background:none}.purpose-block{border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 60%,transparent)}.purpose-block:first-of-type{border-top:0}.purpose-block summary{display:flex;align-items:center;gap:8px;padding:7px 2px;cursor:pointer}.purpose-block summary span{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:color-mix(in srgb,currentColor 16%,transparent);font-weight:800}.purpose-block summary strong{font-size:1.12em}.purpose-coding{color:var(--blue)}.purpose-language{color:var(--cyan)}.purpose-reasoning{color:var(--violet)}.purpose-vision{color:var(--pink)}.purpose-tools{color:var(--yellow)}.purpose-allround{color:#94a3b8}.rank-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 0 8px 30px;color:var(--vscode-foreground)}.rank-column{padding:7px 8px;border-radius:7px;background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)}.rank-column h4{display:flex;align-items:center;gap:6px}.rank-column h4 i{width:8px;height:8px;border-radius:50%}.price-free h4{color:var(--green)}.price-free h4 i{background:var(--green)}.price-paid h4{color:var(--orange)}.price-paid h4 i{background:var(--orange)}.rank-column ol{margin:4px 0 0;padding-left:20px}.rank-column li{padding:2px 0}.rank-column li strong,.rank-column li small{display:block}.rank-column li small{color:var(--muted)}.badge{display:inline-flex;align-items:center;gap:4px;width:max-content;border:1px solid color-mix(in srgb,currentColor 32%,transparent);border-radius:999px;padding:1px 6px;background:color-mix(in srgb,currentColor 13%,transparent);font-size:.8em}.badge b{font-size:.85em}.provider i{width:6px;height:6px;border-radius:2px;background:currentColor}.provider-openrouter{color:var(--violet)}.provider-opencode-zen{color:var(--cyan)}.provider-opencode-go{color:var(--blue)}.agent-preview{padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 50%,transparent)}.agent-preview .agent-model span,.agent-preview .agent-identity .badge{display:none}.agent-preview .agent-result small{display:none}.more{width:100%;margin-top:6px}.agent-groups{display:grid;gap:12px}.agent-group{overflow:hidden;border:1px solid var(--vscode-panel-border);border-radius:10px;background:var(--vscode-editorWidget-background)}.agent-group>header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border)}.agent-group>header p{color:var(--muted);font-size:.88em}.agent-group>header>span{min-width:28px;padding:3px 8px;border-radius:999px;text-align:center;background:var(--vscode-badge-background)}.agent-group-attention{border-left:3px solid var(--orange)}.agent-group-suitable{border-left:3px solid var(--green)}.agent-group-unknown{border-left:3px solid #94a3b8}.agent-row{display:grid;grid-template-columns:minmax(170px,.8fr) minmax(240px,1.3fr) minmax(190px,1fr);gap:12px;align-items:center;min-width:0;padding:8px 12px;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 55%,transparent)}.agent-row:last-child{border-bottom:0}.agent-identity,.agent-model,.agent-result{min-width:0}.agent-identity{display:flex;align-items:center;gap:8px}.agent-model span,.agent-result small{display:block;color:var(--muted);font-size:.82em}.agent-model strong{display:block;overflow-wrap:anywhere}.agent-result{text-align:right}.status{font-weight:700}.status-suitable,.status-available,.key-state-active{color:var(--green)}.status-alternative-available,.status-expensive,.status-low{color:var(--orange)}.status-deprecated,.status-unsuitable,.status-exhausted,.key-state-disabled,.key-state-expired{color:var(--vscode-errorForeground)}.status-unknown,.status-unavailable,.status-disconnected{color:var(--muted)}.group-empty{padding:12px}.filters{display:grid;grid-template-columns:minmax(190px,1fr) repeat(3,minmax(130px,auto));gap:6px;margin-bottom:8px}.filters input,.filters select{min-width:0;padding:7px 8px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background)}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:9px}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);text-align:left;vertical-align:middle}th{position:sticky;top:44px;z-index:2;background:var(--vscode-editorWidget-background);color:var(--muted)}td>strong,td>small{display:block}td>small{color:var(--muted)}.capabilities{display:flex;flex-wrap:wrap;gap:4px}.price{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.price:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.price-free{color:var(--green)}.price-paid{color:var(--orange)}.price-unknown{color:var(--muted)}.provider-sections{display:grid;gap:12px}.account-provider-section{overflow:hidden;border:1px solid var(--vscode-panel-border);border-left:3px solid currentColor;border-radius:10px;background:var(--vscode-editorWidget-background);color:var(--vscode-foreground)}.account-provider-section>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-bottom:1px solid var(--vscode-panel-border)}.account-provider-section>header p{color:var(--muted)}.provider-title{display:flex;align-items:center;gap:8px;font-size:1.18em;font-weight:750}.provider-title i{width:10px;height:10px;border-radius:3px;background:currentColor}.account-provider-section.provider-openrouter{border-left-color:var(--violet)}.account-provider-section.provider-opencode-zen{border-left-color:var(--cyan)}.account-provider-section.provider-opencode-go{border-left-color:var(--blue)}.account-provider-section.provider-openrouter .provider-title{color:var(--violet)}.account-provider-section.provider-opencode-zen .provider-title{color:var(--cyan)}.account-provider-section.provider-opencode-go .provider-title{color:var(--blue)}.connection-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 12px}.connection{min-width:0;padding:9px 10px;border:1px solid var(--vscode-panel-border);border-radius:8px;background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)}.connection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.connection-head span{display:block;color:var(--muted);font-size:.84em}.account-summary{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:8px}.account-summary small{display:block;color:var(--muted)}.account-summary .status{max-width:55%;text-align:right;overflow-wrap:anywhere}.management-state{margin-top:8px}.account-metrics{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;padding:0 12px 10px}.account-metric{padding:9px 10px;border-radius:8px;background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)}.account-metric strong,.account-metric small{display:block}.account-metric strong{font-size:1.25em}.account-metric small{color:var(--muted)}.metric-good strong{color:var(--green)}.metric-warn strong{color:var(--orange)}.managed-keys{padding:0 12px 12px}.managed-keys>header{display:flex;align-items:end;justify-content:space-between;gap:8px;padding:4px 0 7px}.managed-keys>header span{color:var(--muted);font-size:.84em}.managed-key{display:grid;grid-template-columns:minmax(170px,1.4fr) auto repeat(3,minmax(120px,1fr));gap:12px;align-items:center;padding:8px 10px;border-top:1px solid var(--vscode-panel-border)}.managed-key small,.managed-key strong{display:block}.managed-key small{color:var(--muted)}.managed-key strong{overflow-wrap:anywhere}.notice{margin:8px 16px;padding:7px 10px;border-left:3px solid var(--vscode-errorForeground);border-radius:5px;background:color-mix(in srgb,var(--vscode-errorForeground) 12%,transparent)}
@media(max-width:1050px){.dashboard{grid-template-columns:minmax(340px,1.5fr) minmax(240px,1fr)}.accounts-card{grid-column:2}.filters{grid-template-columns:1fr 1fr}.account-metrics{grid-template-columns:1fr 1fr}.managed-key{grid-template-columns:1fr auto 1fr 1fr}.managed-key>div:last-child{display:none}}
@media(max-width:700px){.topbar{gap:12px;overflow-x:auto}.topbar nav{gap:12px}.dashboard{grid-template-columns:1fr}.accounts-card{grid-column:auto}.insight{display:block}.insight strong{display:block}.rank-columns,.connection-grid{grid-template-columns:1fr}.rank-columns{padding-left:0}.filters,.account-metrics{grid-template-columns:1fr}.agent-row{grid-template-columns:1fr;gap:5px}.agent-identity{justify-content:space-between}.agent-result{text-align:left}.managed-key{grid-template-columns:1fr auto}.managed-key>div{display:none}.managed-key>.key-name{display:block}.account-provider-section>header{align-items:flex-start}.account-summary{display:block}.account-summary .status{display:block;max-width:none;margin-top:4px;text-align:left}.managed-keys>header span{display:none}}
`;

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
      accounts.push(provider === "openrouter" ? await fetchOpenRouterAccount(token) : unavailableAccount(provider, "Verbunden \xB7 pers\xF6nliche Usage-API nicht verf\xFCgbar"));
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
      });
    } else panel.reveal();
    refreshPanel();
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
