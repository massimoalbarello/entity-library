# Validation — 11 September 2026

The delivered Linux x86_64 executable was built with Bun 1.4.0 and a static C++ engine using
OpenCV 4.10.0 and the pinned clip.cpp/GGML sources. Model: OpenCLIP ViT-B/32 LAION2B Q4_0.

- Executable: **85.4 MiB**, excluding downloaded model artifacts.
- SHA-256: `d77df5df066ca94e275eb617fa01a7120263c1dc1cfe928a2596ef620ad8eb09`.
- Model package: approximately 88 MiB, downloaded and verified on the first app startup.
- Test allocation: **1 CPU / 1 GiB RAM**, swap capped to the same limit, read-only container
  root filesystem, persistent data directory and 16 MiB temporary filesystem.
- Measured peak: **451.8 MiB** from the Linux cgroup `memory.peak` counter, including
  both server processes and charged file cache. Measured across first startup and restart.

## Passed checks

- TypeScript type checking; six download-integrity and owner-authentication unit tests.
- First-start model download from an empty cache; checksum verification and cached restart.
- Browser registration with a virtual passkey, returning sign-in and sign-out invalidation.
- Rejection of unauthenticated image/library access, cross-origin requests and attempts by a
  second visitor to claim the library.
- JPEG/PNG uploads; byte-for-byte preservation of originals; five views per processed photo.
- “banana” ranks the D2L banana/bear montage first; “cat” ranks the cats/remotes sample first.
- Simulated camera capture and upload; desktop and 390-pixel mobile layouts without overflow.
- A 16-megapixel PNG and a long Unicode filename; malformed-image error handling.
- Persisted originals, metadata, embeddings, session and search results after process restart.
- Deleting a photo removes it from the library and the search results.
- No browser JavaScript errors during the final integration run.

The Linux run used Docker Desktop's x86_64 execution on an Apple Silicon Mac. This is a Linux
compatibility and resource check, not a timing benchmark on Nibrun hardware. Earlier host
browser checks also passed on macOS with system OpenCV 5.0.0.

The public photo set is deliberately small; these checks establish that the implementation
works, not general recognition accuracy. The 2,000-photo cap has not been tested with a full
library. Label and retrieval cutoffs remain heuristics. A larger model or different preprocessing
needs a fresh quality/memory evaluation and an explicit reindex migration.

The app has **not been deployed to Nibrun or published to GitHub**. The source archive contains
no weights, credentials, user library or downloaded application test photos. Docker is only a build/test dependency.

## Reproduce

```sh
bun install --frozen-lockfile
bun run build
bun run check
bun test
TEST_COLD=1 bun run test:linux
```

Install Chrome/Chromium and ffmpeg for the browser/camera checks. The runner creates its own
localhost instance and disposable data. Never point ownership tests at a personal deployment.
