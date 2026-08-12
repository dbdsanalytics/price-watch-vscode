# Management and UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only OpenRouter management data and replace the unstructured agent, account, model, and ranking presentations with one compact responsive visual system.

**Architecture:** Keep provider authentication and parsing in focused account modules, extend the dashboard state with account-level and per-key metrics, and render semantic UI sections with shared CSS tokens. The normal OpenRouter key and management key remain independent secrets and independent connections.

**Tech Stack:** TypeScript 5, VS Code Extension API/Webview, Bun test, esbuild, official OpenRouter REST endpoints.

## Global Constraints

- Secrets remain exclusively in the local VS Code Secret Store and are never synchronized.
- The Management Key may call only `GET /api/v1/credits` and `GET /api/v1/keys`.
- Full agent prompts remain local.
- Essential status and account text wraps and is never ellipsized.
- Layout uses compact 4/8/12/16-pixel spacing and responsive wide, medium, and narrow arrangements.

---

### Task 1: Read-only OpenRouter management model

**Files:**
- Create: `src/accounts/openrouter-management.ts`
- Modify: `src/accounts/types.ts`
- Test: `tests/openrouter-management.test.ts`

**Interfaces:**
- Produces: `OpenRouterManagementStatus`, `OpenRouterManagedKey`, `parseOpenRouterManagement(creditsBody, keysBody)`, and `fetchOpenRouterManagement(key)`.

- [ ] **Step 1: Write failing parser tests** for total credits, total usage, derived remaining credits, per-key limits, reset periods, usage windows, disabled state, and a key without a fixed limit.
- [ ] **Step 2: Run `bun test tests/openrouter-management.test.ts`** and verify failure because the module does not exist.
- [ ] **Step 3: Implement pure parsing and a fetcher** that performs exactly two authenticated GET requests to `/api/v1/credits` and `/api/v1/keys`, rejects non-success responses, and never exposes plaintext secrets.
- [ ] **Step 4: Run the focused test** and verify it passes.
- [ ] **Step 5: Commit** with `feat: add read-only openrouter management data`.

### Task 2: Separate management connection lifecycle

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/accounts/types.ts`
- Test: `tests/config.test.ts`
- Test: `tests/accounts.test.ts`

**Interfaces:**
- Consumes: `fetchOpenRouterManagement(key)` from Task 1.
- Produces: independent secret key `priceWatch.account.openrouter-management` and dashboard field `openRouterManagement`.

- [ ] **Step 1: Write failing manifest and state tests** asserting a separate “OpenRouter Management Key verbinden” command and independent account state.
- [ ] **Step 2: Run the focused tests** and confirm the missing command/state failures.
- [ ] **Step 3: Add a masked management-key prompt** with explicit read-only copy, store it separately, refresh it on activation, and remove it independently. Do not modify the normal API-key flow.
- [ ] **Step 4: Run focused and full tests** and verify both connection types coexist.
- [ ] **Step 5: Commit** with `feat: connect openrouter management key separately`.

### Task 3: Structured semantic views and visual system

**Files:**
- Modify: `src/panel.ts`
- Test: `tests/panel.test.ts`
- Test: `tests/accounts.test.ts`

**Interfaces:**
- Consumes: normalized models, agent assessments, account statuses, and OpenRouter management status.
- Produces: four responsive webview views using shared provider, purpose, price, and status classes.

- [ ] **Step 1: Write failing HTML contract tests** for purpose-specific classes, provider-specific classes, green free/orange paid markers, agent groups, management summary metrics, per-key rows, provider-local actions, and absence of ellipsis on essential account text.
- [ ] **Step 2: Run focused panel tests** and confirm the semantic elements are missing.
- [ ] **Step 3: Split rendering into focused helpers** for rankings, model badges, grouped agents, provider account sections, summary metrics, and managed keys.
- [ ] **Step 4: Apply the visual tokens:** Coding blue, language cyan, reasoning violet, vision pink, tools yellow, allround blue-gray; OpenRouter violet, Zen cyan, Go blue; free green, paid orange, unknown gray.
- [ ] **Step 5: Implement responsive structure:** stable agent columns on wide screens, hierarchical agent rows on narrow screens, account metrics in an adaptive grid, wrapped essential text, and compact spacing.
- [ ] **Step 6: Run focused and full tests** and verify all contracts pass.
- [ ] **Step 7: Commit** with `feat: redesign structured responsive dashboard views`.

### Task 4: Package and real VS Code visual verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Generated: `dist/extension.js`
- Generated: `dist/extension.js.map`
- Generated: `price-watch-0.2.1.vsix`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified installable VSIX.

- [ ] **Step 1: Run `bun test`, `bun run typecheck`, and `bun run build`** with zero failures.
- [ ] **Step 2: Package with `bun run package`** and inspect the included files.
- [ ] **Step 3: Install/update the local VSIX after the required action-time confirmation.**
- [ ] **Step 4: Inspect overview, models, agents, and accounts** in wide, medium, and narrow VS Code editor widths; verify no clipping, overlap, or artificial empty card height.
- [ ] **Step 5: Correct any visual defect using a failing contract test first**, then repeat build, package, and inspection.
- [ ] **Step 6: Commit** with `release: price watch 0.2.1`.
