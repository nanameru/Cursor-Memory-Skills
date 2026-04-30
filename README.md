# Cursor Memory Skills

`Cursor-Memory-Skills` is an Agent Skills package for Claude Code and Codex. The first bundled skill, `cursor-context-scout`, asks Cursor SDK to inspect a repository before the coding agent edits files, then returns a compact JSON list of files worth reading.

Team-wide user install:

```bash
npx skills add nanameru/Cursor-Memory-Skills -g -a claude-code -a codex --skill cursor-context-scout -y --copy
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure
```

Or use the helper script for an install + Cursor API key prompt flow:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nanameru/Cursor-Memory-Skills/main/scripts/install-global.sh)
```

Install into only the current project:

```bash
npx skills add nanameru/Cursor-Memory-Skills -a claude-code -a codex --skill cursor-context-scout -y --copy
```

Set a Cursor API key before first use. The recommended setup stores it locally in `~/.config/cursor-context-scout/config.json` with file mode `0600`:

```bash
node .agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure
```

You can still use `CURSOR_API_KEY` as an environment variable; it overrides the saved value.

The bundled script bootstraps `@cursor/sdk` into a user cache directory on first scout run. Check setup with:

```bash
node .agents/skills/cursor-context-scout/scripts/cursor-scout.mjs doctor --install-sdk
```

Warm a repository before the first real task:

```bash
node .agents/skills/cursor-context-scout/scripts/cursor-scout.mjs warmup --repo /path/to/repo
```

Direct scout:

```bash
node .agents/skills/cursor-context-scout/scripts/cursor-scout.mjs scout \
  --repo /path/to/repo \
  --task "Implement the Figma comment about button hover color"
```

When running from this repository checkout before installing the skill, use `node skills/cursor-context-scout/scripts/cursor-scout.mjs ...` instead.

For a team rollout, send teammates the command in `TEAM_SETUP.md`. Each teammate needs Node.js, `npx`, and their own Cursor API key or a team-managed key.

The scout result is written to `.cursor-scout/last-scout.json` in the target repo. Treat `.cursor-scout/` as agent scratch space; add it to the target repo's `.gitignore` if you do not want those files committed.

Notes:

- This uses Cursor SDK as a read-only triage step before Claude Code or Codex starts editing.
- Cursor has not documented a direct public API for "give me the embedding index"; this skill asks Cursor Agent to use its codebase tools and return the relevant files.
- The exact moment Cursor's index is prepared is SDK/runtime dependent, so `warmup` is the practical first-run hook.
