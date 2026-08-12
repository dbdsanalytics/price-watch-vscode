import { expect, test } from "bun:test"
import { mergeAgents, metadataPayload, parseAgentMarkdown, parseOpenCodeConfigAgents } from "../src/agents/discovery"

test("extracts agent metadata without sending the prompt", () => {
  const agent = parseAgentMarkdown("reviewer.md", `---\ndescription: Reviews code\nmodel: openrouter/anthropic/claude\ntools: [read, grep]\n---\nSecret full prompt`)
  expect(agent).toMatchObject({ name: "reviewer", description: "Reviews code", model: "openrouter/anthropic/claude" })
  expect(JSON.stringify(metadataPayload(agent))).not.toContain("Secret full prompt")
})

test("inherits the OpenCode default model and reads agents defined in JSONC", () => {
  const agents = parseOpenCodeConfigAgents(`{
    "model": "opencode-go/gpt-5.6-luna",
    "agent": {
      "backend": { "description": "Backend", },
      "researcher": { "description": "Research", "model": "opencode/deepseek-v4-flash-free" },
    },
  }`, "global config")
  expect(agents).toEqual([
    expect.objectContaining({ name: "backend", model: "opencode-go/gpt-5.6-luna", modelSource: "inherited" }),
    expect.objectContaining({ name: "researcher", model: "opencode/deepseek-v4-flash-free", modelSource: "explicit" }),
  ])
})

test("applies the inherited model to markdown agents and lets project scope win by name", () => {
  const globalAgent = { ...parseAgentMarkdown("reviewer.md", "---\ndescription: Global review\n---\nprompt", "opencode-go/luna"), source: "global" }
  const projectAgent = { ...parseAgentMarkdown("reviewer.md", "---\ndescription: Project review\nmodel: openrouter/reviewer\n---\nprompt", "opencode-go/project"), source: "project" }
  expect(globalAgent).toMatchObject({ model: "opencode-go/luna", modelSource: "inherited" })
  expect(mergeAgents([globalAgent],[projectAgent])).toEqual([expect.objectContaining({ description: "Project review", model: "openrouter/reviewer", source: "project" })])
})
