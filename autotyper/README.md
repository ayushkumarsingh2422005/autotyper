# AutoTyper (Next.js)

Web UI + API for queuing text jobs that the local `ar` agent delivers.

## Env

```bash
AR_SECRET=change-me-to-a-long-random-string

# Required on Vercel
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
```

## Dev

```bash
npm install
npm run dev
```

Locally without Redis → in-memory queue. On Vercel → Redis is required.

## API

- `POST /api/send` — `{ text, mode: "paste" | "type" }` + header `x-ar-secret`
- `GET /api/poll` — claims next pending job for the CLI
- `GET /api/status` — pending count + `store` (`redis` | `memory`)
