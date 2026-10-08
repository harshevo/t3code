import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationV2ProviderTurn } from "@t3tools/contracts";
import { deriveRunMetrics } from "./RunMetrics";
function turn(usage: object): OrchestrationV2ProviderTurn {
  return { tokenUsage: usage } as OrchestrationV2ProviderTurn;
}
describe("run metric accounting", () => {
  it("uses inclusive input totals and measured stream timing", () => {
    const metrics = deriveRunMetrics(
      turn({
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheCreationTokens: 10,
        outputTokens: 20,
        decodeDurationMs: 500,
        durationMs: 2000,
      }),
    );
    expect(metrics.cachePercent).toBe(40);
    expect(metrics.tokensPerSecond).toBe(40);
    expect(metrics.averageTokensPerSecond).toBe(10);
    expect(metrics.write).toBe(10);
  });
  it("keeps unavailable and zero-denominator metrics unavailable", () => {
    expect(deriveRunMetrics(undefined).input).toBeUndefined();
    expect(
      deriveRunMetrics(
        turn({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 10, decodeDurationMs: 0 }),
      ).tokensPerSecond,
    ).toBeUndefined();
    expect(
      deriveRunMetrics(turn({ inputTokens: 100, cachedInputTokens: 120 })).cachePercent,
    ).toBeUndefined();
    expect(deriveRunMetrics(turn({ inputTokens: 100 })).cached).toBeUndefined();
  });
});
