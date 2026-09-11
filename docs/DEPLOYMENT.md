# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`c516572ed7681f0c77d7d866b4e8772d92ad7ab7417549d3cb9aa7c5669f65ed`.
Deployment ID: `01a0916a-442c-73e6-a105-77382b0b6e40`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34624799699)
for source commit `47d6f06adb64506a38da6431274469137214b19c`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. The served JavaScript matches the checked
source byte for byte. Cards keep their image elements across metadata polls so slow previews
finish loading. Preview, photo-processing and description errors appear on the affected cards
with an exclamation marker and specific message. Collection-level photo warning counts are
removed; failed previews have an in-dialog retry action. Desktop and mobile states were checked.

HTTPS `/health` returned 200 and unauthenticated `/assets/photos/13` returned 401. Both served
JavaScript and CSS match checked source. The pre-update library snapshot contained all 20
saved previews and no photo-processing errors. The one description failure belonged to
`Sample 13 - pizza.jpg` and reported `No useful description generated`; the UI explains that
the generated description was too short. This frontend update does not change stored photos,
embeddings, captions or schema.

Nibrun reports **1 GiB RAM** and one vCPU. The complete local Linux browser suite peaked at
**953.6 MiB**, including charged file cache and local x86 emulation overhead. The cloud workflow
also passed all browser checks with a 1 GiB cgroup limit and zero OOM kills. Its lower memory
counter is not used as a native total-RAM estimate because host-populated shared file cache may
be charged outside that container. Destructive and ownership tests run only in disposable instances.

To redeploy a newly built and tested Linux executable:

```sh
nib --json run ./apps/backend/dist/entity-library --app entity-library-gf84pk --port 3000
nib --json apps status --app entity-library-gf84pk
```

Do not use `--name` for an update: it creates another app.
