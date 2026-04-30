# Team Setup

Use this guide to roll out `cursor-context-scout` to a team. Each teammate installs the skill once on their own machine.

## Install

```bash
npx skills add nanameru/Cursor-Memory-Skills -g -a claude-code -a codex --skill cursor-context-scout -y --copy
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure
```

Alternative helper script with an API key prompt:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nanameru/Cursor-Memory-Skills/main/scripts/install-global.sh)
```

## Requirements

- Node.js and `npx`
- Claude Code, Codex, or another Agent Skills-compatible agent
- A Cursor API key

## API Key

Each user should set their own Cursor API key, or use a team-managed key from your secrets manager. The configure command stores the key locally in `~/.config/cursor-context-scout/config.json` with file mode `0600`:

```bash
node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure
```

Non-interactive setup from an existing environment variable:

```bash
printf '%s' "$CURSOR_API_KEY" | node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --stdin
```

`CURSOR_API_KEY` can still be used directly as an environment variable; it overrides the saved value. Do not commit API keys to a repository.

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
