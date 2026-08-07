const { loadConfig, LOG_PATH, ensureAppDir } = require("./paths");
const { pasteText, typeText, sleep } = require("./input");
const fs = require("fs");

function log(...args) {
  ensureAppDir();
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    /* ignore */
  }
  if (process.env.AR_FOREGROUND === "1") {
    console.log(...args);
  }
}

async function deliver(job, config) {
  log(`delivering job ${job.id} mode=${job.mode} chars=${job.text.length}`);
  const delay = config.focusDelayMs || 800;
  log(`waiting ${delay}ms — focus the target window now`);
  await sleep(delay);

  if (job.mode === "paste") {
    // Fast keyboard dump (no clipboard — anti-paste safe)
    const fastDelay = Number.isFinite(config.pasteDelayMs)
      ? config.pasteDelayMs
      : 0;
    log(`mode=paste → fast keyboard (delayMs=${fastDelay})`);
    await pasteText(job.text, log, {
      tabWidth: config.tabWidth,
      clearAutoIndent: config.clearAutoIndent,
    });
  } else {
    log(`mode=type → typing mimic (delayMs=${config.typeDelayMs || 35})`);
    await typeText(job.text, config.typeDelayMs || 35, log, {
      tabWidth: config.tabWidth,
      clearAutoIndent: config.clearAutoIndent,
    });
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
  if (data.error) throw new Error(data.error);
  return data.job || null;
}

async function loop() {
  const config = loadConfig();
  log(`agent started → ${config.serverUrl} (poll every ${config.pollIntervalMs}ms)`);
  log(`platform=${process.platform} input=${process.platform === "win32" ? "SendKeys" : "nut-js"}`);

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
          } catch (err) {
            log("deliver error:", err.message || err);
            throw err;
          } finally {
            busy = false;
          }
        } else {
          consecutiveErrors = 0;
        }
      }
    } catch (err) {
      consecutiveErrors += 1;
      log("agent error:", err.message || err);
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
