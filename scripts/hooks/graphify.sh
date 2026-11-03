#!/usr/bin/env sh
# Graphify git hook helpers. Requires scripts/hooks/common.sh to be sourced first.

graphify_should_skip() {
  [ "${GRAPHIFY_SKIP_HOOK:-0}" = "1" ] && return 0
  git_operation_in_progress && return 0
  return 1
}

graphify_resolve_python() {
  GRAPHIFY_PYTHON=""

  GRAPHIFY_BIN=$(command -v graphify 2>/dev/null)
  if [ -n "$GRAPHIFY_BIN" ]; then
    case "$GRAPHIFY_BIN" in
      *.exe) _SHEBANG="" ;;
      *) _SHEBANG=$(head -1 "$GRAPHIFY_BIN" | sed 's/^#![[:space:]]*//') ;;
    esac
    case "$_SHEBANG" in
      */env\ *) GRAPHIFY_PYTHON="${_SHEBANG#*/env }" ;;
      *) GRAPHIFY_PYTHON="$_SHEBANG" ;;
    esac
    case "$GRAPHIFY_PYTHON" in
      *[!a-zA-Z0-9/_.@-]*) GRAPHIFY_PYTHON="" ;;
    esac
    if [ -n "$GRAPHIFY_PYTHON" ] && ! "$GRAPHIFY_PYTHON" -c "import graphify" 2>/dev/null; then
      GRAPHIFY_PYTHON=""
    fi
  fi

  if [ -z "$GRAPHIFY_PYTHON" ]; then
    if command -v python3 >/dev/null 2>&1 && python3 -c "import graphify" 2>/dev/null; then
      GRAPHIFY_PYTHON="python3"
    elif command -v python >/dev/null 2>&1 && python -c "import graphify" 2>/dev/null; then
      GRAPHIFY_PYTHON="python"
    fi
  fi

  [ -n "$GRAPHIFY_PYTHON" ]
}

graphify_prepare_log() {
  _GRAPHIFY_LOG="${HOME}/.cache/graphify-rebuild.log"
  mkdir -p "$(dirname "$_GRAPHIFY_LOG")"
}

graphify_launch_background_from_stdin() {
  label="$1"
  python_code=$(cat)

  graphify_prepare_log
  printf '%s\n' "$label launching background rebuild (log: $_GRAPHIFY_LOG)"
  nohup "$GRAPHIFY_PYTHON" -c "$python_code" >> "$_GRAPHIFY_LOG" 2>&1 < /dev/null &
  disown 2>/dev/null || true
}

graphify_post_commit() {
  if graphify_should_skip; then
    return 0
  fi

  export PYTHONHASHSEED=0

  CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null)
  if [ -z "$CHANGED" ]; then
    return 0
  fi

  _NON_GRAPH=$(printf '%s\n' "$CHANGED" | grep -v '^graphify-out/' || true)
  if [ -z "$_NON_GRAPH" ]; then
    return 0
  fi

  if ! graphify_resolve_python; then
    return 0
  fi

  export GRAPHIFY_CHANGED="$CHANGED"

  graphify_launch_background_from_stdin "[graphify hook]" <<'PY'
import os, signal, sys
from pathlib import Path

changed_raw = os.environ.get('GRAPHIFY_CHANGED', '')
changed = [Path(f.strip()) for f in changed_raw.strip().splitlines() if f.strip()]

if not changed:
    sys.exit(0)

print(f'[graphify hook] {len(changed)} file(s) changed - rebuilding graph...')

try:
    from graphify.watch import _rebuild_code, _apply_resource_limits
    _apply_resource_limits()
    _timeout = int(os.environ.get('GRAPHIFY_REBUILD_TIMEOUT', '600'))
    if _timeout > 0 and hasattr(signal, 'SIGALRM'):
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError(f'graphify rebuild exceeded {_timeout}s')))
        signal.alarm(_timeout)
    _force = os.environ.get('GRAPHIFY_FORCE', '').lower() in ('1', 'true', 'yes')
    _rebuild_code(Path('.'), changed_paths=changed, force=_force)
except TimeoutError as exc:
    print(f'[graphify hook] {exc}')
    sys.exit(1)
except Exception as exc:
    print(f'[graphify hook] Rebuild failed: {exc}')
    sys.exit(1)
PY
}

graphify_post_checkout() {
  branch_switch="$3"

  if [ "$branch_switch" != "1" ]; then
    return 0
  fi

  if [ ! -d "graphify-out" ]; then
    return 0
  fi

  if graphify_should_skip; then
    return 0
  fi

  export PYTHONHASHSEED=0

  if ! graphify_resolve_python; then
    return 0
  fi

  graphify_launch_background_from_stdin "[graphify]" <<'PY'
from graphify.watch import _rebuild_code, _apply_resource_limits
from pathlib import Path
import os, signal, sys
try:
    _apply_resource_limits()
    _timeout = int(os.environ.get('GRAPHIFY_REBUILD_TIMEOUT', '600'))
    if _timeout > 0 and hasattr(signal, 'SIGALRM'):
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError(f'graphify rebuild exceeded {_timeout}s')))
        signal.alarm(_timeout)
    _force = os.environ.get('GRAPHIFY_FORCE', '').lower() in ('1', 'true', 'yes')
    _rebuild_code(Path('.'), force=_force)
except TimeoutError as exc:
    print(f'[graphify] {exc}')
    sys.exit(1)
except Exception as exc:
    print(f'[graphify] Rebuild failed: {exc}')
    sys.exit(1)
PY
}
