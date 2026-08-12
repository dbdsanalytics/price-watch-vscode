import { parseJsonc } from "../config"

export interface AgentMetadata { name: string; description: string; model: string; modelSource?: "explicit" | "inherited" | "missing"; tools: string[]; prompt: string; source?: string }

export function parseAgentMarkdown(filename: string, source: string, defaultModel = ""): AgentMetadata {
  const front = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const header = front?.[1] ?? ""; const prompt = front?.[2] ?? source
  const value = (key: string) => header.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? ""
  const tools = value("tools").replace(/^\[|\]$/g, "").split(",").map((tool) => tool.trim()).filter(Boolean)
  const explicitModel = value("model")
  return { name: filename.replace(/\.(md|jsonc?)$/, ""), description: value("description"), model: explicitModel || defaultModel, modelSource: explicitModel ? "explicit" : defaultModel ? "inherited" : "missing", tools, prompt }
}

interface ConfigAgent { description?: string; model?: string; tools?: Record<string, boolean> | string[] }
interface OpenCodeAgentConfig { model?: string; agent?: Record<string, ConfigAgent> }

export function parseOpenCodeConfigAgents(source: string, sourceName: string): AgentMetadata[] {
  const config = parseJsonc<OpenCodeAgentConfig>(source)
  return Object.entries(config.agent ?? {}).map(([name, agent]) => {
    const model = agent.model || config.model || ""
    const tools = Array.isArray(agent.tools) ? agent.tools : Object.entries(agent.tools ?? {}).filter(([,enabled])=>enabled).map(([tool])=>tool)
    return { name, description: agent.description ?? "", model, modelSource: agent.model ? "explicit" : config.model ? "inherited" : "missing", tools, prompt: "", source: sourceName }
  })
}

export function parseOpenCodeDefaultModel(source: string): string { return parseJsonc<OpenCodeAgentConfig>(source).model ?? "" }

export function mergeAgents(...scopes: AgentMetadata[][]): AgentMetadata[] {
  const merged = new Map<string,AgentMetadata>()
  for (const scope of scopes) for (const agent of scope) {
    const previous = merged.get(agent.name)
    merged.set(agent.name, previous && !agent.model ? { ...agent, model: previous.model, modelSource: previous.modelSource } : agent)
  }
  return [...merged.values()]
}

export function metadataPayload(agent: AgentMetadata): Omit<AgentMetadata, "prompt" | "source"> {
  return { name: agent.name, description: agent.description, model: agent.model, tools: agent.tools }
}
