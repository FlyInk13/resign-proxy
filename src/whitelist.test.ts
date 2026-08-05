import { test, expect, beforeAll } from "bun:test";
import { loadWhitelist, isWhitelisted } from "./whitelist.ts";
import { writeFileSync, unlinkSync } from "node:fs";

const TEST_FILE = "/tmp/test-whitelist.txt";

beforeAll(() => {
  writeFileSync(
    TEST_FILE,
    [
      "# comment",
      "gosuslugi.ru",
      "nalog.gov.ru",
      "",
      "  mos.ru  ", // whitespace должен обрезаться
    ].join("\n")
  );
  loadWhitelist(TEST_FILE);
});

test("точное совпадение домена", () => {
  expect(isWhitelisted("gosuslugi.ru")).toBe(true);
  expect(isWhitelisted("nalog.gov.ru")).toBe(true);
  expect(isWhitelisted("mos.ru")).toBe(true);
});

test("поддомен попадает под родительский домен", () => {
  expect(isWhitelisted("www.gosuslugi.ru")).toBe(true);
  expect(isWhitelisted("lk.gosuslugi.ru")).toBe(true);
  expect(isWhitelisted("deep.sub.mos.ru")).toBe(true);
});

test("чужой домен не в whitelist", () => {
  expect(isWhitelisted("sberbank.ru")).toBe(false);
  expect(isWhitelisted("google.com")).toBe(false);
  expect(isWhitelisted("telegram.org")).toBe(false);
});

test("регистр не важен", () => {
  expect(isWhitelisted("GOSUSLUGI.RU")).toBe(true);
  expect(isWhitelisted("Nalog.Gov.Ru")).toBe(true);
});

test("комментарии и пустые строки игнорируются", () => {
  expect(isWhitelisted("comment")).toBe(false);
  expect(isWhitelisted("#")).toBe(false);
});
