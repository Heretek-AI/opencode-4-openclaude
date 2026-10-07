---
description: Manage Opencode Unlocked bridge, switch models, or configure keys
argument-hint: "[models|switch <model>|key <key>|test]"
---

Manage Opencode Unlocked:
- If argument is `models`: Run `${CLAUDE_PLUGIN_ROOT}/bin/opencode-unlocked models` to list all 36+ available models.
- If argument is `switch <model>`: Run `${CLAUDE_PLUGIN_ROOT}/bin/opencode-unlocked switch $1` to change the default model.
- If argument is `key <key>`: Run `${CLAUDE_PLUGIN_ROOT}/bin/opencode-unlocked set-key $1` to securely store your OpenCode API key.
- If argument is `test`: Run `${CLAUDE_PLUGIN_ROOT}/bin/opencode-unlocked test` to test live connectivity to Muse Spark 1.3 Contributor and Space Bunny.
- Otherwise, run `${CLAUDE_PLUGIN_ROOT}/bin/opencode-unlocked status`.
