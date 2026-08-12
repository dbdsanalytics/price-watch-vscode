# OpenRouter Benchmark API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preis-Watch lädt die authentifizierte OpenRouter-Benchmark-API, cached sie 24 Stunden und zeigt exakt zugeordnete Einzelbenchmarks im Modellkatalog.

**Architecture:** Ein fokussierter Adapter normalisiert den variablen API-Response in domäneneigene Benchmark-Läufe. Ein Cache-Service verwendet VS Code `globalState`, während die bestehende Benchmark-Anreicherung die Läufe exakt mit Katalogangeboten verbindet. Die UI rendert kompakte Detailwerte und fällt bei Fehlern auf bestehende öffentliche Indizes zurück.

**Tech Stack:** TypeScript, VS Code Extension API, Bun Test, native `fetch`, esbuild, VSCE.

## Global Constraints

- Der API-Key bleibt ausschließlich im lokalen VS Code Secret Store und wird nie im Cache, Log, Quellcode oder Paket gespeichert.
- Keine Prompts, Agentenanweisungen oder lokalen Konfigurationsinhalte werden übertragen.
- Unsichere Modellzuordnungen erzeugen keinen Benchmarkwert.
- Bestehende Katalog-Benchmarks bleiben bei API- oder Authentifizierungsfehlern erhalten.
- Automatische Abrufe verwenden einen Cache mit 24 Stunden Gültigkeit; manuelle Aktualisierung darf ihn umgehen.

---

### Task 1: Benchmark-API normalisieren

**Files:**
- Create: `src/providers/openrouter-benchmarks.ts`
- Create: `tests/openrouter-benchmarks.test.ts`
- Modify: `src/domain/model.ts`

**Interfaces:**
- Consumes: OpenRouter JSON `{ data, meta }`.
- Produces: `parseOpenRouterBenchmarks(body): OpenRouterBenchmark[]` und `fetchOpenRouterBenchmarks(key): Promise<OpenRouterBenchmarkSnapshot>`.

- [ ] **Step 1: Write the failing parser test**

```ts
test("normalizes accuracy, cost, sample count and timestamp", () => {
  const result = parseOpenRouterBenchmarks({ data: [{ model_permaslug:"openai/gpt-5", task_name:"gpqa-diamond", accuracy:.842, accuracy_stddev:.02, avg_cost_per_task:.04, total_tasks:198, last_run_timestamp:"2026-08-12T10:00:00Z" }], meta:{ as_of:"2026-08-12T11:00:00Z" } })
  expect(result.items[0]).toMatchObject({ modelId:"openai/gpt-5", benchmark:"gpqa-diamond", score:84.2, costPerTaskUsd:.04, sampleCount:198 })
})
```

- [ ] **Step 2: Run `bun test tests/openrouter-benchmarks.test.ts` and verify failure because the module is missing.**
- [ ] **Step 3: Add typed normalization, tolerate absent optional fields, reject records without model ID or numeric score, and implement authenticated fetch with a 20-second timeout.**
- [ ] **Step 4: Run `bun test tests/openrouter-benchmarks.test.ts` and verify pass.**
- [ ] **Step 5: Commit with `git commit -m "feat: parse openrouter benchmark api"`.**

### Task 2: Cache and refresh policy

**Files:**
- Create: `src/domain/benchmark-cache.ts`
- Create: `tests/benchmark-cache.test.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `OpenRouterBenchmarkSnapshot`, VS Code-compatible storage with `get` and `update`, `forceRefresh` flag.
- Produces: `loadBenchmarks(storage, key, forceRefresh, loader, now): Promise<OpenRouterBenchmarkSnapshot | null>`.

- [ ] **Step 1: Write failing tests proving a cache younger than 24 hours avoids the loader, an expired cache invokes it, and `forceRefresh` bypasses a fresh cache.**
- [ ] **Step 2: Run `bun test tests/benchmark-cache.test.ts` and verify expected failures.**
- [ ] **Step 3: Implement `BENCHMARK_CACHE_KEY`, `BENCHMARK_CACHE_TTL_MS = 86_400_000`, schema validation and fallback to cached data when refresh fails.**
- [ ] **Step 4: Connect it in `refresh(context, manual)`, retrieving only `context.secrets.get(secretKey("openrouter"))`; do not persist the key.**
- [ ] **Step 5: Run cache and existing account/provider tests and verify pass.**
- [ ] **Step 6: Commit with `git commit -m "feat: cache openrouter benchmark results"`.**

### Task 3: Exact enrichment and ranking data

**Files:**
- Modify: `src/domain/benchmarks.ts`
- Modify: `tests/benchmarks.test.ts`
- Modify: `src/domain/model.ts`

**Interfaces:**
- Consumes: provider snapshots and normalized benchmark snapshot.
- Produces: enriched `BenchmarkScores` with `details: BenchmarkDetail[]`, source, timestamp and match provenance.

- [ ] **Step 1: Write failing tests for exact OpenRouter ID matching, safe OpenCode base-model inheritance and rejection of ambiguous aliases.**
- [ ] **Step 2: Run `bun test tests/benchmarks.test.ts` and verify the new assertions fail.**
- [ ] **Step 3: Merge API details without deleting Artificial Analysis indices; prefer newer API details while preserving direct/base-model provenance.**
- [ ] **Step 4: Run benchmark and ranking tests and verify pass.**
- [ ] **Step 5: Commit with `git commit -m "feat: enrich models with benchmark details"`.**

### Task 4: Compact benchmark UI

**Files:**
- Modify: `src/panel.ts`
- Modify: `tests/panel.test.ts`

**Interfaces:**
- Consumes: enriched `BenchmarkScores.details`.
- Produces: escaped compact HTML showing benchmark name, score, cost/task, sample count and freshness.

- [ ] **Step 1: Write a failing panel test expecting `GPQA Diamond`, `84,2 %`, `198 Aufgaben`, `0,04 $/Aufgabe`, provenance and escaped content.**
- [ ] **Step 2: Run `bun test tests/panel.test.ts` and verify failure.**
- [ ] **Step 3: Render up to three relevant detail chips in the Benchmark cell and put remaining values in a native collapsible `<details>` element; add responsive CSS without fixed cell heights.**
- [ ] **Step 4: Run panel tests and verify pass at wide and narrow markup constraints.**
- [ ] **Step 5: Commit with `git commit -m "feat: show detailed model benchmarks"`.**

### Task 5: Verify and package

**Files:**
- Modify generated: `dist/extension.js`, `dist/extension.js.map`
- Produce: `price-watch-0.2.1.vsix`

**Interfaces:**
- Consumes: completed source and tests.
- Produces: verified installable VSIX in the repository root.

- [ ] **Step 1: Run `bun test tests/` and require zero failures.**
- [ ] **Step 2: Run `bun run typecheck && bun run build && bun run package` and require zero errors.**
- [ ] **Step 3: Inspect the packaged bundle for benchmark labels and verify no `sk-or-v1-` token occurs in source, dist or VSIX.**
- [ ] **Step 4: Copy the resulting VSIX to `/Users/dadakbiranvand/Projects/price-watch-vscode/price-watch-0.2.1.vsix` and compare SHA-256 hashes.**
- [ ] **Step 5: Commit generated build output with `git commit -m "build: package benchmark-enabled price watch"`.**

