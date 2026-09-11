import { SQL } from "bun";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createAuth } from "./better-auth.ts";
import {
  OWNER_USER_ID,
  ownerRegistrationStatus,
} from "./owner-registration.ts";
import schema from "./schema.sql" with { type: "text" };
import { assets, coreAsset } from "./assets.gen.ts";
import { installArtifact, fileDigest } from "./models/artifacts.ts";
import { loadTextEncoder } from "./models/encoder.ts";
import manifest from "./models/manifest.json";
process.umask(0o077);
const data = resolve(
  process.env.NIBRUN_DATA_DIR || process.env.DATA_DIR || "./data",
);
await mkdir(data, { recursive: true });
const port = Number(process.env.NIBRUN_HTTP_PORT || process.env.PORT || 3000);
const baseUrl = new URL(
  process.env.NIBRUN_HOSTNAME
    ? `https://${process.env.NIBRUN_HOSTNAME}`
    : process.env.BASE_URL || `http://localhost:${port}`,
);
const secretPath = join(data, ".better-auth-secret");
try {
  await writeFile(secretPath, randomBytes(32).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
}
const secret = (await readFile(secretPath, "utf8")).trim();
if (secret.length < 32) throw Error("Invalid stored authentication secret");
const database = new SQL({
  adapter: "sqlite",
  filename: join(data, "auth.sqlite"),
});
await database.unsafe(
  "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
);
await database.unsafe(schema);
const auth = createAuth({ database, baseUrl, secret });
async function ownerState() {
  const [row] =
    await database`SELECT EXISTS(SELECT 1 FROM auth_user WHERE id=${OWNER_USER_ID}) owner, EXISTS(SELECT 1 FROM auth_passkey WHERE userId=${OWNER_USER_ID}) passkey`;
  return ownerRegistrationStatus({
    ownerExists: Boolean(row.owner),
    passkeyExists: Boolean(row.passkey),
  });
}
await ownerState();
let stopping = false,
  core: ReturnType<typeof Bun.spawn> | undefined,
  textEncoder: Awaited<ReturnType<typeof loadTextEncoder>> | undefined;
let booting = false,
  coreReady = false;
const modelState = {
  phase: "preparing",
  downloaded: 0,
  total: manifest.artifacts.reduce((n, a) => n + a.bytes, 0),
  error: "",
};
const coreToken = randomBytes(32).toString("hex");
const corePort = Number(process.env.ENTITY_CORE_PORT || port + 1);
const coreOrigin = `http://127.0.0.1:${corePort}`;
const coreHeaders = {
  Authorization: `Bearer ${coreToken}`,
  "X-Requested-With": "EntityLibrary",
};
async function boot() {
  if (booting || coreReady) return;
  booting = true;
  modelState.phase = "downloading";
  modelState.error = "";
  try {
    const modelDirectory = join(data, "models", manifest.id);
    let completed = 0;
    for (const artifact of manifest.artifacts) {
      await installArtifact(modelDirectory, artifact, (bytes) => {
        modelState.downloaded = completed + bytes;
      });
      completed += artifact.bytes;
    }
    modelState.phase = "loading";
    textEncoder = await loadTextEncoder(modelDirectory);
    const runtime = join(data, "runtime");
    await mkdir(runtime, { recursive: true });
    await writeFile(
      join(runtime, "labels.json"),
      JSON.stringify(textEncoder.labelTokens),
    );
    const bytes = await Bun.file(coreAsset).bytes();
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const corePath = join(runtime, `entity-core-${hash.slice(0, 16)}`);
    if (
      !(await Bun.file(corePath).exists()) ||
      (await fileDigest(corePath)) !== hash
    ) {
      await writeFile(`${corePath}.tmp`, bytes, { mode: 0o700 });
      await rename(`${corePath}.tmp`, corePath);
    }
    await chmod(corePath, 0o700);
    core = Bun.spawn([corePath], {
      env: {
        ...process.env,
        NIBRUN_DATA_DIR: data,
        ENTITY_CORE_PORT: String(corePort),
        ENTITY_CORE_TOKEN: coreToken,
        MODEL_FILE: join(modelDirectory, "model.gguf"),
        LABELS_FILE: join(runtime, "labels.json"),
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    const running = core;
    running.exited.then((code) => {
      if (!stopping && core === running) {
        coreReady = false;
        modelState.phase = "failed";
        modelState.error = `Photo engine stopped (${code}). Retry to restart it.`;
      }
    });
    for (let i = 0; i < 180; i++) {
      if (running.exitCode !== null)
        throw Error(`Photo engine stopped (${running.exitCode})`);
      try {
        const r = await fetch(`${coreOrigin}/health`, {
          headers: coreHeaders,
          signal: AbortSignal.timeout(1000),
        });
        if (r.ok) {
          coreReady = true;
          modelState.phase = "ready";
          break;
        }
      } catch {}
      await Bun.sleep(500);
    }
    if (!coreReady) {
      core.kill();
      throw Error("Photo engine did not start");
    }
  } catch (e) {
    modelState.phase = "failed";
    modelState.error = e instanceof Error ? e.message : "Model setup failed";
  } finally {
    booting = false;
  }
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}
function secure(r: Response) {
  r.headers.set("Cache-Control", "no-store");
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "same-origin");
  r.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  r.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), publickey-credentials-create=(self), publickey-credentials-get=(self)",
  );
  return r;
}
async function handle(request: Request) {
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method === "OPTIONS")
    return json({ error: "Cross-origin requests are disabled" }, 403);
  if (request.method === "GET" || request.method === "HEAD") {
    const file = assets.get(path === "/" ? "/index.html" : path);
    if (file) return new Response(Bun.file(file));
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== baseUrl.origin)
    return json({ error: "Cross-origin requests are disabled" }, 403);
  if (path === "/health") return json({ ok: true });
  if (path === "/api/owner" && request.method === "GET")
    return json(await ownerState());
  if (path.startsWith("/api/auth/")) {
    if (path === "/api/auth/passkey/delete-passkey")
      return json({ error: "Passkey removal is not enabled" }, 403);
    return auth.handler(request);
  }
  if (!path.startsWith("/api/") && !path.startsWith("/assets/"))
    return json({ error: "Not found" }, 404);
  const session = await auth.getSession(request.headers);
  if (!session || session.user.id !== OWNER_USER_ID)
    return json({ error: "Sign in with your passkey to continue." }, 401);
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("X-Requested-With") !== "EntityLibrary"
  )
    return json({ error: "Missing request header" }, 403);
  if (path === "/api/model/retry" && request.method === "POST") {
    void boot();
    return json({ ok: true });
  }
  if (path === "/api/status" && !coreReady)
    return json({
      model: modelState,
      photos: 0,
      ready: 0,
      queued: 0,
      failed: 0,
    });
  if (!coreReady)
    return json(
      {
        error:
          modelState.error ||
          "The search model is preparing. Please try shortly.",
      },
      503,
    );
  if (path === "/api/search" && request.method === "GET") {
    try {
      const tokens = textEncoder!.encode(url.searchParams.get("q") || "");
      return fetch(`${coreOrigin}/api/search`, {
        method: "POST",
        headers: { ...coreHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, space: manifest.space }),
        signal: request.signal,
      });
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Search failed" },
        400,
      );
    }
  }
  const headers = new Headers(coreHeaders);
  for (const name of ["Content-Type", "Content-Length", "Range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const r = await fetch(`${coreOrigin}${path}${url.search}`, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    signal: request.signal,
    redirect: "error",
  });
  return new Response(r.body, { status: r.status, headers: r.headers });
}
const server = Bun.serve({
  hostname: "0.0.0.0",
  port,
  maxRequestBodySize: 12 * 1024 * 1024,
  idleTimeout: 120,
  async fetch(request) {
    try {
      return secure(await handle(request));
    } catch (e) {
      console.error(e);
      return secure(
        json({ error: "The request failed. Please try again." }, 500),
      );
    }
  },
});
void boot();
console.log(`Entity Library: ${baseUrl.origin}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
    server.stop(true);
    core?.kill();
    database.close();
    process.exit(0);
  });
