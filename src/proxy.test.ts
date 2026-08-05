import { test, expect, beforeAll, afterAll } from "bun:test";
import * as net from "node:net";
import { ensureCA } from "./cert-manager.ts";
import { loadWhitelist } from "./whitelist.ts";
import { startProxy } from "./proxy.ts";
import { writeFileSync } from "node:fs";

const PROXY_PORT = 18080;

let proxyServer: net.Server;

beforeAll(async () => {
  await ensureCA();

  const wlFile = "/tmp/proxy-test-whitelist.txt";
  writeFileSync(wlFile, "gosuslugi.ru\n");
  loadWhitelist(wlFile);

  proxyServer = await startProxy(PROXY_PORT);
}, 15000);

afterAll(() => {
  proxyServer?.close();
});

function sendConnect(host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PROXY_PORT, "127.0.0.1", () => {
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
      socket.once("data", (data) => {
        socket.destroy();
        resolve(data.toString());
      });
    });
    socket.on("error", reject);
  });
}

test("CONNECT к нелистовому домену: возвращает 200", async () => {
  const response = await sendConnect("example.com", 443);
  expect(response).toContain("200");
}, 10000);

test("CONNECT к закрытому порту: возвращает 502", async () => {
  // 127.0.0.1 на порту, который точно никто не слушает → ECONNREFUSED
  const response = await sendConnect("127.0.0.1", 19876);
  expect(response).toContain("502");
}, 10000);

test("некорректный запрос (не CONNECT): соединение закрывается", async () => {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(PROXY_PORT, "127.0.0.1", () => {
      socket.write("GET / HTTP/1.1\r\n\r\n");
    });
    socket.once("close", resolve);
    socket.once("end", resolve);
    setTimeout(() => reject(new Error("timeout")), 5000);
  });
});
