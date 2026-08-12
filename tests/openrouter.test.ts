import { describe, expect, test } from "bun:test"
import { parseOpenRouterModels } from "../src/providers/openrouter"

describe("OpenRouter catalog", () => {
  test("normalizes prices and capabilities", () => {
    const offers = parseOpenRouterModels({ data: [{ id: "acme/x", name: "X", description: "Coding model", context_length: 128000, pricing: { prompt: "0.000003", completion: "0.000015", request: "0" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, supported_parameters: ["tools", "reasoning", "structured_outputs"], benchmarks: { artificial_analysis: { intelligence_index: 70, coding_index: 80, agentic_index: 60 } } }] })
    expect(offers[0]?.pricing).toMatchObject({ input: 3, output: 15, request: 0 })
    expect(offers[0]?.capabilities).toMatchObject({ tools: true, reasoning: true, structuredOutput: true, contextLength: 128000 })
    expect(offers[0]?.benchmarks).toMatchObject({ intelligence: 70, coding: 80, agentic: 60 })
  })

  test("marks negative or missing token prices as unknown rather than free", () => {
    const [offer] = parseOpenRouterModels({ data: [{ id: "openrouter/auto", name: "Auto Router", pricing: { prompt: "-1", completion: "-1" } }] })
    expect(offer?.pricing).toMatchObject({ input: 0, output: 0, unknown: true })
  })
})
