import { expect, test } from "bun:test"
import { metadataPayload, parseAgentMarkdown } from "../src/agents/discovery"

test("extracts agent metadata without sending the prompt", () => {
  const agent = parseAgentMarkdown("reviewer.md", `---\ndescription: Reviews code\nmodel: openrouter/anthropic/claude\ntools: [read, grep]\n---\nSecret full prompt`)
  expect(agent).toMatchObject({ name: "reviewer", description: "Reviews code", model: "openrouter/anthropic/claude" })
  expect(JSON.stringify(metadataPayload(agent))).not.toContain("Secret full prompt")
})
