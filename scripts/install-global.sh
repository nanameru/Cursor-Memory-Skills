#!/usr/bin/env bash
set -euo pipefail

REPO="nanameru/Cursor-Memory-Skills"
SKILL="cursor-context-scout"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js first, then rerun this script." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Install npm/Node.js first, then rerun this script." >&2
  exit 1
fi

echo "Installing ${SKILL} globally from ${REPO}..."
npx skills add "${REPO}" -g

SCOUT_SCRIPT=""
for candidate in \
  "${HOME}/.agents/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.config/agents/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.cursor/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.codex/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.claude/skills/${SKILL}/scripts/cursor-scout.mjs"; do
  if [ -f "${candidate}" ]; then
    SCOUT_SCRIPT="${candidate}"
    break
  fi
done

if [ -n "${SCOUT_SCRIPT}" ]; then
  if [ -n "${CURSOR_API_KEY:-}" ]; then
    echo "Saving CURSOR_API_KEY from the current environment into your global shell profile..."
    printf '%s' "${CURSOR_API_KEY}" | node "${SCOUT_SCRIPT}" configure --scope global --stdin || true
  else
    echo "Cursor API key setup:"
    echo "Get a Cursor User API Key from https://cursor.com/dashboard > Integrations > User API Keys."
    echo "Do not use a model-provider key or Cursor Admin API key here."
    node "${SCOUT_SCRIPT}" configure --scope global || true
  fi

  echo "Running setup check..."
  node "${SCOUT_SCRIPT}" doctor --install-sdk || true
else
  echo "Install finished, but the scout script path was not found in the expected global locations." >&2
fi

cat <<'EOF'

Next steps:
  1. If you skipped API key setup, run:
       node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global

  2. Restart your terminal or source your shell profile, then run inside any repository:
       node ~/.agents/skills/cursor-context-scout/scripts/cursor-scout.mjs warmup --repo .

EOF
