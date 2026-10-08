import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, dirname, basename, join, sep } from "node:path";
async function resolveAncestors(path) {
  let ancestor = resolve(path);
  const suffix = [];
  for (;;) {
    try {
      return resolve(await realpath(ancestor), ...suffix.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.push(basename(ancestor));
      ancestor = parent;
    }
  }
}
export async function resolveDataHome(input, protectedHome = join(homedir(), ".t3")) {
  const [home, liveHome] = await Promise.all([
    resolveAncestors(input),
    resolveAncestors(protectedHome),
  ]);
  if (home === liveHome || home.startsWith(liveHome + sep))
    throw new Error("Use a separate BrainHarness home; ~/.t3 contains live data");
  return home;
}
