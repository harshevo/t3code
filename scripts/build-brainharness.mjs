#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("Use Node 24 LTS to build BrainHarness");
const memoryManifest = resolve(root, "../../Cargo.toml");
if (!existsSync(memoryManifest))
  throw new Error(
    "Place this fork at brainharness/vendor/t3code beside the canonical Rust /crates workspace",
  );
function run(program, args, cwd = root) {
  const result = spawnSync(program, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed with exit ${result.status}`);
}
run("cargo", ["build", "--manifest-path", memoryManifest, "-p", "bh-memory"]);
run(process.execPath, ["engine/build.mjs"]);
run(
  process.execPath,
  [resolve(root, "node_modules/vite-plus/bin/vp"), "build"],
  resolve(root, "apps/web"),
);
run(process.execPath, ["apps/server/scripts/cli.ts", "build"]);
for (const name of [
  "favicon.svg",
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "manifest.webmanifest",
  "privacy.html",
]) {
  cpSync(resolve(root, "apps/web/public", name), resolve(root, "apps/server/dist/client", name));
}
if (!process.argv.includes("--web-only"))
  run("cargo", ["build", "--manifest-path", "apps/brainharness/src-tauri/Cargo.toml"]);
console.log("BrainHarness build ready");
