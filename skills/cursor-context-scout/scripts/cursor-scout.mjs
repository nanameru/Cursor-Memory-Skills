#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const DEFAULT_MODEL = process.env.CURSOR_SCOUT_MODEL || "composer-2";
const DEFAULT_MAX_FILES = 12;
const CACHE_DIR = process.env.CURSOR_SCOUT_CACHE_DIR
  || path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "cursor-context-scout");

function usage() {
  return `Cursor Context Scout

Usage:
  cursor-scout.mjs doctor [--install-sdk]
  cursor-scout.mjs warmup [--repo <path>] [--model <id>]
  cursor-scout.mjs scout --task <text> [--repo <path>] [--folder <path>] [--output <file>] [--model <id>] [--max-files <n>] [--timeout-ms <n>]

Environment:
  CURSOR_API_KEY          Required for warmup/scout.
  CURSOR_SCOUT_MODEL     Defaults to ${DEFAULT_MODEL}.
  CURSOR_SCOUT_CACHE_DIR Defaults to ${CACHE_DIR}.

Examples:
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

async function runDoctor(args) {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks = {
    node: process.version,
    node_ok: nodeMajor >= 22,
    cursor_api_key_set: Boolean(process.env.CURSOR_API_KEY),
    cache_dir: CACHE_DIR,
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
  if (!checks.cursor_api_key_set) process.stderr.write("CURSOR_API_KEY is not set; scout/warmup will fail until it is set.\n");
}

async function runScout(command, args) {
  if (!process.env.CURSOR_API_KEY) {
    throw new Error("CURSOR_API_KEY is required for Cursor SDK runs.");
  }

  const repoRoot = resolveRepo(args.repo);
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
    apiKey: process.env.CURSOR_API_KEY,
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
