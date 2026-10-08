import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { resolveDataHome } from "./data-home.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const home = await resolveDataHome(process.env.BH_HOME || join(homedir(), ".brainharness/t3"));
const memoryBinary = resolve(
  process.env.BH_MEMORY_BINARY || join(root, "../../target/debug/brain-memory"),
);
await access(memoryBinary);
await access(join(root, "apps/server/dist/bin.mjs"));
await mkdir(join(home, "userdata"), { recursive: true, mode: 0o700 });
const settingsPath = join(home, "userdata/settings.json");
let settings;
try {
  settings = JSON.parse(await readFile(settingsPath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  settings = {};
}
settings.providerInstances ??= {};
if (!settings.providerInstances.brainharness) {
  settings.providerInstances.brainharness = {
    driver: "acpRegistry",
    displayName: "BrainHarness",
    enabled: true,
    config: {
      source: "local",
      enabled: true,
      agentId: "brainharness",
      commandPath: process.execPath,
      commandArgs: [join(root, "engine/bin.mjs")],
      distribution: "auto",
      authMethodId: "",
      customModels: [],
    },
  };
  settings.branchNamePrefix ??= "brain";
  settings.defaultModelSelection ??= {
    instanceId: "brainharness",
    model: JSON.stringify([process.env.BH_PROVIDER || "openai", process.env.BH_MODEL || "gpt-5.4"]),
    options: [],
  };
}
const instance = settings.providerInstances.brainharness;
if (instance.driver !== "acpRegistry")
  throw new Error("BrainHarness provider ID belongs to a different driver");
instance.config = {
  ...instance.config,
  commandPath: process.execPath,
  commandArgs: [join(root, "engine/bin.mjs")],
};
instance.environment = [
  ...(instance.environment ?? []).filter(
    (variable) => !["BH_HOME", "BH_MEMORY_BINARY"].includes(variable.name),
  ),
  { name: "BH_HOME", value: home, sensitive: false },
  { name: "BH_MEMORY_BINARY", value: memoryBinary, sensitive: false },
];
const pendingSettings = `${settingsPath}.${process.pid}.tmp`;
await writeFile(pendingSettings, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
await rename(pendingSettings, settingsPath);
const child = spawn(
  process.execPath,
  [
    join(root, "apps/server/dist/bin.mjs"),
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    process.env.BH_PORT || "3773",
    "--base-dir",
    home,
    "--no-browser",
    "--auto-bootstrap-project-from-cwd",
  ],
  {
    cwd: process.env.BH_WORKSPACE || resolve(root, "../.."),
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      DISABLE_TELEMETRY: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      BH_HOME: home,
      BH_MEMORY_BINARY: memoryBinary,
    },
    stdio: ["ignore", "pipe", "inherit"],
  },
);
let pending = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  pending += chunk;
  let index;
  while ((index = pending.indexOf("\n")) >= 0) {
    const line = pending.slice(0, index);
    pending = pending.slice(index + 1);
    if (line.startsWith("Pairing URL: "))
      process.stdout.write(`BrainHarness ready: ${line.slice(13)}\n`);
  }
});
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
child.on("error", (error) => {
  process.stderr.write(`BrainHarness startup failed: ${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
