import type { AgentAssessment } from "../../agents/assessment"
import type { AgentMetadata } from "../../agents/discovery"
import type { Purpose } from "../../domain/ranking"
import { esc } from "../format"
import { purposeBadge } from "./models"

export const statusLabel: Record<AgentAssessment["status"],string> = { suitable:"Passend", expensive:"Teuer", "alternative-available":"Alternative", unsuitable:"Unpassend", deprecated:"Veraltet", local:"Lokal", unknown:"Nicht bewertbar" }

function agentPurpose(agent: AgentMetadata): Purpose {
  const text = `${agent.name} ${agent.description}`.toLowerCase()
  if (/translat|sprach|writ/.test(text)) return "language"
  if (/vision|image/.test(text)) return "vision"
  if (/research|reason|orchestrat/.test(text)) return "reasoning"
  if (/tool/.test(text)) return "tools"
  return "coding"
}

function agentGroup(status: AgentAssessment["status"]): "attention"|"suitable"|"unknown" { return status === "suitable" ? "suitable" : status === "unknown" || status === "local" ? "unknown" : "attention" }

export function renderAgentRow(item: AgentAssessment, compact = false): string {
  const purpose = agentPurpose(item.agent)
  return `<article class="agent-row${compact ? " agent-preview" : ""}"><div class="agent-identity"><strong>${esc(item.agent.name)}</strong>${purposeBadge(purpose)}</div><div class="agent-model"><span>Aktuelles Modell</span><strong>${esc(item.agent.model || "Kein Modell zugewiesen")}</strong></div><div class="agent-result"><span class="status status-${item.status}">${statusLabel[item.status]}</span>${compact ? "" : `<small>${esc(item.reason)}</small>`}${!compact && item.alternative ? `<small>Empfehlung: <strong>${esc(item.alternative.name)}</strong></small>` : ""}</div></article>`
}

export function renderAgentGroups(items: AgentAssessment[]): string {
  const groups = [{ key:"attention", title:"Handlungsbedarf", hint:"Prüfen oder optimieren" },{ key:"suitable", title:"Passend", hint:"Derzeit sinnvoll eingesetzt" },{ key:"unknown", title:"Nicht bewertbar", hint:"Modellzuordnung oder Daten fehlen" }] as const
  return groups.map((group)=>{ const rows=items.filter((item)=>agentGroup(item.status)===group.key); return `<section class="agent-group agent-group-${group.key}"><header><div><h2>${group.title}</h2><p>${group.hint}</p></div><span>${rows.length}</span></header>${rows.length ? `<div class="agent-rows">${rows.map((item)=>renderAgentRow(item)).join("")}</div>` : `<p class="empty group-empty">Keine Agenten in dieser Gruppe</p>`}</section>` }).join("")
}
