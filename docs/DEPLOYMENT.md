# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`789f45f2c96e6e81f6ab789c2b3cdad22b1cd41fd02cbfc265a16a289fc44da6`.
Deployment ID: `01a09135-b14f-70d0-8999-91b6575bc3ef`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34619180156)
for source commit `75493edff9e4a09a2bfff176dc9b487f8fc52e78`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. The served JavaScript matches the checked
source byte for byte. Every search now combines BM25 description matches and thresholded
visual matches with reciprocal rank fusion, with no mode selector. The single description
field and monochrome palette are retained. Both live JavaScript and CSS match checked source.

HTTPS `/health` returned 200 and unauthenticated `/api/search?q=cat` returned 401. This update
changes retrieval and scheduling without changing model identities, vectors or description
schema. The preceding single-description migration verified preservation of 20 original
photos and 100 embeddings. No reindex or caption regeneration is requested by this update.

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
