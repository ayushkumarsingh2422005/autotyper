const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN_TYPE_SCRIPT = path.join(__dirname, "win-type.ps1");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeTempText(text) {
  const file = path.join(
    os.tmpdir(),
    `ar-input-${process.pid}-${Date.now()}.txt`,
  );
  fs.writeFileSync(file, text, "utf8");
  return file;
}

/** Always expand tabs → spaces. Never emit Tab keystrokes. */
function expandTabs(text, tabWidth = 4) {
  const width = Math.max(1, Math.min(16, Number(tabWidth) || 4));
  const spaces = " ".repeat(width);
  return String(text).replace(/\t/g, spaces);
}

function normalizeOptions(options = {}) {
  const tabWidth = Math.max(1, Math.min(16, Number(options.tabWidth) || 4));
  const clearAutoIndent = options.clearAutoIndent !== false;
  return { tabWidth, clearAutoIndent };
}

/**
 * Windows: pure keyboard mimic via SendInput (no clipboard / no Tab key).
 */
function typeWindowsSendInput(text, delayMs, options = {}) {
  const delay = Math.max(0, Number(delayMs) || 0);
  const { tabWidth, clearAutoIndent } = normalizeOptions(options);
  const normalized = expandTabs(text, tabWidth);
  const file = writeTempText(normalized);

  return new Promise((resolve, reject) => {
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      WIN_TYPE_SCRIPT,
      "-TextFile",
      file,
      "-DelayMs",
      String(delay),
      "-TabWidth",
      String(tabWidth),
    ];
    if (clearAutoIndent) args.push("-ClearAutoIndent");

    const child = spawn("powershell.exe", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    const timeoutMs = Math.min(
      30 * 60_000,
      30_000 + Math.max(1, normalized.length) * (delay + 12) * 3,
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Keyboard inject timed out"));
    }, timeoutMs);

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `win-type.ps1 exited ${code}`));
    });

    function cleanup() {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  });
}

/** Non-Windows: nut-js character typing only (never clipboard / never Tab). */
async function typeWithNut(text, delayMs, options = {}) {
  const { keyboard, Key } = require("@nut-tree-fork/nut-js");
  keyboard.config.autoDelayMs = 0;
  const delay = Math.max(0, Number(delayMs) || 0);
  const { tabWidth, clearAutoIndent } = normalizeOptions(options);
  const normalized = expandTabs(text, tabWidth);

  let lineLead = 0;
  let atLineStart = true;
  let lineBuf = "";

  async function tap(key) {
    await keyboard.pressKey(key);
    await keyboard.releaseKey(key);
  }

  async function pause() {
    if (delay > 0) {
      const jitter = Math.floor(Math.random() * Math.max(1, delay));
      await sleep(delay + jitter);
    }
  }

  for (const char of normalized) {
    if (char === "\r") continue;

    if (char === "\n") {
      await tap(Key.Enter);
      await pause();

      if (clearAutoIndent) {
        await sleep(25);
        let toClear = lineLead;
        const trimmed = lineBuf.trimEnd();
        if (
          trimmed.endsWith("{") ||
          trimmed.endsWith(":") ||
          trimmed.endsWith("(")
        ) {
          toClear += tabWidth;
        }
        for (let b = 0; b < toClear; b++) {
          await tap(Key.Backspace);
        }
      }

      lineLead = 0;
      atLineStart = true;
      lineBuf = "";
      continue;
    }

    await keyboard.type(char);
    lineBuf += char;

    if (atLineStart) {
      if (char === " ") lineLead += 1;
      else atLineStart = false;
    }

    await pause();
  }
}

/**
 * Both modes are keyboard mimic — never clipboard, never Tab key.
 * Tabs are always expanded to spaces before typing.
 */
async function deliverKeyboard(text, delayMs, log = () => {}, options = {}) {
  const { tabWidth, clearAutoIndent } = normalizeOptions(options);
  const delay = Math.max(0, Number(delayMs) || 0);
  const normalized = expandTabs(text, tabWidth);
  const tabCount = (String(text).match(/\t/g) || []).length;

  if (process.platform === "win32") {
    log(
      `keyboard SendInput chars=${normalized.length} delayMs=${delay} tabs→${tabWidth}spaces=${tabCount} clearAutoIndent=${clearAutoIndent}`,
    );
    await typeWindowsSendInput(normalized, delay, { tabWidth, clearAutoIndent });
    return;
  }

  log(
    `keyboard nut-js chars=${normalized.length} delayMs=${delay} tabs→${tabWidth}spaces=${tabCount} clearAutoIndent=${clearAutoIndent}`,
  );
  await typeWithNut(normalized, delay, { tabWidth, clearAutoIndent });
}

async function pasteText(text, log = () => {}, options = {}) {
  await deliverKeyboard(text, 0, log, options);
}

async function typeText(text, delayMs, log = () => {}, options = {}) {
  await deliverKeyboard(text, delayMs, log, options);
}

module.exports = {
  pasteText,
  typeText,
  deliverKeyboard,
  expandTabs,
  sleep,
};
