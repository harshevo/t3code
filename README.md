# BrainHarness

A local coding and research workspace using the existing T3 Code React GUI, an extracted DeepSeek Harness host orchestrator, and the canonical BrainHarness Rust memory engine. The native desktop carrier is Tauri; it loads the same GUI as the local web server. The DeepSeek GUI and hosted services are not part of the application.

The project sidebar, chat, composer, model/effort controls, approval flow, terminal, file/diff review and preview tools come from the GUI base. Application login/signup has been removed. OpenAI/ChatGPT and other model-provider authentication remain available in Settings → Providers.

## Build and run

This checkout belongs at `brainharness/vendor/t3code`, beside the Rust workspace in `brainharness/crates`. Requirements: Node 24 LTS, pnpm 11, Rust 1.89+, and the Tauri platform development prerequisites. On macOS, Node must include development headers for the native credential lock. Linux additionally needs `musl-gcc` for the extracted Landlock launcher. Windows native builds are not verified.

```sh
# From this directory, with Node 24 active:
pnpm install --filter @brainharness/desktop --filter @brainharness/engine --filter @t3tools/web --filter t3 --filter @t3tools/monorepo --filter @t3tools/scripts
pnpm run build:brainharness

# Native desktop (development binary; macOS can also open start-brainharness.command):
BH_NODE_BINARY="$(command -v node)" apps/brainharness/src-tauri/target/debug/brainharness-desktop

# Same GUI served locally; prints a private pairing URL:
pnpm run start:brainharness
```

`BH_WORKSPACE` chooses the initial project. `BH_HOME` selects application data; web default is `~/.brainharness/t3`, and the native carrier defaults to its application-data directory. The live `~/.t3` directory is refused. `BH_MEMORY_BINARY` can select a separately built canonical Rust binary. `BH_PORT` selects a web-server port; desktop chooses a free loopback port.

## Models and authentication

Settings → Providers → BrainHarness exposes the provider route, model, protected API key, optional custom endpoint/protocol, context capacity and output limit. Built-in routes include OpenAI, ChatGPT/Codex, Anthropic, Google and OpenRouter. Custom gateways must declare a supported wire protocol and model limits; support is protocol-based, not a promise that every proprietary provider API is interchangeable.

Use the existing provider sign-in methods for OAuth. `openai-codex` is the extracted engine's ChatGPT/Codex OAuth route. The original GUI's Codex sign-in and other provider adapters are also retained. Successful real sign-in needs the user's browser interaction and account access. API credentials and OAuth tokens are handled by provider credential storage, not an application account. Local provider environment secrets use the server's secret handling; engine credential files use restricted permissions and exclusive writer locks.

For scripted launches, `BH_PROVIDER`, `BH_MODEL`, `BH_API_KEY`, `BH_BASE_URL`, `BH_API`, `BH_CONTEXT_WINDOW` and `BH_MAX_TOKENS` configure the extracted engine. Never put keys in a committed file. DeepSeek-named provider routes and DeepSeek-hosted endpoints are rejected; they are excluded from model/auth discovery.

## Memory, tools and metrics

The Rust service is built from the canonical `/crates/bh-memory`, `/crates/bh-core` and `/crates/bh-cognition` workspace. It captures original human requests and actual tool evidence, persists plans and user-quoted constraints, and recalls workspace-scoped state before model requests. Session resume uses the original ACP identity. File freshness and evidence hashes provide provenance; retrieved observations, plans and lessons remain untrusted data. No coding-performance superiority or automatic skill-learning claim is made.

The extracted host loop retains filesystem/search/patch tools, sandbox/approval services, shell jobs, MCP, skills, compaction, subagents, goals and workflows. Research uses HTTP fetching and optional Exa configuration. `BH_BROWSER_USE=1` mounts the Playwright MCP browser provider; `BH_COMPUTER_USE=1` mounts Cua Driver native computer use. These require their runtime/browser/OS prerequisites and are not enabled by default. The GUI's preview tools are a separate capability.

The composer shows streaming output tokens/sec, cache-hit percentage with cached/inclusive input counts, output tokens and elapsed time. Expand it for input/output/cache-write/reasoning/context counts, first-token latency, model/tool calls, reported cost and usage scope. Unknown provider fields remain unavailable. Stream speed uses measured stream duration; a fallback is explicitly labelled whole-turn average. Child-agent usage is excluded from main-agent totals.

Application analytics, anonymous identity and remote trace/metric exporters are disabled. Provider requests, configured research/MCP/browser/computer-use services and explicit integrations still contact their selected services. Local trace files and resource counters remain for diagnostics. The local data page explains this distinction.

## Validation and scope

Build and focused regression checks cover provider authentication, ACP usage normalization, GUI metric math, native credential locks, Rust evidence persistence, mocked-model tool execution and isolated launcher readiness. Live account sign-in, native visual checks, browser automation and native computer use require separate interactive validation. This development executable requires the checkout and Node; signed portable installers, bundled Node and release updates are not configured.

See [architecture](docs/brainharness-architecture.md) and [native entry](apps/brainharness/README.md). T3 Code and DeepSeek Harness license notices and internal package identifiers are retained for compatibility and attribution. `engine/vendor-list.json` pins extracted package provenance. Vendored declarations/generated protocol artifacts accompany source; `engine/build.mjs` regenerates runnable JavaScript and the host native primitives.
