# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`a90b556867f23f72c2018cb1b2e9cfc165471418dd2212b292a08568772c6c4a`.
Deployment ID: `01a09129-c6d5-7565-b12a-15376b83e3cd`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34617808811)
for source commit `e0a48301aa5129f18e7771a1bc1c4378fd2dbc63`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. The served JavaScript matches the checked
source byte for byte, with one description field and two search choices: Descriptions and
Visual similarity. Face Library’s black, white and neutral-gray palette is retained.

HTTPS `/health` returned 200 and unauthenticated `/api/photos` returned 401. Before/after
snapshots confirmed all **20 original photo files**, all photo/view records, and all **100
embedding records** were unchanged. The second description column was removed. At the
verification snapshot, one refreshed description was ready, one was processing, eighteen
were queued, and none had failed. Automatic descriptions continue to regenerate in the app.
The first live result describes a tabby cat with a green collar lying on a leather recliner
with a remote control beside it. Cached model weights were reused.

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
