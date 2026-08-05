FROM oven/bun:1-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

VOLUME /app/data

EXPOSE 8443

CMD ["bun", "run", "src/index.ts"]
