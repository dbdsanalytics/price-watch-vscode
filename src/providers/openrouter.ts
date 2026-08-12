import type { ModelOffer } from "../domain/model"
import { usdPerMillion } from "../domain/model"

interface ApiModel { id: string; canonical_slug?: string; name: string; description?: string; context_length?: number; pricing?: Record<string, string>; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: string[]; benchmarks?: { artificial_analysis?: { intelligence_index?: number; coding_index?: number; agentic_index?: number } } }

export function parseOpenRouterModels(body: { data?: ApiModel[] }): ModelOffer[] {
  return (body.data ?? []).map((model) => {
    const parameters = new Set(model.supported_parameters ?? [])
    const inputModalities = model.architecture?.input_modalities ?? ["text"]
    const description = model.description?.toLowerCase() ?? ""
    const coding = /cod(e|ing|program|software)/.test(description)
    const promptPrice = Number.parseFloat(model.pricing?.prompt ?? "")
    const completionPrice = Number.parseFloat(model.pricing?.completion ?? "")
    const unknown = !Number.isFinite(promptPrice) || !Number.isFinite(completionPrice) || promptPrice < 0 || completionPrice < 0
    return {
      provider: "openrouter",
      id: model.id,
      name: model.name,
      description: model.description,
      pricing: {
        input: usdPerMillion(model.pricing?.prompt), output: usdPerMillion(model.pricing?.completion), unknown,
        request: Number.parseFloat(model.pricing?.request ?? "") || 0,
        cacheRead: usdPerMillion(model.pricing?.input_cache_read), cacheWrite: usdPerMillion(model.pricing?.input_cache_write),
        image: Number.parseFloat(model.pricing?.image ?? "") || 0, webSearch: Number.parseFloat(model.pricing?.web_search ?? "") || 0,
      },
      capabilities: {
        inputModalities, outputModalities: model.architecture?.output_modalities ?? ["text"],
        tools: parameters.has("tools"), structuredOutput: parameters.has("structured_outputs") || parameters.has("response_format"),
        reasoning: parameters.has("reasoning") || parameters.has("include_reasoning"), contextLength: model.context_length ?? null,
        purposes: [...new Set(["language", "allround", ...(coding ? ["coding", "tools"] : []), ...(inputModalities.includes("image") ? ["vision"] : []), ...(parameters.has("reasoning") ? ["reasoning"] : [])])] as ModelOffer["capabilities"]["purposes"],
      },
      benchmarks: model.benchmarks?.artificial_analysis ? { source: "OpenRouter / Artificial Analysis", match: "direct", intelligence: model.benchmarks.artificial_analysis.intelligence_index, coding: model.benchmarks.artificial_analysis.coding_index, agentic: model.benchmarks.artificial_analysis.agentic_index } : undefined,
    }
  })
}

export async function fetchOpenRouterCatalog(): Promise<ModelOffer[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=all&sort=intelligence-high-to-low", { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`)
  return parseOpenRouterModels(await response.json() as { data?: ApiModel[] })
}
