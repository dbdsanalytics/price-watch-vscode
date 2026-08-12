import type { AgentMetadata } from "./discovery"
import type { ModelOffer } from "../domain/model"

export interface AgentAssessment { agent: AgentMetadata; status: "suitable" | "expensive" | "alternative-available" | "unsuitable" | "deprecated" | "unknown"; reason: string; alternative?: ModelOffer }

export function assessAgent(agent: AgentMetadata, offers: ModelOffer[]): AgentAssessment {
  const current = offers.find((offer) => agent.model.endsWith(offer.id))
  if (!current) return { agent, status: "unknown", reason: "Aktuelles Modell nicht im Katalog" }
  if (current.deprecatedAt) return { agent, status: "deprecated", reason: `Abgekündigt: ${current.deprecatedAt}` }
  const codingAgent = /code|review|build|debug|develop/i.test(`${agent.name} ${agent.description}`)
  if (codingAgent && !current.capabilities.purposes.includes("coding")) return { agent, status: "unsuitable", reason: "Keine belastbaren Coding-Fähigkeiten ausgewiesen" }
  const currentCost = current.pricing.input + current.pricing.output
  const currentScore = current.benchmarks?.coding
  const alternative = currentScore === undefined ? undefined : offers.filter((offer) => offer.id !== current.id && (!codingAgent || offer.capabilities.purposes.includes("coding"))).filter((offer) => offer.benchmarks?.coding !== undefined && offer.benchmarks.coding >= currentScore * 0.9).filter((offer) => offer.pricing.input + offer.pricing.output < currentCost * 0.7).sort((a,b)=>(b.benchmarks?.coding ?? 0)-(a.benchmarks?.coding ?? 0))[0]
  return alternative ? { agent, status: "alternative-available", reason: "Mindestens 30 % günstigere Alternative verfügbar", alternative } : { agent, status: "suitable", reason: "Fähigkeiten und Preis weiterhin passend" }
}
