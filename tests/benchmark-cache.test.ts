import { expect, test } from "bun:test"
import { loadBenchmarks, type BenchmarkStorage } from "../src/domain/benchmark-cache"
import type { OpenRouterBenchmarkSnapshot } from "../src/providers/openrouter-benchmarks"

const snapshot = (fetchedAt:number):OpenRouterBenchmarkSnapshot => ({ fetchedAt, asOf:"2026-08-11T12:00:00Z", items:[] })
const storage = (cached?:OpenRouterBenchmarkSnapshot):BenchmarkStorage => ({ get:<T>()=>cached as T|undefined, update:async()=>{} })

test("uses a benchmark cache younger than 24 hours", async () => {
  let calls=0
  const result=await loadBenchmarks(storage(snapshot(1_000)),"key",false,async()=>{calls++;return snapshot(2_000)},1_000+60_000)
  expect(result?.fetchedAt).toBe(1_000)
  expect(calls).toBe(0)
})

test("refreshes expired cache and permits a forced refresh", async () => {
  let calls=0
  const loader=async()=>{calls++;return snapshot(100_000_000)}
  await loadBenchmarks(storage(snapshot(1_000)),"key",false,loader,1_000+86_400_001)
  await loadBenchmarks(storage(snapshot(1_000)),"key",true,loader,2_000)
  expect(calls).toBe(2)
})

test("falls back to cached benchmarks when refresh fails", async () => {
  const cached=snapshot(1_000)
  expect(await loadBenchmarks(storage(cached),"key",true,async()=>{throw new Error("offline")},2_000)).toEqual(cached)
})
