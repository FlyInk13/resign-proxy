import * as net from "node:net";
import * as tls from "node:tls";
import { isWhitelisted } from "./whitelist.ts";
import { inspectUpstream } from "./inspector.ts";
import { getOrCreateCert } from "./cert-manager.ts";

const PORT = parseInt(process.env.PORT ?? "8443");

interface InspectionCacheEntry {
  isMintsifry: boolean;
  sans: string[];
  expiry: number;
}

const inspectionCache = new Map<string, InspectionCacheEntry>();

async function getCachedInspection(host: string, port: number): Promise<InspectionCacheEntry> {
  const cached = inspectionCache.get(host);
  if (cached && cached.expiry > Date.now()) return cached;

  const result = await inspectUpstream(host, port);
  const entry = { ...result, expiry: Date.now() + 24 * 60 * 60 * 1000 };
  inspectionCache.set(host, entry);
  return entry;
}

export function startProxy(port = PORT): Promise<net.Server> {
  const server = net.createServer((socket) => {
    socket.once("data", (data: Buffer) => void handleConnect(socket, data));
    socket.on("error", () => socket.destroy());
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Proxy listening on :${port}`);
      resolve(server);
    });
  });
}

async function handleConnect(client: net.Socket, data: Buffer): Promise<void> {
  const request = data.toString("ascii", 0, 512);
  const match = /^CONNECT ([^:\s]+):(\d+) HTTP/i.exec(request);

  if (!match) {
    client.destroy();
    return;
  }

  const host = match[1]!;
  const port = parseInt(match[2]!);

  if (!isWhitelisted(host)) {
    tunnel(client, host, port);
    return;
  }

  try {
    const { isMintsifry, sans } = await getCachedInspection(host, port);

    if (isMintsifry) {
      console.log(`[MITM]   ${host}`);
      await mitm(client, host, port, sans);
    } else {
      console.log(`[TUNNEL] ${host}`);
      tunnel(client, host, port);
    }
  } catch (err) {
    console.error(`[ERROR]  ${host}:`, (err as Error).message);
    client.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    client.destroy();
  }
}

async function mitm(
  client: net.Socket,
  host: string,
  port: number,
  sans: string[]
): Promise<void> {
  const { cert, key } = await getOrCreateCert(host, sans);

  // Bun не поддерживает new tls.TLSSocket(socket, {isServer: true}).
  // Вместо этого поднимаем настоящий tls.Server на localhost и пробрасываем
  // клиентский сокет через него — TLS handshake происходит внутри сервера.
  const tlsServer = tls.createServer({ cert, key });

  await new Promise<void>((resolve, reject) => {
    tlsServer.once("error", reject);
    tlsServer.listen(0, "127.0.0.1", resolve);
  });

  const { port: localPort } = tlsServer.address() as net.AddressInfo;

  tlsServer.once("secureConnection", (tlsSocket) => {
    tlsServer.close();

    const upstream = tls.connect({ host, port, servername: host, rejectUnauthorized: false });

    tlsSocket.pipe(upstream);
    upstream.pipe(tlsSocket);

    const cleanup = () => { tlsSocket.destroy(); upstream.destroy(); };
    tlsSocket.on("error", cleanup);
    upstream.on("error", cleanup);
    tlsSocket.on("close", cleanup);
    upstream.on("close", cleanup);
  });

  // Пишем 200 до старта TLS — клиент ждёт его перед отправкой ClientHello.
  // ClientHello буферизуется в client до вызова pipe() ниже.
  client.write("HTTP/1.1 200 Connection established\r\n\r\n");

  const bridge = net.connect(localPort, "127.0.0.1", () => {
    client.pipe(bridge);
    bridge.pipe(client);
  });

  const cleanup = () => { client.destroy(); bridge.destroy(); tlsServer.close(); };
  bridge.on("error", cleanup);
  client.on("error", cleanup);
}

function tunnel(client: net.Socket, host: string, port: number): void {
  const upstream = net.connect(port, host, () => {
    client.write("HTTP/1.1 200 Connection established\r\n\r\n");
    client.pipe(upstream);
    upstream.pipe(client);
  });

  upstream.on("error", () => {
    client.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    client.destroy();
    upstream.destroy();
  });
  client.on("error", () => upstream.destroy());
}
