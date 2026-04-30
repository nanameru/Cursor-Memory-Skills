#!/usr/bin/env node
import { createRequire } from "node:module";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const DEFAULT_MODEL = process.env.CURSOR_SCOUT_MODEL || "composer-2";
const DEFAULT_MAX_FILES = 12;
const CACHE_DIR = process.env.CURSOR_SCOUT_CACHE_DIR
  || path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "cursor-context-scout");
const CONFIG_DIR = process.env.CURSOR_SCOUT_CONFIG_DIR
  || path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "cursor-context-scout");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function usage() {
  return `Cursor Context Scout

Usage:
  cursor-scout.mjs configure [--scope global|project|config] [--repo <path>] [--profile <file>] [--env-file <file>] [--force] [--stdin] [--api-key <key>]
  cursor-scout.mjs doctor [--repo <path>] [--install-sdk]
  cursor-scout.mjs warmup [--repo <path>] [--model <id>]
  cursor-scout.mjs scout --task <text> [--repo <path>] [--folder <path>] [--output <file>] [--model <id>] [--max-files <n>] [--timeout-ms <n>]

Environment:
  CURSOR_API_KEY          Preferred runtime source. Overrides project/global saved values.
  CURSOR_SCOUT_MODEL     Defaults to ${DEFAULT_MODEL}.
  CURSOR_SCOUT_CACHE_DIR Defaults to ${CACHE_DIR}.

Examples:
  node scripts/cursor-scout.mjs configure --scope global
  node scripts/cursor-scout.mjs configure --scope project --repo .
  node scripts/cursor-scout.mjs doctor
  node scripts/cursor-scout.mjs warmup --repo .
  node scripts/cursor-scout.mjs scout --repo . --task "Fix the Figma comment about the button hover state"
`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function resolveRepo(repo) {
  return path.resolve(repo || process.cwd());
}

function relPath(repoRoot, target) {
  if (!target) return undefined;
  const absolute = path.resolve(repoRoot, target);
  return path.relative(repoRoot, absolute) || ".";
}

function defaultShellProfile() {
  const shell = path.basename(process.env.SHELL || "");
  if (shell === "zsh") return path.join(homedir(), ".zshrc");
  if (shell === "bash") return process.platform === "darwin"
    ? path.join(homedir(), ".bash_profile")
    : path.join(homedir(), ".bashrc");
  return path.join(homedir(), ".profile");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function dotenvValue(value) {
  const raw = String(value);
  return /^[A-Za-z0-9_./:=+@-]+$/.test(raw) ? raw : JSON.stringify(raw);
}

function parseEnvValue(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function upsertEnvLine(content, key, value) {
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLine = `${key}=${dotenvValue(value)}`;
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.match(new RegExp(`^\\s*${key}\\s*=`))) {
      replaced = true;
      return nextLine;
    }
    return line;
  });
  if (!replaced) {
    if (nextLines.length > 0 && nextLines.at(-1) !== "") nextLines.push("");
    nextLines.push(nextLine);
  }
  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
}

function upsertShellProfileBlock(content, apiKey) {
  const block = [
    "# >>> cursor-context-scout",
    `export CURSOR_API_KEY=${shellQuote(apiKey)}`,
    "# <<< cursor-context-scout",
  ].join("\n");
  const blockRegex = /# >>> cursor-context-scout[\s\S]*?# <<< cursor-context-scout\n?/;
  if (blockRegex.test(content)) return content.replace(blockRegex, `${block}\n`);
  const prefix = content && !content.endsWith("\n") ? "\n" : "";
  return `${content || ""}${prefix}${block}\n`;
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function readProjectEnvApiKey(repoRoot, envFile = ".env.local") {
  const envPath = path.resolve(repoRoot, envFile);
  const content = await readTextIfExists(envPath);
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*CURSOR_API_KEY\s*=\s*(.+?)\s*$/);
    if (match) return { apiKey: parseEnvValue(match[1]), source: envPath };
  }
  return { apiKey: "", source: envPath };
}

async function readShellProfileApiKey(profilePath = defaultShellProfile()) {
  const content = await readTextIfExists(profilePath);
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?CURSOR_API_KEY\s*=\s*(.+?)\s*$/);
    if (match) return { apiKey: parseEnvValue(match[1]), source: profilePath };
  }
  return { apiKey: "", source: profilePath };
}

async function saveGlobalEnv(apiKey, profilePath = defaultShellProfile()) {
  const content = await readTextIfExists(profilePath);
  await mkdir(path.dirname(profilePath), { recursive: true });
  await writeFile(profilePath, upsertShellProfileBlock(content, apiKey), { mode: 0o600 });
  await chmod(profilePath, 0o600).catch(() => {});
  return profilePath;
}

