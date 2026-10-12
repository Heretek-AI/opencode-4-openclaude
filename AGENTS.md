# AGENTS.md

The repository is `opencode-4-openclaude`; the package, plugin and CLI are named `opencode-unlocked`.

## Evidence

Back every claim about behavior with something executed or read: test output, command output, a file and line. State what was not run.

## Commands

- **`npm test` goes live when it finds an API key.** `getApiKey()` in `server/config.mjs` reads the environment (`OPENCODE_UNLOCKED_API_KEY`, `OPENCODE_API_KEY`, `GO_KEY`), then `~/.openclaude/opencode-unlocked.json`, then `.env` in the working directory and the repo root. With a key, `test/gateway.test.mjs` sends billed requests upstream. Run it offline:

  ```sh
  env -i PATH="$PATH" HOME="$(mktemp -d)" npm test
  ```

- **`npm run test:live` always needs a key and always spends.** Run it only when asked.
- **`node bin/setup.mjs` and `bin/opencode-unlocked set-key|start|setup` act on the real machine.** They rewrite the OpenClaude profile under the home directory or start a daemon on port 8788. Point `HOME` at a scratch directory first; importing `server/config.mjs` alone creates `~/.openclaude/`.

## Canonical surfaces

- Tests are plain scripts chained in `package.json` `scripts.test`. A new test file runs only once it is added to that chain.
- The version is spelled in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. Move all three together.
- The package has no dependencies, `package-lock.json` is gitignored, and CI has no install step. Adding a dependency means changing all three.

## Invariants

| Invariant | Where |
| --- | --- |
| No key, token or `.env` file is committed; each user supplies their own key | `.gitignore`, `getApiKey` in `server/config.mjs` |
| The gateway listens on loopback unless `OPENCODE_UNLOCKED_HOST` is set | `CONFIG.HOST` in `server/config.mjs` |

## Workflow

- Work on a topic branch and open a pull request. A maintainer merges.
- Stage explicit paths.
- After a push, check every workflow run.
- Write repo-relative paths in tracked files, and `owner/name` for another repository.
