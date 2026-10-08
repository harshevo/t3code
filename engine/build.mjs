import ts from "typescript";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const packages = JSON.parse(await readFile(resolve(root, "vendor-list.json"), "utf8"));
async function compile(directory, base, out) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) {
      await compile(path, base, out);
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(item.name) || item.name.endsWith(".d.ts")) continue;
    const target = resolve(out, relative(base, path).replace(/\.tsx?$/, ".js"));
    const result = ts.transpileModule(await readFile(path, "utf8"), {
      fileName: path,
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: true,
        jsx: ts.JsxEmit.ReactJSX,
        sourceMap: false,
      },
      reportDiagnostics: true,
    });
    const errors =
      result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: (f) => f,
          getNewLine: () => "\n",
        }),
      );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result.outputText);
  }
}
const selected = new Set(process.argv.slice(2));
for (const [name, entry] of Object.entries(packages.packages)) {
  if (selected.size && !selected.has(name)) continue;
  const dir = resolve(root, typeof entry === "string" ? entry : entry.path);
  try {
    await access(resolve(dir, "src"));
  } catch {
    continue;
  }
  await compile(resolve(dir, "src"), resolve(dir, "src"), resolve(dir, "lib"));
  const manifest = JSON.parse(await readFile(resolve(dir, "package.json"), "utf8"));
  if (manifest.main) await access(resolve(dir, manifest.main));
}
if (!selected.size) {
  const native = spawnSync(process.execPath, [resolve(root, "native/system/scripts/build.ts")], {
    stdio: "inherit",
  });
  if (native.error) throw native.error;
  if (native.status !== 0) throw new Error("BrainHarness native lock/sandbox build failed");
}
console.log("BrainHarness engine compiled");
