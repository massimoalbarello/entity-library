import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import captionManifest from "../apps/backend/src/models/caption-manifest.json";
import manifest from "../apps/backend/src/models/manifest.json";
import { installArtifact } from "../apps/backend/src/models/artifacts.ts";
const root = resolve(import.meta.dir, "..");
await mkdir(join(root, "build"), { recursive: true });
const out = await mkdtemp(join(root, "build/browser-")),
  data = join(out, "data"),
  fixtures = join(out, "fixtures");
await mkdir(data);
await mkdir(fixtures);
const cache = resolve(
  process.env.MODEL_CACHE || join(root, "build/model-cache"),
);
for (const artifact of manifest.artifacts)
  await installArtifact(cache, artifact);
const captionCache = resolve(
  process.env.CAPTION_CACHE || join(root, "build/caption-cache"),
);
for (const artifact of captionManifest.artifacts)
  await installArtifact(captionCache, artifact);
await mkdir(join(data, "models"), { recursive: true });
await cp(captionCache, join(data, "models", captionManifest.id), {
  recursive: true,
});
if (process.env.TEST_COLD !== "1")
  await cp(cache, join(data, "models", manifest.id), { recursive: true });
for (const [name, url] of [
  [
    "banana.jpg",
    "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/banana.jpg",
  ],
  [
    "cats.png",
    "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/coco_sample.png",
  ],
]) {
  const download = Bun.spawn(
    [
      "curl",
      "-fsSL",
      "--max-time",
      "60",
      "--retry",
      "2",
      url!,
      "-o",
      join(fixtures, name!),
    ],
    { stdout: "ignore", stderr: "inherit" },
  );
  assert.equal(
    await download.exited,
    0,
    "Could not download public test fixture",
  );
}
// Reproduce the screen-person regression with the public COCO128 source photo.
const fixtureCache = join(root, "build/fixture-cache");
const cocoZip = await installArtifact(fixtureCache, {
  name: "coco128.zip",
  url: "https://github.com/ultralytics/assets/releases/download/v0.0.0/coco128.zip",
  bytes: 6983030,
  sha256: "61e5e3028863d8ffc3b81d6a514603954889f0edd5e4b44c4ce60b2da99aeb8e",
});
const extract = Bun.spawn(
  ["unzip", "-p", cocoZip, "coco128/images/train2017/000000000387.jpg"],
  { stdout: Bun.file(join(fixtures, "phone.jpg")), stderr: "inherit" },
);
assert.equal(await extract.exited, 0);
const video = join(out, "camera.y4m");
const ffmpeg = Bun.spawn(
  [
    "ffmpeg",
    "-loglevel",
    "error",
    "-i",
    join(fixtures, "banana.jpg"),
    "-vf",
    "scale=480:480,pad=640:480:80:0",
    "-pix_fmt",
    "yuv420p",
    "-frames:v",
    "1",
    video,
  ],
  { stdout: "inherit", stderr: "inherit" },
);
assert.equal(await ffmpeg.exited, 0);
function freePort() {
  const s = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const port = s.port;
  s.stop(true);
  return port;
}
const port = freePort(),
  corePort = freePort(),
  base = `http://localhost:${port}`;
