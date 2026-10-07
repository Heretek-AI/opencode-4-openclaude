#!/usr/bin/env bash
set -e

# Resolve plugin root if not set
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PID_FILE="${PLUGIN_ROOT}/.gateway.pid"
PORT="${OPENCODE_UNLOCKED_PORT:-8788}"
GATEWAY_URL="http://127.0.0.1:${PORT}"

# Check if gateway is already responding
is_gateway_running() {
  curl -s -f -m 1 "${GATEWAY_URL}/health" >/dev/null 2>&1
}

if ! is_gateway_running; then
  # If a dead pid file exists, clean it up
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
      rm -f "$PID_FILE"
    fi
  fi

  # Start daemon
  nohup node "${PLUGIN_ROOT}/server/gateway.mjs" >/tmp/opencode-unlocked.log 2>&1 &
  DAEMON_PID=$!
  echo "$DAEMON_PID" > "$PID_FILE"

  # Wait up to 3 seconds for gateway to become healthy
  for _ in {1..30}; do
    if is_gateway_running; then
      break
    fi
    sleep 0.1
  done
fi

# If OpenClaude passed an environment file, inject provider env vars
if [ -n "$CLAUDE_ENV_FILE" ]; then
  cat << EOF >> "$CLAUDE_ENV_FILE"
export OPENAI_BASE_URL="${GATEWAY_URL}/v1"
if [ -z "\$OPENAI_MODEL" ]; then
  export OPENAI_MODEL="muse-spark-1.3-contributor"
fi
EOF
fi

# Emit JSON output for OpenClaude SessionStart hook
cat << EOF
{
  "hookSpecificOutput": {
    "additionalContext": "Opencode Unlocked active at ${GATEWAY_URL}/v1. Default model: muse-spark-1.3-contributor (Space Bunny and 36+ models available)."
  }
}
EOF
exit 0
