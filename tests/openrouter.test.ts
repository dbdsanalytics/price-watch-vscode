import { describe, expect, test } from "bun:test"
import { parseOpenRouterModels } from "../src/providers/openrouter"

describe("OpenRouter catalog", () => {
  test("normalizes prices and capabilities", () => {
    const offers = parseOpenRouterModels({ data: [{ id: "acme/x", name: "X", description: "Coding model", context_length: 128000, pricing: { prompt: "0.000003", completion: "0.000015", request: "0" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, supported_parameters: ["tools", "reasoning", "structured_outputs"] }] })
    expect(offers[0]?.pricing).toMatchObject({ input: 3, output: 15, request: 0 })
    expect(offers[0]?.capabilities).toMatchObject({ tools: true, reasoning: true, structuredOutput: true, contextLength: 128000 })
  })
})
