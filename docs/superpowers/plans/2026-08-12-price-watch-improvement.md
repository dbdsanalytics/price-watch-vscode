# Price-Watch Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive VS Code model, price, agent, and account dashboard for OpenRouter, OpenCode Zen/Go, and available Claude Code usage data.

**Architecture:** Provider adapters normalize external catalogs into a shared typed domain. Pure functions calculate changes, history, capabilities, and rankings; VS Code adapters own storage, secrets, synchronization, notifications, and Webview integration. Each provider fails independently and cached data remains visible.

**Tech Stack:** TypeScript 5.6+, VS Code Extension API 1.90+, Bun test, esbuild, native `fetch`, HTML/CSS Webview.

## Global Constraints

- No backend or separate user account.
- Secrets stay per device in VS Code SecretStorage and are never synchronized or logged.
- OpenRouter per-token prices must be converted to USD per 1M tokens.
- OpenRouter, OpenCode Zen, and OpenCode Go remain separate offers.
- History retains 90 days of change events and at most one daily sample per relevant model.
- Rankings never invent benchmark values; unscored models are labeled `unrated`.
- Agent prompts remain local; only name, description, tools, and model may be sent for AI classification.
- No automatic agent configuration edits.
- Wide layout uses 2:1:1 columns; medium uses two columns; narrow uses one column.
- All provider failures are isolated and stale cached data remains visible with a timestamp.

---

### Task 1: Repository, package metadata, and icon

**Files:**
- Modify: `package.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `media/icon.png`
- Modify: `tests/config.test.ts`

**Interfaces:**
- Consumes: existing VS Code extension manifest and build scripts.
- Produces: installable extension metadata with `icon: "media/icon.png"`, repository URL, and testable packaging commands.

- [ ] **Step 1: Add a manifest test**

```ts
import { describe, expect, test } from "bun:test"
import manifest from "../package.json"

describe("extension manifest", () => {
  test("declares icon, repository, and focused activation commands", () => {
    expect(manifest.icon).toBe("media/icon.png")
    expect(manifest.repository.type).toBe("git")
    expect(manifest.contributes.commands.map((item) => item.command)).toContain("priceWatch.open")
  })
})
```

- [ ] **Step 2: Run the manifest test and confirm it fails**

Run: `bun test tests/config.test.ts`
Expected: FAIL because `icon` and `repository` are absent.

- [ ] **Step 3: Generate and add the icon**

Use the image generation tool to create an original square 512×512 icon: dark indigo background, a bright price pulse line forming an eye/watch shape, small mint and violet accents, no text, readable at 32×32. Save the final PNG as `media/icon.png`.

- [ ] **Step 4: Complete repository metadata and docs**

Add `icon`, `repository`, `bugs`, and `homepage` after the GitHub repository name is known. Add `.superpowers/`, `node_modules/`, generated VSIX files, and local secret files to `.gitignore`; keep `dist/extension.js` tracked because the extension package uses it. Document install, development, privacy, provider coverage, and known API limitations in `README.md`.

- [ ] **Step 5: Verify metadata and package**

Run: `bun test tests/config.test.ts && bun run typecheck && bun run build`
Expected: all commands exit 0 and `media/icon.png` exists.

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md package.json media/icon.png tests/config.test.ts
git commit -m "chore: initialize price watch repository"
```

### Task 2: Shared model and provider domain

**Files:**
- Create: `src/domain/model.ts`
- Create: `src/domain/provider.ts`
- Create: `tests/model.test.ts`
- Modify: `src/prices.ts`

**Interfaces:**
- Produces: `ProviderId`, `ModelOffer`, `ModelCapabilities`, `BenchmarkScores`, `ProviderSnapshot`, `Attempt<T>`; `usdPerMillion(value: string | number | undefined): number`.
- Consumes: no VS Code APIs.

- [ ] **Step 1: Write failing normalization tests**

