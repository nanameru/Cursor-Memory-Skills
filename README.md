# Cursor Memory Skills

`Cursor-Memory-Skills` is an Agent Skills package for Claude Code and Codex. The first bundled skill, `cursor-context-scout`, asks Cursor SDK to inspect a repository before the coding agent edits files, then returns a compact JSON list of files worth reading.

Recommended global install for Claude Code:

```bash
npx skills add nanameru/Cursor-Memory-Skills -g -a claude-code --skill cursor-context-scout -y --copy
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global
```

Claude Code only discovers skills from `~/.claude/skills/<skill-name>/SKILL.md` for personal installs and `.claude/skills/<skill-name>/SKILL.md` for project installs. If `npx skills add` installs the skill somewhere else, reinstall with the command above or use the helper script below.

Repair an install that does not show up in Claude Code:

```bash
npx skills add nanameru/Cursor-Memory-Skills -g -a claude-code --skill cursor-context-scout -y --copy
test -f ~/.claude/skills/cursor-context-scout/SKILL.md
```

Install for both Claude Code and Codex with an API key prompt and a Claude Code path check:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nanameru/Cursor-Memory-Skills/main/scripts/install-global.sh)
```

Install into only the current Claude Code project:

```bash
npx skills add nanameru/Cursor-Memory-Skills -a claude-code --skill cursor-context-scout -y --copy
node .claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope project --repo .
```

Set a Cursor API key before first use. Global setup writes an `export CURSOR_API_KEY=...` block to your shell profile such as `~/.zshrc`:

```bash
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global
```

Project setup writes `CURSOR_API_KEY=...` to `.env.local` and adds `.env.local` to `.gitignore`:

```bash
node .claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope project --repo .
```

`CURSOR_API_KEY` in the current process still has highest priority.

## Get a Cursor API Key

This skill needs a Cursor User API Key for Cursor SDK / Agent authentication. This is different from bringing your own OpenAI, Anthropic, or Gemini provider key in Cursor model settings, and it is not a Cursor Admin API key.

1. Open the Cursor dashboard: <https://cursor.com/dashboard>
2. Go to `Integrations` > `User API Keys`.
3. Create or generate a new API key.
4. Give it a clear name, such as `cursor-context-scout`.
5. Copy the key immediately and paste it into the `configure` prompt.

Cursor documents this flow in its [CLI authentication docs](https://cursor.com/docs/cli/reference/authentication). If you are looking at team settings, avoid `Cursor Admin API Keys`; those are for the [Cursor Admin API](https://cursor.com/docs/account/teams/admin-api), not this scout skill.

The bundled script bootstraps `@cursor/sdk` into a user cache directory on first scout run. Check setup with:

```bash
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs doctor --install-sdk
```

Warm a repository before the first real task:

```bash
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs warmup --repo /path/to/repo
```

Direct scout:

```bash
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs scout \
  --repo /path/to/repo \
  --task "Implement the Figma comment about button hover color"
```

If Claude Code was already running and the top-level `~/.claude/skills` directory did not exist when it started, restart Claude Code once. After installing, ask Claude Code `What Skills are available?` or invoke `/cursor-context-scout` to confirm it is visible.

When running from this repository checkout before installing the skill, use `node skills/cursor-context-scout/scripts/cursor-scout.mjs ...` instead.

For a team rollout, send teammates the command in `TEAM_SETUP.md`. Each teammate needs Node.js, `npx`, and their own Cursor API key or a team-managed key.

The scout result is written to `.cursor-scout/last-scout.json` in the target repo. Treat `.cursor-scout/` as agent scratch space; add it to the target repo's `.gitignore` if you do not want those files committed.

Notes:

- This uses Cursor SDK as a read-only triage step before Claude Code or Codex starts editing.
- Cursor has not documented a direct public API for "give me the embedding index"; this skill asks Cursor Agent to use its codebase tools and return the relevant files.
- The exact moment Cursor's index is prepared is SDK/runtime dependent, so `warmup` is the practical first-run hook.
