import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installArtifact } from "../src/models/artifacts.ts";
const directory = await mkdtemp(join(tmpdir(), "entity-artifacts-"));
const bytes = new TextEncoder().encode("a pinned model");
let hits = 0;
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    hits++;
    return new Response(
      new URL(request.url).pathname === "/bad" ? "a broken model" : bytes,
    );
  },
});
const artifact = {
  name: "model.gguf",
  url: `http://127.0.0.1:${server.port}/good`,
  bytes: bytes.length,
  sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
};
afterAll(async () => {
  server.stop(true);
  await rm(directory, { recursive: true, force: true });
});
describe("verified first-start model download", () => {
  test("installs once, reuses a verified cache, and repairs corruption", async () => {
    const path = await installArtifact(directory, artifact);
    expect(await Bun.file(path).bytes()).toEqual(bytes);
    const count = hits;
    await installArtifact(directory, artifact);
    expect(hits).toBe(count);
    await Bun.write(path, "bad cached data");
    await installArtifact(directory, artifact);
    expect(await Bun.file(path).bytes()).toEqual(bytes);
  });
  test("rejects a bad replacement without damaging the installed model", async () => {
    await expect(
      installArtifact(directory, {
        ...artifact,
        url: `http://127.0.0.1:${server.port}/bad`,
        sha256: "a".repeat(64),
      }),
    ).rejects.toThrow("checksum");
    expect(await Bun.file(join(directory, artifact.name)).bytes()).toEqual(
      bytes,
    );
    expect(
      (await readdir(directory)).filter((n) => n.endsWith(".part")),
    ).toEqual([]);
  });
  test("rejects path traversal", async () => {
    await expect(
      installArtifact(directory, { ...artifact, name: "../model" }),
    ).rejects.toThrow("Invalid model manifest");
  });
});