async function saveProjectEnv(apiKey, repoRoot, envFile = ".env.local", updateGitignore = true) {
  const envPath = path.resolve(repoRoot, envFile);
  const content = await readTextIfExists(envPath);
  await writeFile(envPath, upsertEnvLine(content, "CURSOR_API_KEY", apiKey), { mode: 0o600 });
  await chmod(envPath, 0o600).catch(() => {});

  if (updateGitignore) {
    const rel = path.relative(repoRoot, envPath).replace(/\\/g, "/");
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      const gitignorePath = path.join(repoRoot, ".gitignore");
      const gitignore = await readTextIfExists(gitignorePath);
      const patterns = gitignore.split(/\r?\n/).map((line) => line.trim());
      const ignored = patterns.includes(rel)
        || patterns.includes(path.basename(rel))
        || (path.basename(rel) === ".env.local" && patterns.includes(".env*.local"));
      if (!ignored) {
        const prefix = gitignore && !gitignore.endsWith("\n") ? "\n" : "";
        const spacer = gitignore ? "\n" : "";
        await writeFile(gitignorePath, `${gitignore}${prefix}${spacer}# Cursor Context Scout local secrets\n${rel}\n`);
      }
    }
  }

  return envPath;
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Failed to read config at ${CONFIG_PATH}: ${error.message}`);
  }
}

async function writeConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await chmod(CONFIG_DIR, 0o700).catch(() => {});
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(CONFIG_PATH, 0o600).catch(() => {});
}

async function readStdin() {
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
}

async function promptHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Interactive terminal is required. Set CURSOR_API_KEY, pass --stdin, or run configure in a terminal.");
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    const cleanup = () => {
      stdout.write("\n");
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (byte >= 32) value += String.fromCharCode(byte);
      }
    };

    stdout.write(prompt);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

async function getCursorApiKeyInfo({ repoRoot } = {}) {
  if (process.env.CURSOR_API_KEY) {
    return { apiKey: process.env.CURSOR_API_KEY, source: "env:CURSOR_API_KEY" };
  }
  if (repoRoot) {
    const projectEnv = await readProjectEnvApiKey(repoRoot);
    if (projectEnv.apiKey) return projectEnv;
  }
  const config = await readConfig();
  if (config.cursorApiKey) {
    return { apiKey: config.cursorApiKey, source: `${CONFIG_PATH} (legacy)` };
  }
  const shellProfile = await readShellProfileApiKey();
  if (shellProfile.apiKey) return shellProfile;
  return { apiKey: "", source: "missing" };
}

async function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}\n${stderr || stdout}`));
    });
  });
}

async function ensureSdk({ install = true } = {}) {
  try {
    return await import("@cursor/sdk");
  } catch (error) {
    if (!install || process.env.CURSOR_SCOUT_NO_BOOTSTRAP === "1") {
      throw new Error(`@cursor/sdk is not available. Run with --install-sdk or allow bootstrap. Original error: ${error.message}`);
    }
  }

  const runtimeDir = path.join(CACHE_DIR, "sdk-runtime");
  await mkdir(runtimeDir, { recursive: true });
  const pkgPath = path.join(runtimeDir, "package.json");
  if (!existsSync(pkgPath)) {
    await writeFile(pkgPath, JSON.stringify({ private: true, type: "module", dependencies: {} }, null, 2));
  }

  const requireFromRuntime = createRequire(pkgPath);
  const importRuntimeSdk = async () => {
    const resolvedEntry = requireFromRuntime.resolve("@cursor/sdk");
    const sdkRoot = path.resolve(path.dirname(resolvedEntry), "..", "..");
    const esmEntry = path.join(sdkRoot, "dist", "esm", "index.js");
    const sdk = await import(pathToFileURL(esmEntry).href);
    if (!sdk.Agent) {
      throw new Error(`@cursor/sdk loaded from ${esmEntry}, but Agent export was not found.`);
    }
    return sdk;
  };

  try {
    return await importRuntimeSdk();
  } catch {
    process.stderr.write(`Installing @cursor/sdk into ${runtimeDir}...\n`);
    await run("npm", ["install", "@cursor/sdk@latest", "--silent", "--no-audit", "--no-fund"], { cwd: runtimeDir });
    return await importRuntimeSdk();
  }
}

