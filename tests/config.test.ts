import { describe, expect, test } from "bun:test"
import { parseJsonc, stripJsoncComments } from "../src/config"
import manifest from "../package.json"

describe("extension manifest", () => {
  test("declares icon and repository metadata", () => {
    expect(manifest.icon).toBe("media/icon.png")
    expect(manifest.repository).toEqual({
      type: "git",
      url: "https://github.com/dbdsanalytics/price-watch-vscode.git",
    })
  })

  test("declares a separate OpenRouter management connection command", () => {
    expect(manifest.contributes.commands).toContainEqual({
      command: "priceWatch.connectOpenRouterManagement",
      title: "OpenRouter Management Key verbinden",
      category: "Preis-Watch",
    })
  })
})

describe("stripJsoncComments", () => {
  test("entfernt //-Kommentare", () => {
    expect(stripJsoncComments('{ "a": 1 // kommentar\n }')).toBe('{ "a": 1 \n }')
  })

  test("entfernt Blockkommentare", () => {
    expect(stripJsoncComments('{ "a": /* x */ 1 }')).toBe('{ "a":  1 }')
  })

  test("beschädigt keine // innerhalb von Strings", () => {
    expect(stripJsoncComments('{ "url": "http://example.com/x" }')).toBe('{ "url": "http://example.com/x" }')
  })

  test("beschädigt keine http-URLs auch in offener Config", () => {
    const src = `{
      "provider": {
        "lmstudio": { "options": { "baseURL": "http://100.64.75.90:1234/v1" } }
      }
      // Ende
    }`
    const cleaned = stripJsoncComments(src)
    expect(cleaned).toContain("http://100.64.75.90:1234/v1")
    expect(JSON.parse(cleaned)).toBeTruthy()
  })
})

describe("parseJsonc", () => {
  test("parst JSONC mit Kommentaren", () => {
    const cfg = parseJsonc<{ a: number; b: string }>('{ "a": 1, // x\n "b": "y" /* z */ }')
    expect(cfg).toEqual({ a: 1, b: "y" })
  })
})
