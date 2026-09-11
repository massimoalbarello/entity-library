# Third-party components

This app adapts the ownership, authentication, camera and binary-packaging patterns of
[Face Library](https://github.com/massimoalbarello/face-library) and
[PDF Signer](https://github.com/massimoalbarello/pdf-signer), both MIT licensed.
Their notices are retained in `vendor/`.

- **OpenCLIP ViT-B/32 LAION2B**: the selected upstream checkpoint and GGUF conversion are
  declared MIT. Immutable revisions and checksums are in `apps/backend/src/models/manifest.json`.
  [Upstream model](https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K),
  [conversion](https://huggingface.co/mys/ggml_CLIP-ViT-B-32-laion2B-s34B-b79K).
- **clip.cpp**: MIT; vendored revision `913458d5d1c9238380a0b0826cd1e71c8828a82d`,
  with its pinned GGML submodule. Licenses accompany the sources.
- **Hugging Face Tokenizers.js 0.2.0**: Apache-2.0, `vendor/TOKENIZERS-LICENSE`.
- **OpenCV 4.10.0** in the Linux build: Apache-2.0 with bundled image-codec notices in
  `vendor/OPENCV-THIRD-PARTY`. Host builds use the locally installed OpenCV.
- **HNSWlib**: Apache-2.0, `vendor/HNSW-LICENSE`.
- **cpp-httplib**: MIT, `vendor/HTTPLIB-LICENSE`.
- **nlohmann/json**: MIT; notice included in `vendor/json.hpp`.
- **SQLite**: public domain; declaration in the vendored source.
- **Better Auth, passkey plugin and Bun SQL adapter**: MIT, with dependency notices in
  `vendor/AUTH-LICENSES` and the top-level vendor license files.
- **Bun**: MIT, with runtime third-party components under their respective licenses.
  [Bun license](https://github.com/oven-sh/bun/blob/bun-v1.4.0/LICENSE.md).
- **DM Sans**: SIL Open Font License, `vendor/DM-SANS-LICENSE`.

Builds assemble local dependency notices into `/third-party.txt`, which is also embedded in the
executable. Release packages additionally include a notice archive and this file.

Tests download the [D2L banana/bear montage](https://github.com/d2l-ai/d2l-en/blob/master/img/banana.jpg)
and [Hugging Face documentation COCO sample](https://huggingface.co/datasets/huggingface/documentation-images/blob/main/coco_sample.png)
into disposable test directories. These photos are not shipped in the app or its source archive.
