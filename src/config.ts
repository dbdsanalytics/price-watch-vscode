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
  return JSON.parse(stripJsoncComments(src).replace(/,\s*([}\]])/g, "$1")) as T
}