```ts
import { describe, expect, test } from "bun:test"
import { usdPerMillion, offerKey, isFreeOffer } from "../src/domain/model"

describe("model domain", () => {
  test("converts OpenRouter per-token prices", () => expect(usdPerMillion("0.000003")).toBe(3))
  test("keeps provider offers distinct", () => {
    expect(offerKey({ provider: "openrouter", id: "x" })).toBe("openrouter:x")
    expect(offerKey({ provider: "opencode-zen", id: "x" })).toBe("opencode-zen:x")
  })
  test("requires every billable dimension to be zero", () => {
    expect(isFreeOffer({ input: 0, output: 0, request: 0 })).toBe(true)
    expect(isFreeOffer({ input: 0, output: 0, request: 1 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and confirm missing-module failure**

Run: `bun test tests/model.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement exact domain types and pure helpers**

Define provider IDs as `"openrouter" | "opencode-zen" | "opencode-go"`. Define prices for input, output, cache read/write, request, image, and web search in USD per 1M units where token-based. Capabilities include input/output modalities, tools, structured output, reasoning, context length, and use-case tags. `ProviderSnapshot` contains provider, offers, checkedAt, stale, and optional typed error.

- [ ] **Step 4: Adapt legacy price helpers to the new types**

Keep compatibility exports only where the existing extension still needs them; remove them in Task 4 after callers migrate.

- [ ] **Step 5: Verify domain tests**

Run: `bun test tests/model.test.ts tests/prices.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain src/prices.ts tests/model.test.ts tests/prices.test.ts
git commit -m "feat: add normalized model offer domain"
```

### Task 3: Independent OpenRouter, Zen, and Go adapters

**Files:**
- Create: `src/providers/openrouter.ts`
- Create: `src/providers/opencode-docs.ts`
- Create: `src/providers/fetch-all.ts`
- Create: `tests/openrouter.test.ts`
- Create: `tests/opencode-docs.test.ts`
- Modify: `tests/prices.test.ts`

**Interfaces:**
- Consumes: `ModelOffer`, `ProviderSnapshot`, `Attempt<T>` from Task 2.
- Produces: `parseOpenRouterModels(body): ModelOffer[]`, `parseZenDocument(mdx): ModelOffer[]`, `parseGoDocument(mdx): GoCatalog`, `fetchAllProviders(fetcher): Promise<ProviderSnapshot[]>`.

- [ ] **Step 1: Add failing OpenRouter conversion and metadata tests**

Use a fixture containing `pricing.prompt: "0.000003"`, `pricing.completion: "0.000015"`, context length, image input, tools, reasoning, and benchmarks. Assert prices `3` and `15` and preserved capabilities.

- [ ] **Step 2: Add failing Zen and Go document tests**

Use separate MDX fixtures. Assert Zen produces pay-as-you-go offers, Go produces subscription metadata plus offers and published limits, and duplicate context tiers retain distinct tier labels rather than silently selecting the cheapest.

- [ ] **Step 3: Run provider tests and confirm failure**

Run: `bun test tests/openrouter.test.ts tests/opencode-docs.test.ts`
Expected: FAIL because adapters do not exist.

- [ ] **Step 4: Implement provider parsers and fetchers**

Fetch OpenRouter with `output_modalities=all`. Fetch official Zen and Go raw documents independently with 20-second timeouts. Return typed provider errors for HTTP, network, timeout, parse, and empty-catalog failures.

- [ ] **Step 5: Prove partial failure isolation**

Add a test where Zen rejects while OpenRouter and Go resolve. Assert three snapshots, only Zen has an error, and the other offers remain populated.

- [ ] **Step 6: Run provider and legacy tests**

Run: `bun test tests/openrouter.test.ts tests/opencode-docs.test.ts tests/prices.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/providers tests/openrouter.test.ts tests/opencode-docs.test.ts tests/prices.test.ts
git commit -m "feat: load model catalogs from three providers"
```

