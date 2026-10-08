import { expect, test, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import * as AnalyticsService from "./AnalyticsService.ts";

test("analytics stays inert even when inherited configuration enables uploads", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected network access"));
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const analytics = yield* AnalyticsService.AnalyticsService;
        for (let i = 0; i < 30; i++)
          yield* analytics.record("test.event", { secret: "do-not-collect" });
        yield* analytics.flush;
      }).pipe(
        Effect.provide(AnalyticsService.layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            T3CODE_TELEMETRY_ENABLED: true,
            T3CODE_POSTHOG_HOST: "https://example.invalid",
          }),
        ),
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
