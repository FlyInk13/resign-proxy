
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

---

## Проект: resign-proxy

TLS-прокси, который перевыпускает сертификаты Минцифры под свой CA для доменов из белого списка.

### Структура

```
src/index.ts          — точка входа
src/proxy.ts          — HTTP CONNECT прокси, кеш инспекции
src/inspector.ts      — TLS-инспекция upstream, определение Минцифры CA
src/cert-manager.ts   — генерация CA и листовых сертификатов, кеш
src/whitelist.ts      — загрузка whitelist, матчинг поддоменов
src/config.ts         — константы (CA_CN)
data/whitelist.txt    — домены, для которых делаем MITM
data/ca/              — генерируется автоматически, не коммитить
```

### Известные ограничения Bun

**`new tls.TLSSocket(socket, {isServer: true})` не работает в Bun.**
Вместо этого используем `tls.createServer()` на случайном localhost-порту и пробрасываем клиентский сокет через `net.connect()`. См. функцию `mitm()` в `proxy.ts`.

**Многострочные `Bun.$` шаблоны разбиваются по `\n` как отдельные команды.**
Все вызовы `openssl` через `Bun.$` должны быть на одной строке.

### Запуск локально

Порт 8080 занят Traefik — использовать другой:

```bash
PORT=8888 bun run start
```

### Тесты

```bash
bun test
```

`src/inspector.test.ts` делает реальные сетевые запросы (sberbank.ru, example.com) — нужен интернет. Остальные тесты автономны.

### Проверка MITM вживую

```bash
openssl s_client -proxy localhost:8888 -connect sberbank.ru:443 2>/dev/null \
  | openssl x509 -noout -issuer -subject
# issuer=CN=Ministry of Degradation and Memes
```

### Проверить CA домена перед добавлением в whitelist

```bash
openssl s_client -connect <domain>:443 2>/dev/null | openssl x509 -noout -issuer
```
