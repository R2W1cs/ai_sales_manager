#!/usr/bin/env sh
# Shared helpers for git hooks. Source from .husky/* hooks.
#
# Quality scripts pattern adopted from onchainstack (adapted for pnpm + eslint/prettier):
#   check, check:full, check:ci, fix, husky pre-commit/pre-push, graphify post hooks.
# Not adopted: oxlint/oxfmt, check:overfetch, check:circular, check:dead-code,
#   check:doctor, check:bundle, bun-only db-sync, agents:update post-commit.

hook_setup_path() {
  export PATH="$HOME/.local/share/pnpm/bin:$HOME/.local/share/pnpm:$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:/usr/local/bin:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin:$PATH"

  if ! command -v node >/dev/null 2>&1; then
    if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
      . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    fi
  fi

  if ! command -v node >/dev/null 2>&1; then
    if [ -d "$HOME/.local/share/fnm" ]; then
      export PATH="$HOME/.local/share/fnm:$PATH"
      eval "$(fnm env 2>/dev/null)" || true
    elif [ -d "$HOME/.fnm" ]; then
      export PATH="$HOME/.fnm/current/bin:$PATH"
    fi
  fi

  if ! command -v node >/dev/null 2>&1 && [ -d "$HOME/.volta/bin" ]; then
    export PATH="$HOME/.volta/bin:$PATH"
  fi

  if ! command -v node >/dev/null 2>&1 && [ -d "$HOME/.asdf/shims" ]; then
    export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"
  fi

  if ! command -v node >/dev/null 2>&1 && [ -d "$HOME/.local/share/mise/shims" ]; then
    export PATH="$HOME/.local/share/mise/shims:$PATH"
  fi
}

hook_setup_path

hook_ensure_pnpm() {
  hook_setup_path

  if command -v corepack >/dev/null 2>&1; then
    corepack enable pnpm 2>/dev/null || true
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    printf '%s\n' "Error: pnpm is required but not found in PATH." >&2
    exit 1
  fi
}

hook_should_skip() {
  case "$1" in
    pre-commit)
      [ "${SKIP_PRE_COMMIT:-0}" = "1" ] && return 0
      ;;
    pre-push)
      [ "${SKIP_PRE_PUSH:-0}" = "1" ] && return 0
      ;;
    post-commit | post-checkout)
      [ "${SKIP_POST_COMMIT:-0}" = "1" ] && [ "$1" = "post-commit" ] && return 0
      [ "${SKIP_POST_CHECKOUT:-0}" = "1" ] && [ "$1" = "post-checkout" ] && return 0
      ;;
  esac

  [ "${SKIP_HOOKS:-0}" = "1" ] && return 0
  return 1
}

git_operation_in_progress() {
  GIT_DIR=$(git rev-parse --git-dir 2>/dev/null) || return 1
  [ -d "$GIT_DIR/rebase-merge" ] && return 0
  [ -d "$GIT_DIR/rebase-apply" ] && return 0
  [ -f "$GIT_DIR/MERGE_HEAD" ] && return 0
  [ -f "$GIT_DIR/CHERRY_PICK_HEAD" ] && return 0
  return 1
}

hook_cd_repo_root() {
  cd "$(git rev-parse --show-toplevel)" || exit 1
}

hook_run() {
  hook_ensure_pnpm
  hook_cd_repo_root
  "$@"
}
