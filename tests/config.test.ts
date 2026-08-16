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

  // Das Manifest verweist auf media/icon.png; erst der Dateitest faengt ein
  // fehlendes oder korruptes Icon. PNG-Kopfdaten: Signatur (8 Bytes), dann
  // IHDR-Komplex mit Breite (Offset 16), Hoehe (Offset 20), Bittiefe (24) und
  // Farbtyp (25) — 6 bedeutet RGBA.
  test("icon file exists as a 128x128 RGBA PNG", async () => {
    const icon = Bun.file(new URL("../media/icon.png", import.meta.url))
    expect(await icon.exists()).toBe(true)
    const bytes = new Uint8Array(await icon.arrayBuffer())
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(16)).toBe(128)
    expect(view.getUint32(20)).toBe(128)
    expect(bytes[24]).toBe(8)
    expect(bytes[25]).toBe(6)
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
