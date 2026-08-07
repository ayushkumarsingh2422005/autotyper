# ar — AutoTyper CLI

Local background agent. Polls the deployed AutoTyper Next.js server and delivers text into the focused window via **typing** or **direct paste**.

## Install

```bash
cd autotyper_cli
npm install
npm link
```

That exposes the global `ar` command.

## Setup

```bash
ar config set serverUrl https://your-autotyper-host
ar config set secret your-shared-secret
```

`secret` must match `AR_SECRET` on the Next.js server.

## Commands

```bash
ar start      # run poller in background
ar stop
ar status
ar logs
ar test       # focus Notepad, wait 3s, paste a sample (debug input)
ar test type  # same but character-by-character
ar config
ar config set <key> <value>
```

On Windows, all delivery is **keyboard-only** via Win32 `SendInput` (no clipboard / Ctrl+V), so editors that block paste still accept it.

- **Typing mimic** → human-like delay between keys  
- **Fast type** (API mode `paste`) → same keystrokes, delay ≈ 0

Config lives in `~/.ar/config.json`. Logs in `~/.ar/agent.log`.

## Flow

1. `ar start`
2. Focus the target app (editor, form, chat, …)
3. Open the web UI → enter the same secret → send text with **Typing mimic** or **Direct paste**
4. The agent picks up the job on the next poll and outputs it
