# AutoTyper

Remote text → local keyboard (wherever your cursor is focused).

| Package | Role |
|---------|------|
| [`autotyper`](./autotyper) | Next.js web UI + job API (deploy on Vercel) |
| [`autotyper_cli`](./autotyper_cli) | Local `ar` CLI agent (runs on your PC) |

## Cursor / focus

Yes — the agent types or pastes into **whatever window currently has keyboard focus** on your PC (the caret / typing cursor). Focus Notepad, a browser input, IDE, chat box, etc. *before* the job arrives. There is a short `focusDelayMs` (default 800ms) after a job is claimed so you can switch windows if needed.

## Storage (important for Vercel)

Vercel serverless functions do **not** share memory. An in-memory queue would lose jobs between `send` and `poll`.

On Vercel you **must** set Upstash Redis:

| Env | Purpose |
|-----|---------|
| `AR_SECRET` | Shared secret for web UI + CLI |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

Locally, if Redis env vars are missing, it falls back to in-memory (fine for `npm run dev` on one machine).

### Upstash setup (free)

1. Create a DB at [console.upstash.com](https://console.upstash.com)
2. Copy **REST URL** + **REST TOKEN**
3. In Vercel project → Settings → Environment Variables → add both + `AR_SECRET`
4. Redeploy

## How it works

1. `ar start` on your machine — background poller hits `/api/poll`
2. Web UI: paste text → **Typing mimic** or **Direct paste** → **Send**
3. Job is stored in Redis → CLI claims it → types or pastes into the focused window

## Quick start (local)

**Server**

```bash
cd autotyper
cp .env.example .env.local
npm install
npm run dev
```

**CLI**

```bash
cd autotyper_cli
npm install
npm link
ar config set serverUrl http://localhost:3000
ar config set secret ar-dev-secret
ar start
```

## Deploy (Vercel)

1. Deploy the `autotyper/` folder
2. Set `AR_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
3. Redeploy
4. On your PC:

```bash
ar config set serverUrl https://your-app.vercel.app
ar config set secret <same-as-AR_SECRET>
ar start
```