### Task 4: Price changes, compact history, and synchronization

**Files:**
- Create: `src/domain/changes.ts`
- Create: `src/domain/history.ts`
- Create: `src/storage/synced-state.ts`
- Create: `tests/changes.test.ts`
- Create: `tests/history.test.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Produces: `diffOffers(previous, next): PriceChange[]`, `mergeHistory(local, incoming, now): HistoryState`, `summarizeChanges(changes): string`, `SyncedStateStore`.
- Consumes: normalized provider snapshots.

- [ ] **Step 1: Write failing model-wise diff tests**

Assert input/output changes are separate, additions and removals are typed events, percentages handle zero safely, and provider IDs prevent collisions.

- [ ] **Step 2: Write failing 90-day merge tests**

Assert duplicate event IDs are removed, newest daily sample wins, and events older than `90 * 24 * 60 * 60 * 1000` are discarded.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test tests/changes.test.ts tests/history.test.ts`
Expected: FAIL with missing exports.

- [ ] **Step 4: Implement change and history functions**

Use stable event IDs based on provider, model, dimension, timestamp bucket, and values. Sort before hashing so API order changes do not trigger false notifications.

- [ ] **Step 5: Implement VS Code synchronized state adapter**

Store compact JSON in `globalState`, call `context.globalState.setKeysForSync([...])`, and keep secrets out of every serialized structure.

- [ ] **Step 6: Integrate one summarized notification per refresh**

Manual and timer refreshes share a single in-flight promise. Show one message containing total changes and provider counts; details open the panel.

- [ ] **Step 7: Verify history and integration types**

Run: `bun test tests/changes.test.ts tests/history.test.ts && bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/changes.ts src/domain/history.ts src/storage/synced-state.ts src/extension.ts tests/changes.test.ts tests/history.test.ts
git commit -m "feat: track and sync ninety day price history"
```

### Task 5: Capabilities, benchmarks, and transparent rankings

**Files:**
- Create: `src/domain/ranking.ts`
- Create: `src/providers/openrouter-benchmarks.ts`
- Create: `tests/ranking.test.ts`
- Modify: `src/ai.ts`

**Interfaces:**
- Produces: `rankOffers(offers, purpose, priceMode): RankedOffer[]`, `RankingReason`, `Purpose`, `PriceMode`.
- Consumes: model capabilities and optional benchmark scores.

- [ ] **Step 1: Write failing ranking tests**

Assert free/paid separation, required capability exclusion, coding score preference for coding, price-performance tie breaking, source timestamps, and `unrated` for missing benchmarks.

- [ ] **Step 2: Run ranking tests and confirm failure**

Run: `bun test tests/ranking.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement deterministic ranking**

Use benchmark score first when available, then required capabilities, context sufficiency, and normalized cost. Never convert descriptions or AI prose into numeric benchmark facts.

- [ ] **Step 4: Constrain AI explanations**

Send only ranked facts and sources. Require short German explanations and explicitly instruct the model to label uncertainty and not invent scores.

- [ ] **Step 5: Verify ranking and AI tests**

Run: `bun test tests/ranking.test.ts tests/prices.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/ranking.ts src/providers/openrouter-benchmarks.ts src/ai.ts tests/ranking.test.ts
git commit -m "feat: add transparent model rankings"
```

### Task 6: Responsive four-view Webview

**Files:**
- Create: `src/ui/view-model.ts`
- Create: `src/ui/styles.ts`
- Create: `src/ui/render.ts`
- Create: `src/ui/messages.ts`
- Create: `tests/panel.test.ts`
- Modify: `src/panel.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Produces: `buildViewModel(state): PriceWatchViewModel`, `renderPanel(viewModel, nonce): string`, typed `WebviewInboundMessage` and `WebviewOutboundMessage`.
- Consumes: snapshots, rankings, history, agents, and account states.

- [ ] **Step 1: Write failing safe-render tests**

