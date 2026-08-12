import { expect, test } from "bun:test"
import { panelHtml } from "../src/panel"

test("renders safe responsive four-view dashboard", () => {
  const html = panelHtml({ snapshots: [], history: [], agents: [], accounts: [], ai: null, updatedAt: 0 })
  expect(html).toContain("grid-template-columns:2fr 1fr 1fr")
  expect(html).toContain("data-view=\"models\"")
  expect(html).toContain("Konten &amp; Limits")
  expect(html).toContain("Reasoning")
  expect(html).toContain('id="purpose"')
  expect(html).toContain("content-security-policy")
  expect(html).not.toContain("onclick=")
})
