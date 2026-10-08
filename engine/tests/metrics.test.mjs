import { test } from "node:test";
import assert from "node:assert/strict";
import { MetricsAccumulator } from "../packages/acp/acp/lib/metrics.js";
function message(turn, usage, time = 1100) {
  return {
    type: "assistant/message",
    time,
    data: {
      turn,
      usage,
      stream: [
        { type: "chunk", time: 1000, chunk: { type: "text-delta", index: 0, text: "a" } },
        { type: "chunk", time: 1050, chunk: { type: "text-delta", index: 0, text: "b" } },
      ],
    },
  };
}
test("one unreported call makes aggregate tokens unavailable and preserves actual call/tool counts", () => {
  const metrics = new MetricsAccumulator();
  metrics.observe({ type: "turn/start", time: 100, data: { turn: 1 } });
  metrics.observe({ type: "step/start", time: 900, data: {} });
  metrics.observe({ type: "tool/call", time: 950, data: {} });
  const initial = metrics.accept(message(1, undefined));
  assert.equal(initial.inputTokens, undefined);
  assert.equal(initial.toolUses, 1);
  const reported = metrics.accept(
    message(1, { inputTokens: 60, outputTokens: 20, cacheReadTokens: 40, cacheWriteTokens: 5 }),
  );
  assert.equal(reported.inputTokens, undefined);
  assert.equal(reported.outputTokens, undefined);
  assert.equal(reported.modelCallCount, 2);
  assert.equal(reported.ttftMs, 100);
});
test("a new turn resets unknown counters and normalizes disjoint cache buckets once", () => {
  const metrics = new MetricsAccumulator();
  metrics.observe({ type: "turn/start", time: 100, data: { turn: 1 } });
  metrics.accept(message(1, undefined));
  metrics.observe({ type: "turn/start", time: 200, data: { turn: 2 } });
  metrics.observe({ type: "step/start", time: 900, data: {} });
  const first = metrics.accept(
    message(2, { inputTokens: 60, outputTokens: 20, cacheReadTokens: 40, cacheWriteTokens: 5 }),
  );
  assert.equal(first.inputTokens, 105);
  assert.equal(first.contextEstimated, true);
  assert.equal(first.cachedInputTokens, 40);
  assert.equal(first.decodeDurationMs, 50);
  const second = metrics.accept(
    message(2, { inputTokens: 20, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 0 }),
  );
  assert.equal(second.inputTokens, 130);
  assert.equal(second.outputTokens, 30);
  assert.equal(second.cacheCreationTokens, 5);
  assert.equal(second.cachedInputTokens, 45);
  assert.equal(second.decodeDurationMs, 100);
});
