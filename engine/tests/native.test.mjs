import { test } from "node:test";
import assert from "node:assert/strict";
import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tryLockExclusive } from "../native/system/packages/entry/lib/flock.js";
test("provider credential writer lock excludes another writer and releases on close", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brainharness-lock-"));
  const first = await open(join(directory, "credentials.lock"), "a", 0o600);
  const second = await open(join(directory, "credentials.lock"), "a", 0o600);
  try {
    await tryLockExclusive(first.fd);
    await assert.rejects(tryLockExclusive(second.fd), (error) =>
      ["EAGAIN", "EWOULDBLOCK"].includes(error.code),
    );
    await first.close();
    await tryLockExclusive(second.fd);
  } finally {
    await first.close();
    await second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
