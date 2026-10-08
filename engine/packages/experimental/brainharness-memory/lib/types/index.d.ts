import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
export declare const name = "brainharness-memory";
export declare const inject: string[];
export interface Config {
  binary: string;
  database: string;
  timeoutMs: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
