import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "../packages/experimental/brainharness-memory/lib/index.js";

const binary = fileURLToPath(new URL("../../../../target/debug/brain-memory", import.meta.url));
function memoryHost(database, failOnce = false) {
  const listeners = new Map();
  const tools = new Map();
  const ctx = {
    on: (name, handler) => {
      listeners.set(name, handler);
    },
    systemPrompt: { section: () => undefined },
    tools: {
      register: (tool) => {
        tools.set(tool.name, tool);
      },
    },
    subprocess: {
      spawn: (options) => {
        if (failOnce) {
          failOnce = false;
          return {
            done: Promise.resolve({ exitCode: 1 }),
            collected: {
              stdout: {
                readFrom: () => ({
                  lossy: false,
                  text: '{"error":"temporary database unavailability"}',
                }),
              },
            },
          };
        }
        const child = spawn(options.argv[0], options.argv.slice(1), {
          cwd: options.cwd,
          signal: options.signal,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
        });
        child.stderr.resume();
        child.stdin.end(options.stdio.stdin.data);
        return {
          done: new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("close", (exitCode) => resolve({ exitCode }));
          }),
          collected: { stdout: { readFrom: () => ({ lossy: false, text: output }) } },
        };
      },
    },
  };
  apply(ctx, { binary, database, timeoutMs: 15000 });
  const signal = AbortSignal.timeout(30000);
  return {
    user(agent, id, text) {
      listeners.get("agent/inbox/claimed")({
        agent,
        message: { id, source: { kind: "user" }, content: [{ type: "text", text }] },
      });
    },
    result(agent, callId, text, isError = false) {
      listeners.get("tools/result")(
        { agent, callId, name: "bash", arguments: { command: "cargo test" } },
        { isError, content: [{ type: "text", text }] },
      );
    },
    async tool(agent, name, args) {
      return JSON.parse((await tools.get(name).execute(args, { agent, signal })).text);
    },
    async assemble(agent) {
      const assembly = { contexts: [] };
      await listeners.get("system-prompt/assemble")(
        assembly,
        { agent, signal },
        async () => undefined,
      );
      return JSON.parse(assembly.contexts[0].text);
    },
  };
}

test(
  "a fresh plugin with no conversation history restores task state and failed tool evidence",
  { timeout: 30000 },
  async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "bh-memory-reset-"));
    try {
      const database = resolve(workspace, "memory.sqlite");
      const agent = { session: { id: "stable-session", header: { cwd: workspace } } };
      const before = memoryHost(database);
      before.user(agent, "human-request", "Repair sqlite. Do not publish.");
      before.result(agent, "failed-test", "sqlite assertion failed [exit code: 1]", true);
      await before.tool(agent, "brain_pin", { text: "Do not publish." });
      await before.tool(agent, "brain_checkpoint", {
        text: "Fix sqlite assertion; rerun tests; completion unverified",
      });
      // No agent, query cache, evidence map or prompt history survives this boundary.
      const after = memoryHost(database);
      const restoredAgent = { session: { id: "stable-session", header: { cwd: workspace } } };
      const context = await after.assemble(restoredAgent);
      assert.equal(context.goal, "Repair sqlite. Do not publish.");
      assert.deepEqual(context.pinned_constraints, ["Do not publish."]);
      assert.ok(context.unverified_plan.includes("completion unverified"));
      assert.ok(
        context.recent_tool_observations.some((item) => item.status === "failed_tool_observation"),
      );
      const lesson = await after.tool(restoredAgent, "brain_remember", {
        text: "sqlite regression needs actual acceptance check",
        source: "failed-test",
      });
      const evidence = await after.tool(restoredAgent, "brain_evidence", { text: lesson.evidence });
      assert.ok(evidence.body.includes("assertion failed"));
      await assert.rejects(
        after.tool(restoredAgent, "brain_pin", { text: "Publish without review" }),
        /quote an original user request/,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

test(
  "automatic evidence writes retry before a model request and large Unicode results stay bounded",
  { timeout: 30000 },
  async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "bh-memory-retry-"));
    try {
      await mkdir(resolve(workspace, "repo"));
      const agent = {
        session: { id: "retry-session", header: { cwd: resolve(workspace, "repo") } },
      };
      const host = memoryHost(resolve(workspace, "memory.sqlite"), true);
      host.user(agent, "first-message", "Fix sqlite transactions.");
      host.result(agent, "large-result", 'sqlite 🧠 \\"'.repeat(14000));
      const context = await host.assemble(agent);
      assert.equal(context.goal, "Fix sqlite transactions.");
      assert.equal(context.user_request_count, 1);
      const result = context.recent_tool_observations.find(
        (item) => item.source === "large-result",
      );
      assert.ok(result);
      const page = await host.tool(agent, "brain_evidence", { text: result.evidence });
      assert.ok(page.total_bytes <= 65536);
      assert.ok(page.next_offset > 0);
      let body = page.body;
      let offset = page.next_offset;
      while (offset !== null) {
        const next = await host.tool(agent, "brain_evidence", { text: result.evidence, offset });
        body += next.body;
        offset = next.next_offset;
      }
      const original = JSON.parse(body);
      assert.equal(original.truncated, true);
      assert.ok(original.original_bytes > 65536);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
