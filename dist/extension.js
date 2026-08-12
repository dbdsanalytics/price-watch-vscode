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

// src/prices.ts
var OR_API = "https://openrouter.ai/api/v1/models";
var ZEN_MDX = "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/zen.mdx";
function norm(name) {
  return String(name).toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function toUsd(cell) {
  const v = String(cell ?? "").trim();
  if (!v || v === "-") return 0;
  const n = parseFloat(v.replace("$", ""));
  return Number.isNaN(n) ? 0 : n;
}
function fmt(v) {
  const n = Number(v) || 0;
  if (n === 0) return "0";
  if (n < 0.01) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 1) return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 100) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return String(Math.round(n));
}
function klass(pt, ct) {
  const total = (pt || 0) + (ct || 0);
  if (total === 0) return { label: "kostenlos", color: "success" };
  if (total < 0.5) return { label: "billig", color: "info" };
  if (total <= 2) return { label: "mittel", color: "warning" };
  return { label: "Premium", color: "error" };
}
function time(ts) {
  if (!ts) return "\u2013";
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
var splitCells = (line) => line.split("|").map((c) => c.trim()).filter(Boolean);
function parseZenMdx(mdx) {
  const idByName = /* @__PURE__ */ new Map();
  for (const line of mdx.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = splitCells(line);
    if (cells.length < 2 || cells[0] === "Model" || /^-+$/.test(cells[0])) continue;
    if (/^https?:\/\//.test(String(cells[2]).replace(/`/g, ""))) {
      idByName.set(norm(cells[0]), cells[1]);
    }
  }
  const rows = [];
  let inPricing = false;
  for (const line of mdx.split("\n")) {
    if (line.startsWith("## Pricing")) {
      inPricing = true;
      continue;
    }
    if (!inPricing) continue;
    if (line.startsWith("## ") && !line.startsWith("## Pricing")) break;
    if (!line.startsWith("|")) continue;
    const cells = splitCells(line);
    if (cells.length < 3 || cells[0] === "Model" || /^-+$/.test(cells[0])) continue;
    if (cells[1].toLowerCase().includes("deprecation")) break;
    const id = idByName.get(norm(cells[0]));
    if (!id) continue;
    rows.push({ id, name: cells[0], pt: toUsd(cells[1]), ct: toUsd(cells[2]) });
  }
  const best = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const cur = best.get(r.id);
    if (!cur || r.pt + r.ct < cur.pt + cur.ct) best.set(r.id, r);
  }
  return [...best.values()];
}
async function fetchOpenRouter() {
  const res = await fetch(OR_API, { signal: AbortSignal.timeout(2e4) });
  if (!res.ok) throw new Error("OpenRouter API: HTTP " + res.status);
  const body = await res.json();
  const list = [];
  for (const m of body.data ?? []) {
    const p = m.pricing ?? {};
    list.push({
      id: m.id,
      name: m.name,
      pt: parseFloat(p.prompt ?? "") || 0,
      ct: parseFloat(p.completion ?? "") || 0
    });
  }
  return list;
}
async function fetchZen() {
  const res = await fetch(ZEN_MDX, { signal: AbortSignal.timeout(2e4) });
  if (!res.ok) throw new Error("OpenCode-Zen-Doku: HTTP " + res.status);
  const rows = parseZenMdx(await res.text());
  if (rows.length === 0) throw new Error("Zen-Preisliste leer (Doku-Format ge\xE4ndert?)");
  return rows;
}
function hashOf(or, zen) {
  const parts = [];
  for (const r of or) parts.push(`${r.id}:${r.pt}/${r.ct}`);
  for (const r of zen) parts.push(`${r.id}:${r.pt}/${r.ct}`);
  return parts.join("|");
}
function summary(rows, label) {
  if (!rows.length) return label + ": keine Daten";
  const free = rows.filter((r) => (r.pt || 0) + (r.ct || 0) === 0).length;
  const paid = rows.filter((r) => (r.pt || 0) + (r.ct || 0) > 0).sort((a, b) => a.pt + a.ct - (b.pt + b.ct)).slice(0, 3).map((r) => `${r.id} (${fmt(r.pt)}/${fmt(r.ct)}$)`);
  return `${label}: ${rows.length} Modelle, ${free} kostenlos; g\xFCnstigste bezahlt: ${paid.join(", ") || "\u2013"}`;
}
async function checkPrices() {
  const [or, zen] = await Promise.all([fetchOpenRouter(), fetchZen()]);
  return { or, zen, checkAt: Date.now(), error: null };
}

