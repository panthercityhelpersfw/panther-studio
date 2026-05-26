const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tauriDir = path.join(root, "src-tauri");
const privateKeyPath = path.join(root, ".tauri", "panther-updater.key");
const publicKeyPath = `${privateKeyPath}.pub`;
const generatedConfigPath = path.join(root, ".tauri", "updater-build.conf.json");

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function detectGithubRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const remote = execSync("git config --get remote.origin.url", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    const match = remote.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const pkg = readJson(path.join(root, "package.json"));
const tauriConfig = readJson(path.join(tauriDir, "tauri.conf.json"));
const version = argValue("--version", process.env.PANTHER_RELEASE_VERSION || pkg.version);
const local = hasArg("--local");
const channel = argValue("--channel", process.env.PANTHER_RELEASE_CHANNEL || "stable");
const port = argValue("--port", process.env.PANTHER_UPDATE_TEST_PORT || "17632");
const repo = argValue("--repo", process.env.PANTHER_GITHUB_REPOSITORY || detectGithubRepo() || "panthercityhelpersfw/panther-studio");
const endpoint =
  argValue("--endpoint") ||
  process.env.PANTHER_UPDATER_ENDPOINT ||
  (local
    ? `http://127.0.0.1:${port}/latest.json`
    : `https://github.com/${repo}/releases/latest/download/latest.json`);

if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH && !fs.existsSync(privateKeyPath)) {
  console.error(`Missing updater private key: ${privateKeyPath}`);
  console.error("Run: npm run updater:keys, or set TAURI_SIGNING_PRIVATE_KEY/TAURI_SIGNING_PRIVATE_KEY_PATH in CI.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(generatedConfigPath), { recursive: true });

const publicKey = fs.existsSync(publicKeyPath)
  ? fs.readFileSync(publicKeyPath, "utf8").trim()
  : tauriConfig.plugins?.updater?.pubkey;

if (!publicKey) {
  console.error(`Missing updater public key: ${publicKeyPath}`);
  console.error("Run: npm run updater:keys, or commit plugins.updater.pubkey in src-tauri/tauri.conf.json.");
  process.exit(1);
}

const releaseConfig = {
  version,
  bundle: {
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [endpoint],
      windows: {
        installMode: "passive",
      },
    },
  },
};

if (local) {
  releaseConfig.plugins.updater.dangerousInsecureTransportProtocol = true;
}

fs.writeFileSync(generatedConfigPath, `${JSON.stringify(releaseConfig, null, 2)}\n`);

const env = {
  ...process.env,
  PANTHER_ENABLE_UPDATER: "true",
  VITE_PANTHER_UPDATER_ENABLED: "true",
  VITE_PANTHER_RELEASE_CHANNEL: channel,
  VITE_PANTHER_UPDATER_ENDPOINT: endpoint,
  VITE_PANTHER_LOCAL_UPDATE_TEST_MODE: local ? "true" : "false",
  VITE_PANTHER_UPDATER_PLATFORM: "windows-x86_64",
};

if (!env.TAURI_SIGNING_PRIVATE_KEY && fs.existsSync(privateKeyPath)) {
  env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(privateKeyPath, "utf8").trim();
}
if (env.TAURI_SIGNING_PRIVATE_KEY && env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "";
}

console.log(`Panther updater build ${version} (${channel})`);
console.log(`Endpoint: ${endpoint}`);
console.log(`Config: ${generatedConfigPath}`);

const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const result = spawnSync(process.execPath, [tauriCli, "build", "--config", generatedConfigPath], {
  cwd: root,
  env,
  stdio: "inherit",
});

if (result.status !== 0) {
  if (result.error) console.error(result.error);
  console.error(`tauri build failed with status=${result.status} signal=${result.signal ?? "none"}`);
  process.exit(result.status || 1);
}

console.log("Updater artifacts are under src-tauri/target/release/bundle.");
console.log("Next: npm run release:manifest -- --version " + version);
