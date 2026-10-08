import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProfiles } from "../packages/llm/llm-pi-ai/lib/config.js";
import { catalogProviderIds } from "../packages/llm/llm-pi-ai/lib/catalog.js";
test("hosted DeepSeek endpoints cannot bypass provider filtering with a custom name or trailing DNS dot", () => {
  for (const baseURL of [
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com./v1",
    "https://deepseeksvc.com",
    "https://auth.deepseeksvc.com",
  ]) {
    assert.throws(
      () => resolveProfiles({ gateway: { baseURL } }),
      /excludes DeepSeek hosted providers/,
    );
  }
  assert.throws(() => resolveProfiles({ deepseek: {} }), /excludes DeepSeek hosted providers/);
  const openai = resolveProfiles({ openai: {} });
  assert.equal(openai.size, 1);
});
test("model discovery retains supported providers without advertising a DeepSeek route", () => {
  const ids = catalogProviderIds();
  assert.ok(ids.includes("openai"));
  assert.ok(ids.includes("openai-codex"));
  assert.ok(ids.includes("anthropic"));
  assert.ok(ids.every((id) => !id.toLowerCase().includes("deepseek")));
});

import { mapUsage } from "../packages/llm/llm-pi-ai/lib/stream.js";
test("omitted SDK usage defaults and invalid counters stay unavailable", () => {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  assert.equal(mapUsage(zero), undefined);
  assert.equal(mapUsage({ ...zero, input: -1 }), undefined);
  assert.deepEqual(mapUsage({ ...zero, input: 100, output: 20, totalTokens: 120 }), {
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
  });
});