// src/ai.ts
var OR_CHAT = "https://openrouter.ai/api/v1/chat/completions";
function buildPrompt(or, zen, changed, model = "openrouter/free") {
  const system = "Du bist ein Preis-Watchdog f\xFCr KI-Modellpreise. Antworte auf Deutsch in maximal 2 S\xE4tzen, kompakt und informativ. Nenne konkrete Zahlen, wenn relevant.";
  const user = `Aktueller Preisstand (Preise pro 1M Tokens, Eingabe/Ausgabe):
${summary(or, "OpenRouter")}
${summary(zen, "OpenCode Zen")}
${changed ? "Preise haben sich ge\xE4ndert." : "Preise unver\xE4ndert."}
Fasse zusammen, was interessant oder ge\xE4ndert ist.`;
  return JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: 240
  });
}
async function aiComment(apiKey, or, zen, changed, model = "openrouter/free") {
  const res = await fetch(OR_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: buildPrompt(or, zen, changed, model),
    signal: AbortSignal.timeout(3e4)
  });
  if (!res.ok) throw new Error("KI HTTP " + res.status);
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Leere KI-Antwort");
  return { ok: true, at: Date.now(), text };
}
function aiFailure(error) {
  return { ok: false, at: Date.now(), error: "KI-Fehler: " + (error instanceof Error ? error.message : String(error)) };
}
function formatAiText(text) {
  return text.replace(/\u202f/g, " ").replace(/\u00a0/g, " ");
}

// src/config.ts
var import_os = require("os");
var import_path = require("path");
var import_fs = require("fs");
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
  return JSON.parse(stripJsoncComments(src));
}
function readConfigFiles() {
  const configs = [];
  const home = (0, import_os.homedir)();
  const candidates = [(0, import_path.join)(home, ".config", "opencode", "opencode.json"), (0, import_path.join)(home, ".config", "opencode", "opencode.jsonc")];
  for (const file of candidates) {
    try {
      configs.push(parseJsonc((0, import_fs.readFileSync)(file, "utf8")));
    } catch {
    }
  }
  return configs;
}
function opencodeModelRefs() {
  const refs = [];
  for (const cfg of readConfigFiles()) {
    for (const [provider, providerCfg] of Object.entries(cfg.provider ?? {})) {
      for (const id of Object.keys(providerCfg.models ?? {})) refs.push({ provider, id });
    }
  }
  return refs;
}

