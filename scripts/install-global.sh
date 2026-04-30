#!/usr/bin/env bash
set -euo pipefail

REPO="nanameru/Cursor-Memory-Skills"
SKILL="cursor-context-scout"
CLAUDE_SKILL_DIR="${HOME}/.claude/skills/${SKILL}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js first, then rerun this script." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Install npm/Node.js first, then rerun this script." >&2
  exit 1
fi

copy_skill_dir() {
  local source_dir="$1"
  local target_dir="$2"
  local tmp_dir="${target_dir}.tmp.$$"

  if [ ! -f "${source_dir}/SKILL.md" ]; then
    return 1
  fi

  rm -rf "${tmp_dir}"
  mkdir -p "${tmp_dir}"
  cp -R "${source_dir}/." "${tmp_dir}/"
  rm -rf "${target_dir}"
  mkdir -p "$(dirname "${target_dir}")"
  mv "${tmp_dir}" "${target_dir}"
}

find_installed_skill_dir() {
  for candidate in \
    "${HOME}/.claude/skills/${SKILL}" \
    "${HOME}/.agents/skills/${SKILL}" \
    "${HOME}/.config/agents/skills/${SKILL}" \
    "${HOME}/.cursor/skills/${SKILL}" \
    "${HOME}/.codex/skills/${SKILL}"; do
    if [ -f "${candidate}/SKILL.md" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

ensure_claude_code_install() {
  local source_dir="$1"
  local claude_parent="${HOME}/.claude/skills"
  local claude_parent_existed=1

  if [ ! -d "${claude_parent}" ]; then
    claude_parent_existed=0
  fi

  mkdir -p "${claude_parent}"

  if [ ! -f "${CLAUDE_SKILL_DIR}/SKILL.md" ] && [ -n "${source_dir}" ]; then
    echo "Claude Code native skill path was not created by skills CLI; copying fallback..."
    copy_skill_dir "${source_dir}" "${CLAUDE_SKILL_DIR}" || true
  fi

  if [ -f "${CLAUDE_SKILL_DIR}/SKILL.md" ]; then
    echo "Claude Code skill verified at ${CLAUDE_SKILL_DIR}"
  else
    echo "Claude Code skill was not found at ${CLAUDE_SKILL_DIR}" >&2
    echo "Try: npx skills add ${REPO} -g -a claude-code --skill ${SKILL} -y --copy" >&2
  fi

  if [ "${claude_parent_existed}" = "0" ]; then
    echo "If Claude Code was already open, restart it once so the new ~/.claude/skills directory is watched."
  fi
}

echo "Installing ${SKILL} globally for Claude Code and Codex from ${REPO}..."
npx skills add "${REPO}" -g -a claude-code -a codex --skill "${SKILL}" -y --copy

INSTALLED_SKILL_DIR="$(find_installed_skill_dir || true)"
ensure_claude_code_install "${INSTALLED_SKILL_DIR}"

SCOUT_SCRIPT=""
for candidate in \
  "${CLAUDE_SKILL_DIR}/scripts/cursor-scout.mjs" \
  "${HOME}/.agents/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.config/agents/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.cursor/skills/${SKILL}/scripts/cursor-scout.mjs" \
  "${HOME}/.codex/skills/${SKILL}/scripts/cursor-scout.mjs"; do
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
       node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs configure --scope global

  2. Restart your terminal or source your shell profile.

  3. If Claude Code was already open and did not list the skill, restart Claude Code once.

  4. Run inside any repository:
       node ~/.claude/skills/cursor-context-scout/scripts/cursor-scout.mjs warmup --repo .

EOF
