import { describe, expect, test } from "bun:test"
import { sanitizeErrorText } from "../src/domain/sanitize"

describe("sanitizeErrorText", () => {
  test("masks sk- tokens with at least 16 characters", () => {
    expect(sanitizeErrorText("sk-abCdEfGhIjKlMnOpQrStUvWx")).toBe("***")
  })

  test("masks bearer tokens", () => {
    expect(sanitizeErrorText("Authorization: Bearer abc.def-ghij_klmnop123")).toBe(
      "Authorization: ***",
    )
  })

  test("leaves ordinary error text unchanged", () => {
    expect(sanitizeErrorText("Failed to fetch https://example.test/models")).toBe(
      "Failed to fetch https://example.test/models",
    )
  })

  test("keeps short sk- prefixes unmasked", () => {
    expect(sanitizeErrorText("sk-abc")).toBe("sk-abc")
  })

  test("masks every occurrence in a text", () => {
    const input =
      "first sk-aaaaaaaaaaaaaaaa then Bearer bbbbbbbbbb.cccc-dddd and sk-eeeeeeeeeeeeeeee"
    expect(sanitizeErrorText(input)).toBe("first *** then *** and ***")
  })
})