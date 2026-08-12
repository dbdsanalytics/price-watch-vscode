export interface AgentMetadata { name: string; description: string; model: string; tools: string[]; prompt: string; source?: string }

export function parseAgentMarkdown(filename: string, source: string): AgentMetadata {
  const front = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const header = front?.[1] ?? ""; const prompt = front?.[2] ?? source
  const value = (key: string) => header.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? ""
  const tools = value("tools").replace(/^\[|\]$/g, "").split(",").map((tool) => tool.trim()).filter(Boolean)
  return { name: filename.replace(/\.(md|jsonc?)$/, ""), description: value("description"), model: value("model"), tools, prompt }
}

export function metadataPayload(agent: AgentMetadata): Omit<AgentMetadata, "prompt" | "source"> {
  return { name: agent.name, description: agent.description, model: agent.model, tools: agent.tools }
}
