#!/usr/bin/env node
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { Logger } from "@deepseek-ai/cordis";
import { Writable } from "node:stream";
import { boot, installFailLoud } from "@deepseek-ai/dsh-app-boot";
import {
  createLaunchEnvironmentSnapshot,
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from "@deepseek-ai/dsh-launch-environment";
import { catalogProviderIds } from "./packages/llm/llm-pi-ai/lib/catalog.js";
const root = dirname(fileURLToPath(import.meta.url));
process.env.DSH_HOME =
  process.env.BH_ENGINE_HOME ||
  join(process.env.BH_HOME || join(homedir(), ".brainharness"), "engine");
const memoryBinary =
  process.env.BH_MEMORY_BINARY || resolve(root, "../../../target/debug/brain-memory");
const engineProviders = Object.fromEntries(catalogProviderIds().map((id) => [id, {}]));
const provider = process.env.BH_PROVIDER || "openai-codex";
if (process.env.BH_BASE_URL) {
  engineProviders[provider] = {
    baseURL: process.env.BH_BASE_URL,
    api: process.env.BH_API || "openai-completions",
    apiKeyEnv: process.env.BH_API_KEY_ENV || "BH_API_KEY",
    models: [
      {
        id: process.env.BH_MODEL || "gpt-5.6-sol",
        contextWindow: Number(process.env.BH_CONTEXT_WINDOW || 128000),
        maxTokens: Number(process.env.BH_MAX_TOKENS || 8192),
      },
    ],
  };
} else if (process.env.BH_API_KEY) {
  engineProviders[provider] = { ...engineProviders[provider], apiKeyEnv: "BH_API_KEY" };
}
const dshHomePath = (...parts) => join(process.env.DSH_HOME, ...parts);
function evaluate(value) {
  if (Array.isArray(value)) return value.map(evaluate);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && "$expression" in value) {
      return Function(
        "process",
        "dshHomePath",
        "engineProviders",
        "memoryBinary",
        `return (${value.$expression})`,
      )(process, dshHomePath, engineProviders, memoryBinary);
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, evaluate(child)]));
  }
  return value;
}
const rows = evaluate(
  JSON.parse(
    await (await import("node:fs/promises")).readFile(join(root, "composition.json"), "utf8"),
  ),
);
const authMode = process.argv[2] === "auth";
const acpRow = rows.splice(
  rows.findIndex((row) => row.id === "acp"),
  1,
)[0];
if (process.env.BH_BROWSER_USE === "1")
  rows.push(
    { id: "browser-use", name: "@deepseek-ai/dsh-browser-use" },
    { id: "browser-runtime", name: "@deepseek-ai/dsh-experimental-browser-use-runtime" },
    {
      id: "browser-playwright",
      name: "@deepseek-ai/dsh-experimental-browser-use-playwright-mcp",
      config: { mode: "launch", headless: true },
    },
  );
if (process.env.BH_COMPUTER_USE === "1")
  rows.push(
    { id: "computer-use", name: "@deepseek-ai/dsh-computer-use" },
    { id: "computer-native", name: "@deepseek-ai/dsh-experimental-computer-use-cua-driver-native" },
  );
await mkdir(process.env.DSH_HOME, { recursive: true, mode: 0o700 });
const configDir = await mkdtemp(join(tmpdir(), "brainharness-engine-"));
const config = join(configDir, "cordis.yml");
await writeFile(config, JSON.stringify(rows), { mode: 0o600 });
let ctx;
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  try {
    await ctx?.fiber.dispose();
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
  process.exitCode = code;
}
installFailLoud("BrainHarness engine", process, () => close(1));
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => void close());
try {
  ctx = await boot(
    "BrainHarness engine",
    config,
    [],
    (host) => {
      host.logger.exporter({
        colors: 0,
        levels: { default: 2 },
        export: (message) => stderr.write(Logger.format({ colors: 0 }, message) + "\n"),
      });
      host.provide(
        DSH_LAUNCH_ENVIRONMENT_KEY,
        createLaunchEnvironmentSnapshot([{ source: "process", values: { ...process.env } }]),
      );
    },
    pathToFileURL(root).href + "/",
  );
  for (const entry of ctx.loader.entries()) {
    if (!entry.disabled && entry.fiber?.state !== 2)
      throw new Error(`Engine plugin failed to activate: ${entry.options.id}`);
  }
  await rm(configDir, { recursive: true, force: true });
  if (authMode) {
    const key = process.argv[3];
    const method = process.argv[4];
    const flow = ctx.authorization.list().find((entry) => entry.key === key);
    if (!flow) throw new Error("Unknown provider authentication method");
    let masked = false;
    const output = new Writable({
      write(chunk, encoding, done) {
        if (!masked) stdout.write(chunk, encoding);
        done();
      },
    });
    const rl = createInterface({ input: stdin, output, terminal: !!stdin.isTTY });
    try {
      const result = await ctx.authorization.begin({
        key: flow.key,
        method,
        interaction: {
          notify: (notice) => {
            stdout.write(
              [notice.message, notice.url, notice.code].filter(Boolean).join("\n") + "\n",
            );
          },
          prompt: async (prompt) => {
            stdout.write(
              `${prompt.message}${prompt.kind === "select" ? "\n" + prompt.options.map((o) => `${o.id}: ${o.label}`).join("\n") : ""}\n> `,
            );
            masked = prompt.kind === "secret";
            try {
              return await rl.question("", { signal: prompt.signal });
            } finally {
              masked = false;
              stdout.write("\n");
            }
          },
        },
      });
      stdout.write(result.status + "\n");
    } finally {
      rl.close();
      await close();
    }
  } else {
    const acp = await import("@deepseek-ai/dsh-acp");
    await ctx.plugin(acp, acpRow.config);
    if (stdin.readableEnded) await close();
    else stdin.once("end", () => void close());
  }
} catch (error) {
  stderr.write(`BrainHarness engine: ${error.message}\n`);
  await close(1);
}
