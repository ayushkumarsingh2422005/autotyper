const { keyboard, Key } = require("@nut-tree-fork/nut-js");
const { loadConfig, LOG_PATH, ensureAppDir } = require("./paths");
const fs = require("fs");

keyboard.config.autoDelayMs = 0;

let clipboardy;
function getClipboard() {
  if (!clipboardy) clipboardy = require("clipboardy");
  return clipboardy;
}

function log(...args) {
  ensureAppDir();
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    /* ignore */
  }
  // Also echo when not fully detached / for debugging
  if (process.env.AR_FOREGROUND === "1") {
    console.log(...args);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pasteText(text) {
  const clip = getClipboard();
  await clip.write(text);
  const modifier = process.platform === "darwin" ? Key.LeftSuper : Key.LeftControl;
  await keyboard.pressKey(modifier);
  await keyboard.pressKey(Key.V);
  await keyboard.releaseKey(Key.V);
  await keyboard.releaseKey(modifier);
}

async function press(key) {
  await keyboard.pressKey(key);
  await keyboard.releaseKey(key);
}

async function typeText(text, delayMs) {
  for (const char of text) {
    if (char === "\r") continue;
    if (char === "\n") {
      await press(Key.Enter);
    } else if (char === "\t") {
      await press(Key.Tab);
    } else {
      try {
        await keyboard.type(char);
      } catch {
        // Fallback for characters nut-js can't type directly
        await pasteText(char);
      }
    }
    const jitter = Math.floor(Math.random() * Math.max(1, delayMs));
    await sleep(delayMs + jitter);
  }
}

async function deliver(job, config) {
  log(`delivering job ${job.id} mode=${job.mode} chars=${job.text.length}`);
  await sleep(config.focusDelayMs || 800);

  if (job.mode === "paste") {
    await pasteText(job.text);
  } else {
    await typeText(job.text, config.typeDelayMs || 35);
  }
  log(`done job ${job.id}`);
}

async function pollOnce(config) {
  const base = String(config.serverUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("serverUrl is not set");

  const url = `${base}/api/poll`;
  const res = await fetch(url, {
    headers: {
      "x-ar-secret": config.secret || "",
      Accept: "application/json",
    },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized — check secret matches AR_SECRET on the server");
  }
  if (!res.ok) {
    throw new Error(`poll failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.job || null;
}

async function loop() {
  const config = loadConfig();
  log(`agent started → ${config.serverUrl} (poll every ${config.pollIntervalMs}ms)`);

  let busy = false;
  let consecutiveErrors = 0;

  for (;;) {
    try {
      if (!busy) {
        const job = await pollOnce(loadConfig());
        if (job && typeof job.text === "string") {
          busy = true;
          try {
            await deliver(job, loadConfig());
            consecutiveErrors = 0;
          } finally {
            busy = false;
          }
        } else {
          consecutiveErrors = 0;
        }
      }
    } catch (err) {
      consecutiveErrors += 1;
      log("poll error:", err.message || err);
      // Back off a bit on repeated failures
      await sleep(Math.min(15_000, 1000 * consecutiveErrors));
    }

    const interval = loadConfig().pollIntervalMs || 1500;
    await sleep(interval);
  }
}

loop().catch((err) => {
  log("fatal:", err.message || err);
  process.exit(1);
});
