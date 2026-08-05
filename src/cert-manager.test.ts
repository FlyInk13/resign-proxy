import { test, expect, beforeAll } from "bun:test";
import { ensureCA, getOrCreateCert } from "./cert-manager.ts";
import { CA_CN } from "./config.ts";
import * as tls from "node:tls";
import * as net from "node:net";

beforeAll(async () => {
  await ensureCA();
});

test("CA файлы создаются при первом запуске", async () => {
  const caDir = process.env.CA_DIR ?? "./data/ca";
  const caKey = Bun.file(`${caDir}/ca.key`);
  const caCrt = Bun.file(`${caDir}/ca.crt`);
  expect(await caKey.exists()).toBe(true);
  expect(await caCrt.exists()).toBe(true);
});

test("CA сертификат является валидным X.509", async () => {
  const caDir = process.env.CA_DIR ?? "./data/ca";
  const result = await Bun.$`openssl x509 -in ${caDir}/ca.crt -noout -subject`.text();
  expect(result).toContain(CA_CN);
});

test("генерация листового сертификата для домена", async () => {
  const { cert, key } = await getOrCreateCert("test.example.com", ["www.test.example.com"]);
  expect(cert).toContain("BEGIN CERTIFICATE");
  expect(key).toContain("BEGIN");

  // Проверяем SAN в сгенерированном сертификате
  const tmpCrt = `/tmp/test-leaf-${Date.now()}.crt`;
  await Bun.write(tmpCrt, cert);
  const sans = await Bun.$`openssl x509 -in ${tmpCrt} -noout -ext subjectAltName`.text();
  expect(sans).toContain("test.example.com");
  expect(sans).toContain("www.test.example.com");
  await Bun.$`rm -f ${tmpCrt}`.quiet();
}, 15000);

test("кеш: повторный вызов не перегенерирует сертификат", async () => {
  const first = await getOrCreateCert("cached.example.com", []);
  const second = await getOrCreateCert("cached.example.com", []);
  // Один и тот же объект из кеша
  expect(first.cert).toBe(second.cert);
}, 15000);

test("сертификат подписан нашим CA", async () => {
  const caDir = process.env.CA_DIR ?? "./data/ca";
  const { cert } = await getOrCreateCert("verify.example.com", []);
  const tmpCrt = `/tmp/test-verify-${Date.now()}.crt`;
  await Bun.write(tmpCrt, cert);

  // openssl verify вернёт 0 если сертификат валиден относительно нашего CA
  const result = await Bun.$`openssl verify -CAfile ${caDir}/ca.crt ${tmpCrt}`.text();
  expect(result).toContain("OK");
  await Bun.$`rm -f ${tmpCrt}`.quiet();
}, 15000);

test("MITM TLS handshake: клиент доверяет нашему CA", async () => {
  const { cert, key } = await getOrCreateCert("localhost", []);
  const caDir = process.env.CA_DIR ?? "./data/ca";
  const caCert = await Bun.file(`${caDir}/ca.crt`).text();

  // Поднимаем TLS-сервер с нашим сертификатом
  await new Promise<void>((resolve, reject) => {
    const server = tls.createServer({ cert, key }, (socket) => {
      socket.end("OK");
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;

      const client = tls.connect(
        { host: "127.0.0.1", port, ca: caCert, servername: "localhost" },
        () => {
          expect(client.authorized).toBe(true);
          client.destroy();
          server.close();
          resolve();
        }
      );

      client.on("error", (err) => {
        server.close();
        reject(err);
      });
    });
  });
}, 10000);
