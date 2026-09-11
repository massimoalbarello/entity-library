# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`0aacb27122d57d1fd1a8d2a73c7dc2fb1619fe856487d1957751e705db26dbd5`.
Deployment ID: `01a09111-6d2b-7222-918e-01ac6991ee7e`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34614781439)
for source commit `cc0a913442f814845ac81972d975a46584fd5d59`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. Both pinned caption-model artifacts were
successfully downloaded and installed on the instance.

HTTPS `/health` returned 200 and unauthenticated `/api/photos` returned 401. The served UI
contains the scene-description search modes and caption editor. Before/after deployment
snapshots confirmed all **19 original photo files**, all photo/view records, and all **95
embedding records** were unchanged. At the verification snapshot, four descriptions were ready,
one was processing, fourteen were queued, and none had failed. Backfill continues in the app.
Live examples included a cat on a leather couch, a dog holding a frisbee, and two people riding horses.

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