function buildScoutPrompt({ repoRoot, folderScope, task, maxFiles, warmup }) {
  const scoped = folderScope && folderScope !== "." ? `\nFolder scope: ${folderScope}` : "";
  const actualTask = warmup
    ? "Warm up and inspect this repository enough to identify its broad architecture. Do not implement anything."
    : task;

  return `You are Cursor Context Scout, a read-only codebase triage agent.

Your job is to use Cursor's codebase tools, semantic search, grep, and minimal file reads to identify the smallest useful file set for another coding agent. Do not edit, create, delete, rename, install dependencies, commit, format, or run destructive commands. Do not produce patches. Do not modify the working tree.

Repository root: ${repoRoot}${scoped}
User task: ${actualTask}

Return ONLY valid JSON. No markdown, no code fence, no commentary.

JSON schema:
{
  "status": "ok" | "needs_more_info" | "index_warming" | "error",
  "summary": "one short paragraph",
  "repo_root": ${JSON.stringify(repoRoot)},
  "folder_scope": ${JSON.stringify(folderScope || null)},
  "recommended_files": [
    {
      "path": "relative/path/from/repo/root",
      "reason": "why this file should be read before editing",
      "confidence": 0.0,
      "read_order": 1,
      "symbols": ["optional symbol names"]
    }
  ],
  "supporting_files": [
    {
      "path": "relative/path/from/repo/root",
      "reason": "why this may be useful after primary files",
      "confidence": 0.0
    }
  ],
  "avoid_files": [
    {
      "path": "relative/path/from/repo/root or glob",
      "reason": "why another agent should avoid editing it"
    }
  ],
  "queries_used": ["semantic or grep queries you tried"],
  "implementation_notes": ["short notes for the coding agent"],
  "verification_suggestions": ["tests or checks likely relevant"],
  "risks": ["uncertainties or missing information"]
}

Rules:
- Recommend at most ${maxFiles} primary files.
- Prefer files that directly own behavior over generated output or build artifacts.
- Keep reasons concrete and tied to the user task.
- If indexing appears cold or semantic search is not ready, still return the best result possible and set status to "index_warming" if appropriate.
- Use relative paths only inside file arrays.`;
}

async function waitWithTimeout(promise, timeoutMs) {
  if (!timeoutMs) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function stripCodeFence(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : trimmed;
}

function extractJson(text) {
  const direct = stripCodeFence(text);
  try {
    return JSON.parse(direct);
  } catch {
    // Continue.
  }

  const start = direct.indexOf("{");
  const end = direct.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(direct.slice(start, end + 1));
  }
  throw new Error("Cursor response did not contain parseable JSON");
}

async function writeOutputs({ outputPath, rawText, parsed }) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
  const rawPath = outputPath.replace(/\.json$/i, ".raw.txt");
  await writeFile(rawPath, rawText);
  return { outputPath, rawPath };
}

async function runConfigure(args) {
  const scope = String(args.scope || "global");
  const repoRoot = resolveRepo(args.repo);
  const profilePath = args.profile ? path.resolve(String(args.profile)) : defaultShellProfile();
  const envFile = args["env-file"] ? String(args["env-file"]) : ".env.local";
  let existing;
  if (scope === "project") existing = await readProjectEnvApiKey(repoRoot, envFile);
  else if (scope === "global") existing = await readShellProfileApiKey(profilePath);
  else if (scope === "config") existing = await getCursorApiKeyInfo({ repoRoot });
  else throw new Error("--scope must be one of: global, project, config.");

  let apiKey = "";

  if (args["api-key"]) {
    apiKey = String(args["api-key"]).trim();
  } else if (args.stdin) {
    apiKey = await readStdin();
  } else if (process.env.CURSOR_API_KEY && (args.force || !existing.apiKey)) {
    apiKey = process.env.CURSOR_API_KEY.trim();
  } else if (existing.apiKey && !args.force) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      message: "Cursor API key is already configured for this scope. Use --force to replace it.",
      scope,
      source: existing.source,
    }, null, 2)}\n`);
    return;
  } else {
    process.stdout.write("Configure Cursor Context Scout\n");
    process.stdout.write(`Scope: ${scope}\n`);
    if (scope === "global") process.stdout.write(`Target: ${profilePath}\n`);
    if (scope === "project") process.stdout.write(`Target: ${path.resolve(repoRoot, envFile)}\n`);
    process.stdout.write("Paste your Cursor API key. Input is hidden.\n");
    apiKey = await promptHidden("CURSOR_API_KEY: ");
  }

  if (!apiKey) throw new Error("Cursor API key was empty.");
  if (!apiKey.startsWith("crsr_")) {
    process.stderr.write("Warning: Cursor API keys usually start with \"crsr_\". Saving the value anyway.\n");
  }

  let savedPath;
  let message;
  if (scope === "global") {
    savedPath = await saveGlobalEnv(apiKey, profilePath);
    message = "Cursor API key saved as a global shell environment variable. Restart your terminal or source the profile file.";
  } else if (scope === "project") {
    savedPath = await saveProjectEnv(apiKey, repoRoot, envFile, !args["no-gitignore"]);
    message = "Cursor API key saved to the project environment file.";
  } else {
    const config = await readConfig();
    await writeConfig({
      ...config,
      cursorApiKey: apiKey,
      updatedAt: new Date().toISOString(),
    });
    savedPath = CONFIG_PATH;
    message = "Cursor API key saved to legacy local config.";
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    scope,
    message,
    path: savedPath,
  }, null, 2)}\n`);
}

