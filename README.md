# Entity Library

A private Nibrun photo library with passkey sign-in, camera capture, short scene descriptions,
and photo search. Built from the patterns in [Face Library](https://github.com/massimoalbarello/face-library)
and [PDF Signer](https://github.com/massimoalbarello/pdf-signer).

**SmolVLM-500M-Instruct Q4_K_M** writes a short caption for each photo. Every search combines
those captions through SQLite FTS5/BM25 with visual similarity from **OpenCLIP ViT-B/32 LAION2B Q4_0**
in one ranked list, with no mode selector.

The frontend and native inference runtimes are embedded in one executable. Model files are
downloaded once (about **481 MiB** total), checked against pinned SHA-256 hashes and cached
in persistent storage. Photos and inference stay on the instance; no external model API is used.

## Use it

Create your owner passkey and add JPEG/PNG photos or use the camera. Existing photos also get
captions automatically. Open a photo to review or edit its single description. Descriptions
start directly with the subjects and include visible details such as colors, size, clothing
and relationships to make them easier to find.

Captions describe relationships such as “a dog lying beside a bicycle,” but can still omit or
invent details. The prompt focuses on the main subjects rather than tiny content inside screens;
this is not a guarantee of scene understanding. Your corrections are preserved. Text matches use English stemming; visual matches help when the caption misses a word.
Visual candidates retain the existing 0.25 CLIP cutoff. Matches from both sources rank higher.

The app does not produce accurate object boundaries or identify a specific person's belongings.
Maximums: 2,000 photos, 12 MiB per upload, 16 megapixels for PNGs. Originals are preserved.
Captioning uses a single 512-pixel view and processes one photo at a time. Browsing stays available during caption generation. Searches automatically wait for the current
caption, then run both retrieval methods before returning results within the 1 GiB budget.

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
native engine has loaded. The first startup needs outbound HTTPS access to Hugging Face and GitHub release assets.

## Small reusable structure

| Location | Responsibility |
|---|---|
| `apps/backend/src/models/caption-manifest.json` | Caption model identity, pinned artifacts and runtime revision |
| `apps/backend/engine/src/captions.h` | Bounded caption process, derived description schema and BM25 query construction |
| `apps/backend/src/models/manifest.json` | Exact model identity, artifact URLs, hashes, sizes, dimensions and embedding-space version |
| `apps/backend/src/models/artifacts.ts` | Verified downloads, atomic installation and reuse of cached files |
| `apps/backend/src/models/encoder.ts` | CLIP text tokenization and the initial label vocabulary |
| `apps/backend/engine/src/model.h` | Native image/text encoder returning normalized vectors |
| `apps/backend/engine/src/search.h` | In-memory HNSW retrieval and aggregation of crop matches into photo results |
| `apps/backend/engine/src/main.cpp` | Durable photos, queued indexing and the private engine API |
| `apps/backend/src/server.ts` | Public HTTP, passkey authorization and model startup |
| `apps/frontend/` | Photo browser, search and camera flow |

There is one CLIP embedding space per library. Its version is persisted with
the library, and incompatible versions fail closed. Adding another CLIP-family model should
reuse the artifact installer and photo/search pipeline; a new runtime only needs to implement
the encoder contract. Replacing a model for existing photos also requires an explicit reindex
migration. There is no hot-swap framework or destructive automatic migration.
See [architecture](docs/ARCHITECTURE.md) for that contract and upgrade path, and [scene descriptions](docs/SCENE-DESCRIPTIONS.md) for the independent caption pipeline.

## Checks

```sh
bun run check
bun run test
bun run test:browser  # host executable; Chrome/Chromium and ffmpeg required
bun run test:linux    # Linux executable in a disposable 1 CPU / 1 GiB container
```

Browser checks use a fresh localhost library, virtual passkeys and public test photos. They
exercise real inference, camera capture, protected originals, deletion and restart persistence.
Generated test data stays under ignored `build/`. The Linux check records cgroup peak memory.
See [validation](docs/VALIDATION.md) for measured results and limitations.

GitHub Actions runs the Linux build and checks on pull requests and main pushes. A successful
version-tag build packages the binary, checksum and notices as a release. The app is [deployed on Nibrun](https://entity-library-gf84pk.nibrun.app).
See [deployment status](docs/DEPLOYMENT.md), and validation of the 1 GB allocation.
Source: [massimoalbarello/entity-library](https://github.com/massimoalbarello/entity-library).

MIT licensed. Third-party components retain their licenses; see [notices](THIRD-PARTY.md).
