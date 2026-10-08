import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as References from "effect/References";
import * as ServerConfig from "./config.ts";

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return Layer.mergeAll(
      Layer.succeed(References.MinimumLogLevel, config.logLevel),
      Logger.layer([Logger.consolePretty(), Logger.tracerLogger], { mergeWithExisting: false }),
    );
  }),
);
