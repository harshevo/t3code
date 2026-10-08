import * as ClientTracer from "./clientTracer";
export interface ClientTracingConfig {
  readonly exportIntervalMs?: number;
}
export function configureClientTracing(_config: ClientTracingConfig = {}): Promise<void> {
  ClientTracer.setDelegate(null);
  return Promise.resolve();
}
