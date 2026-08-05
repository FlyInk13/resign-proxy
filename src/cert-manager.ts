import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CA_CN } from "./config.ts";

const CA_DIR = process.env.CA_DIR ?? "./data/ca";
const CA_KEY = join(CA_DIR, "ca.key");
const CA_CRT = join(CA_DIR, "ca.crt");

interface CachedCert {
  cert: string;
  key: string;
  expiry: number;
}

const certCache = new Map<string, CachedCert>();
const inFlight = new Map<string, Promise<CachedCert>>();

export async function ensureCA(): Promise<void> {
  if (!existsSync(CA_DIR)) mkdirSync(CA_DIR, { recursive: true });

  if (existsSync(CA_KEY) && existsSync(CA_CRT)) return;

  console.log("Generating CA keypair (this happens once)...");
  await Bun.$`openssl genrsa -out ${CA_KEY} 4096`.quiet();
  await Bun.$`openssl req -new -x509 -days 3650 -key ${CA_KEY} -out ${CA_CRT} -subj "/CN=${CA_CN}/O=Personal/C=RU"`.quiet();

  console.log(`\nCA ready. Install on your devices:\n  ${CA_CRT}\n`);
}

export async function getOrCreateCert(
  host: string,
  sans: string[]
): Promise<{ cert: string; key: string }> {
  const cached = certCache.get(host);
  if (cached && cached.expiry > Date.now()) return cached;

  const existing = inFlight.get(host);
  if (existing) return existing;

  const promise = generateCert(host, sans);
  inFlight.set(host, promise);

  try {
    const result = await promise;
    certCache.set(host, result);
    return result;
  } finally {
    inFlight.delete(host);
  }
}

async function generateCert(host: string, sans: string[]): Promise<CachedCert> {
  console.log(`[CERT]   ${host} — выпускаем сертификат`);
  const id = crypto.randomUUID();
  const keyFile = `/tmp/${id}.key`;
  const csrFile = `/tmp/${id}.csr`;
  const crtFile = `/tmp/${id}.crt`;
  const extFile = `/tmp/${id}.ext`;

  // Всегда включаем сам хост в SAN
  const allSans = [...new Set([host, ...sans])];
  const sanValue = allSans.map((s) => `DNS:${s}`).join(",");

  await Bun.write(extFile, `[SAN]\nsubjectAltName=${sanValue}\n`);

  try {
    await Bun.$`openssl genrsa -out ${keyFile} 2048`.quiet();
    await Bun.$`openssl req -new -key ${keyFile} -out ${csrFile} -subj "/CN=${host}"`.quiet();
    await Bun.$`openssl x509 -req -days 365 -in ${csrFile} -CA ${CA_CRT} -CAkey ${CA_KEY} -CAcreateserial -out ${crtFile} -extensions SAN -extfile ${extFile}`.quiet();

    const [cert, key] = await Promise.all([
      Bun.file(crtFile).text(),
      Bun.file(keyFile).text(),
    ]);

    return { cert, key, expiry: Date.now() + 23 * 60 * 60 * 1000 };
  } finally {
    await Bun.$`rm -f ${keyFile} ${csrFile} ${crtFile} ${extFile}`.quiet();
  }
}