const env = {
  ...process.env,
  DATA_DIR: data,
  PORT: String(port),
  ENTITY_CORE_PORT: String(corePort),
  BASE_URL: base,
  NIBRUN_HOSTNAME: "",
  NIBRUN_DATA_DIR: "",
  NIBRUN_HTTP_PORT: "",
};
const linux = process.env.TEST_LINUX === "1";
const container = `entity-test-${Date.now()}`;
let server: ReturnType<typeof Bun.spawn>;
const memoryPeaks: number[] = [];
const oomKills: number[] = [];
async function start() {
  const binary = resolve(
    process.env.APP_BINARY || join(root, "apps/backend/dist/entity-library"),
  );
  const cmd = linux
    ? [
        "docker",
        "run",
        "--rm",
        "--name",
        container,
        "--platform",
        "linux/amd64",
        "--memory",
        "1g",
        "--memory-swap",
        "1g",
        "--cpus",
        "1",
        "--read-only",
        "--tmpfs",
        "/tmp:size=16m",
        "-p",
        `127.0.0.1:${port}:3000`,
        "-v",
        `${binary}:/app/entity-library:ro`,
        "-v",
        `${data}:/data`,
        "-e",
        "DATA_DIR=/data",
        "-e",
        "PORT=3000",
        "-e",
        "ENTITY_CORE_PORT=3001",
        "-e",
        `BASE_URL=${base}`,
        "debian:bookworm-slim",
        "/app/entity-library",
      ]
    : [binary];
  server = Bun.spawn(cmd, {
    cwd: root,
    env,
    stdout: Bun.file(join(out, "server.log")),
    stderr: Bun.file(join(out, "server-error.log")),
  });
  await writeFile(join(out, "server.pid"), String(server.pid));
  for (let i = 0; i < 600; i++) {
    if (server.exitCode !== null)
      throw Error(`Server stopped; see ${out}/server-error.log`);
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw Error("Server did not listen");
}
async function stop() {
  if (linux) {
    const read = Bun.spawn(
      ["docker", "exec", container, "cat", "/sys/fs/cgroup/memory.peak"],
      { stdout: "pipe", stderr: "ignore" },
    );
    const bytes = Number(await new Response(read.stdout).text());
    if ((await read.exited) === 0 && bytes) memoryPeaks.push(bytes);
    const events = Bun.spawn(
      ["docker", "exec", container, "cat", "/sys/fs/cgroup/memory.events"],
      { stdout: "pipe", stderr: "ignore" },
    );
    const eventText = await new Response(events.stdout).text();
    if ((await events.exited) === 0)
      oomKills.push(Number(eventText.match(/^oom_kill (\d+)/m)?.[1] || 0));
    const p = Bun.spawn(["docker", "stop", "-t", "5", container], {
      stdout: "ignore",
      stderr: "inherit",
    });
    await p.exited;
  } else server?.kill("SIGTERM");
  await server?.exited;
}
console.log(`Disposable browser test: ${out}`);
await start();
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : Bun.which("google-chrome") || Bun.which("chromium") || undefined),
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${video}`,
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["camera"],
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const authenticator = (
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
).authenticatorId;
async function api(path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch(path, {
        method,
        headers: {
          "X-Requested-With": "EntityLibrary",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, method, body },
  );
}
let sawCaptioning = false;
async function ready() {
  for (let i = 0; i < 1800; i++) {
    const s = await api("/api/status");
    if (s.body.captioning && !sawCaptioning) {
      sawCaptioning = true;
      assert.equal((await api("/api/photos")).status, 200);
      assert.equal((await api("/api/search?q=phone")).status, 200);
      console.log("PASS browsing and scene search during caption inference");
    }
    if (s.body.model.phase === "failed") throw Error(s.body.model.error);
    if (
      s.body.model.phase === "ready" &&
      s.body.queued === 0 &&
      s.body.descriptions?.queued === 0
    )
      return s.body;
    await Bun.sleep(200);
  }
  throw Error("Inference did not finish");
}
async function add(name: string) {
  await page.evaluate(() => document.querySelector("#toast")?.remove());
  await page.locator("#files").setInputFiles(join(fixtures, name));
  await page.waitForFunction(() =>
    document.querySelector("#toast")?.textContent?.includes("added."),
  );
  await ready();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#model-notice")
        ?.textContent?.includes("Preparing"),
  );
}
try {
  assert.equal((await fetch(base + "/api/photos")).status, 401);
  assert.equal((await fetch(base + "/assets/originals/1")).status, 401);
  await page.goto(base);
  await page
    .getByRole("button", { name: "Create your passkey", exact: true })
    .waitFor();
  await page.screenshot({
    path: join(out, "signup-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create your passkey", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "All photos", exact: true })
    .waitFor();
  await ready();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#model-notice")
        ?.textContent?.includes("Preparing"),
  );
  assert.equal((await api("/api/owner")).body.ownerRegistered, true);
  console.log("PASS passkey registration and native model readiness");
  const outsider = await browser.newContext();
  const other = await outsider.newPage();
  await other.goto(base);
  await other
    .getByRole("button", { name: "Sign in with passkey", exact: true })
    .waitFor();
  assert.equal(
    (
      await other.request.get(
        base + "/api/auth/passkey/generate-register-options",
      )
    ).status(),
    403,
  );
  await outsider.close();
  assert.equal(
    (
      await fetch(base + "/api/auth/passkey/generate-register-options", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  await add("phone.jpg");
  const phone = (await api("/api/photos")).body.photos.find(
    (p: any) => p.filename === "phone.jpg",
  );
  assert.equal(
    phone.description.status,
    "ready",
    JSON.stringify(phone.description),
  );
  assert.match(phone.description.caption.toLowerCase(), /phone|laptop/);
  assert.ok(
    !(await api("/api/search?q=person")).body.photos.some(
      (p: any) => p.id === phone.id,
    ),
    JSON.stringify(phone.description),
  );
  assert.equal((await api("/api/search?q=phone")).body.photos[0]?.id, phone.id);
  console.log(
    "PASS phone-screen regression with real generated caption",
    phone.description.caption,
  );
  await page.locator(`.photo-card[data-id="${phone.id}"]`).click();
  await page.screenshot({
    path: join(out, "phone-description.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await api(`/api/photos/${phone.id}`, "DELETE");
  await add("banana.jpg");
  await add("cats.png");
  let rows = (await api("/api/photos")).body.photos;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((p: any) => p.status === "ready"));
  const banana = rows.find((p: any) => p.filename === "banana.jpg"),
    cats = rows.find((p: any) => p.filename === "cats.png");
  assert.deepEqual(
    await (
      await page.request.get(base + `/assets/originals/${banana.id}`)
    ).body(),
    await readFile(join(fixtures, "banana.jpg")),
  );
  for (const [q, id] of [["cat", cats.id]]) {
    const result = await api("/api/search?mode=visual&q=" + q);
    assert.equal(result.status, 200);
    assert.equal(
      result.body.photos[0]?.id,
      id,
      `${q} must retrieve the matching photo first`,
    );
    console.log(
      "PASS retrieval",
      q,
      result.body.photos.map((p: any) => ({
        file: p.filename,
        score: p.score,
        region: p.match.region,
      })),
    );
  }
  assert.equal(
    cats.description.status,
    "ready",
    JSON.stringify(cats.description),
  );
  assert.match(cats.description.caption.toLowerCase(), /cat/);
  for (const p of [phone, cats]) {
    assert.doesNotMatch(
      p.description.caption,
      /^(?:(?:a|the) (?:picture|photo|image) (?:of|shows)|in (?:this|the) (?:image|photo|picture))/i,
    );
    assert.equal("depicted" in p.description, false);
    assert.match(p.description.model_id, /:direct-v2$/);
  }
  const scenes = await api("/api/search?q=cat");
  assert.equal(scenes.body.photos[0]?.id, cats.id);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.locator(`.photo-card[data-id="${banana.id}"]`).click();
  await page
    .locator("#scene-caption")
    .fill("A small black phone rests on stacked silver laptops.");
  assert.equal(await page.locator("#description-form textarea").count(), 1);
  assert.equal(await page.locator("#search-mode option").count(), 2);
  await page
    .getByRole("button", { name: "Save description", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector("dialog"));
  assert.equal(
    (await api("/api/search?q=phone")).body.photos[0]?.id,
    banana.id,
  );
  assert.ok(
    !(await api("/api/search?q=person")).body.photos.some(
      (p: any) => p.id === banana.id,
    ),
  );
  assert.equal(
    (await api("/api/search?q=small%20black%20phone")).body.photos[0]?.id,
    banana.id,
  );
  console.log(
    "PASS real caption inference, BM25 adjective search and single description editor",
  );
  // This montage's weak banana match (~0.247) is intentionally filtered.
  const weak = await api("/api/search?mode=visual&q=banana");
  assert.equal(weak.status, 200);
  assert.deepEqual(weak.body.photos, []);
  await page.locator("#search-mode").selectOption("visual");
  await page.locator("#query").fill("banana");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#results-title")?.textContent ===
      "Results for “banana”",
  );
  assert.equal(await page.locator("#results-count").textContent(), "0 photos");
  assert.ok(await page.locator("#empty h2").isVisible());
  await page.locator("#query").fill("cat");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#results-title")?.textContent ===
      "Results for “cat”",
  );
  await page.screenshot({
    path: join(out, "search-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: join(out, "search-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await page.waitForFunction(
    () =>
      !(document.querySelector("#camera-capture") as HTMLButtonElement)
        ?.disabled,
  );
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector("#toast")?.textContent?.includes("added."),
  );
  await ready();
  rows = (await api("/api/photos")).body.photos;
  assert.equal(rows.length, 3);
  console.log("PASS camera capture and upload");
  const invalid = await page.request.post(
    base + "/api/photos?filename=broken.jpg",
    {
      headers: {
        "X-Requested-With": "EntityLibrary",
        "Content-Type": "image/jpeg",
      },
      data: Buffer.from("damaged"),
    },
  );
  assert.equal(invalid.status(), 201);
  const invalidId = (await invalid.json()).id;
  await ready();
  assert.equal((await api(`/api/photos/${invalidId}`)).body.status, "error");
  assert.equal((await api(`/api/photos/${invalidId}`, "DELETE")).status, 200);
  // Exercise the largest supported PNG decode and UTF-8 filename truncation.
  const large = join(fixtures, "large.png");
  const generate = Bun.spawn(
    [
      "ffmpeg",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=4000x4000",
      "-frames:v",
      "1",
      large,
    ],
    { stdout: "ignore", stderr: "inherit" },
  );
  assert.equal(await generate.exited, 0);
  const longName = "a" + "📷".repeat(70) + ".png";
  const upload = await page.request.post(
    base + "/api/photos?filename=" + encodeURIComponent(longName),
    {
      headers: {
        "X-Requested-With": "EntityLibrary",
        "Content-Type": "image/png",
      },
      data: await readFile(large),
    },
  );
  assert.equal(upload.status(), 201);
  const largeId = (await upload.json()).id;
  await ready();
  const largePhoto = (await api(`/api/photos/${largeId}`)).body;
  assert.equal(largePhoto.status, "ready");
  assert.ok(largePhoto.width <= 1536);
  assert.ok(!largePhoto.filename.includes("�"));
  await api(`/api/photos/${largeId}`, "DELETE");
  console.log("PASS 16-megapixel PNG and long Unicode filename");
  const before = (await api("/api/photos")).body.photos;
  await stop();
  await start();
  await ready();
  assert.deepEqual((await api("/api/photos")).body.photos, before);
  assert.equal(
    (await api("/api/search?mode=visual&q=cat")).body.photos[0].id,
    cats.id,
  );
  console.log(
    "PASS originals, embeddings, passkey session and retrieval survive restart",
  );
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.locator(`.photo-card[data-id="${cats.id}"]`).click();
  await page.locator("#delete-photo").click();
  await page.locator("#confirm-delete").click();
  await page.waitForFunction(() => !document.querySelector("dialog"));
  assert.equal(
    (await api("/api/photos")).body.photos.some((p: any) => p.id === cats.id),
    false,
  );
  assert.equal(
    (await api("/api/search?mode=visual&q=cat")).body.photos.some(
      (p: any) => p.id === cats.id,
    ),
    false,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in with passkey", exact: true })
    .waitFor();
  assert.equal((await api("/api/photos")).status, 401);
  await page
    .getByRole("button", { name: "Sign in with passkey", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "All photos", exact: true })
    .waitFor();
  assert.equal((await api("/api/photos")).body.photos.length, 2);
  assert.ok(sawCaptioning, "real caption worker was exercised");
  assert.deepEqual(errors, []);
  console.log(
    "PASS delete, sign out, returning passkey, desktop and mobile browser checks",
  );
  await writeFile(
    join(out, "result.json"),
    JSON.stringify(
      { passed: true, photos: 2, errors, model: manifest.id },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await stop();
  if (memoryPeaks.length) {
    const peak = Math.max(...memoryPeaks);
    assert.equal(
      oomKills.reduce((a, b) => a + b, 0),
      0,
      "Linux workload must not invoke the OOM killer",
    );
    await writeFile(
      join(out, "memory.json"),
      JSON.stringify(
        {
          oomKills: oomKills.reduce((a, b) => a + b, 0),
          peakBytes: peak,
          peakMiB: peak / 1048576,
          limitMiB: 1024,
          cpus: 1,
          platform: "Linux amd64",
          note:
            process.platform === "darwin"
              ? "Docker Desktop CPU emulation on macOS"
              : "native Linux",
        },
        null,
        2,
      ),
    );
    console.log(
      `Linux cgroup peak: ${(peak / 1048576).toFixed(1)} MiB / 1024 MiB`,
    );
    assert.ok(peak < 1024 * 1024 * 1024);
  }
}
