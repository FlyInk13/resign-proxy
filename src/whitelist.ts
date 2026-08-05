import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const entries = new Set<string>();

export function loadWhitelist(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "# Добавьте домены с Минцифры CA, по одному на строку\n");
    console.log(`Whitelist not found, created empty: ${path}`);
    return;
  }

  const lines = readFileSync(path, "utf8").split("\n");
  for (const raw of lines) {
    const domain = raw.trim().toLowerCase();
    if (domain && !domain.startsWith("#")) {
      entries.add(domain);
    }
  }
  console.log(`Whitelist loaded: ${entries.size} domains`);
}

export function isWhitelisted(host: string): boolean {
  const h = host.toLowerCase();
  if (entries.has(h)) return true;
  // Проверяем родительские домены: sub.example.com → example.com
  const parts = h.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (entries.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
