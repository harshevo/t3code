import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
const root = fileURLToPath(new URL("../..", import.meta.url));
function connect(child) {
  let id = 0;
  let stderr = "";
  const requests = new Map();
  const updates = [];
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.method && message.id !== undefined) {
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { outcome: { outcome: "selected", optionId: "allow-once" } },
        }) + "\n",
      );
    } else if (message.id !== undefined) {
      const request = requests.get(message.id);
      if (!request) return;
      requests.delete(message.id);
      clearTimeout(request.timer);
      message.error
        ? request.reject(new Error(JSON.stringify(message.error)))
        : request.resolve(message.result);
    } else if (message.method === "session/update") updates.push(message.params.update);
  });
  child.on("exit", (code) => {
    for (const req of requests.values()) {
      clearTimeout(req.timer);
      req.reject(new Error(`Engine exited ${code}: ${stderr}`));
    }
  });
  return {
    updates,
    request(method, params) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => {
          requests.delete(requestId);
          reject(new Error(`Timed out ${method}: ${stderr}`));
        }, 30000);
        requests.set(requestId, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
      });
    },
  };
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.stdin.end();
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
test(
  "ACP uses the extracted orchestrator, retains provider auth and reports real usage",
  { timeout: 45000 },
  async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "brainharness-test-"));
    await writeFile(resolve(workspace, "README.md"), "durable-fixture-original\n");
    const calls = [];
    const server = createServer(async (req, res) => {
      const parts = [];
      for await (const part of req) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts));
      calls.push(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (calls.length <= 2) {
        const name = calls.length === 1 ? "read" : "brain_remember";
        const args =
          calls.length === 1
            ? { file_path: "README.md" }
            : {
                text: "Remember durable fixture evidence",
                source: "call_evidence",
                evidence: "fabricated-must-not-be-stored",
              };
        const tool = {
          index: 0,
          id: calls.length === 1 ? "call_evidence" : "call_memory",
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        };
        res.write(
          `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [tool] }, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 } } })}\n\n`,
        );
        return res.end("data: [DONE]\n\n");
      }
      res.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "Memory-aware" }, finish_reason: null }] })}\n\n`,
      );
      await new Promise((r) => setTimeout(r, 25));
      res.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: " response" }, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 } } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const child = spawn(process.execPath, [resolve(root, "engine/bin.mjs")], {
      cwd: workspace,
      env: {
        ...process.env,
        BH_HOME: resolve(workspace, "home"),
        BH_PROVIDER: "gateway",
        BH_MODEL: "test-model",
        BH_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
        BH_API_KEY: "synthetic-test-key",
        BH_MEMORY_BINARY: resolve(root, "../../target/debug/brain-memory"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const rpc = connect(child);
    try {
      const init = await rpc.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      assert.equal(init.agentInfo.name, "brainharness-engine");
      assert.ok(
        init.authMethods.some(
          (method) => method.id.includes("openai-codex") && method.id.endsWith(":oauth"),
        ),
      );
      assert.ok(init.authMethods.every((method) => !method.id.includes("deepseek")));
      const session = await rpc.request("session/new", { cwd: workspace, mcpServers: [] });
      const result = await rpc.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Give a short answer." }],
      });
      assert.equal(result.stopReason, "end_turn");
      assert.equal(
        rpc.updates
          .filter((update) => update.sessionUpdate === "agent_message_chunk")
          .map((update) => update.content.text)
          .join(""),
        "Memory-aware response",
      );
      assert.equal(calls.length, 3);
      assert.ok(JSON.stringify(calls[1].messages).includes("durable-fixture-original"));
      assert.ok(JSON.stringify(calls[2].messages).includes("unverified_claim"));
      assert.ok(JSON.stringify(calls[0].messages).includes("pinned_constraints"));
      assert.ok(calls[0].tools.some((tool) => tool.function.name === "brain_remember"));
      const usage = rpc.updates.filter((update) => update.sessionUpdate === "usage_update").at(-1);
      assert.equal(usage._meta.brainharness.inputTokens, 300);
      assert.equal(usage._meta.brainharness.cachedInputTokens, 120);
      assert.equal(usage._meta.brainharness.outputTokens, 60);
      assert.ok(usage._meta.brainharness.decodeDurationMs > 0);
      assert.ok(usage._meta.brainharness.ttftMs >= 0);
      assert.equal(usage._meta.brainharness.modelCallCount, 3);
      assert.equal(usage._meta.brainharness.toolUses, 2);
      const memory = spawn(resolve(root, "../../target/debug/brain-memory"), [], {
        cwd: workspace,
        stdio: ["pipe", "pipe", "pipe"],
      });
      memory.stdin.end(
        JSON.stringify({
          database: resolve(workspace, "home/engine/brain/state.sqlite"),
          workspace,
          session: session.sessionId,
          operation: "recall",
          text: "durable fixture",
        }),
      );
      const output = [];
      for await (const chunk of memory.stdout) output.push(chunk);
      const recalled = JSON.parse(Buffer.concat(output)).result;
      assert.ok(recalled.memories.some((item) => item.status === "unverified_claim"));
      assert.equal(recalled.user_request_count, 1);
      assert.ok(recalled.recent.some((item) => item.source === "call_evidence"));
      const evidence = spawn(resolve(root, "../../target/debug/brain-memory"), [], {
        cwd: workspace,
        stdio: ["pipe", "pipe", "pipe"],
      });
      evidence.stdin.end(
        JSON.stringify({
          database: resolve(workspace, "home/engine/brain/state.sqlite"),
          workspace,
          session: session.sessionId,
          operation: "evidence",
          text: recalled.memories[0].evidence,
        }),
      );
      const artifact = [];
      for await (const chunk of evidence.stdout) artifact.push(chunk);
      const original = JSON.stringify(JSON.parse(Buffer.concat(artifact)));
      assert.ok(original.includes("durable-fixture-original"));
      assert.ok(!original.includes("fabricated-must-not-be-stored"));
    } finally {
      await stop(child);
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

test(
  "the engine refuses DeepSeek endpoints before it accepts sessions",
  { timeout: 15000 },
  async () => {
    const home = await mkdtemp(resolve(tmpdir(), "brainharness-reject-"));
    const child = spawn(process.execPath, [resolve(root, "engine/bin.mjs")], {
      cwd: home,
      env: {
        ...process.env,
        BH_HOME: home,
        BH_PROVIDER: "gateway",
        BH_MODEL: "test",
        BH_BASE_URL: "https://api.deepseek.com/v1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    try {
      const code = await new Promise((resolve) => child.once("exit", resolve));
      assert.equal(code, 1);
      assert.equal(Buffer.concat(stdout).toString(), "");
      assert.match(Buffer.concat(stderr).toString(), /excludes DeepSeek hosted providers/);
    } finally {
      await stop(child);
      await rm(home, { recursive: true, force: true });
    }
  },
);

test(
  "Rust memory restores goals, constraints, plans and original tool evidence after ACP restart",
  { timeout: 45000 },
  async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "brainharness-resume-"));
    await writeFile(resolve(workspace, "README.md"), "sqlite old-source-value\n");
    let phase = 1;
    let step = 0;
    const calls = [];
    const server = createServer(async (req, res) => {
      const parts = [];
      for await (const part of req) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts));
      calls.push({ phase, body });
      step++;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const action =
        phase === 1
          ? [
              ["read", { file_path: "README.md" }, "old-read"],
              ["brain_pin", { text: "Do not publish." }, "pin-user"],
              [
                "brain_checkpoint",
                { text: "Repair sqlite; run acceptance checks; validation remains pending" },
                "plan",
              ],
            ][step - 1]
          : [
              [
                "brain_remember",
                { text: "sqlite old file observation needs rechecking", source: "old-read" },
                "durable-lesson",
              ],
              ["brain_pin", { text: "Publish without review" }, "reject-fabricated-constraint"],
            ][step - 1];
      const delta = action
        ? {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: action[2],
                type: "function",
                function: { name: action[0], arguments: JSON.stringify(action[1]) },
              },
            ],
          }
        : { role: "assistant", content: "Fixture complete" };
      res.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }], usage: { prompt_tokens: 80, completion_tokens: 10, total_tokens: 90 } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const start = () =>
      spawn(process.execPath, [resolve(root, "engine/bin.mjs")], {
        cwd: workspace,
        env: {
          ...process.env,
          BH_HOME: resolve(workspace, "home"),
          BH_PROVIDER: "gateway",
          BH_MODEL: "test-model",
          BH_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
          BH_API_KEY: "synthetic-test-key",
          BH_MEMORY_BINARY: resolve(root, "../../target/debug/brain-memory"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    let child = start();
    try {
      let rpc = connect(child);
      await rpc.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const session = await rpc.request("session/new", { cwd: workspace, mcpServers: [] });
      await rpc.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Fix sqlite. Do not publish." }],
      });
      await stop(child);
      await writeFile(resolve(workspace, "README.md"), "sqlite new-source-value\n");
      phase = 2;
      step = 0;
      child = start();
      rpc = connect(child);
      await rpc.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      await rpc.request("session/resume", {
        sessionId: session.sessionId,
        cwd: workspace,
        mcpServers: [],
      });
      await rpc.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Resume sqlite repair." }],
      });
      const restored = calls
        .find((call) => call.phase === 2)
        .body.messages.filter((message) =>
          JSON.stringify(message.content).includes("pinned_constraints"),
        );
      const context = JSON.stringify(restored);
      assert.ok(context.includes("validation remains pending"));
      assert.ok(context.includes("Do not publish."));
      assert.ok(context.includes("old-source-value"));
      assert.ok(context.includes("stale"));
      const last = JSON.stringify(calls.at(-1).body.messages);
      assert.ok(last.includes("unverified_claim"));
      assert.ok(last.includes("pinned instruction must quote an original user request"));
      assert.equal(calls.filter((call) => call.phase === 2).length, 3);
    } finally {
      await stop(child);
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
