# Team Setup

Use this guide to roll out `cursor-context-scout` to a team. Each teammate installs the skill once on their own machine.

## Install

Claude Code global install:

```bash
npx skills add nanameru/Cursor-Memory-Skills -g -a claude-code --skill cursor-context-scout -y --copy
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global
```

Claude Code + Codex helper script with a global environment variable prompt and a Claude Code path check:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nanameru/Cursor-Memory-Skills/main/scripts/install-global.sh)
```

For Claude Code, verify the file exists at `~/.claude/skills/cursor-context-scout/SKILL.md`. Claude Code does not load a skill from `~/.agents/skills` unless another installer also copies it into `~/.claude/skills`.

## Requirements

- Node.js and `npx`
- Claude Code, Codex, or another Agent Skills-compatible agent
- A Cursor API key

## API Key

Each user should set their own Cursor User API Key, or use a team-managed key from your secrets manager. This is not the OpenAI/Anthropic/Gemini key entered in Cursor model settings, and it is not a Cursor Admin API key.

How to get the key:

1. Open the Cursor dashboard: <https://cursor.com/dashboard>
2. Go to `Integrations` > `User API Keys`.
3. Create or generate a new key.
4. Name it clearly, for example `cursor-context-scout`.
5. Copy it and paste it into the `configure` prompt.

Cursor's official CLI authentication docs describe the same `Integrations` > `User API Keys` path: <https://cursor.com/docs/cli/reference/authentication>.

Global setup writes an `export CURSOR_API_KEY=...` block to the user's shell profile such as `~/.zshrc`:

```bash
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global
```

Project setup writes `CURSOR_API_KEY=...` to `.env.local` and adds `.env.local` to `.gitignore`:

```bash
node .claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope project --repo .
```

Non-interactive global setup from an existing environment variable:

```bash
printf '%s' "$CURSOR_API_KEY" | node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global --stdin
```

`CURSOR_API_KEY` in the current process has highest priority. Do not commit API keys to a repository.

## Verify

```bash
npx skills add nanameru/Cursor-Memory-Skills --list
test -f ~/.claude/skills/cursor-context-scout/SKILL.md
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs doctor --install-sdk
```

If Claude Code was already running and `~/.claude/skills` was created during install, restart Claude Code once. Then ask Claude Code `What Skills are available?` or run `/cursor-context-scout` to confirm discovery.

## First Use In A Repository

```bash
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs warmup --repo .
node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs scout --repo . --task "Describe the change you want"
```

After this, Claude Code or Codex can use the installed skill before editing.
