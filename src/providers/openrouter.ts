import type { ModelOffer } from "../domain/model"
import { usdPerMillion } from "../domain/model"

interface ApiModel { id: string; name: string; description?: string; context_length?: number; pricing?: Record<string, string>; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: string[] }

export function parseOpenRouterModels(body: { data?: ApiModel[] }): ModelOffer[] {
  return (body.data ?? []).map((model) => {
    const parameters = new Set(model.supported_parameters ?? [])
    const inputModalities = model.architecture?.input_modalities ?? ["text"]
    return {
      provider: "openrouter",
      id: model.id,
      name: model.name,
      description: model.description,
      pricing: {
        input: usdPerMillion(model.pricing?.prompt), output: usdPerMillion(model.pricing?.completion),
        request: Number.parseFloat(model.pricing?.request ?? "") || 0,
        cacheRead: usdPerMillion(model.pricing?.input_cache_read), cacheWrite: usdPerMillion(model.pricing?.input_cache_write),
        image: Number.parseFloat(model.pricing?.image ?? "") || 0, webSearch: Number.parseFloat(model.pricing?.web_search ?? "") || 0,
      },
      capabilities: {
        inputModalities, outputModalities: model.architecture?.output_modalities ?? ["text"],
        tools: parameters.has("tools"), structuredOutput: parameters.has("structured_outputs") || parameters.has("response_format"),
        reasoning: parameters.has("reasoning") || parameters.has("include_reasoning"), contextLength: model.context_length ?? null,
        purposes: inputModalities.includes("image") ? ["language", "vision", "allround"] : ["language", "allround"],
      },
    }
  })
}

export async function fetchOpenRouterCatalog(): Promise<ModelOffer[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=all", { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`)
  return parseOpenRouterModels(await response.json() as { data?: ApiModel[] })
}
