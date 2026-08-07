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

function normalizeTabOptions(options = {}) {
  const tabMode = ["char", "spaces", "key"].includes(options.tabMode)
    ? options.tabMode
    : "char";
  const tabWidth = Math.max(1, Math.min(16, Number(options.tabWidth) || 4));
  return { tabMode, tabWidth };
}

/**
 * Windows: pure keyboard mimic via SendInput (no clipboard / Ctrl+V).
 * Works against editors that block paste.
 */
function typeWindowsSendInput(text, delayMs, options = {}) {
  const delay = Math.max(0, Number(delayMs) || 0);
  const { tabMode, tabWidth } = normalizeTabOptions(options);
  const file = writeTempText(text);

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        WIN_TYPE_SCRIPT,
        "-TextFile",
        file,
        "-DelayMs",
        String(delay),
        "-TabMode",
        tabMode,
        "-TabWidth",
        String(tabWidth),
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    const timeoutMs = Math.min(
      30 * 60_000,
      30_000 + Math.max(1, text.length) * (delay + 8) * 2,
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

/** Non-Windows: nut-js character typing only (never clipboard). */
async function typeWithNut(text, delayMs, options = {}) {
  const { keyboard, Key } = require("@nut-tree-fork/nut-js");
  keyboard.config.autoDelayMs = 0;
  const delay = Math.max(0, Number(delayMs) || 0);
  const { tabMode, tabWidth } = normalizeTabOptions(options);

  async function insertTab() {
    if (tabMode === "key") {
      await keyboard.pressKey(Key.Tab);
      await keyboard.releaseKey(Key.Tab);
    } else if (tabMode === "spaces") {
      await keyboard.type(" ".repeat(tabWidth));
    } else {
      // Literal tab via unicode typing when supported; else spaces
      try {
        await keyboard.type("\t");
      } catch {
        await keyboard.type(" ".repeat(tabWidth));
      }
    }
  }

  for (const char of text) {
    if (char === "\r") continue;
    if (char === "\n") {
      await keyboard.pressKey(Key.Enter);
      await keyboard.releaseKey(Key.Enter);
    } else if (char === "\t") {
      await insertTab();
    } else {
      await keyboard.type(char);
    }
    if (delay > 0) {
      const jitter = Math.floor(Math.random() * Math.max(1, delay));
      await sleep(delay + jitter);
    }
  }
}

/**
 * Both modes are keyboard mimic — never clipboard.
 * - paste / fast: delay ~0 (rapid keystrokes)
 * - type / mimic: human-like delay between keys
 */
async function deliverKeyboard(text, delayMs, log = () => {}, options = {}) {
  const { tabMode, tabWidth } = normalizeTabOptions(options);
  const delay = Math.max(0, Number(delayMs) || 0);

  if (process.platform === "win32") {
    log(
      `keyboard SendInput chars=${text.length} delayMs=${delay} tabMode=${tabMode}`,
    );
    await typeWindowsSendInput(text, delay, { tabMode, tabWidth });
    return;
  }

  log(`keyboard nut-js chars=${text.length} delayMs=${delay} tabMode=${tabMode}`);
  await typeWithNut(text, delay, { tabMode, tabWidth });
}

/** @deprecated name kept for callers — now fast keyboard, not clipboard paste */
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
  sleep,
};
