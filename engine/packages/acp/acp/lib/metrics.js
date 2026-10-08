import { expandAssistantStream, isTokenDelta } from "@deepseek-ai/dsh-llm";
export class MetricsAccumulator {
  turn = -1;
  stepStartedAt;
  turnStartedAt = 0;
  toolUses = 0;
  value;
  observe(event) {
    if (event.type === "turn/start") {
      this.turn = event.data.turn;
      this.turnStartedAt = event.time;
      this.value = undefined;
      this.toolUses = 0;
    } else if (event.type === "step/start") {
      this.stepStartedAt = event.time;
    } else if (event.type === "tool/call") {
      this.toolUses++;
      if (this.value) this.value.toolUses = this.toolUses;
    }
  }
  accept(event) {
    const usage = event.data.usage;
    if (this.turn !== event.data.turn) {
      this.turn = event.data.turn;
      this.value = undefined;
      this.turnStartedAt = event.time;
    }
    const chunks = expandAssistantStream(event.data.stream);
    const first = chunks.find(({ chunk }) => isTokenDelta(chunk))?.time;
    const last = chunks.at(-1)?.time;
    const prev = this.value;
    const sumKnown = (key, next) =>
      next === undefined || (prev !== undefined && prev[key] === undefined)
        ? undefined
        : (prev?.[key] ?? 0) + next;
    const cachedInputTokens = sumKnown("cachedInputTokens", usage?.cacheReadTokens);
    const cacheCreationTokens = sumKnown("cacheCreationTokens", usage?.cacheWriteTokens);
    const reasoningOutputTokens = sumKnown("reasoningOutputTokens", usage?.reasoningTokens);
    this.value = {
      contextEstimated: true,
      inputTokens:
        usage === undefined || (prev !== undefined && prev.inputTokens === undefined)
          ? undefined
          : (prev?.inputTokens ?? 0) +
            usage.inputTokens +
            (usage.cacheReadTokens ?? 0) +
            (usage.cacheWriteTokens ?? 0),
      outputTokens:
        usage === undefined || (prev !== undefined && prev.outputTokens === undefined)
          ? undefined
          : (prev?.outputTokens ?? 0) + usage.outputTokens,
      ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
      ...(cacheCreationTokens === undefined ? {} : { cacheCreationTokens }),
      ...(reasoningOutputTokens === undefined ? {} : { reasoningOutputTokens }),
      decodeDurationMs:
        (prev?.decodeDurationMs ?? 0) +
        (first === undefined || last === undefined ? 0 : Math.max(0, last - first)),
      modelCallCount: (prev?.modelCallCount ?? 0) + 1,
      toolUses: this.toolUses,
      ...(prev?.ttftMs !== undefined
        ? { ttftMs: prev.ttftMs }
        : first !== undefined && this.stepStartedAt !== undefined
          ? { ttftMs: Math.max(0, first - this.stepStartedAt) }
          : {}),
      durationMs: Math.max(0, event.time - this.turnStartedAt),
    };
    return this.value;
  }
}
