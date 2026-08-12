import { expect, test } from "bun:test"
import { shouldRunAi } from "../src/domain/ai-schedule"

const HOUR = 3_600_000

test("skips automatic runs inside the configured interval", () => {
  expect(shouldRunAi({ lastAt: HOUR, now: 6 * HOUR, everyHours: 6, manual: false, hasChanges: true })).toBe(false)
})

test("runs automatically once the interval has passed", () => {
  expect(shouldRunAi({ lastAt: HOUR, now: 7 * HOUR, everyHours: 6, manual: false, hasChanges: true })).toBe(true)
})

test("stays quiet without changes even after the interval", () => {
  expect(shouldRunAi({ lastAt: HOUR, now: 24 * HOUR, everyHours: 6, manual: false, hasChanges: false })).toBe(false)
})

test("lets an explicit refresh bypass the interval", () => {
  expect(shouldRunAi({ lastAt: HOUR, now: 2 * HOUR, everyHours: 6, manual: true, hasChanges: false })).toBe(true)
})

test("runs on the first automatic check that finds changes", () => {
  expect(shouldRunAi({ lastAt: null, now: HOUR, everyHours: 6, manual: false, hasChanges: true })).toBe(true)
})
