# Opencode Unlocked (OpenClaude Plugin)

A standalone plugin and native provider bridge for [OpenClaude](https://github.com/anthropics/openclaude) that unlocks full access to **OpenCode Go** subscription models (`https://opencode.ai/zen/go/v1`).

Features:
- **Authentic OpenCode v2 Harness Reverse Engineering**: Generates authentic 30-character descending session identifiers (`ses_<timestamp_base62>`), client affinity tracking, and full harness request headers (`User-Agent`, `x-opencode-client`, `x-opencode-session`, `x-opencode-project`, `x-session-affinity`).
- **Seamless Protocol Translation**: OpenClaude talks standard OpenAI `/v1/chat/completions`. Upstream models like **`muse-spark-1.3-contributor`** require OpenAI `/responses` API. The bridge transparently translates requests and bi-directionally streams Server-Sent Events (SSE).
- **Target Default Model**: Defaults to **`muse-spark-1.3-contributor`** with verified support for **`space-bunny`** and all 36+ OpenCode Go models.
- **Model Name Normalizer**: Strips any client prefixes (`opencode-unlocked-*`, `opencode-go-*`) to prevent upstream rejection.
- **Zero-Secret Distribution**: The repository contains no hardcoded keys or `.env` files. Users provide their key via environment variable, interactive command, or local config.
- **Marketplace Ready**: Fully compatible with OpenClaude's plugin and marketplace system (`marketplace.json` + `plugin.json`).

---

## Quick Start

### 1. Installation

#### Option A: OpenClaude Marketplace
In OpenClaude, add the repository marketplace and install the plugin:
```bash
/plugin marketplace add /path/to/opencode-4-openclaude
/plugin install opencode-unlocked@opencode-unlocked
```

#### Option B: Direct Plugin Flag
Launch OpenClaude directly with the plugin:
```bash
openclaude --plugin-dir /path/to/opencode-4-openclaude
```

---

### 2. Configure Your API Key

Provide your OpenCode Go API key (`oc_sk_...`) using any of the following methods:

1. **CLI Command**:
   ```bash
   ./bin/opencode-unlocked set-key oc_sk_your_key_here
   ```
2. **Environment Variable**:
   ```bash
   export OPENCODE_UNLOCKED_API_KEY="oc_sk_your_key_here"
   # or
   export GO_KEY="oc_sk_your_key_here"
   ```

---

### 3. Provider Setup for OpenClaude

Run the setup utility to configure OpenClaude's profile:
```bash
node bin/setup.mjs
```
This automatically backs up your existing profile and sets:
- `OPENAI_BASE_URL`: `http://127.0.0.1:8788/v1`
- `OPENAI_MODEL`: `muse-spark-1.3-contributor`

To restore your previous profile at any time:
```bash
node bin/setup.mjs restore
```

---

## Daemon & CLI Management

Manage the background bridge daemon using `./bin/opencode-unlocked`:

```bash
# Check status, active model, and token consumption
./bin/opencode-unlocked status

# Start daemon
./bin/opencode-unlocked start

# Stop daemon
./bin/opencode-unlocked stop

# Restart daemon
./bin/opencode-unlocked restart

# List all 36+ available models
./bin/opencode-unlocked models

# Switch active default model
./bin/opencode-unlocked switch space-bunny

# Run live connectivity verification
./bin/opencode-unlocked test
```

---

## Supported Models

All 36+ OpenCode Go models are available, including:

| Model ID | Protocol | Specialization |
| :--- | :--- | :--- |
| **`muse-spark-1.3-contributor`** | `/responses` (Translated) | **Target Default**: Deep Reasoning & Coding |
| **`space-bunny`** | `/chat/completions` (Native) | Fast General & Code |
| **`gpt-5.6-luna`** | `/responses` (Translated) | High-Capability Reasoning |
| **`deepseek-v4-flash`** | `/chat/completions` (Native) | High-Throughput Flash |
| **`glm-5.3`** | `/chat/completions` (Native) | General Language |
| **`kimi-k2.5`** | `/chat/completions` (Native) | Long Context |
| **`minimax-01`** | `/chat/completions` (Native) | Conversational |
| **`qwen3.5-max`** | `/chat/completions` (Native) | General Capabilities |

---

## Architecture

```
OpenClaude CLI
      │ (OpenAI /v1/chat/completions)
      ▼
Opencode Unlocked Gateway (127.0.0.1:8788)
 ├── Harness Fingerprint (ses_ + descending base62 session ID)
 ├── Session Affinity Cache (prompt caching preservation)
 ├── Protocol Translation Engine
 │     ├── muse-spark-1.3-contributor -> POST /responses
 │     └── space-bunny / others       -> POST /chat/completions
 └── Dynamic Model Catalog & Prefix Normalizer
      │
      ▼
OpenCode Go Cloudflare Edge (https://opencode.ai/zen/go/v1)
```

---

## Testing

Run the test suite:
```bash
# Unit & integration tests
npm test

# Live model verification (requires API key)
npm run test:live
```

---

## License
MIT
