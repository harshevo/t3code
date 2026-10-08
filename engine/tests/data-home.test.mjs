import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataHome } from "../../apps/brainharness/data-home.mjs";
test("GUI launcher rejects symlinks and nonexistent child paths into the protected data store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainharness-home-"));
  try {
    const protectedHome = join(dir, "live");
    await mkdir(protectedHome);
    const alias = join(dir, "alias");
    await symlink(protectedHome, alias);
    await assert.rejects(resolveDataHome(alias, protectedHome), /contains live data/);
    await assert.rejects(
      resolveDataHome(join(alias, "not-yet-created"), protectedHome),
      /contains live data/,
    );
    assert.equal(
      await resolveDataHome(join(dir, "isolated", "nested"), protectedHome),
      join(await realpath(dir), "isolated", "nested"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
