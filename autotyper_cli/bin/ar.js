#!/usr/bin/env node
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  ensureAppDir,
  loadConfig,
  saveConfig,
  PID_PATH,
  LOG_PATH,
  CONFIG_PATH,
  APP_DIR,
} = require("../src/paths");

const DAEMON_ENTRY = path.join(__dirname, "..", "src", "daemon.js");

function isRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  try {
    if (!fs.existsSync(PID_PATH)) return null;
    const pid = Number(fs.readFileSync(PID_PATH, "utf8").trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writePid(pid) {
  ensureAppDir();
  fs.writeFileSync(PID_PATH, String(pid));
}

function clearPid() {
  try {
    if (fs.existsSync(PID_PATH)) fs.unlinkSync(PID_PATH);
  } catch {
    /* ignore */
  }
}

function killPid(pid) {
  if (!isRunning(pid)) return false;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}

function startDetached() {
  ensureAppDir();
  const existing = readPid();
  if (existing && isRunning(existing)) {
    console.log(`ar agent already running (pid ${existing})`);
    return existing;
  }

  const out = fs.openSync(LOG_PATH, "a");
  const child = spawn(process.execPath, [DAEMON_ENTRY], {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
    cwd: path.join(__dirname, ".."),
    env: { ...process.env },
  });
  child.unref();
  writePid(child.pid);
  console.log(`ar agent started in background (pid ${child.pid})`);
  console.log(`  server: ${loadConfig().serverUrl}`);
  console.log(`  log:    ${LOG_PATH}`);
  console.log("");
  console.log("Focus the window where text should appear, then send from the web UI.");
  return child.pid;
}

function stopAgent() {
  const pid = readPid();
  if (!pid) {
    console.log("ar agent is not running");
    clearPid();
    return;
  }
  if (!isRunning(pid)) {
    console.log("ar agent is not running");
    clearPid();
    return;
  }
  killPid(pid);
  clearPid();
  console.log(`ar agent stopped (pid ${pid})`);
}

function status() {
  const config = loadConfig();
  const pid = readPid();
  const on = pid && isRunning(pid);
  console.log("ar status");
  console.log(`  agent:     ${on ? `running (pid ${pid})` : "stopped"}`);
  console.log(`  serverUrl: ${config.serverUrl}`);
  console.log(`  secret:    ${config.secret ? "(set)" : "(missing)"}`);
  console.log(`  poll:      ${config.pollIntervalMs}ms`);
  console.log(`  config:    ${CONFIG_PATH}`);
  console.log(`  log:       ${LOG_PATH}`);
  console.log(`  data dir:  ${APP_DIR}`);
}

function printHelp() {
  console.log(`
ar — AutoTyper local agent

Usage:
  ar start                 Start background poller (types/pastes jobs)
  ar stop                  Stop the background agent
  ar status                Show running state
  ar config                Show config
  ar config set <k> <v>    Update a config value
  ar logs                  Tail recent log lines
  ar test [paste|type]     3s countdown then paste/type a sample (debug)
  ar help                  Show this help

Config keys:
  serverUrl       Next.js server base URL (e.g. https://your-app.vercel.app)
  secret          Shared secret (must match AR_SECRET on the server)
  pollIntervalMs  How often to poll (default 1500)
  focusDelayMs    Delay before typing/pasting so you can focus a window
  typeDelayMs     Base delay between characters in typing mimic mode
  pasteDelayMs    Delay in fast-type mode (default 0; still keyboard, never clipboard)
  tabWidth        Every tab becomes this many spaces (default 4). Tab key is NEVER sent.

Both modes use keyboard mimic only (Win32 SendInput). No clipboard / Ctrl+V / Tab key.

Typical flow:
  1. Deploy / run the Next.js app (set AR_SECRET)
  2. ar config set serverUrl https://your-host
  3. ar config set secret <same-secret>
  4. ar start
  5. Open the web UI, paste text, choose mode, Send
`.trim());
}

function configCmd(args) {
  if (args[0] === "set" && args[1] && args[2] !== undefined) {
    const key = args[1];
    let value = args.slice(2).join(" ");
    if (["pollIntervalMs", "focusDelayMs", "typeDelayMs", "pasteDelayMs", "tabWidth"].includes(key)) {
      value = Number(value);
      if (!Number.isFinite(value) || value < 0) {
        console.error(`Invalid number for ${key}`);
        process.exit(1);
      }
    }
    const next = saveConfig({ [key]: value });
    console.log(`Updated ${key}. Current config:`);
    console.log(JSON.stringify(sanitize(next), null, 2));
    return;
  }
  const config = loadConfig();
  console.log(`Config path: ${CONFIG_PATH}`);
  console.log(JSON.stringify(sanitize(config), null, 2));
}

function sanitize(config) {
  return {
    ...config,
    secret: config.secret ? "***" : "",
  };
}

function logs() {
  if (!fs.existsSync(LOG_PATH)) {
    console.log("No log file yet. Start the agent with: ar start");
    return;
  }
  const content = fs.readFileSync(LOG_PATH, "utf8");
  const lines = content.trim().split(/\r?\n/);
  console.log(lines.slice(-40).join("\n"));
}

async function testInput(modeArg) {
  const mode = modeArg === "type" ? "type" : "paste";
  const { pasteText, typeText, sleep } = require("../src/input");
  console.log(`Focus Notepad (or any input) now…`);
  console.log(`Testing ${mode === "paste" ? "fast keyboard" : "typing mimic"} in 3 seconds…`);
  console.log(`(keyboard only — no clipboard)`);
  await sleep(3000);
  const sample =
    mode === "type"
      ? "AR type test OK\nsecond line\twith tab"
      : "AR fast-type test OK — keyboard only, no paste.";
  try {
    if (mode === "paste") await pasteText(sample, console.log);
    else await typeText(sample, 40, console.log);
    console.log("Done. You should see the test text in the focused window.");
  } catch (err) {
    console.error("Test failed:", err.message || err);
    process.exit(1);
  }
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "start":
      startDetached();
      break;
    case "stop":
      stopAgent();
      break;
    case "status":
      status();
      break;
    case "config":
      configCmd(rest);
      break;
    case "logs":
      logs();
      break;
    case "test":
      testInput(rest[0]).catch((err) => {
        console.error(err.message || err);
        process.exit(1);
      });
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main();
