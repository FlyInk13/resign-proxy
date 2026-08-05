import { test, expect } from "bun:test";
import { inspectUpstream } from "./inspector.ts";

// Сетевые тесты — требуют интернет-доступа.
// Запускать отдельно: bun test --timeout 15000

test("sberbank.ru использует Минцифры CA", async () => {
  const result = await inspectUpstream("sberbank.ru", 443);
  expect(result.isMintsifry).toBe(true);
  expect(result.sans.length).toBeGreaterThan(0);
  expect(result.sans.some((s) => s.includes("sberbank.ru"))).toBe(true);
}, 15000);

test("example.com НЕ использует Минцифры CA", async () => {
  const result = await inspectUpstream("example.com", 443);
  expect(result.isMintsifry).toBe(false);
}, 10000);

test("google.com НЕ использует Минцифры CA", async () => {
  const result = await inspectUpstream("google.com", 443);
  expect(result.isMintsifry).toBe(false);
}, 10000);
