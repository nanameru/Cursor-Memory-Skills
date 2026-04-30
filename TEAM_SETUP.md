# Team Setup

Use this guide to roll out `cursor-context-scout` to a team. Each teammate installs the skill once on their own machine.

## Install

```bash
npx skills add nanameru/Cursor-Memory-Skills -g
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global
```

Alternative helper script with a global environment variable prompt:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nanameru/Cursor-Memory-Skills/main/scripts/install-global.sh)
```

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
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global
```

Project setup writes `CURSOR_API_KEY=...` to `.env.local` and adds `.env.local` to `.gitignore`:

```bash
node .agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope project --repo .
```

Non-interactive global setup from an existing environment variable:

```bash
printf '%s' "$CURSOR_API_KEY" | node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global --stdin
```

`CURSOR_API_KEY` in the current process has highest priority. Do not commit API keys to a repository.

## Verify

```bash
npx skills add nanameru/Cursor-Memory-Skills --list
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs doctor --install-sdk
```

## First Use In A Repository

```bash
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs warmup --repo .
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs scout --repo . --task "Describe the change you want"
```

After this, Claude Code or Codex can use the installed skill before editing.
