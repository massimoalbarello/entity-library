import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { installArtifact } from "../apps/backend/src/models/artifacts.ts";
const root = resolve(import.meta.dir, "..");
export const captionRevision = "8172e6577ac2b35de1ec1e5d1c0aaad6c4a2129f";
export async function buildCaption() {
  const deps = join(root, "build", "caption-deps");
  const source = join(deps, `llama.cpp-${captionRevision}`);
  const build = join(root, "build", "caption-local");
  await mkdir(deps, { recursive: true });
  const archive = await installArtifact(deps, {
    name: "llama.tar.gz",
    url: `https://codeload.github.com/ggml-org/llama.cpp/tar.gz/${captionRevision}`,
    sha256: "c5c6b91e02e6d15af2a5481c3ebadb964f6bcade95b4eec9467a511f6c43b23a",
    bytes: 37390429,
  });
  async function run(args: string[]) {
    const p = Bun.spawn(args, {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await p.exited) throw Error("Caption runtime build failed");
  }
  if (!(await Bun.file(join(source, "CMakeLists.txt")).exists()))
    await run(["tar", "-xzf", archive, "-C", deps]);
  await run([
    "cmake",
    "-S",
    source,
    "-B",
    build,
    "-DCMAKE_BUILD_TYPE=Release",
    "-DBUILD_SHARED_LIBS=OFF",
    "-DGGML_METAL=OFF",
    "-DGGML_BLAS=OFF",
    "-DGGML_NATIVE=OFF",
    "-DLLAMA_CURL=OFF",
    "-DLLAMA_BUILD_TESTS=OFF",
    "-DLLAMA_BUILD_EXAMPLES=OFF",
    "-DLLAMA_BUILD_SERVER=OFF",
  ]);
  await run(["cmake", "--build", build, "--target", "llama-mtmd-cli", "-j4"]);
  return join(build, "bin", "llama-mtmd-cli");
}