Assert HTML escaping of model/provider names, CSP nonce presence, no inline event handlers, and four navigation views.

- [ ] **Step 2: Write responsive contract tests**

Assert CSS contains the confirmed wide `2fr 1fr 1fr` grid, medium two-column breakpoint, narrow one-column breakpoint, content-driven height, minimal metric text, and compact agent/account row classes.

- [ ] **Step 3: Run panel tests and confirm failure**

Run: `bun test tests/panel.test.ts`
Expected: FAIL because the new renderer is absent.

- [ ] **Step 4: Implement the approved overview**

Render navigation, bare metrics, slim AI insight, and the 2:1:1 models/agents/accounts grid. Use VS Code color variables with mint/violet accents, `clamp()` only within bounded sizes, no global narrow max-width, and content-height cards.

- [ ] **Step 5: Implement Models, Agents, and Accounts views**

Models supports search, provider, free/paid, purpose, modality, tools, reasoning, context, and availability filters. Details and rankings are collapsible. Agents and accounts show compact status rows and expandable evidence.

- [ ] **Step 6: Implement typed Webview events and retained UI state**

Handle refresh, navigation, filters, expansion, connect, disconnect, and test-connection messages. Validate every inbound payload before dispatch.

- [ ] **Step 7: Verify UI**

Run: `bun test tests/panel.test.ts && bun run typecheck && bun run build`
Expected: PASS. Manually inspect at approximately 1400 px, 900 px, 600 px, and 360 px widths in dark and light themes.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/panel.ts src/extension.ts tests/panel.test.ts
git commit -m "feat: add responsive price watch dashboard"
```

### Task 7: Local OpenCode agent discovery and private purpose analysis

**Files:**
- Create: `src/agents/discovery.ts`
- Create: `src/agents/assessment.ts`
- Create: `tests/agents.test.ts`
- Modify: `src/config.ts`
- Modify: `src/ai.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Produces: `discoverAgents(paths): AgentMetadata[]`, `classifyAgentMetadata(metadata, ai): Promise<AgentPurpose>`, `assessAgent(agent, offers, rankings): AgentAssessment`.
- Consumes: local OpenCode config and ranking results.

- [ ] **Step 1: Write failing discovery and privacy tests**

Use global and project fixtures. Assert provider/model mapping, tool extraction, duplicate handling, and that the serialized AI payload excludes `prompt`, `instructions`, and file contents.

- [ ] **Step 2: Write failing assessment tests**

Assert statuses `suitable`, `expensive`, `alternative-available`, `unsuitable`, `deprecated`, and `unknown`, with evidence and no automatic mutation.

- [ ] **Step 3: Run agent tests and confirm failure**

Run: `bun test tests/agents.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 4: Implement local discovery**

Read explicitly supported global and workspace OpenCode agent/config locations. Parse JSON/JSONC and Markdown frontmatter safely. Do not read OpenCode authentication storage.

- [ ] **Step 5: Implement metadata-only classification and assessment**

Keep prompts local. If AI is unavailable, infer only explicit purposes from name, description, and tools and mark ambiguous results unknown.

- [ ] **Step 6: Integrate agent refresh and view model**

Watch supported workspace configuration files and debounce refresh. Show assigned provider offer, price changes, capabilities, status, and alternatives.

- [ ] **Step 7: Verify agent behavior**

Run: `bun test tests/agents.test.ts && bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/agents src/config.ts src/ai.ts src/extension.ts tests/agents.test.ts
git commit -m "feat: assess models used by opencode agents"
```

### Task 8: Explicit account connections and available usage data

**Files:**
- Create: `src/accounts/types.ts`
- Create: `src/accounts/store.ts`
- Create: `src/accounts/openrouter.ts`
- Create: `src/accounts/opencode.ts`
- Create: `src/accounts/claude.ts`
- Create: `tests/accounts.test.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Produces: `AccountProvider`, `AccountStatus`, `UsageWindow`, `AccountStore`, `connectAccount`, `disconnectAccount`, `refreshAccounts`.
- Consumes: VS Code SecretStorage and typed Webview messages.

