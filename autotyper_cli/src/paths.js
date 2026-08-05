const os = require("os");
const path = require("path");
const fs = require("fs");

const APP_DIR = path.join(os.homedir(), ".ar");
const CONFIG_PATH = path.join(APP_DIR, "config.json");
const PID_PATH = path.join(APP_DIR, "agent.pid");
const LOG_PATH = path.join(APP_DIR, "agent.log");

const DEFAULT_CONFIG = {
  serverUrl: "http://localhost:3000",
  secret: "ar-dev-secret",
  pollIntervalMs: 1500,
  focusDelayMs: 800,
  typeDelayMs: 35,
};

function ensureAppDir() {
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureAppDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(partial) {
  ensureAppDir();
  const next = { ...loadConfig(), ...partial };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  APP_DIR,
  CONFIG_PATH,
  PID_PATH,
  LOG_PATH,
  DEFAULT_CONFIG,
  ensureAppDir,
  loadConfig,
  saveConfig,
};
