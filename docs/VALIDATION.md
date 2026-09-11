# Validation — 11 September 2026

The initial Linux x86_64 executable was built with Bun 1.4.0 and a static C++ engine using
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
- Initial retrieval: “banana” ranked the D2L banana/bear montage first; “cat” ranked the
  cats/remotes sample first. See the stricter cutoff regression below.
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

The app is deployed on Nibrun and published to GitHub; see [deployment details](DEPLOYMENT.md).
Source control contains no weights, credentials, user library or downloaded application test
photos. Docker is only a build/test dependency.

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

## Search cutoff regression — 11 September 2026

Raised the final photo similarity cutoff from 0.18 to 0.25 in the model manifest. The same
19 public COCO sample photos were indexed in a disposable local instance using the real
encoder and whole-image/crop pipeline. No personal deployment data was copied for this test.

| Query | Results at 0.18 | Results at 0.25 | Retained match score |
| --- | ---: | ---: | ---: |
| phone | 9 | 1 | 0.2711 |
| banana | 11 | 1 | 0.2727 |
| pizza | 5 | 1 | 0.3031 |
| zebra | 7 | 1 | 0.3343 |
| flowers | 3 | 1 | 0.2776 |
| broccoli | 5 | 1 | 0.2532 |

“Phone” now retains only Sample 16 (the phone on a laptop). The next score is 0.2492 and
is excluded. These scores were measured on macOS; Linux image decoding can differ slightly.

This is a small-sample heuristic with a precision/recall tradeoff, not a relevance guarantee:
the cup/toothbrush photo still falsely matches “cat” (0.2628) and “snowman” (0.2569). Raising
the threshold enough to remove both would also remove the correct broccoli match (0.2532).
The D2L banana/bear montage's weak banana score (~0.247) is now intentionally excluded;
the browser regression checks that empty response and its UI, while retaining the cat
retrieval and persistence checks. The separate COCO check above preserves a positive banana case.

Native CTest checks cover the inclusive boundary, weak-only/empty results, crop weighting,
photo deduplication and descending order. Both local and Linux builds run this test.

The updated Linux executable passed the full disposable browser suite, including the empty
banana-montage result, positive cat retrieval (0.2860), original preservation, camera,
16-megapixel PNG handling, restart, deletion and passkey reauthentication. Peak cgroup
memory was 453.6 MiB under the same 1 GiB limit. Type checking and all six backend tests
also passed. The updated binary checksum is recorded in [deployment details](DEPLOYMENT.md).
