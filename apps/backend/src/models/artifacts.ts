import { mkdir, rename, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
export type Artifact = {
  name: string;
  url: string;
  sha256: string;
  bytes: number;
};
export async function fileDigest(path: string) {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}
export async function installArtifact(
  directory: string,
  artifact: Artifact,
  progress: (bytes: number) => void = () => {},
) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(artifact.name) ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes < 1 ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  )
    throw Error("Invalid model manifest");
  await mkdir(directory, { recursive: true });
  const destination = join(directory, artifact.name);
  if (
    (await Bun.file(destination).exists()) &&
    Bun.file(destination).size === artifact.bytes &&
    (await fileDigest(destination)) === artifact.sha256
  ) {
    progress(artifact.bytes);
    return destination;
  }
  const disk = await statfs(directory);
  if (disk.bavail * disk.bsize < artifact.bytes + 64 * 1024 * 1024)
    throw Error("Not enough disk space to install the model");
  const response = await fetch(artifact.url, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok || !response.body)
    throw Error(`Model download returned HTTP ${response.status}`);
  const temporary = `${destination}.part`;
  const writer = Bun.file(temporary).writer();
  const hash = new Bun.CryptoHasher("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > artifact.bytes)
        throw Error("Model download exceeded its pinned size");
      hash.update(chunk);
      writer.write(chunk);
      await writer.flush();
      progress(bytes);
    }
    await writer.end();
    if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256)
      throw Error("Model checksum verification failed");
    await rename(temporary, destination);
    return destination;
  } catch (error) {
    try {
      await writer.end();
    } catch {}
    await rm(temporary, { force: true });
    throw error;
  }
}