// src/panel.ts
var CSS = `
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
`;
function badgeOf(total) {
  if (total === 0) return '<span class="badge free">kostenlos</span>';
  if (total < 0.5) return '<span class="badge cheap">billig</span>';
  if (total < 2) return '<span class="badge mid">mittel</span>';
  return '<span class="badge pricey">Premium</span>';
}
function table(title, rows, mine) {
  if (!rows.length) return `<h2>${title}</h2><p class="meta">keine Daten</p>`;
  const sorted = rows.slice().sort((a, b) => a.pt + a.ct - (b.pt + b.ct));
  const body = sorted.map((r) => {
    const own = mine.has(r.id) ? ' <span class="mine">\u25CF</span>' : "";
    const k = klass(r.pt, r.ct);
    return `<tr><td>${esc(r.name)}${own}</td><td class="num">${fmt(r.pt)} $</td><td class="num">${fmt(r.ct)} $</td><td>${badgeOf(k.label === "kostenlos" ? 0 : r.pt + r.ct)}</td></tr>`;
  }).join("");
  return `<h2>${esc(title)} <span class="meta">(${rows.length})</span></h2>
<table><thead><tr><th>Modell</th><th class="num">Eingabe / 1M</th><th class="num">Ausgabe / 1M</th><th>Klasse</th></tr></thead><tbody>${body}</tbody></table>`;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function panelHtml(state, ai2, mineOr, mineZen) {
  const orFree = state.or.filter((r) => (r.pt || 0) + (r.ct || 0) === 0).length;
  const zenFree = state.zen.filter((r) => (r.pt || 0) + (r.ct || 0) === 0).length;
  const aiBox = ai2 ? ai2.ok && ai2.text ? `<div class="ai"><b class="ok">KI-Einsch\xE4tzung (kostenlos via OpenRouter Free)</b>${esc(formatAiText(ai2.text))}</div>` : `<div class="ai"><b class="err">KI nicht verf\xFCgbar</b>${esc(ai2.error ?? "unbekannter Fehler")}</div>` : '<div class="ai"><b>KI-Einsch\xE4tzung</b>wird beim n\xE4chsten Check erstellt \u2026</div>';
  const status = state.error ? `<span class="err">${esc(state.error)}</span>` : `<span class="ok">OK</span>`;
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<h1>Preis-Watch</h1>
<div class="meta">Stand ${time(state.checkAt)} \xB7 OpenRouter ${state.or.length} Modelle (${orFree} kostenlos) \xB7 OpenCode Zen ${state.zen.length} Modelle (${zenFree} kostenlos) \xB7 ${status}<br>
<span class="meta">\u25CF = in deiner opencode-Konfiguration genutzt \xB7 Aktualisierung: st\xFCndlich \xB7 esc schlie\xDFt</span></div>
<div class="toolbar"><button id="refresh">Jetzt aktualisieren</button></div>
${aiBox}
${table("OpenRouter (deine Modelle)", state.or.filter((r) => mineOr.has(r.id)), mineOr)}
${table("OpenRouter (g\xFCnstigste bezahlt)", cheapest(state.or), mineOr)}
${table("OpenCode Zen (deine Modelle)", state.zen.filter((r) => mineZen.has(r.id)), mineZen)}
${table("OpenCode Zen (g\xFCnstigste bezahlt)", cheapest(state.zen), mineZen)}
<script>
const vscode = acquireVsCodeApi();
document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
</script>
</body></html>`;
}
function cheapest(rows) {
  return rows.filter((r) => (r.pt || 0) + (r.ct || 0) > 0).sort((a, b) => a.pt + a.ct - (b.pt + b.ct)).slice(0, 8);
}

// src/extension.ts
var KEY_STORE = "priceWatch.openrouterKey";
var LAST_HASH = "priceWatch.lastHash";
var LAST_AI = "priceWatch.lastAiAt";
var OPEN_COMMAND = "priceWatch.open";
var statusBar;
var panel;
var prices = { or: [], zen: [], checkAt: null, error: null };
var ai = null;
var checkRunning = false;
var timer;
function mineIds() {
  const or = /* @__PURE__ */ new Set();
  const zen = /* @__PURE__ */ new Set();
  for (const ref of opencodeModelRefs()) {
    if (ref.provider === "openrouter") or.add(ref.id);
    else if (ref.provider === "opencode" || ref.provider === "opencode-go") zen.add(ref.id);
  }
  return { or, zen };
}
function updateStatusBar() {
  if (!statusBar) return;
  const hasData = prices.checkAt !== null;
  const status = prices.error ? "!" : hasData ? "OK" : "\u2026";
  const aiState = ai ? ai.ok ? "KI ok" : "KI fehlt" : "KI -";
  statusBar.text = `$(pulse) Preise ${time(prices.checkAt)} ${status}`;
  statusBar.tooltip = [
    "Preis-Watch",
    `Stand: ${time(prices.checkAt)}`,
    `OpenRouter: ${prices.or.length} Modelle`,
    `OpenCode Zen: ${prices.zen.length} Modelle`,
    aiState,
    prices.error ?? "",
    "Befehl: Preis-Watch \xF6ffnen"
  ].filter(Boolean).join("\n");
  if (prices.error) statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  else statusBar.backgroundColor = void 0;
  statusBar.show();
}
function refreshPanel() {
  if (!panel) return;
  const { or, zen } = mineIds();
  panel.webview.html = panelHtml(prices, ai, or, zen);
}
async function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = OPEN_COMMAND;
  context.subscriptions.push(statusBar);
  updateStatusBar();
  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_COMMAND, () => {
      if (panel) {
        panel.reveal();
        refreshPanel();
        return;
      }
      panel = vscode.window.createWebviewPanel("priceWatch", "Preis-Watch", vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true
      });
      panel.onDidDispose(() => {
        panel = void 0;
      });
      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.type === "refresh") void runCheck(context, true);
      });
      refreshPanel();
    }),
    vscode.commands.registerCommand("priceWatch.refresh", () => void runCheck(context, true)),
    vscode.commands.registerCommand("priceWatch.setKey", async () => {
      const current = await context.secrets.get(KEY_STORE);
      const input = await vscode.window.showInputBox({
        title: "OpenRouter-API-Key (f\xFCr die kostenlose Preis-KI)",
        prompt: "https://openrouter.ai/keys \u2014 wird sicher in VS Code Secrets gespeichert",
        password: true,
        placeHolder: "sk-or-\u2026",
        value: current ?? ""
      });
      if (input === void 0) return;
      if (!input.trim()) {
        await context.secrets.delete(KEY_STORE);
        void vscode.window.showInformationMessage("OpenRouter-Key entfernt \u2014 die KI-Analyse ist jetzt deaktiviert.");
        return;
      }
      await context.secrets.store(KEY_STORE, input.trim());
      void vscode.window.showInformationMessage("OpenRouter-Key gespeichert. Preis-KI ist aktiv.");
      void runCheck(context, true);
    })
  );
  void runCheck(context, false);
  const intervalHours = Math.max(1, vscode.workspace.getConfiguration("priceWatch").get("checkIntervalHours", 1));
  timer = setInterval(() => void runCheck(context, false), intervalHours * 60 * 60 * 1e3);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}
async function runCheck(context, manual) {
  if (checkRunning) return;
  checkRunning = true;
  const prevHash = context.globalState.get(LAST_HASH) ?? null;
  try {
    prices = await checkPrices();
    const nextHash = hashOf(prices.or, prices.zen);
    if (prevHash !== null && prevHash !== nextHash) {
      void vscode.window.showInformationMessage(
        "Preis\xE4nderung bei OpenRouter/OpenCode Zen \u2014 \xF6ffne den Preis-Watch f\xFCr Details."
      );
    }
    await context.globalState.update(LAST_HASH, nextHash);
    const config = vscode.workspace.getConfiguration("priceWatch");
    const key = await context.secrets.get(KEY_STORE);
    const lastAi = context.globalState.get(LAST_AI) ?? 0;
    const aiEveryMs = Math.max(1, config.get("aiEveryHours", 6)) * 60 * 60 * 1e3;
    const aiDue = Date.now() - lastAi >= aiEveryMs;
    const changed = prevHash !== null && prevHash !== nextHash;
    if (key && (aiDue || changed || manual)) {
      try {
        ai = await aiComment(key, prices.or, prices.zen, changed, config.get("aiModel", "openrouter/free"));
      } catch (error) {
        ai = aiFailure(error);
      }
      await context.globalState.update(LAST_AI, ai.at);
    }
  } catch (error) {
    prices.error = "Check fehlgeschlagen: " + (error instanceof Error ? error.message : String(error));
  } finally {
    checkRunning = false;
  }
  updateStatusBar();
  refreshPanel();
}
function deactivate() {
  clearInterval(timer);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