- [ ] **Step 1: Write failing secret and state tests**

Assert explicit connection, masked labels, per-device secret keys, removal, provider-specific permission errors, and absent usage represented as `unavailable` rather than zero or unlimited.

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun test tests/accounts.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement OpenRouter connection**

Use `/api/v1/key` for current-key daily/weekly/monthly usage and limits. Offer optional separate management-key storage for `/api/v1/credits`; explain the additional permission before prompting.

- [ ] **Step 4: Implement OpenCode Zen/Go connection boundaries**

Store credentials only after explicit entry and connection test. Fetch official usage endpoints only when documented and available. Otherwise return `unavailable` plus the official console URL; never scrape cookies or browser sessions.

- [ ] **Step 5: Implement Claude connection boundary**

Support explicit local integration for reliably machine-readable Claude Code usage/cost output when present. Distinguish subscription windows from API costs. If personal remaining capacity is not available, show `unavailable` and the official usage command/page.

- [ ] **Step 6: Integrate refresh, reset labels, and warnings**

Map provider data to available, low, exhausted, reset-known, or unavailable states. Never log authorization headers, token bodies, or secret values.

- [ ] **Step 7: Verify accounts**

Run: `bun test tests/accounts.test.ts && bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/accounts src/extension.ts tests/accounts.test.ts
git commit -m "feat: add explicit provider account connections"
```

### Task 9: Final migration, accessibility, packaging, and GitHub release

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/panel.ts`
- Modify: `package.json`
- Modify: `README.md`
- Create: `CHANGELOG.md`
- Create: `tests/extension-state.test.ts`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: release-ready VSIX and public GitHub repository.

- [ ] **Step 1: Add migration tests**

Assert legacy `priceWatch.lastHash` and AI timestamps migrate without data loss, corrupt legacy state is ignored safely, and secrets are never copied into synchronized state.

- [ ] **Step 2: Run migration tests and confirm failure**

Run: `bun test tests/extension-state.test.ts`
Expected: FAIL until migration exists.

- [ ] **Step 3: Implement migration and remove legacy code paths**

Run migration once using a versioned state key. Remove obsolete `PriceRow` panel paths only after all callers use normalized offers.

- [ ] **Step 4: Perform accessibility and security verification**

Verify keyboard navigation, visible focus, semantic buttons/tables, sufficient contrast in light/dark themes, CSP, escaped external strings, no Webview command injection, and no secrets in `git grep` output or build artifacts.

- [ ] **Step 5: Run the full verification suite**

Run: `bun test tests/ && bun run typecheck && bun run build`
Expected: all tests pass, typecheck exits 0, build exits 0.

- [ ] **Step 6: Package and inspect the VSIX**

Run: `bunx @vscode/vsce package`
Expected: a new VSIX is produced. Inspect its file list and confirm source secrets, `.superpowers`, and local state are absent while `dist/extension.js` and `media/icon.png` are present.

- [ ] **Step 7: Create the GitHub repository and push**

Authenticate with the existing `gh` session, create a public repository named `price-watch-vscode` unless that name is already owned, set `origin`, and push the default branch. Do not overwrite an existing remote repository.

```bash
gh repo create price-watch-vscode --public --source=. --remote=origin --push
```

- [ ] **Step 8: Create a GitHub release with the VSIX**

```bash
gh release create v0.2.0 price-watch-0.2.0.vsix --title "Preis-Watch 0.2.0" --notes-file CHANGELOG.md
```

Expected: repository and release URLs resolve publicly and the VSIX is attached.

- [ ] **Step 9: Commit final release state if packaging changed tracked files**

```bash
git add README.md CHANGELOG.md package.json src tests dist/extension.js
git commit -m "release: price watch 0.2.0"
git push
```
