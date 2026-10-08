# BrainHarness native carrier

This Rust/Tauri executable wraps the existing T3 Code GUI served by the local BrainHarness server. It owns the server process group, waits for authenticated loopback readiness, supports provider OAuth popup windows and stops the owned runtime on exit. It does not add a second chat frontend.

From the fork root, run `pnpm run build:brainharness`, then launch `apps/brainharness/src-tauri/target/debug/brainharness-desktop` with Node 24 on PATH or `BH_NODE_BINARY` set. `BH_RUNTIME_ROOT` overrides the checkout path. `BH_MEMORY_BINARY` overrides the canonical parent Rust binary. `BH_WORKSPACE` selects the project, and `BH_HOME` selects isolated application data.

For the same GUI without a native window, run `pnpm run start:brainharness`. See the root README for provider configuration, memory, tool prerequisites, metrics and validation limits. The carrier is a development binary; portable release packaging and signing are not configured.
