# Team Setup

Use this guide to roll out `cursor-context-scout` to a team. Each teammate installs the skill once on their own machine.

## One Command

```bash
npx skills add nanameru/Cursor-Memory-Skills -g -a claude-code -a codex --skill cursor-context-scout -y --copy
```

Alternative helper script:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nanameru/Cursor-Memory-Skills/main/scripts/install-global.sh)
```

## Requirements

- Node.js and `npx`
- Claude Code, Codex, or another Agent Skills-compatible agent
- `CURSOR_API_KEY` set in the user's shell environment

## API Key

Each user should set their own Cursor API key, or use a team-managed key from your secrets manager:

```bash
export CURSOR_API_KEY="crsr_..."
```

For zsh users:

```bash
echo 'export CURSOR_API_KEY="crsr_..."' >> ~/.zshrc
source ~/.zshrc
```

Do not commit API keys to a repository.

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
