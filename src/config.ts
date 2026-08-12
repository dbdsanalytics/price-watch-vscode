import { homedir } from "os"
import { join } from "path"
import { readFileSync } from "fs"

/** Entfernt Zeilen- und Blockkommentare aus JSONC, ohne Strings zu beschädigen. */
export function stripJsoncComments(src: string): string {
  let out = ""
  let inString = false
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (inString) {
      out += c
      if (c === "\\") {
        out += next ?? ""
        i += 2
        continue
      }
      if (c === '"') inString = false
      i += 1
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i += 1
      continue
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1
      continue
    }
    if (c === "/" && next === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

export function parseJsonc<T = unknown>(src: string): T {
  return JSON.parse(stripJsoncComments(src)) as T
}

interface ProviderModel {
  models?: Record<string, unknown>
}

interface OpencodeConfig {
  provider?: Record<string, ProviderModel>
}

function readConfigFiles(): OpencodeConfig[] {
  const configs: OpencodeConfig[] = []
  const home = homedir()
  const candidates = [join(home, ".config", "opencode", "opencode.json"), join(home, ".config", "opencode", "opencode.jsonc")]
  for (const file of candidates) {
    try {
      configs.push(parseJsonc<OpencodeConfig>(readFileSync(file, "utf8")))
    } catch {
      // Datei fehlt oder ist kaputt — ignorieren
    }
  }
  return configs
}

/** Modell-Referenz aus der opencode-Config: Provider-Name + Modell-ID. */
export interface ModelRef {
  provider: string
  id: string
}

/** Liefert die in der opencode-Config genutzten Modell-Referenzen (z. B. { provider: "openrouter", id: "deepseek/deepseek-v4-flash" }). */
export function opencodeModelRefs(): ModelRef[] {
  const refs: ModelRef[] = []
  for (const cfg of readConfigFiles()) {
    for (const [provider, providerCfg] of Object.entries(cfg.provider ?? {})) {
      for (const id of Object.keys(providerCfg.models ?? {})) refs.push({ provider, id })
    }
  }
  return refs
}
