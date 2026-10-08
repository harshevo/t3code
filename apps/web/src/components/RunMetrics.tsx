import type { OrchestrationV2ProviderTurn } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const integer = new Intl.NumberFormat("en-US");
export function deriveRunMetrics(turn: OrchestrationV2ProviderTurn | undefined) {
  const reported = turn?.turnTokenUsage;
  const live = turn?.tokenUsage;
  const input = reported?.inputTokens ?? live?.inputTokens;
  const output = reported?.outputTokens ?? live?.outputTokens;
  const cached = reported?.cachedInputTokens ?? live?.cachedInputTokens;
  const write = reported?.cacheCreationTokens ?? live?.cacheCreationTokens;
  const reasoning = reported?.reasoningTokens ?? live?.reasoningOutputTokens;
  const elapsed =
    turn?.startedAt && turn.completedAt
      ? Math.max(
          0,
          DateTime.toEpochMillis(turn.completedAt) - DateTime.toEpochMillis(turn.startedAt),
        )
      : live?.durationMs;
  const decode = live?.decodeDurationMs;
  return {
    input,
    output,
    cached,
    write,
    reasoning,
    elapsed,
    cachePercent:
      input !== undefined && input > 0 && cached !== undefined && cached <= input
        ? (cached / input) * 100
        : undefined,
    tokensPerSecond:
      output !== undefined && decode !== undefined && decode > 0
        ? output / (decode / 1000)
        : undefined,
    averageTokensPerSecond:
      output !== undefined && elapsed !== undefined && elapsed > 0
        ? output / (elapsed / 1000)
        : undefined,
    ttft: live?.ttftMs,
    calls: live?.modelCallCount,
    tools: live?.toolUses,
    context: live?.usedTokens,
    contextEstimated: live?.contextEstimated,
    capacity: live?.maxTokens,
    hasSubagents: reported?.hasSubagents,
    cost: live?.cost,
    status: turn?.status,
    total: input !== undefined && output !== undefined ? input + output : undefined,
  };
}
const count = (value: number | undefined | null) => (value == null ? "—" : integer.format(value));
const seconds = (value: number | undefined) =>
  value === undefined ? "—" : `${(value / 1000).toFixed(2)} s`;
export function RunMetrics({ turn }: { turn: OrchestrationV2ProviderTurn | undefined }) {
  if (!turn) return null;
  const m = deriveRunMetrics(turn);
  const speed = m.tokensPerSecond ?? m.averageTokensPerSecond;
  return (
    <details className="mx-3 mb-2 text-[11px] text-muted-foreground" aria-label="Run metrics">
      <summary className="cursor-pointer select-none flex flex-wrap gap-x-4 gap-y-1 py-1">
        <span
          title={
            m.tokensPerSecond === undefined
              ? "Average over the whole turn including tools"
              : "Provider output tokens divided by measured streaming time, including reasoning"
          }
        >
          {speed === undefined ? "—" : speed.toFixed(1)} tok/s{" "}
          {m.tokensPerSecond === undefined ? "(turn avg)" : "(stream)"}
        </span>
        <span>
          Cache {m.cachePercent === undefined ? "—" : `${m.cachePercent.toFixed(1)}%`} ·{" "}
          {count(m.cached)} / {count(m.input)} input
        </span>
        <span>Output {count(m.output)}</span>
        <span>{seconds(m.elapsed)}</span>
      </summary>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1 py-2">
        {[
          ["Run status", m.status ?? "—"],
          ["Total reported tokens", count(m.total)],
          ["Input tokens (includes cache)", count(m.input)],
          ["Output tokens (includes reasoning)", count(m.output)],
          ["Cache read tokens", count(m.cached)],
          ["Cache creation tokens", count(m.write)],
          ["Reasoning tokens", count(m.reasoning)],
          [
            m.contextEstimated ? "Context estimate / capacity" : "Context tokens / capacity",
            `${count(m.context)} / ${count(m.capacity)}`,
          ],
          ["First token latency", seconds(m.ttft)],
          ["Model calls", count(m.calls)],
          ["Tool calls", count(m.tools)],
          [
            "Turn average output tok/s",
            m.averageTokensPerSecond === undefined ? "—" : m.averageTokensPerSecond.toFixed(1),
          ],
          [
            "Provider-reported cost",
            m.cost ? `${m.cost.amount} ${m.cost.currency}` : "Unavailable",
          ],
          ["Elapsed", seconds(m.elapsed)],
          ["Usage scope", `Reported main agent${m.hasSubagents ? "; child usage excluded" : ""}`],
        ].map(([label, value]) => (
          <div className="contents" key={label}>
            <dt>{label}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
