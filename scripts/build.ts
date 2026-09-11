import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
async function run(cmd: string[]) {
  const p = Bun.spawn(cmd, { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error(`Build failed: ${cmd[0]}`);
}
const host = process.env.BUILD_TARGET === "host";
const build = join(root, "build", host ? "core-local" : "core-release");
const core = resolve(process.env.CORE_BINARY || join(build, "entity-core"));
if (!process.env.CORE_BINARY) {
  if (host) {
    await run([
      "cmake",
      "-S",
      "apps/backend/engine",
      "-B",
      build,
      "-DCMAKE_BUILD_TYPE=Release",
    ]);
    await run(["cmake", "--build", build, "-j4"]);
  } else
    await run([
      "docker",
      "buildx",
      "build",
      "--platform",
      "linux/amd64",
      "-f",
      "Dockerfile.build",
      "--output",
      `type=local,dest=${build}`,
      ".",
    ]);
}
if (!(await Bun.file(core).exists()))
  throw Error(`Missing native engine: ${core}`);
const frontend = join(root, "apps/frontend/dist");
await mkdir(frontend, { recursive: true });
await cp(join(root, "apps/frontend/public"), frontend, { recursive: true });
const ui = await Bun.build({
  entrypoints: [join(root, "apps/frontend/src/auth.ts")],
  outdir: frontend,
  target: "browser",
  minify: true,
});
if (!ui.success) throw new AggregateError(ui.logs, "Frontend build failed");
// Keep dependency notices available even when only the executable is deployed.
const noticePaths = [
  ...new Bun.Glob("**/*").scanSync({
    cwd: join(root, "vendor"),
    onlyFiles: true,
  }),
]
  .filter((name) => /(?:license|copying|notice)/i.test(name.split("/").at(-1)!))
  .sort();
const notices = [await Bun.file(join(root, "THIRD-PARTY.md")).text()];
for (const name of noticePaths)
  notices.push(
    `\n\n----- ${name} -----\n` +
      (await Bun.file(join(root, "vendor", name)).text()),
  );
await writeFile(join(frontend, "third-party.txt"), notices.join("\n"));
const files = (await readdir(frontend)).sort();
const imports = files.map(
  (name, i) =>
    `import a${i} from ${JSON.stringify(join(frontend, name))} with { type: 'file' };`,
);
imports.push(
  `import embeddedCore from ${JSON.stringify(core)} with { type: 'file' };`,
);
await writeFile(
  join(root, "apps/backend/src/assets.gen.ts"),
  "// @ts-nocheck -- generated assets\n" +
    imports.join("\n") +
    "\nexport const coreAsset = embeddedCore;\nexport const assets = new Map<string,string>([" +
    files.map((name, i) => `[${JSON.stringify("/" + name)},a${i}]`).join(",") +
    "]);\n",
);
const outfile = resolve(
  process.env.APP_BINARY || join(root, "apps/backend/dist/entity-library"),
);
await mkdir(resolve(outfile, ".."), { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, "apps/backend/src/server.ts")],
  target: "bun",
  minify: true,
  compile: { outfile, ...(host ? {} : { target: "bun-linux-x64" as const }) },
});
if (!result.success)
  throw new AggregateError(result.logs, "Application build failed");
const size = Bun.file(outfile).size;
if (size > 256 * 1024 * 1024)
  throw Error("Binary exceeds Nibrun’s 256 MiB limit");
console.log(`Built ${outfile} (${(size / 1048576).toFixed(1)} MiB)`);