async function runDoctor(args) {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const repoRoot = resolveRepo(args.repo);
  const apiKeyInfo = await getCursorApiKeyInfo({ repoRoot });
  const checks = {
    node: process.version,
    node_ok: nodeMajor >= 22,
    cursor_api_key_set: Boolean(apiKeyInfo.apiKey),
    cursor_api_key_source: apiKeyInfo.source,
    cache_dir: CACHE_DIR,
    project_env_path: path.join(repoRoot, ".env.local"),
    shell_profile_path: defaultShellProfile(),
    legacy_config_path: CONFIG_PATH,
    sdk_available: false,
    sdk_bootstrap_checked: Boolean(args["install-sdk"]),
  };

  if (args["install-sdk"]) {
    await ensureSdk({ install: true });
    checks.sdk_available = true;
  } else {
    try {
      await ensureSdk({ install: false });
      checks.sdk_available = true;
    } catch {
      checks.sdk_available = false;
    }
  }

  process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
  if (!checks.node_ok) process.stderr.write("Node.js 22+ is recommended for Cursor SDK examples.\n");
  if (!checks.cursor_api_key_set) process.stderr.write("Cursor API key is not configured; run `cursor-scout.mjs configure --scope global` or `cursor-scout.mjs configure --scope project --repo .` before scout/warmup.\n");
}

async function runScout(command, args) {
  const repoRoot = resolveRepo(args.repo);
  const apiKeyInfo = await getCursorApiKeyInfo({ repoRoot });
  if (!apiKeyInfo.apiKey) throw new Error("Cursor API key is required. Run `cursor-scout.mjs configure --scope global`, `cursor-scout.mjs configure --scope project --repo .`, or set CURSOR_API_KEY.");

  const folderScope = relPath(repoRoot, args.folder);
  const task = args.task || args._.join(" ").trim();
  const warmup = command === "warmup";
  if (!warmup && !task) throw new Error("--task is required for scout.");

  const outputPath = path.resolve(
    repoRoot,
    args.output || ".cursor-scout/last-scout.json",
  );
  const model = args.model || DEFAULT_MODEL;
  const maxFiles = Number(args["max-files"] || DEFAULT_MAX_FILES);
  const timeoutMs = args["timeout-ms"] ? Number(args["timeout-ms"]) : 0;

  const { Agent } = await ensureSdk({ install: true });
  if (!Agent) throw new Error("@cursor/sdk did not expose Agent.");
  const prompt = buildScoutPrompt({ repoRoot, folderScope, task, maxFiles, warmup });

  const agent = await Agent.create({
    apiKey: apiKeyInfo.apiKey,
    model: { id: model },
    local: {
      cwd: repoRoot,
      sandboxOptions: { enabled: true },
    },
    name: warmup ? "cursor-context-scout-warmup" : "cursor-context-scout",
  });

  try {
    const runHandle = await agent.send(prompt);
    const result = await waitWithTimeout(runHandle.wait(), timeoutMs);
    const rawText = result.result || "";
    let parsed;
    try {
      parsed = extractJson(rawText);
    } catch (error) {
      parsed = {
        status: "error",
        summary: "Cursor scout returned non-JSON output. Inspect the raw file.",
        repo_root: repoRoot,
        folder_scope: folderScope || null,
        recommended_files: [],
        supporting_files: [],
        avoid_files: [],
        queries_used: [],
        implementation_notes: [],
        verification_suggestions: [],
        risks: [error.message],
      };
    }

    if (!parsed.repo_root) parsed.repo_root = repoRoot;
    if (parsed.folder_scope === undefined) parsed.folder_scope = folderScope || null;

    const written = await writeOutputs({ outputPath, rawText, parsed });
    process.stdout.write(`${JSON.stringify({ ok: true, ...written, status: parsed.status }, null, 2)}\n`);
  } finally {
    if (agent?.[Symbol.asyncDispose]) {
      await agent[Symbol.asyncDispose]();
    } else if (agent?.close) {
      agent.close();
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    process.stdout.write(usage());
    return;
  }

  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (command === "configure") {
    await runConfigure(args);
    return;
  }
  if (command === "doctor") {
    await runDoctor(args);
    return;
  }
  if (command === "warmup" || command === "scout") {
    await runScout(command, args);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message || error}\n`);
  process.exit(1);
});
