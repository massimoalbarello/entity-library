# Entity Library

A private Nibrun photo library with passkey sign-in, camera capture, suggested object labels,
and natural-language photo search. Built from the patterns in
[Face Library](https://github.com/massimoalbarello/face-library) and
[PDF Signer](https://github.com/massimoalbarello/pdf-signer).

The first model is **OpenCLIP ViT-B/32 LAION2B, Q4_0**, running on the CPU through `clip.cpp`.
The app embeds inference code and the frontend in one executable. On first startup it downloads
about **88 MiB** of pinned weights and tokenizer files, verifies their SHA-256 checksums, and
caches them in persistent storage. Subsequent starts reuse those files. Searches and photos
are processed on the instance; they are not sent to a model API.

## Use it

Create your owner passkey, add JPEG/PNG photos or use the camera, then search for things such
as “banana”, “cat”, or “a red car”. The app indexes the whole photo and four overlapping crops,
so a smaller object has a better chance of being found. It also suggests up to three labels.

Labels and search results are approximate. This version recognizes visual categories and
scenes; it does not identify a particular person's mug across photos, count objects, or produce
accurate object boundaries. The current label vocabulary is English; search accepts free text,
with best results expected in English. Maximums: 2,000 photos, 12 MiB per upload, 16 megapixels
for PNGs. JPEGs are decoded at reduced resolution when large. Originals are preserved.

## Build and run

Requires Bun **1.4.0**. For a local macOS build, install CMake and OpenCV first:

```sh
bun install --frozen-lockfile
bun run build:local
./apps/backend/dist/entity-library
```

Open `http://localhost:3000`. Passkeys and camera access require localhost or HTTPS.
Use `DATA_DIR` to choose a durable library directory; the default is `./data`.

For the Nibrun Linux executable:

```sh
bun run build
```

This uses Docker **only as a build tool** to compile the static Linux C++ engine from macOS
and then embeds it in a Bun executable. Docker is not required by the deployed app.
The output is `apps/backend/dist/entity-library` (Linux x86_64). A local build writes a host
executable to that same path, so rebuild for the desired target before using it.

Nibrun provides `NIBRUN_HTTP_PORT`, `NIBRUN_HOSTNAME`, and `NIBRUN_DATA_DIR`. Keep the complete
data directory across deployments and allocate **1 GB RAM** as specified for this app.
The `/health` endpoint responds while the model is downloading; signed-in users see download
progress and can retry a failed setup. Photo browsing and search become available once the
native engine has loaded. The first startup needs outbound HTTPS access to Hugging Face.

## Small reusable structure

| Location | Responsibility |
|---|---|
| `apps/backend/src/models/manifest.json` | Exact model identity, artifact URLs, hashes, sizes, dimensions and embedding-space version |
| `apps/backend/src/models/artifacts.ts` | Verified downloads, atomic installation and reuse of cached files |
| `apps/backend/src/models/encoder.ts` | CLIP text tokenization and the initial label vocabulary |
| `apps/backend/engine/src/model.h` | Native image/text encoder returning normalized vectors |
| `apps/backend/engine/src/search.h` | In-memory HNSW retrieval and aggregation of crop matches into photo results |
| `apps/backend/engine/src/main.cpp` | Durable photos, queued indexing and the private engine API |
| `apps/backend/src/server.ts` | Public HTTP, passkey authorization and model startup |
| `apps/frontend/` | Photo browser, search and camera flow |

There is one model per library in this version. Its embedding-space version is persisted with
the library, and incompatible versions fail closed. Adding another CLIP-family model should
reuse the artifact installer and photo/search pipeline; a new runtime only needs to implement
the encoder contract. Replacing a model for existing photos also requires an explicit reindex
migration. There is no hot-swap framework or destructive automatic migration.
See [architecture](docs/ARCHITECTURE.md) for that contract and upgrade path.

## Checks

```sh
bun run check
bun test
bun run test:browser  # host executable; Chrome/Chromium and ffmpeg required
bun run test:linux    # Linux executable in a disposable 1 CPU / 1 GiB container
```

Browser checks use a fresh localhost library, virtual passkeys and public test photos. They
exercise real inference, camera capture, protected originals, deletion and restart persistence.
Generated test data stays under ignored `build/`. The Linux check records cgroup peak memory.
See [validation](docs/VALIDATION.md) for measured results and limitations.

GitHub Actions runs the Linux build and checks on pull requests and main pushes. A successful
version-tag build packages the binary, checksum and notices as a release. The app is [deployed on Nibrun](https://entity-library-gf84pk.nibrun.app).
See [deployment status](docs/DEPLOYMENT.md), including the outstanding RAM allocation.
Source: [massimoalbarello/entity-library](https://github.com/massimoalbarello/entity-library).

MIT licensed. Third-party components retain their licenses; see [notices](THIRD-PARTY.md).
