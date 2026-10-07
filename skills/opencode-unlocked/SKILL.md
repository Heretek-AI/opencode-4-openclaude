---
name: opencode-unlocked
description: Guide and operational reference for using OpenCode Go models via the Opencode Unlocked bridge in OpenClaude.
---

# Opencode Unlocked Skill

This skill explains how OpenClaude interacts with OpenCode Go models through the **Opencode Unlocked** plugin and local harness bridge.

## Overview
OpenCode Go hosts 36+ cutting-edge models behind strict harness fingerprinting. The **Opencode Unlocked** plugin runs a zero-dependency local bridge daemon on `http://127.0.0.1:8788/v1` that handles:
1. **Authentic Harness Headers**: Injects exact 30-character OpenCode v2 session IDs (`ses_<timestamp_base62>`), client affinity, and harness metadata.
2. **Transparent Protocol Translation**: Translates `/v1/chat/completions` into the OpenAI `/responses` API for models that require it (such as **`muse-spark-1.3-contributor`** and **`gpt-5.6-luna`**), while natively passing standard Chat Completions for models like **`space-bunny`**.
3. **Model Prefix Stripping**: Normalizes prefix variations (`opencode-unlocked-*` -> `*`).

## Primary Models
- **`muse-spark-1.3-contributor`** (Default): High-capability reasoning and coding model. Requires `/responses` protocol; translated automatically by the bridge.
- **`space-bunny`**: Fast, lightweight general and coding model. Native `/chat/completions`.
- **`deepseek-v4-flash`**: High-throughput flash model.
- **`glm-5.3`**: General language model.
- **`gpt-5.6-luna`**: High-tier reasoning model.
- **`kimi-k2.5`**: Long-context reasoning model.
- **`minimax-01`**: Fast conversational model.
- **`qwen3.5-max`**: Large general capability model.

## Operational Commands
- Check daemon health and usage: `/opencode-unlocked:status`
- Manage models and keys: `/opencode-unlocked:unlocked`
- CLI Management: `opencode-unlocked [start|stop|restart|status|models|test|set-key]`
